// src/memory/migrate.ts
import type { ExperienceTripletV2, MemoryBankV2 } from "./types";
import { extractKeywords } from "./keywords";
import { linkMemory } from "./linker";

interface V1Bank {
  version: string;
  triplets: Array<Record<string, unknown>>;
}

export function migrateBank(bank: V1Bank | MemoryBankV2): MemoryBankV2 {
  if (bank.version === "2.0.0") {
    return bank as MemoryBankV2;
  }

  const withKeywords: ExperienceTripletV2[] = bank.triplets.map((t: any) => {
    const base: ExperienceTripletV2 = {
      ...t,
      keywords: [],
      related_memories: [],
    };
    base.keywords = extractKeywords(base);
    return base;
  });

  const linked: ExperienceTripletV2[] = [];
  for (const triplet of withKeywords) {
    if (linked.length === 0) {
      linked.push(triplet);
      continue;
    }
    const { updated, linked: updatedExisting } = linkMemory(triplet, linked);
    linked.length = 0;
    linked.push(...updatedExisting, updated);
  }

  return {
    version: "2.0.0",
    triplets: linked,
  };
}
