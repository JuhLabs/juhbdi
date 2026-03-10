import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { generateComplianceReport, formatFullReport } from "./compliance-report";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("compliance-report", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-compliance-"));
    fs.mkdirSync(path.join(tmpDir, ".juhbdi"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generateComplianceReport", () => {
    test("generates report with no .juhbdi data", () => {
      const report = generateComplianceReport(tmpDir);
      expect(report.generated).toBeTruthy();
      expect(report.frameworks.eu_ai_act).toBeDefined();
      expect(report.frameworks.nist_ai_rmf).toBeDefined();
      expect(report.trail_integrity.total_entries).toBe(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    test("includes EU AI Act framework data", () => {
      const report = generateComplianceReport(tmpDir);
      const eu = report.frameworks.eu_ai_act;
      expect(eu.article_12_coverage).toBeDefined();
      expect(eu.risk_classification).toBe("not_classified");
      expect(eu.retention_policy).toBe("not_set");
      expect(eu.deadline_status.deadline).toBe("2026-08-02");
      expect(eu.deadline_status.days_remaining).toBeGreaterThan(0);
    });

    test("includes NIST AI RMF framework data", () => {
      const report = generateComplianceReport(tmpDir);
      const nist = report.frameworks.nist_ai_rmf;
      expect(nist.total_mappings).toBeGreaterThanOrEqual(40);
      expect(nist.by_function.GOVERN).toBeDefined();
      expect(nist.by_function.MAP).toBeDefined();
      expect(nist.by_function.MEASURE).toBeDefined();
      expect(nist.by_function.MANAGE).toBeDefined();
    });

    test("reads trail entries when present", () => {
      const trailPath = path.join(tmpDir, ".juhbdi", "decision-trail.log");
      const entries = [
        JSON.stringify({ event_type: "command", timestamp: "2026-03-10T10:00:00Z", description: "test" }),
        JSON.stringify({ event_type: "decision", timestamp: "2026-03-10T11:00:00Z", description: "test2" }),
      ];
      fs.writeFileSync(trailPath, entries.join("\n"));

      const report = generateComplianceReport(tmpDir);
      expect(report.trail_integrity.total_entries).toBe(2);
      expect(report.trail_integrity.oldest_entry).toBe("2026-03-10T10:00:00Z");
      expect(report.trail_integrity.newest_entry).toBe("2026-03-10T11:00:00Z");
    });

    test("reads risk class from intent-spec", () => {
      const specPath = path.join(tmpDir, ".juhbdi", "intent-spec.json");
      fs.writeFileSync(specPath, JSON.stringify({
        risk_class: "high",
        retention_policy: "2_years",
      }));

      const report = generateComplianceReport(tmpDir);
      expect(report.frameworks.eu_ai_act.risk_classification).toBe("high");
      expect(report.frameworks.eu_ai_act.retention_policy).toBe("2_years");
    });

    test("generates recommendations for gaps", () => {
      const report = generateComplianceReport(tmpDir);
      expect(report.recommendations.some((r) => r.includes("[Trail]"))).toBe(true);
      expect(report.recommendations.some((r) => r.includes("[Risk]"))).toBe(true);
      expect(report.recommendations.some((r) => r.includes("[Retention]"))).toBe(true);
    });

    test("no trail recommendation when trail exists", () => {
      const trailPath = path.join(tmpDir, ".juhbdi", "decision-trail.log");
      fs.writeFileSync(trailPath, JSON.stringify({ event_type: "command", timestamp: "2026-03-10T10:00:00Z" }));

      const report = generateComplianceReport(tmpDir);
      expect(report.recommendations.some((r) => r.includes("[Trail]"))).toBe(false);
    });
  });

  describe("formatFullReport", () => {
    test("formats report with all sections", () => {
      const report = generateComplianceReport(tmpDir);
      const formatted = formatFullReport(report);

      expect(formatted).toContain("EU AI Act Article 12");
      expect(formatted).toContain("NIST AI RMF 1.0");
      expect(formatted).toContain("Trail Integrity");
      expect(formatted).toContain("Recommendations");
    });

    test("includes NIST function progress bars", () => {
      const report = generateComplianceReport(tmpDir);
      const formatted = formatFullReport(report);

      expect(formatted).toContain("GOVERN");
      expect(formatted).toContain("MAP");
      expect(formatted).toContain("MEASURE");
      expect(formatted).toContain("MANAGE");
      expect(formatted).toContain("█");
    });

    test("shows deadline information", () => {
      const report = generateComplianceReport(tmpDir);
      const formatted = formatFullReport(report);

      expect(formatted).toContain("2026-08-02");
      expect(formatted).toContain("days");
    });
  });
});
