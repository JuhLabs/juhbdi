const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'although',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them',
  'their', 'what', 'which', 'who', 'whom',
]);

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_/.,;:!?()]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0;
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface FailureMatch {
  similarity: number;
  original_task: string;
  failure_reason: string;
  when: string;
  what_fixed_it?: string;
}

export interface MemoryGateResult {
  blocked: boolean;
  matches: FailureMatch[];
  warnings: string[];
  injected_bans: string[];
  recommended_approach?: string;
}

export function queryMemoryGate(description: string, reflexions: any[]): MemoryGateResult {
  const keywords = extractKeywords(description);
  const result: MemoryGateResult = {
    blocked: false,
    matches: [],
    warnings: [],
    injected_bans: [],
  };

  if (!reflexions || reflexions.length === 0) return result;

  for (const r of reflexions) {
    if (!r.failure_signature?.task_keywords) continue;
    const sim = jaccardSimilarity(keywords, r.failure_signature.task_keywords);

    if (r.outcome === 'fail' && sim > 0.7) {
      // BLOCK
      result.blocked = true;
      result.matches.push({
        similarity: sim,
        original_task: r.description || r.id || 'unknown',
        failure_reason: r.failure_signature.error_pattern || 'unknown',
        when: r.timestamp || r.created_at || 'unknown',
        what_fixed_it: r.failure_signature.resolution || undefined,
      });
    } else if (r.outcome === 'fail' && sim > 0.5) {
      // WARN
      result.warnings.push(`Similar task failed: ${r.failure_signature.error_pattern || 'unknown reason'}`);
      if (r.failure_signature.error_pattern) {
        result.injected_bans.push(r.failure_signature.error_pattern);
      }
    } else if (r.outcome === 'pass' && sim > 0.7) {
      // BOOST
      result.recommended_approach = r.failure_signature.resolution || r.description || 'reuse previous approach';
    }
  }

  return result;
}
