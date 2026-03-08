// src/cost/gather.test.ts
import { describe, expect, test } from "bun:test";
import { gatherCosts } from "./gather";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

function makeRoutingEntry(overrides: Partial<DecisionTrailEntry> & {
  task_id?: string;
  wave_id?: string;
  reasoning?: string;
} = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-05T10:00:00.000Z",
    event_type: "routing",
    task_id: "w1-t1",
    wave_id: "wave-1",
    description: "Routed task w1-t1 to sonnet",
    reasoning: JSON.stringify({
      recommended_tier: "sonnet",
      signals: { override: null, failure_escalation: false },
      cost_estimate: {
        estimated_input_tokens: 2000,
        estimated_output_tokens: 3000,
        tier_costs_usd: { haiku: 0.0136, sonnet: 0.051, opus: 0.255 },
        chosen_cost_usd: 0.051,
        savings_vs_opus_usd: 0.204,
      },
    }),
    alternatives_considered: ["haiku", "opus"],
    constraint_refs: [],
    outcome: "approved",
    ...overrides,
  };
}

describe("gatherCosts", () => {
  test("returns empty report when no entries", () => {
    const report = gatherCosts([]);
    expect(report.total_tasks).toBe(0);
    expect(report.total_estimated_usd).toBe(0);
    expect(report.tier_breakdown).toEqual([]);
    expect(report.wave_breakdown).toEqual([]);
  });

  test("aggregates single routing entry", () => {
    const entries = [makeRoutingEntry()];
    const report = gatherCosts(entries);
    expect(report.total_tasks).toBe(1);
    expect(report.total_estimated_usd).toBeCloseTo(0.051);
    expect(report.total_opus_usd).toBeCloseTo(0.255);
    expect(report.savings_usd).toBeCloseTo(0.204);
    expect(report.savings_pct).toBeCloseTo(80);
  });

  test("breaks down by tier", () => {
    const entries = [
      makeRoutingEntry({ task_id: "w1-t1", reasoning: JSON.stringify({
        recommended_tier: "haiku",
        signals: { override: null, failure_escalation: false },
        cost_estimate: {
          estimated_input_tokens: 1000, estimated_output_tokens: 1500,
          tier_costs_usd: { haiku: 0.007, sonnet: 0.029, opus: 0.128 },
          chosen_cost_usd: 0.007, savings_vs_opus_usd: 0.121,
        },
      })}),
      makeRoutingEntry({ task_id: "w1-t2" }),
    ];
    const report = gatherCosts(entries);
    expect(report.tier_breakdown).toHaveLength(2);
    const haiku = report.tier_breakdown.find(t => t.tier === "haiku");
    const sonnet = report.tier_breakdown.find(t => t.tier === "sonnet");
    expect(haiku?.task_count).toBe(1);
    expect(sonnet?.task_count).toBe(1);
  });

  test("breaks down by wave", () => {
    const entries = [
      makeRoutingEntry({ wave_id: "wave-1", task_id: "w1-t1" }),
      makeRoutingEntry({ wave_id: "wave-1", task_id: "w1-t2" }),
      makeRoutingEntry({ wave_id: "wave-2", task_id: "w2-t1" }),
    ];
    const report = gatherCosts(entries);
    expect(report.wave_breakdown).toHaveLength(2);
    const w1 = report.wave_breakdown.find(w => w.wave_id === "wave-1");
    expect(w1?.task_count).toBe(2);
  });

  test("filters non-routing entries", () => {
    const entries = [
      makeRoutingEntry(),
      {
        timestamp: "2026-03-05T10:01:00.000Z",
        event_type: "command" as const,
        description: "execution started",
        reasoning: "starting",
        alternatives_considered: [],
        constraint_refs: [],
        outcome: "approved" as const,
      },
    ];
    const report = gatherCosts(entries);
    expect(report.total_tasks).toBe(1);
  });

  test("counts overrides", () => {
    const entries = [makeRoutingEntry({
      reasoning: JSON.stringify({
        recommended_tier: "opus",
        signals: { override: "opus", failure_escalation: false },
        cost_estimate: {
          estimated_input_tokens: 2000, estimated_output_tokens: 3000,
          tier_costs_usd: { haiku: 0.014, sonnet: 0.051, opus: 0.255 },
          chosen_cost_usd: 0.255, savings_vs_opus_usd: 0,
        },
      }),
    })];
    const report = gatherCosts(entries);
    expect(report.override_count).toBe(1);
  });

  test("counts escalations", () => {
    const entries = [makeRoutingEntry({
      reasoning: JSON.stringify({
        recommended_tier: "opus",
        signals: { override: null, failure_escalation: true },
        cost_estimate: {
          estimated_input_tokens: 2000, estimated_output_tokens: 3000,
          tier_costs_usd: { haiku: 0.014, sonnet: 0.051, opus: 0.255 },
          chosen_cost_usd: 0.255, savings_vs_opus_usd: 0,
        },
      }),
    })];
    const report = gatherCosts(entries);
    expect(report.escalation_count).toBe(1);
  });

  test("handles malformed reasoning gracefully", () => {
    const entries = [makeRoutingEntry({ reasoning: "not json" })];
    const report = gatherCosts(entries);
    expect(report.total_tasks).toBe(0);
  });
});
