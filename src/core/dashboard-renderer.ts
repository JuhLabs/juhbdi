// src/core/dashboard-renderer.ts — Renders BDI dashboard between waves during execution
import {
  renderDashboard,
  renderStatusLine,
  type BDIState,
  type BeliefSnapshot,
  type IntentionSnapshot,
} from "../cli-utils/bdi-dashboard";

/**
 * Build a BDI state object from execution context, suitable for rendering.
 */
export function buildBDIState(
  projectDir: string,
  currentGoal: string,
  currentTaskId: string,
  currentStep: number,
  totalSteps: number,
  status: IntentionSnapshot["status"],
  contextPct: number,
  trustTier: string,
  trustScore: number,
  sessionDurationMs: number,
  actionDescription?: string,
): BDIState {
  const projectName = projectDir.split("/").filter(Boolean).pop() ?? "unknown";
  const beliefs: BeliefSnapshot[] = [
    { category: "project", summary: `Working in ${projectName}` },
    { category: "task", summary: `Step ${currentStep}/${totalSteps}` },
    { category: "memory", summary: `Context at ${Math.round(contextPct)}%` },
  ];

  return {
    beliefs,
    desire: {
      goal: currentGoal,
      task_id: currentTaskId,
      progress_pct:
        totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0,
    },
    intention: {
      action: actionDescription ?? `${status} step ${currentStep}/${totalSteps}`,
      step: currentStep,
      total_steps: totalSteps,
      status,
    },
    context_pct: contextPct,
    trust_tier: trustTier,
    trust_score: trustScore,
    session_duration_ms: sessionDurationMs,
  };
}

// Re-export dashboard rendering functions for convenience
export { renderDashboard, renderStatusLine };
