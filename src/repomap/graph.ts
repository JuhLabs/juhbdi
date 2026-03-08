import type { FileNode, DependencyEdge, EdgeType } from "./types";

/**
 * Resolve a relative import specifier from a file's directory to a target path
 * in the file map. Returns the resolved path or null if not found.
 */
function resolveImport(
  fromPath: string,
  specifier: string,
  resolved: string | undefined,
  pathSet: Set<string>,
): string | null {
  // If already resolved, use it directly
  if (resolved && pathSet.has(resolved)) return resolved;

  // Skip bare specifiers (external packages like "chalk", "zod")
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;

  // Try to resolve relative path
  const fromDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : ".";

  // Normalize path segments
  const parts = `${fromDir}/${specifier}`.split("/");
  const normalized: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") {
      normalized.pop();
    } else {
      normalized.push(p);
    }
  }
  const base = normalized.join("/");

  // Try common extensions
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];

  for (const candidate of candidates) {
    if (pathSet.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Build dependency edges from resolved imports between files in the map.
 * Ignores imports to files not in the map (external packages).
 *
 * Weight multipliers (Aider-inspired):
 * - Identifier length >= 8 chars: multiply weight by 1.5
 * - Starts with `_`: multiply weight by 0.1
 * - Defined in > 5 files: multiply weight by 0.1
 */
export function buildDependencyGraph(files: FileNode[]): DependencyEdge[] {
  if (files.length === 0) return [];

  const pathSet = new Set(files.map((f) => f.path));
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  // Pre-compute: how many files define each identifier
  const definitionCount = new Map<string, number>();
  for (const file of files) {
    for (const sym of file.symbols) {
      if (sym.exported) {
        definitionCount.set(sym.name, (definitionCount.get(sym.name) ?? 0) + 1);
      }
    }
  }

  const edges: DependencyEdge[] = [];

  for (const file of files) {
    // Group imports by resolved target
    const targetImports = new Map<string, Set<string>>();

    for (const imp of file.imports) {
      const target = resolveImport(file.path, imp.specifier, imp.resolved, pathSet);
      if (!target || target === file.path) continue;

      if (!targetImports.has(target)) {
        targetImports.set(target, new Set());
      }
    }

    // Pre-compute sets for determining edge type
    const reExportNames = new Set(
      file.symbols
        .filter((s) => s.kind === "re_export")
        .map((s) => s.name)
    );
    const callRefNames = new Set(
      file.symbols
        .filter((s) => s.kind === "call_ref")
        .map((s) => s.name)
    );

    // For each target, find which exported identifiers from that file are relevant
    for (const [target, _identSet] of targetImports) {
      const targetFile = fileByPath.get(target);
      if (!targetFile) continue;

      const identifiers: string[] = [];
      let weight = 0;
      let hasCall = false;
      let hasReExport = false;

      // Use all exported symbols from the target as identifiers
      for (const sym of targetFile.symbols) {
        if (!sym.exported) continue;
        identifiers.push(sym.name);

        // Check if this symbol is called or re-exported by the source file
        if (callRefNames.has(sym.name)) hasCall = true;
        if (reExportNames.has(sym.name)) hasReExport = true;

        let idWeight = 1.0;

        // Weight multiplier: long identifier names (>= 8 chars)
        if (sym.name.length >= 8) {
          idWeight *= 1.5;
        }

        // Weight multiplier: private convention (starts with _)
        if (sym.name.startsWith("_")) {
          idWeight *= 0.1;
        }

        // Weight multiplier: defined in many files (> 5)
        const defCount = definitionCount.get(sym.name) ?? 0;
        if (defCount > 5) {
          idWeight *= 0.1;
        }

        weight += idWeight;
      }

      // If the target has no exported symbols, still create a minimal edge
      if (identifiers.length === 0) {
        identifiers.push("*");
        weight = 1.0;
      }

      // Determine edge type based on how the dependency is used
      // Priority: re_export > call > import (default)
      let edge_type: EdgeType = "import";
      if (hasReExport) {
        edge_type = "re_export";
      } else if (hasCall) {
        edge_type = "call";
      }

      edges.push({
        from_file: file.path,
        to_file: target,
        identifiers,
        weight,
        edge_type,
      });
    }
  }

  return edges;
}

/**
 * Standard iterative PageRank with damping factor.
 *
 * @param files - All file nodes in the map
 * @param edges - Dependency edges between files
 * @param personalization - Optional personalization vector (boost specific files)
 * @param damping - Damping factor (default 0.85)
 * @param iterations - Number of iterations (default 20)
 * @returns Record of file path to rank (sums approximately to 1.0)
 */
export function computePageRank(
  files: FileNode[],
  edges: DependencyEdge[],
  personalization?: Record<string, number>,
  damping: number = 0.85,
  iterations: number = 20,
): Record<string, number> {
  const n = files.length;
  if (n === 0) return {};

  // Map file paths to indices
  const pathToIdx = new Map<string, number>();
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    pathToIdx.set(files[i].path, i);
    paths.push(files[i].path);
  }

  // Build inbound adjacency list: for each node, which nodes point to it and with what weight
  // Edge direction: from_file imports from to_file, so PageRank flows from_file -> to_file
  // (the imported file gets the rank, like a citation)
  const inbound: { from: number; weight: number }[][] = Array.from({ length: n }, () => []);
  const outWeights = new Float64Array(n); // total outbound weight per node

  for (const edge of edges) {
    const fromIdx = pathToIdx.get(edge.from_file);
    const toIdx = pathToIdx.get(edge.to_file);
    if (fromIdx === undefined || toIdx === undefined) continue;

    inbound[toIdx].push({ from: fromIdx, weight: edge.weight });
    outWeights[fromIdx] += edge.weight;
  }

  // Personalization vector (uniform by default)
  const personal = new Float64Array(n);
  if (personalization) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      personal[i] = personalization[paths[i]] ?? 0;
      sum += personal[i];
    }
    // Normalize
    if (sum > 0) {
      for (let i = 0; i < n; i++) {
        personal[i] /= sum;
      }
    } else {
      personal.fill(1 / n);
    }
  } else {
    personal.fill(1 / n);
  }

  // Initialize ranks uniformly
  let ranks = new Float64Array(n).fill(1 / n);

  // Iterative PageRank
  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Float64Array(n);

    // Compute dangling node mass (nodes with no outbound edges)
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (outWeights[i] === 0) {
        danglingMass += ranks[i];
      }
    }

    for (let i = 0; i < n; i++) {
      let inboundSum = 0;
      for (const { from, weight } of inbound[i]) {
        if (outWeights[from] > 0) {
          inboundSum += ranks[from] * (weight / outWeights[from]);
        }
      }

      // Standard PageRank formula with dangling node redistribution
      newRanks[i] =
        (1 - damping) * personal[i] +
        damping * (inboundSum + danglingMass * personal[i]);
    }

    ranks = newRanks;
  }

  // Convert to Record
  const result: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    result[paths[i]] = ranks[i];
  }

  return result;
}
