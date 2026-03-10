/**
 * Call Graph Builder
 *
 * Builds a directed graph of function calls across files.
 * Uses AST analysis results to map which functions call which.
 */

import type { ASTAnalysis } from "./ast-analyzer";

export interface CallEdge {
  caller: string;       // "file.ts:functionName"
  callee: string;       // "file.ts:functionName" or "external:moduleName"
  callCount: number;
  line: number;
}

export interface CallGraph {
  nodes: string[];      // all function identifiers
  edges: CallEdge[];
  entry_points: string[]; // functions with no callers
  hot_paths: string[];    // most-called functions
}

export function buildCallGraph(analyses: ASTAnalysis[]): CallGraph {
  const nodeSet = new Set<string>();
  const edges: CallEdge[] = [];
  const calledBy = new Map<string, Set<string>>();
  const callCounts = new Map<string, number>();

  // Build export map: module -> exported names
  const exportMap = new Map<string, Set<string>>();
  for (const analysis of analyses) {
    const exported = new Set<string>();
    for (const exp of analysis.exports) {
      if (exp.name !== "*") exported.add(exp.name);
    }
    exportMap.set(analysis.filePath, exported);
  }

  // Build import resolution: file -> (local name -> source file:original name)
  const importResolution = new Map<string, Map<string, string>>();
  for (const analysis of analyses) {
    const localMap = new Map<string, string>();
    for (const imp of analysis.imports) {
      // Try to resolve module to one of our analyzed files
      const resolved = resolveModule(imp.module, analysis.filePath, analyses);
      for (const name of imp.names) {
        if (resolved) {
          localMap.set(name, `${resolved}:${name}`);
        } else {
          localMap.set(name, `external:${imp.module}:${name}`);
        }
      }
    }
    importResolution.set(analysis.filePath, localMap);
  }

  // Register all function/method symbols as nodes
  for (const analysis of analyses) {
    for (const sym of analysis.symbols) {
      if (sym.kind === "function" || sym.kind === "method") {
        const nodeId = `${analysis.filePath}:${sym.name}`;
        nodeSet.add(nodeId);
      }
    }
  }

  // For each function, find calls to imported or local symbols
  for (const analysis of analyses) {
    const localImports = importResolution.get(analysis.filePath) || new Map();
    const localFunctions = new Set(
      analysis.symbols
        .filter((s) => s.kind === "function" || s.kind === "method")
        .map((s) => s.name),
    );

    for (const sym of analysis.symbols) {
      if (sym.kind !== "function" && sym.kind !== "method") continue;
      const callerId = `${analysis.filePath}:${sym.name}`;

      // Check if any imported or local names are referenced
      // This is an approximation — we check if import names appear as symbols
      for (const [localName, resolvedTarget] of localImports) {
        if (localFunctions.has(localName)) continue; // skip if it shadows a local
        // Count as a call edge (approximation based on import + function existence)
        const targetNode = resolvedTarget;
        if (nodeSet.has(targetNode) || targetNode.startsWith("external:")) {
          nodeSet.add(targetNode);
          edges.push({
            caller: callerId,
            callee: targetNode,
            callCount: 1,
            line: sym.line,
          });

          if (!calledBy.has(targetNode)) calledBy.set(targetNode, new Set());
          calledBy.get(targetNode)!.add(callerId);
          callCounts.set(targetNode, (callCounts.get(targetNode) || 0) + 1);
        }
      }

      // Note: local function calls within the same file require actual
      // call-site detection (walking the AST for CallExpression nodes).
      // This is deferred to avoid false positives in the initial implementation.
    }
  }

  const nodes = Array.from(nodeSet);

  // Entry points: nodes with no callers
  const calledNodes = new Set(edges.map((e) => e.callee));
  const entry_points = nodes.filter(
    (n) => !calledNodes.has(n) && !n.startsWith("external:"),
  );

  // Hot paths: top 5 most-called functions
  const hot_paths = Array.from(callCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return { nodes, edges, entry_points, hot_paths };
}

function resolveModule(
  moduleSpec: string,
  fromFile: string,
  analyses: ASTAnalysis[],
): string | null {
  if (!moduleSpec.startsWith(".")) return null;

  // Simple resolution: try common extensions
  const basePath = fromFile.replace(/\/[^/]+$/, "/");
  const candidates = [
    basePath + moduleSpec.replace(/^\.\//, ""),
    basePath + moduleSpec.replace(/^\.\//, "") + ".ts",
    basePath + moduleSpec.replace(/^\.\//, "") + ".tsx",
    basePath + moduleSpec.replace(/^\.\//, "") + "/index.ts",
  ];

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (analyses.some((a) => normalizePath(a.filePath) === normalized)) {
      return normalized;
    }
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
