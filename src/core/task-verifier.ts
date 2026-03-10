// src/core/task-verifier.ts — Wraps verifier chain for use in the execute loop
import {
  runVerifierChain,
  getDefaultChain,
  formatChainResults,
  type ChainResult,
} from "./verifier-chain";

export interface TaskVerificationResult {
  allPassed: boolean;
  summary: string;
  trailFields: {
    all_passed: boolean;
    steps_run: number;
    failed_at?: string;
    duration_ms: number;
  };
  /** Full chain result for detailed inspection */
  chainResult: ChainResult;
}

/**
 * Run the verifier chain (typecheck -> lint -> test -> build) on a project.
 * Returns a structured result for trail recording and decision-making.
 */
export async function verifyTask(
  projectDir: string,
): Promise<TaskVerificationResult> {
  const chain = getDefaultChain(projectDir);
  const result = await runVerifierChain(chain, projectDir);
  return {
    allPassed: result.all_passed,
    summary: formatChainResults(result),
    trailFields: {
      all_passed: result.all_passed,
      steps_run: result.results.length,
      failed_at: result.failed_at,
      duration_ms: result.total_duration_ms,
    },
    chainResult: result,
  };
}
