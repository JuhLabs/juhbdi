const COMPLEX_KW = /\b(architect|refactor|migrate|redesign|overhaul|multi.?file|across|system|pipeline|distributed)\b/ig;
const SIMPLE_KW = /\b(fix|typo|rename|format|update|tweak|change|adjust|bug|error|broken|quick|simple)\b/i;
const FILE_REF_RX = /\b[\w/.-]+\.(ts|js|tsx|jsx|css|html|json|md)\b/g;

export function scoreComplexity(message: string): number {
  if (!message) return 0;

  let score = 0;
  const words = message.split(/\s+/).length;
  const clauses = message.split(/[.;,!?\n]/).filter(Boolean).length;

  score += Math.min(words / 50, 0.3);
  score += Math.min(clauses / 6, 0.2);

  const complexMatches = (message.match(COMPLEX_KW) || []).length;
  if (complexMatches > 0) score += Math.min(complexMatches * 0.25, 0.6);
  if (SIMPLE_KW.test(message)) score -= 0.15;

  const fileRefs = (message.match(FILE_REF_RX) || []).length;
  score += Math.min(fileRefs / 5, 0.2);

  return Math.max(0, Math.min(1, score));
}

export type ComplexityBand = 'ghost' | 'suggest' | 'escalate';

export function classifyComplexity(score: number): ComplexityBand {
  if (score < 0.4) return 'ghost';
  if (score < 0.7) return 'suggest';
  return 'escalate';
}
