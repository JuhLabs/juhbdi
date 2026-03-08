import { z } from "zod/v4";

export const PrincipleSchema = z.object({
  id: z.string(),
  principle: z.string(),
  source_tasks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  times_applied: z.number().int().min(0).default(0),
  times_validated: z.number().int().min(0).default(0),
  domain_tags: z.array(z.string()),
  keywords: z.array(z.string()),
  created_at: z.iso.datetime(),
});

export type Principle = z.infer<typeof PrincipleSchema>;

export const PrincipleBankSchema = z.object({
  version: z.literal("1.0.0"),
  principles: z.array(PrincipleSchema),
});

export type PrincipleBank = z.infer<typeof PrincipleBankSchema>;
