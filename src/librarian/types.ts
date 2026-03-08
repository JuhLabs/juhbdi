// src/librarian/types.ts
import { z } from "zod";
import type { State } from "../schemas/state";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import type { RoadmapIntent } from "../schemas/roadmap-intent";

export interface ExecutionSummary {
  status: "success" | "partial" | "error";
  tasks_passed: number;
  tasks_failed: number;
  tasks_skipped: number;
  error?: string;
}

export interface LibrarianConfig {
  model: string;
  max_tokens: number;
}

export interface CompressionInput {
  current_state: State;
  execution_summary: ExecutionSummary;
  trail_entries: DecisionTrailEntry[];
  roadmap: RoadmapIntent;
}

export const CompressionResultSchema = z.object({
  compressed_history: z.string().min(1),
  updated_conventions: z.array(z.string()),
  architecture_updates: z.string(),
});

export type CompressionResult = z.infer<typeof CompressionResultSchema>;
