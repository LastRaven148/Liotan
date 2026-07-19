#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const clientRoot = path.join(root, "client", "src");
const stylesRoot = path.join(clientRoot, "styles");
const appCss = path.join(clientRoot, "App.css");

const appLayers = [
  "tokens.css",
  "reset.css",
  "auth.css",
  "sidebar.css",
  "dialog-list.css",
  "chat.css",
  "messages.css",
  "menus.css",
  "dialog-menus.css",
  "settings-shell.css",
  "settings-components.css",
  "profile-drawer.css",
  "settings-controls.css",
  "modals.css",
  "create-group.css",
  "attachments.css",
  "toast.css",
  "composer.css",
  "layout.css",
  "mobile.css",
  "platform-ios.css",
  "accessibility.css"
];

const nestedImports = new Map([
  ["messages.css", [
    "MessageMedia.css",
    "MessageAudio.css",
    "MessageAudioTopbar.css",
    "MessageAudioResponsive.css",
    "MessageVoice.css"
  ]]
]);

const forbiddenFiles = [
  path.join(clientRoot, "index.css"),
  path.join(stylesRoot, "mobile-ios.css"),
  path.join(stylesRoot, "settings.css"),
  path.join(stylesRoot, "sidebars.css")
];

const importantAllowlist = new Map([
  ["scroll-behavior:auto!important", "Disables smooth scrolling for users who request reduced motion."],
  ["animation-duration:.01ms!important", "Overrides component animations for the reduced-motion accessibility contract."],
  ["animation-iteration-count:1!important", "Prevents repeating component animations under reduced motion."],
  ["transition-duration:.01ms!important", "Overrides component transitions for the reduced-motion accessibility contract."]
]);

// These are deliberate cross-layer refinements, not copied component ownership.
// Every other exact selector appearing in multiple non-responsive files fails the gate.
const duplicateSelectorAllowlist = new Map([
  [".composer-shell", "chat.css constrains the desktop line length; composer.css owns the component."],
  [".dialog-context-menu button", "menus.css owns the base menu; dialog-menus.css provides its dialog variant."],
  [".message-menu button.danger .menu-icon", "menus.css owns icon sizing; messages.css owns message-danger presentation."],
  [".message.audio-message", "messages.css owns shared message spacing; MessageAudio.css owns audio layout."],
  [".profile-info-card", "profile-drawer.css owns the card; settings-controls.css supplies its mobile margin."],
  [".settings-card", "settings-components.css owns cards; settings-controls.css supplies the responsive control layout."],
  [".settings-primary-button", "settings-components.css owns the button; settings-controls.css defines compact control sizing."],
  [".settings-mini-danger", "settings-components.css owns destructive buttons; settings-controls.css supplies modal sizing."],
  [".settings-mini-danger:hover", "The destructive hover follows the same settings ownership split."],
  [".settings-overflow-menu", "settings-components.css owns the menu; settings-controls.css supplies mobile placement."],
  [".settings-item", "settings-components.css owns settings rows; settings-controls.css owns control alignment."],
  [".settings-item-icon", "settings-components.css owns row icons; settings-controls.css standardizes control icon size."],
  [".drawer-icon-button", "settings-shell.css owns drawer buttons; sidebar.css supplies the shared icon system."],
  [".drawer-icon-button svg", "The shared icon geometry is intentionally refined by the icon layer."]
]);

function fail(message) {
  throw new Error(`CSS architecture gate: ${message}`);
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function importsFor(file) {
  const source = fs.readFileSync(file, "utf8");
  const imports = [];
  for (const match of source.matchAll(/@import\s+["']([^"']+)["']\s*;/g)) {
    if (!match[1].startsWith(".")) fail(`remote or package import is forbidden in ${path.relative(root, file)}`);
    const target = path.resolve(path.dirname(file), match[1]);
    if (!target.startsWith(clientRoot + path.sep)) fail(`import escapes client/src in ${path.relative(root, file)}`);
    imports.push(target);
  }
  return imports;
}

function listCssFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listCssFiles(full);
    return entry.isFile() && entry.name.endsWith(".css") ? [full] : [];
  });
}

function selectorOwnership(files) {
  const ownership = new Map();
  const responsive = new Set(["mobile.css", "platform-ios.css", "accessibility.css", "MessageAudioResponsive.css"]);
  for (const file of files) {
    const name = path.basename(file);
    if (responsive.has(name)) continue;
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of source.matchAll(/(?:^|\})([^{}]+)\{/g)) {
      const prelude = normalize(match[1]);
      if (!prelude || prelude.startsWith("@") || prelude === "from" || prelude === "to" || /^\d+%$/.test(prelude)) continue;
      for (const selector of prelude.split(",").map(normalize)) {
        if (!selector) continue;
        if (!ownership.has(selector)) ownership.set(selector, new Set());
        ownership.get(selector).add(name);
      }
    }
  }
  return ownership;
}

function main() {
  for (const file of forbiddenFiles) {
    if (fs.existsSync(file)) fail(`removed stylesheet was resurrected: ${path.relative(root, file)}`);
  }

  const actualAppImports = importsFor(appCss).map(file => path.basename(file));
  if (JSON.stringify(actualAppImports) !== JSON.stringify(appLayers)) {
    fail(`App.css layer order changed. Expected: ${appLayers.join(" -> ")}`);
  }

  const allCss = [appCss, ...listCssFiles(stylesRoot)];
  const graph = new Map(allCss.map(file => [file, importsFor(file)]));
  for (const [file, imports] of graph) {
    const name = path.basename(file);
    const allowed = file === appCss ? appLayers : (nestedImports.get(name) || []);
    const actual = imports.map(target => path.basename(target));
    if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
      fail(`forbidden or unordered import in ${path.relative(root, file)}: ${actual.join(", ") || "none"}`);
    }
    for (const target of imports) if (!fs.existsSync(target)) fail(`missing imported file: ${path.relative(root, target)}`);
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(file) {
    if (visiting.has(file)) fail(`cyclic import at ${path.relative(root, file)}`);
    if (visited.has(file)) return;
    visiting.add(file);
    for (const target of graph.get(file) || []) visit(target);
    visiting.delete(file);
    visited.add(file);
  }
  visit(appCss);
  const unreachable = allCss.filter(file => !visited.has(file));
  if (unreachable.length) fail(`unreachable CSS chunks: ${unreachable.map(file => path.relative(root, file)).join(", ")}`);

  const foundImportant = [];
  for (const file of allCss) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/([\w-]+\s*:\s*[^;{}]*!important)\s*;?/g)) {
      foundImportant.push({ file, declaration: match[1].replace(/\s+/g, "") });
    }
  }
  if (foundImportant.length !== importantAllowlist.size) fail(`expected exactly four !important declarations, found ${foundImportant.length}`);
  for (const item of foundImportant) {
    if (path.basename(item.file) !== "accessibility.css" || !importantAllowlist.has(item.declaration)) {
      fail(`unapproved !important in ${path.relative(root, item.file)}: ${item.declaration}`);
    }
  }
  for (const [declaration, explanation] of importantAllowlist) {
    if (!explanation || !foundImportant.some(item => item.declaration === declaration)) fail(`missing explained !important allowlist entry: ${declaration}`);
  }

  const globalAllowed = new Set(["tokens.css", "reset.css", "layout.css", "mobile.css", "platform-ios.css", "accessibility.css"]);
  for (const file of allCss.filter(file => file !== appCss)) {
    const name = path.basename(file);
    if (globalAllowed.has(name)) continue;
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of source.matchAll(/(?:^|\})([^{}]+)\{/g)) {
      const prelude = normalize(match[1]);
      if (!prelude || prelude.startsWith("@")) continue;
      for (const selector of prelude.split(",").map(normalize)) {
        if (/^(?:html(?!\.)|body(?:\b|\W)|#root(?:\b|\W)|:root(?:\b|\W)|\*(?:\b|\W))/.test(selector)) {
          fail(`global selector outside an allowed layer in ${name}: ${selector}`);
        }
      }
    }
  }

  const duplicates = selectorOwnership(allCss.filter(file => file !== appCss));
  for (const [selector, owners] of duplicates) {
    if (owners.size < 2) continue;
    if (!duplicateSelectorAllowlist.has(selector)) {
      fail(`selector leaks across component owners: ${selector} (${[...owners].join(", ")})`);
    }
  }
  for (const [selector, explanation] of duplicateSelectorAllowlist) {
    if (!explanation || !duplicates.has(selector) || duplicates.get(selector).size < 2) {
      fail(`stale duplicate-selector allowlist entry: ${selector}`);
    }
  }

  const totalBytes = allCss.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  for (const name of ["mobile.css", "platform-ios.css"]) {
    const file = path.join(stylesRoot, name);
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("@import") || fs.statSync(file).size > totalBytes * 0.35) {
      fail(`${name} duplicates or imports too much of the base architecture`);
    }
  }

  console.log(`CSS architecture gate passed: ${allCss.length} reachable stylesheets, ${foundImportant.length} explained !important declarations.`);
}

main();
