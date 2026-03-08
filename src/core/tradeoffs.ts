import type { TradeoffWeights } from "../schemas/intent-spec";

export interface ApproachRatings {
  security: number;
  performance: number;
  speed: number;
  quality: number;
}

export function scoreApproach(ratings: ApproachRatings, weights: TradeoffWeights): number {
  return (
    ratings.security * weights.security +
    ratings.performance * weights.performance +
    ratings.speed * weights.speed +
    ratings.quality * weights.quality
  );
}
