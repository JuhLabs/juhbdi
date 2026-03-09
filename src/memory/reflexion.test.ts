// src/memory/reflexion.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import {
  generateReflexion,
  appendReflexion,
  loadReflexionBank,
  retrieveReflexions,
  formatReflexionsForPrompt,
  type TaskOutcome,
} from "./reflexion";
import { ReflexionEntrySchema, ReflexionBankSchema, type ReflexionBank } from "../schemas/reflexion";

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    task_id: "t-001",
    task_description: "Create authentication JWT module",
    domain_tags: ["auth", "security"],
    approach_taken: "Implemented JWT signing with RS256",
    files_modified: ["src/auth/jwt.ts", "src/auth/jwt.test.ts"],
    test_passed: true,
    wave_id: "w1",
    ...overrides,
  };
}

describe("generateReflexion", () => {
  test("produces valid entry for success outcome", () => {
    const entry = generateReflexion(makeOutcome());
    const result = ReflexionEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    expect(entry.outcome).toBe("success");
    expect(entry.test_passed).toBe(true);
    expect(entry.id).toMatch(/^rx-/);
  });

  test("produces valid entry for failure outcome with error output", () => {
    const entry = generateReflexion(
      makeOutcome({ test_passed: false }),
      "TypeError: Cannot read property 'sign' of undefined",
    );
    const result = ReflexionEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    expect(entry.outcome).toBe("failure");
    expect(entry.test_passed).toBe(false);
    expect(entry.error_summary).toContain("TypeError");
    expect(entry.lesson).toContain("Avoid approach");
  });

  test("extracts meaningful keywords from task description and error output", () => {
    const entry = generateReflexion(
      makeOutcome({ task_description: "database connection pooling optimization" }),
      "Connection timeout after 30s",
    );
    expect(entry.keywords.length).toBeGreaterThan(0);
    expect(entry.keywords).toContain("database");
    expect(entry.keywords).toContain("connection");
    expect(entry.keywords).toContain("pooling");
    // Stop words should be excluded
    expect(entry.keywords).not.toContain("the");
    expect(entry.keywords).not.toContain("and");
  });

  test("success reflexions mention the approach that worked", () => {
    const entry = generateReflexion(makeOutcome());
    expect(entry.reflection).toContain("succeeded");
    expect(entry.lesson).toContain("Reuse this pattern");
  });

  test("failure reflexions include error analysis", () => {
    const entry = generateReflexion(
      makeOutcome({ test_passed: false }),
      "Module not found: cannot resolve './utils'",
    );
    expect(entry.reflection).toContain("failed");
    expect(entry.lesson).toContain("Module not found");
  });
});

describe("appendReflexion and loadReflexionBank", () => {
  let tmpDir: string;
  let bankPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "reflexion-test-"));
    bankPath = join(tmpDir, "reflexion-bank.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("writes to file and reads it back", async () => {
    const entry = generateReflexion(makeOutcome());
    await appendReflexion(bankPath, entry);
    const bank = await loadReflexionBank(bankPath);
    expect(bank.version).toBe("1.0.0");
    expect(bank.entries.length).toBe(1);
    expect(bank.entries[0].task_id).toBe("t-001");
  });

  test("appends without overwriting existing entries", async () => {
    const entry1 = generateReflexion(makeOutcome({ task_id: "t-001" }));
    const entry2 = generateReflexion(makeOutcome({ task_id: "t-002" }));
    await appendReflexion(bankPath, entry1);
    await appendReflexion(bankPath, entry2);
    const bank = await loadReflexionBank(bankPath);
    expect(bank.entries.length).toBe(2);
    expect(bank.entries[0].task_id).toBe("t-001");
    expect(bank.entries[1].task_id).toBe("t-002");
  });

  test("loadReflexionBank returns empty bank for missing file", async () => {
    const bank = await loadReflexionBank(join(tmpDir, "nonexistent.json"));
    expect(bank.version).toBe("1.0.0");
    expect(bank.entries).toEqual([]);
  });

  test("loadReflexionBank returns empty bank for invalid JSON", async () => {
    await Bun.write(bankPath, "not valid json {{{");
    const bank = await loadReflexionBank(bankPath);
    expect(bank.entries).toEqual([]);
  });
});

describe("retrieveReflexions", () => {
  function makeBank(entries: Array<{ id: string; desc: string; keywords: string[]; outcome?: "success" | "failure" | "partial" }>): ReflexionBank {
    return {
      version: "1.0.0" as const,
      entries: entries.map((e) => ({
        id: e.id,
        timestamp: "2026-03-09T00:00:00.000Z",
        task_id: e.id,
        task_description: e.desc,
        domain_tags: [],
        outcome: e.outcome ?? ("success" as const),
        approach_taken: "direct",
        files_modified: [],
        test_passed: true,
        reflection: "It worked",
        lesson: "Keep doing this",
        keywords: e.keywords,
        related_reflexion_ids: [],
      })),
    };
  }

  test("returns relevant entries by keyword overlap", () => {
    const bank = makeBank([
      { id: "r1", desc: "authentication jwt tokens", keywords: ["authentication", "jwt", "tokens"] },
      { id: "r2", desc: "database migration scripts", keywords: ["database", "migration", "scripts"] },
    ]);
    const results = retrieveReflexions("implement jwt authentication", bank, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("r1");
  });

  test("returns empty array when no matches", () => {
    const bank = makeBank([
      { id: "r1", desc: "database work", keywords: ["database", "sql"] },
    ]);
    const results = retrieveReflexions("frontend react components", bank, 5);
    expect(results).toEqual([]);
  });

  test("ranks by relevance (best match first)", () => {
    const bank = makeBank([
      { id: "r1", desc: "auth module", keywords: ["auth", "module"] },
      { id: "r2", desc: "auth jwt tokens security", keywords: ["auth", "jwt", "tokens", "security"] },
    ]);
    const results = retrieveReflexions("auth jwt security", bank, 5);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe("r2"); // More keyword overlap
  });

  test("respects topK limit", () => {
    const bank = makeBank(
      Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        desc: "auth task implementation",
        keywords: ["auth", "task"],
      })),
    );
    const results = retrieveReflexions("auth task", bank, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("handles empty bank", () => {
    const bank: ReflexionBank = { version: "1.0.0", entries: [] };
    const results = retrieveReflexions("anything", bank, 5);
    expect(results).toEqual([]);
  });
});

describe("formatReflexionsForPrompt", () => {
  test("produces readable markdown", () => {
    const reflexions = [
      generateReflexion(makeOutcome()),
      generateReflexion(
        makeOutcome({ task_id: "t-002", task_description: "Fix login bug", test_passed: false }),
        "NullPointerException in session handler",
      ),
    ];
    const output = formatReflexionsForPrompt(reflexions);
    expect(output).toContain("## Past Reflexions");
    expect(output).toContain("Create authentication JWT module");
    expect(output).toContain("Fix login bug");
    expect(output).toContain("Lesson");
    expect(output).toContain("NullPointerException");
  });

  test("returns empty string for no reflexions", () => {
    expect(formatReflexionsForPrompt([])).toBe("");
  });

  test("output stays concise for 3 reflexions (under 2000 chars)", () => {
    const reflexions = Array.from({ length: 3 }, (_, i) =>
      generateReflexion(makeOutcome({ task_id: `t-${i}`, task_description: `Short task ${i}` })),
    );
    const output = formatReflexionsForPrompt(reflexions);
    expect(output.length).toBeLessThan(2000);
  });
});

describe("schema validation", () => {
  test("rejects entry with missing required fields", () => {
    const result = ReflexionEntrySchema.safeParse({
      id: "rx-1",
      // missing everything else
    });
    expect(result.success).toBe(false);
  });

  test("rejects entry with invalid outcome enum", () => {
    const result = ReflexionEntrySchema.safeParse({
      id: "rx-1",
      timestamp: "2026-03-09T00:00:00.000Z",
      task_id: "t1",
      task_description: "test",
      domain_tags: [],
      outcome: "unknown",
      approach_taken: "direct",
      files_modified: [],
      test_passed: true,
      reflection: "worked",
      lesson: "keep going",
      keywords: [],
    });
    expect(result.success).toBe(false);
  });
});
