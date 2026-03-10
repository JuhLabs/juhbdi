import { z } from "zod";

export const HandoffSchema = z.object({
  paused_at: z.iso.datetime(),
  current_wave: z.number().int().min(0),
  current_task: z.string(),
  tasks_completed: z.array(z.string()),
  tasks_remaining: z.array(z.string()),
  context_remaining_pct: z.number().min(0).max(100),
  decisions_made: z.array(z.string()),
  blockers: z.array(z.string()),
  next_action: z.string().min(1),
  // M12.1 QOL: reflection data from expanded pause questions
  session_confidence: z.number().int().min(1).max(5).optional(),
  session_learnings: z.string().optional(),
  top_risk: z.string().optional(),
  // M12.1 QOL: partial wave progress for mid-wave resume
  partial_wave_progress: z.object({
    wave_id: z.string(),
    total_tasks: z.number(),
    completed_task_ids: z.array(z.string()),
    pending_task_ids: z.array(z.string()),
    in_progress_task_id: z.string().optional(),
  }).optional(),
});

export type Handoff = z.infer<typeof HandoffSchema>;
