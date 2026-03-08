// src/memory/retrieve.ts
import type { ExperienceTripletV2 } from "./types";

const CORROBORATION_BOOST = 1.2;

export function retrieveWithContext(
  query: string,
  bank: ExperienceTripletV2[],
  topK: number
): ExperienceTripletV2[] {
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
