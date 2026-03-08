// src/trail/filter.ts
import type { DecisionTrailEntry } from "../schemas/decision-trail";

export interface TrailFilter {
  /** Filter by event_type */
  type?: string;
  /** Return only the N most recent entries (after other filters) */
  last?: number;
  /** Filter by task_id */
  task_id?: string;
  /** Filter by wave_id */
  wave_id?: string;
}

/**
 * Filters decision trail entries by the given criteria and returns
 * matching entries sorted by timestamp descending, limited by `last`.
 *
 * All filter fields are optional and combined with AND logic.
 * Entries missing an optional field (task_id, wave_id) will not
 * match filters on that field.
 */
export function filterTrail(
  entries: DecisionTrailEntry[],
  filter: TrailFilter,
): DecisionTrailEntry[] {
  let result = entries;

  if (filter.type) {
    result = result.filter(e => e.event_type === filter.type);
  }

  if (filter.task_id) {
    result = result.filter(e => e.task_id === filter.task_id);
  }

  if (filter.wave_id) {
    result = result.filter(e => e.wave_id === filter.wave_id);
  }

  // Sort by timestamp descending (most recent first)
  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply limit
  if (filter.last !== undefined && filter.last > 0) {
    result = result.slice(0, filter.last);
  }

  return result;
}
