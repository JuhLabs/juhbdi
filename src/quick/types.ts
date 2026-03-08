import { z } from "zod";

function generateQuickId(): string {
  return `quick-${Date.now().toString(36)}`;
}

export const QuickTaskSchema = z.object({
  id: z.string().min(1).default(generateQuickId),
  description: z.string().min(1),
  verification: z.object({
    type: z.enum(["test", "lint", "manual"]).default("test"),
    command: z.string().optional(),
  }).default({ type: "test" }),
});

export const QuickResultSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  approach: z.string().min(1),
  files_modified: z.array(z.string()),
  model_tier: z.enum(["haiku", "sonnet", "opus"]),
  error: z.string().optional(),
});

export type QuickTask = z.infer<typeof QuickTaskSchema>;
export type QuickResult = z.infer<typeof QuickResultSchema>;

export const DEFAULT_TRADEOFFS = {
  security: 0.7,
  performance: 0.5,
  speed: 0.5,
  quality: 0.5,
} as const;
