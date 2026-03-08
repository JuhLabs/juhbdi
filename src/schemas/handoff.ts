import { z } from "zod";

export const HandoffSchema = z.object({
  paused_at: z.string().datetime(),
  current_wave: z.number().int().min(0),
  current_task: z.string(),
  tasks_completed: z.array(z.string()),
  tasks_remaining: z.array(z.string()),
  context_remaining_pct: z.number().min(0).max(100),
  decisions_made: z.array(z.string()),
  blockers: z.array(z.string()),
  next_action: z.string().min(1),
});

export type Handoff = z.infer<typeof HandoffSchema>;
