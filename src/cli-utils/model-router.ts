import type { ModelRoute, ModelTier, RouteContext, CostEstimate, RoutingOutcome } from "../schemas/model-route";
import type { Task } from "../schemas/roadmap-intent";
import type { TradeoffWeights } from "../schemas/intent-spec";
import type { ExperienceTriplet } from "../schemas/memory";

const TIERS: ModelTier[] = ["haiku", "sonnet", "opus"];

// Global calibration cache — loaded once on first call
let _globalCalibrationCache: { opus_threshold: number; haiku_threshold: number } | null = null;
let _globalCalibrationLoaded = false;

/**
 * Attempt to load global router calibration into cache.
 * Called once; result cached for lifetime of process.
 * Non-blocking — if global bank doesn't exist, uses defaults.
 */
export async function initGlobalCalibration(): Promise<void> {
  if (_globalCalibrationLoaded) return;
  _globalCalibrationLoaded = true;
  try {
    const { loadGlobalCalibration } = await import("../global/global-bank");
    const cal = await loadGlobalCalibration();
    if (cal) {
      _globalCalibrationCache = {
        opus_threshold: cal.opus_threshold,
        haiku_threshold: cal.haiku_threshold,
      };
    }
  } catch {
    // Global bank not available — use defaults
  }
}

/** @internal Test helper — reset calibration cache */
export function _resetCalibrationCache(): void {
  _globalCalibrationCache = null;
  _globalCalibrationLoaded = false;
}

const OPUS_KEYWORDS = [
  "architect", "refactor", "security", "migrate", "design",
  "complex", "integrate", "database schema", "overhaul",
];
const HAIKU_KEYWORDS = [
  "rename", "format", "comment", "version", "typo",
  "move", "simple", "update import", "fix lint", "add log",
];

function tierIndex(tier: ModelTier): number {
  return TIERS.indexOf(tier);
}

function bumpTier(tier: ModelTier, steps: number): ModelTier {
  const idx = Math.min(tierIndex(tier) + steps, 2);
  return TIERS[idx];
}

function shiftTier(tier: ModelTier, direction: number): ModelTier {
  const idx = Math.max(0, Math.min(tierIndex(tier) + direction, 2));
  return TIERS[idx];
}

function computeHeuristicScore(description: string): number {
  const lower = description.toLowerCase();
  let score = 0;
  for (const kw of OPUS_KEYWORDS) {
    if (lower.includes(kw)) score += 2;
  }
  for (const kw of HAIKU_KEYWORDS) {
    if (lower.includes(kw)) score -= 2;
  }
  return score;
}

export function computeComplexityScore(
  task: Task,
  context: RouteContext
): number {
  let score = 0;

  // Factor 1: Goal weight (weight 3.0)
  const avgGoalWeight = task.goal_refs.length > 0
    ? task.goal_refs
        .map((ref) => context.goals.find((g) => g.id === ref)?.weight ?? 0.5)
        .reduce((sum, w) => sum + w, 0) / task.goal_refs.length
    : 0.5;
  score += (avgGoalWeight - 0.5) * 2 * 3.0;

  // Factor 2: Verification type (weight 2.0)
  const verScore =
    task.verification.type === "manual" ? 1 :
    task.verification.type === "lint" ? -1 : 0;
  score += verScore * 2.0;

  // Factor 3: Description scope (weight 2.0)
  const words = task.description.split(/\s+/).length;
  const clauses = task.description.split(/,\s*|\s+and\s+|\s+then\s+/).length;
  const scopeScore = Math.min(1, Math.max(-1,
    (clauses - 2) * 0.4 + (words > 20 ? 0.5 : words < 8 ? -0.5 : 0)
  ));
  score += scopeScore * 2.0;

  // Factor 4: Banned approaches count (weight 1.5)
  const banCount = (task.banned_approaches ?? []).length;
  const banScore = Math.min(1, banCount * 0.4);
  score += banScore * 1.5;

  // Factor 5: Wave parallelism (weight 1.0)
  const parallelScore =
    context.wave_task_count >= 4 ? -1 :
    context.wave_task_count === 1 ? 0.5 : 0;
  score += parallelScore * 1.0;

  // Factor 6: Keywords as tiebreaker (weight 0.5)
  const keywordRaw = computeHeuristicScore(task.description);
  const keywordNorm = Math.min(1, Math.max(-1, keywordRaw / 6));
  score += keywordNorm * 0.5;

  // Factor 7: Difficulty estimate (weight 2.5) — from M10 difficulty estimator
  if (context.difficulty !== undefined) {
    const diffScore = (context.difficulty - 0.5) * 2; // normalize: 0.5=neutral, 1=hard, 0=easy
    score += diffScore * 2.5;
  }

  return score;
}

// Anthropic pricing per 1M tokens (March 2026)
const PRICING = {
  haiku:  { input: 0.80,  output: 4.00 },
  sonnet: { input: 3.00,  output: 15.00 },
  opus:   { input: 15.00, output: 75.00 },
} as const;

const VERIFICATION_MULTIPLIER: Record<string, number> = {
  test: 1.5,
  lint: 0.5,
  manual: 1.0,
};

export function estimateCost(
  task: Task,
  chosenTier: ModelTier = "sonnet"
): CostEstimate {
  const baseTokens = Math.max(task.description.length * 10, 500);
  const multiplier = VERIFICATION_MULTIPLIER[task.verification.type] ?? 1.0;
  const totalTokens = Math.round(baseTokens * multiplier);

  const inputTokens = Math.round(totalTokens * 0.4);
  const outputTokens = Math.round(totalTokens * 0.6);

  function costForTier(tier: ModelTier): number {
    const p = PRICING[tier];
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  const tierCosts = {
    haiku: costForTier("haiku"),
    sonnet: costForTier("sonnet"),
    opus: costForTier("opus"),
  };

  return {
    estimated_input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    tier_costs_usd: tierCosts,
    chosen_cost_usd: tierCosts[chosenTier],
    savings_vs_opus_usd: tierCosts.opus - tierCosts[chosenTier],
  };
}

function computeTradeoffBias(weights: TradeoffWeights): {
  bias: "quality" | "balanced" | "speed";
  direction: number;
} {
  const diff = weights.quality - weights.speed;
  if (diff > 0.3) return { bias: "quality", direction: 1 };
  if (diff < -0.3) return { bias: "speed", direction: -1 };
  return { bias: "balanced", direction: 0 };
}

function findMemoryMatch(
  task: Task,
  triplets: ExperienceTriplet[]
): { task_id: string; tier: ModelTier; utility: number } | null {
  const queryWords = new Set(
    task.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  let bestMatch: { task_id: string; tier: ModelTier; utility: number; score: number } | null = null;

  for (const triplet of triplets) {
    if (triplet.experience.test_result !== "pass") continue;
    const modelTier = (triplet.experience.optimal_tier ?? triplet.experience.model_tier) as ModelTier | undefined;
    if (!modelTier) continue;

    const descWords = new Set(
      triplet.intent.task_description.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );

    let overlap = 0;
    for (const word of queryWords) {
      if (descWords.has(word)) overlap += 1;
    }
    const similarity = queryWords.size > 0 ? overlap / queryWords.size : 0;
    const score = similarity * triplet.utility;

    if (score > 0.3 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { task_id: triplet.id, tier: modelTier, utility: triplet.utility, score };
    }
  }

  return bestMatch ? { task_id: bestMatch.task_id, tier: bestMatch.tier, utility: bestMatch.utility } : null;
}

export function computeAccuracy(
  history: RoutingOutcome[]
): { accuracy: number; correct: number; escalated: number; overkill: number; total: number } | null {
  if (history.length === 0) return null;

  const recent = history.slice(-20);
  const correct = recent.filter((o) => o.actual_outcome === "correct").length;
  const escalated = recent.filter((o) => o.actual_outcome === "escalated").length;
  const overkill = recent.filter((o) => o.actual_outcome === "overkill").length;

  return {
    accuracy: correct / recent.length,
    correct,
    escalated,
    overkill,
    total: recent.length,
  };
}

export function inferOptimalTier(
  usedTier: ModelTier,
  passed: boolean,
  strikesUsed: number
): ModelTier | null {
  if (!passed) return null;
  if (strikesUsed > 0) return usedTier;
  const idx = tierIndex(usedTier);
  return idx > 0 ? TIERS[idx - 1] : usedTier;
}

export function routeTask(
  task: Task,
  tradeoffWeights: TradeoffWeights,
  memoryTriplets: ExperienceTriplet[],
  context?: RouteContext
): ModelRoute {
  // Signal 1: User override
  if (task.model_tier && task.model_tier !== "auto") {
    const tier = task.model_tier as ModelTier;
    return {
      task_id: task.id,
      recommended_tier: tier,
      confidence: 1.0,
      signals: {
        override: tier,
        tradeoff_bias: "balanced",
        heuristic_score: 0,
        memory_match: null,
        failure_escalation: false,
      },
      cost_estimate: context ? estimateCost(task, tier) : undefined,
    };
  }

  // Compute all signals
  const heuristicScore = context
    ? computeComplexityScore(task, context)
    : computeHeuristicScore(task.description);
  const { bias: tradeoffBias, direction: tradeoffDirection } = computeTradeoffBias(tradeoffWeights);
  const memoryMatch = findMemoryMatch(task, memoryTriplets);
  const failureEscalation = (task.retry_count ?? 0) > 0;

  // Determine complexity thresholds: local accuracy > global calibration > defaults
  let opusThreshold = _globalCalibrationCache?.opus_threshold ?? 4;
  let haikuThreshold = _globalCalibrationCache?.haiku_threshold ?? -4;
  if (context && context.accuracy_history.length >= 5) {
    // Local accuracy overrides global calibration
    const recent = context.accuracy_history.slice(-20);
    const correctCount = recent.filter((o) => o.actual_outcome === "correct").length;
    const accuracy = correctCount / recent.length;
    if (accuracy < 0.7) {
      opusThreshold = 3;
      haikuThreshold = -5;
    } else if (accuracy > 0.9) {
      opusThreshold = 5;
      haikuThreshold = -3;
    }
  }

  // Start with heuristic/complexity baseline
  let tier: ModelTier = "sonnet";
  let confidence = 0.6;

  if (heuristicScore >= opusThreshold) {
    tier = "opus";
    confidence = 0.6;
  } else if (heuristicScore <= haikuThreshold) {
    tier = "haiku";
    confidence = 0.6;
  }

  // Signal 5: Tradeoff bias shifts baseline
  if (tradeoffDirection !== 0) {
    tier = shiftTier(tier, tradeoffDirection);
    confidence = Math.max(confidence, 0.5);
  }

  // Signal 3: Memory match overrides heuristic (modulated by trust score)
  if (memoryMatch && memoryMatch.utility >= 0.8) {
    tier = memoryMatch.tier;
    const trustModifier = context?.trust_score !== undefined
      ? 0.5 + 0.5 * context.trust_score  // low trust = lower confidence in memory match
      : 1.0;
    confidence = Math.max(confidence, memoryMatch.utility * 0.9 * trustModifier);
  }

  // Signal 2: Failure escalation overrides memory + heuristic
  if (failureEscalation) {
    const retries = task.retry_count ?? 0;
    if (retries >= 2) {
      tier = "opus";
    } else {
      tier = bumpTier(tier, 1);
    }
    confidence = 0.9;
  }

  return {
    task_id: task.id,
    recommended_tier: tier,
    confidence,
    signals: {
      override: null,
      tradeoff_bias: tradeoffBias,
      heuristic_score: heuristicScore,
      memory_match: memoryMatch,
      failure_escalation: failureEscalation,
    },
    cost_estimate: context ? estimateCost(task, tier) : undefined,
  };
}
