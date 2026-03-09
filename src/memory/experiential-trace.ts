// src/memory/experiential-trace.ts — Store and retrieve successful execution traces (CORPGEN pattern)
import { tokenize } from "./keywords";

/** A single step in an execution trace. */
export interface TraceStep {
  action: "read" | "write" | "edit" | "test" | "search";
  target: string; // file path or search query
  summary: string; // what was done and why
}

/** A full execution trace from a completed task. */
export interface ExecutionTrace {
  task_id: string;
  task_description: string;
  domain_tags: string[];
  approach: string;
  steps: TraceStep[];
  files_created: string[];
  files_modified: string[];
  test_command: string;
  test_passed: boolean;
  duration_ms: number;
  timestamp: string;
}

/** On-disk format for the trace store. */
export interface TraceStore {
  version: string;
  traces: ExecutionTrace[];
}

/** Store a successful execution trace. Only stores passing traces. */
export async function storeTrace(
  tracePath: string,
  trace: ExecutionTrace,
): Promise<void> {
  if (!trace.test_passed) return; // Only store successes

  const store = await loadTraceStore(tracePath);

  store.traces.push(trace);
  await Bun.write(tracePath, JSON.stringify(store, null, 2));
}

/** Load all traces from the store file. Returns empty store if missing/invalid. */
export async function loadTraceStore(tracePath: string): Promise<TraceStore> {
  try {
    const file = Bun.file(tracePath);
    const exists = await file.exists();
    if (!exists) return { version: "1.0.0", traces: [] };
    const raw = await file.json();
    if (!raw || !Array.isArray(raw.traces)) return { version: "1.0.0", traces: [] };
    return raw as TraceStore;
  } catch {
    return { version: "1.0.0", traces: [] };
  }
}

/** Retrieve traces similar to a task description by keyword overlap. */
export function retrieveTraces(
  query: string,
  traces: ExecutionTrace[],
  topK: number,
): ExecutionTrace[] {
  if (traces.length === 0) return [];

  const queryWords = new Set(tokenize(query));
  if (queryWords.size === 0) return [];

  const scored: Array<{ trace: ExecutionTrace; score: number }> = [];

  for (const trace of traces) {
    const descWords = tokenize(trace.task_description);
    const descOverlap = descWords.filter((w) => queryWords.has(w)).length;

    const approachWords = tokenize(trace.approach);
    const approachOverlap = approachWords.filter((w) => queryWords.has(w)).length;

    const tagOverlap = trace.domain_tags.filter((t) =>
      queryWords.has(t.toLowerCase()),
    ).length;

    const score =
      queryWords.size > 0
        ? (descOverlap * 2 + approachOverlap + tagOverlap) / (queryWords.size * 4)
        : 0;

    if (score > 0) {
      scored.push({ trace, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.trace);
}

/** Format a single execution trace as a few-shot prompt example. */
export function formatTraceForPrompt(trace: ExecutionTrace): string {
  const lines = [
    `### Trace: ${trace.task_description}`,
    `**Approach**: ${trace.approach}`,
    `**Duration**: ${trace.duration_ms}ms`,
    "",
    "**Steps**:",
  ];

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    lines.push(`${i + 1}. [${step.action}] ${step.target} — ${step.summary}`);
  }

  if (trace.files_created.length > 0) {
    lines.push("", `**Created**: ${trace.files_created.join(", ")}`);
  }
  if (trace.files_modified.length > 0) {
    lines.push(`**Modified**: ${trace.files_modified.join(", ")}`);
  }

  return lines.join("\n");
}
