// src/core/patterns.ts
import type { DecisionTrailEntry } from "../schemas/decision-trail";

export interface FailurePattern {
  pattern: string;
  occurrences: number;
  task_ids: string[];
}

export function detectFailurePatterns(
  trailEntries: DecisionTrailEntry[]
): FailurePattern[] {
  const recoveryEntries = trailEntries.filter(
    (e) => e.event_type === "recovery" && e.task_id
  );

  if (recoveryEntries.length < 2) return [];

  // Group failure descriptions by task
  const failuresByTask = new Map<string, string[]>();
  for (const entry of recoveryEntries) {
    const taskId = entry.task_id!;
    if (!failuresByTask.has(taskId)) failuresByTask.set(taskId, []);
    failuresByTask.get(taskId)!.push(entry.description);
  }

  // Need 2+ tasks with failures to detect cross-task patterns
  if (failuresByTask.size < 2) return [];

  // Find common word phrases across different tasks' failure descriptions
  const patternMap = new Map<string, Set<string>>();
  const allDescriptions = recoveryEntries.map((e) => ({
    taskId: e.task_id!,
    desc: e.description,
  }));

  for (const { taskId, desc } of allDescriptions) {
    const words = desc.split(/\s+/);
    for (let len = 3; len <= Math.min(8, words.length); len++) {
      for (let start = 0; start <= words.length - len; start++) {
        const phrase = words.slice(start, start + len).join(" ");
        if (phrase.length >= 15) {
          if (!patternMap.has(phrase)) patternMap.set(phrase, new Set());
          patternMap.get(phrase)!.add(taskId);
        }
      }
    }
  }

  // Filter to patterns that appear in 2+ different tasks
  const results: FailurePattern[] = [];
  for (const [pattern, taskIds] of patternMap) {
    if (taskIds.size >= 2) {
      results.push({
        pattern,
        occurrences: taskIds.size,
        task_ids: [...taskIds].sort(),
      });
    }
  }

  // Sort by occurrences desc, then by pattern length desc (more specific first)
  results.sort(
    (a, b) => b.occurrences - a.occurrences || b.pattern.length - a.pattern.length
  );

  // Deduplicate: keep longer patterns that cover same tasks
  const deduped: FailurePattern[] = [];
  for (const fp of results) {
    const taskSet = new Set(fp.task_ids);
    const alreadyCovered = deduped.some((existing) => {
      const existingSet = new Set(existing.task_ids);
      if (taskSet.size > existingSet.size) return false;
      return fp.task_ids.every((id) => existingSet.has(id)) &&
        existing.pattern.includes(fp.pattern);
    });
    if (!alreadyCovered) deduped.push(fp);
  }

  return deduped;
}
