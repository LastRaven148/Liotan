const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

const root = path.resolve(__dirname, "..");
const sourceRoots = ["client/src", "server"];
const excludedDirectories = new Set([
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test",
  "tests"
]);
const findings = [];

function walk(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) return [];
      return walk(path.join(relativeDirectory, entry.name));
    }
    return /\.(?:cjs|mjs|js|jsx)$/.test(entry.name)
      ? [path.join(relativeDirectory, entry.name)]
      : [];
  });
}

function location(file, node) {
  return `${file.replaceAll("\\", "/")}:${node.loc?.start?.line || 1}`;
}

function report(file, node, rule, message) {
  findings.push(`${location(file, node)} [${rule}] ${message}`);
}

function staticString(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map(part => part.value.cooked || "").join("");
  }
  return null;
}

function propertyName(node) {
  if (!node) return null;
  const property = node.property || node.key;
  if (!node.computed && property?.type === "Identifier") return property.name;
  return staticString(property);
}

function isNamedIdentifier(node, name) {
  return node?.type === "Identifier" && node.name === name;
}

function isMember(node, objectName, memberName) {
  return node?.type === "MemberExpression"
    && isNamedIdentifier(node.object, objectName)
    && propertyName(node) === memberName;
}

function isFixedByteExpression(node) {
  if (!node) return false;
  if (["ArrayExpression", "StringLiteral", "NumericLiteral"].includes(node.type)) return true;
  if (node.type === "NewExpression" && isNamedIdentifier(node.callee, "Uint8Array")) {
    return node.arguments.length === 1 && isFixedByteExpression(node.arguments[0]);
  }
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    const owner = node.callee.object;
    const method = propertyName(node.callee);
    if ((isNamedIdentifier(owner, "Buffer") && ["alloc", "from"].includes(method))
      || (isNamedIdentifier(owner, "Uint8Array") && method === "from")) {
      return node.arguments.length > 0 && isFixedByteExpression(node.arguments[0]);
    }
  }
  return false;
}

function containsSensitiveName(node) {
  if (!node) return false;
  const value = node.type === "Identifier" ? node.name : staticString(node);
  return typeof value === "string"
    && /(?:recovery|database|cache|private|secret|plaintext)[_\s-]*(?:key|value|content|material)|(?:recoveryKey|databaseKey|cacheKey|privateKey|secretKey|plaintext)/i.test(value);
}

function inspectNode(file, node, fixedByteVariables, mutatedByteVariables) {
  const normalizedFile = file.replaceAll("\\", "/");
  if ((node.type === "ImportDeclaration"
      || node.type === "ExportNamedDeclaration"
      || node.type === "ExportAllDeclaration")
      && /(?:^|\/)(?:legacy|e2eeV3|e2ee-v3)(?:\/|$)/i.test(node.source?.value || "")) {
    report(file, node, "legacy-import", "production code imports an executable legacy crypto module");
  }

  if (node.type === "CallExpression") {
    const callee = node.callee;
    if (isMember(callee, "Math", "random")
      && (normalizedFile.startsWith("client/src/crypto/") || normalizedFile.startsWith("server/security/"))) {
      report(file, node, "crypto-rng", "Math.random() is forbidden in cryptographic code");
    }

    if (callee?.type === "MemberExpression"
      && isNamedIdentifier(callee.object, "localStorage")
      && ["getItem", "setItem"].includes(propertyName(callee))) {
      const keyNode = node.arguments[0];
      const valueNode = node.arguments[1];
      if (containsSensitiveName(keyNode) || containsSensitiveName(valueNode)) {
        report(file, node, "secret-storage", "secret-like crypto material must not use localStorage");
      }
    }

    if (callee?.type === "MemberExpression"
      && isNamedIdentifier(callee.object, "console")
      && ["debug", "error", "info", "log", "warn"].includes(propertyName(callee))
      && node.arguments.some(argument => containsSensitiveName(argument))) {
      report(file, node, "secret-log", "secret/plaintext fields must not be written to the console");
    }

    if (callee?.type === "MemberExpression"
      && propertyName(callee) === "encrypt"
      && node.arguments[0]?.type === "ObjectExpression") {
      const algorithm = node.arguments[0];
      const nameProperty = algorithm.properties.find(property => property.type === "ObjectProperty" && propertyName(property) === "name");
      const ivProperty = algorithm.properties.find(property => property.type === "ObjectProperty" && propertyName(property) === "iv");
      if (staticString(nameProperty?.value) === "AES-GCM"
        && ivProperty
        && (isFixedByteExpression(ivProperty.value)
          || (ivProperty.value.type === "Identifier"
            && fixedByteVariables.has(ivProperty.value.name)
            && !mutatedByteVariables.has(ivProperty.value.name)))) {
        report(file, ivProperty, "fixed-gcm-iv", "AES-GCM IV must be generated per encryption operation");
      }
    }
  }

  if (normalizedFile.startsWith("client/src/crypto/")
    && node.type === "StringLiteral"
    && /^https?:\/\/[^/]*(?:media|r2\.dev)/i.test(node.value)) {
    report(file, node, "public-private-media", "private crypto attachments must not embed a public media origin");
  }
}

function collectByteVariableFacts(node, fixedByteVariables, mutatedByteVariables) {
  if (!node || typeof node !== "object") return;
  if (node.type === "VariableDeclarator"
    && node.id?.type === "Identifier"
    && isFixedByteExpression(node.init)) {
    fixedByteVariables.add(node.id.name);
  }
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    if (node.callee.object?.type === "Identifier"
      && ["copyWithin", "fill", "set"].includes(propertyName(node.callee))) {
      mutatedByteVariables.add(node.callee.object.name);
    }
    const dataViewTarget = node.callee.object;
    const dataViewArgument = dataViewTarget?.type === "NewExpression"
      && isNamedIdentifier(dataViewTarget.callee, "DataView")
      ? dataViewTarget.arguments[0]
      : null;
    if (dataViewArgument?.type === "MemberExpression"
      && propertyName(dataViewArgument) === "buffer"
      && dataViewArgument.object?.type === "Identifier"
      && /^set/.test(propertyName(node.callee) || "")) {
      mutatedByteVariables.add(dataViewArgument.object.name);
    }
  }
  if (node.type === "AssignmentExpression"
    && node.left?.type === "MemberExpression"
    && node.left.object?.type === "Identifier") {
    mutatedByteVariables.add(node.left.object.name);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    if (Array.isArray(value)) value.forEach(child => collectByteVariableFacts(child, fixedByteVariables, mutatedByteVariables));
    else if (value && typeof value === "object") collectByteVariableFacts(value, fixedByteVariables, mutatedByteVariables);
  }
}

function traverse(file, node, fixedByteVariables, mutatedByteVariables) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") inspectNode(file, node, fixedByteVariables, mutatedByteVariables);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    if (Array.isArray(value)) value.forEach(child => traverse(file, child, fixedByteVariables, mutatedByteVariables));
    else if (value && typeof value === "object") traverse(file, value, fixedByteVariables, mutatedByteVariables);
  }
}

for (const file of sourceRoots.flatMap(walk)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "unambiguous",
      errorRecovery: false,
      plugins: ["jsx", "importMeta", "dynamicImport", "optionalChaining", "topLevelAwait"]
    });
  } catch (error) {
    report(file, { loc: error.loc ? { start: error.loc } : undefined }, "parse", error.message);
    continue;
  }
  const fixedByteVariables = new Set();
  const mutatedByteVariables = new Set();
  collectByteVariableFacts(ast.program, fixedByteVariables, mutatedByteVariables);
  traverse(file, ast.program, fixedByteVariables, mutatedByteVariables);
}

if (findings.length > 0) {
  console.error("Crypto static analysis failed:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Crypto static analysis passed.");
}
