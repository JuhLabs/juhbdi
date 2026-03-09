// src/memory/reflexion.ts — Reflexion memory bank: store and retrieve execution reflections
import {
  ReflexionBankSchema,
  type ReflexionBank,
  type ReflexionEntry,
} from "../schemas/reflexion";
import { tokenize, MAX_KEYWORDS } from "./keywords";

/** Inputs needed to generate a reflexion from a task outcome. */
export interface TaskOutcome {
  task_id: string;
  task_description: string;
  domain_tags: string[];
  approach_taken: string;
  files_modified: string[];
  test_passed: boolean;
  wave_id?: string;
}

/** Extract keywords from text fragments, filtering stop words and short tokens. */
function extractKeywordsFromTexts(texts: string[]): string[] {
  const words = tokenize(texts.join(" "));
  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

/** Generate a reflexion entry from a task outcome and optional error output. */
export function generateReflexion(
  outcome: TaskOutcome,
  errorOutput?: string,
): ReflexionEntry {
  const outcomeEnum = outcome.test_passed ? "success" : "failure";

  const reflection = outcome.test_passed
    ? `Task "${outcome.task_description}" succeeded using approach: ${outcome.approach_taken}. Modified ${outcome.files_modified.length} file(s).`
    : `Task "${outcome.task_description}" failed. Approach: ${outcome.approach_taken}. Error: ${errorOutput ?? "unknown"}.`;

  const lesson = outcome.test_passed
    ? `Approach "${outcome.approach_taken}" works well for tasks like "${outcome.task_description}". Reuse this pattern.`
    : `Avoid approach "${outcome.approach_taken}" for tasks like "${outcome.task_description}". ${errorOutput ? `Root issue: ${errorOutput.slice(0, 200)}` : "Investigate root cause before retrying."}`;

  const keywordSources = [
    outcome.task_description,
    outcome.approach_taken,
    ...outcome.domain_tags,
    ...outcome.files_modified.flatMap((p) =>
      p.split("/").map((seg) => seg.replace(/\.[^.]+$/, "")),
    ),
  ];
  if (errorOutput) keywordSources.push(errorOutput);

  const keywords = extractKeywordsFromTexts(keywordSources);

  return {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    task_id: outcome.task_id,
    task_description: outcome.task_description,
    domain_tags: outcome.domain_tags,
    outcome: outcomeEnum,
    approach_taken: outcome.approach_taken,
    files_modified: outcome.files_modified,
    test_passed: outcome.test_passed,
    error_summary: errorOutput,
    reflection,
    lesson,
    keywords,
    wave_id: outcome.wave_id,
    related_reflexion_ids: [],
  };
}

/** Load reflexion bank from a JSON file. Returns empty bank if file missing/invalid. */
export async function loadReflexionBank(bankPath: string): Promise<ReflexionBank> {
  try {
    const file = Bun.file(bankPath);
    const exists = await file.exists();
    if (!exists) return { version: "1.0.0", entries: [] };
    const raw = await file.json();
    return ReflexionBankSchema.parse(raw);
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

/** Append a reflexion entry to the bank file. Creates file if it doesn't exist. Links related reflexions by keyword overlap. */
export async function appendReflexion(
  bankPath: string,
  entry: ReflexionEntry,
): Promise<void> {
  const bank = await loadReflexionBank(bankPath);

  // Link related reflexions: 40%+ keyword overlap
  const entryKws = new Set(entry.keywords);
  if (entryKws.size > 0) {
    const related: string[] = [];
    for (const existing of bank.entries) {
      const overlap = existing.keywords.filter((k) => entryKws.has(k)).length;
      const ratio = overlap / Math.max(entryKws.size, existing.keywords.length);
      if (ratio >= 0.4) related.push(existing.id);
    }
    entry.related_reflexion_ids = related;
  }

  bank.entries.push(entry);
  await Bun.write(bankPath, JSON.stringify(bank, null, 2));
}

/** Retrieve reflexion entries relevant to a query using keyword-based similarity. */
export function retrieveReflexions(
  query: string,
  bank: ReflexionBank,
  topK: number,
): ReflexionEntry[] {
  if (bank.entries.length === 0) return [];

  const queryWords = new Set(tokenize(query));
  if (queryWords.size === 0) return [];

  const scored: Array<{ entry: ReflexionEntry; score: number }> = [];

  for (const entry of bank.entries) {
    const kwOverlap = entry.keywords.filter((k) => queryWords.has(k)).length;
    const descWords = entry.task_description.toLowerCase().split(/\s+/);
    const descOverlap = descWords.filter((w) => queryWords.has(w)).length;

    const similarity =
      queryWords.size > 0
        ? (kwOverlap * 2 + descOverlap) / (queryWords.size * 3)
        : 0;

    // Boost failures slightly — they carry harder-won lessons
    const failureBoost = entry.outcome === "failure" ? 1.1 : 1.0;
    const score = similarity * failureBoost;

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.entry);
}

/** Format reflexion entries as markdown for injection into agent prompts. */
export function formatReflexionsForPrompt(reflexions: ReflexionEntry[]): string {
  if (reflexions.length === 0) return "";

  const lines = ["## Past Reflexions\n"];

  for (const r of reflexions) {
    const icon = r.outcome === "success" ? "+" : "!";
    lines.push(`### [${icon}] ${r.task_description}`);
    lines.push(`- **Outcome**: ${r.outcome} | **Tested**: ${r.test_passed ? "passed" : "failed"}`);
    lines.push(`- **Approach**: ${r.approach_taken}`);
    if (r.error_summary) {
      lines.push(`- **Error**: ${r.error_summary.slice(0, 150)}`);
    }
    lines.push(`- **Lesson**: ${r.lesson}`);
    lines.push("");
  }

  return lines.join("\n");
}
