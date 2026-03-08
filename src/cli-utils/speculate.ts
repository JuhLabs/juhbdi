// src/cli-utils/speculate.ts
import { resolveContext } from "./helpers";

if (import.meta.main) {
  const action = process.argv[2];
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");

  if (action === "query") {
    const taskDescription = process.argv[3];
    if (!taskDescription) {
      console.error(JSON.stringify({ error: "Usage: speculate.ts query '<task_description>'" }));
      process.exit(1);
    }

    const { speculate } = await import("../memory/speculate");
    const { MemoryBankV2Schema } = await import("../memory/types");
    const { PrincipleBankSchema } = await import("../memory/principle-types");
    const { juhbdiDir } = await resolveContext();

    // Load memory bank
    let triplets: any[] = [];
    try {
      const raw = await readFile(join(juhbdiDir, "memory-bank.json"), "utf-8");
      const bank = MemoryBankV2Schema.parse(JSON.parse(raw));
      triplets = bank.triplets;
    } catch {
      // No memory bank — proceed with empty
    }

    // Load principle bank
    let principles: any[] = [];
    try {
      const raw = await readFile(join(juhbdiDir, "principle-bank.json"), "utf-8");
      const bank = PrincipleBankSchema.parse(JSON.parse(raw));
      principles = bank.principles;
    } catch {
      // No principle bank — proceed with empty
    }

    const result = speculate(taskDescription, triplets, principles);

    if (result) {
      console.log(JSON.stringify({
        has_speculation: true,
        recommended_approach: result.recommended_approach,
        warnings: result.warnings,
        principles: result.principles.map((p) => ({
          id: p.id,
          principle: p.principle,
          confidence: p.confidence,
        })),
        confidence: result.confidence,
        source: result.source,
        source_task_ids: result.source_task_ids,
      }));
    } else {
      console.log(JSON.stringify({
        has_speculation: false,
        message: "No relevant memory or principles found for this task",
      }));
    }

  } else {
    console.error(JSON.stringify({ error: "Usage: speculate.ts query '<task_description>'" }));
    process.exit(1);
  }
}
