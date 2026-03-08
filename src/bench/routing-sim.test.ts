import { describe, expect, test } from "bun:test";
import { routeTask, estimateCost } from "../cli-utils/model-router";
import type { ModelTier } from "../schemas/model-route";

describe("routing accuracy simulation", () => {
  const TASKS = Array.from({ length: 50 }, (_, i) => {
    const c = i / 50;
    const idealTier: ModelTier = c < 0.3 ? "haiku" : c < 0.7 ? "sonnet" : "opus";
    return {
      task: {
        id: `sim-${i}`, description: c < 0.3 ? `rename variable ${i}` : c < 0.7 ? `add validation to form ${i} with fields` : `architect distributed caching ${i} with failover`,
        goal_refs: ["g-1"], status: "pending" as const,
        verification: { type: (c > 0.5 ? "test" : "lint") as "test"|"lint" },
        retry_count: 0, banned_approaches: c > 0.8 ? ["naive"] : [], model_tier: "auto" as const,
      },
      idealTier,
    };
  });

  test("routing accuracy >= 40% without memory", () => {
    const weights = { security: 0.5, performance: 0.5, speed: 0.5, quality: 0.5 };
    let correct = 0, escalated = 0, overkill = 0;
    const tiers: ModelTier[] = ["haiku", "sonnet", "opus"];
    for (const { task, idealTier } of TASKS) {
      const route = routeTask(task, weights, []);
      const ri = tiers.indexOf(route.recommended_tier), ii = tiers.indexOf(idealTier);
      if (ri === ii) correct++; else if (ri > ii) overkill++; else escalated++;
    }
    console.log(`Routing: ${(correct/50*100).toFixed(1)}% correct, ${overkill} overkill, ${escalated} under`);
    expect(correct / 50).toBeGreaterThanOrEqual(0.4);
  });

  test("cost savings vs all-opus > 0%", () => {
    const weights = { security: 0.5, performance: 0.5, speed: 0.5, quality: 0.5 };
    let routed = 0, opus = 0;
    for (const { task } of TASKS) {
      const route = routeTask(task, weights, []);
      routed += estimateCost(task, route.recommended_tier).chosen_cost_usd;
      opus += estimateCost(task, "opus").chosen_cost_usd;
    }
    const savings = ((opus - routed) / opus) * 100;
    console.log(`Savings vs all-opus: ${savings.toFixed(1)}%`);
    expect(savings).toBeGreaterThan(0);
  });
});
