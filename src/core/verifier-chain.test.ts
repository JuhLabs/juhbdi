import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  getDefaultChain,
  detectProjectChain,
  runVerifierChain,
  formatChainResults,
  formatChainForTrail,
  type VerifierStep,
  type ChainResult,
  type VerifierResult,
} from "./verifier-chain";

describe("getDefaultChain", () => {
  test("returns steps for TypeScript project", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-vc-"));
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ scripts: {} }));
    await writeFile(join(tmpDir, "tsconfig.json"), "{}");

    const chain = getDefaultChain(tmpDir);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0].type).toBe("typecheck");
    expect(chain.some((s) => s.type === "test")).toBe(true);
  });

  test("includes lint step when lint script exists", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-vc-"));
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ scripts: { lint: "eslint ." } }));

    const chain = getDefaultChain(tmpDir);
    expect(chain.some((s) => s.type === "lint")).toBe(true);
  });

  test("includes build step when build script exists", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-vc-"));
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));

    const chain = getDefaultChain(tmpDir);
    expect(chain.some((s) => s.type === "build")).toBe(true);
  });
});

describe("detectProjectChain", () => {
  test("detects TypeScript/Bun project", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-vc-"));
    await writeFile(join(tmpDir, "tsconfig.json"), "{}");
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ scripts: {} }));

    const chain = detectProjectChain(tmpDir);
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  test("returns empty chain for unknown project type", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-vc-empty-"));
    // No package.json or tsconfig.json
    const chain = detectProjectChain(tmpDir);
    expect(chain).toEqual([]);
  });
});

describe("runVerifierChain", () => {
  test("passes when all steps pass", async () => {
    const steps: VerifierStep[] = [
      {
        type: "custom",
        name: "echo-test",
        command: "echo ok",
        timeout_ms: 5000,
        required: true,
      },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.all_passed).toBe(true);
    expect(result.results.length).toBe(1);
    expect(result.results[0].passed).toBe(true);
    expect(result.failed_at).toBeUndefined();
  });

  test("stops at first required failure", async () => {
    const steps: VerifierStep[] = [
      {
        type: "custom",
        name: "pass-step",
        command: "echo pass",
        timeout_ms: 5000,
        required: true,
      },
      {
        type: "custom",
        name: "fail-step",
        command: "false",  // exits with code 1
        timeout_ms: 5000,
        required: true,
      },
      {
        type: "custom",
        name: "never-reached",
        command: "echo unreachable",
        timeout_ms: 5000,
        required: true,
      },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.all_passed).toBe(false);
    expect(result.results.length).toBe(2); // third step not reached
    expect(result.failed_at).toBe("fail-step");
  });

  test("continues past non-required failures", async () => {
    const steps: VerifierStep[] = [
      {
        type: "custom",
        name: "optional-fail",
        command: "false",
        timeout_ms: 5000,
        required: false, // Non-required
      },
      {
        type: "custom",
        name: "should-run",
        command: "echo ok",
        timeout_ms: 5000,
        required: true,
      },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.all_passed).toBe(false);
    expect(result.results.length).toBe(2); // both steps ran
    expect(result.results[0].passed).toBe(false);
    expect(result.results[1].passed).toBe(true);
    expect(result.failed_at).toBe("optional-fail");
  });

  test("respects timeout", async () => {
    const steps: VerifierStep[] = [
      {
        type: "custom",
        name: "slow-step",
        command: "sleep 10",
        timeout_ms: 200,
        required: true,
      },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.all_passed).toBe(false);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].summary).toContain("Timed out");
  }, 10_000);

  test("all_passed is true only when all required steps pass", async () => {
    const steps: VerifierStep[] = [
      { type: "custom", name: "a", command: "echo a", timeout_ms: 5000, required: true },
      { type: "custom", name: "b", command: "echo b", timeout_ms: 5000, required: true },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.all_passed).toBe(true);
  });

  test("custom parse_output is used when provided", async () => {
    const steps: VerifierStep[] = [
      {
        type: "custom",
        name: "parsed",
        command: "echo hello",
        timeout_ms: 5000,
        required: true,
        parse_output: (stdout, _stderr) => ({
          step: "parsed",
          passed: stdout.includes("hello"),
          duration_ms: 0,
          summary: "Custom parse found hello",
          error_count: 0,
          warning_count: 1,
        }),
      },
    ];
    const result = await runVerifierChain(steps, process.cwd());
    expect(result.results[0].summary).toBe("Custom parse found hello");
    expect(result.results[0].warning_count).toBe(1);
  });
});

describe("formatChainResults", () => {
  test("produces concise summary for passing chain", () => {
    const result: ChainResult = {
      all_passed: true,
      results: [
        { step: "typecheck", passed: true, duration_ms: 100, summary: "Passed" },
        { step: "test", passed: true, duration_ms: 500, summary: "Passed" },
      ],
      total_duration_ms: 600,
    };
    const formatted = formatChainResults(result);
    expect(formatted).toContain("ALL PASSED");
    expect(formatted).toContain("typecheck");
    expect(formatted).toContain("test");
    expect(formatted).toContain("600ms");
  });

  test("produces concise summary for failing chain", () => {
    const result: ChainResult = {
      all_passed: false,
      results: [
        { step: "typecheck", passed: true, duration_ms: 100, summary: "Passed" },
        { step: "test", passed: false, duration_ms: 300, summary: "Failed with exit code 1" },
      ],
      total_duration_ms: 400,
      failed_at: "test",
    };
    const formatted = formatChainResults(result);
    expect(formatted).toContain("FAILED at test");
    expect(formatted).toContain("[FAIL]");
    expect(formatted).toContain("[OK]");
  });
});

describe("formatChainForTrail", () => {
  test("produces structured record", () => {
    const result: ChainResult = {
      all_passed: true,
      results: [
        { step: "typecheck", passed: true, duration_ms: 150, summary: "Passed", error_count: 0 },
      ],
      total_duration_ms: 150,
    };
    const trail = formatChainForTrail(result);
    expect(trail.all_passed).toBe(true);
    expect(trail.total_duration_ms).toBe(150);
    expect(trail.failed_at).toBeNull();
    expect(Array.isArray(trail.steps)).toBe(true);
    const steps = trail.steps as Array<Record<string, unknown>>;
    expect(steps[0].step).toBe("typecheck");
    expect(steps[0].error_count).toBe(0);
  });

  test("failed_at correctly identifies first failing step", () => {
    const result: ChainResult = {
      all_passed: false,
      results: [
        { step: "lint", passed: false, duration_ms: 50, summary: "Lint errors" },
      ],
      total_duration_ms: 50,
      failed_at: "lint",
    };
    const trail = formatChainForTrail(result);
    expect(trail.failed_at).toBe("lint");
  });
});
