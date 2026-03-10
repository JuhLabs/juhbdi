// RE-TRAC State Summaries
// Research: RE-TRAC (2025) — 15-20% improvement with structured state summaries
// Format: Evidence + Uncertainties + Failures + Future Plans

export interface RETRACState {
  wave_id: string;
  timestamp: string;

  // What we know (confirmed by tests/verification)
  evidence: string[];

  // What we're unsure about
  uncertainties: string[];

  // What went wrong (with root causes)
  failures: Array<{
    task_id: string;
    description: string;
    root_cause: string;
  }>;

  // What comes next (informed by evidence + failures)
  future_plans: string[];

  // Metrics
  tasks_completed: number;
  tasks_failed: number;
  context_remaining_pct: number;
  trust_score: number;
}

export function buildStateSummary(input: {
  waveId: string;
  completedTasks: Array<{ id: string; description: string; passed: boolean; approach: string; error?: string }>;
  remainingTasks: Array<{ id: string; description: string }>;
  contextPct: number;
  trustScore: number;
}): RETRACState {
  const evidence = input.completedTasks
    .filter(t => t.passed)
    .map(t => `${t.description}: verified (${t.approach})`);

  const uncertainties: string[] = [];
  if (input.contextPct < 50) {
    uncertainties.push(`Context at ${Math.round(input.contextPct)}% — may need session handoff`);
  }
  if (input.remainingTasks.length > 5) {
    uncertainties.push(`${input.remainingTasks.length} tasks remaining — scope may need reduction`);
  }

  const failures = input.completedTasks
    .filter(t => !t.passed)
    .map(t => ({
      task_id: t.id,
      description: t.description,
      root_cause: t.error || "unknown",
    }));

  const futurePlans = input.remainingTasks
    .slice(0, 5) // next 5 tasks
    .map(t => t.description);

  if (failures.length > 0) {
    futurePlans.unshift(`Address ${failures.length} failure(s) from this wave before proceeding`);
  }

  // Cap at 5 entries total
  futurePlans.splice(5);

  return {
    wave_id: input.waveId,
    timestamp: new Date().toISOString(),
    evidence,
    uncertainties,
    failures,
    future_plans: futurePlans,
    tasks_completed: input.completedTasks.filter(t => t.passed).length,
    tasks_failed: input.completedTasks.filter(t => !t.passed).length,
    context_remaining_pct: input.contextPct,
    trust_score: input.trustScore,
  };
}

export function formatStateSummary(state: RETRACState): string {
  const lines: string[] = [];
  lines.push(`=== Wave ${state.wave_id} State Summary ===`);
  lines.push(`Tasks: ${state.tasks_completed} passed, ${state.tasks_failed} failed`);
  lines.push(`Context: ${Math.round(state.context_remaining_pct)}% | Trust: ${(state.trust_score * 100).toFixed(0)}%`);
  lines.push("");

  if (state.evidence.length > 0) {
    lines.push("EVIDENCE (verified):");
    state.evidence.forEach(e => lines.push(`  + ${e}`));
  }

  if (state.uncertainties.length > 0) {
    lines.push("UNCERTAINTIES:");
    state.uncertainties.forEach(u => lines.push(`  ? ${u}`));
  }

  if (state.failures.length > 0) {
    lines.push("FAILURES:");
    state.failures.forEach(f => lines.push(`  x ${f.description}: ${f.root_cause}`));
  }

  if (state.future_plans.length > 0) {
    lines.push("NEXT:");
    state.future_plans.forEach(p => lines.push(`  > ${p}`));
  }

  return lines.join("\n");
}
