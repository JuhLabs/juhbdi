import { describe, test, expect } from "bun:test";
import { routeTask, computeComplexityScore, inferOptimalTier, computeAccuracy } from "./model-router";
import { computeUtility } from "./memory";
import type { Task } from "../schemas/roadmap-intent";
import type { TradeoffWeights } from "../schemas/intent-spec";
import type { ExperienceTriplet } from "../schemas/memory";
import type { RoutingOutcome } from "../schemas/model-route";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    description: "implement feature",
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

describe("routing pipeline integration", () => {
  // Shared fixtures
  const highGoal = { id: "g-high", weight: 0.95 };
  const lowGoal = { id: "g-low", weight: 0.1 };

  const complexTask = makeTask({
    id: "t-complex",
    description: "architect and refactor the security layer, integrate with database migration, then validate thoroughly",
    goal_refs: ["g-high"],
    verification: { type: "manual" },
  });

  const simpleTask = makeTask({
    id: "t-simple",
    description: "fix lint",
    goal_refs: ["g-low"],
    verification: { type: "lint" },
  });

  const baseCtx = {
    goals: [highGoal, lowGoal],
    wave_task_count: 2,
    accuracy_history: [] as RoutingOutcome[],
  };

  test("Step 1-3: initial routing differentiates by complexity", () => {
    const complexRoute = routeTask(complexTask, balancedWeights, [], baseCtx);
    const simpleRoute = routeTask(simpleTask, balancedWeights, [], baseCtx);

    expect(complexRoute.recommended_tier).toBe("opus");
    expect(simpleRoute.recommended_tier).toBe("haiku");

    // Complexity scores should reflect the difference
    const complexScore = computeComplexityScore(complexTask, baseCtx);
    const simpleScore = computeComplexityScore(simpleTask, baseCtx);
    expect(complexScore).toBeGreaterThan(simpleScore);
    expect(complexScore).toBeGreaterThanOrEqual(4);
    expect(simpleScore).toBeLessThanOrEqual(-4);
  });

  test("Step 4-6: learning loop downgrades successful tasks", () => {
    // Simulate: opus task passed first try → infer optimal is sonnet
    const optimal = inferOptimalTier("opus", true, 0);
    expect(optimal).toBe("sonnet");

    // Build experience triplet from the successful run
    const utility = computeUtility(true, 0, 3);
    expect(utility).toBe(1.0);

    const memory: ExperienceTriplet[] = [
      {
        id: "mem-1",
        timestamp: "2026-03-04T00:00:00.000Z",
        intent: {
          goal_refs: ["g-high"],
          task_description: "architect and refactor the security layer, integrate with database migration",
          domain_tags: ["security", "database"],
        },
        experience: {
          approach: "incremental refactor",
          files_modified: ["security.ts", "db.ts"],
          test_result: "pass",
          strikes_used: 0,
          banned_approaches: [],
          model_tier: "opus",
          optimal_tier: "sonnet",
        },
        utility,
      },
    ];

    // Route a similar task — memory match should kick in and use sonnet
    const similarTask = makeTask({
      id: "t-similar",
      description: "architect and refactor the security integration layer with database",
      goal_refs: ["g-high"],
      verification: { type: "manual" },
    });

    const route = routeTask(similarTask, balancedWeights, memory, baseCtx);
    expect(route.recommended_tier).toBe("sonnet");
    expect(route.signals.memory_match).not.toBeNull();
    expect(route.signals.memory_match!.tier).toBe("sonnet");
  });

  test("Step 7-8: failed downgrade triggers escalation", () => {
    // The downgraded-to-sonnet task fails → no optimal inference
    const optimalAfterFail = inferOptimalTier("sonnet", false, 1);
    expect(optimalAfterFail).toBeNull();

    // Route with retry_count=1 → failure escalation bumps tier
    const retryTask = makeTask({
      id: "t-retry",
      description: "architect and refactor the security integration layer with database",
      goal_refs: ["g-high"],
      verification: { type: "manual" },
      retry_count: 1,
    });

    const route = routeTask(retryTask, balancedWeights, [], baseCtx);
    expect(route.signals.failure_escalation).toBe(true);
    expect(route.recommended_tier).toBe("opus");
    expect(route.confidence).toBe(0.9);

    // retry_count >= 2 always forces opus
    const retry2 = routeTask(
      makeTask({ ...retryTask, id: "t-retry2", retry_count: 2 }),
      balancedWeights,
      [],
      baseCtx,
    );
    expect(retry2.recommended_tier).toBe("opus");
  });

  test("Step 9-11: accuracy calibration adjusts thresholds", () => {
    // Low accuracy history: 5 correct, 10 escalated, 5 overkill = 0.25
    const lowAccuracy: RoutingOutcome[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        task_id: `tc${i}`,
        recommended_tier: "sonnet" as const,
        actual_outcome: "correct" as const,
        timestamp: "2026-03-04T00:00:00.000Z",
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        task_id: `te${i}`,
        recommended_tier: "haiku" as const,
        actual_outcome: "escalated" as const,
        timestamp: "2026-03-04T00:00:00.000Z",
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        task_id: `to${i}`,
        recommended_tier: "opus" as const,
        actual_outcome: "overkill" as const,
        timestamp: "2026-03-04T00:00:00.000Z",
      })),
    ];

    const lowStats = computeAccuracy(lowAccuracy);
    expect(lowStats!.accuracy).toBe(0.25);

    // Borderline task: moderate complexity, should land sonnet normally
    const borderlineTask = makeTask({
      id: "t-border",
      description: "implement the critical feature and integrate with the security layer",
      goal_refs: ["g-high"],
      verification: { type: "test", command: "bun test" },
    });

    const conservativeRoute = routeTask(
      borderlineTask,
      balancedWeights,
      [],
      { goals: [highGoal, lowGoal], wave_task_count: 2, accuracy_history: lowAccuracy },
    );
    // Conservative: opus threshold drops to 3, so borderline task more likely to hit opus
    expect(["sonnet", "opus"]).toContain(conservativeRoute.recommended_tier);

    // High accuracy: 18 correct, 1 escalated, 1 overkill = 0.9
    const highAccuracy: RoutingOutcome[] = [
      ...Array.from({ length: 18 }, (_, i) => ({
        task_id: `tc${i}`,
        recommended_tier: "sonnet" as const,
        actual_outcome: "correct" as const,
        timestamp: "2026-03-04T00:00:00.000Z",
      })),
      { task_id: "te0", recommended_tier: "haiku" as const, actual_outcome: "escalated" as const, timestamp: "2026-03-04T00:00:00.000Z" },
      { task_id: "to0", recommended_tier: "opus" as const, actual_outcome: "overkill" as const, timestamp: "2026-03-04T00:00:00.000Z" },
    ];

    const highStats = computeAccuracy(highAccuracy);
    expect(highStats!.accuracy).toBe(0.9);

    // Relaxed: haiku threshold loosens to -3, so simple tasks more easily haiku
    const relaxedRoute = routeTask(
      simpleTask,
      balancedWeights,
      [],
      { goals: [highGoal, lowGoal], wave_task_count: 4, accuracy_history: highAccuracy },
    );
    expect(relaxedRoute.recommended_tier).toBe("haiku");
  });

  test("Step 12: cost estimates populated on all context-routed decisions", () => {
    const tasks = [complexTask, simpleTask, makeTask({ id: "t-mid", description: "add validation logic" })];

    for (const task of tasks) {
      const route = routeTask(task, balancedWeights, [], baseCtx);
      expect(route.cost_estimate).toBeDefined();

      const ce = route.cost_estimate!;
      expect(ce.estimated_input_tokens).toBeGreaterThan(0);
      expect(ce.estimated_output_tokens).toBeGreaterThan(0);
      expect(ce.tier_costs_usd.haiku).toBeGreaterThan(0);
      expect(ce.tier_costs_usd.sonnet).toBeGreaterThan(0);
      expect(ce.tier_costs_usd.opus).toBeGreaterThan(0);
      expect(typeof ce.chosen_cost_usd).toBe("number");
      expect(typeof ce.savings_vs_opus_usd).toBe("number");
    }

    // Without context → no cost estimate
    const noCtx = routeTask(simpleTask, balancedWeights, []);
    expect(noCtx.cost_estimate).toBeUndefined();
  });

  test("cost accumulation: savings math is consistent", () => {
    const diverseTasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({
        id: `t-cost-${i}`,
        description: i % 2 === 0
          ? "architect complex security refactor with database migration and thorough validation"
          : "fix lint issue, simple rename",
        goal_refs: [i % 2 === 0 ? "g-high" : "g-low"],
        verification: { type: i % 3 === 0 ? "manual" : i % 3 === 1 ? "test" : "lint" },
      })
    );

    let totalChosen = 0;
    let totalSavings = 0;

    for (const task of diverseTasks) {
      const route = routeTask(task, balancedWeights, [], baseCtx);
      const ce = route.cost_estimate!;

      // Core invariant: chosen + savings === opus cost
      expect(ce.chosen_cost_usd + ce.savings_vs_opus_usd).toBeCloseTo(ce.tier_costs_usd.opus, 10);

      totalChosen += ce.chosen_cost_usd;
      totalSavings += ce.savings_vs_opus_usd;
    }

    // Verify totals are positive and consistent
    expect(totalChosen).toBeGreaterThan(0);
    expect(totalSavings).toBeGreaterThanOrEqual(0);
  });
});
