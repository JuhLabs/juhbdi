// src/memory/adaptive-replan.test.ts
import { describe, expect, test } from "bun:test";
import {
  computeStepDivergence,
  shouldReplan,
  buildReplanContext,
  type StepExpectation,
  type StepResult,
} from "./adaptive-replan";
import type { ReflexionEntry } from "../schemas/reflexion";

function makeExpectation(overrides: Partial<StepExpectation> = {}): StepExpectation {
  return {
    step_index: 0,
    expected_outcome: "test file created and compilation succeeds",
    verification_command: "bun test src/foo.test.ts",
    ...overrides,
  };
}

function makeResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    step_index: 0,
    actual_outcome: "test file created and compilation succeeds",
    passed: true,
    ...overrides,
  };
}

function makeReflexion(overrides: Partial<ReflexionEntry> = {}): ReflexionEntry {
  return {
    id: "rx-1",
    timestamp: "2026-03-09T00:00:00.000Z",
    task_id: "t-1",
    task_description: "sample task",
    domain_tags: [],
    outcome: "failure",
    approach_taken: "direct approach",
    files_modified: [],
    test_passed: false,
    reflection: "It failed because of X",
    lesson: "Avoid approach X, use Y instead",
    keywords: ["sample", "task"],
    related_reflexion_ids: [],
    ...overrides,
  };
}

describe("computeStepDivergence", () => {
  test("returns 0 for matching outcomes", () => {
    const expected = makeExpectation({
      expected_outcome: "test file created compilation succeeds",
    });
    const actual = makeResult({
      actual_outcome: "test file created compilation succeeds",
      passed: true,
    });
    const score = computeStepDivergence(expected, actual);
    expect(score).toBe(0);
  });

  test("returns high score for completely different outcomes", () => {
    const expected = makeExpectation({
      expected_outcome: "database schema migrated successfully",
    });
    const actual = makeResult({
      actual_outcome: "frontend component rendered with error",
      passed: true,
    });
    const score = computeStepDivergence(expected, actual);
    expect(score).toBeGreaterThan(0.5);
  });

  test("returns high score for failed step regardless of text", () => {
    const expected = makeExpectation({
      expected_outcome: "test passes",
    });
    const actual = makeResult({
      actual_outcome: "test passes",
      passed: false,
    });
    const score = computeStepDivergence(expected, actual);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  test("returns moderate score for partial overlap", () => {
    const expected = makeExpectation({
      expected_outcome: "authentication module created with jwt support",
    });
    const actual = makeResult({
      actual_outcome: "authentication module created without jwt — used session tokens",
      passed: true,
    });
    const score = computeStepDivergence(expected, actual);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.8);
  });
});

describe("shouldReplan", () => {
  test("returns true above threshold", () => {
    expect(shouldReplan(0.7, 5, 0.5)).toBe(true);
  });

  test("returns false below threshold", () => {
    expect(shouldReplan(0.3, 5, 0.5)).toBe(false);
  });

  test("factors in remaining steps — more remaining lowers effective threshold", () => {
    // With many steps remaining (5), threshold is lowered to 0.5*0.8=0.4
    const manySteps = shouldReplan(0.45, 5, 0.5);
    // With just 1 step remaining, threshold is raised to 0.5*1.2=0.6
    const fewSteps = shouldReplan(0.45, 1, 0.5);
    expect(manySteps).toBe(true); // 0.45 >= 0.40
    expect(fewSteps).toBe(false); // 0.45 < 0.60
  });

  test("returns true at exact threshold boundary", () => {
    // With 2 remaining steps, threshold stays at 0.5
    expect(shouldReplan(0.5, 2, 0.5)).toBe(true);
  });

  test("returns false for zero divergence", () => {
    expect(shouldReplan(0, 10, 0.5)).toBe(false);
  });
});

describe("buildReplanContext", () => {
  test("includes original plan summary", () => {
    const context = buildReplanContext(
      "Step 1: Create module\nStep 2: Write tests\nStep 3: Integrate",
      [],
      makeResult({ step_index: 0, actual_outcome: "module creation failed", passed: false, error_output: "ENOENT" }),
      [],
    );
    expect(context).toContain("## Re-Plan Context");
    expect(context).toContain("### Original Plan");
    expect(context).toContain("Create module");
    expect(context).toContain("Write tests");
  });

  test("includes completed step results", () => {
    const completed = [
      makeResult({ step_index: 0, actual_outcome: "schema created", passed: true }),
      makeResult({ step_index: 1, actual_outcome: "tests written", passed: true }),
    ];
    const context = buildReplanContext(
      "Original plan text",
      completed,
      makeResult({ step_index: 2, actual_outcome: "integration failed", passed: false }),
      [],
    );
    expect(context).toContain("### Completed Steps");
    expect(context).toContain("Step 0: [PASS] schema created");
    expect(context).toContain("Step 1: [PASS] tests written");
  });

  test("includes relevant reflexions", () => {
    const reflexions = [
      makeReflexion({ task_description: "similar auth task", lesson: "Use RS256 not HS256" }),
    ];
    const context = buildReplanContext(
      "Plan",
      [],
      makeResult({ step_index: 0, actual_outcome: "auth failed", passed: false }),
      reflexions,
    );
    expect(context).toContain("### Relevant Past Reflexions");
    expect(context).toContain("similar auth task");
    expect(context).toContain("Use RS256 not HS256");
  });

  test("includes failed step error output", () => {
    const context = buildReplanContext(
      "Plan",
      [],
      makeResult({
        step_index: 3,
        actual_outcome: "compilation failed",
        passed: false,
        error_output: "TypeError: Cannot read properties of undefined (reading 'map')",
      }),
      [],
    );
    expect(context).toContain("### Failed Step");
    expect(context).toContain("TypeError: Cannot read properties");
  });

  test("handles no completed steps gracefully", () => {
    const context = buildReplanContext(
      "Plan",
      [],
      makeResult({ step_index: 0, actual_outcome: "first step failed", passed: false }),
      [],
    );
    expect(context).toContain("No steps completed before failure");
  });

  test("includes re-plan instructions", () => {
    const context = buildReplanContext(
      "Plan",
      [],
      makeResult({ step_index: 0, actual_outcome: "failed", passed: false }),
      [],
    );
    expect(context).toContain("### Instructions");
    expect(context).toContain("revised plan");
  });
});
