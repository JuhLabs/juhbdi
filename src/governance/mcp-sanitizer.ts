// MCP Tool Sanitizer
// Research: MCPTox benchmark (72.8% attack success on unprotected tools)
// Detects: hidden instructions, exfiltration patterns, prompt injection

export interface SanitizationResult {
  tool_name: string;
  safe: boolean;
  risk_level: "clean" | "suspicious" | "dangerous" | "blocked";
  findings: SanitizationFinding[];
}

export interface SanitizationFinding {
  pattern: string;
  category:
    | "hidden_instruction"
    | "exfiltration"
    | "prompt_injection"
    | "privilege_escalation"
    | "data_leak";
  severity: "low" | "medium" | "high" | "critical";
  match: string;
  location: string; // where in the tool description
}

// Pattern database for MCP tool description poisoning
const POISONING_PATTERNS: Array<{
  regex: RegExp;
  category: SanitizationFinding["category"];
  severity: SanitizationFinding["severity"];
  description: string;
}> = [
  // Hidden instructions embedded in descriptions
  {
    regex:
      /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|constraints)/i,
    category: "prompt_injection",
    severity: "critical",
    description: "Instruction override attempt",
  },
  {
    regex: /(?:you\s+(?:are|must|should|will)\s+(?:now|always))/i,
    category: "prompt_injection",
    severity: "high",
    description: "Identity/behavior override",
  },
  {
    regex: /(?:system\s*:?\s*(?:prompt|message|instruction))/i,
    category: "prompt_injection",
    severity: "critical",
    description: "System prompt injection",
  },
  // Exfiltration patterns
  {
    regex:
      /(?:curl|wget|fetch|http[s]?:\/\/)\s*.*(?:\.env|password|secret|token|key|credential)/i,
    category: "exfiltration",
    severity: "critical",
    description: "Credential exfiltration attempt",
  },
  {
    regex:
      /(?:send|post|upload|transmit)\s+(?:to|data|file|content)\s+(?:external|remote|server)/i,
    category: "exfiltration",
    severity: "high",
    description: "Data exfiltration via tool",
  },
  {
    regex: /base64\s*(?:encode|decode).*(?:secret|password|token|key)/i,
    category: "data_leak",
    severity: "high",
    description: "Encoded credential access",
  },
  // Privilege escalation
  {
    regex: /(?:sudo|chmod\s+[0-7]{3,4}|chown|rm\s+-rf\s+\/)/i,
    category: "privilege_escalation",
    severity: "critical",
    description: "Privilege escalation command",
  },
  {
    regex: /(?:eval|exec|spawn|shell)\s*\(/i,
    category: "privilege_escalation",
    severity: "high",
    description: "Dynamic code execution",
  },
  // Hidden Unicode / invisible characters
  {
    regex: /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/,
    category: "hidden_instruction",
    severity: "high",
    description: "Hidden Unicode characters (zero-width, directional overrides)",
  },
  // Markdown/HTML injection in descriptions
  {
    regex: /<script|<iframe|javascript:/i,
    category: "prompt_injection",
    severity: "critical",
    description: "Script injection in tool description",
  },
  // Path traversal
  {
    regex: /(?:\.\.\/|\.\.\\|%2e%2e\/|\/etc\/|\/root\/|~\/\.ssh)/i,
    category: "privilege_escalation",
    severity: "high",
    description: "Path traversal or sensitive path access",
  },
];

export function sanitizeTool(
  toolName: string,
  description: string,
  parameters?: Record<string, unknown>,
): SanitizationResult {
  const findings: SanitizationFinding[] = [];

  // Scan description
  for (const pattern of POISONING_PATTERNS) {
    const match = description.match(pattern.regex);
    if (match) {
      findings.push({
        pattern: pattern.description,
        category: pattern.category,
        severity: pattern.severity,
        match: match[0].substring(0, 100), // truncate long matches
        location: "description",
      });
    }
  }

  // Scan parameter descriptions if available
  if (parameters) {
    const paramStr = JSON.stringify(parameters);
    for (const pattern of POISONING_PATTERNS) {
      const match = paramStr.match(pattern.regex);
      if (match) {
        findings.push({
          pattern: pattern.description,
          category: pattern.category,
          severity: pattern.severity,
          match: match[0].substring(0, 100),
          location: "parameters",
        });
      }
    }
  }

  // Determine overall risk
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  const riskLevel = hasCritical
    ? "blocked"
    : hasHigh
      ? "dangerous"
      : findings.length > 0
        ? "suspicious"
        : "clean";

  return {
    tool_name: toolName,
    safe: riskLevel === "clean",
    risk_level: riskLevel,
    findings,
  };
}

export function formatSanitizationReport(results: SanitizationResult[]): string {
  const lines: string[] = [];
  const blocked = results.filter((r) => r.risk_level === "blocked");
  const dangerous = results.filter((r) => r.risk_level === "dangerous");
  const suspicious = results.filter((r) => r.risk_level === "suspicious");
  const clean = results.filter((r) => r.risk_level === "clean");

  lines.push(`MCP Tool Audit Report`);
  lines.push(`Tools scanned: ${results.length}`);
  lines.push(
    `Clean: ${clean.length} | Suspicious: ${suspicious.length} | Dangerous: ${dangerous.length} | Blocked: ${blocked.length}`,
  );
  lines.push("");

  for (const result of [...blocked, ...dangerous, ...suspicious]) {
    lines.push(`[${result.risk_level.toUpperCase()}] ${result.tool_name}`);
    for (const finding of result.findings) {
      lines.push(`  ${finding.severity}: ${finding.pattern} (${finding.category})`);
      lines.push(`  Match: "${finding.match}" in ${finding.location}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
