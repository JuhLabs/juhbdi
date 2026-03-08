import { z } from "zod";

const GoalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  metric: z.string().min(1),
  target: z.string().min(1),
  weight: z.number().min(0).max(1),
});

const ConstraintSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["hard", "soft"]),
  hitl_required: z.boolean(),
});

const TradeoffWeightsSchema = z.object({
  security: z.number().min(0).max(1),
  performance: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
});

const HITLGateSchema = z.object({
  action_pattern: z.string().min(1),
  approval_required: z.boolean(),
});

export const IntentSpecSchema = z.object({
  version: z.string().default("1.0.0"),
  project: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    repository: z.url().optional(),
  }),
  goals: z.array(GoalSchema).min(1),
  constraints: z.array(ConstraintSchema),
  tradeoff_weights: TradeoffWeightsSchema,
  hitl_gates: z.array(HITLGateSchema),
});

export type IntentSpec = z.infer<typeof IntentSpecSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type TradeoffWeights = z.infer<typeof TradeoffWeightsSchema>;
export type HITLGate = z.infer<typeof HITLGateSchema>;
