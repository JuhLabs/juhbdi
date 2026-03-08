import { describe, expect, test } from "bun:test";
import { QuickTaskSchema, QuickResultSchema, DEFAULT_TRADEOFFS } from "./types";

describe("QuickTaskSchema", () => {
  test("parses valid quick task", () => {
    const task = QuickTaskSchema.parse({
      description: "Fix the login bug in auth.ts",
    });
    expect(task.id).toMatch(/^quick-/);
    expect(task.description).toBe("Fix the login bug in auth.ts");
    expect(task.verification).toEqual({ type: "test", command: undefined });
  });

  test("accepts custom verification command", () => {
    const task = QuickTaskSchema.parse({
      description: "Add caching",
      verification: { type: "test", command: "bun test src/cache.test.ts" },
    });
    expect(task.verification.command).toBe("bun test src/cache.test.ts");
  });

  test("rejects empty description", () => {
    expect(() => QuickTaskSchema.parse({ description: "" })).toThrow();
  });
});

describe("QuickResultSchema", () => {
  test("parses success result", () => {
    const result = QuickResultSchema.parse({
      task_id: "quick-abc",
      status: "passed",
      approach: "Fixed null check",
      files_modified: ["src/auth.ts"],
      model_tier: "sonnet",
    });
    expect(result.status).toBe("passed");
  });

  test("parses failed result", () => {
    const result = QuickResultSchema.parse({
      task_id: "quick-abc",
      status: "failed",
      approach: "Tried refactor",
      files_modified: [],
      model_tier: "sonnet",
      error: "Test assertion failed",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("Test assertion failed");
  });
});

describe("DEFAULT_TRADEOFFS", () => {
  test("has balanced weights summing to reasonable values", () => {
    expect(DEFAULT_TRADEOFFS.quality).toBe(0.5);
    expect(DEFAULT_TRADEOFFS.speed).toBe(0.5);
    expect(DEFAULT_TRADEOFFS.security).toBe(0.7);
    expect(DEFAULT_TRADEOFFS.performance).toBe(0.5);
  });
});
