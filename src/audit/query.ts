// src/audit/query.ts
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import type { AuditFilter, AuditSummary, ComplianceReport } from "./types";

export function filterTrail(
  entries: DecisionTrailEntry[],
  filter: AuditFilter
): DecisionTrailEntry[] {
  return entries.filter((entry) => {
    if (filter.event_type && entry.event_type !== filter.event_type) {
      return false;
    }
    if (filter.task_id && entry.task_id !== filter.task_id) {
      return false;
    }
    if (filter.wave_id && entry.wave_id !== filter.wave_id) {
      return false;
    }
    if (filter.from && entry.timestamp < filter.from) {
      return false;
    }
    if (filter.to && entry.timestamp > filter.to) {
      return false;
    }
    return true;
  });
}

export function summarizeTrail(entries: DecisionTrailEntry[]): AuditSummary {
  const byEventType: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const taskIds = new Set<string>();
  const waveIds = new Set<string>();

  for (const entry of entries) {
    byEventType[entry.event_type] = (byEventType[entry.event_type] ?? 0) + 1;
    byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
    if (entry.task_id) taskIds.add(entry.task_id);
    if (entry.wave_id) waveIds.add(entry.wave_id);
  }

  const dateRange =
    entries.length > 0
      ? { first: entries[0].timestamp, last: entries[entries.length - 1].timestamp }
      : null;

  return {
    total_entries: entries.length,
    by_event_type: byEventType,
    by_outcome: byOutcome,
    unique_tasks: taskIds.size,
    unique_waves: waveIds.size,
    date_range: dateRange,
  };
}

export function generateComplianceReport(
  entries: DecisionTrailEntry[]
): ComplianceReport {
  const issues: string[] = [];

  // Only count entries that represent autonomous decisions (not commands)
  const decisions = entries.filter(
    (e) => e.event_type !== "command"
  );

  const totalDecisions = decisions.length;

  if (totalDecisions === 0) {
    return {
      total_decisions: 0,
      decisions_with_reasoning: 0,
      decisions_with_alternatives: 0,
      decisions_with_constraints: 0,
      override_count: 0,
      escalation_count: 0,
      compliance_score: 100,
      issues: ["No decisions to audit."],
    };
  }

  const withReasoning = decisions.filter(
    (e) => e.reasoning.trim().length > 0
  ).length;

  const withAlternatives = decisions.filter(
    (e) => e.alternatives_considered.length > 0
  ).length;

  const withConstraints = decisions.filter(
    (e) => e.constraint_refs.length > 0
  ).length;

  const overrideCount = decisions.filter(
    (e) => e.event_type === "override"
  ).length;

  const escalationCount = decisions.filter(
    (e) => e.outcome === "escalated"
  ).length;

  // Compliance scoring: 3 criteria per decision
  // 1. Has non-empty reasoning (EU AI Act explainability)
  // 2. Has alternatives_considered (deliberation evidence)
  // 3. Has constraint_refs (traceability)
  const totalCriteria = totalDecisions * 3;
  const criteriaMet = withReasoning + withAlternatives + withConstraints;
  const complianceScore = Math.round((criteriaMet / totalCriteria) * 100);

  // Build issue list
  const missingReasoning = totalDecisions - withReasoning;
  if (missingReasoning > 0) {
    issues.push(
      `${missingReasoning} decision${missingReasoning > 1 ? "s" : ""} missing reasoning`
    );
  }

  const missingAlternatives = totalDecisions - withAlternatives;
  if (missingAlternatives > 0) {
    issues.push(
      `${missingAlternatives} decision${missingAlternatives > 1 ? "s" : ""} missing alternatives_considered`
    );
  }

  const missingConstraints = totalDecisions - withConstraints;
  if (missingConstraints > 0) {
    issues.push(
      `${missingConstraints} decision${missingConstraints > 1 ? "s" : ""} missing constraint_refs`
    );
  }

  // Check that overrides have full reasoning
  const overridesWithoutReasoning = decisions.filter(
    (e) => e.event_type === "override" && e.reasoning.trim().length === 0
  ).length;
  if (overridesWithoutReasoning > 0) {
    issues.push(
      `${overridesWithoutReasoning} override${overridesWithoutReasoning > 1 ? "s" : ""} missing reasoning (critical for compliance)`
    );
  }

  return {
    total_decisions: totalDecisions,
    decisions_with_reasoning: withReasoning,
    decisions_with_alternatives: withAlternatives,
    decisions_with_constraints: withConstraints,
    override_count: overrideCount,
    escalation_count: escalationCount,
    compliance_score: complianceScore,
    issues,
  };
}
