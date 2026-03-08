import { z } from "zod";

const ContextHealthSchema = z.object({
  remaining_pct: z.number().min(0).max(100),
  trend: z.enum(["stable", "declining", "critical"]),
  waves_remaining_estimate: z.number().int().min(0),
  last_checked: z.string().datetime(),
});

export const StateSchema = z.object({
  version: z.string().default("1.0.0"),
  project_name: z.string().min(1),
  conventions: z.array(z.string()),
  architecture: z.string(),
  active_context: z.object({
    current_wave: z.number().optional(),
    current_task: z.string().optional(),
    focus: z.string().optional(),
    context_health: ContextHealthSchema.optional(),
  }).optional(),
  compressed_history: z.string(),
  last_updated: z.string().datetime(),
});

export type ContextHealth = z.infer<typeof ContextHealthSchema>;
export type State = z.infer<typeof StateSchema>;

export function serializeState(state: State): string {
  return JSON.stringify(state, null, 2) + "\n";
}

export function parseState(json: string): State {
  return StateSchema.parse(JSON.parse(json));
}
