#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : "";
const npmCommand = npmCli ? process.execPath : "npm";
const npmArgs = args => npmCli ? [npmCli, ...args] : args;
const env = { ...process.env, LIOTAN_PRODUCTION_TEST: "1" };
const build = spawnSync(npmCommand, npmArgs(["run", "build", "--prefix", "client"]), {
  cwd: root,
  env,
  stdio: "inherit",
  shell: false
});

if (build.status !== 0) process.exit(build.status || 1);

const preview = spawn(npmCommand, npmArgs([
  "run", "preview", "--prefix", "client", "--",
  "--host", "127.0.0.1", "--port", "4174", "--strictPort"
]), { cwd: root, env, stdio: "inherit", shell: false });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => preview.kill(signal));
}
preview.on("exit", code => process.exit(code ?? 0));
