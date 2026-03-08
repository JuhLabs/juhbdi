import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { MemoryBankSchema, type ExperienceTriplet, type MemoryBank } from "../schemas/memory";
import { resolveContext } from "./helpers";
import { migrateBank } from "../memory/migrate";
import { retrieveWithContext } from "../memory/retrieve";

export type { ExperienceTriplet } from "../schemas/memory";

export function computeUtility(passed: boolean, strikesUsed: number, maxStrikes: number): number {
  if (!passed) return 0.0;
  const passScore = 0.6;
  const efficiencyScore = (1 - strikesUsed / maxStrikes) * 0.3;
  const firstTryBonus = strikesUsed === 0 ? 0.1 : 0;
  return Math.round((passScore + efficiencyScore + firstTryBonus) * 100) / 100;
}

export function rankByRelevance(
  triplets: ExperienceTriplet[],
  taskDescription: string,
  topK: number
): ExperienceTriplet[] {
  const passing = triplets.filter((t) => t.experience.test_result === "pass");

  if (passing.length === 0) return [];

  const queryWords = new Set(
    taskDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  const scored = passing.map((triplet) => {
    const descWords = new Set(
      triplet.intent.task_description.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const tagWords = new Set(triplet.intent.domain_tags.map((t) => t.toLowerCase()));

    let overlap = 0;
    for (const word of queryWords) {
      if (descWords.has(word)) overlap += 1;
      if (tagWords.has(word)) overlap += 2;
    }

    const similarity = queryWords.size > 0 ? overlap / queryWords.size : 0;
    const score = similarity * triplet.utility;

    return { triplet, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.triplet);
}

async function loadMemoryBank(juhbdiDir: string): Promise<MemoryBank> {
  try {
    const raw = await readFile(join(juhbdiDir, "memory-bank.json"), "utf-8");
    const parsed = JSON.parse(raw);
    // Auto-migrate v1 banks to v2
    if (!parsed.version || parsed.version === "1.0.0") {
      const migrated = migrateBank(parsed);
      await writeFile(join(juhbdiDir, "memory-bank.json"), JSON.stringify(migrated, null, 2) + "\n");
    }
    return MemoryBankSchema.parse(parsed);
  } catch {
    return { version: "1.0.0", triplets: [] };
  }
}

async function saveMemoryBank(juhbdiDir: string, bank: MemoryBank): Promise<void> {
  const validated = MemoryBankSchema.parse(bank);
  await writeFile(join(juhbdiDir, "memory-bank.json"), JSON.stringify(validated, null, 2) + "\n");
}

if (import.meta.main) {
  const action = process.argv[2];

  if (action === "record") {
    const tripletRaw = process.argv[3];
    if (!tripletRaw) {
      console.error(JSON.stringify({ error: "Usage: memory.ts record <triplet_json>" }));
      process.exit(1);
    }
    const { juhbdiDir } = await resolveContext();
    const bank = await loadMemoryBank(juhbdiDir);
    const triplet = JSON.parse(tripletRaw);
    bank.triplets.push(triplet);
    await saveMemoryBank(juhbdiDir, bank);
    console.log(JSON.stringify({ success: true, total_triplets: bank.triplets.length }));

  } else if (action === "retrieve") {
    const taskDesc = process.argv[3];
    const topK = parseInt(process.argv[4] ?? "3", 10);
    if (!taskDesc) {
      console.error(JSON.stringify({ error: "Usage: memory.ts retrieve <task_description> [top_k]" }));
      process.exit(1);
    }
    const { juhbdiDir } = await resolveContext();
    const bank = await loadMemoryBank(juhbdiDir);
    const results = retrieveWithContext(taskDesc, bank.triplets as any, topK);
    console.log(JSON.stringify({ matches: results, total_in_bank: bank.triplets.length }));

  } else {
    console.error(JSON.stringify({ error: "Usage: memory.ts <record|retrieve> ..." }));
    process.exit(1);
  }
}
