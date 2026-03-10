// Tool Performance Beliefs
// Research: ToolMem (track tool success per task type), ToolRLA (argument errors dominate)
// Tracks which tools succeed/fail for which task types

export interface ToolBelief {
  tool_name: string;
  task_type: string; // e.g., "file_edit", "test_run", "search"
  attempts: number;
  successes: number;
  failures: number;
  avg_duration_ms: number;
  recent_errors: string[]; // 3 most recent error patterns
  last_used: string;
}

export interface ToolBeliefStore {
  version: "1.0.0";
  beliefs: ToolBelief[];
  updated: string;
}

export function createEmptyStore(): ToolBeliefStore {
  return {
    version: "1.0.0",
    beliefs: [],
    updated: new Date().toISOString(),
  };
}

export function recordToolUse(
  store: ToolBeliefStore,
  toolName: string,
  taskType: string,
  success: boolean,
  durationMs: number,
  error?: string
): ToolBeliefStore {
  let belief = store.beliefs.find(b => b.tool_name === toolName && b.task_type === taskType);

  if (!belief) {
    belief = {
      tool_name: toolName,
      task_type: taskType,
      attempts: 0,
      successes: 0,
      failures: 0,
      avg_duration_ms: 0,
      recent_errors: [],
      last_used: new Date().toISOString(),
    };
    store.beliefs.push(belief);
  }

  belief.attempts++;
  if (success) {
    belief.successes++;
  } else {
    belief.failures++;
    if (error) {
      belief.recent_errors.push(error);
      // Keep only 3 most recent
      if (belief.recent_errors.length > 3) {
        belief.recent_errors = belief.recent_errors.slice(-3);
      }
    }
  }

  // Running average duration
  belief.avg_duration_ms = Math.round(
    (belief.avg_duration_ms * (belief.attempts - 1) + durationMs) / belief.attempts
  );
  belief.last_used = new Date().toISOString();
  store.updated = new Date().toISOString();

  return store;
}

export function getToolReliability(store: ToolBeliefStore, toolName: string, taskType: string): number {
  const belief = store.beliefs.find(b => b.tool_name === toolName && b.task_type === taskType);
  if (!belief || belief.attempts === 0) return 0.5; // unknown = neutral
  return belief.successes / belief.attempts;
}

export function suggestAlternativeTool(
  store: ToolBeliefStore,
  failedTool: string,
  taskType: string
): string | null {
  // Find other tools used for same task type with higher reliability
  const candidates = store.beliefs
    .filter(b => b.task_type === taskType && b.tool_name !== failedTool && b.attempts >= 3)
    .sort((a, b) => (b.attempts > 0 ? b.successes / b.attempts : 0) - (a.attempts > 0 ? a.successes / a.attempts : 0));

  return candidates.length > 0 ? candidates[0].tool_name : null;
}

export function getTopTools(store: ToolBeliefStore, taskType: string, limit: number = 3): ToolBelief[] {
  return store.beliefs
    .filter(b => b.task_type === taskType && b.attempts >= 2)
    .sort((a, b) => (b.attempts > 0 ? b.successes / b.attempts : 0) - (a.attempts > 0 ? a.successes / a.attempts : 0))
    .slice(0, limit);
}
