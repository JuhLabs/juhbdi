// src/executor/types.test.ts
import { describe, expect, test } from "bun:test";
import {
  TaskOutputSchema,
  IntentCheckSchema,
  TaskExecutionResultSchema,
  ExecutorConfigSchema,
} from "./types";

describe("TaskOutputSchema", () => {
  test("validates a valid task output", () => {
    const valid = {
      approach: "Use a functional pattern with pure functions",
      files: [
        { path: "src/foo.ts", content: "export const foo = 1;", action: "create" },
      ],
      test_command: "bun test src/foo.test.ts",
      reasoning: "Chose functional approach for testability",
    };
    expect(() => TaskOutputSchema.parse(valid)).not.toThrow();
  });

  test("rejects missing approach", () => {
    const invalid = {
      files: [],
      test_command: "bun test",
      reasoning: "test",
    };
    expect(() => TaskOutputSchema.parse(invalid)).toThrow();
  });

  test("rejects invalid file action", () => {
    const invalid = {
      approach: "test",
      files: [{ path: "a.ts", content: "x", action: "rename" }],
      test_command: "bun test",
      reasoning: "test",
    };
    expect(() => TaskOutputSchema.parse(invalid)).toThrow();
  });
});

describe("IntentCheckSchema", () => {
  test("validates passing check", () => {
    expect(() => IntentCheckSchema.parse({ passed: true, violations: [] })).not.toThrow();
  });

  test("validates failing check with violations", () => {
    const result = IntentCheckSchema.parse({
      passed: false,
      violations: ["Missing goal_refs", "Approach is banned"],
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

describe("TaskExecutionResultSchema", () => {
  test("validates passed result", () => {
    const result = TaskExecutionResultSchema.parse({
      task_id: "w1-t1",
      status: "passed",
      approach: "functional",
      test_output: "1 pass, 0 fail",
    });
    expect(result.status).toBe("passed");
  });

  test("validates failed result with error", () => {
    const result = TaskExecutionResultSchema.parse({
      task_id: "w1-t1",
      status: "failed",
      error: "Test timed out",
    });
    expect(result.status).toBe("failed");
  });
});

describe("ExecutorConfigSchema", () => {
  test("applies defaults", () => {
    const config = ExecutorConfigSchema.parse({ model: "claude-sonnet-4-6" });
    expect(config.max_retries).toBe(3);
    expect(config.test_timeout_ms).toBe(60000);
    expect(config.codegen_max_tokens).toBe(8192);
  });

  test("allows custom values", () => {
    const config = ExecutorConfigSchema.parse({
      model: "claude-opus-4-6",
      max_retries: 5,
      test_timeout_ms: 120000,
      codegen_max_tokens: 16384,
    });
    expect(config.max_retries).toBe(5);
  });
});
