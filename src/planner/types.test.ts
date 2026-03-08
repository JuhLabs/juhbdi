import { describe, expect, test } from "bun:test";
import {
  ChallengeReportSchema,
  PlannerConfigSchema,
  type ChallengeReport,
  type PlannerConfig,
} from "./types";

describe("ChallengeReportSchema", () => {
  test("validates a report with no conflicts", () => {
    const report: ChallengeReport = {
      approved: true,
      conflicts: [],
      suggestions: [],
      refined_request: "Build a REST API with authentication",
    };
    const result = ChallengeReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  test("validates a report with hard and soft conflicts", () => {
    const report: ChallengeReport = {
      approved: false,
      conflicts: [
        { constraint_id: "c1", description: "Violates test policy", severity: "hard" },
        { constraint_id: "c2", description: "May reduce performance", severity: "soft" },
      ],
      suggestions: ["Add test coverage", "Use caching"],
      refined_request: "Build a REST API with auth and tests",
    };
    const result = ChallengeReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  test("rejects invalid severity value", () => {
    const invalid = {
      approved: true,
      conflicts: [{ constraint_id: "c1", description: "Bad", severity: "critical" }],
      suggestions: [],
      refined_request: "test",
    };
    const result = ChallengeReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects missing refined_request", () => {
    const invalid = {
      approved: true,
      conflicts: [],
      suggestions: [],
    };
    const result = ChallengeReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("PlannerConfigSchema", () => {
  test("provides defaults for all fields", () => {
    const result = PlannerConfigSchema.parse({});
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.challenge_max_tokens).toBe(4096);
    expect(result.wavegen_max_tokens).toBe(8192);
  });

  test("allows overriding defaults", () => {
    const result = PlannerConfigSchema.parse({
      model: "claude-opus-4-6",
      challenge_max_tokens: 2048,
    });
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.challenge_max_tokens).toBe(2048);
    expect(result.wavegen_max_tokens).toBe(8192);
  });
});
