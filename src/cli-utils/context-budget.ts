// src/cli-utils/context-budget.ts
// Pre-flight context budget estimation for execution pipelines.
// Prevents wasted work by checking if a pipeline will fit in remaining context.

export interface BudgetEstimate {
  /** Estimated tokens per task (prompt + response) */
  tokens_per_task: number;
  /** Total estimated tokens for the pipeline */
  total_estimated_tokens: number;
  /** Percentage of remaining context this pipeline will consume */
  estimated_usage_pct: number;
  /** Whether the pipeline will likely fit */
  fits: boolean;
  /** Warning message if tight or won't fit */
  warning: string | null;
}

// Average tokens per task by verification type
const TOKENS_BY_VERIFICATION: Record<string, number> = {
  test: 8000,
  lint: 3000,
  manual: 5000,
};

// Overhead per wave (context check, routing, beliefs, etc.)
const WAVE_OVERHEAD_TOKENS = 2000;

// Fixed overhead (command prompt, state loading, etc.)
const PIPELINE_OVERHEAD_TOKENS = 6000;

/**
 * Estimate how much context a pipeline will consume.
 *
 * @param taskCount - Number of tasks in the pipeline
 * @param waveCount - Number of waves
 * @param verificationTypes - Array of verification types per task
 * @param remainingPct - Current remaining context percentage (0-100)
 * @param totalContextTokens - Total context window size (default 200k)
 */
export function estimateBudget(
  taskCount: number,
  waveCount: number,
  verificationTypes: string[],
  remainingPct: number,
  totalContextTokens: number = 200000
): BudgetEstimate {
  const taskTokens = verificationTypes.reduce(
    (sum, type) => sum + (TOKENS_BY_VERIFICATION[type] ?? 5000),
    0
  );
  const waveTokens = waveCount * WAVE_OVERHEAD_TOKENS;
  const totalEstimated = PIPELINE_OVERHEAD_TOKENS + taskTokens + waveTokens;

  const remainingTokens = (remainingPct / 100) * totalContextTokens;
  const usagePct = (totalEstimated / remainingTokens) * 100;
  const fits = usagePct < 85;

  let warning: string | null = null;
  if (usagePct >= 100) {
    warning = `Pipeline needs ~${Math.round(totalEstimated / 1000)}k tokens but only ~${Math.round(remainingTokens / 1000)}k remain. Will likely exhaust context. Consider splitting into smaller batches.`;
  } else if (usagePct >= 70) {
    warning = `Pipeline will use ~${Math.round(usagePct)}% of remaining context. May need to pause mid-execution.`;
  }

  return {
    tokens_per_task: taskCount > 0 ? Math.round(taskTokens / taskCount) : 0,
    total_estimated_tokens: totalEstimated,
    estimated_usage_pct: Math.round(usagePct),
    fits,
    warning,
  };
}

/**
 * Read remaining context percentage from the bridge file.
 * Returns null if bridge file doesn't exist.
 */
export async function readContextBridge(): Promise<number | null> {
  const { readdir, readFile } = await import("fs/promises");
  try {
    const files = await readdir("/tmp");
    const bridge = files.find(
      (f) => f.startsWith("juhbdi-ctx-") && f.endsWith(".json")
    );
    if (!bridge) return null;
    const raw = await readFile(`/tmp/${bridge}`, "utf-8");
    const data = JSON.parse(raw);
    return typeof data.remaining_pct === "number" ? data.remaining_pct : null;
  } catch {
    return null;
  }
}
