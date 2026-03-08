// src/audit/query.test.ts
import { describe, expect, test } from "bun:test";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import { filterTrail, summarizeTrail, generateComplianceReport } from "./query";

function makeEntry(overrides: Partial<DecisionTrailEntry> = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-01T10:00:00.000Z",
    event_type: "decision",
    description: "Test decision",
    reasoning: "Test reasoning",
    alternatives_considered: ["alt1"],
    constraint_refs: ["c1"],
    outcome: "approved",
    ...overrides,
  };
}

const sampleTrail: DecisionTrailEntry[] = [
  makeEntry({
    timestamp: "2026-03-01T09:00:00.000Z",
    event_type: "command",
    description: "Plan started",
    reasoning: "User initiated planning",
    alternatives_considered: [],
    constraint_refs: [],
  }),
  makeEntry({
    timestamp: "2026-03-01T09:01:00.000Z",
    event_type: "decision",
    task_id: "w1-t1",
    wave_id: "w1",
    description: "Socratic challenge approved",
    reasoning: "No conflicts found",
    alternatives_considered: ["approach-a"],
    constraint_refs: ["c1"],
  }),
  makeEntry({
    timestamp: "2026-03-01T09:02:00.000Z",
    event_type: "override",
    task_id: "w1-t2",
    wave_id: "w1",
    description: "User overrode constraint",
    reasoning: "Business priority overrides technical constraint",
    alternatives_considered: ["override", "reject"],
    constraint_refs: ["c2"],
    outcome: "approved",
  }),
  makeEntry({
    timestamp: "2026-03-01T09:03:00.000Z",
    event_type: "recovery",
    task_id: "w2-t1",
    wave_id: "w2",
    description: "Task failed, retrying",
    reasoning: "Approach banned, trying alternative",
    alternatives_considered: ["first-approach"],
    constraint_refs: ["g1"],
    outcome: "escalated",
  }),
  makeEntry({
    timestamp: "2026-03-02T10:00:00.000Z",
    event_type: "decision",
    task_id: "w2-t1",
    wave_id: "w2",
    description: "Task passed on retry",
    reasoning: "Alternative approach worked",
    alternatives_considered: ["first-approach", "second-approach"],
    constraint_refs: ["g1"],
  }),
];

describe("filterTrail", () => {
  test("returns all entries with empty filter", () => {
    const result = filterTrail(sampleTrail, {});
    expect(result).toHaveLength(5);
  });

  test("filters by event_type", () => {
    const result = filterTrail(sampleTrail, { event_type: "decision" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.event_type === "decision")).toBe(true);
  });

  test("filters by task_id", () => {
    const result = filterTrail(sampleTrail, { task_id: "w1-t1" });
    expect(result).toHaveLength(1);
    expect(result[0].task_id).toBe("w1-t1");
  });

  test("filters by wave_id", () => {
    const result = filterTrail(sampleTrail, { wave_id: "w2" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.wave_id === "w2")).toBe(true);
  });

  test("filters by date range (from)", () => {
    const result = filterTrail(sampleTrail, { from: "2026-03-02T00:00:00.000Z" });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Task passed on retry");
  });

  test("filters by date range (to)", () => {
    const result = filterTrail(sampleTrail, { to: "2026-03-01T09:01:30.000Z" });
    expect(result).toHaveLength(2);
  });

  test("filters by date range (from + to)", () => {
    const result = filterTrail(sampleTrail, {
      from: "2026-03-01T09:01:00.000Z",
      to: "2026-03-01T09:03:00.000Z",
    });
    expect(result).toHaveLength(3);
  });

  test("combines multiple filters", () => {
    const result = filterTrail(sampleTrail, {
      event_type: "decision",
      wave_id: "w2",
    });
    expect(result).toHaveLength(1);
    expect(result[0].task_id).toBe("w2-t1");
  });

  test("returns empty for no matches", () => {
    const result = filterTrail(sampleTrail, { task_id: "nonexistent" });
    expect(result).toHaveLength(0);
  });

  test("entries without task_id excluded by task_id filter", () => {
    const result = filterTrail(sampleTrail, { task_id: "w1-t1" });
    expect(result).toHaveLength(1);
    // The command entry has no task_id so it's excluded
  });
});

describe("summarizeTrail", () => {
  test("returns correct totals", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.total_entries).toBe(5);
  });

  test("counts by event type", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.by_event_type).toEqual({
      command: 1,
      decision: 2,
      override: 1,
      recovery: 1,
    });
  });

  test("counts by outcome", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.by_outcome).toEqual({
      approved: 4,
      escalated: 1,
    });
  });

  test("counts unique tasks", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.unique_tasks).toBe(3);
  });

  test("counts unique waves", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.unique_waves).toBe(2);
  });

  test("computes date range", () => {
    const summary = summarizeTrail(sampleTrail);
    expect(summary.date_range).toEqual({
      first: "2026-03-01T09:00:00.000Z",
      last: "2026-03-02T10:00:00.000Z",
    });
  });

  test("handles empty trail", () => {
    const summary = summarizeTrail([]);
    expect(summary.total_entries).toBe(0);
    expect(summary.by_event_type).toEqual({});
    expect(summary.by_outcome).toEqual({});
    expect(summary.unique_tasks).toBe(0);
    expect(summary.unique_waves).toBe(0);
    expect(summary.date_range).toBeNull();
  });
});

describe("generateComplianceReport", () => {
  test("returns 100% for fully compliant trail", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({
        event_type: "decision",
        reasoning: "Full reasoning",
        alternatives_considered: ["a", "b"],
        constraint_refs: ["c1"],
      }),
      makeEntry({
        event_type: "decision",
        reasoning: "Another reason",
        alternatives_considered: ["x"],
        constraint_refs: ["c2"],
      }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.compliance_score).toBe(100);
    expect(report.total_decisions).toBe(2);
    expect(report.decisions_with_reasoning).toBe(2);
    expect(report.decisions_with_alternatives).toBe(2);
    expect(report.decisions_with_constraints).toBe(2);
    expect(report.issues).toHaveLength(0);
  });

  test("excludes command entries from compliance scoring", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "command", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
      makeEntry({ event_type: "decision", reasoning: "good", alternatives_considered: ["a"], constraint_refs: ["c1"] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.total_decisions).toBe(1);
    expect(report.compliance_score).toBe(100);
  });

  test("flags missing reasoning", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "", alternatives_considered: ["a"], constraint_refs: ["c1"] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.decisions_with_reasoning).toBe(0);
    expect(report.issues).toContain("1 decision missing reasoning");
    expect(report.compliance_score).toBe(67);
  });

  test("flags missing alternatives_considered", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "good", alternatives_considered: [], constraint_refs: ["c1"] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.decisions_with_alternatives).toBe(0);
    expect(report.issues).toContain("1 decision missing alternatives_considered");
  });

  test("flags missing constraint_refs", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "good", alternatives_considered: ["a"], constraint_refs: [] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.decisions_with_constraints).toBe(0);
    expect(report.issues).toContain("1 decision missing constraint_refs");
  });

  test("counts overrides and escalations", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "override", reasoning: "overriding", alternatives_considered: ["a"], constraint_refs: ["c1"], outcome: "approved" }),
      makeEntry({ event_type: "override", reasoning: "another override", alternatives_considered: ["b"], constraint_refs: ["c2"], outcome: "approved" }),
      makeEntry({ event_type: "decision", reasoning: "escalated", alternatives_considered: ["c"], constraint_refs: ["c3"], outcome: "escalated" }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.override_count).toBe(2);
    expect(report.escalation_count).toBe(1);
  });

  test("flags overrides missing reasoning", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "override", reasoning: "", alternatives_considered: ["a"], constraint_refs: ["c1"] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.issues).toContain(
      "1 override missing reasoning (critical for compliance)"
    );
  });

  test("handles empty trail", () => {
    const report = generateComplianceReport([]);
    expect(report.total_decisions).toBe(0);
    expect(report.compliance_score).toBe(100);
    expect(report.issues).toEqual(["No decisions to audit."]);
  });

  test("handles all criteria missing", () => {
    const entries: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
      makeEntry({ event_type: "recovery", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
    ];
    const report = generateComplianceReport(entries);
    expect(report.compliance_score).toBe(0);
    expect(report.issues).toContain("2 decisions missing reasoning");
    expect(report.issues).toContain("2 decisions missing alternatives_considered");
    expect(report.issues).toContain("2 decisions missing constraint_refs");
  });

  test("pluralizes correctly for single vs multiple", () => {
    const single: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
    ];
    const report = generateComplianceReport(single);
    expect(report.issues).toContain("1 decision missing reasoning");

    const multiple: DecisionTrailEntry[] = [
      makeEntry({ event_type: "decision", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
      makeEntry({ event_type: "recovery", reasoning: "", alternatives_considered: [], constraint_refs: [] }),
    ];
    const report2 = generateComplianceReport(multiple);
    expect(report2.issues).toContain("2 decisions missing reasoning");
  });

  test("sample trail produces expected compliance", () => {
    const report = generateComplianceReport(sampleTrail);
    // sampleTrail has 4 non-command entries, all with reasoning, all with alternatives, all with constraints
    expect(report.total_decisions).toBe(4);
    expect(report.decisions_with_reasoning).toBe(4);
    expect(report.decisions_with_alternatives).toBe(4);
    expect(report.decisions_with_constraints).toBe(4);
    expect(report.compliance_score).toBe(100);
    expect(report.override_count).toBe(1);
    expect(report.escalation_count).toBe(1);
  });
});
