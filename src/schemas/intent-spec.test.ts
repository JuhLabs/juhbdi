import { describe, expect, test } from "bun:test";
import { IntentSpecSchema, type IntentSpec } from "./intent-spec";

describe("IntentSpecSchema", () => {
  const validSpec: IntentSpec = {
    version: "1.0.0",
    project: {
      name: "test-project",
      description: "A test project",
    },
    goals: [
      {
        id: "g1",
        description: "Increase test coverage",
        metric: "coverage_percent",
        target: "90",
        weight: 0.8,
      },
    ],
    constraints: [
      {
        id: "c1",
        description: "Never modify DB schema without approval",
        severity: "hard",
        hitl_required: true,
      },
    ],
    tradeoff_weights: {
      security: 0.4,
      performance: 0.3,
      speed: 0.2,
      quality: 0.1,
    },
    hitl_gates: [
      {
        action_pattern: "db:*",
        approval_required: true,
      },
    ],
  };

  test("validates a correct intent spec", () => {
    const result = IntentSpecSchema.safeParse(validSpec);
    expect(result.success).toBe(true);
  });

  test("rejects missing project name", () => {
    const invalid = {
      ...validSpec,
      project: { description: "no name" },
    };
    const result = IntentSpecSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid severity value", () => {
    const invalid = {
      ...validSpec,
      constraints: [{ ...validSpec.constraints[0], severity: "critical" }],
    };
    const result = IntentSpecSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects weight outside 0-1 range", () => {
    const invalid = {
      ...validSpec,
      goals: [{ ...validSpec.goals[0], weight: 1.5 }],
    };
    const result = IntentSpecSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("allows optional repository field", () => {
    const withRepo = {
      ...validSpec,
      project: { ...validSpec.project, repository: "https://github.com/test" },
    };
    const result = IntentSpecSchema.safeParse(withRepo);
    expect(result.success).toBe(true);
  });

  test("requires at least one goal", () => {
    const noGoals = { ...validSpec, goals: [] };
    const result = IntentSpecSchema.safeParse(noGoals);
    expect(result.success).toBe(false);
  });
});
