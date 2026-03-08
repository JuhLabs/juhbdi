import { describe, expect, test } from "bun:test";
import { ToolBankEntrySchema, ToolBankSchema } from "./tool-types";

describe("ToolBankEntrySchema", () => {
  test("parses valid tool entry", () => {
    const entry = ToolBankEntrySchema.parse({
      id: "tool-1",
      name: "test-runner",
      description: "Runs bun tests with filtering",
      script_path: "tools/test-runner.ts",
      language: "typescript",
      created_by_task: "t-abc123",
      usage_count: 5,
      last_used: "2026-03-08T00:00:00.000Z",
      status: "active",
      keywords: ["test", "runner", "bun"],
      related_memories: [],
    });
    expect(entry.name).toBe("test-runner");
    expect(entry.status).toBe("active");
  });

  test("rejects invalid language", () => {
    expect(() =>
      ToolBankEntrySchema.parse({
        id: "t1",
        name: "x",
        description: "x",
        script_path: "x",
        language: "java",
        created_by_task: "t1",
        usage_count: 0,
        last_used: "2026-03-08T00:00:00.000Z",
        status: "active",
        keywords: [],
        related_memories: [],
      }),
    ).toThrow();
  });

  test("rejects invalid status", () => {
    expect(() =>
      ToolBankEntrySchema.parse({
        id: "t1",
        name: "x",
        description: "x",
        script_path: "x",
        language: "typescript",
        created_by_task: "t1",
        usage_count: 0,
        last_used: "2026-03-08T00:00:00.000Z",
        status: "unknown",
        keywords: [],
        related_memories: [],
      }),
    ).toThrow();
  });

  test("accepts all valid statuses", () => {
    for (const status of ["active", "deprecated", "failed"] as const) {
      const entry = ToolBankEntrySchema.parse({
        id: `t-${status}`,
        name: "x",
        description: "x",
        script_path: "x",
        language: "bash",
        created_by_task: "t1",
        usage_count: 0,
        last_used: "2026-03-08T00:00:00.000Z",
        status,
        keywords: [],
        related_memories: [],
      });
      expect(entry.status).toBe(status);
    }
  });

  test("accepts all valid languages", () => {
    for (const language of ["typescript", "bash", "python"] as const) {
      const entry = ToolBankEntrySchema.parse({
        id: `t-${language}`,
        name: "x",
        description: "x",
        script_path: "x",
        language,
        created_by_task: "t1",
        usage_count: 0,
        last_used: "2026-03-08T00:00:00.000Z",
        status: "active",
        keywords: [],
        related_memories: [],
      });
      expect(entry.language).toBe(language);
    }
  });
});

describe("ToolBankSchema", () => {
  test("parses valid tool bank", () => {
    const bank = ToolBankSchema.parse({ version: "1.0.0", tools: [] });
    expect(bank.tools).toEqual([]);
  });

  test("defaults version to 1.0.0", () => {
    const bank = ToolBankSchema.parse({ tools: [] });
    expect(bank.version).toBe("1.0.0");
  });
});
