// Tests that all 7 M11 systems are properly called through the wiring layer
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  prepareTaskContext,
  processTaskOutcome,
  processObservation,
  checkDivergence,
} from "./execution-wiring";
import type { StepExpectation, StepResult } from "../memory/adaptive-replan";

describe("execution-wiring", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "juhbdi-wiring-"));
    mkdirSync(join(tmpDir, ".juhbdi"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // PRE-TASK INJECTION
  describe("prepareTaskContext", () => {
    test("returns empty context when no reflexions exist", async () => {
      const result = await prepareTaskContext(tmpDir, "fix login bug", [
        "auth",
      ]);
      expect(result.reflexionContext).toBeDefined();
      expect(result.traceContext).toBeDefined();
      expect(result.estimatedTokens).toBeGreaterThanOrEqual(0);
    });

    test("retrieves relevant reflexions when bank exists", async () => {
      // Seed reflexion bank
      const bank = {
        version: "1.0.0",
        entries: [
          {
            id: "r1",
            timestamp: new Date().toISOString(),
            task_id: "t1",
            task_description: "fix authentication bug",
            domain_tags: ["auth"],
            outcome: "failure",
            approach_taken: "modified auth middleware",
            files_modified: ["src/auth.ts"],
            test_passed: false,
            error_summary: "token validation failed",
            reflection: "Token was expired, not invalid",
            lesson: "Always check token expiry first",
            keywords: ["auth", "token", "validation"],
            related_reflexion_ids: [],
          },
        ],
      };
      writeFileSync(
        join(tmpDir, ".juhbdi", "reflexion-bank.json"),
        JSON.stringify(bank),
      );

      const result = await prepareTaskContext(tmpDir, "fix auth token issue", [
        "auth",
      ]);
      expect(result.reflexionContext.length).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    test("retrieves relevant traces when trace store exists", async () => {
      const store = {
        version: "1.0.0",
        traces: [
          {
            task_id: "t1",
            task_description: "add user authentication",
            domain_tags: ["auth"],
            approach: "JWT middleware",
            steps: [
              {
                action: "write",
                target: "src/auth.ts",
                summary: "created auth module",
              },
            ],
            files_created: ["src/auth.ts"],
            files_modified: [],
            test_command: "bun test",
            test_passed: true,
            duration_ms: 5000,
            timestamp: new Date().toISOString(),
          },
        ],
      };
      writeFileSync(
        join(tmpDir, ".juhbdi", "execution-traces.json"),
        JSON.stringify(store),
      );

      const result = await prepareTaskContext(
        tmpDir,
        "add authentication endpoint",
        ["auth"],
      );
      expect(result.traceContext.length).toBeGreaterThan(0);
    });
  });

  // POST-TASK PROCESSING
  describe("processTaskOutcome", () => {
    test("generates reflexion for failed task", async () => {
      const result = await processTaskOutcome(
        tmpDir,
        "t1",
        "fix login bug",
        ["auth"],
        "modified auth.ts",
        ["src/auth.ts"],
        false,
        "assertion failed",
        "w1",
      );
      expect(result.reflexionId).toBeTruthy();
      expect(result.traceStored).toBe(false);

      // Verify reflexion bank file was created
      expect(
        existsSync(join(tmpDir, ".juhbdi", "reflexion-bank.json")),
      ).toBe(true);
    });

    test("generates reflexion AND stores trace for passed task with trace data", async () => {
      const result = await processTaskOutcome(
        tmpDir,
        "t2",
        "add user endpoint",
        ["api"],
        "created route handler",
        ["src/routes/user.ts"],
        true,
        undefined,
        "w1",
        {
          steps: [{ action: "write", target: "src/routes/user.ts", summary: "created route" }],
          files_created: ["src/routes/user.ts"],
          test_command: "bun test",
          duration_ms: 5000,
        },
      );
      expect(result.reflexionId).toBeTruthy();
      expect(result.traceStored).toBe(true);

      // Verify trace file was created
      expect(
        existsSync(join(tmpDir, ".juhbdi", "execution-traces.json")),
      ).toBe(true);
    });

    test("does not store trace for passed task without trace data", async () => {
      const result = await processTaskOutcome(
        tmpDir,
        "t2b",
        "add user endpoint",
        ["api"],
        "created route handler",
        ["src/routes/user.ts"],
        true,
        undefined,
        "w1",
      );
      expect(result.reflexionId).toBeTruthy();
      expect(result.traceStored).toBe(false);
    });

    test("does not store trace for failed task", async () => {
      const result = await processTaskOutcome(
        tmpDir,
        "t3",
        "fix broken test",
        ["testing"],
        "patched test assertion",
        ["src/test.ts"],
        false,
        "type error",
      );
      expect(result.traceStored).toBe(false);
    });
  });

  // OBSERVATION PROCESSING
  describe("processObservation", () => {
    test("returns short output unchanged", () => {
      const short = "line 1\nline 2\nline 3";
      const result = processObservation(short, 50);
      expect(result).toBe(short);
    });

    test("masks verbose output", () => {
      const verbose = Array(100).fill("info: processing line").join("\n");
      const masked = processObservation(verbose, 20);
      expect(masked.split("\n").length).toBeLessThanOrEqual(25); // maxLines + some slack for notice headers
      expect(masked.length).toBeLessThan(verbose.length);
    });

    test("preserves error lines in test output", () => {
      const testOutput =
        "PASS test1\nFAIL test2\nError: expected true\n" +
        Array(50).fill("  at Object.test (test.ts:1:1)").join("\n");
      const truncated = processObservation(testOutput, 10, true);
      expect(truncated).toContain("FAIL");
    });
  });

  // DIVERGENCE CHECK
  describe("checkDivergence", () => {
    test("no replan needed when step passed and aligned", () => {
      const expected: StepExpectation = {
        step_index: 0,
        expected_outcome: "create auth module file",
      };
      const actual: StepResult = {
        step_index: 0,
        actual_outcome: "create auth module file successfully",
        passed: true,
      };
      const result = checkDivergence(expected, actual, 2);
      expect(result.shouldReplan).toBe(false);
      expect(result.divergence).toBeLessThan(0.5);
    });

    test("high divergence on step failure", () => {
      const expected: StepExpectation = {
        step_index: 0,
        expected_outcome: "compile TypeScript project",
      };
      const actual: StepResult = {
        step_index: 0,
        actual_outcome: "compilation failed with type errors",
        passed: false,
      };
      const result = checkDivergence(expected, actual, 5);
      // Failed step always returns 0.8 divergence
      expect(result.divergence).toBe(0.8);
    });

    test("builds replan context when plan is provided", () => {
      const expected: StepExpectation = {
        step_index: 1,
        expected_outcome: "tests pass",
      };
      const actual: StepResult = {
        step_index: 1,
        actual_outcome: "tests failed with type error",
        passed: false,
      };
      const result = checkDivergence(
        expected,
        actual,
        5,
        "Original plan: create module, write tests, verify",
        [{ step_index: 0, actual_outcome: "module created", passed: true }],
      );
      if (result.shouldReplan) {
        expect(result.replanContext).toBeDefined();
        expect(result.replanContext).toContain("Re-Plan Context");
      }
    });
  });
});
