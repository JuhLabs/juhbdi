import { z } from "zod";

export const DecisionTrailEntrySchema = z.object({
  timestamp: z.string().datetime(),
  event_type: z.enum(["decision", "conflict", "override", "recovery", "command", "routing"]),
  task_id: z.string().optional(),
  wave_id: z.string().optional(),
  description: z.string().min(1),
  reasoning: z.string(),
  alternatives_considered: z.array(z.string()),
  constraint_refs: z.array(z.string()),
  outcome: z.enum(["approved", "rejected", "escalated"]),
  prev_hash: z.string().optional(),
  entry_hash: z.string().optional(),
  inputs_hash: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export type DecisionTrailEntry = z.infer<typeof DecisionTrailEntrySchema>;
