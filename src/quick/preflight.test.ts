import { describe, expect, test } from "bun:test";
import { computePreflight } from "./preflight";
import type { QuickTask } from "./types";

describe("computePreflight", () => {
  const baseTask: QuickTask = {
    id: "quick-test",
    description: "Add input validation to the signup form",
    verification: { type: "test" },
  };

  test("returns approved result with routing for valid task", () => {
    const result = computePreflight(baseTask, {
      tradeoffs: { security: 0.7, performance: 0.5, speed: 0.5, quality: 0.5 },
      memoryTriplets: [],
    });
    expect(result.approved).toBe(true);
    expect(result.recommended_tier).toBeDefined();
    expect(["haiku", "sonnet", "opus"]).toContain(result.recommended_tier);
    expect(result.violations).toEqual([]);
  });

  test("returns rejected for credential-laden description", () => {
    const badTask: QuickTask = {
      id: "quick-bad",
      description: 'Hardcode API_KEY = "sk-secret123abc456"',
      verification: { type: "test" },
    };
    const result = computePreflight(badTask, {
      tradeoffs: { security: 0.7, performance: 0.5, speed: 0.5, quality: 0.5 },
      memoryTriplets: [],
    });
    expect(result.approved).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("uses memory matches for routing when available", () => {
    const triplets = [{
      id: "mem-1",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: {
        goal_refs: ["g1"],
        task_description: "Add input validation to the login form",
        domain_tags: ["validation", "forms"],
      },
      experience: {
        approach: "Zod schemas",
        files_modified: ["src/forms/login.ts"],
        test_result: "pass" as const,
        strikes_used: 0,
        banned_approaches: [],
        model_tier: "sonnet" as const,
        optimal_tier: "haiku" as const,
      },
      utility: 1.0,
    }];
    const result = computePreflight(baseTask, {
      tradeoffs: { security: 0.7, performance: 0.5, speed: 0.5, quality: 0.5 },
      memoryTriplets: triplets,
    });
    expect(result.approved).toBe(true);
    expect(result.memory_matches.length).toBeGreaterThan(0);
  });

  test("includes cost estimate in result", () => {
    const result = computePreflight(baseTask, {
      tradeoffs: { security: 0.7, performance: 0.5, speed: 0.5, quality: 0.5 },
      memoryTriplets: [],
    });
    expect(result.cost_estimate).toBeDefined();
    expect(result.cost_estimate!.chosen_cost_usd).toBeGreaterThan(0);
  });
});
