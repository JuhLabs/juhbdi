import { describe, test, expect } from "bun:test";
import {
  NIST_CROSSWALK,
  calculateNISTCoverage,
  formatNISTReport,
  type NISTMapping,
} from "./nist-rmf";

describe("NIST AI RMF Crosswalk", () => {
  test("has at least 40 mappings", () => {
    expect(NIST_CROSSWALK.length).toBeGreaterThanOrEqual(40);
  });

  test("covers all 4 NIST functions", () => {
    const functions = new Set(NIST_CROSSWALK.map((m) => m.function));
    expect(functions.has("GOVERN")).toBe(true);
    expect(functions.has("MAP")).toBe(true);
    expect(functions.has("MEASURE")).toBe(true);
    expect(functions.has("MANAGE")).toBe(true);
  });

  test("each mapping has required fields", () => {
    for (const mapping of NIST_CROSSWALK) {
      expect(mapping.function).toBeTruthy();
      expect(mapping.category).toBeTruthy();
      expect(mapping.subcategory).toBeTruthy();
      expect(mapping.juhbdi_component).toBeTruthy();
      expect(["full", "partial", "none"]).toContain(mapping.coverage);
      expect(mapping.evidence_source).toBeTruthy();
    }
  });

  test("GOVERN has at least 8 mappings", () => {
    const govern = NIST_CROSSWALK.filter((m) => m.function === "GOVERN");
    expect(govern.length).toBeGreaterThanOrEqual(8);
  });

  test("MAP has at least 8 mappings", () => {
    const map = NIST_CROSSWALK.filter((m) => m.function === "MAP");
    expect(map.length).toBeGreaterThanOrEqual(8);
  });

  test("MEASURE has at least 8 mappings", () => {
    const measure = NIST_CROSSWALK.filter((m) => m.function === "MEASURE");
    expect(measure.length).toBeGreaterThanOrEqual(8);
  });

  test("MANAGE has at least 8 mappings", () => {
    const manage = NIST_CROSSWALK.filter((m) => m.function === "MANAGE");
    expect(manage.length).toBeGreaterThanOrEqual(8);
  });

  test("no duplicate subcategories within same function", () => {
    const seen = new Set<string>();
    for (const m of NIST_CROSSWALK) {
      const key = `${m.function}-${m.category}.${m.subcategory}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("calculateNISTCoverage", () => {
  test("calculates coverage for default crosswalk", () => {
    const coverage = calculateNISTCoverage();
    expect(coverage.total_mappings).toBe(NIST_CROSSWALK.length);
    expect(coverage.overall_pct).toBeGreaterThan(0);
    expect(coverage.overall_pct).toBeLessThanOrEqual(100);
  });

  test("100% coverage when all full", () => {
    const mappings: NISTMapping[] = [
      { function: "GOVERN", category: "1", subcategory: "1.1", juhbdi_component: "test", coverage: "full", evidence_source: "test.ts" },
      { function: "MAP", category: "1", subcategory: "1.1", juhbdi_component: "test", coverage: "full", evidence_source: "test.ts" },
    ];
    const coverage = calculateNISTCoverage(mappings);
    expect(coverage.overall_pct).toBe(100);
    expect(coverage.full_coverage).toBe(2);
  });

  test("50% coverage when all partial", () => {
    const mappings: NISTMapping[] = [
      { function: "GOVERN", category: "1", subcategory: "1.1", juhbdi_component: "test", coverage: "partial", evidence_source: "test.ts" },
      { function: "MAP", category: "1", subcategory: "1.1", juhbdi_component: "test", coverage: "partial", evidence_source: "test.ts" },
    ];
    const coverage = calculateNISTCoverage(mappings);
    expect(coverage.overall_pct).toBe(50);
    expect(coverage.partial_coverage).toBe(2);
  });

  test("0% coverage when all none", () => {
    const mappings: NISTMapping[] = [
      { function: "GOVERN", category: "1", subcategory: "1.1", juhbdi_component: "test", coverage: "none", evidence_source: "test.ts" },
    ];
    const coverage = calculateNISTCoverage(mappings);
    expect(coverage.overall_pct).toBe(0);
    expect(coverage.no_coverage).toBe(1);
  });

  test("per-function breakdown is correct", () => {
    const coverage = calculateNISTCoverage();
    for (const fn of ["GOVERN", "MAP", "MEASURE", "MANAGE"] as const) {
      const data = coverage.by_function[fn];
      expect(data.total).toBe(data.full + data.partial + data.none);
      expect(data.pct).toBeGreaterThanOrEqual(0);
      expect(data.pct).toBeLessThanOrEqual(100);
    }
  });

  test("handles empty mappings", () => {
    const coverage = calculateNISTCoverage([]);
    expect(coverage.total_mappings).toBe(0);
    expect(coverage.overall_pct).toBe(0);
  });
});

describe("formatNISTReport", () => {
  test("includes all 4 functions", () => {
    const coverage = calculateNISTCoverage();
    const report = formatNISTReport(coverage);
    expect(report).toContain("GOVERN");
    expect(report).toContain("MAP");
    expect(report).toContain("MEASURE");
    expect(report).toContain("MANAGE");
  });

  test("includes overall percentage", () => {
    const coverage = calculateNISTCoverage();
    const report = formatNISTReport(coverage);
    expect(report).toContain(`${coverage.overall_pct}%`);
  });

  test("includes progress bars", () => {
    const coverage = calculateNISTCoverage();
    const report = formatNISTReport(coverage);
    expect(report).toContain("[");
    expect(report).toContain("]");
  });
});
