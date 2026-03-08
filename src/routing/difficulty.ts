export interface DifficultyContext {
  description: string;
  affected_file_count: number;
  verification_type: "test" | "lint" | "manual";
  historical_failure_rate: number;
  technical_term_count: number;
}

const W_SCOPE = 0.25;
const W_FILES = 0.25;
const W_HISTORY = 0.2;
const W_VERIFY = 0.15;
const W_TERMS = 0.15;

const VERIFICATION_SCORES: Record<string, number> = {
  lint: 0.2,
  manual: 0.5,
  test: 0.7,
};

export function estimateDifficulty(ctx: DifficultyContext): number {
  const words = ctx.description.split(/\s+/).length;
  const scopeScore = Math.min(1, Math.max(0, (words - 3) / 30));
  const fileScore = Math.min(1, ctx.affected_file_count / 10);
  const historyScore = Math.min(1, Math.max(0, ctx.historical_failure_rate));
  const verifyScore = VERIFICATION_SCORES[ctx.verification_type] ?? 0.5;
  const termScore = Math.min(1, ctx.technical_term_count / 8);

  const raw =
    scopeScore * W_SCOPE +
    fileScore * W_FILES +
    historyScore * W_HISTORY +
    verifyScore * W_VERIFY +
    termScore * W_TERMS;

  return Math.min(1, Math.max(0, raw));
}
