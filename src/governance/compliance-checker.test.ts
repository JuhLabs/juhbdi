import { describe, expect, test } from "bun:test";
import { checkCompliance, formatComplianceReport } from "./compliance-checker";

describe("compliance-checker", () => {
  test("empty trail returns 0% compliance", () => {
    const report = checkCompliance([]);
    expect(report.overall_score).toBe(0);
    expect(report.status).toBe("non-compliant");
    expect(report.entries_audited).toBe(0);
    expect(report.entries_with_ai_act).toBe(0);
    expect(report.coverage_pct).toBe(0);
  });

  test("full Article 12 fields returns 100%", () => {
    const fullEntry = {
      event_type: "decision",
      ai_act: {
        ai_act_risk_class: "limited",
        deployer_id: "org-123",
        operation_start: "2026-03-01T00:00:00Z",
        operation_end: "2026-03-01T01:00:00Z",
        model_version: "claude-3.7-sonnet",
        input_data_ref: "src/main.ts",
        output_data_ref: "src/output.ts",
        human_oversight_level: "senior",
        human_reviewer: "developer@example.com",
        retention_policy: "6 months",
      },
    };
    const report = checkCompliance([fullEntry]);
    expect(report.overall_score).toBe(100);
    expect(report.status).toBe("compliant");
    expect(report.entries_with_ai_act).toBe(1);
    expect(report.coverage_pct).toBe(100);
  });

  test("partial fields returns partial score", () => {
    const partialEntry = {
      event_type: "decision",
      ai_act: {
        ai_act_risk_class: "limited",
        deployer_id: "org-123",
        operation_start: "2026-03-01T00:00:00Z",
        // missing: operation_end, model_version, human_oversight_level, retention_policy
      },
    };
    const report = checkCompliance([partialEntry]);
    // 3 out of 7 required fields present = ~43%
    expect(report.overall_score).toBeGreaterThan(0);
    expect(report.overall_score).toBeLessThan(100);
    expect(report.status).toBe("non-compliant"); // < 50%
  });

  test("days remaining calculated correctly", () => {
    const report = checkCompliance([]);
    expect(report.deadline).toBe("2026-08-02");
    expect(report.days_remaining).toBeGreaterThan(0);
    // Should be between 0 and 365*2 (reasonable range for near-future deadline)
    expect(report.days_remaining).toBeLessThan(730);
  });

  test("gaps list specific fix instructions", () => {
    const report = checkCompliance([]);
    const missingGaps = report.gaps.filter((g) => g.status === "missing");
    expect(missingGaps.length).toBe(10); // all 10 fields missing
    for (const gap of missingGaps) {
      expect(gap.fix).toBeTruthy();
      expect(gap.fix.length).toBeGreaterThan(10);
      expect(gap.article).toMatch(/Article \d+/);
    }
  });

  test("format report includes all sections", () => {
    const report = checkCompliance([]);
    const formatted = formatComplianceReport(report);
    expect(formatted).toContain("EU AI Act Article 12 Compliance Report");
    expect(formatted).toContain("Score:");
    expect(formatted).toContain("NON-COMPLIANT");
    expect(formatted).toContain("Deadline: 2026-08-02");
    expect(formatted).toContain("GAPS:");
    expect(formatted).toContain("[REQUIRED]");
    expect(formatted).toContain("Fix:");
  });
});
