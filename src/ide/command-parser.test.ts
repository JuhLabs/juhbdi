import { describe, test, expect } from "bun:test";
import { parseCommandFile, parseAllCommands } from "./command-parser";
import fs from "fs";
import path from "path";
import os from "os";

describe("Command Parser", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-cmd-test-"));

  test("parses a standard command file", () => {
    const file = path.join(tmpDir, "test-cmd.md");
    fs.writeFileSync(file, `---
name: test-cmd
description: A test command
allowed-tools: ["Bash", "Read"]
---

## Steps
1. Do something
`);
    const cmd = parseCommandFile(file);
    expect(cmd).not.toBeNull();
    expect(cmd!.name).toBe("test-cmd");
    expect(cmd!.description).toBe("A test command");
    expect(cmd!.allowed_tools).toEqual(["Bash", "Read"]);
    expect(cmd!.body).toContain("## Steps");
  });

  test("parses argument-hint", () => {
    const file = path.join(tmpDir, "with-hint.md");
    fs.writeFileSync(file, `---
name: plan
description: Generate a plan
argument-hint: "[development request]"
allowed-tools: ["Bash"]
---

Body here.
`);
    const cmd = parseCommandFile(file);
    expect(cmd!.argument_hint).toBe("[development request]");
  });

  test("returns null for file without frontmatter", () => {
    const file = path.join(tmpDir, "no-fm.md");
    fs.writeFileSync(file, "# Just a heading\nNo frontmatter here.");
    expect(parseCommandFile(file)).toBeNull();
  });

  test("parseAllCommands reads directory", () => {
    const cmds = parseAllCommands(tmpDir);
    expect(cmds.length).toBe(2); // test-cmd and with-hint
  });

  // Cleanup
  test("cleanup", () => {
    fs.rmSync(tmpDir, { recursive: true });
    expect(true).toBe(true);
  });
});
