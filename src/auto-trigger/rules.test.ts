import { describe, expect, test } from "bun:test";
import { TriggerRuleSchema, type TriggerRule, DEFAULT_RULES } from "./rules";

describe("TriggerRule schema", () => {
  test("parses a valid rule", () => {
    const rule = TriggerRuleSchema.parse({
      id: "plan-suggest",
      patterns: ["build.*feature", "implement.*system"],
      command: "/juhbdi:plan",
      confidence: 0.8,
      description: "Multi-step task detected",
    });
    expect(rule.id).toBe("plan-suggest");
    expect(rule.confidence).toBe(0.8);
  });

  test("rejects confidence > 1", () => {
    expect(() =>
      TriggerRuleSchema.parse({
        id: "bad", patterns: ["test"], command: "/juhbdi:plan",
        confidence: 1.5, description: "bad",
      })
    ).toThrow();
  });

  test("rejects confidence < 0", () => {
    expect(() =>
      TriggerRuleSchema.parse({
        id: "bad", patterns: ["test"], command: "/juhbdi:plan",
        confidence: -0.1, description: "bad",
      })
    ).toThrow();
  });
});

describe("DEFAULT_RULES", () => {
  test("has at least 5 rules", () => {
    expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(5);
  });

  test("all rules parse with schema", () => {
    for (const rule of DEFAULT_RULES) {
      expect(() => TriggerRuleSchema.parse(rule)).not.toThrow();
    }
  });

  test("covers plan, quick, status, trail, execute", () => {
    const commands = DEFAULT_RULES.map((r) => r.command);
    expect(commands).toContain("/juhbdi:plan");
    expect(commands).toContain("/juhbdi:quick");
    expect(commands).toContain("/juhbdi:status");
    expect(commands).toContain("/juhbdi:trail");
    expect(commands).toContain("/juhbdi:execute");
  });
});
