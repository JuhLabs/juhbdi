import type { ExperienceTriplet, CrossLink, Principle } from "./schemas.js";

// ── Keywords ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "this", "that", "has", "had", "not", "all", "can", "will", "its",
  "use", "used", "using", "into", "each", "also", "been", "have",
]);

const MAX_KEYWORDS = 20;
const MIN_WORD_LENGTH = 3;

export function extractKeywords(triplet: ExperienceTriplet): string[] {
  const sources: string[] = [
    triplet.intent.task_description,
    triplet.experience.approach,
    ...triplet.intent.domain_tags,
    ...extractPathSegments(triplet.experience.files_modified),
  ];

  const words = sources
    .join(" ")
    .toLowerCase()
    .split(/[\s/\\._\-]+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w));

  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

function extractPathSegments(paths: string[]): string[] {
  return paths.flatMap((p) => {
    const parts = p.split("/");
    return parts
      .map((seg) => seg.replace(/\.[^.]+$/, ""))
      .filter((seg) => seg.length >= MIN_WORD_LENGTH);
  });
}

// ── Cross-Linking ───────────────────────────────────────────

const MAX_LINKS = 10;
const MIN_STRENGTH = 0.1;

export function findRelated(target: ExperienceTriplet, existing: ExperienceTriplet[]): CrossLink[] {
  const targetKeywords = new Set(target.keywords);
  const targetFiles = new Set(target.experience.files_modified);
  const targetTags = new Set(target.intent.domain_tags);
  const scored: Array<{ id: string; strength: number; relation: string }> = [];

  for (const mem of existing) {
    if (mem.id === target.id) continue;
    let score = 0;
    let relation = "related";

    const kwOverlap = mem.keywords.filter((k) => targetKeywords.has(k)).length;
    const kwTotal = Math.max(targetKeywords.size, 1);
    const kwScore = kwOverlap / kwTotal;
    if (kwScore > 0) { score += kwScore * 0.5; relation = "similar_keywords"; }

    const fileOverlap = mem.experience.files_modified.filter((f) => targetFiles.has(f)).length;
    if (fileOverlap > 0) { score += 0.3 * Math.min(fileOverlap / Math.max(targetFiles.size, 1), 1); relation = "shared_files"; }

    const tagOverlap = mem.intent.domain_tags.filter((t) => targetTags.has(t)).length;
    if (tagOverlap > 0) { score += 0.2 * Math.min(tagOverlap / Math.max(targetTags.size, 1), 1); relation = kwScore > 0 ? "similar_keywords" : "shared_domain"; }

    if (score >= MIN_STRENGTH) scored.push({ id: mem.id, strength: Math.round(score * 100) / 100, relation });
  }

  scored.sort((a, b) => b.strength - a.strength);
  return scored.slice(0, MAX_LINKS);
}

// ── Retrieval ───────────────────────────────────────────────

const CORROBORATION_BOOST = 1.2;

export function retrieveWithContext(
  query: string,
  bank: ExperienceTriplet[],
  topK: number
): ExperienceTriplet[] {
  const passing = bank.filter((t) => t.experience.test_result === "pass");
  if (passing.length === 0) return [];

  const queryWords = new Set(
    query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  );

  const scores = new Map<string, number>();
  for (const triplet of passing) {
    const kwOverlap = triplet.keywords.filter((k) => queryWords.has(k)).length;
    const descWords = triplet.intent.task_description.toLowerCase().split(/\s+/);
    const descOverlap = descWords.filter((w) => queryWords.has(w)).length;

    const similarity = queryWords.size > 0
      ? (kwOverlap * 2 + descOverlap) / (queryWords.size * 3)
      : 0;

    let score = similarity * triplet.utility;

    if (triplet.related_memories.length >= 2) {
      score *= CORROBORATION_BOOST;
    }

    if (score > 0) {
      scores.set(triplet.id, score);
    }
  }

  const directMatchIds = new Set(scores.keys());
  for (const triplet of passing) {
    if (!directMatchIds.has(triplet.id)) continue;
    for (const link of triplet.related_memories) {
      if (scores.has(link.id)) continue;
      const neighbor = passing.find((t) => t.id === link.id);
      if (neighbor) {
        const parentScore = scores.get(triplet.id)!;
        scores.set(link.id, parentScore * link.strength * 0.5);
      }
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => passing.find((t) => t.id === id)!)
    .filter(Boolean);

  return ranked;
}

// ── Speculation ─────────────────────────────────────────────

export interface SpeculationResult {
  recommended_approach: string | null;
  warnings: string[];
  principles: Principle[];
  confidence: number;
  source: "memory" | "principles" | "both" | "none";
  source_task_ids: string[];
}

function extractWords(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3));
}

function wordSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap / a.size;
}

const MATCH_THRESHOLD = 0.3;
const PRINCIPLE_THRESHOLD = 0.25;

export function speculate(
  taskDescription: string,
  triplets: ExperienceTriplet[],
  principles: Principle[]
): SpeculationResult | null {
  const queryWords = extractWords(taskDescription);
  const warnings: string[] = [];
  let bestMatch: { triplet: ExperienceTriplet; score: number } | null = null;
  const sourceIds: string[] = [];

  for (const t of triplets) {
    const descWords = extractWords(t.intent.task_description);
    const kwWords = new Set(t.keywords.map((k) => k.toLowerCase()));
    const combined = new Set([...descWords, ...kwWords]);
    const score = wordSimilarity(queryWords, combined);

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
    const score = wordSimilarity(queryWords, pWords);
    if (score >= PRINCIPLE_THRESHOLD && p.confidence >= 0.5) {
      matchedPrinciples.push(p);
    }
  }

  const hasMemory = bestMatch !== null;
  const hasPrinciples = matchedPrinciples.length > 0;
  const hasWarnings = warnings.length > 0;

  if (!hasMemory && !hasPrinciples && !hasWarnings) return null;

  const source: SpeculationResult["source"] =
    hasMemory && hasPrinciples ? "both" : hasMemory ? "memory" : hasPrinciples ? "principles" : "none";

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
