// src/executor/intent-check.ts
import type { Task } from "../schemas/roadmap-intent";
import type { IntentSpec } from "../schemas/intent-spec";
import type { IntentCheck } from "./types";

export function checkIntent(task: Task, spec: IntentSpec): IntentCheck {
  const violations: string[] = [];

  // 1. Task must be in an executable state
  if (task.status !== "pending" && task.status !== "failed") {
    violations.push(`Task status is "${task.status}" — only "pending" or "failed" tasks can execute`);
  }

  // 2. Must have goal_refs
  if (task.goal_refs.length === 0) {
    violations.push("Task has empty goal_refs — every task must reference at least one goal");
  }

  // 3. All goal_refs must exist in intent-spec
  const goalIds = new Set(spec.goals.map((g) => g.id));
  for (const ref of task.goal_refs) {
    if (!goalIds.has(ref)) {
      violations.push(`Goal ref "${ref}" does not exist in intent-spec`);
    }
  }

  // 4. Test/lint verification must have a command
  if (
    (task.verification.type === "test" || task.verification.type === "lint") &&
    !task.verification.command
  ) {
    violations.push(
      `Task verification type "${task.verification.type}" requires a command but none provided`
    );
  }

  // 5. Verification command must not be trivially bypassable
  if (task.verification.command) {
    const cmd = task.verification.command.trim();
    const trivialPatterns = /^(true|:|echo(\s.*)?|exit\s+0)$/i;
    if (trivialPatterns.test(cmd)) {
      violations.push(
        `Verification command "${cmd}" is trivial — it would always pass without testing anything`
      );
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
