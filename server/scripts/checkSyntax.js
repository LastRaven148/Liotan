const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = fs.realpathSync.native(`${__dirname}${path.sep}..`);
const ignored = new Set(["node_modules", "uploads"]);

function assertEntryName(name) {
  if (typeof name !== "string" || !name || name.includes("/") || name.includes("\\")) {
    throw new Error("Unsafe filesystem entry name");
  }
}

function childPath(parent, name) {
  assertEntryName(name);
  const prefix = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return `${prefix}${name}`;
}

function checkedExistingChildPath(parent, name) {
  const real = fs.realpathSync.native(childPath(parent, name));
  const relative = path.relative(root, real);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to traverse outside server root");
  }
  return real;
}

function collectJsFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }

    const fullPath = checkedExistingChildPath(dir, entry.name);

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
    stdio: "inherit",
    shell: false
  });
}

console.log(`Checked ${files.length} server JS files.`);
