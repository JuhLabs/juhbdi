import { describe, test, expect } from "bun:test";
import { speculate } from "../memory/speculate";
import type { ExperienceTripletV2 } from "../memory/types";
import type { Principle } from "../memory/principle-types";

function makeTriplet(overrides: Partial<ExperienceTripletV2> = {}): ExperienceTripletV2 {
  return {
    id: "m-test-1",
    timestamp: "2026-03-08T00:00:00.000Z",
    intent: {
      goal_refs: ["g1"],
      task_description: "implement user authentication with JWT tokens",
      domain_tags: ["auth", "jwt"],
    },
    experience: {
      approach: "jwt middleware with express",
      files_modified: ["auth.ts", "middleware.ts"],
      test_result: "pass",
      strikes_used: 0,
      banned_approaches: [],
    },
    utility: 0.9,
    keywords: ["authentication", "jwt", "tokens", "middleware"],
    related_memories: [],
    ...overrides,
  };
}

function makePrinciple(overrides: Partial<Principle> = {}): Principle {
  return {
    id: "p-test-1",
    principle: "When implementing authentication, always validate token expiry",
    source_tasks: ["t1"],
    confidence: 0.8,
    times_applied: 2,
    times_validated: 1,
    domain_tags: ["auth"],
    keywords: ["authentication", "token", "validate", "expiry"],
    created_at: "2026-03-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("speculate CLI integration", () => {
  test("returns null when no matching memory or principles", () => {
    const result = speculate("deploy kubernetes cluster", [], []);
    expect(result).toBeNull();
  });

  test("returns memory match for similar task", () => {
    const triplets = [makeTriplet()];
    const result = speculate("implement user authentication", triplets, []);
    expect(result).not.toBeNull();
    expect(result!.recommended_approach).toBe("jwt middleware with express");
    expect(result!.source).toBe("memory");
  });

  test("returns principle match for matching keywords", () => {
    const principles = [makePrinciple()];
    const result = speculate("implement authentication with token validation", [], principles);
    expect(result).not.toBeNull();
    expect(result!.principles.length).toBeGreaterThan(0);
    expect(result!.source).toBe("principles");
  });

  test("returns both when memory and principles match", () => {
    const triplets = [makeTriplet()];
    const principles = [makePrinciple({
      keywords: ["implement", "user", "authentication", "tokens", "middleware"],
    })];
    const result = speculate("implement user authentication with tokens", triplets, principles);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("both");
  });

  test("includes warnings from past failures", () => {
    const failedTriplet = makeTriplet({
      id: "m-fail-1",
      intent: {
        goal_refs: ["g1"],
        task_description: "implement user authentication with sessions",
        domain_tags: ["auth"],
      },
      experience: {
        approach: "cookie-based sessions",
        files_modified: ["auth.ts"],
        test_result: "fail",
        strikes_used: 3,
        banned_approaches: ["cookie-based sessions"],
      },
      utility: 0.1,
      keywords: ["authentication", "sessions", "user"],
    });
    const result = speculate("implement user authentication", [failedTriplet], []);
    expect(result).not.toBeNull();
    expect(result!.warnings.length).toBeGreaterThan(0);
  });

  test("low-confidence principles are filtered out", () => {
    const lowConfidence = makePrinciple({ confidence: 0.3 });
    const result = speculate("implement authentication", [], [lowConfidence]);
    // Should return null since the only principle is below 0.5 confidence threshold
    expect(result).toBeNull();
  });

  test("confidence reflects best match quality", () => {
    const triplets = [makeTriplet({ utility: 0.95 })];
    const result = speculate("implement user authentication with JWT tokens", triplets, []);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });
});
