import { describe, expect, test } from "bun:test";
import {
  maskObservation,
  scoreLines,
  compressFileContent,
  estimateTokens,
  truncateTestOutput,
} from "./observation-masking";

describe("maskObservation", () => {
  test("returns full output when under budget", () => {
    const output = "line 1\nline 2\nline 3";
    const result = maskObservation(output, 10);
    expect(result).toBe(output);
  });

  test("truncates when over budget", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `info line ${i}`);
    const output = lines.join("\n");
    const result = maskObservation(output, 10);
    const resultLines = result.split("\n");
    expect(resultLines.length).toBeLessThanOrEqual(11); // 10 content + 1 truncation notice
  });

  test("preserves error lines when preserveErrors is true", () => {
    const lines = [
      "info line 1",
      "info line 2",
      "ERROR: something broke",
      "info line 3",
      "info line 4",
      "info line 5",
      "FAIL: test failed",
      "info line 6",
      "info line 7",
      "info line 8",
      "info line 9",
      "info line 10",
    ];
    const output = lines.join("\n");
    const result = maskObservation(output, 6, { preserveErrors: true });
    expect(result).toContain("ERROR: something broke");
    expect(result).toContain("FAIL: test failed");
  });

  test("keeps first/last lines when preserveStructure is true", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const output = lines.join("\n");
    const result = maskObservation(output, 10, { preserveStructure: true });
    expect(result).toContain("line 0");
    expect(result).toContain("line 1");
    expect(result).toContain("line 2");
    expect(result).toContain("line 19");
    expect(result).toContain("line 18");
    expect(result).toContain("line 17");
  });

  test("adds truncation notice with correct count", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `info line ${i}`);
    const output = lines.join("\n");
    const result = maskObservation(output, 8);
    expect(result).toContain("[truncated]");
    expect(result).toContain("lines omitted");
  });

  test("uses custom summaryPrefix", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `info ${i}`);
    const output = lines.join("\n");
    const result = maskObservation(output, 8, { summaryPrefix: "[MASKED]" });
    expect(result).toContain("[MASKED]");
  });

  test("never truncates to less than 5 lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const output = lines.join("\n");
    const result = maskObservation(output, 2);
    const resultLines = result.split("\n");
    // At least 5 content lines + 1 truncation notice = 6
    expect(resultLines.length).toBeGreaterThanOrEqual(5);
  });
});

describe("scoreLines", () => {
  test("scores error lines highest", () => {
    const lines = ["info line", "ERROR: broken", "warning: deprecated"];
    const scored = scoreLines(lines);
    const errorScore = scored.find((s) => s.line === "ERROR: broken")!.score;
    const infoScore = scored.find((s) => s.line === "info line")!.score;
    const warnScore = scored.find((s) => s.line === "warning: deprecated")!.score;
    expect(errorScore).toBeGreaterThan(warnScore);
    expect(warnScore).toBeGreaterThan(infoScore);
  });

  test("scores blank lines lowest", () => {
    const lines = ["some content", "", "  "];
    const scored = scoreLines(lines);
    expect(scored[1].score).toBe(0);
    expect(scored[2].score).toBe(0);
    expect(scored[0].score).toBeGreaterThan(0);
  });

  test("preserves original indices", () => {
    const lines = ["a", "b", "c"];
    const scored = scoreLines(lines);
    expect(scored[0].index).toBe(0);
    expect(scored[1].index).toBe(1);
    expect(scored[2].index).toBe(2);
  });

  test("scores import lines higher than regular info", () => {
    const lines = ["import chalk from 'chalk';", "const x = 1;"];
    const scored = scoreLines(lines);
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });
});

describe("compressFileContent", () => {
  test("returns full content when under budget", () => {
    const content = "line 1\nline 2\nline 3";
    expect(compressFileContent(content, 10)).toBe(content);
  });

  test("keeps imports and exports", () => {
    const lines = [
      'import chalk from "chalk";',
      "export function foo() {",
      "  const x = 1;",
      "  const y = 2;",
      "  const z = 3;",
      "  return x + y + z;",
      "}",
      "export default foo;",
    ];
    const content = lines.join("\n");
    const result = compressFileContent(content, 4);
    expect(result).toContain("import chalk");
    expect(result).toContain("export function");
    expect(result).toContain("export default");
  });

  test("adds compression notice", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n");
    const result = compressFileContent(content, 10);
    expect(result).toContain("[compressed]");
    expect(result).toContain("lines omitted");
  });
});

describe("truncateTestOutput", () => {
  test("returns full output when under budget", () => {
    const output = "test 1 pass\ntest 2 pass\n3 pass, 0 fail";
    expect(truncateTestOutput(output, 10)).toBe(output);
  });

  test("extracts summary line", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `running test ${i}`);
    lines.push("42 pass, 3 fail");
    const output = lines.join("\n");
    const result = truncateTestOutput(output, 10);
    expect(result).toContain("42 pass, 3 fail");
  });

  test("includes first failure stack trace", () => {
    const lines = [
      "running test 1",
      "running test 2",
      "FAIL: test 3 broke",
      "  at Object.<anonymous> (test.ts:42)",
      "  at run (runner.ts:10)",
      "running test 4",
      "running test 5",
      ...Array.from({ length: 30 }, (_, i) => `running test ${i + 6}`),
      "35 pass, 1 fail",
    ];
    const output = lines.join("\n");
    const result = truncateTestOutput(output, 10);
    expect(result).toContain("FAIL: test 3 broke");
    expect(result).toContain("35 pass, 1 fail");
  });
});

describe("estimateTokens", () => {
  test("returns reasonable estimate (~4 chars per token)", () => {
    const text = "a".repeat(100);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(25);
  });

  test("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("rounds up", () => {
    // 5 chars / 4 = 1.25 → ceil → 2
    expect(estimateTokens("hello")).toBe(2);
  });
});
