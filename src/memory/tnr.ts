import type { TestSnapshot } from "./tnr-types";

export function parseTestOutput(output: string): TestSnapshot {
  const passMatch = output.match(/(\d+)\s+pass/);
  const failMatch = output.match(/(\d+)\s+fail/);
  const totalMatch = output.match(/Ran\s+(\d+)\s+tests/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed;

  const failureNames: string[] = [];
  const failLines = output.matchAll(/FAIL\s+\S+\s+>\s+(.+)/g);
  for (const match of failLines) {
    failureNames.push(match[1].trim());
  }

  return { total, passed, failed, failure_names: failureNames };
}

interface CompareResult {
  verdict: "improved" | "stable" | "regressed";
  new_failures: string[];
  fixed_failures: string[];
}

export function compareSnapshots(before: TestSnapshot, after: TestSnapshot): CompareResult {
  const beforeSet = new Set(before.failure_names);
  const afterSet = new Set(after.failure_names);

  const new_failures = after.failure_names.filter((f) => !beforeSet.has(f));
  const fixed_failures = before.failure_names.filter((f) => !afterSet.has(f));

  let verdict: "improved" | "stable" | "regressed";
  if (new_failures.length > 0) {
    verdict = "regressed";
  } else if (fixed_failures.length > 0 || after.total > before.total) {
    verdict = "improved";
  } else {
    verdict = "stable";
  }

  return { verdict, new_failures, fixed_failures };
}

export function shouldRevert(result: Pick<CompareResult, "verdict" | "new_failures" | "fixed_failures">): boolean {
  return result.verdict === "regressed";
}
