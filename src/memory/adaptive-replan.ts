// src/memory/adaptive-replan.ts — Adaptive re-planning: compare outcomes to expectations, trigger re-plan if divergent
import type { ReflexionEntry } from "../schemas/reflexion";
import { tokenize } from "./keywords";

/** What we expect from a step before it runs. */
export interface StepExpectation {
  step_index: number;
  expected_outcome: string; // e.g., "test file created", "function compiles"
  verification_command?: string; // e.g., "bun test src/foo.test.ts"
}

/** What actually happened at a step. */
export interface StepResult {
  step_index: number;
  actual_outcome: string;
  passed: boolean;
  error_output?: string;
}

/**
 * Compute divergence between expected and actual step outcome.
 * Returns 0 (perfect match) to 1 (complete divergence).
 * Combines word overlap (Jaccard-like) with pass/fail signal.
 */
export function computeStepDivergence(
  expected: StepExpectation,
  actual: StepResult,
): number {
  // If the step failed outright, high divergence
  if (!actual.passed) return 0.8;

  const expectedWords = new Set(tokenize(expected.expected_outcome));
  const actualWords = new Set(tokenize(actual.actual_outcome));

  if (expectedWords.size === 0 && actualWords.size === 0) return 0;

  let overlap = 0;
  for (const w of expectedWords) {
    if (actualWords.has(w)) overlap++;
  }

  const union = new Set([...expectedWords, ...actualWords]).size;
  if (union === 0) return 0;

  const textDivergence = 1 - overlap / union;

  return textDivergence;
}

/**
 * Decide whether to re-plan based on divergence and remaining work.
 * More remaining steps = more reason to replan (higher payoff for course correction).
 */
export function shouldReplan(
  divergenceScore: number,
  remainingSteps: number,
  threshold: number = 0.5,
): boolean {
  // Scale threshold down when many steps remain — re-plan is more valuable early
  const adjustedThreshold =
    remainingSteps > 3
      ? threshold * 0.8
      : remainingSteps > 1
        ? threshold
        : threshold * 1.2; // Near the end, only replan on severe divergence

  return divergenceScore >= adjustedThreshold;
}

/**
 * Build context string for the strategist agent to create a re-plan.
 * Includes original plan summary, completed steps, failure details, and relevant reflexions.
 */
export function buildReplanContext(
  originalPlan: string,
  completedSteps: StepResult[],
  failedStep: StepResult,
  reflexions: ReflexionEntry[],
): string {
  const lines: string[] = [];

  lines.push("## Re-Plan Context\n");

  lines.push("### Original Plan");
  lines.push(originalPlan);
  lines.push("");

  lines.push("### Completed Steps");
  if (completedSteps.length === 0) {
    lines.push("No steps completed before failure.");
  } else {
    for (const step of completedSteps) {
      const status = step.passed ? "PASS" : "FAIL";
      lines.push(
        `- Step ${step.step_index}: [${status}] ${step.actual_outcome}`,
      );
    }
  }
  lines.push("");

  lines.push("### Failed Step");
  lines.push(`- Step ${failedStep.step_index}: ${failedStep.actual_outcome}`);
  if (failedStep.error_output) {
    lines.push(`- Error: ${failedStep.error_output.slice(0, 300)}`);
  }
  lines.push("");

  if (reflexions.length > 0) {
    lines.push("### Relevant Past Reflexions");
    for (const r of reflexions) {
      lines.push(`- [${r.outcome}] "${r.task_description}": ${r.lesson}`);
    }
    lines.push("");
  }

  lines.push(
    "### Instructions\nPropose a revised plan that addresses the failure while preserving completed work.",
  );

  return lines.join("\n");
}
