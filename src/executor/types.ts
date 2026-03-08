// src/executor/types.ts
import { z } from "zod";

const FileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  action: z.enum(["create", "modify", "delete"]),
});

export const TaskOutputSchema = z.object({
  approach: z.string().min(1),
  files: z.array(FileWriteSchema),
  test_command: z.string().min(1),
  reasoning: z.string().min(1),
});

export const IntentCheckSchema = z.object({
  passed: z.boolean(),
  violations: z.array(z.string()),
});

export const TaskExecutionResultSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  approach: z.string().optional(),
  test_output: z.string().optional(),
  error: z.string().optional(),
});

export const ExecutorConfigSchema = z.object({
  model: z.string().min(1),
  max_retries: z.number().int().positive().default(3),
  codegen_max_tokens: z.number().int().positive().default(8192),
  test_timeout_ms: z.number().int().positive().default(60000),
});

export type FileWrite = z.infer<typeof FileWriteSchema>;
export type TaskOutput = z.infer<typeof TaskOutputSchema>;
export type IntentCheck = z.infer<typeof IntentCheckSchema>;
export type TaskExecutionResult = z.infer<typeof TaskExecutionResultSchema>;
export type ExecutorConfig = z.infer<typeof ExecutorConfigSchema>;
