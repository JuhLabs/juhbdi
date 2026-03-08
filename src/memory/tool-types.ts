import { z } from "zod";
import { CrossLinkSchema } from "./types";

export const ToolBankEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  script_path: z.string().min(1),
  language: z.enum(["typescript", "bash", "python"]),
  created_by_task: z.string().min(1),
  usage_count: z.number().int().min(0),
  last_used: z.iso.datetime(),
  status: z.enum(["active", "deprecated", "failed"]),
  keywords: z.array(z.string()),
  related_memories: z.array(CrossLinkSchema),
});

export type ToolBankEntry = z.infer<typeof ToolBankEntrySchema>;

export const ToolBankSchema = z.object({
  version: z.string().default("1.0.0"),
  tools: z.array(ToolBankEntrySchema),
});

export type ToolBank = z.infer<typeof ToolBankSchema>;
