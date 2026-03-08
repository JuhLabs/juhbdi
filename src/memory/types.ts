import { z } from "zod";

export const CrossLinkSchema = z.object({
  id: z.string().min(1),
  relation: z.string().min(1),
  strength: z.number().min(0).max(1),
});

export type CrossLink = z.infer<typeof CrossLinkSchema>;

export const ExperienceTripletV2Schema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  intent: z.object({
    goal_refs: z.array(z.string()),
    task_description: z.string().min(1),
    domain_tags: z.array(z.string()),
  }),
  experience: z.object({
    approach: z.string().min(1),
    files_modified: z.array(z.string()),
    test_result: z.enum(["pass", "fail"]),
    strikes_used: z.number().int().min(0),
    banned_approaches: z.array(z.string()),
    error_category: z.string().optional(),
    model_tier: z.enum(["haiku", "sonnet", "opus"]).optional(),
    optimal_tier: z.enum(["haiku", "sonnet", "opus"]).optional(),
  }),
  utility: z.number().min(0).max(1),
  keywords: z.array(z.string()).default([]),
  related_memories: z.array(CrossLinkSchema).default([]),
});

export type ExperienceTripletV2 = z.infer<typeof ExperienceTripletV2Schema>;

export const MemoryBankV2Schema = z.object({
  version: z.string().default("2.0.0"),
  triplets: z.array(ExperienceTripletV2Schema),
});

export type MemoryBankV2 = z.infer<typeof MemoryBankV2Schema>;
