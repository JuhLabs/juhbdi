import type { QuickResult } from "./types";
import type { ExperienceTriplet } from "../schemas/memory";
import { computeUtility } from "../cli-utils/memory";
import { inferOptimalTier } from "../cli-utils/model-router";
import { extractKeywords } from "../memory/keywords";
import { linkMemory } from "../memory/linker";

export function buildTriplet(
  result: QuickResult,
  description: string
): ExperienceTriplet {
  const passed = result.status === "passed";
  const utility = computeUtility(passed, 0, 3);
  const optimal_tier = passed
    ? inferOptimalTier(result.model_tier, true, 0) ?? undefined
    : undefined;

  return {
    id: result.task_id,
    timestamp: new Date().toISOString(),
    intent: {
      goal_refs: [],
      task_description: description,
      domain_tags: extractDomainTags(description),
    },
    experience: {
      approach: result.approach,
      files_modified: result.files_modified,
      test_result: passed ? "pass" : "fail",
      strikes_used: 0,
      banned_approaches: [],
      model_tier: result.model_tier,
      optimal_tier,
    },
    utility,
  };
}

export function buildTrailEntry(
  taskId: string,
  tier: string,
  status: string,
  description: string
) {
  return {
    event_type: "command" as const,
    description: `quick task ${taskId}: ${description.slice(0, 80)}`,
    reasoning: `Executed via /juhbdi:quick, routed to ${tier}`,
    alternatives_considered: [] as string[],
    constraint_refs: [] as string[],
    outcome: (status === "passed" ? "approved" : "escalated") as "approved" | "escalated",
  };
}

function extractDomainTags(description: string): string[] {
  const keywords = description.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  return [...new Set(keywords)].slice(0, 5);
}

if (import.meta.main) {
  const resultRaw = process.argv[2];
  const description = process.argv[3];
  if (!resultRaw || !description) {
    console.error(JSON.stringify({ error: "Usage: record.ts <result_json> <description>" }));
    process.exit(1);
  }

  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { findProjectRoot, JUHBDI_DIR } = await import("../core/config");
  const { MemoryBankSchema } = await import("../schemas/memory");
  const { appendTrailEntry } = await import("../core/trail");
  const { QuickResultSchema } = await import("./types");

  const result = QuickResultSchema.parse(JSON.parse(resultRaw));
  const triplet = buildTriplet(result, description);
  const trailEntry = buildTrailEntry(result.task_id, result.model_tier, result.status, description);

  const cwd = process.cwd();
  const projectRoot = await findProjectRoot(cwd);

  if (projectRoot) {
    const juhbdiDir = join(projectRoot, JUHBDI_DIR);

    try {
      let bank = { version: "1.0.0", triplets: [] as ExperienceTriplet[] };
      try {
        const raw = await readFile(join(juhbdiDir, "memory-bank.json"), "utf-8");
        bank = MemoryBankSchema.parse(JSON.parse(raw));
      } catch { /* start fresh */ }
      // Enrich triplet with keywords and cross-links
      const enriched = { ...triplet, keywords: extractKeywords(triplet as any), related_memories: [] as any[] };
      if (bank.triplets.length > 0) {
        const { updated, linked } = linkMemory(enriched as any, bank.triplets as any);
        bank.triplets = linked as any;
        bank.triplets.push(updated as any);
      } else {
        bank.triplets.push(enriched as any);
      }
      await writeFile(join(juhbdiDir, "memory-bank.json"), JSON.stringify(bank, null, 2) + "\n");
    } catch { /* non-fatal */ }

    try {
      const trailPath = join(juhbdiDir, "decision-trail.log");
      await appendTrailEntry(trailPath, trailEntry);
    } catch { /* non-fatal */ }
  }

  console.log(JSON.stringify({ success: true, triplet_id: triplet.id }));
}
