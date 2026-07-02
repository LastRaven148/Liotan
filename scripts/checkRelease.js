#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const releaseZip = path.join(root, "release", `Liotan-${rootPackage.version}-clean.zip`);

function run(label, command, args, options = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    shell: process.platform === "win32",
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function commandExists(command) {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "command",
    process.platform === "win32" ? [command] : ["-v", command],
    {
      shell: process.platform !== "win32",
      stdio: "ignore"
    }
  );

  return result.status === 0;
}

function testZip() {
  if (!fs.existsSync(releaseZip)) {
    throw new Error(`Release ZIP was not created: ${releaseZip}`);
  }

  if (commandExists("unzip")) {
    run("unzip -t release archive", "unzip", ["-t", releaseZip]);
    return;
  }

  if (process.platform === "win32") {
    run("PowerShell ZIP integrity check", "powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('${releaseZip.replace(/'/g, "''")}'); $zip.Entries | Out-Null; $zip.Dispose(); Write-Host 'ZIP integrity OK'`
    ]);
    return;
  }

  console.log("ZIP integrity tool not found; archive exists but was not deep-tested.");
}

function main() {
  run("client build", "npm", ["run", "check:client"]);
  run("server syntax check", "npm", ["run", "check:server"]);
  run("relay syntax check", "npm", ["run", "check:relay"]);
  run("client production audit", "npm", ["audit", "--omit=dev"], {
    cwd: path.join(root, "client")
  });
  run("server production audit", "npm", ["audit", "--omit=dev"], {
    cwd: path.join(root, "server")
  });
  run("relay production audit", "npm", ["audit", "--omit=dev"], {
    cwd: path.join(root, "relay")
  });
  run("privacy audit", "npm", ["run", "audit:privacy"]);
  run("make clean release", "npm", ["run", "make-release"]);
  testZip();
  console.log("\nRelease check passed.");
}

main();
