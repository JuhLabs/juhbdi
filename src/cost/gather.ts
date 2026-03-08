// src/cost/gather.ts
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import type { ModelTier } from "../schemas/model-route";
import type { CostReport, TierCost, WaveCost } from "./types";

interface ParsedRouting {
  recommended_tier: ModelTier;
  signals: {
    override: ModelTier | null;
    failure_escalation: boolean;
  };
  cost_estimate: {
    estimated_input_tokens: number;
    estimated_output_tokens: number;
    tier_costs_usd: { haiku: number; sonnet: number; opus: number };
    chosen_cost_usd: number;
    savings_vs_opus_usd: number;
  };
}

function tryParseRouting(reasoning: string): ParsedRouting | null {
  try {
    const parsed = JSON.parse(reasoning);
    if (!parsed.cost_estimate || !parsed.recommended_tier) return null;
    return parsed as ParsedRouting;
  } catch {
    return null;
  }
}

/**
 * Aggregates cost data from decision trail routing entries.
 *
 * Expects routing entries to have JSON.stringify(ModelRoute) as their
 * `reasoning` field. Entries with non-JSON or missing cost_estimate
 * are silently skipped.
 *
 * See execute.md Step 2 routing section for the trail entry format.
 */
export function gatherCosts(entries: DecisionTrailEntry[]): CostReport {
  const routingEntries = entries.filter(e => e.event_type === "routing");

  const tierMap = new Map<ModelTier, { count: number; cost: number }>();
  const waveMap = new Map<string, { count: number; cost: number }>();
  let totalCost = 0;
  let totalOpus = 0;
  let overrides = 0;
  let escalations = 0;
  let validCount = 0;

  for (const entry of routingEntries) {
    const parsed = tryParseRouting(entry.reasoning);
    if (!parsed) continue;

    validCount++;
    const tier = parsed.recommended_tier;
    const cost = parsed.cost_estimate.chosen_cost_usd;
    const opusCost = parsed.cost_estimate.tier_costs_usd.opus;

    // Tier aggregation
    const existing = tierMap.get(tier) ?? { count: 0, cost: 0 };
    tierMap.set(tier, { count: existing.count + 1, cost: existing.cost + cost });

    // Wave aggregation
    const waveId = entry.wave_id ?? "unknown";
    const waveExisting = waveMap.get(waveId) ?? { count: 0, cost: 0 };
    waveMap.set(waveId, { count: waveExisting.count + 1, cost: waveExisting.cost + cost });

    totalCost += cost;
    totalOpus += opusCost;

    if (parsed.signals.override) overrides++;
    if (parsed.signals.failure_escalation) escalations++;
  }

  const TIER_ORDER: ModelTier[] = ["haiku", "sonnet", "opus"];
  const tierBreakdown: TierCost[] = TIER_ORDER
    .filter(t => tierMap.has(t))
    .map(t => ({ tier: t, task_count: tierMap.get(t)!.count, estimated_usd: tierMap.get(t)!.cost }));

  const waveBreakdown: WaveCost[] = Array.from(waveMap.entries())
    .map(([wave_id, data]) => ({ wave_id, task_count: data.count, estimated_usd: data.cost }));

  const savingsUsd = totalOpus - totalCost;
  const savingsPct = totalOpus > 0 ? (savingsUsd / totalOpus) * 100 : 0;

  return {
    tier_breakdown: tierBreakdown,
    wave_breakdown: waveBreakdown,
    total_tasks: validCount,
    total_estimated_usd: totalCost,
    total_opus_usd: totalOpus,
    savings_usd: savingsUsd,
    savings_pct: savingsPct,
    override_count: overrides,
    escalation_count: escalations,
  };
}
