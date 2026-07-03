#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const releaseZip = path.join(root, "release", `Liotan-${rootPackage.version}-clean.zip`);
const WINDOWS_EXTENSIONS = [".cmd", ".exe", ".bat"];

function getPathEntries() {
  return String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
}

function resolveExecutable(command) {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) {
    return "";
  }

  const candidates = process.platform === "win32"
    ? [command, ...WINDOWS_EXTENSIONS.map(ext => `${command}${ext}`)]
    : [command];

  for (const dir of getPathEntries()) {
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return "";
}

function runExecutable(label, executable, args, options = {}) {
  console.log(`\n==> ${label}`);
  execFileSync(executable, args, {
    cwd: options.cwd || root,
    stdio: "inherit",
    env: process.env
  });
}

function runNpm(label, args, cwd = root) {
  const npmPath = resolveExecutable("npm");
  if (!npmPath) {
    throw new Error("npm executable was not found in PATH");
  }
  runExecutable(label, npmPath, args, { cwd });
}

function testZip() {
  if (!fs.existsSync(releaseZip)) {
    throw new Error(`Release ZIP was not created: ${releaseZip}`);
  }

  const unzipPath = resolveExecutable("unzip");
  if (unzipPath) {
    runExecutable("unzip -t release archive", unzipPath, ["-t", releaseZip]);
    return;
  }

  if (process.platform === "win32") {
    const powershellPath = resolveExecutable("powershell");
    if (!powershellPath) {
      throw new Error("PowerShell was not found for ZIP integrity check");
    }
    runExecutable("PowerShell ZIP integrity check", powershellPath, [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('${releaseZip.replace(/'/g, "''")}'); $zip.Entries | Out-Null; $zip.Dispose(); Write-Host 'ZIP integrity OK'`
    ]);
    return;
  }

  throw new Error("No ZIP integrity checker found: install unzip or run on Windows with PowerShell.");
}

function main() {
  runNpm("client build", ["run", "check:client"]);
  runNpm("server syntax check", ["run", "check:server"]);
  runNpm("client production audit", ["audit", "--omit=dev"], path.join(root, "client"));
  runNpm("server production audit", ["audit", "--omit=dev"], path.join(root, "server"));
  runNpm("privacy audit", ["run", "audit:privacy"]);
  runNpm("make clean release", ["run", "make-release"]);
  testZip();
  console.log("\nRelease check passed.");
}

main();
