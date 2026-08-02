#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const parser = require("@babel/parser");

const root = path.resolve(__dirname, "..");
const extensions = [".js", ".jsx", ".mjs", ".cjs"];
const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", shell: false })
    .split("\0")
    .filter(Boolean)
    .map(file => file.replaceAll("\\", "/"))
);
const productionFiles = [...tracked].filter(file =>
  extensions.includes(path.extname(file)) &&
  (file.startsWith("client/src/") || file.startsWith("server/")) &&
  !file.startsWith("server/test/") &&
  fs.existsSync(path.join(root, file))
);

function relativeSpecifiers(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = parser.parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "importMeta", "dynamicImport", "optionalChaining", "topLevelAwait"]
  });
  const values = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      typeof node.source?.value === "string") {
      values.push(node.source.value);
    }
    if (node.type === "CallExpression" &&
      ((node.callee?.type === "Identifier" && ["require", "import"].includes(node.callee.name)) ||
        node.callee?.type === "Import") &&
      node.arguments?.length === 1 &&
      node.arguments[0]?.type === "StringLiteral") {
      values.push(node.arguments[0].value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast.program);
  return values.filter(value => value.startsWith("."));
}

function resolveImport(fromFile, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = path.posix.extname(base)
    ? [base]
    : [
        ...extensions.map(extension => `${base}${extension}`),
        ...extensions.map(extension => `${base}/index${extension}`)
      ];
  return candidates.find(candidate => tracked.has(candidate)) || null;
}

const edges = new Map();
const unresolved = [];
for (const file of productionFiles) {
  const targets = [];
  for (const specifier of relativeSpecifiers(file)) {
    const target = resolveImport(file, specifier);
    if (target) targets.push(target);
    else unresolved.push({ file, specifier });
  }
  edges.set(file, targets);
}

const roots = [
  "client/src/index.jsx",
  "server/server.js",
  ...productionFiles.filter(file => file.startsWith("server/scripts/"))
].filter(file => tracked.has(file));
const reachable = new Set();
const pending = [...roots];
while (pending.length) {
  const file = pending.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const dependency of edges.get(file) || []) pending.push(dependency);
}

const unreachable = productionFiles.filter(file => !reachable.has(file)).sort();
if (unresolved.length || unreachable.length) {
  if (unresolved.length) {
    console.error("Unresolved relative imports:\n" +
      unresolved.map(item => `${item.file} -> ${item.specifier}`).join("\n"));
  }
  if (unreachable.length) {
    console.error("Transitively unreachable production modules:\n" + unreachable.join("\n"));
  }
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    trackedFiles: tracked.size,
    productionModules: productionFiles.length,
    roots: roots.length,
    reachableModules: productionFiles.filter(file => reachable.has(file)).length,
    durableMigrationReachableFromOperationalScripts: reachable.has("server/utils/durableMigration.js")
  }, null, 2));
}
