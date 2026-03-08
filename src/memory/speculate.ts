import type { ExperienceTripletV2 } from "./types";
import type { Principle } from "./principle-types";

export interface SpeculationResult {
  recommended_approach: string | null;
  warnings: string[];
  principles: Principle[];
  confidence: number;
  source: "memory" | "principles" | "both" | "warnings" | "none";
  source_task_ids: string[];
}

function extractWords(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap / a.size;
}

const MATCH_THRESHOLD = 0.3;
const PRINCIPLE_THRESHOLD = 0.25;

export function speculate(
  taskDescription: string,
  triplets: ExperienceTripletV2[],
  principles: Principle[]
): SpeculationResult | null {
  const queryWords = extractWords(taskDescription);
  const warnings: string[] = [];
  let bestMatch: { triplet: ExperienceTripletV2; score: number } | null = null;
  const sourceIds: string[] = [];

  for (const t of triplets) {
    const descWords = extractWords(t.intent.task_description);
    const kwWords = new Set(t.keywords.map((k) => k.toLowerCase()));
    const combined = new Set([...descWords, ...kwWords]);
    const score = similarity(queryWords, combined);

    if (score < MATCH_THRESHOLD) continue;

    if (t.experience.test_result === "fail") {
      warnings.push(
        `Past failure: "${t.experience.approach}" failed for similar task "${t.intent.task_description}". ${
          t.experience.banned_approaches.length > 0
            ? `Banned: ${t.experience.banned_approaches.join(", ")}`
            : ""
        }`
      );
      sourceIds.push(t.id);
      continue;
    }

    const weightedScore = score * t.utility;
    if (!bestMatch || weightedScore > bestMatch.score) {
      bestMatch = { triplet: t, score: weightedScore };
    }
  }

  const matchedPrinciples: Principle[] = [];
  for (const p of principles) {
    const pWords = new Set(p.keywords.map((k) => k.toLowerCase()));
    const score = similarity(queryWords, pWords);
    if (score >= PRINCIPLE_THRESHOLD && p.confidence >= 0.5) {
      matchedPrinciples.push(p);
    }
  }

  const hasMemory = bestMatch !== null;
  const hasPrinciples = matchedPrinciples.length > 0;
  const hasWarnings = warnings.length > 0;

  if (!hasMemory && !hasPrinciples && !hasWarnings) return null;

  const source: SpeculationResult["source"] =
    hasMemory && hasPrinciples ? "both" : hasMemory ? "memory" : hasPrinciples ? "principles" : hasWarnings ? "warnings" : "none";

  if (bestMatch) sourceIds.push(bestMatch.triplet.id);

  return {
    recommended_approach: bestMatch?.triplet.experience.approach ?? null,
    warnings,
    principles: matchedPrinciples.sort((a, b) => b.confidence - a.confidence),
    confidence: bestMatch?.score ?? (matchedPrinciples[0]?.confidence ?? 0.5),
    source,
    source_task_ids: sourceIds,
  };
}
