// src/repomap/select.ts
import type { RepoMap, FileNode, SymbolKind, EdgeType } from "./types";
import { estimateTokens } from "./format";

/** Weight multipliers for edge types — stronger edges propagate more score */
const EDGE_TYPE_WEIGHTS: Record<EdgeType, number> = {
  import: 1.0,
  call: 0.8,
  type_ref: 0.7,
  re_export: 0.5,
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
  "be", "has", "had", "have", "not", "no", "do", "does", "did", "will",
  "can", "should", "would", "could", "may", "might", "add", "fix", "new",
  "update", "remove", "change", "make",
]);

const KIND_PREFIX: Record<SymbolKind, string> = {
  function: "function",
  class: "class",
  interface: "interface",
  type: "type",
  enum: "enum",
  variable: "const",
  import: "import",
  call_ref: "call",
  re_export: "re-export",
};

/**
 * Extracts meaningful keywords from a task description.
 * Filters stopwords and short tokens (< 3 chars).
 */
function extractKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Checks if a keyword partially matches a target string (case-insensitive).
 * Uses bidirectional containment: either the keyword is found in the target,
 * or the target is found in the keyword. Also checks shared prefix (min 4 chars).
 */
function fuzzyMatch(keyword: string, target: string): boolean {
  const kw = keyword.toLowerCase();
  const tgt = target.toLowerCase();
  if (tgt.includes(kw) || kw.includes(tgt)) return true;
  // Shared prefix match (minimum 4 chars)
  const minLen = Math.min(kw.length, tgt.length);
  if (minLen < 4) return false;
  let shared = 0;
  for (let i = 0; i < minLen; i++) {
    if (kw[i] === tgt[i]) shared++;
    else break;
  }
  return shared >= 4;
}

/**
 * Formats a single file's exported symbols into a compact text block.
 */
function formatFileEntry(file: FileNode): string {
  const exportedSymbols = file.symbols.filter((s) => s.exported);
  if (exportedSymbols.length === 0) return "";

  const lines = [`${file.path}:`];
  for (const sym of exportedSymbols) {
    lines.push(`  ${KIND_PREFIX[sym.kind]} ${sym.name}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Selects and formats the most relevant files for a given task description.
 *
 * Scoring algorithm:
 * - Symbol name match: +10 per matching symbol
 * - Path segment match: +5 per matching path segment
 * - PageRank boost: rank * 100
 * - Dependency neighbor boost: +3 if neighbor of a high-scoring file
 *
 * Results are sorted by score and formatted within the token budget.
 */
export function selectRelevantFiles(
  taskDescription: string,
  repoMap: RepoMap,
  budget = 1024,
): string {
  if (repoMap.files.length === 0) return "";

  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0 && repoMap.files.length === 0) return "";

  // Score each file
  const scores = new Map<string, number>();

  for (const file of repoMap.files) {
    let score = 0;

    // Symbol match: +10 per matching exported symbol
    for (const sym of file.symbols) {
      if (!sym.exported) continue;
      for (const kw of keywords) {
        if (fuzzyMatch(kw, sym.name)) {
          score += 10;
        }
      }
    }

    // Path match: +5 per matching path segment
    const pathParts = file.path.toLowerCase().replace(/[^a-z0-9/]/g, "").split("/");
    for (const kw of keywords) {
      for (const part of pathParts) {
        if (part.includes(kw)) {
          score += 5;
        }
      }
    }

    // PageRank boost
    const rank = repoMap.pagerank[file.path] ?? 0;
    score += rank * 100;

    scores.set(file.path, score);
  }

  // Multi-hop dependency neighbor boost with edge-type weights
  // Determine "high scorers" = top 20% by score
  const sortedByScore = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topCount = Math.max(1, Math.ceil(sortedByScore.length * 0.2));
  const highScorers = new Set(sortedByScore.slice(0, topCount).map(([path]) => path));

  // Build adjacency map for efficient neighbor lookups
  const adjacency = new Map<string, { neighbor: string; edgeWeight: number }[]>();
  for (const edge of repoMap.edges) {
    const w = EDGE_TYPE_WEIGHTS[edge.edge_type] ?? 1.0;
    if (!adjacency.has(edge.from_file)) adjacency.set(edge.from_file, []);
    if (!adjacency.has(edge.to_file)) adjacency.set(edge.to_file, []);
    adjacency.get(edge.from_file)!.push({ neighbor: edge.to_file, edgeWeight: w });
    adjacency.get(edge.to_file)!.push({ neighbor: edge.from_file, edgeWeight: w });
  }

  // 1-hop boost: +3 * edgeWeight for direct neighbors of high scorers
  for (const highPath of highScorers) {
    const parentScore = scores.get(highPath) ?? 0;
    const neighbors1 = adjacency.get(highPath) ?? [];
    for (const { neighbor, edgeWeight } of neighbors1) {
      const current = scores.get(neighbor) ?? 0;
      scores.set(neighbor, current + 3 * edgeWeight);

      // 2-hop boost: parentScore * edgeWeight * 0.3 for neighbors-of-neighbors
      const neighbors2 = adjacency.get(neighbor) ?? [];
      for (const { neighbor: hop2, edgeWeight: ew2 } of neighbors2) {
        if (hop2 === highPath) continue; // skip back-edge to origin
        const cur2 = scores.get(hop2) ?? 0;
        scores.set(hop2, cur2 + parentScore * ew2 * 0.3);
      }
    }
  }

  // Sort files by score descending
  const ranked = [...repoMap.files].sort((a, b) => {
    const scoreA = scores.get(a.path) ?? 0;
    const scoreB = scores.get(b.path) ?? 0;
    return scoreB - scoreA;
  });

  // Format within budget (with 20% tolerance)
  const maxTokens = Math.ceil(budget * 1.2);
  let result = "";
  let currentTokens = 0;

  for (const file of ranked) {
    const entry = formatFileEntry(file);
    if (entry === "") continue;

    const entryTokens = estimateTokens(entry);
    if (currentTokens + entryTokens > maxTokens && result.length > 0) {
      break;
    }

    result += entry;
    currentTokens += entryTokens;
  }

  return result;
}
