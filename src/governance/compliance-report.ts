/**
 * Compliance Report Generator
 *
 * Generates a formal compliance report covering EU AI Act Article 12
 * and NIST AI RMF 1.0 framework coverage. Suitable for auditors.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { checkCompliance, type ComplianceReport as EUReport } from "./compliance-checker";
import { calculateNISTCoverage, NIST_CROSSWALK, type NISTCoverage } from "./nist-rmf";

export interface FullComplianceReport {
  generated: string;
  frameworks: {
    eu_ai_act: {
      article_12_coverage: EUReport;
      risk_classification: string;
      retention_policy: string;
      deadline_status: { deadline: string; days_remaining: number };
    };
    nist_ai_rmf: NISTCoverage;
  };
  trail_integrity: {
    total_entries: number;
    oldest_entry: string | null;
    newest_entry: string | null;
  };
  recommendations: string[];
}

export function generateComplianceReport(projectDir: string): FullComplianceReport {
  // 1. Load trail entries
  const trailPath = join(projectDir, ".juhbdi", "decision-trail.log");
  let trailEntries: Array<Record<string, unknown>> = [];
  if (existsSync(trailPath)) {
    const raw = readFileSync(trailPath, "utf-8").trim();
    if (raw) {
      trailEntries = raw.split("\n").map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return {};
        }
      }).filter((e) => Object.keys(e).length > 0);
    }
  }

  // 2. Load intent spec for risk classification
  const intentPath = join(projectDir, ".juhbdi", "intent-spec.json");
  let riskClass = "not_classified";
  let retentionPolicy = "not_set";
  if (existsSync(intentPath)) {
    try {
      const spec = JSON.parse(readFileSync(intentPath, "utf-8"));
      riskClass = spec.risk_class || "not_classified";
      retentionPolicy = spec.retention_policy || "not_set";
    } catch { /* ignore */ }
  }

  // 3. EU AI Act compliance
  const euReport = checkCompliance(trailEntries);

  // 4. NIST coverage
  const nistCoverage = calculateNISTCoverage(NIST_CROSSWALK);

  // 5. Trail integrity
  const timestamps = trailEntries
    .map((e) => e.timestamp as string)
    .filter((t) => t && typeof t === "string")
    .sort();

  // 6. Build recommendations
  const recommendations: string[] = [];

  if (euReport.overall_score < 100) {
    const missingGaps = euReport.gaps.filter((g) => g.status === "missing" && g.severity === "required");
    for (const gap of missingGaps) {
      recommendations.push(`[EU AI Act] ${gap.field}: ${gap.fix}`);
    }
  }

  if (nistCoverage.overall_pct < 100) {
    const noneEntries = NIST_CROSSWALK.filter((m) => m.coverage === "none");
    for (const entry of noneEntries) {
      recommendations.push(`[NIST ${entry.function}] ${entry.subcategory}: Implement ${entry.juhbdi_component}`);
    }
  }

  if (trailEntries.length === 0) {
    recommendations.push("[Trail] No decision trail entries found. Run /juhbdi:execute to generate trail data.");
  }

  if (riskClass === "not_classified") {
    recommendations.push("[Risk] Project risk class not set. Add risk_class to intent-spec.json.");
  }

  if (retentionPolicy === "not_set") {
    recommendations.push("[Retention] No data retention policy configured. Set retention_policy in intent-spec.json.");
  }

  return {
    generated: new Date().toISOString(),
    frameworks: {
      eu_ai_act: {
        article_12_coverage: euReport,
        risk_classification: riskClass,
        retention_policy: retentionPolicy,
        deadline_status: {
          deadline: "2026-08-02",
          days_remaining: euReport.days_remaining,
        },
      },
      nist_ai_rmf: nistCoverage,
    },
    trail_integrity: {
      total_entries: trailEntries.length,
      oldest_entry: timestamps.length > 0 ? timestamps[0] : null,
      newest_entry: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    },
    recommendations,
  };
}

export function formatFullReport(report: FullComplianceReport): string {
  const lines: string[] = [];
  const eu = report.frameworks.eu_ai_act;
  const nist = report.frameworks.nist_ai_rmf;

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("         JuhBDI Compliance Report");
  lines.push(`         Generated: ${report.generated.slice(0, 19).replace("T", " ")}`);
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");

  // EU AI Act Section
  lines.push("┌─ EU AI Act Article 12 ──────────────────────────────────┐");
  lines.push(`│  Score: ${eu.article_12_coverage.overall_score}% — ${eu.article_12_coverage.status.toUpperCase()}`);
  lines.push(`│  Risk Class: ${eu.risk_classification}`);
  lines.push(`│  Retention: ${eu.retention_policy}`);
  lines.push(`│  Deadline: ${eu.deadline_status.deadline} (${eu.deadline_status.days_remaining} days)`);
  lines.push(`│  Trail entries: ${eu.article_12_coverage.entries_audited} (${eu.article_12_coverage.coverage_pct}% enriched)`);

  const missingEU = eu.article_12_coverage.gaps.filter((g) => g.status !== "present");
  if (missingEU.length > 0) {
    lines.push("│");
    lines.push("│  Gaps:");
    for (const gap of missingEU) {
      const severity = gap.severity === "required" ? "REQ" : "REC";
      lines.push(`│    [${severity}] ${gap.field} — ${gap.status}`);
    }
  }
  lines.push("└─────────────────────────────────────────────────────────┘");
  lines.push("");

  // NIST Section
  lines.push("┌─ NIST AI RMF 1.0 ──────────────────────────────────────┐");
  lines.push(`│  Overall: ${nist.overall_pct}% (${nist.total_mappings} mappings)`);
  lines.push("│");
  for (const fn of ["GOVERN", "MAP", "MEASURE", "MANAGE"] as const) {
    const data = nist.by_function[fn];
    const bar = progressBar(data.pct);
    lines.push(`│    ${fn.padEnd(8)} ${bar} ${data.pct}%`);
  }
  lines.push("└─────────────────────────────────────────────────────────┘");
  lines.push("");

  // Trail Integrity
  lines.push("┌─ Trail Integrity ───────────────────────────────────────┐");
  lines.push(`│  Entries: ${report.trail_integrity.total_entries}`);
  if (report.trail_integrity.oldest_entry) {
    lines.push(`│  Range: ${report.trail_integrity.oldest_entry.slice(0, 10)} → ${report.trail_integrity.newest_entry?.slice(0, 10)}`);
  }
  lines.push("└─────────────────────────────────────────────────────────┘");

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("");
    lines.push("Recommendations:");
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  return lines.join("\n");
}

function progressBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
