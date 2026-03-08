import type { ModelTier } from "../schemas/model-route";

export interface TierCost {
  tier: ModelTier;
  task_count: number;
  estimated_usd: number;
}

export interface WaveCost {
  wave_id: string;
  task_count: number;
  estimated_usd: number;
}

export interface CostReport {
  tier_breakdown: TierCost[];
  wave_breakdown: WaveCost[];
  total_tasks: number;
  total_estimated_usd: number;
  total_opus_usd: number;
  savings_usd: number;
  savings_pct: number;
  override_count: number;
  escalation_count: number;
}
