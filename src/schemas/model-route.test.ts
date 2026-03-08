import { describe, test, expect } from "bun:test";
import {
  ModelRouteSchema,
  ModelTierSchema,
  RouteContextSchema,
  CostEstimateSchema,
  RoutingOutcomeSchema,
} from "./model-route";

describe("ModelTierSchema", () => {
  test("accepts valid tiers", () => {
    expect(ModelTierSchema.parse("haiku")).toBe("haiku");
    expect(ModelTierSchema.parse("sonnet")).toBe("sonnet");
    expect(ModelTierSchema.parse("opus")).toBe("opus");
  });

  test("rejects invalid tier", () => {
    expect(() => ModelTierSchema.parse("gpt4")).toThrow();
  });
});

describe("ModelRouteSchema", () => {
  test("validates a complete route", () => {
    const route = {
      task_id: "t1",
      recommended_tier: "sonnet",
      confidence: 0.85,
      signals: {
        override: null,
        tradeoff_bias: "balanced",
        heuristic_score: 0,
        memory_match: null,
        failure_escalation: false,
      },
    };
    const result = ModelRouteSchema.parse(route);
    expect(result.recommended_tier).toBe("sonnet");
    expect(result.confidence).toBe(0.85);
  });

  test("validates route with memory match", () => {
    const route = {
      task_id: "t2",
      recommended_tier: "haiku",
      confidence: 0.9,
      signals: {
        override: null,
        tradeoff_bias: "speed",
        heuristic_score: -4,
        memory_match: {
          task_id: "old-t5",
          tier: "haiku",
          utility: 0.95,
        },
        failure_escalation: false,
      },
    };
    expect(() => ModelRouteSchema.parse(route)).not.toThrow();
  });

  test("validates route with override", () => {
    const route = {
      task_id: "t3",
      recommended_tier: "opus",
      confidence: 1.0,
      signals: {
        override: "opus",
        tradeoff_bias: "balanced",
        heuristic_score: 0,
        memory_match: null,
        failure_escalation: false,
      },
    };
    expect(() => ModelRouteSchema.parse(route)).not.toThrow();
  });

  test("rejects confidence over 1", () => {
    expect(() =>
      ModelRouteSchema.parse({
        task_id: "t1",
        recommended_tier: "sonnet",
        confidence: 1.5,
        signals: {
          override: null,
          tradeoff_bias: "balanced",
          heuristic_score: 0,
          memory_match: null,
          failure_escalation: false,
        },
      })
    ).toThrow();
  });

  test("validates route with cost_estimate", () => {
    const route = {
      task_id: "t1",
      recommended_tier: "sonnet",
      confidence: 0.7,
      signals: {
        override: null,
        tradeoff_bias: "balanced",
        heuristic_score: 0,
        memory_match: null,
        failure_escalation: false,
      },
      cost_estimate: {
        estimated_input_tokens: 2000,
        estimated_output_tokens: 3000,
        tier_costs_usd: { haiku: 0.014, sonnet: 0.051, opus: 0.255 },
        chosen_cost_usd: 0.051,
        savings_vs_opus_usd: 0.204,
      },
    };
    const result = ModelRouteSchema.parse(route);
    expect(result.cost_estimate).toBeDefined();
    expect(result.cost_estimate!.savings_vs_opus_usd).toBeCloseTo(0.204, 3);
  });

  test("validates route without cost_estimate (backwards compat)", () => {
    const route = {
      task_id: "t1",
      recommended_tier: "sonnet",
      confidence: 0.7,
      signals: {
        override: null,
        tradeoff_bias: "balanced",
        heuristic_score: 0,
        memory_match: null,
        failure_escalation: false,
      },
    };
    const result = ModelRouteSchema.parse(route);
    expect(result.cost_estimate).toBeUndefined();
  });
});

describe("RouteContextSchema", () => {
  test("validates a complete context", () => {
    const ctx = {
      goals: [{ id: "g1", weight: 0.8 }],
      wave_task_count: 3,
      accuracy_history: [],
    };
    expect(() => RouteContextSchema.parse(ctx)).not.toThrow();
  });

  test("validates context with accuracy history", () => {
    const ctx = {
      goals: [{ id: "g1", weight: 0.5 }],
      wave_task_count: 1,
      accuracy_history: [
        {
          task_id: "t1",
          recommended_tier: "sonnet",
          actual_outcome: "correct",
          timestamp: "2026-03-04T00:00:00.000Z",
        },
      ],
    };
    expect(() => RouteContextSchema.parse(ctx)).not.toThrow();
  });

  test("rejects invalid outcome", () => {
    const ctx = {
      goals: [],
      wave_task_count: 1,
      accuracy_history: [
        {
          task_id: "t1",
          recommended_tier: "sonnet",
          actual_outcome: "unknown",
          timestamp: "2026-03-04T00:00:00.000Z",
        },
      ],
    };
    expect(() => RouteContextSchema.parse(ctx)).toThrow();
  });
});

describe("CostEstimateSchema", () => {
  test("validates a cost estimate", () => {
    const cost = {
      estimated_input_tokens: 5000,
      estimated_output_tokens: 8000,
      tier_costs_usd: { haiku: 0.036, sonnet: 0.135, opus: 0.675 },
      chosen_cost_usd: 0.135,
      savings_vs_opus_usd: 0.54,
    };
    expect(() => CostEstimateSchema.parse(cost)).not.toThrow();
  });

  test("rejects negative tokens", () => {
    const cost = {
      estimated_input_tokens: -100,
      estimated_output_tokens: 8000,
      tier_costs_usd: { haiku: 0.036, sonnet: 0.135, opus: 0.675 },
      chosen_cost_usd: 0.135,
      savings_vs_opus_usd: 0.54,
    };
    expect(() => CostEstimateSchema.parse(cost)).toThrow();
  });
});

describe("RoutingOutcomeSchema", () => {
  test("validates correct outcome", () => {
    const outcome = {
      task_id: "t1",
      recommended_tier: "sonnet",
      actual_outcome: "correct",
      timestamp: "2026-03-04T00:00:00.000Z",
    };
    expect(() => RoutingOutcomeSchema.parse(outcome)).not.toThrow();
  });

  test("validates escalated outcome", () => {
    const outcome = {
      task_id: "t2",
      recommended_tier: "haiku",
      actual_outcome: "escalated",
      timestamp: "2026-03-04T00:00:00.000Z",
    };
    expect(() => RoutingOutcomeSchema.parse(outcome)).not.toThrow();
  });

  test("validates overkill outcome", () => {
    const outcome = {
      task_id: "t3",
      recommended_tier: "opus",
      actual_outcome: "overkill",
      timestamp: "2026-03-04T00:00:00.000Z",
    };
    expect(() => RoutingOutcomeSchema.parse(outcome)).not.toThrow();
  });
});
