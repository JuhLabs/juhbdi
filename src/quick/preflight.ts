import type { QuickTask } from "./types";
import type { TradeoffWeights } from "../schemas/intent-spec";
import type { ExperienceTriplet } from "../schemas/memory";
import type { CostEstimate } from "../schemas/model-route";
import { quickGovernanceCheck } from "./govern";
import { routeTask, estimateCost } from "../cli-utils/model-router";
import { rankByRelevance } from "../cli-utils/memory";

export interface PreflightConfig {
  tradeoffs: TradeoffWeights;
  memoryTriplets: ExperienceTriplet[];
}

export interface PreflightResult {
  approved: boolean;
  violations: string[];
  recommended_tier: "haiku" | "sonnet" | "opus";
  confidence: number;
  memory_matches: ExperienceTriplet[];
  cost_estimate?: CostEstimate;
  route_signals: Record<string, unknown>;
}

export function computePreflight(
  task: QuickTask,
  config: PreflightConfig
): PreflightResult {
  const govResult = quickGovernanceCheck(task.description);
  if (!govResult.allowed) {
    return {
      approved: false,
      violations: govResult.violations,
      recommended_tier: "sonnet",
      confidence: 0,
      memory_matches: [],
      route_signals: {},
    };
  }

  const memory_matches = rankByRelevance(config.memoryTriplets, task.description, 3);

  const pseudoTask = {
    id: task.id,
    description: task.description,
    goal_refs: [] as string[],
    status: "pending" as const,
    verification: task.verification as { type: "test" | "lint" | "manual"; command?: string },
    retry_count: 0,
    model_tier: "auto" as const,
  };

  const route = routeTask(pseudoTask, config.tradeoffs, config.memoryTriplets);
  const cost_estimate = estimateCost(pseudoTask, route.recommended_tier);

  return {
    approved: true,
    violations: [],
    recommended_tier: route.recommended_tier,
    confidence: route.confidence,
    memory_matches,
    cost_estimate,
    route_signals: route.signals,
  };
}

if (import.meta.main) {
  const description = process.argv[2];
  if (!description) {
    console.error(JSON.stringify({ error: "Usage: preflight.ts <task_description>" }));
    process.exit(1);
  }

  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const { findProjectRoot, JUHBDI_DIR } = await import("../core/config");
  const { MemoryBankSchema } = await import("../schemas/memory");
  const { QuickTaskSchema, DEFAULT_TRADEOFFS } = await import("./types");

  const cwd = process.cwd();
  const projectRoot = await findProjectRoot(cwd);

  let tradeoffs = { ...DEFAULT_TRADEOFFS };
  let memoryTriplets: ExperienceTriplet[] = [];

  if (projectRoot) {
    const juhbdiDir = join(projectRoot, JUHBDI_DIR);
    try {
      const specRaw = await readFile(join(juhbdiDir, "intent-spec.json"), "utf-8");
      const spec = JSON.parse(specRaw);
      if (spec.tradeoff_weights) tradeoffs = spec.tradeoff_weights;
    } catch { /* use defaults */ }

    try {
      const memRaw = await readFile(join(juhbdiDir, "memory-bank.json"), "utf-8");
      const bank = MemoryBankSchema.parse(JSON.parse(memRaw));
      memoryTriplets = bank.triplets;
    } catch { /* empty memory */ }
  }

  const task = QuickTaskSchema.parse({ description });
  const result = computePreflight(task, { tradeoffs, memoryTriplets });
  console.log(JSON.stringify({ ...result, task_id: task.id }));
}
