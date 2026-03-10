import { describe, test, expect } from "bun:test";
import { getProjectState, getTrailEntries, getCostData, getMemoryStats, getContextHealth, getActiveSessions, getCodeHealth } from "./api";
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

  test("getActiveSessions returns ProjectGroup array", () => {
    const sessions = getActiveSessions();
    expect(Array.isArray(sessions)).toBe(true);
    // Each entry should be a ProjectGroup
    for (const group of sessions) {
      expect(group).toHaveProperty("project_dir");
      expect(group).toHaveProperty("sessions");
      expect(Array.isArray(group.sessions)).toBe(true);
    }
  });

  test("getActiveSessions reads bridge files from /tmp", () => {
    // Write a fake bridge file
    const fakeSessionId = `test-dash-${Date.now()}`;
    const bridgePath = `/tmp/juhbdi-ctx-${fakeSessionId}.json`;
    fs.writeFileSync(bridgePath, JSON.stringify({
      session_id: fakeSessionId,
      project_dir: "/tmp/fake-project",
      ide_platform: "cursor",
      remaining_pct: 72,
      usable_pct: 55.5,
      timestamp: new Date().toISOString(),
    }));

    try {
      const sessions = getActiveSessions();
      const flat = sessions.flatMap(g => g.sessions);
      const found = flat.find(s => s.session_id === fakeSessionId);
      expect(found).toBeTruthy();
      expect(found!.remaining_pct).toBe(72);
      expect(found!.ide_platform).toBe("cursor");
      expect(found!.project_dir).toBe("/tmp/fake-project");
      expect(found!.level).toBe("NORMAL");
      expect(found!.stale).toBe(false);
    } finally {
      try { fs.unlinkSync(bridgePath); } catch {}
    }
  });

  test("getActiveSessions marks old sessions as stale", () => {
    const fakeSessionId = `test-stale-${Date.now()}`;
    const bridgePath = `/tmp/juhbdi-ctx-${fakeSessionId}.json`;
    fs.writeFileSync(bridgePath, JSON.stringify({
      session_id: fakeSessionId,
      project_dir: "/tmp/stale-project",
      ide_platform: "claude-code",
      remaining_pct: 40,
      usable_pct: 23.5,
      timestamp: new Date(Date.now() - 300_000).toISOString(), // 5 min ago
    }));

    try {
      const sessions = getActiveSessions();
      const flat = sessions.flatMap(g => g.sessions);
      const found = flat.find(s => s.session_id === fakeSessionId);
      expect(found).toBeTruthy();
      expect(found!.stale).toBe(true);
      expect(found!.level).toBe("WARNING");
    } finally {
      try { fs.unlinkSync(bridgePath); } catch {}
    }
  });

  test("getActiveSessions groups by project_dir", () => {
    const id1 = `test-grp1-${Date.now()}`;
    const id2 = `test-grp2-${Date.now()}`;
    const bp1 = `/tmp/juhbdi-ctx-${id1}.json`;
    const bp2 = `/tmp/juhbdi-ctx-${id2}.json`;
    const now = new Date().toISOString();

    fs.writeFileSync(bp1, JSON.stringify({
      session_id: id1, project_dir: "/tmp/same-project",
      ide_platform: "claude-code", remaining_pct: 80, usable_pct: 63.5, timestamp: now,
    }));
    fs.writeFileSync(bp2, JSON.stringify({
      session_id: id2, project_dir: "/tmp/same-project",
      ide_platform: "cursor", remaining_pct: 55, usable_pct: 38.5, timestamp: now,
    }));

    try {
      const sessions = getActiveSessions();
      const group = sessions.find(g => g.project_dir === "/tmp/same-project");
      expect(group).toBeTruthy();
      expect(group!.sessions.length).toBeGreaterThanOrEqual(2);
      const ides = group!.sessions.map(s => s.ide_platform);
      expect(ides).toContain("claude-code");
      expect(ides).toContain("cursor");
    } finally {
      try { fs.unlinkSync(bp1); } catch {}
      try { fs.unlinkSync(bp2); } catch {}
    }
  });

  test("getCostData returns spend_over_time array", () => {
    fs.writeFileSync(path.join(juhbdiDir, "decision-trail.log"), [
      JSON.stringify({ event_type: "routing", description: "route to sonnet", cost_estimate: 0.01, opus_equivalent_cost: 0.05, timestamp: "2026-03-10T10:00:00Z", routed_to: "sonnet" }),
      JSON.stringify({ event_type: "routing", description: "route to haiku", cost_estimate: 0.005, opus_equivalent_cost: 0.05, timestamp: "2026-03-10T10:01:00Z", routed_to: "haiku" }),
      JSON.stringify({ event_type: "routing", description: "route to opus", cost_estimate: 0.05, opus_equivalent_cost: 0.05, timestamp: "2026-03-10T10:02:00Z", routed_to: "opus" }),
    ].join("\n") + "\n");

    const cost = getCostData(juhbdiDir);
    expect(cost.spend_over_time).toBeDefined();
    expect(Array.isArray(cost.spend_over_time)).toBe(true);
    expect(cost.spend_over_time.length).toBe(3);
    expect(cost.spend_over_time[0].cumulative).toBeCloseTo(0.01);
    expect(cost.spend_over_time[1].cumulative).toBeCloseTo(0.015);
    expect(cost.spend_over_time[2].cumulative).toBeCloseTo(0.065);
    expect(cost.spend_over_time[0].timestamp).toBe("2026-03-10T10:00:00Z");
  });

  test("getMemoryStats returns full lists", () => {
    fs.writeFileSync(path.join(juhbdiDir, "reflexion-bank.json"), JSON.stringify({
      entries: [
        { task_description: "task1", lesson: "lesson1", outcome: "success" },
        { task_description: "task2", lesson: "lesson2", outcome: "failure" },
        { task_description: "task3", lesson: "lesson3", outcome: "success" },
        { task_description: "task4", lesson: "lesson4", outcome: "partial" },
      ]
    }));
    fs.writeFileSync(path.join(juhbdiDir, "experiential-traces.json"), JSON.stringify({
      traces: [
        { summary: "trace1", success: true },
        { summary: "trace2", success: false },
      ]
    }));
    fs.writeFileSync(path.join(juhbdiDir, "principle-bank.json"), JSON.stringify({
      principles: [
        { text: "p1", source: "reflexion", confidence: 0.9 },
      ]
    }));

    const stats = getMemoryStats(juhbdiDir);
    expect(stats.reflexion_count).toBe(4);
    expect(stats.all_reflexions).toBeDefined();
    expect(stats.all_reflexions.length).toBe(4);
    expect(stats.all_traces).toBeDefined();
    expect(stats.all_traces.length).toBe(2);
    expect(stats.all_principles).toBeDefined();
    expect(stats.all_principles.length).toBe(1);
    expect(stats.recent_reflexions.length).toBe(3);
  });

  test("getCodeHealth returns analysis result", () => {
    const projectRoot = process.cwd();
    const result = getCodeHealth(projectRoot);
    expect(result).toHaveProperty("complexity");
    expect(result).toHaveProperty("deadCode");
    expect(result).toHaveProperty("callGraph");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("cached_at");
    expect(Array.isArray(result.complexity)).toBe(true);
  });

  test("getCodeHealth returns cached result on second call", () => {
    const projectRoot = process.cwd();
    const result1 = getCodeHealth(projectRoot);
    const result2 = getCodeHealth(projectRoot);
    expect(result2.cached_at).toBe(result1.cached_at);
  });

  test("cleanup", () => {
    fs.rmSync(tmpDir, { recursive: true });
    expect(true).toBe(true);
  });
});
