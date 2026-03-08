import { scoreMessage, DEFAULT_RULES, type ScoredSuggestion } from "../core/rules.js";

export interface VerifyIntentInput {
  message: string;
  context?: string;
}

export interface VerifyIntentResult {
  should_proceed: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  flags: Array<{
    rule_id: string;
    description: string;
    score: number;
    action: string;
  }>;
  recommendation: string;
}

export function verifyIntent(input: VerifyIntentInput): VerifyIntentResult {
  const fullMessage = input.context
    ? `${input.message} ${input.context}`
    : input.message;

  const suggestions: ScoredSuggestion[] = scoreMessage(fullMessage, DEFAULT_RULES, 0.4);

  if (suggestions.length === 0) {
    return {
      should_proceed: true,
      risk_level: "low",
      flags: [],
      recommendation: "No governance flags. Proceed normally.",
    };
  }

  const maxScore = Math.max(...suggestions.map((s) => s.score));
  const risk_level: VerifyIntentResult["risk_level"] =
    maxScore >= 0.9 ? "critical" :
    maxScore >= 0.75 ? "high" :
    maxScore >= 0.6 ? "medium" : "low";

  const flags = suggestions.map((s) => ({
    rule_id: s.rule.id,
    description: s.rule.description,
    score: Math.round(s.score * 100) / 100,
    action: s.rule.action,
  }));

  const hasDestructive = suggestions.some((s) => s.rule.id === "verify-destructive");
  const hasCredentials = suggestions.some((s) => s.rule.id === "verify-credentials");

  let recommendation: string;
  if (hasDestructive) {
    recommendation = "DESTRUCTIVE ACTION DETECTED. Confirm the user explicitly intends this before proceeding. Log this decision.";
  } else if (hasCredentials) {
    recommendation = "Sensitive operation detected. Verify credentials are not being exposed. Log this decision.";
  } else {
    recommendation = `${flags.length} governance flag(s) raised. Consider planning before executing. Review flags and proceed with awareness.`;
  }

  return {
    should_proceed: risk_level === "low" || risk_level === "medium",
    risk_level,
    flags,
    recommendation,
  };
}
