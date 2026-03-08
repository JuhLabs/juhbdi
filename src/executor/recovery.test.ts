// src/executor/recovery.test.ts
import { describe, expect, test } from "bun:test";
import { handleFailure, analyzeFailurePatterns, type RecoveryAction, type FailureAnalysis } from "./recovery";
import type { Task } from "../schemas/roadmap-intent";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "w1-t1",
    description: "Create a helper",
    goal_refs: ["g1"],
    status: "running",
    verification: { type: "test", command: "bun test" },
    retry_count: 0,
    ...overrides,
  };
}

describe("handleFailure", () => {
  test("returns retry when under max retries", () => {
    const task = makeTask({ retry_count: 0 });
    const result = handleFailure(task, "functional pattern", "test failed", 3);
    expect(result.action).toBe("retry");
    expect(result.updated_retry_count).toBe(1);
    expect(result.banned_approach).toBe("functional pattern");
  });

  test("returns give_up when at max retries", () => {
    const task = makeTask({ retry_count: 2 });
    const result = handleFailure(task, "third attempt", "still failing", 3);
    expect(result.action).toBe("give_up");
    expect(result.updated_retry_count).toBe(3);
  });

  test("accumulates banned approaches", () => {
    const task = makeTask({
      retry_count: 1,
      banned_approaches: ["first attempt"],
    });
    const result = handleFailure(task, "second attempt", "failed", 3);
    expect(result.action).toBe("retry");
    expect(result.updated_banned_approaches).toEqual(["first attempt", "second attempt"]);
  });

  test("does not duplicate banned approaches", () => {
    const task = makeTask({
      retry_count: 0,
      banned_approaches: ["same approach"],
    });
    const result = handleFailure(task, "same approach", "failed", 3);
    expect(result.updated_banned_approaches).toEqual(["same approach"]);
  });

  test("respects custom max retries", () => {
    const task = makeTask({ retry_count: 3 });
    const result = handleFailure(task, "approach", "failed", 5);
    expect(result.action).toBe("retry");
    expect(result.updated_retry_count).toBe(4);
  });
});

function makeTrailEntry(overrides: Partial<DecisionTrailEntry> = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-02T10:00:00.000Z",
    event_type: "recovery",
    description: "Task failed: Module not found xyz",
    reasoning: "Approach banned",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "escalated",
    ...overrides,
  };
}

describe("analyzeFailurePatterns", () => {
  test("returns empty analysis with fewer than 2 recovery entries", () => {
    const tasks = [makeTask({ id: "w1-t1" })];
    const entries = [makeTrailEntry({ task_id: "w1-t1" })];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.systemic_issue).toBe(false);
    expect(analysis.repeated_errors).toEqual([]);
    expect(analysis.recommendation).toBe("");
  });

  test("returns empty analysis when all recoveries are from one task", () => {
    const tasks = [makeTask({ id: "w1-t1" })];
    const entries = [
      makeTrailEntry({ task_id: "w1-t1", description: "Task failed: Module not found xyz in env" }),
      makeTrailEntry({ task_id: "w1-t1", description: "Task failed: Module not found xyz in env" }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.systemic_issue).toBe(false);
    expect(analysis.repeated_errors).toEqual([]);
  });

  test("detects systemic issue when same error hits 2+ tasks", () => {
    const tasks = [makeTask({ id: "w1-t1" }), makeTask({ id: "w1-t2" })];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: Cannot resolve dependency @types/node in build environment",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: Cannot resolve dependency @types/node in build environment",
      }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.systemic_issue).toBe(true);
    expect(analysis.repeated_errors.length).toBeGreaterThan(0);
    expect(analysis.repeated_errors[0].count).toBe(2);
    expect(analysis.repeated_errors[0].task_ids).toEqual(["w1-t1", "w1-t2"]);
  });

  test("provides recommendation string for systemic issues", () => {
    const tasks = [makeTask({ id: "w1-t1" }), makeTask({ id: "w1-t2" })];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: Cannot find module @acme/utils in project",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: Cannot find module @acme/utils in project",
      }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.recommendation).toContain("Systemic issue");
    expect(analysis.recommendation).toContain("2 tasks");
  });

  test("handles 3+ tasks with same pattern", () => {
    const tasks = [
      makeTask({ id: "w1-t1" }),
      makeTask({ id: "w1-t2" }),
      makeTask({ id: "w2-t1" }),
    ];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: Type error in generated output file handler",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: Type error in generated output file handler",
      }),
      makeTrailEntry({
        task_id: "w2-t1",
        description: "Task failed: Type error in generated output file handler",
      }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.systemic_issue).toBe(true);
    expect(analysis.repeated_errors[0].count).toBe(3);
    expect(analysis.repeated_errors[0].task_ids).toEqual(["w1-t1", "w1-t2", "w2-t1"]);
  });

  test("ignores non-recovery trail entries", () => {
    const tasks = [makeTask({ id: "w1-t1" }), makeTask({ id: "w1-t2" })];
    const entries = [
      makeTrailEntry({
        event_type: "command",
        task_id: "w1-t1",
        description: "execution loop started with extra detailed info",
      }),
      makeTrailEntry({
        event_type: "command",
        task_id: "w1-t2",
        description: "execution loop started with extra detailed info",
      }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    expect(analysis.systemic_issue).toBe(false);
    expect(analysis.repeated_errors).toEqual([]);
  });

  test("returns not systemic when no cross-task patterns exist", () => {
    const tasks = [makeTask({ id: "w1-t1" }), makeTask({ id: "w1-t2" })];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: completely unique error message alpha",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: totally different problem beta gamma",
      }),
    ];
    const analysis = analyzeFailurePatterns(tasks, entries);
    // "Task failed:" alone is too short (< 15 chars for 3-word phrases)
    // so these unrelated errors should not produce cross-task matches
    expect(analysis.systemic_issue).toBe(false);
  });
});
