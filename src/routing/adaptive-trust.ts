// Adaptive Trust Factor — Bayesian confidence score
// Research: CSA Agentic Trust Framework (Feb 2026)
// Replaces static pass/fail ratio with confidence-weighted scoring

export interface TrustObservation {
  task_id: string;
  timestamp: string;
  passed: boolean;
  complexity: number; // 0-1 (from difficulty assessment)
  scope_files: number; // number of files modified
  verification_passed: boolean; // verifier chain result
}

export interface AdaptiveTrustScore {
  score: number; // 0-1 Bayesian posterior mean
  confidence: number; // 0-1 how certain we are
  trend: "improving" | "stable" | "declining";
  streak: number; // consecutive successes or failures
  tier: "intern" | "junior" | "senior" | "principal";
  downgrade_risk: boolean; // true if 3+ recent failures
}

// Beta distribution parameters (Bayesian conjugate prior for binomial)
export interface BetaParams {
  alpha: number; // success count + prior
  beta: number; // failure count + prior
}

// Uninformative prior: alpha=1, beta=1 (uniform distribution)
const DEFAULT_PRIOR: BetaParams = { alpha: 1, beta: 1 };

// Decay factor: older observations count less (exponential decay)
const DECAY_HALF_LIFE = 20; // observations (not time)

export function computeAdaptiveTrust(
  observations: TrustObservation[],
  prior: BetaParams = DEFAULT_PRIOR,
): AdaptiveTrustScore {
  if (observations.length === 0) {
    // No observations: return prior mean
    const score = prior.alpha / (prior.alpha + prior.beta);
    return {
      score,
      confidence: 0,
      trend: "stable",
      streak: 0,
      tier: score >= 0.85 ? "principal" : score >= 0.6 ? "senior" : score >= 0.35 ? "junior" : "intern",
      downgrade_risk: false,
    };
  }

  // Apply exponential decay weighting
  const weighted = observations.map((obs, i) => {
    const age = observations.length - 1 - i;
    const weight = Math.pow(0.5, age / DECAY_HALF_LIFE);
    // Complexity-weighted: harder tasks count more
    const complexityWeight = 0.5 + obs.complexity * 0.5;
    return {
      ...obs,
      effectiveWeight: weight * complexityWeight,
    };
  });

  // Compute Bayesian posterior
  let alpha = prior.alpha;
  let beta_ = prior.beta;
  for (const w of weighted) {
    if (w.passed && w.verification_passed) {
      alpha += w.effectiveWeight;
    } else {
      beta_ += w.effectiveWeight;
    }
  }

  // Posterior mean = alpha / (alpha + beta)
  const score = alpha / (alpha + beta_);

  // Confidence = 1 - variance (higher observations = higher confidence)
  // Beta variance = alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))
  const totalObs = alpha + beta_;
  const variance = (alpha * beta_) / (totalObs * totalObs * (totalObs + 1));
  // Scale variance to 0-1 confidence. Factor of 4 calibrated so that:
  // - 0 observations → confidence ~0, ~10 observations → confidence ~0.7, ~30 → ~0.95
  const confidence = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 4));

  // Trend detection (last 5 observations)
  const recent = observations.slice(-5);
  const recentPassRate = recent.filter((o) => o.passed).length / Math.max(recent.length, 1);
  const overallPassRate = score;
  const trend =
    recentPassRate > overallPassRate + 0.1
      ? "improving"
      : recentPassRate < overallPassRate - 0.1
        ? "declining"
        : "stable";

  // Streak counting
  let streak = 0;
  for (let i = observations.length - 1; i >= 0; i--) {
    if (i === observations.length - 1) {
      streak = observations[i].passed ? 1 : -1;
    } else if ((streak > 0 && observations[i].passed) || (streak < 0 && !observations[i].passed)) {
      streak += streak > 0 ? 1 : -1;
    } else {
      break;
    }
  }

  // Tier mapping with downgrade risk
  const tier =
    score >= 0.85 ? "principal" : score >= 0.6 ? "senior" : score >= 0.35 ? "junior" : "intern";

  const downgradeRisk = streak <= -3 || (trend === "declining" && confidence > 0.5);

  return { score, confidence, trend, streak, tier, downgrade_risk: downgradeRisk };
}

// Dynamic tier downgrade on failure streak
export function applyDynamicDowngrade(
  currentTrust: AdaptiveTrustScore,
  consecutiveFailures: number,
): AdaptiveTrustScore {
  if (consecutiveFailures < 3) return currentTrust;

  // Force one tier down per 3 consecutive failures
  const downgradeLevels = Math.floor(consecutiveFailures / 3);
  const tiers: Array<"intern" | "junior" | "senior" | "principal"> = [
    "intern",
    "junior",
    "senior",
    "principal",
  ];
  const currentIdx = tiers.indexOf(currentTrust.tier);
  const newIdx = Math.max(0, currentIdx - downgradeLevels);

  return {
    ...currentTrust,
    tier: tiers[newIdx],
    downgrade_risk: true,
  };
}
