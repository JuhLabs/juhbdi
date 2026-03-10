/**
 * Dead Code Detector
 *
 * Identifies potentially unused exports across the codebase
 * by cross-referencing exports with imports.
 */

import type { ASTAnalysis } from "./ast-analyzer";

export interface DeadCodeCandidate {
  file: string;
  symbol: string;
  kind: string;
  line: number;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface DeadCodeReport {
  candidates: DeadCodeCandidate[];
  total_exports: number;
  unused_exports: number;
  dead_code_pct: number;
}

export function detectDeadCode(analyses: ASTAnalysis[]): DeadCodeReport {
  // Build complete import registry: set of all imported symbols per source file
  const importedSymbols = new Map<string, Set<string>>(); // normalized file path -> Set<symbol names>

  for (const analysis of analyses) {
    for (const imp of analysis.imports) {
      const resolved = resolveToFile(imp.module, analysis.filePath, analyses);
      if (resolved) {
        if (!importedSymbols.has(resolved)) importedSymbols.set(resolved, new Set());
        for (const name of imp.names) {
          importedSymbols.get(resolved)!.add(name);
        }
      }
    }
  }

  // Also track re-exports: if file A re-exports from file B, those symbols are "used"
  for (const analysis of analyses) {
    for (const exp of analysis.exports) {
      if (exp.isReExport && exp.fromModule) {
        const resolved = resolveToFile(exp.fromModule, analysis.filePath, analyses);
        if (resolved) {
          if (!importedSymbols.has(resolved)) importedSymbols.set(resolved, new Set());
          if (exp.name === "*") {
            // All exports from the target are considered used
            const targetAnalysis = analyses.find((a) => normalizePath(a.filePath) === resolved);
            if (targetAnalysis) {
              for (const targetExp of targetAnalysis.exports) {
                importedSymbols.get(resolved)!.add(targetExp.name);
              }
            }
          } else {
            importedSymbols.get(resolved)!.add(exp.name);
          }
        }
      }
    }
  }

  const candidates: DeadCodeCandidate[] = [];
  let totalExports = 0;

  for (const analysis of analyses) {
    const normalizedPath = normalizePath(analysis.filePath);
    const usedByOthers = importedSymbols.get(normalizedPath) || new Set();

    // Check test files — skip them for dead code detection
    if (analysis.filePath.includes(".test.") || analysis.filePath.includes(".spec.")) {
      continue;
    }

    for (const exp of analysis.exports) {
      if (exp.isReExport) continue; // re-exports serve as pass-through
      if (exp.name === "*") continue;

      totalExports++;

      if (!usedByOthers.has(exp.name)) {
        // Find the symbol in the analysis for line number
        const sym = analysis.symbols.find((s) => s.name === exp.name);
        const line = sym?.line ?? 0;

        // Determine confidence
        let confidence: DeadCodeCandidate["confidence"] = "medium";
        let reason = "Exported but not imported by any analyzed file";

        // Higher confidence for non-entry files
        if (
          analysis.filePath.includes("/cli-utils/") ||
          analysis.filePath.includes("/bin/")
        ) {
          confidence = "low";
          reason += " (may be a CLI entry point)";
        }

        // Lower confidence for index files (barrel exports)
        if (analysis.filePath.endsWith("/index.ts")) {
          confidence = "low";
          reason += " (barrel export — may be used externally)";
        }

        // Higher confidence for internal modules
        if (
          !analysis.filePath.endsWith("/index.ts") &&
          !analysis.filePath.includes("/cli-utils/") &&
          !analysis.filePath.includes("/bin/")
        ) {
          confidence = "high";
        }

        candidates.push({
          file: analysis.filePath,
          symbol: exp.name,
          kind: exp.kind,
          line,
          confidence,
          reason,
        });
      }
    }
  }

  return {
    candidates,
    total_exports: totalExports,
    unused_exports: candidates.length,
    dead_code_pct: totalExports > 0
      ? Math.round((candidates.length / totalExports) * 100)
      : 0,
  };
}

export function formatDeadCodeReport(report: DeadCodeReport): string {
  const lines: string[] = [];
  lines.push(`Dead Code Report: ${report.unused_exports}/${report.total_exports} exports unused (${report.dead_code_pct}%)`);
  lines.push("");

  if (report.candidates.length === 0) {
    lines.push("No dead code candidates found.");
    return lines.join("\n");
  }

  // Group by confidence
  const high = report.candidates.filter((c) => c.confidence === "high");
  const medium = report.candidates.filter((c) => c.confidence === "medium");
  const low = report.candidates.filter((c) => c.confidence === "low");

  if (high.length > 0) {
    lines.push(`HIGH confidence (${high.length}):`);
    for (const c of high) {
      lines.push(`  ${c.file}:${c.line} — ${c.symbol} (${c.kind})`);
    }
    lines.push("");
  }

  if (medium.length > 0) {
    lines.push(`MEDIUM confidence (${medium.length}):`);
    for (const c of medium) {
      lines.push(`  ${c.file}:${c.line} — ${c.symbol} (${c.kind})`);
    }
    lines.push("");
  }

  if (low.length > 0) {
    lines.push(`LOW confidence (${low.length}):`);
    for (const c of low.slice(0, 10)) {
      lines.push(`  ${c.file}:${c.line} — ${c.symbol} (${c.kind})`);
    }
    if (low.length > 10) {
      lines.push(`  ... and ${low.length - 10} more`);
    }
  }

  return lines.join("\n");
}

function resolveToFile(
  moduleSpec: string,
  fromFile: string,
  analyses: ASTAnalysis[],
): string | null {
  if (!moduleSpec.startsWith(".")) return null;

  const basePath = fromFile.replace(/\/[^/]+$/, "/");
  const candidates = [
    basePath + moduleSpec.replace(/^\.\//, ""),
    basePath + moduleSpec.replace(/^\.\//, "") + ".ts",
    basePath + moduleSpec.replace(/^\.\//, "") + ".tsx",
    basePath + moduleSpec.replace(/^\.\//, "") + "/index.ts",
  ];

  const analysisPaths = new Set(analyses.map((a) => normalizePath(a.filePath)));

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (analysisPaths.has(normalized)) return normalized;
  }

  return null;
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const part of p.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}
