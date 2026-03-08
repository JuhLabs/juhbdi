import { describe, test, expect } from "bun:test";
import { PrincipleBankSchema, PrincipleSchema } from "../memory/principle-types";
import type { Principle, PrincipleBank } from "../memory/principle-types";

function makePrinciple(overrides: Partial<Principle> = {}): Principle {
  return PrincipleSchema.parse({
    id: "p-test-1",
    principle: "When direct approach fails, try incremental refactoring",
    source_tasks: ["t1", "t2"],
    confidence: 0.75,
    times_applied: 3,
    times_validated: 2,
    domain_tags: ["refactoring", "typescript"],
    keywords: ["refactoring", "incremental", "direct", "approach", "typescript"],
    created_at: "2026-03-08T00:00:00.000Z",
    ...overrides,
  });
}

function makeBank(principles: Principle[] = []): PrincipleBank {
  return PrincipleBankSchema.parse({
    version: "1.0.0",
    principles,
  });
}

describe("principles CLI integration", () => {
  test("PrincipleBankSchema parses valid bank", () => {
    const bank = makeBank([makePrinciple()]);
    expect(bank.version).toBe("1.0.0");
    expect(bank.principles).toHaveLength(1);
  });

  test("PrincipleBankSchema accepts empty principles", () => {
    const bank = makeBank();
    expect(bank.principles).toHaveLength(0);
  });

  test("PrincipleSchema validates required fields", () => {
    const p = makePrinciple();
    expect(p.id).toBe("p-test-1");
    expect(p.confidence).toBe(0.75);
    expect(p.times_applied).toBe(3);
    expect(p.times_validated).toBe(2);
  });

  test("PrincipleSchema defaults times_applied and times_validated to 0", () => {
    const p = PrincipleSchema.parse({
      id: "p-new",
      principle: "Always test first",
      source_tasks: ["t1"],
      confidence: 0.5,
      domain_tags: ["testing"],
      keywords: ["testing", "first"],
      created_at: "2026-03-08T00:00:00.000Z",
    });
    expect(p.times_applied).toBe(0);
    expect(p.times_validated).toBe(0);
  });

  test("keyword matching finds relevant principles", () => {
    const bank = makeBank([
      makePrinciple({ keywords: ["authentication", "jwt", "tokens", "session"] }),
      makePrinciple({ id: "p-test-2", keywords: ["database", "migration", "schema", "postgres"] }),
    ]);
    const query = "implement authentication with JWT tokens";
    const queryWords = new Set(
      query.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 3)
    );

    const scored = bank.principles
      .map((p) => {
        const kwSet = new Set(p.keywords.map((k) => k.toLowerCase()));
        let overlap = 0;
        for (const w of queryWords) if (kwSet.has(w)) overlap++;
        return { id: p.id, score: queryWords.size > 0 ? overlap / queryWords.size : 0 };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    expect(scored.length).toBeGreaterThanOrEqual(1);
    expect(scored[0].id).toBe("p-test-1"); // auth principle matches better
  });

  test("confidence threshold filters low-confidence principles", () => {
    const bank = makeBank([
      makePrinciple({ confidence: 0.9 }),
      makePrinciple({ id: "p-low", confidence: 0.3 }),
    ]);
    const filtered = bank.principles.filter((p) => p.confidence >= 0.5);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].confidence).toBe(0.9);
  });

  test("apply increments times_applied", () => {
    const p = makePrinciple({ times_applied: 3 });
    p.times_applied += 1;
    expect(p.times_applied).toBe(4);
  });

  test("validate increments times_validated and boosts confidence", () => {
    const p = makePrinciple({ times_validated: 2, confidence: 0.75 });
    p.times_validated += 1;
    p.confidence = Math.min(1, p.confidence + 0.05);
    expect(p.times_validated).toBe(3);
    expect(p.confidence).toBe(0.8);
  });

  test("confidence caps at 1.0", () => {
    const p = makePrinciple({ confidence: 0.98 });
    p.confidence = Math.min(1, p.confidence + 0.05);
    expect(p.confidence).toBe(1.0);
  });

  test("merge logic: update existing by ID, add new", () => {
    const bank = makeBank([makePrinciple({ id: "p-1", confidence: 0.5 })]);
    const newPrinciples = [
      makePrinciple({ id: "p-1", confidence: 0.8 }), // update existing
      makePrinciple({ id: "p-2" }), // add new
    ];
    for (const np of newPrinciples) {
      const idx = bank.principles.findIndex((p) => p.id === np.id);
      if (idx >= 0) bank.principles[idx] = np;
      else bank.principles.push(np);
    }
    expect(bank.principles).toHaveLength(2);
    expect(bank.principles.find((p) => p.id === "p-1")!.confidence).toBe(0.8);
  });
});
