// src/core/patterns.test.ts
import { describe, expect, test } from "bun:test";
import { detectFailurePatterns } from "./patterns";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

describe("detectFailurePatterns", () => {
  const makeEntry = (taskId: string, desc: string): DecisionTrailEntry => ({
    timestamp: "2026-03-02T00:00:00.000Z",
    event_type: "recovery",
    task_id: taskId,
    description: desc,
    reasoning: "",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "escalated",
  });

  test("returns empty for < 2 entries", () => {
    const result = detectFailurePatterns([makeEntry("t1", "some error")]);
    expect(result).toEqual([]);
  });

  test("returns empty when all entries are from same task", () => {
    const entries = [
      makeEntry("t1", "cannot find module xyz in path"),
      makeEntry("t1", "cannot find module xyz in path again"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result).toEqual([]);
  });

  test("detects pattern across 2 tasks", () => {
    const entries = [
      makeEntry("t1", "cannot find module authentication in project path"),
      makeEntry("t2", "cannot find module validation in project path"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].task_ids).toContain("t1");
    expect(result[0].task_ids).toContain("t2");
  });

  test("deduplicates overlapping patterns", () => {
    const entries = [
      makeEntry("t1", "type error: expected string but received number in handler"),
      makeEntry("t2", "type error: expected string but received boolean in handler"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns empty for zero entries", () => {
    const result = detectFailurePatterns([]);
    expect(result).toEqual([]);
  });

  test("filters to only recovery event_type entries", () => {
    const decision: DecisionTrailEntry = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "command",
      task_id: "t1",
      description: "execution loop started with extra detailed info",
      reasoning: "",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
    };
    const decision2: DecisionTrailEntry = {
      ...decision,
      task_id: "t2",
    };
    const result = detectFailurePatterns([decision, decision2]);
    expect(result).toEqual([]);
  });

  test("sorts by occurrences descending then pattern length descending", () => {
    const entries = [
      makeEntry("t1", "Task failed: Cannot resolve dependency @types/node in build environment"),
      makeEntry("t2", "Task failed: Cannot resolve dependency @types/node in build environment"),
      makeEntry("t3", "Task failed: Cannot resolve dependency @types/node in build environment"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].occurrences).toBe(3);
    expect(result[0].task_ids).toEqual(["t1", "t2", "t3"]);
  });

  test("task_ids are sorted alphabetically", () => {
    const entries = [
      makeEntry("z-task", "Task failed: Module not found xyz in project"),
      makeEntry("a-task", "Task failed: Module not found xyz in project"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].task_ids).toEqual(["a-task", "z-task"]);
  });

  test("requires phrases of at least 15 characters", () => {
    // Short phrases only - "ab cd ef" is 8 chars, under 15
    const entries = [
      makeEntry("t1", "ab cd ef"),
      makeEntry("t2", "ab cd ef"),
    ];
    const result = detectFailurePatterns(entries);
    expect(result).toEqual([]);
  });

  test("ignores entries without task_id", () => {
    const withoutTaskId: DecisionTrailEntry = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "recovery",
      description: "some failure description with enough words here",
      reasoning: "",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "escalated",
    };
    const withTaskId = makeEntry("t1", "some failure description with enough words here");
    const result = detectFailurePatterns([withoutTaskId, withTaskId]);
    expect(result).toEqual([]);
  });
});
