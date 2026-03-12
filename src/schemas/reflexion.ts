// src/schemas/reflexion.ts — Zod schemas for the Reflexion memory system
import { z } from "zod";

export const ReflexionEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  task_id: z.string().min(1),
  task_description: z.string().min(1),
  domain_tags: z.array(z.string()),
  outcome: z.enum(["success", "failure"]),

  // What happened
  approach_taken: z.string().min(1),
  files_modified: z.array(z.string()),
  test_passed: z.boolean(),
  error_summary: z.string().optional(),

  // The reflection (natural language, stored for future retrieval)
  reflection: z.string().min(1), // "What went wrong/right and why"
  lesson: z.string().min(1), // "What to do differently next time"
  keywords: z.array(z.string()),

  // Linkage
  wave_id: z.string().optional(),
  related_reflexion_ids: z.array(z.string()).default([]),

  // Memory-backed governance fields
  failure_signature: z.object({
    task_keywords: z.array(z.string()),
    error_pattern: z.string(),
    resolution: z.string().optional(),
  }).optional(),
  memory_outcome: z.enum(["pass", "fail"]).optional(),
});

export type ReflexionEntry = z.infer<typeof ReflexionEntrySchema>;

export const ReflexionBankSchema = z.object({
  version: z.literal("1.0.0"),
  entries: z.array(ReflexionEntrySchema),
});

export type ReflexionBank = z.infer<typeof ReflexionBankSchema>;
