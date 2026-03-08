import { checkGovernance, type GovernanceResult } from "../cli-utils/governance";

export function quickGovernanceCheck(description: string): GovernanceResult {
  const contentCheck = checkGovernance({
    action: "write_file",
    target: "quick-task",
    task_id: "quick",
    intent_scope: [],
    content: description,
  });

  const commandCheck = checkGovernance({
    action: "run_command",
    target: description,
    task_id: "quick",
    intent_scope: [],
  });

  const violations = [...new Set([...contentCheck.violations, ...commandCheck.violations])];
  const allowed = contentCheck.allowed && commandCheck.allowed;
  const risk_level = contentCheck.risk_level === "critical" || commandCheck.risk_level === "critical"
    ? "critical" as const
    : contentCheck.risk_level === "high" || commandCheck.risk_level === "high"
    ? "high" as const
    : contentCheck.risk_level === "medium" || commandCheck.risk_level === "medium"
    ? "medium" as const
    : "low" as const;

  return {
    allowed,
    risk_level,
    violations,
    requires_approval: contentCheck.requires_approval || commandCheck.requires_approval,
  };
}
