import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { appendTrailEntry, readTrail } from "./trail";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("Decision Trail Logger", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-test-"));
    logPath = join(tmpDir, "decision-trail.log");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("appends a valid entry as JSONL", async () => {
    await appendTrailEntry(logPath, {
      event_type: "command",
      description: "Ran init command",
      reasoning: "User invoked juhbdi init",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
    });

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.event_type).toBe("command");
    expect(entry.timestamp).toBeDefined();
  });

  test("appends multiple entries on separate lines", async () => {
    await appendTrailEntry(logPath, {
      event_type: "command",
      description: "First",
      reasoning: "",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
    });
    await appendTrailEntry(logPath, {
      event_type: "decision",
      description: "Second",
      reasoning: "",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
    });

    const entries = await readTrail(logPath);
    expect(entries.length).toBe(2);
    expect(entries[0].description).toBe("First");
    expect(entries[1].description).toBe("Second");
  });

  test("readTrail returns empty array for missing file", async () => {
    const entries = await readTrail(join(tmpDir, "nonexistent.log"));
    expect(entries).toEqual([]);
  });
});
