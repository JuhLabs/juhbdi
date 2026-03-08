// src/status/gather.ts
import { readFile } from "fs/promises";
import { join } from "path";
import { parseState } from "../schemas/state";
import { RoadmapIntentSchema } from "../schemas/roadmap-intent";
import type { Task } from "../schemas/roadmap-intent";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import { readTrail } from "../core/trail";
import { detectFailurePatterns as detectPatterns } from "../core/patterns";
import type {
  ProjectStatus,
  BeliefStatus,
  IntentionStatus,
  WaveDetail,
  TrailStatus,
  RecoveryStatus,
  FailurePattern,
} from "./types";

export async function gatherStatus(
  juhbdiDir: string,
  trailPath: string
): Promise<ProjectStatus> {
  const beliefs = await gatherBeliefs(juhbdiDir);
  const intentions = await gatherIntentions(juhbdiDir);
  const trailEntries = await readTrail(trailPath);
  const trail = gatherTrailStatus(trailEntries);

  // Gather recovery info from roadmap tasks + trail
  const allTasks = intentions
    ? intentions.wave_details.length > 0
      ? await getAllTasks(juhbdiDir)
      : []
    : [];
  const recovery = gatherRecoveryStatus(allTasks, trailEntries);

  return { beliefs, intentions, trail, recovery };
}

async function gatherBeliefs(juhbdiDir: string): Promise<BeliefStatus | null> {
  try {
    const stateJson = await readFile(join(juhbdiDir, "state.json"), "utf-8");
    const state = parseState(stateJson);
    return {
      project_name: state.project_name,
      architecture: state.architecture,
      conventions: state.conventions,
      last_updated: state.last_updated,
      active_wave_id: state.active_context?.current_wave?.toString(),
      active_task_id: state.active_context?.current_task,
    };
  } catch {
    return null;
  }
}

async function gatherIntentions(
  juhbdiDir: string
): Promise<IntentionStatus | null> {
  try {
    const raw = await readFile(
      join(juhbdiDir, "roadmap-intent.json"),
      "utf-8"
    );
    const roadmap = RoadmapIntentSchema.parse(JSON.parse(raw));

    const waveDetails: WaveDetail[] = roadmap.waves.map((wave) => ({
      id: wave.id,
      parallel: wave.parallel,
      pending: wave.tasks.filter((t) => t.status === "pending").length,
      running: wave.tasks.filter((t) => t.status === "running").length,
      passed: wave.tasks.filter((t) => t.status === "passed").length,
      failed: wave.tasks.filter((t) => t.status === "failed").length,
      blocked: wave.tasks.filter((t) => t.status === "blocked").length,
    }));

    const totalTasks = roadmap.waves.reduce(
      (sum, w) => sum + w.tasks.length,
      0
    );
    const totalPassed = waveDetails.reduce((sum, w) => sum + w.passed, 0);
    const overallProgress =
      totalTasks > 0 ? Math.round((totalPassed / totalTasks) * 100) : 0;

    return {
      total_waves: roadmap.waves.length,
      total_tasks: totalTasks,
      wave_details: waveDetails,
      overall_progress: overallProgress,
    };
  } catch {
    return null;
  }
}

function gatherTrailStatus(entries: DecisionTrailEntry[]): TrailStatus {
  if (entries.length === 0) {
    return { total_entries: 0 };
  }

  const last = entries[entries.length - 1];
  return {
    total_entries: entries.length,
    latest_entry: {
      event_type: last.event_type,
      description: last.description,
      timestamp: last.timestamp,
    },
  };
}

async function getAllTasks(juhbdiDir: string): Promise<Task[]> {
  try {
    const raw = await readFile(
      join(juhbdiDir, "roadmap-intent.json"),
      "utf-8"
    );
    const roadmap = RoadmapIntentSchema.parse(JSON.parse(raw));
    return roadmap.waves.flatMap((w) => w.tasks);
  } catch {
    return [];
  }
}

function gatherRecoveryStatus(
  tasks: Task[],
  trailEntries: DecisionTrailEntry[]
): RecoveryStatus {
  const tasksWithRetries = tasks.filter((t) => t.retry_count > 0);
  const totalRetries = tasks.reduce((sum, t) => sum + t.retry_count, 0);

  const bannedApproaches = tasks
    .filter((t) => t.banned_approaches && t.banned_approaches.length > 0)
    .map((t) => ({ task_id: t.id, approaches: t.banned_approaches! }));

  const failurePatterns = detectFailurePatterns(tasks, trailEntries);

  return {
    tasks_with_retries: tasksWithRetries.length,
    total_retries: totalRetries,
    banned_approaches: bannedApproaches,
    failure_patterns: failurePatterns,
  };
}

/**
 * Detect failure patterns across tasks. Delegates to shared core module.
 * Kept as exported wrapper for backward compatibility with existing callers.
 */
export function detectFailurePatterns(
  _tasks: Task[],
  trailEntries: DecisionTrailEntry[]
): FailurePattern[] {
  return detectPatterns(trailEntries);
}
