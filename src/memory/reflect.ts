import type { Principle, PrincipleBank } from "./principle-types";

export interface TaskOutcome {
  task_id: string;
  planned_approach: string;
  actual_approach: string;
  description: string;
  domain_tags: string[];
  test_passed: boolean;
  files_modified: string[];
}

export interface WaveResult {
  wave_id: string;
  outcomes: TaskOutcome[];
}

function extractWords(text: string): string[] {
  return text.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3);
}

function computeDivergence(planned: string, actual: string): number {
  const pWords = new Set(extractWords(planned));
  const aWords = new Set(extractWords(actual));
  if (pWords.size === 0 && aWords.size === 0) return 0;
  let overlap = 0;
  for (const w of pWords) if (aWords.has(w)) overlap++;
  const union = new Set([...pWords, ...aWords]).size;
  return union === 0 ? 0 : 1 - overlap / union;
}

function findOverlappingPrinciple(keywords: string[], bank: PrincipleBank): Principle | null {
  const kwSet = new Set(keywords);
  let best: { principle: Principle; overlap: number } | null = null;
  for (const p of bank.principles) {
    let overlap = 0;
    for (const kw of p.keywords) if (kwSet.has(kw)) overlap++;
    const ratio = p.keywords.length > 0 ? overlap / p.keywords.length : 0;
    if (ratio > 0.4 && (!best || overlap > best.overlap)) {
      best = { principle: p, overlap };
    }
  }
  return best?.principle ?? null;
}

const DIVERGENCE_THRESHOLD = 0.3;

export function extractPrinciples(waveResult: WaveResult, existingBank: PrincipleBank): Principle[] {
  const results: Principle[] = [];

  for (const outcome of waveResult.outcomes) {
    if (!outcome.test_passed) continue;
    const divergence = computeDivergence(outcome.planned_approach, outcome.actual_approach);
    if (divergence < DIVERGENCE_THRESHOLD) continue;

    const keywords = [...new Set([
      ...extractWords(outcome.description),
      ...extractWords(outcome.actual_approach),
      ...outcome.domain_tags.map((t) => t.toLowerCase()),
    ])];

    const existing = findOverlappingPrinciple(keywords, existingBank);

    if (existing) {
      results.push({
        ...existing,
        confidence: Math.min(1, existing.confidence + 0.05),
        source_tasks: [...new Set([...existing.source_tasks, outcome.task_id])],
        times_validated: existing.times_validated + 1,
      });
    } else {
      results.push({
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2)}-${outcome.task_id}`,
        principle: `When "${outcome.planned_approach}" was planned, "${outcome.actual_approach}" worked better for: ${outcome.description}`,
        source_tasks: [outcome.task_id],
        confidence: 0.5 + divergence * 0.3,
        times_applied: 0,
        times_validated: 1,
        domain_tags: outcome.domain_tags,
        keywords,
        created_at: new Date().toISOString(),
      });
    }
  }

  return results;
}
