import { describe, test, expect } from "bun:test";
import { routeTask, computeComplexityScore, estimateCost, inferOptimalTier, computeAccuracy } from "./model-router";
import type { Task } from "../schemas/roadmap-intent";
import type { TradeoffWeights } from "../schemas/intent-spec";
import type { ExperienceTriplet } from "../schemas/memory";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    description: "implement user authentication",
    goal_refs: ["g1"],
    status: "pending",
    verification: { type: "test", command: "bun test" },
    retry_count: 0,
    model_tier: "auto",
    ...overrides,
  };
}

const balancedWeights: TradeoffWeights = {
  security: 0.5,
  performance: 0.5,
  speed: 0.5,
  quality: 0.5,
};

const qualityWeights: TradeoffWeights = {
  security: 0.8,
  performance: 0.5,
  speed: 0.2,
  quality: 0.9,
};

const speedWeights: TradeoffWeights = {
  security: 0.3,
  performance: 0.5,
  speed: 0.9,
  quality: 0.2,
};

describe("routeTask", () => {
  describe("Signal 1: User override", () => {
    test("returns opus when model_tier is opus", () => {
      const route = routeTask(makeTask({ model_tier: "opus" }), balancedWeights, []);
      expect(route.recommended_tier).toBe("opus");
      expect(route.confidence).toBe(1.0);
      expect(route.signals.override).toBe("opus");
    });

    test("returns haiku when model_tier is haiku", () => {
      const route = routeTask(makeTask({ model_tier: "haiku" }), balancedWeights, []);
      expect(route.recommended_tier).toBe("haiku");
      expect(route.confidence).toBe(1.0);
    });
  });

  describe("Signal 2: Failure escalation", () => {
    test("bumps to opus on retry_count 1 from sonnet baseline", () => {
      const route = routeTask(makeTask({ retry_count: 1 }), balancedWeights, []);
      expect(route.recommended_tier).toBe("opus");
      expect(route.signals.failure_escalation).toBe(true);
    });

    test("forces opus on retry_count 2+", () => {
      const route = routeTask(makeTask({ retry_count: 2 }), balancedWeights, []);
      expect(route.recommended_tier).toBe("opus");
    });

    test("bumps haiku-level task to sonnet on retry", () => {
      const route = routeTask(
        makeTask({ description: "rename file to new name", retry_count: 1 }),
        balancedWeights,
        []
      );
      // Heuristic would say haiku, but retry bumps it
      expect(["sonnet", "opus"]).toContain(route.recommended_tier);
    });
  });

  describe("Signal 3: Memory match", () => {
    const haikuMemory: ExperienceTriplet[] = [
      {
        id: "m1",
        timestamp: "2026-03-01T00:00:00.000Z",
        intent: {
          goal_refs: ["g1"],
          task_description: "implement user authentication with JWT",
          domain_tags: ["auth", "jwt"],
        },
        experience: {
          approach: "jwt middleware",
          files_modified: ["auth.ts"],
          test_result: "pass",
          strikes_used: 0,
          banned_approaches: [],
          model_tier: "haiku",
        },
        utility: 0.9,
      },
    ];

    test("uses haiku when similar task passed with haiku", () => {
      const route = routeTask(
        makeTask({ description: "implement user authentication" }),
        balancedWeights,
        haikuMemory
      );
      expect(route.recommended_tier).toBe("haiku");
      expect(route.signals.memory_match).not.toBeNull();
      expect(route.signals.memory_match!.tier).toBe("haiku");
    });

    test("prefers optimal_tier over model_tier for memory match", () => {
      const memoryWithOptimal: ExperienceTriplet[] = [
        {
          id: "m2",
          timestamp: "2026-03-01T00:00:00.000Z",
          intent: {
            goal_refs: ["g1"],
            task_description: "implement user authentication with JWT",
            domain_tags: ["auth", "jwt"],
          },
          experience: {
            approach: "jwt middleware",
            files_modified: ["auth.ts"],
            test_result: "pass",
            strikes_used: 0,
            banned_approaches: [],
            model_tier: "opus",
            optimal_tier: "haiku",
          },
          utility: 0.95,
        },
      ];
      const route = routeTask(
        makeTask({ description: "implement user authentication" }),
        balancedWeights,
        memoryWithOptimal
      );
      expect(route.recommended_tier).toBe("haiku");
      expect(route.signals.memory_match!.tier).toBe("haiku");
    });
  });

  describe("Signal 4: Heuristic score", () => {
    test("routes simple task to haiku", () => {
      const route = routeTask(
        makeTask({ description: "rename variable from camelCase to snake_case, simple format change" }),
        balancedWeights,
        []
      );
      expect(route.recommended_tier).toBe("haiku");
      expect(route.signals.heuristic_score).toBeLessThan(0);
    });

    test("routes complex task to opus", () => {
      const route = routeTask(
        makeTask({ description: "architect and refactor the security layer, complex integration with database migration" }),
        balancedWeights,
        []
      );
      expect(route.recommended_tier).toBe("opus");
      expect(route.signals.heuristic_score).toBeGreaterThan(0);
    });

    test("routes neutral task to sonnet", () => {
      const route = routeTask(
        makeTask({ description: "add input validation to the form handler" }),
        balancedWeights,
        []
      );
      expect(route.recommended_tier).toBe("sonnet");
    });
  });

  describe("Signal 5: Tradeoff bias", () => {
    test("quality bias shifts toward opus", () => {
      const route = routeTask(
        makeTask({ description: "add input validation" }),
        qualityWeights,
        []
      );
      // Quality bias should shift up from sonnet baseline
      expect(["sonnet", "opus"]).toContain(route.recommended_tier);
      expect(route.signals.tradeoff_bias).toBe("quality");
    });

    test("speed bias shifts toward haiku", () => {
      const route = routeTask(
        makeTask({ description: "add input validation" }),
        speedWeights,
        []
      );
      expect(["haiku", "sonnet"]).toContain(route.recommended_tier);
      expect(route.signals.tradeoff_bias).toBe("speed");
    });
  });

  describe("Edge cases", () => {
    test("returns valid ModelRoute shape", () => {
      const route = routeTask(makeTask(), balancedWeights, []);
      expect(route.task_id).toBe("t1");
      expect(["haiku", "sonnet", "opus"]).toContain(route.recommended_tier);
      expect(route.confidence).toBeGreaterThanOrEqual(0);
      expect(route.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe("computeComplexityScore", () => {
  test("high-weight goal increases score", () => {
    const task = makeTask({ goal_refs: ["g1"] });
    const ctx = {
      goals: [{ id: "g1", weight: 0.9 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    const score = computeComplexityScore(task, ctx);
    expect(score).toBeGreaterThan(0);
  });

  test("low-weight goal decreases score", () => {
    const task = makeTask({ goal_refs: ["g1"] });
    const ctx = {
      goals: [{ id: "g1", weight: 0.1 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    const score = computeComplexityScore(task, ctx);
    expect(score).toBeLessThan(0);
  });

  test("manual verification increases score", () => {
    const task = makeTask({ verification: { type: "manual" } });
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    const score = computeComplexityScore(task, ctx);
    const taskLint = makeTask({ verification: { type: "lint" } });
    const scoreLint = computeComplexityScore(taskLint, ctx);
    expect(score).toBeGreaterThan(scoreLint);
  });

  test("multi-clause description increases score", () => {
    const simple = makeTask({ description: "rename variable" });
    const complex = makeTask({
      description: "implement authentication, add session management, then integrate with database and validate tokens",
    });
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    expect(computeComplexityScore(complex, ctx)).toBeGreaterThan(
      computeComplexityScore(simple, ctx)
    );
  });

  test("banned approaches increase score", () => {
    const noBans = makeTask();
    const withBans = makeTask({ banned_approaches: ["approach-a", "approach-b", "approach-c"] });
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    expect(computeComplexityScore(withBans, ctx)).toBeGreaterThan(
      computeComplexityScore(noBans, ctx)
    );
  });

  test("high wave parallelism decreases score", () => {
    const task = makeTask();
    const solo = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    const parallel = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 5,
      accuracy_history: [],
    };
    expect(computeComplexityScore(task, parallel)).toBeLessThan(
      computeComplexityScore(task, solo)
    );
  });

  test("keywords still contribute as tiebreaker", () => {
    const withKeyword = makeTask({ description: "architect the system" });
    const withoutKeyword = makeTask({ description: "adjust the system" });
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [],
    };
    expect(computeComplexityScore(withKeyword, ctx)).toBeGreaterThan(
      computeComplexityScore(withoutKeyword, ctx)
    );
  });
});

describe("estimateCost", () => {
  test("estimates cost for a test-verified task", () => {
    const task = makeTask({ description: "implement user authentication module" });
    const cost = estimateCost(task);
    expect(cost.estimated_input_tokens).toBeGreaterThan(0);
    expect(cost.estimated_output_tokens).toBeGreaterThan(0);
    expect(cost.tier_costs_usd.haiku).toBeLessThan(cost.tier_costs_usd.sonnet);
    expect(cost.tier_costs_usd.sonnet).toBeLessThan(cost.tier_costs_usd.opus);
  });

  test("lint tasks cost less than test tasks", () => {
    const testTask = makeTask({ verification: { type: "test", command: "bun test" } });
    const lintTask = makeTask({ verification: { type: "lint", command: "bun lint" } });
    const testCost = estimateCost(testTask);
    const lintCost = estimateCost(lintTask);
    expect(lintCost.estimated_output_tokens).toBeLessThan(testCost.estimated_output_tokens);
  });

  test("savings_vs_opus is opus cost minus chosen cost", () => {
    const task = makeTask();
    const cost = estimateCost(task, "sonnet");
    expect(cost.chosen_cost_usd).toBeCloseTo(cost.tier_costs_usd.sonnet, 6);
    expect(cost.savings_vs_opus_usd).toBeCloseTo(
      cost.tier_costs_usd.opus - cost.tier_costs_usd.sonnet, 6
    );
  });

  test("savings is 0 when chosen tier is opus", () => {
    const task = makeTask();
    const cost = estimateCost(task, "opus");
    expect(cost.savings_vs_opus_usd).toBe(0);
  });

  test("defaults chosen tier to sonnet", () => {
    const task = makeTask();
    const cost = estimateCost(task);
    expect(cost.chosen_cost_usd).toBeCloseTo(cost.tier_costs_usd.sonnet, 6);
  });
});

describe("routeTask with context", () => {
  const defaultCtx = {
    goals: [{ id: "g1", weight: 0.5 }],
    wave_task_count: 1,
    accuracy_history: [],
  };

  test("uses structural score when context provided", () => {
    const route = routeTask(
      makeTask({ goal_refs: ["g1"], description: "adjust input validation" }),
      balancedWeights,
      [],
      defaultCtx
    );
    expect(typeof route.signals.heuristic_score).toBe("number");
  });

  test("high-weight goal routes to opus", () => {
    const route = routeTask(
      makeTask({
        goal_refs: ["g1"],
        description: "implement the critical feature, then integrate with the security layer and validate thoroughly",
        verification: { type: "manual" },
      }),
      balancedWeights,
      [],
      { goals: [{ id: "g1", weight: 0.95 }], wave_task_count: 1, accuracy_history: [] }
    );
    expect(route.recommended_tier).toBe("opus");
  });

  test("low-weight goal with lint routes to haiku", () => {
    const route = routeTask(
      makeTask({
        goal_refs: ["g1"],
        description: "fix lint",
        verification: { type: "lint" },
      }),
      balancedWeights,
      [],
      { goals: [{ id: "g1", weight: 0.1 }], wave_task_count: 4, accuracy_history: [] }
    );
    expect(route.recommended_tier).toBe("haiku");
  });

  test("includes cost_estimate when context provided", () => {
    const route = routeTask(
      makeTask(),
      balancedWeights,
      [],
      defaultCtx
    );
    expect(route.cost_estimate).toBeDefined();
    expect(route.cost_estimate!.savings_vs_opus_usd).toBeGreaterThanOrEqual(0);
  });

  test("no cost_estimate without context (backwards compat)", () => {
    const route = routeTask(makeTask(), balancedWeights, []);
    expect(route.cost_estimate).toBeUndefined();
  });

  test("existing tests still work without context", () => {
    const route = routeTask(makeTask({ model_tier: "opus" }), balancedWeights, []);
    expect(route.recommended_tier).toBe("opus");
    expect(route.confidence).toBe(1.0);
  });

  test("conservative thresholds when accuracy is low", () => {
    const lowAccuracy = Array.from({ length: 10 }, (_, i) => ({
      task_id: `t${i}`,
      recommended_tier: "haiku" as const,
      actual_outcome: "escalated" as const,
      timestamp: "2026-03-04T00:00:00.000Z",
    }));
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: lowAccuracy,
    };
    const route = routeTask(
      makeTask({ description: "add input validation to handler" }),
      balancedWeights,
      [],
      ctx
    );
    expect(["sonnet", "opus"]).toContain(route.recommended_tier);
  });

  test("relaxed thresholds when accuracy is high", () => {
    const highAccuracy = Array.from({ length: 20 }, (_, i) => ({
      task_id: `t${i}`,
      recommended_tier: "sonnet" as const,
      actual_outcome: "correct" as const,
      timestamp: "2026-03-04T00:00:00.000Z",
    }));
    const ctx = {
      goals: [{ id: "g1", weight: 0.1 }],
      wave_task_count: 4,
      accuracy_history: highAccuracy,
    };
    const route = routeTask(
      makeTask({
        description: "fix lint",
        verification: { type: "lint" },
      }),
      balancedWeights,
      [],
      ctx
    );
    expect(route.recommended_tier).toBe("haiku");
  });
});

describe("inferOptimalTier", () => {
  test("downgrades opus to sonnet on first-try pass", () => {
    expect(inferOptimalTier("opus", true, 0)).toBe("sonnet");
  });

  test("downgrades sonnet to haiku on first-try pass", () => {
    expect(inferOptimalTier("sonnet", true, 0)).toBe("haiku");
  });

  test("keeps haiku as haiku on first-try pass", () => {
    expect(inferOptimalTier("haiku", true, 0)).toBe("haiku");
  });

  test("keeps same tier when strikes used", () => {
    expect(inferOptimalTier("opus", true, 1)).toBe("opus");
    expect(inferOptimalTier("sonnet", true, 2)).toBe("sonnet");
  });

  test("returns null on failure", () => {
    expect(inferOptimalTier("opus", false, 3)).toBeNull();
  });
});

describe("computeAccuracy", () => {
  test("returns 1.0 for all correct outcomes", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      task_id: `t${i}`,
      recommended_tier: "sonnet" as const,
      actual_outcome: "correct" as const,
      timestamp: "2026-03-04T00:00:00.000Z",
    }));
    const result = computeAccuracy(history);
    expect(result!.accuracy).toBe(1.0);
    expect(result!.correct).toBe(10);
    expect(result!.total).toBe(10);
  });

  test("returns 0.5 for mixed outcomes", () => {
    const history = [
      { task_id: "t1", recommended_tier: "sonnet" as const, actual_outcome: "correct" as const, timestamp: "2026-03-04T00:00:00.000Z" },
      { task_id: "t2", recommended_tier: "haiku" as const, actual_outcome: "escalated" as const, timestamp: "2026-03-04T00:00:00.000Z" },
      { task_id: "t3", recommended_tier: "opus" as const, actual_outcome: "overkill" as const, timestamp: "2026-03-04T00:00:00.000Z" },
      { task_id: "t4", recommended_tier: "sonnet" as const, actual_outcome: "correct" as const, timestamp: "2026-03-04T00:00:00.000Z" },
    ];
    const result = computeAccuracy(history);
    expect(result!.accuracy).toBe(0.5);
    expect(result!.escalated).toBe(1);
    expect(result!.overkill).toBe(1);
  });

  test("uses last 20 entries only", () => {
    const old = Array.from({ length: 25 }, (_, i) => ({
      task_id: `t${i}`,
      recommended_tier: "haiku" as const,
      actual_outcome: "escalated" as const,
      timestamp: "2026-03-04T00:00:00.000Z",
    }));
    const result = computeAccuracy(old);
    expect(result!.total).toBe(20);
    expect(result!.accuracy).toBe(0);
  });

  test("returns null for empty history", () => {
    const result = computeAccuracy([]);
    expect(result).toBeNull();
  });
});
