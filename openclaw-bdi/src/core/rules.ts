export interface TriggerRule {
  id: string;
  patterns: string[];
  action: string;
  confidence: number;
  description: string;
}

export const DEFAULT_RULES: TriggerRule[] = [
  {
    id: "verify-destructive",
    patterns: [
      "delete\\s+(?:all|every|the)?\\s*\\w+",
      "remove\\s+(?:all|every|the)?\\s*\\w+",
      "drop\\s+(?:the)?\\s*(?:database|table|collection)",
      "reset\\s+(?:the)?\\s*\\w+",
      "wipe\\s+(?:the)?\\s*\\w+",
      "destroy\\s+(?:the)?\\s*\\w+",
      "format\\s+(?:the)?\\s*(?:disk|drive)",
      "rm\\s+-rf",
      "force\\s+push",
    ],
    action: "verify_intent",
    confidence: 0.95,
    description: "Destructive action detected — verify intent before proceeding",
  },
  {
    id: "verify-complex",
    patterns: [
      "build\\s+(?:a|the)?\\s*[\\w\\s]+(?:system|feature|module|service|api|app)",
      "implement\\s+(?:a|the)?\\s*\\w+",
      "create\\s+(?:a|the)?\\s*(?:new\\s+)?\\w+\\s+(?:system|feature|module|service)",
      "design\\s+(?:a|the)?\\s*\\w+",
      "refactor\\s+(?:the)?\\s*\\w+",
      "migrate\\s+(?:from|to)",
      "architect\\s+(?:a|the)?\\s*\\w+",
    ],
    action: "plan_first",
    confidence: 0.8,
    description: "Complex task detected — plan before executing",
  },
  {
    id: "recall-similar",
    patterns: [
      "(?:similar|like|same)\\s+(?:to|as)\\s+(?:what|the)",
      "(?:we|i)\\s+(?:did|built|made)\\s+(?:this|that|something)\\s+before",
      "(?:last|previous)\\s+time",
      "remember\\s+(?:when|how|what)",
    ],
    action: "recall",
    confidence: 0.85,
    description: "Reference to past work — recall relevant experiences",
  },
  {
    id: "verify-credentials",
    patterns: [
      "(?:api|secret|auth|token|password|key)\\s*(?:=|:)",
      "(?:set|update|change)\\s+(?:the)?\\s*(?:password|credentials|secret|token)",
      "\\.env\\b",
      "(?:deploy|push)\\s+to\\s+(?:prod|production|live)",
    ],
    action: "verify_intent",
    confidence: 0.9,
    description: "Sensitive operation detected — verify intent",
  },
];

export interface ScoredSuggestion {
  rule: TriggerRule;
  score: number;
  matched_patterns: string[];
}

export function scoreMessage(
  message: string,
  rules: TriggerRule[],
  threshold = 0.5
): ScoredSuggestion[] {
  const lower = message.toLowerCase();
  const results: ScoredSuggestion[] = [];

  for (const rule of rules) {
    const matched: string[] = [];
    let matchCount = 0;

    for (const pattern of rule.patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(lower)) {
          matched.push(pattern);
          matchCount++;
        }
      } catch {
        // skip invalid regex
      }
    }

    if (matchCount === 0) continue;

    const multiMatchBonus = Math.min(0.1, (matchCount - 1) * 0.05);
    const score = rule.confidence * (0.9 + multiMatchBonus);

    if (score >= threshold) {
      results.push({ rule, score, matched_patterns: matched });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
