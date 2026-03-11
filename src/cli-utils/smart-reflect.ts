// src/cli-utils/smart-reflect.ts
// Tier-aware reflection depth control for the /juhbdi:auto pipeline.

export type GovernanceTier = "micro" | "small" | "medium" | "large";

export interface ReflectDepth {
  /** Whether to extract principles at all */
  extract: boolean;
  /** Whether to dispatch the librarian agent */
  librarian: boolean;
  /** Minimum Jaccard divergence to trigger extraction (0-1) */
  divergenceThreshold: number;
}

/**
 * Whether to attempt reflection at all for a given governance tier.
 * Micro tasks never reflect — too little signal.
 */
export function shouldReflect(tier: GovernanceTier): boolean {
  return tier !== "micro";
}

/**
 * Return the appropriate reflection depth for a tier + task count.
 *
 * - micro: no extraction, no librarian
 * - small: extract only if divergence > 30%, no librarian
 * - medium: full extraction, librarian if 10+ tasks
 * - large: full extraction, always librarian
 */
export function reflectDepth(
  tier: GovernanceTier,
  taskCount: number
): ReflectDepth {
  switch (tier) {
    case "micro":
      return { extract: false, librarian: false, divergenceThreshold: 1.0 };
    case "small":
      return { extract: true, librarian: false, divergenceThreshold: 0.3 };
    case "medium":
      return {
        extract: true,
        librarian: taskCount >= 10,
        divergenceThreshold: 0.3,
      };
    case "large":
      return { extract: true, librarian: true, divergenceThreshold: 0.3 };
  }
}

/**
 * Compute word-level Jaccard distance between planned and actual approach.
 * Returns 0 when identical, 1 when completely different.
 */
export function computeDivergence(planned: string, actual: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0)
    );

  const a = tokenize(planned);
  const b = tokenize(actual);

  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  if (union === 0) return 0;

  const similarity = intersection / union;
  return 1 - similarity;
}

/**
 * Determine the governance tier from a request string.
 * Uses word count + scope-keyword multiplier.
 */
export function classifyTier(request: string): GovernanceTier {
  const words = request.split(/\s+/).filter((w) => w.length > 0);
  const scopeKeywords = ["and", "also", "then", "plus", "additionally"];
  const scopeCount = words.filter((w) =>
    scopeKeywords.includes(w.toLowerCase())
  ).length;
  const score = words.length + scopeCount * 15;

  if (score <= 30) return "micro";
  if (score <= 60) return "small";
  if (score <= 120) return "medium";
  return "large";
}

/**
 * Refine a tier based on actual task count and estimated minutes.
 * Only upgrades — never downgrades from the initial estimate.
 */
export function refineTier(
  initial: GovernanceTier,
  taskCount: number,
  totalMinutes: number
): GovernanceTier {
  let refined: GovernanceTier;
  if (taskCount <= 2 && totalMinutes <= 15) refined = "micro";
  else if (taskCount <= 5 && totalMinutes <= 30) refined = "small";
  else if (taskCount <= 15) refined = "medium";
  else refined = "large";

  const order: GovernanceTier[] = ["micro", "small", "medium", "large"];
  const initialIdx = order.indexOf(initial);
  const refinedIdx = order.indexOf(refined);

  return refinedIdx > initialIdx ? refined : initial;
}
