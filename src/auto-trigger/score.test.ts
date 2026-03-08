import { describe, expect, test } from "bun:test";
import { scoreMessage, type ScoredSuggestion } from "./score";
import { DEFAULT_RULES } from "./rules";

describe("scoreMessage", () => {
  test("returns empty array for unrelated message", () => {
    const results = scoreMessage("hello world", DEFAULT_RULES);
    expect(results).toEqual([]);
  });

  test("matches plan-suggest for 'build a user auth system'", () => {
    const results = scoreMessage("build a user auth system", DEFAULT_RULES);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].rule.command).toBe("/juhbdi:plan");
  });

  test("matches quick-suggest for 'fix the typo in header'", () => {
    const results = scoreMessage("fix the typo in header", DEFAULT_RULES);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].rule.command).toBe("/juhbdi:quick");
  });

  test("matches status-suggest for 'show me the status'", () => {
    const results = scoreMessage("show me the status", DEFAULT_RULES);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].rule.command).toBe("/juhbdi:status");
  });

  test("matches trail-suggest for 'what happened in the last run'", () => {
    const results = scoreMessage("what happened in the last run", DEFAULT_RULES);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].rule.command).toBe("/juhbdi:trail");
  });

  test("matches execute-suggest for 'continue the work'", () => {
    const results = scoreMessage("continue the work", DEFAULT_RULES);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].rule.command).toBe("/juhbdi:execute");
  });

  test("returns results sorted by score descending", () => {
    const results = scoreMessage("implement a new feature and fix the bug", DEFAULT_RULES);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  test("filters results below threshold", () => {
    const results = scoreMessage("build a user auth system", DEFAULT_RULES, 0.7);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.7);
    }
  });
});
