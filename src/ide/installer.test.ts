import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { install, uninstall } from "./installer";
import fs from "fs";
import path from "path";
import os from "os";

describe("IDE Installer", () => {
  let tmpDir: string;
  let pluginRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-install-test-"));
    pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-plugin-"));
    const cmdDir = path.join(pluginRoot, "commands");
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, "init.md"), `---
name: init
description: Initialize a new JuhBDI project
allowed-tools: ["Bash"]
---

## Step 1
Run init.
`);
    fs.writeFileSync(path.join(cmdDir, "plan.md"), `---
name: plan
description: Generate execution roadmap
argument-hint: "[request]"
allowed-tools: ["Bash", "Read"]
---

## Step 1
Discover intent.
`);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(pluginRoot, { recursive: true });
  });

  test("installs for cursor — creates slash command files", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "cursor" });
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].files_written.length).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, ".cursor/commands/juhbdi-init.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor/commands/juhbdi-plan.md"))).toBe(true);
  });

  test("installs for kilo — creates single manifest", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "kilo" });
    expect(results[0].success).toBe(true);
    expect(results[0].files_written.length).toBe(1);
    const manifest = JSON.parse(fs.readFileSync(results[0].files_written[0], "utf-8"));
    expect(manifest).toBeArray();
    expect(manifest.length).toBe(2);
  });

  test("installs for copilot — creates agent + prompt files", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "github-copilot" });
    expect(results[0].success).toBe(true);
    expect(results[0].files_written.length).toBeGreaterThan(0);
    expect(results[0].agents_written.length).toBeGreaterThan(0);
  });

  test("installs for gemini — creates TOML files", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "gemini" });
    expect(results[0].success).toBe(true);
    const content = fs.readFileSync(results[0].files_written[0], "utf-8");
    expect(content).toContain("[command]");
  });

  test("installs for vscode — creates tasks.json", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "vscode" });
    expect(results[0].success).toBe(true);
    const tasks = JSON.parse(fs.readFileSync(results[0].files_written[0], "utf-8"));
    expect(tasks.version).toBe("2.0.0");
  });

  test("install --all skips claude-code", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "all" });
    expect(results.length).toBe(16);
    const allSuccess = results.every((r) => r.success);
    expect(allSuccess).toBe(true);
  });

  test("dry-run writes no files", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "cursor", dryRun: true });
    expect(results[0].success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  test("unknown platform returns error", () => {
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "nonexistent" });
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("Unknown platform");
  });

  test("uninstall removes only juhbdi files", () => {
    install({ projectDir: tmpDir, pluginRoot, ideCode: "cursor" });
    fs.writeFileSync(path.join(tmpDir, ".cursor/commands/user-custom.md"), "# Custom");
    const result = uninstall(tmpDir, "cursor");
    expect(result.success).toBe(true);
    expect(result.removed.length).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, ".cursor/commands/user-custom.md"))).toBe(true);
  });
});
