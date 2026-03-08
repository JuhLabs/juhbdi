import { appendTrailEntry } from "../core/trail.js";

export interface LogDecisionInput {
  description: string;
  reasoning: string;
  alternatives_considered?: string[];
  risk_level?: "low" | "medium" | "high" | "critical";
  outcome?: "approved" | "rejected" | "escalated";
  task_id?: string;
}

export interface LogDecisionResult {
  logged: boolean;
  entry_hash: string;
  timestamp: string;
  chain_length: number;
}

export async function logDecision(
  input: LogDecisionInput,
  trailFilePath: string
): Promise<LogDecisionResult> {
  const entry = await appendTrailEntry(trailFilePath, {
    event_type: "decision",
    task_id: input.task_id,
    description: input.description,
    reasoning: input.reasoning,
    alternatives_considered: input.alternatives_considered ?? [],
    constraint_refs: [],
    outcome: input.outcome ?? "approved",
    risk_level: input.risk_level ?? "low",
  });

  const { readTrail } = await import("../core/trail.js");
  const trail = await readTrail(trailFilePath);

  return {
    logged: true,
    entry_hash: entry.entry_hash ?? "",
    timestamp: entry.timestamp,
    chain_length: trail.length,
  };
}
