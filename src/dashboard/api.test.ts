import { describe, test, expect } from "bun:test";
import { getProjectState, getTrailEntries, getCostData, getMemoryStats, getContextHealth } from "./api";
import fs from "fs";
import path from "path";
import os from "os";

describe("Dashboard API", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-dash-"));
  const juhbdiDir = path.join(tmpDir, ".juhbdi");
  fs.mkdirSync(juhbdiDir, { recursive: true });

  test("getProjectState returns null for missing files", () => {
    const state = getProjectState(juhbdiDir);
    expect(state.state).toBeNull();
    expect(state.timestamp).toBeTruthy();
  });

  test("getTrailEntries returns empty for missing trail", () => {
    expect(getTrailEntries(juhbdiDir)).toEqual([]);
  });

  test("getTrailEntries parses JSONL", () => {
    fs.writeFileSync(path.join(juhbdiDir, "decision-trail.log"),
      '{"event_type":"decision","description":"test"}\n{"event_type":"routing","description":"route"}\n');
    const entries = getTrailEntries(juhbdiDir);
    expect(entries.length).toBe(2);
  });

  test("getCostData computes savings", () => {
    const cost = getCostData(juhbdiDir);
    expect(typeof cost.total_spend).toBe("number");
    expect(typeof cost.savings_pct).toBe("number");
  });

  test("getMemoryStats returns zeros for empty project", () => {
    const stats = getMemoryStats(juhbdiDir);
    expect(stats.reflexion_count).toBe(0);
    expect(stats.trace_count).toBe(0);
  });

  test("getContextHealth returns NORMAL without bridge", () => {
    const health = getContextHealth("nonexistent-session");
    expect(health.level).toBe("NORMAL");
    expect(health.remaining_pct).toBe(100);
  });

  test("cleanup", () => {
    fs.rmSync(tmpDir, { recursive: true });
    expect(true).toBe(true);
  });
});
