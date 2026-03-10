// src/core/execution-wiring.ts — Wires M11 pure functions into the execute loop
// Called by the orchestrator (commands/execute.md) at specific integration points

import {
  generateReflexion,
  appendReflexion,
  loadReflexionBank,
  retrieveReflexions,
  formatReflexionsForPrompt,
  type TaskOutcome,
} from "../memory/reflexion";
import {
  storeTrace,
  loadTraceStore,
  retrieveTraces,
  formatTraceForPrompt,
  type ExecutionTrace,
  type TraceStep,
} from "../memory/experiential-trace";
import {
  computeStepDivergence,
  shouldReplan,
  buildReplanContext,
  type StepExpectation,
  type StepResult,
} from "../memory/adaptive-replan";
import {
  maskObservation,
  truncateTestOutput,
  estimateTokens,
} from "../cli-utils/observation-masking";
import { parseTestOutput, compareSnapshots, shouldRevert } from "../memory/tnr";
import type { TestSnapshot } from "../memory/tnr-types";
import { queryTools } from "../memory/tool-bank";
import { ToolBankSchema } from "../memory/tool-types";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// File paths within .juhbdi/
const REFLEXION_BANK_FILE = "reflexion-bank.json";
const TRACE_STORE_FILE = "execution-traces.json";
const TOOL_BANK_FILE = "tool-bank.json";

// === PRE-TASK INJECTION ===
// Call before dispatching task-executor agent
export async function prepareTaskContext(
  projectDir: string,
  taskDescription: string,
  taskDomain: string[],
): Promise<{
  reflexionContext: string;
  traceContext: string;
  toolSuggestions: string[];
  estimatedTokens: number;
}> {
  const bankPath = join(projectDir, ".juhbdi", REFLEXION_BANK_FILE);
  const tracePath = join(projectDir, ".juhbdi", TRACE_STORE_FILE);
  const toolBankPath = join(projectDir, ".juhbdi", TOOL_BANK_FILE);

  // 1. Retrieve relevant reflexions (failures weighted 1.1x by retrieveReflexions)
  const bank = await loadReflexionBank(bankPath);
  const query = [taskDescription, ...taskDomain].join(" ");
  const relevantReflexions = retrieveReflexions(query, bank, 3);
  const reflexionContext = formatReflexionsForPrompt(relevantReflexions);

  // 2. Retrieve matching experiential traces (success patterns)
  const store = await loadTraceStore(tracePath);
  const relevantTraces = retrieveTraces(query, store.traces, 2);
  const traceContext = relevantTraces
    .map((t) => formatTraceForPrompt(t))
    .join("\n\n");

  // 3. Query tool bank for relevant tools (non-fatal)
  let toolSuggestions: string[] = [];
  try {
    if (existsSync(toolBankPath)) {
      const raw = JSON.parse(readFileSync(toolBankPath, "utf-8"));
      const toolBank = ToolBankSchema.parse(raw);
      const tools = queryTools(taskDescription, toolBank, 3);
      toolSuggestions = tools.map((t) => `${t.name}: ${t.description}`);
    }
  } catch {
    /* non-fatal — tool bank may not exist or be malformed */
  }

  const allContext = reflexionContext + traceContext + toolSuggestions.join("\n");
  const estimatedTkns = estimateTokens(allContext);
  return { reflexionContext, traceContext, toolSuggestions, estimatedTokens: estimatedTkns };
}

// === POST-TASK PROCESSING ===
// Call after task-executor completes (success or failure)
export async function processTaskOutcome(
  projectDir: string,
  taskId: string,
  taskDescription: string,
  domainTags: string[],
  approach: string,
  filesModified: string[],
  testPassed: boolean,
  errorSummary?: string,
  waveId?: string,
  traceData?: {
    steps: TraceStep[];
    files_created: string[];
    test_command: string;
    duration_ms: number;
  },
): Promise<{ reflexionId: string; traceStored: boolean }> {
  const bankPath = join(projectDir, ".juhbdi", REFLEXION_BANK_FILE);
  const tracePath = join(projectDir, ".juhbdi", TRACE_STORE_FILE);

  // 1. Generate reflexion entry
  const outcome: TaskOutcome = {
    task_id: taskId,
    task_description: taskDescription,
    domain_tags: domainTags,
    approach_taken: approach,
    files_modified: filesModified,
    test_passed: testPassed,
    wave_id: waveId,
  };
  const reflexion = generateReflexion(outcome, errorSummary);

  // 2. Append to bank (auto-links related reflexions by keyword overlap)
  await appendReflexion(bankPath, reflexion);

  // 3. Store experiential trace if successful AND we have real trace data
  let traceStored = false;
  if (testPassed && traceData && traceData.duration_ms > 0) {
    const trace: ExecutionTrace = {
      task_id: taskId,
      task_description: taskDescription,
      domain_tags: domainTags,
      approach,
      steps: traceData.steps,
      files_created: traceData.files_created,
      files_modified: filesModified,
      test_command: traceData.test_command,
      test_passed: true,
      duration_ms: traceData.duration_ms,
      timestamp: new Date().toISOString(),
    };
    await storeTrace(tracePath, trace);
    traceStored = true;
  }

  return { reflexionId: reflexion.id, traceStored };
}

// === OBSERVATION PROCESSING ===
// Call on tool outputs before injecting into agent context
export function processObservation(
  rawOutput: string,
  maxLines: number = 50,
  isTestOutput: boolean = false,
): string {
  if (isTestOutput) {
    return truncateTestOutput(rawOutput, maxLines);
  }
  return maskObservation(rawOutput, maxLines, {
    preserveErrors: true,
    preserveStructure: true,
  });
}

// === DIVERGENCE CHECK ===
// Call after each task step to check if re-planning needed
export function checkDivergence(
  expected: StepExpectation,
  actual: StepResult,
  remainingSteps: number,
  originalPlan?: string,
  completedSteps?: StepResult[],
): {
  shouldReplan: boolean;
  divergence: number;
  replanContext?: string;
} {
  const divergence = computeStepDivergence(expected, actual);
  const replan = shouldReplan(divergence, remainingSteps);

  if (replan && originalPlan) {
    // Build re-plan context for the strategist
    const replanCtx = buildReplanContext(
      originalPlan,
      completedSteps ?? [],
      actual,
      [], // reflexions would be loaded separately if needed
    );
    return { shouldReplan: true, divergence, replanContext: replanCtx };
  }

  return { shouldReplan: replan, divergence };
}

// === TEST REGRESSION CHECK ===
// Call after merging task worktree to detect regressions
export function checkTestRegression(
  testOutput: string,
  previousSnapshot?: TestSnapshot,
): { verdict: string; recommendation?: string; snapshot: TestSnapshot } {
  const current = parseTestOutput(testOutput);
  if (!previousSnapshot) return { verdict: "no_baseline", snapshot: current };
  const comparison = compareSnapshots(previousSnapshot, current);
  if (shouldRevert(comparison)) {
    return { verdict: "regressed", recommendation: "revert", snapshot: current };
  }
  return { verdict: comparison.verdict, snapshot: current };
}
