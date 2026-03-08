import { describe, test, expect } from "bun:test";
import { HandoffSchema } from "./handoff";

describe("HandoffSchema", () => {
  test("validates a complete handoff", () => {
    const handoff = {
      paused_at: "2026-03-03T18:45:00.000Z",
      current_wave: 2,
      current_task: "task-05",
      tasks_completed: ["task-01", "task-02"],
      tasks_remaining: ["task-05", "task-06"],
      context_remaining_pct: 28.5,
      decisions_made: ["Used PostgreSQL"],
      blockers: [],
      next_action: "Continue task-05",
    };
    const result = HandoffSchema.parse(handoff);
    expect(result.current_wave).toBe(2);
    expect(result.tasks_completed).toHaveLength(2);
  });

  test("allows empty arrays", () => {
    const handoff = {
      paused_at: "2026-03-03T18:45:00.000Z",
      current_wave: 0,
      current_task: "",
      tasks_completed: [],
      tasks_remaining: [],
      context_remaining_pct: 50,
      decisions_made: [],
      blockers: [],
      next_action: "Start fresh",
    };
    expect(() => HandoffSchema.parse(handoff)).not.toThrow();
  });

  test("rejects missing required fields", () => {
    expect(() => HandoffSchema.parse({})).toThrow();
  });

  test("rejects context_remaining_pct over 100", () => {
    expect(() =>
      HandoffSchema.parse({
        paused_at: "2026-03-03T18:45:00.000Z",
        current_wave: 0,
        current_task: "",
        tasks_completed: [],
        tasks_remaining: [],
        context_remaining_pct: 150,
        decisions_made: [],
        blockers: [],
        next_action: "x",
      })
    ).toThrow();
  });
});
