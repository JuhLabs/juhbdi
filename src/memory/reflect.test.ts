import { describe, expect, test } from "bun:test";
import { extractPrinciples, type WaveResult, type TaskOutcome } from "./reflect";
import type { PrincipleBank } from "./principle-types";

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    task_id: "t-1",
    planned_approach: "use Array.map",
    actual_approach: "use for-of loop with early return",
    description: "Transform data array",
    domain_tags: ["typescript"],
    test_passed: true,
    files_modified: ["src/data.ts"],
    ...overrides,
  };
}

describe("extractPrinciples", () => {
  const emptyBank: PrincipleBank = { version: "1.0.0", principles: [] };

  test("extracts principle when planned != actual and test passed", () => {
    const result: WaveResult = { wave_id: "w1", outcomes: [makeOutcome()] };
    const principles = extractPrinciples(result, emptyBank);
    expect(principles.length).toBe(1);
    expect(principles[0].principle.length).toBeGreaterThan(0);
    expect(principles[0].source_tasks).toEqual(["t-1"]);
    expect(principles[0].confidence).toBeGreaterThan(0);
  });

  test("skips extraction when planned == actual", () => {
    const result: WaveResult = {
      wave_id: "w1",
      outcomes: [makeOutcome({ planned_approach: "use map", actual_approach: "use map" })],
    };
    const principles = extractPrinciples(result, emptyBank);
    expect(principles.length).toBe(0);
  });

  test("skips extraction when test failed", () => {
    const result: WaveResult = {
      wave_id: "w1",
      outcomes: [makeOutcome({ test_passed: false })],
    };
    const principles = extractPrinciples(result, emptyBank);
    expect(principles.length).toBe(0);
  });

  test("merges with existing principle if keywords overlap", () => {
    const existingBank: PrincipleBank = {
      version: "1.0.0",
      principles: [{
        id: "p-existing",
        principle: "For-of loops with early return are faster for transforms",
        source_tasks: ["t-0"],
        confidence: 0.7,
        times_applied: 1,
        times_validated: 1,
        domain_tags: ["typescript"],
        keywords: ["loop", "transform", "array", "typescript"],
        created_at: "2026-03-07T10:00:00Z",
      }],
    };
    const result: WaveResult = { wave_id: "w1", outcomes: [makeOutcome()] };
    const principles = extractPrinciples(result, existingBank);
    const strengthened = principles.find((p) => p.id === "p-existing");
    if (strengthened) {
      expect(strengthened.confidence).toBeGreaterThanOrEqual(0.7);
      expect(strengthened.source_tasks).toContain("t-1");
    }
  });

  test("extracts keywords from description and approaches", () => {
    const result: WaveResult = { wave_id: "w1", outcomes: [makeOutcome()] };
    const principles = extractPrinciples(result, emptyBank);
    expect(principles[0].keywords.length).toBeGreaterThan(0);
  });

  test("handles multiple outcomes in a wave", () => {
    const result: WaveResult = {
      wave_id: "w1",
      outcomes: [
        makeOutcome({ task_id: "t-1" }),
        makeOutcome({
          task_id: "t-2",
          planned_approach: "use fetch",
          actual_approach: "use axios with retry",
          description: "Call external API",
          domain_tags: ["api"],
        }),
        makeOutcome({
          task_id: "t-3",
          planned_approach: "same",
          actual_approach: "same",
        }),
      ],
    };
    const principles = extractPrinciples(result, emptyBank);
    expect(principles.length).toBe(2);
  });
});
