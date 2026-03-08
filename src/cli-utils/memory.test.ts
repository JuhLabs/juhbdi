import { describe, expect, test } from "bun:test";
import { computeUtility, rankByRelevance, type ExperienceTriplet } from "./memory";

describe("ExperienceTripletSchema with model_tier", () => {
  test("accepts triplet with model_tier", () => {
    const { ExperienceTripletSchema } = require("../schemas/memory");
    const triplet = {
      id: "t1",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "test", domain_tags: [] },
      experience: {
        approach: "test",
        files_modified: [],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
        model_tier: "sonnet",
      },
      utility: 1.0,
    };
    expect(() => ExperienceTripletSchema.parse(triplet)).not.toThrow();
  });

  test("accepts triplet without model_tier (backwards compat)", () => {
    const { ExperienceTripletSchema } = require("../schemas/memory");
    const triplet = {
      id: "t2",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "test", domain_tags: [] },
      experience: {
        approach: "test",
        files_modified: [],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
      },
      utility: 1.0,
    };
    expect(() => ExperienceTripletSchema.parse(triplet)).not.toThrow();
  });

  test("accepts triplet with optimal_tier", () => {
    const { ExperienceTripletSchema } = require("../schemas/memory");
    const triplet = {
      id: "ot1",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "test", domain_tags: [] },
      experience: {
        approach: "test",
        files_modified: [],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
        model_tier: "opus",
        optimal_tier: "sonnet",
      },
      utility: 1.0,
    };
    const result = ExperienceTripletSchema.parse(triplet);
    expect(result.experience.optimal_tier).toBe("sonnet");
  });

  test("accepts triplet without optimal_tier (backwards compat)", () => {
    const { ExperienceTripletSchema } = require("../schemas/memory");
    const triplet = {
      id: "ot2",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "test", domain_tags: [] },
      experience: {
        approach: "test",
        files_modified: [],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
        model_tier: "sonnet",
      },
      utility: 1.0,
    };
    const result = ExperienceTripletSchema.parse(triplet);
    expect(result.experience.optimal_tier).toBeUndefined();
  });
});

describe("computeUtility", () => {
  test("returns 1.0 for first-try pass", () => {
    expect(computeUtility(true, 0, 3)).toBe(1.0);
  });

  test("returns 0.7 for pass after 2 strikes", () => {
    expect(computeUtility(true, 2, 3)).toBeCloseTo(0.7, 1);
  });

  test("returns 0.0 for failure", () => {
    expect(computeUtility(false, 3, 3)).toBe(0.0);
  });

  test("returns 0.8 for pass after 1 strike", () => {
    expect(computeUtility(true, 1, 3)).toBeCloseTo(0.8, 1);
  });
});

describe("rankByRelevance", () => {
  const triplets: ExperienceTriplet[] = [
    {
      id: "1",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: {
        goal_refs: ["g1"],
        task_description: "implement user authentication with JWT tokens",
        domain_tags: ["auth", "api"],
      },
      experience: {
        approach: "Used jsonwebtoken library with middleware pattern",
        files_modified: ["src/auth/middleware.ts"],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
      },
      utility: 1.0,
    },
    {
      id: "2",
      timestamp: "2026-03-01T01:00:00.000Z",
      intent: {
        goal_refs: ["g2"],
        task_description: "add database connection pooling",
        domain_tags: ["database"],
      },
      experience: {
        approach: "Used pg-pool with connection limits",
        files_modified: ["src/db/pool.ts"],
        test_result: "pass",
        strikes_used: 1,
        banned_approaches: ["raw connections"],
      },
      utility: 0.9,
    },
    {
      id: "3",
      timestamp: "2026-03-01T02:00:00.000Z",
      intent: {
        goal_refs: ["g1"],
        task_description: "implement session management for user auth",
        domain_tags: ["auth", "session"],
      },
      experience: {
        approach: "Used express-session with redis store",
        files_modified: ["src/auth/session.ts"],
        test_result: "fail",
        strikes_used: 3,
        banned_approaches: ["cookie-only"],
      },
      utility: 0.0,
    },
  ];

  test("ranks auth-related tasks higher for auth query", () => {
    const results = rankByRelevance(triplets, "implement user login authentication", 3);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every(r => r.experience.test_result === "pass")).toBe(true);
  });

  test("filters out failed experiences", () => {
    const results = rankByRelevance(triplets, "session management", 3);
    expect(results.every(r => r.experience.test_result === "pass")).toBe(true);
  });

  test("respects top_k limit", () => {
    const results = rankByRelevance(triplets, "authentication", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test("returns empty for no matches", () => {
    const results = rankByRelevance([], "anything", 3);
    expect(results).toEqual([]);
  });

  test("handles triplets with model_tier field", () => {
    const withTier: ExperienceTriplet[] = [
      {
        id: "mt1",
        timestamp: "2026-03-01T00:00:00.000Z",
        intent: {
          goal_refs: ["g1"],
          task_description: "implement caching layer",
          domain_tags: ["cache"],
        },
        experience: {
          approach: "Redis caching",
          files_modified: ["cache.ts"],
          test_result: "pass",
          strikes_used: 0,
          banned_approaches: [],
          model_tier: "haiku",
        },
        utility: 0.95,
      },
    ];
    const results = rankByRelevance(withTier, "implement caching", 3);
    expect(results.length).toBe(1);
    expect((results[0].experience as any).model_tier).toBe("haiku");
  });
});
