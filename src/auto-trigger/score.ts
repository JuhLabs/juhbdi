import type { TriggerRule } from "./rules";

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

    // Patterns are OR alternatives — any match is a strong signal.
    // Multiple matches boost slightly, but a single match should be sufficient.
    const multiMatchBonus = Math.min(0.1, (matchCount - 1) * 0.05);
    const score = rule.confidence * (0.9 + multiMatchBonus);

    if (score >= threshold) {
      results.push({ rule, score, matched_patterns: matched });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
