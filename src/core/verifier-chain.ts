import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type VerifierType = "typecheck" | "lint" | "test" | "build" | "custom";

export interface VerifierStep {
  type: VerifierType;
  name: string;
  command: string;           // Shell command to run
  timeout_ms: number;        // Max execution time
  required: boolean;         // If true, chain stops on failure
  parse_output?: (stdout: string, stderr: string) => VerifierResult;
}

export interface VerifierResult {
  step: string;
  passed: boolean;
  duration_ms: number;
  summary: string;           // One-line summary
  error_count?: number;
  warning_count?: number;
  details?: string;          // Truncated output for context injection
}

export interface ChainResult {
  all_passed: boolean;
  results: VerifierResult[];
  total_duration_ms: number;
  failed_at?: string;        // Name of first failing step (if any)
}

const BUN_PATH = join(process.env.HOME ?? "~", ".bun/bin/bun");

/**
 * Default verifier chain for TypeScript/Bun projects.
 */
export function getDefaultChain(cwd: string): VerifierStep[] {
  const steps: VerifierStep[] = [
    {
      type: "typecheck",
      name: "typecheck",
      command: `${BUN_PATH} tsc --noEmit`,
      timeout_ms: 30_000,
      required: true,
    },
  ];

  // Add lint if lint script exists in package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.lint) {
        steps.push({
          type: "lint",
          name: "lint",
          command: `${BUN_PATH} lint`,
          timeout_ms: 30_000,
          required: false,
        });
      }
    } catch {
      // Skip lint if package.json is unreadable
    }
  }

  steps.push({
    type: "test",
    name: "test",
    command: `${BUN_PATH} test`,
    timeout_ms: 120_000,
    required: true,
  });

  // Add build if build script exists in package.json
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.build) {
        steps.push({
          type: "build",
          name: "build",
          command: `${BUN_PATH} build`,
          timeout_ms: 60_000,
          required: false,
        });
      }
    } catch {
      // Skip build if package.json is unreadable
    }
  }

  return steps;
}

/**
 * Run the full verifier chain, stopping at first required failure.
 */
export async function runVerifierChain(
  steps: VerifierStep[],
  cwd: string,
): Promise<ChainResult> {
  const results: VerifierResult[] = [];
  let allPassed = true;
  let failedAt: string | undefined;
  const chainStart = Date.now();

  for (const step of steps) {
    const stepStart = Date.now();
    let passed = false;
    let summary = "";
    let details: string | undefined;
    let errorCount: number | undefined;
    let warningCount: number | undefined;

    try {
      const proc = Bun.spawn(["sh", "-c", step.command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Set up timeout with cleanup to prevent timer leaks
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), step.timeout_ms);
      });

      const exitPromise = proc.exited;
      const race = await Promise.race([exitPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);

      if (race === "timeout") {
        proc.kill();
        passed = false;
        summary = `Timed out after ${step.timeout_ms}ms`;
      } else {
        const exitCode = race;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();

        if (step.parse_output) {
          const parsed = step.parse_output(stdout, stderr);
          passed = parsed.passed;
          summary = parsed.summary;
          details = parsed.details;
          errorCount = parsed.error_count;
          warningCount = parsed.warning_count;
        } else {
          passed = exitCode === 0;
          summary = passed ? "Passed" : `Failed with exit code ${exitCode}`;
          const output = (stdout + stderr).trim();
          if (output.length > 0) {
            details = output.length > 2000 ? output.slice(-2000) : output;
          }
        }
      }
    } catch (err) {
      passed = false;
      summary = `Execution error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const duration = Date.now() - stepStart;
    const result: VerifierResult = {
      step: step.name,
      passed,
      duration_ms: duration,
      summary,
      error_count: errorCount,
      warning_count: warningCount,
      details,
    };
    results.push(result);

    if (!passed) {
      allPassed = false;
      if (!failedAt) failedAt = step.name;
      if (step.required) {
        break; // Stop chain on required failure
      }
    }
  }

  return {
    all_passed: allPassed,
    results,
    total_duration_ms: Date.now() - chainStart,
    failed_at: failedAt,
  };
}

/**
 * Format chain results for prompt injection (concise).
 */
export function formatChainResults(result: ChainResult): string {
  const status = result.all_passed ? "ALL PASSED" : `FAILED at ${result.failed_at}`;
  const lines = [`Verification: ${status} (${result.total_duration_ms}ms)`];

  for (const r of result.results) {
    const icon = r.passed ? "OK" : "FAIL";
    lines.push(`  [${icon}] ${r.step}: ${r.summary} (${r.duration_ms}ms)`);
  }

  return lines.join("\n");
}

/**
 * Format chain results for trail entry (structured).
 */
export function formatChainForTrail(result: ChainResult): Record<string, unknown> {
  return {
    all_passed: result.all_passed,
    total_duration_ms: result.total_duration_ms,
    failed_at: result.failed_at ?? null,
    steps: result.results.map((r) => ({
      step: r.step,
      passed: r.passed,
      duration_ms: r.duration_ms,
      summary: r.summary,
      error_count: r.error_count ?? null,
      warning_count: r.warning_count ?? null,
    })),
  };
}

/**
 * Detect project type and return appropriate default chain.
 */
export function detectProjectChain(cwd: string): VerifierStep[] {
  const pkgPath = join(cwd, "package.json");
  const tsconfigPath = join(cwd, "tsconfig.json");

  // TypeScript/Bun project detection
  if (existsSync(tsconfigPath) || existsSync(pkgPath)) {
    return getDefaultChain(cwd);
  }

  // Fallback: empty chain (no auto-detection match)
  return [];
}
