import { describe, expect, test } from "bun:test";
import { RoadmapIntentSchema, type RoadmapIntent } from "./roadmap-intent";

describe("RoadmapIntentSchema", () => {
  const validRoadmap: RoadmapIntent = {
    version: "1.0.0",
    intent_spec_ref: ".juhbdi/intent-spec.json",
    waves: [
      {
        id: "w1",
        parallel: false,
        tasks: [
          {
            id: "t1",
            description: "Set up project structure",
            goal_refs: ["g1"],
            status: "pending",
            verification: {
              type: "test",
              command: "bun test",
            },
            retry_count: 0,
          },
        ],
      },
    ],
  };

  test("validates a correct roadmap", () => {
    const result = RoadmapIntentSchema.safeParse(validRoadmap);
    expect(result.success).toBe(true);
  });

  test("rejects invalid task status", () => {
    const invalid = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{ ...validRoadmap.waves[0].tasks[0], status: "unknown" }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("allows optional assigned_agent and worktree_branch", () => {
    const withAgent = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{
          ...validRoadmap.waves[0].tasks[0],
          assigned_agent: "agent-1",
          worktree_branch: "feat/task-1",
        }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(withAgent);
    expect(result.success).toBe(true);
  });

  test("allows banned_approaches array", () => {
    const withBanned = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{
          ...validRoadmap.waves[0].tasks[0],
          banned_approaches: ["approach-a", "approach-b"],
        }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(withBanned);
    expect(result.success).toBe(true);
  });

  test("accepts roadmap with horizon_sketch", () => {
    const roadmap = {
      ...validRoadmap,
      horizon_sketch: {
        remaining_goals: ["g2", "g3"],
        estimated_waves: 3,
        key_unknowns: ["Database driver choice depends on w1 outcome"],
      },
    };
    const result = RoadmapIntentSchema.safeParse(roadmap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.horizon_sketch).toBeDefined();
      expect(result.data.horizon_sketch!.remaining_goals).toEqual(["g2", "g3"]);
    }
  });

  test("accepts roadmap without horizon_sketch (backward compat)", () => {
    const result = RoadmapIntentSchema.safeParse(validRoadmap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.horizon_sketch).toBeUndefined();
    }
  });

  test("accepts horizon_sketch with adaptation_notes", () => {
    const roadmap = {
      ...validRoadmap,
      horizon_sketch: {
        remaining_goals: ["g2"],
        estimated_waves: 2,
        key_unknowns: [],
        adaptation_notes: "Switched from Redis to in-memory after w1 results",
      },
    };
    const result = RoadmapIntentSchema.safeParse(roadmap);
    expect(result.success).toBe(true);
  });

  test("rejects invalid verification type", () => {
    const invalid = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{
          ...validRoadmap.waves[0].tasks[0],
          verification: { type: "deploy" },
        }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("accepts task with model_tier override", () => {
    const roadmap = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{
          ...validRoadmap.waves[0].tasks[0],
          model_tier: "opus",
        }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(roadmap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.waves[0].tasks[0].model_tier).toBe("opus");
    }
  });

  test("defaults model_tier to auto", () => {
    const result = RoadmapIntentSchema.safeParse(validRoadmap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.waves[0].tasks[0].model_tier).toBe("auto");
    }
  });

  test("rejects invalid model_tier", () => {
    const roadmap = {
      ...validRoadmap,
      waves: [{
        ...validRoadmap.waves[0],
        tasks: [{
          ...validRoadmap.waves[0].tasks[0],
          model_tier: "gpt4",
        }],
      }],
    };
    const result = RoadmapIntentSchema.safeParse(roadmap);
    expect(result.success).toBe(false);
  });
});
