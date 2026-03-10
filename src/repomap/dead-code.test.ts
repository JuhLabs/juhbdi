import { describe, test, expect } from "bun:test";
import { detectDeadCode, formatDeadCodeReport } from "./dead-code";
import { analyzeFile } from "./ast-analyzer";

describe("dead-code", () => {
  test("detects unused exports", () => {
    const a = analyzeFile("src/a.ts", `
      export function used() { return 1; }
      export function unused() { return 2; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { used } from "./a";
      export function main() { return used(); }
    `);
    const report = detectDeadCode([a, b]);
    expect(report.candidates.some((c) => c.symbol === "unused")).toBe(true);
    expect(report.candidates.some((c) => c.symbol === "used")).toBe(false);
  });

  test("reports 0 dead code when all exports are used", () => {
    const a = analyzeFile("src/a.ts", `
      export function helper() { return 1; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { helper } from "./a";
      export function main() { return helper(); }
    `);
    const report = detectDeadCode([a, b]);
    const deadFromA = report.candidates.filter((c) => c.file.includes("a.ts"));
    expect(deadFromA).toHaveLength(0);
  });

  test("handles files with no exports", () => {
    const a = analyzeFile("src/a.ts", `const x = 1;`);
    const report = detectDeadCode([a]);
    expect(report.total_exports).toBe(0);
    expect(report.dead_code_pct).toBe(0);
  });

  test("skips test files", () => {
    const test_file = analyzeFile("src/a.test.ts", `
      export function testHelper() { return 1; }
    `);
    const report = detectDeadCode([test_file]);
    expect(report.candidates).toHaveLength(0);
  });

  test("low confidence for CLI entry points", () => {
    const cli = analyzeFile("src/cli-utils/tool.ts", `
      export function run() { return 1; }
    `);
    const report = detectDeadCode([cli]);
    const candidate = report.candidates.find((c) => c.symbol === "run");
    if (candidate) {
      expect(candidate.confidence).toBe("low");
    }
  });

  test("low confidence for barrel exports", () => {
    const index = analyzeFile("src/index.ts", `
      export function api() { return 1; }
    `);
    const report = detectDeadCode([index]);
    const candidate = report.candidates.find((c) => c.symbol === "api");
    if (candidate) {
      expect(candidate.confidence).toBe("low");
    }
  });

  test("re-exports are not counted as dead code", () => {
    const a = analyzeFile("src/a.ts", `
      export function core() { return 1; }
    `);
    const b = analyzeFile("src/b.ts", `
      export { core } from "./a";
    `);
    const report = detectDeadCode([a, b]);
    const coreCandidate = report.candidates.filter(
      (c) => c.symbol === "core" && c.file.includes("a.ts"),
    );
    expect(coreCandidate).toHaveLength(0);
  });

  test("calculates dead code percentage", () => {
    const a = analyzeFile("src/a.ts", `
      export function used() { return 1; }
      export function unused1() { return 2; }
      export function unused2() { return 3; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { used } from "./a";
      export function main() { return used(); }
    `);
    const report = detectDeadCode([a, b]);
    expect(report.total_exports).toBeGreaterThan(0);
    expect(report.dead_code_pct).toBeGreaterThan(0);
  });
});

describe("formatDeadCodeReport", () => {
  test("formats empty report", () => {
    const report = {
      candidates: [],
      total_exports: 10,
      unused_exports: 0,
      dead_code_pct: 0,
    };
    const formatted = formatDeadCodeReport(report);
    expect(formatted).toContain("0/10");
    expect(formatted).toContain("No dead code");
  });

  test("groups by confidence level", () => {
    const report = {
      candidates: [
        { file: "a.ts", symbol: "foo", kind: "function", line: 1, confidence: "high" as const, reason: "test" },
        { file: "b.ts", symbol: "bar", kind: "function", line: 1, confidence: "low" as const, reason: "test" },
      ],
      total_exports: 10,
      unused_exports: 2,
      dead_code_pct: 20,
    };
    const formatted = formatDeadCodeReport(report);
    expect(formatted).toContain("HIGH");
    expect(formatted).toContain("LOW");
  });
});
