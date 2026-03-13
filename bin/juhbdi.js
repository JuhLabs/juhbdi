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
  npx juhbdi@latest              Install plugin and launch Claude Code
  npx juhbdi@latest --install    Install plugin only (no launch)
  npx juhbdi install --ide <x>   Install JuhBDI into an IDE (cursor, kilo, all...)
  npx juhbdi install --list      List all 17 supported IDEs
  npx juhbdi install --ide detect Auto-detect IDEs in project
  npx juhbdi uninstall --ide <x> Remove JuhBDI from an IDE
  juhbdi --version               Show version
  juhbdi --help                  Show this help

Inside Claude Code, use /juhbdi:init to start a project.
`.trim());
  process.exit(0);
}

// IDE installer subcommand
if (args[0] === "install") {
  const ideIdx = args.indexOf("--ide");
  const listFlag = args.includes("--list");
  const dryRun = args.includes("--dry-run");

  if (listFlag) {
    const { listPlatforms } = await import(join(pluginDir, "src/ide/platforms.ts"));
    console.log("\x1b[36mSupported IDEs:\x1b[0m\n");
    for (const p of listPlatforms()) {
      const tag = p.code === "claude-code" ? " (native)" : "";
      console.log(`  ${p.code.padEnd(18)} ${p.name}${tag}`);
    }
    process.exit(0);
  }

  if (ideIdx === -1 || !args[ideIdx + 1]) {
    console.error("\x1b[31mUsage: npx juhbdi install --ide <platform|all> [--dry-run]\x1b[0m");
    console.error("Run 'npx juhbdi install --list' to see supported platforms.");
    process.exit(1);
  }

  const ideCode = args[ideIdx + 1];
  const { install, detectInstalledIDEs } = await import(join(pluginDir, "src/ide/installer.ts"));

  if (ideCode === "detect") {
    const detected = detectInstalledIDEs(process.cwd());
    if (detected.length === 0) {
      console.log("No IDE directories detected in current project.");
    } else {
      console.log(`\x1b[36mDetected IDEs:\x1b[0m ${detected.join(", ")}`);
      console.log(`Run: npx juhbdi install --ide all`);
    }
    process.exit(0);
  }

  const results = install({
    projectDir: process.cwd(),
    pluginRoot: pluginDir,
    ideCode,
    dryRun,
  });

  for (const r of results) {
    if (r.success) {
      const count = r.files_written.length + r.agents_written.length;
      console.log(`\x1b[32m✓\x1b[0m ${r.platform}: ${count} file(s)${dryRun ? " (dry run)" : ""}`);
    } else {
      console.log(`\x1b[31m✗\x1b[0m ${r.platform}: ${r.error}`);
    }
  }

  const total = results.filter((r) => r.success).length;
  console.log(`\n\x1b[36m${total} platform(s) installed.\x1b[0m`);
  process.exit(results.every((r) => r.success) ? 0 : 1);
}

if (args[0] === "uninstall") {
  const ideIdx = args.indexOf("--ide");
  if (ideIdx === -1 || !args[ideIdx + 1]) {
    console.error("\x1b[31mUsage: npx juhbdi uninstall --ide <platform>\x1b[0m");
    process.exit(1);
  }
  const { uninstall } = await import(join(pluginDir, "src/ide/installer.ts"));
  const result = uninstall(process.cwd(), args[ideIdx + 1]);
  if (result.success) {
    console.log(`\x1b[32m✓\x1b[0m Removed ${result.removed.length} JuhBDI file(s)`);
  } else {
    console.log(`\x1b[31m✗\x1b[0m Uninstall failed`);
  }
  process.exit(result.success ? 0 : 1);
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
  for (const dir of [".claude-plugin", "src", "commands", "agents", "bin", "hooks", "skills", "statusline", "node_modules"]) {
    const src = join(pluginDir, dir);
    if (existsSync(src)) {
      cpSync(src, join(cacheDir, dir), { recursive: true });
    }
  }
  // Copy standalone files
  for (const file of ["package.json", "README.md", "tsconfig.json"]) {
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

// Launch Claude Code (only if interactive TTY available)
if (!process.stdin.isTTY) {
  console.log("\nRestart Claude Code to activate. Then use /juhbdi:init to start.");
  process.exit(0);
}

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
