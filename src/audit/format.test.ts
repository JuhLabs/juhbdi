// src/audit/format.test.ts
import { describe, expect, test } from "bun:test";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import type { AuditSummary, ComplianceReport } from "./types";
import { formatTable, formatSummary, formatComplianceReport } from "./format";

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

describe("formatTable", () => {
  test("returns no-match message for empty entries", () => {
    const output = formatTable([]);
    expect(output).toContain("No entries match");
  });

  test("includes header row", () => {
    const entries = [makeEntry()];
    const output = formatTable(entries);
    expect(output).toContain("Timestamp");
    expect(output).toContain("Type");
    expect(output).toContain("Outcome");
    expect(output).toContain("Task");
    expect(output).toContain("Description");
  });

  test("includes entry data", () => {
    const entries = [
      makeEntry({
        timestamp: "2026-03-01T10:00:00.000Z",
        event_type: "decision",
        task_id: "w1-t1",
        description: "Task completed",
        outcome: "approved",
      }),
    ];
    const output = formatTable(entries);
    expect(output).toContain("2026-03-01 10:00:00");
    expect(output).toContain("decision");
    expect(output).toContain("approved");
    expect(output).toContain("w1-t1");
    expect(output).toContain("Task completed");
  });

  test("shows dash for missing task_id", () => {
    const entries = [makeEntry({ task_id: undefined })];
    const output = formatTable(entries);
    expect(output).toContain("-");
  });

  test("shows entry count footer", () => {
    const entries = [makeEntry(), makeEntry()];
    const output = formatTable(entries);
    expect(output).toContain("2 entries displayed");
  });

  test("formats multiple entries", () => {
    const entries = [
      makeEntry({ description: "First", event_type: "decision" }),
      makeEntry({ description: "Second", event_type: "recovery" }),
      makeEntry({ description: "Third", event_type: "override" }),
    ];
    const output = formatTable(entries);
    expect(output).toContain("First");
    expect(output).toContain("Second");
    expect(output).toContain("Third");
    expect(output).toContain("3 entries displayed");
  });
});

describe("formatSummary", () => {
  const summary: AuditSummary = {
    total_entries: 10,
    by_event_type: { decision: 5, recovery: 3, command: 2 },
    by_outcome: { approved: 7, escalated: 2, rejected: 1 },
    unique_tasks: 4,
    unique_waves: 2,
    date_range: {
      first: "2026-03-01T09:00:00.000Z",
      last: "2026-03-02T10:00:00.000Z",
    },
  };

  test("includes title", () => {
    const output = formatSummary(summary);
    expect(output).toContain("Audit Summary");
  });

  test("shows total entries", () => {
    const output = formatSummary(summary);
    expect(output).toContain("10");
  });

  test("shows unique tasks", () => {
    const output = formatSummary(summary);
    expect(output).toContain("4");
  });

  test("shows unique waves", () => {
    const output = formatSummary(summary);
    expect(output).toContain("2");
  });

  test("shows date range", () => {
    const output = formatSummary(summary);
    expect(output).toContain("2026-03-01 09:00:00");
    expect(output).toContain("2026-03-02 10:00:00");
  });

  test("shows by event type section", () => {
    const output = formatSummary(summary);
    expect(output).toContain("By Event Type");
    expect(output).toContain("decision");
    expect(output).toContain("recovery");
    expect(output).toContain("command");
  });

  test("shows by outcome section", () => {
    const output = formatSummary(summary);
    expect(output).toContain("By Outcome");
    expect(output).toContain("approved");
    expect(output).toContain("escalated");
    expect(output).toContain("rejected");
  });

  test("handles null date range", () => {
    const emptySummary: AuditSummary = {
      total_entries: 0,
      by_event_type: {},
      by_outcome: {},
      unique_tasks: 0,
      unique_waves: 0,
      date_range: null,
    };
    const output = formatSummary(emptySummary);
    expect(output).toContain("0");
    expect(output).not.toContain("Date range");
  });
});

describe("formatComplianceReport", () => {
  test("shows compliance title", () => {
    const report: ComplianceReport = {
      total_decisions: 5,
      decisions_with_reasoning: 5,
      decisions_with_alternatives: 5,
      decisions_with_constraints: 5,
      override_count: 0,
      escalation_count: 0,
      compliance_score: 100,
      issues: [],
    };
    const output = formatComplianceReport(report);
    expect(output).toContain("Compliance Report");
    expect(output).toContain("EU AI Act");
    expect(output).toContain("ISO 42001");
  });

  test("shows compliance score", () => {
    const report: ComplianceReport = {
      total_decisions: 10,
      decisions_with_reasoning: 10,
      decisions_with_alternatives: 10,
      decisions_with_constraints: 10,
      override_count: 1,
      escalation_count: 2,
      compliance_score: 100,
      issues: [],
    };
    const output = formatComplianceReport(report);
    expect(output).toContain("100%");
  });

  test("shows all metrics", () => {
    const report: ComplianceReport = {
      total_decisions: 8,
      decisions_with_reasoning: 7,
      decisions_with_alternatives: 6,
      decisions_with_constraints: 5,
      override_count: 2,
      escalation_count: 1,
      compliance_score: 75,
      issues: [],
    };
    const output = formatComplianceReport(report);
    expect(output).toContain("8");
    expect(output).toContain("7");
    expect(output).toContain("6");
    expect(output).toContain("5");
    expect(output).toContain("2");
    expect(output).toContain("1");
  });

  test("shows issues when present", () => {
    const report: ComplianceReport = {
      total_decisions: 5,
      decisions_with_reasoning: 3,
      decisions_with_alternatives: 2,
      decisions_with_constraints: 5,
      override_count: 0,
      escalation_count: 0,
      compliance_score: 67,
      issues: [
        "2 decisions missing reasoning",
        "3 decisions missing alternatives_considered",
      ],
    };
    const output = formatComplianceReport(report);
    expect(output).toContain("Issues");
    expect(output).toContain("2 decisions missing reasoning");
    expect(output).toContain("3 decisions missing alternatives_considered");
  });

  test("shows no-issues message when compliant", () => {
    const report: ComplianceReport = {
      total_decisions: 5,
      decisions_with_reasoning: 5,
      decisions_with_alternatives: 5,
      decisions_with_constraints: 5,
      override_count: 0,
      escalation_count: 0,
      compliance_score: 100,
      issues: [],
    };
    const output = formatComplianceReport(report);
    expect(output).toContain("No compliance issues found");
  });
});
