import type { TrustRecord } from "./trust";
import { computeTrustScore } from "./trust";

// Agentic Trust Framework tiers (CSA, Feb 2026)
export type AutonomyTier = "intern" | "junior" | "senior" | "principal";

export interface TierConfig {
  tier: AutonomyTier;
  min_trust_score: number;
  max_trust_score: number;
  allowed_actions: ActionScope[];
  requires_approval: ActionScope[];
  prohibited_actions: ActionScope[];
  description: string;
}

export type ActionScope =
  | "read_files"
  | "write_files"
  | "run_tests"
  | "run_commands"
  | "modify_tests"
  | "delete_files"
  | "create_branches"
  | "push_code"
  | "deploy"
  | "modify_config"
  | "install_packages";

// Default tier configuration
export const DEFAULT_TIERS: TierConfig[] = [
  {
    tier: "intern",
    min_trust_score: 0,
    max_trust_score: 0.35,
    allowed_actions: ["read_files", "run_tests"],
    requires_approval: ["write_files", "run_commands"],
    prohibited_actions: ["modify_tests", "delete_files", "push_code", "deploy", "modify_config", "install_packages"],
    description: "Supervised. Limited scope. All write actions reviewed.",
  },
  {
    tier: "junior",
    min_trust_score: 0.35,
    max_trust_score: 0.6,
    allowed_actions: ["read_files", "write_files", "run_tests", "run_commands", "create_branches"],
    requires_approval: ["modify_tests", "delete_files", "modify_config"],
    prohibited_actions: ["push_code", "deploy", "install_packages"],
    description: "Semi-autonomous. Bounded scope. Periodic review.",
  },
  {
    tier: "senior",
    min_trust_score: 0.6,
    max_trust_score: 0.85,
    allowed_actions: ["read_files", "write_files", "run_tests", "run_commands", "create_branches", "modify_tests", "modify_config", "install_packages"],
    requires_approval: ["delete_files", "push_code"],
    prohibited_actions: ["deploy"],
    description: "Autonomous within domain. Exception-based review.",
  },
  {
    tier: "principal",
    min_trust_score: 0.85,
    max_trust_score: 1.0,
    allowed_actions: ["read_files", "write_files", "run_tests", "run_commands", "create_branches", "modify_tests", "modify_config", "install_packages", "push_code"],
    requires_approval: ["deploy", "delete_files"],
    prohibited_actions: [],
    description: "Fully autonomous. Strategic scope. Audit-based oversight.",
  },
];

/**
 * Determine tier from trust score.
 * Score boundaries: [0, 0.35) = intern, [0.35, 0.6) = junior, [0.6, 0.85) = senior, [0.85, 1.0] = principal
 */
export function determineTier(trustScore: number, tiers?: TierConfig[]): TierConfig {
  const tierList = tiers ?? DEFAULT_TIERS;
  // Clamp score to [0, 1]
  const clamped = Math.max(0, Math.min(1, trustScore));

  // Find the matching tier — for boundary scores, the higher tier wins
  for (let i = tierList.length - 1; i >= 0; i--) {
    const t = tierList[i];
    if (clamped >= t.min_trust_score && clamped <= t.max_trust_score) {
      return t;
    }
  }

  // Fallback to first tier (should not happen with valid config)
  return tierList[0];
}

/**
 * Determine tier from trust record (convenience wrapper).
 */
export function determineTierFromRecord(record: TrustRecord, tiers?: TierConfig[]): TierConfig {
  const score = computeTrustScore(record);
  return determineTier(score, tiers);
}

/**
 * Check if an action is allowed at a given tier.
 */
export function checkActionPermission(
  tier: TierConfig,
  action: ActionScope,
): "allowed" | "requires_approval" | "prohibited" {
  if (tier.prohibited_actions.includes(action)) return "prohibited";
  if (tier.requires_approval.includes(action)) return "requires_approval";
  if (tier.allowed_actions.includes(action)) return "allowed";
  // If not listed anywhere, require approval (safe default)
  return "requires_approval";
}

/**
 * Format tier info for display (used by statusline/dashboard).
 */
export function formatTierDisplay(tier: TierConfig, trustScore: number): string {
  const pct = (trustScore * 100).toFixed(0);
  return `[${tier.tier.toUpperCase()}] trust:${pct}% — ${tier.description}`;
}

/**
 * Get tier progression summary (what's needed to reach next tier).
 */
export function getTierProgression(
  currentScore: number,
  tiers?: TierConfig[],
): {
  current: AutonomyTier;
  next: AutonomyTier | null;
  score_needed: number;
  actions_unlocked: ActionScope[];
} {
  const tierList = tiers ?? DEFAULT_TIERS;
  const currentTier = determineTier(currentScore, tierList);
  const currentIndex = tierList.findIndex((t) => t.tier === currentTier.tier);

  if (currentIndex >= tierList.length - 1) {
    return {
      current: currentTier.tier,
      next: null,
      score_needed: 0,
      actions_unlocked: [],
    };
  }

  const nextTier = tierList[currentIndex + 1];
  const scoreNeeded = Math.max(0, nextTier.min_trust_score - currentScore);

  // Actions unlocked = things that become "allowed" or "requires_approval" in next tier
  // that were "prohibited" in current tier
  const currentProhibited = new Set(currentTier.prohibited_actions);
  const nextAllowed = new Set([...nextTier.allowed_actions, ...nextTier.requires_approval]);
  const unlocked = [...currentProhibited].filter((a) => nextAllowed.has(a));

  return {
    current: currentTier.tier,
    next: nextTier.tier,
    score_needed: Math.round(scoreNeeded * 1000) / 1000,
    actions_unlocked: unlocked,
  };
}
