// Time Guard — 35-Minute Auto-Decomposition
// Research: Zylos 2026 — success decreases after 35 minutes
// Doubling duration quadruples failure rate
// Solution: auto-decompose tasks estimated > 35 minutes

const MAX_TASK_MINUTES = 35;
const WARNING_MINUTES = 25;

export interface TimeEstimate {
  estimated_minutes: number;
  should_decompose: boolean;
  suggested_subtasks: number;
  warning: string | null;
}

export function estimateTaskTime(
  fileCount: number,
  complexity: number, // 0-1
  hasTests: boolean,
  isRefactor: boolean
): TimeEstimate {
  // Clamp inputs to valid ranges
  fileCount = Math.max(0, fileCount);
  complexity = Math.max(0, Math.min(1, complexity));

  // Base: 5 min per file, adjusted by complexity
  let minutes = fileCount * 5 * (0.5 + complexity);

  // Test writing adds ~40%
  if (hasTests) minutes *= 1.4;

  // Refactoring is ~30% slower (understanding existing code)
  if (isRefactor) minutes *= 1.3;

  const shouldDecompose = minutes > MAX_TASK_MINUTES;
  const subtasks = shouldDecompose ? Math.ceil(minutes / (MAX_TASK_MINUTES * 0.7)) : 1;

  let warning: string | null = null;
  if (minutes > MAX_TASK_MINUTES) {
    warning = `Task estimated at ${Math.round(minutes)} minutes (limit: ${MAX_TASK_MINUTES}). ` +
      `Recommend decomposing into ${subtasks} subtasks to avoid quality degradation.`;
  } else if (minutes > WARNING_MINUTES) {
    warning = `Task estimated at ${Math.round(minutes)} minutes. Approaching 35-minute threshold.`;
  }

  return {
    estimated_minutes: Math.round(minutes),
    should_decompose: shouldDecompose,
    suggested_subtasks: subtasks,
    warning,
  };
}

// Runtime timer: check elapsed time during task execution
export function checkTaskDuration(
  startTime: number,
  now: number = Date.now()
): { elapsed_minutes: number; overtime: boolean; warning: string | null } {
  const elapsed = (now - startTime) / (1000 * 60);

  if (elapsed > MAX_TASK_MINUTES) {
    return {
      elapsed_minutes: Math.round(elapsed),
      overtime: true,
      warning: `Task has been running ${Math.round(elapsed)} minutes (limit: ${MAX_TASK_MINUTES}). ` +
        `Quality degradation expected. Consider checkpointing and splitting remaining work.`,
    };
  }

  if (elapsed > WARNING_MINUTES) {
    return {
      elapsed_minutes: Math.round(elapsed),
      overtime: false,
      warning: `Task at ${Math.round(elapsed)} minutes. ${Math.round(MAX_TASK_MINUTES - elapsed)} minutes remaining before quality threshold.`,
    };
  }

  return { elapsed_minutes: Math.round(elapsed), overtime: false, warning: null };
}

export { MAX_TASK_MINUTES, WARNING_MINUTES };
