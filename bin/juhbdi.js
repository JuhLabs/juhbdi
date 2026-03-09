#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  // Read version from package.json
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
  console.log(`juhbdi v${pkg.version}`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
juhbdi - Intent-driven autonomous development engine

Usage:
  npx juhbdi          Launch Claude Code with JuhBDI plugin
  juhbdi --version    Show version
  juhbdi --help       Show this help

Inside Claude Code, use /juhbdi:init to start a project.
`.trim());
  process.exit(0);
}

// Check if already inside Claude Code
if (process.env.CLAUDE_PLUGIN_ROOT) {
  console.log("JuhBDI is loaded as a Claude Code plugin. Use /juhbdi:init to start.");
  process.exit(0);
}

// Launch Claude Code with JuhBDI as plugin
const { execFileSync } = await import("node:child_process");
const { dirname: d } = await import("node:path");
const { fileURLToPath: f } = await import("node:url");
const pluginDir = d(f(import.meta.url)).replace(/\/bin$/, "");

try {
  execFileSync("npx", ["claude", "--plugin", pluginDir], { stdio: "inherit" });
} catch {
  process.exit(1);
}
