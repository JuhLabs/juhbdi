// src/cli-utils/principles.ts
import { resolveContext } from "./helpers";

if (import.meta.main) {
  const action = process.argv[2];
  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { PrincipleBankSchema } = await import("../memory/principle-types");
  const { juhbdiDir } = await resolveContext();

  const bankPath = join(juhbdiDir, "principle-bank.json");

  async function loadBank() {
    try {
      const raw = await readFile(bankPath, "utf-8");
      return PrincipleBankSchema.parse(JSON.parse(raw));
    } catch {
      return { version: "1.0.0" as const, principles: [] };
    }
  }

  async function saveBank(bank: ReturnType<typeof PrincipleBankSchema.parse>) {
    await writeFile(bankPath, JSON.stringify(bank, null, 2) + "\n");
  }

  if (action === "query") {
    const description = process.argv[3];
    const topK = parseInt(process.argv[4] ?? "5", 10);
    if (!description) {
      console.error(JSON.stringify({ error: "Usage: principles.ts query '<task_description>' [top_k]" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const queryWords = new Set(
      description.toLowerCase().split(/[\s,.\-_/]+/).filter((w: string) => w.length > 3)
    );

    // Score project-local principles at 1.0x weight
    const localScored = bank.principles
      .filter((p) => p.confidence >= 0.5)
      .map((p) => {
        const kwSet = new Set(p.keywords.map((k: string) => k.toLowerCase()));
        let overlap = 0;
        for (const w of queryWords) if (kwSet.has(w)) overlap++;
        const score = queryWords.size > 0 ? overlap / queryWords.size : 0;
        return { ...p, relevance_score: score, source: "project" as const };
      })
      .filter((e) => e.relevance_score > 0);

    // Query global bank (0.7x weight applied internally)
    let globalScored: Array<{ relevance_score: number; source: "global"; [key: string]: any }> = [];
    try {
      const { queryGlobalPrinciples, isDuplicate } = await import("../global/global-bank");
      const globalResults = await queryGlobalPrinciples(description, topK);
      globalScored = globalResults.map((r) => ({
        principle: r.text,
        confidence: r.confidence,
        relevance_score: r.relevance,
        source: "global" as const,
        source_project: r.source_project,
      }));

      // Deduplicate: remove global entries that are >80% similar to any local entry
      globalScored = globalScored.filter((gp) =>
        !localScored.some((lp) => isDuplicate(lp.principle, gp.principle))
      );
    } catch {
      // Global bank not available — degrade gracefully
    }

    // Merge and sort
    const merged = [...localScored, ...globalScored]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, topK);

    console.log(JSON.stringify({
      matches: merged,
      total_in_bank: bank.principles.length,
      global_matches: globalScored.length,
    }));

  } else if (action === "save") {
    const principlesRaw = process.argv[3];
    if (!principlesRaw) {
      console.error(JSON.stringify({ error: "Usage: principles.ts save '<principles_json_array>'" }));
      process.exit(1);
    }
    const newPrinciples = JSON.parse(principlesRaw);
    const bank = await loadBank();

    // Merge: update existing by ID, add new ones
    for (const np of newPrinciples) {
      const existingIdx = bank.principles.findIndex((p) => p.id === np.id);
      if (existingIdx >= 0) {
        bank.principles[existingIdx] = np;
      } else {
        bank.principles.push(np);
      }
    }

    await saveBank(bank);
    console.log(JSON.stringify({
      success: true,
      saved_count: newPrinciples.length,
      total_in_bank: bank.principles.length
    }));

  } else if (action === "apply") {
    const principleId = process.argv[3];
    if (!principleId) {
      console.error(JSON.stringify({ error: "Usage: principles.ts apply <principle_id>" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const principle = bank.principles.find((p) => p.id === principleId);
    if (!principle) {
      console.error(JSON.stringify({ error: `Principle ${principleId} not found` }));
      process.exit(1);
    }
    principle.times_applied += 1;
    await saveBank(bank);
    console.log(JSON.stringify({ success: true, id: principleId, times_applied: principle.times_applied }));

  } else if (action === "validate") {
    const principleId = process.argv[3];
    if (!principleId) {
      console.error(JSON.stringify({ error: "Usage: principles.ts validate <principle_id>" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const principle = bank.principles.find((p) => p.id === principleId);
    if (!principle) {
      console.error(JSON.stringify({ error: `Principle ${principleId} not found` }));
      process.exit(1);
    }
    principle.times_validated += 1;
    principle.confidence = Math.min(1, principle.confidence + 0.05);
    await saveBank(bank);
    console.log(JSON.stringify({
      success: true, id: principleId,
      times_validated: principle.times_validated,
      new_confidence: principle.confidence
    }));

  } else if (action === "list") {
    const minConfidence = parseFloat(process.argv[3] ?? "0");
    const bank = await loadBank();
    const filtered = bank.principles
      .filter((p) => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
    console.log(JSON.stringify({
      principles: filtered,
      total_in_bank: bank.principles.length,
      showing: filtered.length
    }));

  } else {
    console.error(JSON.stringify({ error: "Usage: principles.ts <query|save|apply|validate|list> ..." }));
    process.exit(1);
  }
}
