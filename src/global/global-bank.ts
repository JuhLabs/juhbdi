// src/global/global-bank.ts
// Global intelligence bank — cross-project principles, memory, and router calibration
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

// ─── Global Dir Override (for tests) ──────────────────────────────────

let _globalDirOverride: string | null = null;

/** @internal Test helper — override the global directory path */
export function _setGlobalDir(dir: string | null): void {
  _globalDirOverride = dir;
}

function globalDir(): string {
  return _globalDirOverride ?? join(homedir(), ".juhbdi", "global");
}

async function ensureGlobalDir(): Promise<string> {
  const dir = globalDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface RouterCalibration {
  recent_decisions: Array<{
    task_id: string;
    recommended_tier: string;
    actual_tier?: string;
    timestamp: string;
  }>;
  accuracy: number;
  opus_threshold: number;
  haiku_threshold: number;
  total_routed: number;
  updated: string;
}

interface GlobalPrinciple {
  text: string;
  confidence: number;
  times_validated: number;
  times_applied: number;
  domain_tags: string[];
  source_tasks: string[];
  source_project: string;
}

interface GlobalTriplet {
  intent: { task_description: string; domain_tags: string[] };
  experience: { approach: string; test_result: string; strikes_used: number };
  utility: number;
  source_project: string;
}

// ─── Utility Functions ────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function isDuplicate(a: string, b: string, threshold: number = 0.8): boolean {
  return jaccardSimilarity(a, b) > threshold;
}

// ─── File I/O Helpers ─────────────────────────────────────────────────

async function loadJSON<T>(filename: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(globalDir(), filename), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJSON(filename: string, data: unknown): Promise<void> {
  const dir = await ensureGlobalDir();
  await writeFile(join(dir, filename), JSON.stringify(data, null, 2) + "\n");
}

// ─── Principles ───────────────────────────────────────────────────────

export async function promoteGlobalPrinciple(
  principle: {
    text: string;
    confidence: number;
    times_validated: number;
    times_applied: number;
    domain_tags: string[];
    source_tasks: string[];
  },
  sourceProject: string
): Promise<boolean> {
  // Gate: confidence > 0.8 AND times_validated >= 3
  if (principle.confidence <= 0.8 || principle.times_validated < 3) {
    return false;
  }

  const bank = await loadJSON<{ principles: GlobalPrinciple[] }>("principles.json", { principles: [] });

  const entry: GlobalPrinciple = {
    ...principle,
    source_project: sourceProject,
  };

  // Deduplication: find existing with Jaccard > 0.8
  const dupIdx = bank.principles.findIndex((p) => isDuplicate(p.text, entry.text));

  if (dupIdx >= 0) {
    // Keep the one with higher confidence
    if (entry.confidence > bank.principles[dupIdx].confidence) {
      bank.principles[dupIdx] = entry;
    }
  } else {
    bank.principles.push(entry);
  }

  await saveJSON("principles.json", bank);
  return true;
}

export async function queryGlobalPrinciples(
  description: string,
  topK: number = 5
): Promise<Array<{ text: string; confidence: number; relevance: number; source_project: string }>> {
  const bank = await loadJSON<{ principles: GlobalPrinciple[] }>("principles.json", { principles: [] });

  if (bank.principles.length === 0) return [];

  const queryTokens = tokenize(description);
  if (queryTokens.size === 0) return [];

  const scored = bank.principles.map((p) => {
    const entryTokens = tokenize(p.text);
    // Also include domain tags
    for (const tag of p.domain_tags) {
      for (const t of tag.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3)) {
        entryTokens.add(t);
      }
    }

    let overlap = 0;
    for (const w of queryTokens) {
      if (entryTokens.has(w)) overlap++;
    }
    const relevance = overlap / queryTokens.size;

    return {
      text: p.text,
      confidence: p.confidence,
      relevance,
      source_project: p.source_project,
    };
  });

  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.confidence - a.confidence)
    .slice(0, topK);
}

export async function demoteStale(): Promise<number> {
  const bank = await loadJSON<{ principles: GlobalPrinciple[] }>("principles.json", { principles: [] });

  if (bank.principles.length === 0) return 0;

  let removed = 0;

  for (const p of bank.principles) {
    // Only consider principles with sufficient usage
    if (p.times_applied < 5) continue;

    const validationRate = p.times_validated / p.times_applied;
    if (validationRate < 0.2) {
      p.confidence -= 0.1;
    }
  }

  // Remove principles below 0.3
  const before = bank.principles.length;
  bank.principles = bank.principles.filter((p) => p.confidence >= 0.3);
  removed = before - bank.principles.length;

  await saveJSON("principles.json", bank);
  return removed;
}

// ─── Memory ───────────────────────────────────────────────────────────

export async function promoteGlobalMemory(
  triplet: {
    intent: { task_description: string; domain_tags: string[] };
    experience: { approach: string; test_result: string; strikes_used: number };
    utility: number;
  },
  sourceProject: string
): Promise<boolean> {
  // Gate: utility > 0.8, test pass, 0 strikes
  if (triplet.utility <= 0.8) return false;
  if (triplet.experience.test_result !== "pass") return false;
  if (triplet.experience.strikes_used !== 0) return false;

  const bank = await loadJSON<{ triplets: GlobalTriplet[] }>("memory-bank.json", { triplets: [] });

  const entry: GlobalTriplet = {
    ...triplet,
    source_project: sourceProject,
  };

  // Deduplication by task_description
  const dupIdx = bank.triplets.findIndex((t) =>
    isDuplicate(t.intent.task_description, entry.intent.task_description)
  );

  if (dupIdx >= 0) {
    // Keep the one with higher utility
    if (entry.utility > bank.triplets[dupIdx].utility) {
      bank.triplets[dupIdx] = entry;
    }
  } else {
    bank.triplets.push(entry);
  }

  await saveJSON("memory-bank.json", bank);
  return true;
}

export async function queryGlobalMemory(
  description: string,
  topK: number = 5
): Promise<Array<{ task_description: string; approach: string; utility: number; relevance: number; source_project: string }>> {
  const bank = await loadJSON<{ triplets: GlobalTriplet[] }>("memory-bank.json", { triplets: [] });

  if (bank.triplets.length === 0) return [];

  const queryTokens = tokenize(description);
  if (queryTokens.size === 0) return [];

  const scored = bank.triplets.map((t) => {
    const entryTokens = tokenize(t.intent.task_description);
    // Also include domain tags
    for (const tag of t.intent.domain_tags) {
      for (const tok of tag.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3)) {
        entryTokens.add(tok);
      }
    }

    let overlap = 0;
    for (const w of queryTokens) {
      if (entryTokens.has(w)) overlap++;
    }
    const relevance = overlap / queryTokens.size;

    return {
      task_description: t.intent.task_description,
      approach: t.experience.approach,
      utility: t.utility,
      relevance,
      source_project: t.source_project,
    };
  });

  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.utility - a.utility)
    .slice(0, topK);
}

// ─── Router Calibration ──────────────────────────────────────────────

export async function loadGlobalCalibration(): Promise<RouterCalibration | null> {
  return await loadJSON<RouterCalibration | null>("router-calibration.json", null);
}

export async function promoteCalibration(local: RouterCalibration): Promise<void> {
  const existing = await loadGlobalCalibration();

  if (!existing) {
    await saveJSON("router-calibration.json", local);
    return;
  }

  // Merge decisions: append local to global, cap at 20 most recent
  const allDecisions = [...existing.recent_decisions, ...local.recent_decisions];
  const recentDecisions = allDecisions.slice(-20);

  // Recalculate accuracy from merged decisions
  const withActual = recentDecisions.filter((d) => d.actual_tier !== undefined);
  const correct = withActual.filter((d) => d.recommended_tier === d.actual_tier).length;
  const accuracy = withActual.length > 0 ? correct / withActual.length : existing.accuracy;

  // Merge total_routed
  const totalRouted = existing.total_routed + local.total_routed;

  // Adjust thresholds based on accuracy
  let opusThreshold = existing.opus_threshold;
  let haikuThreshold = existing.haiku_threshold;

  if (accuracy < 0.7) {
    opusThreshold -= 3;  // Lower → more tasks go to opus (be more cautious)
    haikuThreshold -= 5; // Lower → fewer tasks go to haiku
  } else if (accuracy > 0.9) {
    opusThreshold += 5;  // Raise → fewer tasks need opus
    haikuThreshold += 3; // Raise → more tasks can use haiku (actually makes it: less negative = tighter = raise)
  }

  const merged: RouterCalibration = {
    recent_decisions: recentDecisions,
    accuracy,
    opus_threshold: opusThreshold,
    haiku_threshold: haikuThreshold,
    total_routed: totalRouted,
    updated: new Date().toISOString(),
  };

  await saveJSON("router-calibration.json", merged);
}
