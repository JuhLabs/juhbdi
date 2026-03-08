import { describe, expect, test } from "bun:test";
import { PrincipleSchema, PrincipleBankSchema, type Principle } from "./principle-types";

describe("PrincipleSchema", () => {
  test("parses a valid principle", () => {
    const p = PrincipleSchema.parse({
      id: "p-001",
      principle: "Use z.iso.datetime() not z.string().datetime() in Zod v4",
      source_tasks: ["task-1", "task-2"],
      confidence: 0.9,
      times_applied: 3,
      times_validated: 2,
      domain_tags: ["typescript", "zod"],
      keywords: ["zod", "datetime", "schema"],
      created_at: "2026-03-08T10:00:00Z",
    });
    expect(p.id).toBe("p-001");
    expect(p.confidence).toBe(0.9);
  });

  test("rejects confidence > 1", () => {
    expect(() =>
      PrincipleSchema.parse({
        id: "p", principle: "test", source_tasks: [],
        confidence: 1.5, times_applied: 0, times_validated: 0,
        domain_tags: [], keywords: [], created_at: "2026-03-08T10:00:00Z",
      })
    ).toThrow();
  });

  test("defaults times_applied to 0", () => {
    const p = PrincipleSchema.parse({
      id: "p", principle: "test", source_tasks: [],
      confidence: 0.5, domain_tags: [], keywords: [],
      created_at: "2026-03-08T10:00:00Z",
    });
    expect(p.times_applied).toBe(0);
    expect(p.times_validated).toBe(0);
  });
});

describe("PrincipleBankSchema", () => {
  test("parses empty bank", () => {
    const bank = PrincipleBankSchema.parse({ version: "1.0.0", principles: [] });
    expect(bank.principles).toEqual([]);
  });

  test("parses bank with principles", () => {
    const bank = PrincipleBankSchema.parse({
      version: "1.0.0",
      principles: [{
        id: "p-1", principle: "Always run tests before committing",
        source_tasks: ["t-1"], confidence: 0.8,
        domain_tags: ["testing"], keywords: ["test", "commit"],
        created_at: "2026-03-08T10:00:00Z",
      }],
    });
    expect(bank.principles.length).toBe(1);
  });
});
