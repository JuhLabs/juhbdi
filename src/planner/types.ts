import { z } from "zod";

const ConflictInfoSchema = z.object({
  constraint_id: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["hard", "soft"]),
});

export const ChallengeReportSchema = z.object({
  approved: z.boolean(),
  conflicts: z.array(ConflictInfoSchema),
  suggestions: z.array(z.string()),
  refined_request: z.string().min(1),
});

export const PlannerConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-6"),
  challenge_max_tokens: z.number().int().positive().default(4096),
  wavegen_max_tokens: z.number().int().positive().default(8192),
});

export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;
export type ChallengeReport = z.infer<typeof ChallengeReportSchema>;
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;
