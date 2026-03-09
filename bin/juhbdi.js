#!/usr/bin/env node

const args = process.argv.slice(2);

const { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } = await import("node:fs");
const { resolve, dirname, join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { execFileSync } = await import("node:child_process");

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(pluginDir, "package.json"), "utf-8"));

if (args.includes("--version") || args.includes("-v")) {
  console.log(`juhbdi v${pkg.version}`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
juhbdi v${pkg.version} - Intent-driven autonomous development engine

Usage:
  npx juhbdi@latest            Install plugin and launch Claude Code
  npx juhbdi@latest --install  Install plugin only (no launch)
  juhbdi --version             Show version
  juhbdi --help                Show this help

Inside Claude Code, use /juhbdi:init to start a project.
`.trim());
  process.exit(0);
}

// Check if already inside Claude Code
if (process.env.CLAUDE_PLUGIN_ROOT) {
  console.log("JuhBDI is loaded as a Claude Code plugin. Use /juhbdi:init to start.");
  process.exit(0);
}

// Detect Claude Code
let claudeBin;
try {
  claudeBin = execFileSync("which", ["claude"], { encoding: "utf-8" }).trim();
} catch {
  console.error("\x1b[31mClaude Code CLI not found.\x1b[0m");
  console.error("Install it first: https://docs.anthropic.com/en/docs/claude-code");
  process.exit(1);
}

// Check if --plugin-dir is supported
let hasPluginDir = false;
try {
  const help = execFileSync(claudeBin, ["--help"], { encoding: "utf-8" });
  hasPluginDir = help.includes("--plugin-dir");
} catch {}

// Install plugin to ~/.claude/plugins/cache/juhlabs/juhbdi/<version>/
const home = process.env.HOME || process.env.USERPROFILE;
const cacheDir = join(home, ".claude", "plugins", "cache", "juhlabs", "juhbdi", pkg.version);
const registryPath = join(home, ".claude", "plugins", "installed_plugins.json");

function installPlugin() {
  console.log(`\x1b[36mInstalling JuhBDI v${pkg.version}...\x1b[0m`);

  // Copy plugin files to cache
  mkdirSync(cacheDir, { recursive: true });
  for (const dir of [".claude-plugin", "src", "commands", "agents", "bin"]) {
    const src = join(pluginDir, dir);
    if (existsSync(src)) {
      cpSync(src, join(cacheDir, dir), { recursive: true });
    }
  }
  // Copy package.json and README
  for (const file of ["package.json", "README.md"]) {
    const src = join(pluginDir, file);
    if (existsSync(src)) cpSync(src, join(cacheDir, file));
  }

  // Update registry
  let registry = { version: 2, plugins: {} };
  if (existsSync(registryPath)) {
    try { registry = JSON.parse(readFileSync(registryPath, "utf-8")); } catch {}
  }

  registry.plugins["juhbdi@juhlabs"] = [{
    scope: "user",
    installPath: cacheDir,
    version: pkg.version,
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }];

  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  console.log(`\x1b[32mJuhBDI v${pkg.version} installed successfully.\x1b[0m`);
}

// Always install/update the plugin
installPlugin();

if (args.includes("--install")) {
  console.log("\nRestart Claude Code to activate. Then use /juhbdi:init to start.");
  process.exit(0);
}

// Launch Claude Code
console.log("\x1b[36mLaunching Claude Code...\x1b[0m\n");
try {
  if (hasPluginDir) {
    execFileSync(claudeBin, ["--plugin-dir", join(cacheDir, ".claude-plugin")], { stdio: "inherit" });
  } else {
    // Older Claude Code — plugin is installed in registry, just launch
    execFileSync(claudeBin, [], { stdio: "inherit" });
  }
} catch {
  process.exit(1);
}
