import { z } from "zod";

export const ExperienceTripletSchema = z.object({
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
});

export const MemoryBankSchema = z.object({
  version: z.string().default("1.0.0"),
  triplets: z.array(ExperienceTripletSchema),
});

export type ExperienceTriplet = z.infer<typeof ExperienceTripletSchema>;
export type MemoryBank = z.infer<typeof MemoryBankSchema>;

export {
  CrossLinkSchema,
  ExperienceTripletV2Schema,
  MemoryBankV2Schema,
  type CrossLink,
  type ExperienceTripletV2,
  type MemoryBankV2,
} from "../memory/types";
