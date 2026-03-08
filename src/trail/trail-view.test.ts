// src/trail/trail-view.test.ts
import { describe, expect, test } from "bun:test";
import { filterTrail } from "./filter";
import { formatTrail } from "./format";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

function makeEntry(overrides: Partial<DecisionTrailEntry> = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-05T10:00:00.000Z",
    event_type: "decision",
    description: "Test entry",
    reasoning: "test reasoning",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "approved",
    ...overrides,
  };
}

describe("trail-view integration", () => {
  test("filter then format pipeline produces valid output", () => {
    const entries = [
      makeEntry({ event_type: "routing", timestamp: "2026-03-05T12:00:00.000Z", description: "route-1" }),
      makeEntry({ event_type: "decision", timestamp: "2026-03-05T11:00:00.000Z", description: "decision-1" }),
      makeEntry({ event_type: "routing", timestamp: "2026-03-05T10:00:00.000Z", description: "route-2" }),
    ];

    const filtered = filterTrail(entries, { type: "routing", last: 1 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].description).toBe("route-1");

    const output = formatTrail(filtered);
    expect(typeof output).toBe("string");
    expect(output).toContain("Decision Trail");
    expect(output).toContain("route-1");
    expect(output).not.toContain("decision-1");
  });

  test("filter with task and wave args then format", () => {
    const entries = [
      makeEntry({ task_id: "w1-t1", wave_id: "wave-1", description: "match" }),
      makeEntry({ task_id: "w1-t1", wave_id: "wave-2", description: "wrong-wave" }),
      makeEntry({ task_id: "w2-t1", wave_id: "wave-1", description: "wrong-task" }),
    ];

    const filtered = filterTrail(entries, { task_id: "w1-t1", wave_id: "wave-1" });
    expect(filtered).toHaveLength(1);

    const output = formatTrail(filtered);
    expect(output).toContain("match");
    expect(output).not.toContain("wrong-wave");
    expect(output).not.toContain("wrong-task");
  });

  test("empty trail produces no-entries message", () => {
    const filtered = filterTrail([], {});
    const output = formatTrail(filtered);
    expect(output).toContain("No trail entries");
  });

  test("--last with no other filters returns most recent N", () => {
    const entries = [
      makeEntry({ timestamp: "2026-03-05T10:00:00.000Z", description: "oldest" }),
      makeEntry({ timestamp: "2026-03-05T12:00:00.000Z", description: "newest" }),
      makeEntry({ timestamp: "2026-03-05T11:00:00.000Z", description: "middle" }),
    ];

    const filtered = filterTrail(entries, { last: 2 });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].description).toBe("newest");
    expect(filtered[1].description).toBe("middle");

    const output = formatTrail(filtered);
    expect(output).toContain("newest");
    expect(output).toContain("middle");
    expect(output).not.toContain("oldest");
  });

  test("trail-view.ts CLI entry point file exists", async () => {
    // Verify the CLI entry point file exists on disk (it's a side-effect script, not importable in tests)
    const file = Bun.file(import.meta.dir + "/../cli-utils/trail-view.ts");
    expect(await file.exists()).toBe(true);
    const text = await file.text();
    expect(text).toContain("filterTrail");
    expect(text).toContain("formatTrail");
    expect(text).toContain("resolveContext");
    expect(text).toContain("readTrail");
    expect(text).toContain("--type");
    expect(text).toContain("--last");
    expect(text).toContain("--task");
    expect(text).toContain("--wave");
  });
});
