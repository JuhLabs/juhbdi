export interface GovernanceCheck {
  action: "write_file" | "run_command" | "modify_test" | "delete_file";
  target: string;
  task_id: string;
  intent_scope: string[];
  content?: string;
}

export interface GovernanceResult {
  allowed: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  violations: string[];
  requires_approval: boolean;
}

const CREDENTIAL_PATTERNS = [
  /API_KEY\s*=\s*["'][^"']+["']/i,
  /password\s*[:=]\s*["'][^"']+["']/i,
  /secret\s*[:=]\s*["'][^"']+["']/i,
  /AKIA[0-9A-Z]{16}/,
  /sk-[a-zA-Z0-9]{32,}/,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
];

const DESTRUCTIVE_COMMANDS = [
  /rm\s+(-rf?|--recursive)\s+\//,
  /rm\s+-rf?\s+\./,
  /git\s+push\s+--force/,
  /git\s+reset\s+--hard/,
  /drop\s+table/i,
  /drop\s+database/i,
  /truncate\s+table/i,
];

export function checkGovernance(check: GovernanceCheck): GovernanceResult {
  const violations: string[] = [];
  let riskLevel: GovernanceResult["risk_level"] = "low";
  let requiresApproval = false;

  if (check.content) {
    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(check.content)) {
        violations.push("Credential pattern detected in file content");
        riskLevel = "critical";
        break;
      }
    }
  }

  if (check.action === "run_command") {
    for (const pattern of DESTRUCTIVE_COMMANDS) {
      if (pattern.test(check.target)) {
        violations.push(`Destructive command blocked: matches ${pattern.source}`);
        riskLevel = "critical";
        break;
      }
    }
  }

  if (check.action === "modify_test") {
    riskLevel = riskLevel === "critical" ? "critical" : "high";
    requiresApproval = true;
  }

  if (check.action === "delete_file") {
    riskLevel = riskLevel === "critical" ? "critical" : "medium";
    requiresApproval = true;
  }

  if (check.content) {
    const lineCount = check.content.split("\n").length;
    if (lineCount > 500) {
      if (riskLevel === "low") riskLevel = "high";
      requiresApproval = true;
      violations.push(`Large file write: ${lineCount} lines (threshold: 500)`);
    }
  }

  const allowed = violations.filter((v) =>
    v.includes("Credential") || v.includes("Destructive")
  ).length === 0;

  return { allowed, risk_level: riskLevel, violations, requires_approval: requiresApproval };
}

if (import.meta.main) {
  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ error: "Usage: governance.ts <check_json>" }));
    process.exit(1);
  }
  const check = JSON.parse(raw);
  console.log(JSON.stringify(checkGovernance(check)));
}
