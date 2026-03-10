// EU AI Act Article 12 Compliance Checker
// Deadline: August 2, 2026
// Maps decision trail to Article 12 requirements, flags gaps

export interface ComplianceGap {
  field: string;
  requirement: string;
  article: string;
  severity: "required" | "recommended";
  status: "present" | "missing" | "partial";
  fix: string;
}

export interface ComplianceReport {
  overall_score: number; // 0-100
  status: "compliant" | "partial" | "non-compliant";
  gaps: ComplianceGap[];
  entries_audited: number;
  entries_with_ai_act: number;
  coverage_pct: number;
  deadline: string;
  days_remaining: number;
}

const ARTICLE_12_REQUIREMENTS: ComplianceGap[] = [
  {
    field: "ai_act_risk_class",
    requirement: "Risk classification for each AI operation",
    article: "Article 12(1)",
    severity: "required",
    status: "missing",
    fix: "Enable trail enrichment in execution wiring",
  },
  {
    field: "deployer_id",
    requirement: "Identification of the deployer",
    article: "Article 12(2)",
    severity: "required",
    status: "missing",
    fix: "Set deployer_id in intent-spec or project config",
  },
  {
    field: "operation_start",
    requirement: "Start timestamp of AI operation",
    article: "Article 12(3)(a)",
    severity: "required",
    status: "missing",
    fix: "Record operation_start in trail entries",
  },
  {
    field: "operation_end",
    requirement: "End timestamp of AI operation",
    article: "Article 12(3)(a)",
    severity: "required",
    status: "missing",
    fix: "Record operation_end in trail entries",
  },
  {
    field: "model_version",
    requirement: "Version of AI model used",
    article: "Article 12(3)(b)",
    severity: "required",
    status: "missing",
    fix: "Record model_version from routing decision",
  },
  {
    field: "input_data_ref",
    requirement: "Reference to input data",
    article: "Article 12(3)(c)",
    severity: "recommended",
    status: "missing",
    fix: "Record input file references in trail entries",
  },
  {
    field: "output_data_ref",
    requirement: "Reference to output data",
    article: "Article 12(3)(c)",
    severity: "recommended",
    status: "missing",
    fix: "Record output file references in trail entries",
  },
  {
    field: "human_oversight_level",
    requirement: "Level of human oversight applied",
    article: "Article 14",
    severity: "required",
    status: "missing",
    fix: "Map autonomy tier to oversight level",
  },
  {
    field: "human_reviewer",
    requirement: "Identity of human reviewer (if applicable)",
    article: "Article 14(4)",
    severity: "recommended",
    status: "missing",
    fix: "Record reviewer identity when approval given",
  },
  {
    field: "retention_policy",
    requirement: "Data retention period (minimum 6 months)",
    article: "Article 12(4)",
    severity: "required",
    status: "missing",
    fix: "Set retention_policy in project config",
  },
];

export function checkCompliance(
  trailEntries: Array<Record<string, unknown>>,
  _projectConfig?: Record<string, unknown>,
): ComplianceReport {
  const entriesWithAiAct = trailEntries.filter((e) => e.ai_act && typeof e.ai_act === "object");
  const coveragePct =
    trailEntries.length > 0
      ? Math.round((entriesWithAiAct.length / trailEntries.length) * 100)
      : 0;

  const gaps = ARTICLE_12_REQUIREMENTS.map((req) => {
    // Count entries where this field is present
    const presentCount = entriesWithAiAct.filter((e) => {
      const aiAct = e.ai_act as Record<string, unknown>;
      return aiAct[req.field] !== undefined && aiAct[req.field] !== null;
    }).length;

    const status: "present" | "partial" | "missing" =
      presentCount === entriesWithAiAct.length && entriesWithAiAct.length > 0
        ? "present"
        : presentCount > 0
          ? "partial"
          : "missing";

    return { ...req, status };
  });

  const requiredGaps = gaps.filter((g) => g.severity === "required");
  const requiredPresent = requiredGaps.filter((g) => g.status === "present").length;
  const overallScore = requiredGaps.length > 0
    ? Math.round((requiredPresent / requiredGaps.length) * 100)
    : 100;

  const deadline = "2026-08-02";
  const daysRemaining = Math.max(0, Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  ));

  return {
    overall_score: overallScore,
    status: overallScore === 100 ? "compliant" : overallScore >= 50 ? "partial" : "non-compliant",
    gaps,
    entries_audited: trailEntries.length,
    entries_with_ai_act: entriesWithAiAct.length,
    coverage_pct: coveragePct,
    deadline,
    days_remaining: daysRemaining,
  };
}

export function formatComplianceReport(report: ComplianceReport): string {
  const lines: string[] = [];
  lines.push(`EU AI Act Article 12 Compliance Report`);
  lines.push(`Score: ${report.overall_score}% — ${report.status.toUpperCase()}`);
  lines.push(`Deadline: ${report.deadline} (${report.days_remaining} days remaining)`);
  lines.push(`Trail entries audited: ${report.entries_audited}`);
  lines.push(
    `Entries with AI Act fields: ${report.entries_with_ai_act} (${report.coverage_pct}%)`,
  );
  lines.push("");

  const missing = report.gaps.filter((g) => g.status !== "present");
  if (missing.length > 0) {
    lines.push("GAPS:");
    for (const gap of missing) {
      lines.push(`  [${gap.severity.toUpperCase()}] ${gap.field} — ${gap.requirement}`);
      lines.push(`    Article: ${gap.article}`);
      lines.push(`    Fix: ${gap.fix}`);
    }
  } else {
    lines.push("All Article 12 requirements satisfied.");
  }

  return lines.join("\n");
}
