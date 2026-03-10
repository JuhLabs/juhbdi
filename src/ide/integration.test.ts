import { describe, test, expect } from "bun:test";
import { install } from "./installer";
import { parseAllCommands } from "./command-parser";
import fs from "fs";
import path from "path";
import os from "os";

describe("IDE Installer Integration", () => {
  const pluginRoot = path.resolve(import.meta.dir, "../..");

  test("real commands directory has 16+ commands", () => {
    const commands = parseAllCommands(path.join(pluginRoot, "commands"));
    expect(commands.length).toBeGreaterThanOrEqual(16);
  });

  test("install all platforms with real commands", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-integ-"));
    const results = install({ projectDir: tmpDir, pluginRoot, ideCode: "all" });

    const successes = results.filter((r) => r.success);
    expect(successes.length).toBe(16);

    // Spot-check a few platforms
    expect(fs.existsSync(path.join(tmpDir, ".cursor/commands/juhbdi-init.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".gemini/commands/juhbdi-init.toml"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".kilocodemodes/juhbdi-modes.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".vscode/tasks.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".github/agents/juhbdi-init.agent.md"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
