/**
 * NIST AI Risk Management Framework (AI RMF 1.0) Crosswalk
 *
 * Maps JuhBDI's governance features to NIST AI RMF functions:
 *   GOVERN — organizational policies and oversight
 *   MAP    — context and risk identification
 *   MEASURE — analysis and assessment
 *   MANAGE — risk treatment and monitoring
 *
 * Reference: https://www.nist.gov/artificial-intelligence/ai-risk-management-framework
 */

export type NISTFunction = "GOVERN" | "MAP" | "MEASURE" | "MANAGE";

export interface NISTMapping {
  function: NISTFunction;
  category: string;
  subcategory: string;
  juhbdi_component: string;
  coverage: "full" | "partial" | "none";
  evidence_source: string;
}

export const NIST_CROSSWALK: NISTMapping[] = [
  // ═══════════════════════════════════════════════════════════════════
  // GOVERN — Policies, processes, procedures, and practices
  // ═══════════════════════════════════════════════════════════════════
  {
    function: "GOVERN", category: "1", subcategory: "1.1",
    juhbdi_component: "intent-spec.json constraints and goals",
    coverage: "full", evidence_source: ".juhbdi/intent-spec.json",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.2",
    juhbdi_component: "Tradeoff weights (quality/speed/security)",
    coverage: "full", evidence_source: ".juhbdi/intent-spec.json#tradeoff_weights",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.3",
    juhbdi_component: "HITL gates in intent-spec",
    coverage: "full", evidence_source: ".juhbdi/intent-spec.json#hitl_gates",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.4",
    juhbdi_component: "Decision trail with Article 12 compliance fields",
    coverage: "full", evidence_source: ".juhbdi/decision-trail.log",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.5",
    juhbdi_component: "EU AI Act risk classification (Article 12)",
    coverage: "full", evidence_source: "src/schemas/eu-ai-act.ts",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.6",
    juhbdi_component: "Retention policy configuration",
    coverage: "full", evidence_source: ".juhbdi/intent-spec.json#retention_policy",
  },
  {
    function: "GOVERN", category: "1", subcategory: "1.7",
    juhbdi_component: "Trust store with tier scoring",
    coverage: "full", evidence_source: ".juhbdi/trust-store.json",
  },
  {
    function: "GOVERN", category: "2", subcategory: "2.1",
    juhbdi_component: "Project config (model, HITL mode, retries)",
    coverage: "full", evidence_source: ".juhbdi/config.json",
  },
  {
    function: "GOVERN", category: "2", subcategory: "2.2",
    juhbdi_component: "Governance checker for file writes",
    coverage: "full", evidence_source: "src/governance/compliance-checker.ts",
  },
  {
    function: "GOVERN", category: "2", subcategory: "2.3",
    juhbdi_component: "Autonomy certification system",
    coverage: "full", evidence_source: "src/governance/autonomy-cert.ts",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MAP — Context, risk identification, and characterization
  // ═══════════════════════════════════════════════════════════════════
  {
    function: "MAP", category: "1", subcategory: "1.1",
    juhbdi_component: "Socratic challenge in /juhbdi:plan",
    coverage: "full", evidence_source: "decision-trail.log?event_type=decision",
  },
  {
    function: "MAP", category: "1", subcategory: "1.2",
    juhbdi_component: "Codebase scanning during /juhbdi:init",
    coverage: "full", evidence_source: "commands/init.md#Step2",
  },
  {
    function: "MAP", category: "1", subcategory: "1.3",
    juhbdi_component: "Repo map structural analysis",
    coverage: "full", evidence_source: ".juhbdi/repo-map.json",
  },
  {
    function: "MAP", category: "1", subcategory: "1.6",
    juhbdi_component: "Intent check pre-task validation",
    coverage: "full", evidence_source: "src/cli-utils/intent-check.ts",
  },
  {
    function: "MAP", category: "2", subcategory: "2.1",
    juhbdi_component: "Difficulty estimation for task routing",
    coverage: "full", evidence_source: "src/cli-utils/difficulty.ts",
  },
  {
    function: "MAP", category: "2", subcategory: "2.2",
    juhbdi_component: "Speculation engine — past failure pattern matching",
    coverage: "full", evidence_source: "src/cli-utils/speculate.ts",
  },
  {
    function: "MAP", category: "3", subcategory: "3.1",
    juhbdi_component: "Model routing with 5-signal analysis",
    coverage: "full", evidence_source: "src/routing/route-task.ts",
  },
  {
    function: "MAP", category: "3", subcategory: "3.2",
    juhbdi_component: "Failure classification taxonomy",
    coverage: "full", evidence_source: "src/cli-utils/classify-failure.ts",
  },
  {
    function: "MAP", category: "3", subcategory: "3.5",
    juhbdi_component: "Context health monitoring (4-level system)",
    coverage: "full", evidence_source: ".claude-plugin/hooks/juhbdi-context-monitor.cjs",
  },
  {
    function: "MAP", category: "5", subcategory: "5.1",
    juhbdi_component: "MCP input sanitizer",
    coverage: "full", evidence_source: "src/governance/mcp-sanitizer.ts",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MEASURE — Analysis, assessment, and monitoring
  // ═══════════════════════════════════════════════════════════════════
  {
    function: "MEASURE", category: "1", subcategory: "1.1",
    juhbdi_component: "TNR test non-regression detection",
    coverage: "full", evidence_source: "src/memory/tnr.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.1",
    juhbdi_component: "Verifier chain (typecheck→lint→test→build)",
    coverage: "full", evidence_source: "src/core/verifier-chain.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.3",
    juhbdi_component: "35-minute time guard for task decomposition",
    coverage: "full", evidence_source: "commands/plan.md#TimeGuard",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.6",
    juhbdi_component: "Cost tracking with per-tier estimates",
    coverage: "full", evidence_source: "src/cost/cost-tracker.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.7",
    juhbdi_component: "Divergence detection with adaptive replanning",
    coverage: "full", evidence_source: "src/memory/adaptive-replan.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.10",
    juhbdi_component: "Reflexion bank — failure and success pattern learning",
    coverage: "full", evidence_source: "src/memory/reflexion.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.11",
    juhbdi_component: "Experiential trace store",
    coverage: "full", evidence_source: "src/memory/experiential-trace.ts",
  },
  {
    function: "MEASURE", category: "2", subcategory: "2.12",
    juhbdi_component: "Principle extraction and confidence scoring",
    coverage: "full", evidence_source: "src/memory/principles.ts",
  },
  {
    function: "MEASURE", category: "3", subcategory: "3.2",
    juhbdi_component: "Performance benchmarks (routing-sim, perf)",
    coverage: "full", evidence_source: "src/bench/",
  },
  {
    function: "MEASURE", category: "4", subcategory: "4.1",
    juhbdi_component: "Memory bank with utility scoring",
    coverage: "full", evidence_source: "src/memory/memory-bank.ts",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MANAGE — Risk treatment, monitoring, and response
  // ═══════════════════════════════════════════════════════════════════
  {
    function: "MANAGE", category: "1", subcategory: "1.1",
    juhbdi_component: "Worktree isolation per task (git worktrees)",
    coverage: "full", evidence_source: "src/cli-utils/worktree-ops.ts",
  },
  {
    function: "MANAGE", category: "1", subcategory: "1.3",
    juhbdi_component: "Git revert on TNR regression",
    coverage: "full", evidence_source: "src/cli-utils/tnr.ts#revert",
  },
  {
    function: "MANAGE", category: "2", subcategory: "2.1",
    juhbdi_component: "3-strike recovery with diagnostician + strategist",
    coverage: "full", evidence_source: "agents/diagnostician.md + agents/strategist.md",
  },
  {
    function: "MANAGE", category: "2", subcategory: "2.2",
    juhbdi_component: "Banned approaches list (per-task)",
    coverage: "full", evidence_source: ".juhbdi/roadmap-intent.json#banned_approaches",
  },
  {
    function: "MANAGE", category: "2", subcategory: "2.4",
    juhbdi_component: "Auto-pause at context < 30%",
    coverage: "full", evidence_source: "commands/execute.md#PreWaveContextCheck",
  },
  {
    function: "MANAGE", category: "3", subcategory: "3.1",
    juhbdi_component: "Handoff system for session continuity",
    coverage: "full", evidence_source: "commands/pause.md + commands/resume.md",
  },
  {
    function: "MANAGE", category: "3", subcategory: "3.2",
    juhbdi_component: "Librarian agent for state compression",
    coverage: "full", evidence_source: "agents/librarian.md",
  },
  {
    function: "MANAGE", category: "4", subcategory: "4.1",
    juhbdi_component: "Real-time dashboard with SSE updates",
    coverage: "full", evidence_source: "src/dashboard/server.ts",
  },
  {
    function: "MANAGE", category: "4", subcategory: "4.2",
    juhbdi_component: "Inter-agent messaging system",
    coverage: "full", evidence_source: "src/core/agent-messaging.ts",
  },
  {
    function: "MANAGE", category: "4", subcategory: "4.3",
    juhbdi_component: "Belief-updater agent between waves",
    coverage: "full", evidence_source: "agents/belief-updater.md",
  },
];

// ── Coverage Calculator ─────────────────────────────────────────────

export interface NISTCoverage {
  total_mappings: number;
  full_coverage: number;
  partial_coverage: number;
  no_coverage: number;
  overall_pct: number;
  by_function: Record<NISTFunction, { total: number; full: number; partial: number; none: number; pct: number }>;
}

export function calculateNISTCoverage(mappings: NISTMapping[] = NIST_CROSSWALK): NISTCoverage {
  const full = mappings.filter((m) => m.coverage === "full").length;
  const partial = mappings.filter((m) => m.coverage === "partial").length;
  const none = mappings.filter((m) => m.coverage === "none").length;
  const total = mappings.length;

  // Full = 1.0, partial = 0.5, none = 0.0
  const score = total > 0 ? Math.round(((full + partial * 0.5) / total) * 100) : 0;

  const functions: NISTFunction[] = ["GOVERN", "MAP", "MEASURE", "MANAGE"];
  const by_function: Record<string, { total: number; full: number; partial: number; none: number; pct: number }> = {};

  for (const fn of functions) {
    const fnMappings = mappings.filter((m) => m.function === fn);
    const fnFull = fnMappings.filter((m) => m.coverage === "full").length;
    const fnPartial = fnMappings.filter((m) => m.coverage === "partial").length;
    const fnNone = fnMappings.filter((m) => m.coverage === "none").length;
    const fnTotal = fnMappings.length;
    by_function[fn] = {
      total: fnTotal,
      full: fnFull,
      partial: fnPartial,
      none: fnNone,
      pct: fnTotal > 0 ? Math.round(((fnFull + fnPartial * 0.5) / fnTotal) * 100) : 0,
    };
  }

  return {
    total_mappings: total,
    full_coverage: full,
    partial_coverage: partial,
    no_coverage: none,
    overall_pct: score,
    by_function: by_function as NISTCoverage["by_function"],
  };
}

export function formatNISTReport(coverage: NISTCoverage): string {
  const lines: string[] = [];
  lines.push("NIST AI RMF 1.0 Coverage Report");
  lines.push(`Overall: ${coverage.overall_pct}% (${coverage.total_mappings} mappings)`);
  lines.push(`  Full: ${coverage.full_coverage}  Partial: ${coverage.partial_coverage}  None: ${coverage.no_coverage}`);
  lines.push("");

  for (const fn of ["GOVERN", "MAP", "MEASURE", "MANAGE"] as NISTFunction[]) {
    const data = coverage.by_function[fn];
    const bar = buildProgressBar(data.pct);
    lines.push(`  ${fn.padEnd(8)} ${bar} ${data.pct}% (${data.full}/${data.total} full)`);
  }

  return lines.join("\n");
}

function buildProgressBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}
