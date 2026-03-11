// src/cli-utils/governance-tier.ts
export type GovernanceTier = "micro" | "small" | "medium" | "large";

const SCOPE_KEYWORDS = /\b(and|also|then|plus|additionally|moreover|furthermore)\b/gi;

export function estimateTierFromRequest(request: string): GovernanceTier {
  const words = request.trim().split(/\s+/).length;
  const clauses = (request.match(SCOPE_KEYWORDS) || []).length;
  const scope = words + clauses * 15;
  if (scope <= 10) return "micro";
  if (scope <= 50) return "small";
  if (scope <= 200) return "medium";
  return "large";
}

export function refineTier(taskCount: number, estimatedMinutes: number): GovernanceTier {
  if (taskCount <= 2 && estimatedMinutes <= 15) return "micro";
  if (taskCount <= 5 || estimatedMinutes <= 30) return "small";
  if (taskCount <= 15) return "medium";
  return "large";
}

const TIER_ORDER: GovernanceTier[] = ["micro", "small", "medium", "large"];

export function combineTiers(pass1: GovernanceTier, pass2: GovernanceTier): GovernanceTier {
  const i1 = TIER_ORDER.indexOf(pass1);
  const i2 = TIER_ORDER.indexOf(pass2);
  return TIER_ORDER[Math.max(i1, i2)];
}
