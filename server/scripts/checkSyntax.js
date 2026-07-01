const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ignored = new Set(["node_modules", "uploads"]);

function collectJsFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

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
