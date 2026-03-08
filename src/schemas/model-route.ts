import { z } from "zod";

export const ModelTierSchema = z.enum(["haiku", "sonnet", "opus"]);

export type ModelTier = z.infer<typeof ModelTierSchema>;

const MemoryMatchSchema = z.object({
  task_id: z.string(),
  tier: ModelTierSchema,
  utility: z.number().min(0).max(1),
});

export const RoutingOutcomeSchema = z.object({
  task_id: z.string().min(1),
  recommended_tier: ModelTierSchema,
  actual_outcome: z.enum(["correct", "escalated", "overkill"]),
  timestamp: z.string().datetime(),
});

export type RoutingOutcome = z.infer<typeof RoutingOutcomeSchema>;

export const RouteContextSchema = z.object({
  goals: z.array(z.object({
    id: z.string().min(1),
    weight: z.number().min(0).max(1),
  })),
  wave_task_count: z.number().int().min(1),
  accuracy_history: z.array(RoutingOutcomeSchema),
  difficulty: z.number().min(0).max(1).optional(),
  trust_score: z.number().min(0).max(1).optional(),
});

export type RouteContext = z.infer<typeof RouteContextSchema>;

export const CostEstimateSchema = z.object({
  estimated_input_tokens: z.number().int().min(0),
  estimated_output_tokens: z.number().int().min(0),
  tier_costs_usd: z.object({
    haiku: z.number().min(0),
    sonnet: z.number().min(0),
    opus: z.number().min(0),
  }),
  chosen_cost_usd: z.number().min(0),
  savings_vs_opus_usd: z.number().min(0),
});

export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const ModelRouteSchema = z.object({
  task_id: z.string().min(1),
  recommended_tier: ModelTierSchema,
  confidence: z.number().min(0).max(1),
  signals: z.object({
    override: ModelTierSchema.nullable(),
    tradeoff_bias: z.enum(["quality", "balanced", "speed"]),
    heuristic_score: z.number(),
    memory_match: MemoryMatchSchema.nullable(),
    failure_escalation: z.boolean(),
  }),
  cost_estimate: CostEstimateSchema.optional(),
});

export type ModelRoute = z.infer<typeof ModelRouteSchema>;
