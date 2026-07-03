const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ignored = new Set(["node_modules", "uploads"]);

function safeChildPath(parent, name) {
  if (typeof name !== "string" || name.includes("/") || name.includes("\\")) {
    throw new Error("Unsafe filesystem entry name");
  }

  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(resolvedParent, name);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to traverse outside server root");
  }

  return resolvedChild;
}

function collectJsFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }

    const fullPath = safeChildPath(dir, entry.name);

    if (entry.isDirectory()) {
      collectJsFiles(fullPath, result);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      result.push(fullPath);
    }
  }

  return result;
}

const files = collectJsFiles(root);

for (const file of files) {
  execFileSync(process.execPath, ["-c", file], {
    stdio: "inherit"
  });
}

console.log(`Checked ${files.length} server JS files.`);
