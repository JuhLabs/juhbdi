import { z } from "zod";

const TaskStatusSchema = z.enum(["pending", "running", "passed", "failed", "blocked"]);

const VerificationSchema = z.object({
  type: z.enum(["test", "lint", "manual"]),
  command: z.string().optional(),
});

const TaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  goal_refs: z.array(z.string()),
  status: TaskStatusSchema,
  assigned_agent: z.string().optional(),
  worktree_branch: z.string().optional(),
  verification: VerificationSchema,
  retry_count: z.number().int().min(0).default(0),
  banned_approaches: z.array(z.string()).optional(),
  model_tier: z.enum(["haiku", "sonnet", "opus", "auto"]).default("auto"),
});

const WaveSchema = z.object({
  id: z.string().min(1),
  parallel: z.boolean(),
  tasks: z.array(TaskSchema).min(1),
});

const HorizonSketchSchema = z.object({
  remaining_goals: z.array(z.string()),
  estimated_waves: z.number().int().positive(),
  key_unknowns: z.array(z.string()),
  adaptation_notes: z.string().optional(),
});

export const RoadmapIntentSchema = z.object({
  version: z.string().default("1.0.0"),
  intent_spec_ref: z.string().min(1),
  waves: z.array(WaveSchema),
  horizon_sketch: HorizonSketchSchema.optional(),
});

export type RoadmapIntent = z.infer<typeof RoadmapIntentSchema>;
export type Wave = z.infer<typeof WaveSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type HorizonSketch = z.infer<typeof HorizonSketchSchema>;
