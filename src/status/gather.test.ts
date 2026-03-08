// src/status/gather.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { gatherStatus, detectFailurePatterns } from "./gather";
import { serializeState } from "../schemas/state";
import type { RoadmapIntent } from "../schemas/roadmap-intent";
import type { Task } from "../schemas/roadmap-intent";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "w1-t1",
    description: "Create a helper",
    goal_refs: ["g1"],
    status: "pending",
    verification: { type: "test", command: "bun test" },
    retry_count: 0,
    ...overrides,
  };
}

describe("gatherStatus", () => {
  let tmpDir: string;
  let juhbdiDir: string;
  let trailPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-status-"));
    juhbdiDir = join(tmpDir, ".juhbdi");
    await mkdir(juhbdiDir, { recursive: true });
    trailPath = join(juhbdiDir, "decision-trail.log");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("returns null beliefs when state.json is missing", async () => {
    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.beliefs).toBeNull();
  });

  test("reads beliefs from state.json", async () => {
    const stateJson = serializeState({
      version: "1.0.0",
      project_name: "TestProject",
      conventions: ["TDD", "ESM"],
      architecture: "Modular monolith",
      compressed_history: "",
      last_updated: "2026-03-02T10:00:00.000Z",
    });
    await writeFile(join(juhbdiDir, "state.json"), stateJson);

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.beliefs).not.toBeNull();
    expect(status.beliefs!.project_name).toBe("TestProject");
    expect(status.beliefs!.architecture).toBe("Modular monolith");
    expect(status.beliefs!.conventions).toEqual(["TDD", "ESM"]);
  });

  test("reads beliefs with active wave and task", async () => {
    const stateJson = serializeState({
      version: "1.0.0",
      project_name: "TestProject",
      conventions: [],
      architecture: "Microservices",
      active_context: {
        current_wave: 2,
        current_task: "w2-t1",
      },
      compressed_history: "",
      last_updated: "2026-03-02T10:00:00.000Z",
    });
    await writeFile(join(juhbdiDir, "state.json"), stateJson);

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.beliefs!.active_wave_id).toBe("2");
    expect(status.beliefs!.active_task_id).toBe("w2-t1");
  });

  test("returns null intentions when roadmap is missing", async () => {
    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.intentions).toBeNull();
  });

  test("reads intentions from roadmap-intent.json", async () => {
    const roadmap: RoadmapIntent = {
      version: "1.0.0",
      intent_spec_ref: "intent-spec.json",
      waves: [
        {
          id: "w1",
          parallel: true,
          tasks: [
            makeTask({ id: "w1-t1", status: "passed" }),
            makeTask({ id: "w1-t2", status: "passed" }),
          ],
        },
        {
          id: "w2",
          parallel: false,
          tasks: [
            makeTask({ id: "w2-t1", status: "pending" }),
            makeTask({ id: "w2-t2", status: "failed", retry_count: 2 }),
          ],
        },
      ],
    };
    await writeFile(
      join(juhbdiDir, "roadmap-intent.json"),
      JSON.stringify(roadmap)
    );

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.intentions).not.toBeNull();
    expect(status.intentions!.total_waves).toBe(2);
    expect(status.intentions!.total_tasks).toBe(4);
    expect(status.intentions!.overall_progress).toBe(50);
    expect(status.intentions!.wave_details[0].passed).toBe(2);
    expect(status.intentions!.wave_details[1].pending).toBe(1);
    expect(status.intentions!.wave_details[1].failed).toBe(1);
  });

  test("computes 0% progress with no passed tasks", async () => {
    const roadmap: RoadmapIntent = {
      version: "1.0.0",
      intent_spec_ref: "intent-spec.json",
      waves: [
        {
          id: "w1",
          parallel: false,
          tasks: [
            makeTask({ id: "w1-t1", status: "pending" }),
          ],
        },
      ],
    };
    await writeFile(
      join(juhbdiDir, "roadmap-intent.json"),
      JSON.stringify(roadmap)
    );

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.intentions!.overall_progress).toBe(0);
  });

  test("computes 100% progress when all passed", async () => {
    const roadmap: RoadmapIntent = {
      version: "1.0.0",
      intent_spec_ref: "intent-spec.json",
      waves: [
        {
          id: "w1",
          parallel: false,
          tasks: [
            makeTask({ id: "w1-t1", status: "passed" }),
            makeTask({ id: "w1-t2", status: "passed" }),
          ],
        },
      ],
    };
    await writeFile(
      join(juhbdiDir, "roadmap-intent.json"),
      JSON.stringify(roadmap)
    );

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.intentions!.overall_progress).toBe(100);
  });

  test("returns empty trail when log is missing", async () => {
    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.trail.total_entries).toBe(0);
    expect(status.trail.latest_entry).toBeUndefined();
  });

  test("reads trail entries", async () => {
    const entry = makeTrailEntry({
      event_type: "command",
      description: "execution started",
    });
    await writeFile(trailPath, JSON.stringify(entry) + "\n");

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.trail.total_entries).toBe(1);
    expect(status.trail.latest_entry!.event_type).toBe("command");
    expect(status.trail.latest_entry!.description).toBe("execution started");
  });

  test("gathers recovery status from tasks with retries", async () => {
    const roadmap: RoadmapIntent = {
      version: "1.0.0",
      intent_spec_ref: "intent-spec.json",
      waves: [
        {
          id: "w1",
          parallel: false,
          tasks: [
            makeTask({
              id: "w1-t1",
              status: "failed",
              retry_count: 2,
              banned_approaches: ["approach-a", "approach-b"],
            }),
            makeTask({ id: "w1-t2", status: "passed", retry_count: 0 }),
          ],
        },
      ],
    };
    await writeFile(
      join(juhbdiDir, "roadmap-intent.json"),
      JSON.stringify(roadmap)
    );

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.recovery.tasks_with_retries).toBe(1);
    expect(status.recovery.total_retries).toBe(2);
    expect(status.recovery.banned_approaches).toEqual([
      { task_id: "w1-t1", approaches: ["approach-a", "approach-b"] },
    ]);
  });

  test("includes blocked count in wave details", async () => {
    const roadmap: RoadmapIntent = {
      version: "1.0.0",
      intent_spec_ref: "intent-spec.json",
      waves: [
        {
          id: "w1",
          parallel: false,
          tasks: [
            makeTask({ id: "w1-t1", status: "blocked" }),
            makeTask({ id: "w1-t2", status: "running" }),
          ],
        },
      ],
    };
    await writeFile(
      join(juhbdiDir, "roadmap-intent.json"),
      JSON.stringify(roadmap)
    );

    const status = await gatherStatus(juhbdiDir, trailPath);
    expect(status.intentions!.wave_details[0].blocked).toBe(1);
    expect(status.intentions!.wave_details[0].running).toBe(1);
  });
});

describe("detectFailurePatterns", () => {
  test("returns empty when fewer than 2 recovery entries", () => {
    const tasks = [makeTask({ id: "w1-t1" })];
    const entries = [makeTrailEntry({ task_id: "w1-t1" })];
    const patterns = detectFailurePatterns(tasks, entries);
    expect(patterns).toEqual([]);
  });

  test("returns empty when all recoveries are from a single task", () => {
    const tasks = [makeTask({ id: "w1-t1" })];
    const entries = [
      makeTrailEntry({ task_id: "w1-t1", description: "Task failed: Module not found xyz" }),
      makeTrailEntry({ task_id: "w1-t1", description: "Task failed: Module not found xyz again" }),
    ];
    const patterns = detectFailurePatterns(tasks, entries);
    expect(patterns).toEqual([]);
  });

  test("detects common error pattern across tasks", () => {
    const tasks = [
      makeTask({ id: "w1-t1" }),
      makeTask({ id: "w1-t2" }),
    ];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: Module not found xyz in project",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: Module not found xyz in project",
      }),
    ];
    const patterns = detectFailurePatterns(tasks, entries);
    expect(patterns.length).toBeGreaterThan(0);
    // Should find a common pattern
    const hasCommon = patterns.some(
      (p) => p.task_ids.includes("w1-t1") && p.task_ids.includes("w1-t2")
    );
    expect(hasCommon).toBe(true);
  });

  test("identifies pattern occurrences correctly", () => {
    const tasks = [
      makeTask({ id: "w1-t1" }),
      makeTask({ id: "w1-t2" }),
      makeTask({ id: "w1-t3" }),
    ];
    const entries = [
      makeTrailEntry({
        task_id: "w1-t1",
        description: "Task failed: Cannot resolve dependency @types/node in environment",
      }),
      makeTrailEntry({
        task_id: "w1-t2",
        description: "Task failed: Cannot resolve dependency @types/node in environment",
      }),
      makeTrailEntry({
        task_id: "w1-t3",
        description: "Task failed: Cannot resolve dependency @types/node in environment",
      }),
    ];
    const patterns = detectFailurePatterns(tasks, entries);
    const topPattern = patterns[0];
    expect(topPattern.occurrences).toBe(3);
    expect(topPattern.task_ids).toEqual(["w1-t1", "w1-t2", "w1-t3"]);
  });

  test("ignores non-recovery trail entries", () => {
    const tasks = [makeTask({ id: "w1-t1" }), makeTask({ id: "w1-t2" })];
    const entries = [
      makeTrailEntry({
        event_type: "command",
        task_id: "w1-t1",
        description: "execution loop started with some long text content",
      }),
      makeTrailEntry({
        event_type: "command",
        task_id: "w1-t2",
        description: "execution loop started with some long text content",
      }),
    ];
    const patterns = detectFailurePatterns(tasks, entries);
    expect(patterns).toEqual([]);
  });
});
