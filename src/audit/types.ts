// src/audit/types.ts

export interface AuditFilter {
  event_type?: string;
  task_id?: string;
  wave_id?: string;
  from?: string;
  to?: string;
}

export interface AuditSummary {
  total_entries: number;
  by_event_type: Record<string, number>;
  by_outcome: Record<string, number>;
  unique_tasks: number;
  unique_waves: number;
  date_range: { first: string; last: string } | null;
}

export interface ComplianceReport {
  total_decisions: number;
  decisions_with_reasoning: number;
  decisions_with_alternatives: number;
  decisions_with_constraints: number;
  override_count: number;
  escalation_count: number;
  compliance_score: number;
  issues: string[];
}
