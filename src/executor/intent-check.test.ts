// src/executor/intent-check.test.ts
import { describe, expect, test } from "bun:test";
import { checkIntent } from "./intent-check";
import type { Task } from "../schemas/roadmap-intent";
import type { IntentSpec } from "../schemas/intent-spec";

const MOCK_SPEC: IntentSpec = {
  version: "1.0.0",
  project: { name: "test", description: "test project" },
  goals: [
    { id: "g1", description: "Test coverage", metric: "coverage", target: "80%", weight: 0.8 },
    { id: "g2", description: "Performance", metric: "latency", target: "100ms", weight: 0.5 },
  ],
  constraints: [{ id: "c1", description: "No eval", severity: "hard", hitl_required: false }],
  tradeoff_weights: { security: 0.9, performance: 0.7, speed: 0.5, quality: 0.8 },
  hitl_gates: [],
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "w1-t1",
    description: "Create a utility function",
    goal_refs: ["g1"],
    status: "pending",
    verification: { type: "test", command: "bun test" },
    retry_count: 0,
    ...overrides,
  };
}

describe("checkIntent", () => {
  test("passes valid task with existing goal_refs", () => {
    const result = checkIntent(makeTask(), MOCK_SPEC);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("fails task with non-existent goal_ref", () => {
    const result = checkIntent(makeTask({ goal_refs: ["g999"] }), MOCK_SPEC);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("g999"))).toBe(true);
  });

  test("fails task with empty goal_refs", () => {
    const result = checkIntent(makeTask({ goal_refs: [] }), MOCK_SPEC);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("goal_refs"))).toBe(true);
  });

  test("fails task with no verification command for test type", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("verification"))).toBe(true);
  });

  test("passes task with manual verification (no command needed)", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "manual" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("passes task with banned_approaches (structural check only)", () => {
    const result = checkIntent(
      makeTask({ banned_approaches: ["class-based"] }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("fails task with status other than pending or failed", () => {
    const result = checkIntent(makeTask({ status: "passed" }), MOCK_SPEC);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("status"))).toBe(true);
  });
});

describe("checkIntent - verification_command lockdown", () => {
  test("passes with valid verification command", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "bun test src/foo.test.ts" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("fails when verification command is trivial 'true'", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "true" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });

  test("fails when verification command is 'echo pass'", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "echo pass" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });

  test("fails when verification command is 'exit 0'", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "exit 0" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });

  test("fails when verification command is bare 'echo'", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "echo" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });

  test("fails when verification command is colon (bash no-op)", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: ":" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });

  test("passes with real bun test command", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "bun test src/auth.test.ts" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("passes with real npm test command", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "npm test" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("passes with lint command for lint type", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "lint", command: "eslint src/" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("does not check trivial commands for manual verification type", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "manual" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(true);
  });

  test("fails with echo (any echo variant)", () => {
    const result = checkIntent(
      makeTask({ verification: { type: "test", command: "echo ok" } }),
      MOCK_SPEC
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("trivial"))).toBe(true);
  });
});
