// src/repomap/format.ts
import type { RepoMap, FileNode, SymbolKind } from "./types";

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
 * Estimates token count for a text string.
 * Uses the standard chars/4 approximation.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Formats a single file's exported symbols into a compact text block.
 * Format: "path:\n  kind name\n  kind name\n"
 */
function formatFileEntry(file: FileNode): string {
  const exportedSymbols = file.symbols.filter((s) => s.exported);
  if (exportedSymbols.length === 0) return "";

  const lines = [`${file.path}:`];
  for (const sym of exportedSymbols) {
    const complexityHint = sym.complexity && sym.complexity > 3
      ? ` [complexity:${sym.complexity}]`
      : "";
    lines.push(`  ${KIND_PREFIX[sym.kind]} ${sym.name}${complexityHint}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Formats a RepoMap into a token-budgeted text representation.
 * Files are sorted by PageRank (highest first) and only exported symbols are shown.
 * Accumulates file entries until the token budget (with 20% tolerance) is reached.
 *
 * Returns empty string for empty maps or maps with no exported symbols.
 */
export function formatRepoMap(repoMap: RepoMap, budget = 1024): string {
  if (repoMap.files.length === 0) return "";

  // Sort files by PageRank descending
  const sorted = [...repoMap.files].sort((a, b) => {
    const rankA = repoMap.pagerank[a.path] ?? 0;
    const rankB = repoMap.pagerank[b.path] ?? 0;
    return rankB - rankA;
  });

  // Filter to files that have at least one exported symbol
  const withExports = sorted.filter(
    (f) => f.symbols.some((s) => s.exported),
  );

  if (withExports.length === 0) return "";

  // Format entries and accumulate within budget
  const maxTokens = Math.ceil(budget * 1.2);
  let result = "";
  let currentTokens = 0;

  for (const file of withExports) {
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
