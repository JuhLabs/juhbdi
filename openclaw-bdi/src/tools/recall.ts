import { retrieveWithContext, speculate, type SpeculationResult } from "../core/memory.js";
import type { ExperienceTriplet, Principle } from "../core/schemas.js";

export interface RecallInput {
  query: string;
  top_k?: number;
}

export interface RecallResult {
  experiences: Array<{
    task_description: string;
    approach: string;
    test_result: "pass" | "fail";
    domain_tags: string[];
    utility: number;
  }>;
  speculation: SpeculationResult | null;
  total_memories: number;
}

export function recall(
  input: RecallInput,
  triplets: ExperienceTriplet[],
  principles: Principle[]
): RecallResult {
  const topK = input.top_k ?? 5;

  const matches = retrieveWithContext(input.query, triplets, topK);

  const speculation = speculate(input.query, triplets, principles);

  return {
    experiences: matches.map((m) => ({
      task_description: m.intent.task_description,
      approach: m.experience.approach,
      test_result: m.experience.test_result,
      domain_tags: m.intent.domain_tags,
      utility: m.utility,
    })),
    speculation,
    total_memories: triplets.length,
  };
}
