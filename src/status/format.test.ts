// src/status/format.test.ts
import { describe, expect, test } from "bun:test";
import { formatProjectStatus } from "./format";
import type { ProjectStatus } from "./types";

function makeFullStatus(overrides: Partial<ProjectStatus> = {}): ProjectStatus {
  return {
    beliefs: {
      project_name: "TestProject",
      architecture: "Modular monolith",
      conventions: ["TDD", "ESM"],
      last_updated: "2026-03-02T10:00:00.000Z",
    },
    intentions: {
      total_waves: 2,
      total_tasks: 4,
      wave_details: [
        { id: "w1", parallel: true, pending: 0, running: 0, passed: 2, failed: 0, blocked: 0 },
        { id: "w2", parallel: false, pending: 1, running: 0, passed: 0, failed: 1, blocked: 0 },
      ],
      overall_progress: 50,
    },
    trail: {
      total_entries: 5,
      latest_entry: {
        event_type: "command",
        description: "execution completed",
        timestamp: "2026-03-02T10:00:00.000Z",
      },
    },
    recovery: {
      tasks_with_retries: 0,
      total_retries: 0,
      banned_approaches: [],
      failure_patterns: [],
    },
    ...overrides,
  };
}

describe("formatProjectStatus", () => {
  test("includes project status header", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).toContain("JuhBDI Project Status");
  });

  test("displays beliefs when present", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).toContain("Beliefs:");
    expect(output).toContain("Project: TestProject");
    expect(output).toContain("Architecture: Modular monolith");
    expect(output).toContain("Conventions: TDD, ESM");
  });

  test("shows no state.json message when beliefs are null", () => {
    const output = formatProjectStatus(makeFullStatus({ beliefs: null }));
    expect(output).toContain("No state.json found.");
  });

  test("displays active wave and task when present", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        beliefs: {
          project_name: "Test",
          architecture: "Mono",
          conventions: [],
          last_updated: "2026-03-02T10:00:00.000Z",
          active_wave_id: "w2",
          active_task_id: "w2-t1",
        },
      })
    );
    expect(output).toContain("Active Wave: w2");
    expect(output).toContain("Active Task: w2-t1");
  });

  test("shows 'none defined' when no conventions", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        beliefs: {
          project_name: "Test",
          architecture: "Mono",
          conventions: [],
          last_updated: "2026-03-02T10:00:00.000Z",
        },
      })
    );
    expect(output).toContain("none defined");
  });

  test("displays intentions with progress", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).toContain("Intentions:");
    expect(output).toContain("Progress: 50%");
    expect(output).toContain("4 tasks across 2 waves");
  });

  test("shows wave details", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).toContain("Wave w1 (parallel): 2/2 passed");
    expect(output).toContain("Wave w2 (sequential): 0/2 passed");
  });

  test("shows blocked count when present", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        intentions: {
          total_waves: 1,
          total_tasks: 2,
          wave_details: [
            { id: "w1", parallel: false, pending: 0, running: 0, passed: 0, failed: 0, blocked: 2 },
          ],
          overall_progress: 0,
        },
      })
    );
    expect(output).toContain("2 blocked");
  });

  test("shows no roadmap message when intentions are null", () => {
    const output = formatProjectStatus(makeFullStatus({ intentions: null }));
    expect(output).toContain("No roadmap-intent.json found.");
  });

  test("shows 'no waves planned' when waves array is empty", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        intentions: {
          total_waves: 0,
          total_tasks: 0,
          wave_details: [],
          overall_progress: 0,
        },
      })
    );
    expect(output).toContain("No waves planned");
  });

  test("displays decision trail", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).toContain("Decision Trail:");
    expect(output).toContain("5 entries logged");
    expect(output).toContain("[command] execution completed");
  });

  test("omits latest entry when trail is empty", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        trail: { total_entries: 0 },
      })
    );
    expect(output).toContain("0 entries logged");
    expect(output).not.toContain("Latest:");
  });

  test("displays recovery section when retries exist", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        recovery: {
          tasks_with_retries: 2,
          total_retries: 5,
          banned_approaches: [
            { task_id: "w1-t1", approaches: ["approach-a", "approach-b"] },
          ],
          failure_patterns: [],
        },
      })
    );
    expect(output).toContain("Recovery:");
    expect(output).toContain("2 tasks retried (5 total retries)");
    expect(output).toContain("[w1-t1] Banned: approach-a, approach-b");
  });

  test("displays failure patterns when detected", () => {
    const output = formatProjectStatus(
      makeFullStatus({
        recovery: {
          tasks_with_retries: 2,
          total_retries: 4,
          banned_approaches: [],
          failure_patterns: [
            {
              pattern: "Module not found xyz",
              occurrences: 2,
              task_ids: ["w1-t1", "w1-t2"],
            },
          ],
        },
      })
    );
    expect(output).toContain("Failure Patterns:");
    expect(output).toContain("Module not found xyz");
    expect(output).toContain("2 tasks");
  });

  test("omits recovery section when no retries and no patterns", () => {
    const output = formatProjectStatus(makeFullStatus());
    expect(output).not.toContain("Recovery:");
  });
});
