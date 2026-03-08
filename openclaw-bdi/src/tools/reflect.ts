import { extractPrinciples, type WaveResult } from "../core/reflect.js";
import type { PrincipleBank, Principle } from "../core/schemas.js";

export interface ReflectInput {
  outcomes: Array<{
    task_id: string;
    planned_approach: string;
    actual_approach: string;
    description: string;
    domain_tags?: string[];
    test_passed: boolean;
    files_modified?: string[];
  }>;
}

export interface ReflectResult {
  principles_extracted: number;
  principles: Array<{
    id: string;
    principle: string;
    confidence: number;
    is_update: boolean;
  }>;
}

export function reflectOnOutcomes(
  input: ReflectInput,
  existingBank: PrincipleBank
): { result: ReflectResult; newPrinciples: Principle[] } {
  const waveResult: WaveResult = {
    wave_id: `reflect-${Date.now()}`,
    outcomes: input.outcomes.map((o) => ({
      task_id: o.task_id,
      planned_approach: o.planned_approach,
      actual_approach: o.actual_approach,
      description: o.description,
      domain_tags: o.domain_tags ?? [],
      test_passed: o.test_passed,
      files_modified: o.files_modified ?? [],
    })),
  };

  const extracted = extractPrinciples(waveResult, existingBank);

  const existingIds = new Set(existingBank.principles.map((p) => p.id));

  return {
    result: {
      principles_extracted: extracted.length,
      principles: extracted.map((p) => ({
        id: p.id,
        principle: p.principle,
        confidence: Math.round(p.confidence * 100) / 100,
        is_update: existingIds.has(p.id),
      })),
    },
    newPrinciples: extracted,
  };
}
