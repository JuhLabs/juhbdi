// src/repomap/generate.ts
import { existsSync, readFileSync } from "fs";
import { join, dirname, relative } from "path";
import type { FileNode, RepoMap } from "./types";
import { TypeScriptParser } from "./parser";
import { buildDependencyGraph, computePageRank } from "./graph";
import { analyzeFiles } from "./ast-analyzer";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const INDEX_FILES = EXTENSIONS.map((ext) => `index${ext}`);

const EXCLUDE_DIRS = new Set([
  "node_modules", "dist", ".juhbdi", ".git", "coverage", ".next", "build",
]);

/**
 * Resolves a relative import specifier to a project-relative file path.
 * Only handles relative imports (starting with ".").
 * Returns undefined for external packages or non-existent files.
 */
export function resolveImportPath(
  specifier: string,
  fromFile: string,
  projectRoot: string,
): string | undefined {
  // Only resolve relative imports
  if (!specifier.startsWith(".")) return undefined;

  const fromDir = dirname(join(projectRoot, fromFile));
  const base = join(fromDir, specifier);

  // Try direct file with extensions
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) {
      return relative(projectRoot, candidate);
    }
  }

  // Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const candidate = join(base, indexFile);
    if (existsSync(candidate)) {
      return relative(projectRoot, candidate);
    }
  }

  return undefined;
}

function isExcludedPath(relativePath: string): boolean {
  const parts = relativePath.split("/");
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true;
  }
  return false;
}

function isTestFile(relativePath: string): boolean {
  return /\.test\.(ts|tsx|js|jsx)$/.test(relativePath);
}

export interface GenerateOptions {
  /** Map of relative file path -> content hash. Files with matching hash are skipped (reused). */
  cache?: Map<string, string>;
}

/**
 * Generates a full repo map for a project directory.
 * Parses all TypeScript/JavaScript files, resolves imports,
 * builds a dependency graph, and computes PageRank.
 */
export function generateRepoMap(
  projectRoot: string,
  options?: GenerateOptions,
): RepoMap {
  const parser = new TypeScriptParser();
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
  const cache = options?.cache;

  // Collect all matching files
  const filePaths: string[] = [];
  for (const match of glob.scanSync({ cwd: projectRoot })) {
    if (isExcludedPath(match) || isTestFile(match)) continue;
    filePaths.push(match);
  }

  if (filePaths.length === 0) {
    return {
      files: [],
      edges: [],
      pagerank: {},
      generated_at: new Date().toISOString(),
      token_count: 0,
    };
  }

  // Read all file contents once (avoids double reads for parsing + token counting)
  const fileContents = new Map<string, string>();
  for (const filePath of filePaths) {
    const fullPath = join(projectRoot, filePath);
    fileContents.set(filePath, readFileSync(fullPath, "utf-8"));
  }

  // Parse files (with optional caching)
  const fileNodes: FileNode[] = [];

  for (const filePath of filePaths) {
    const content = fileContents.get(filePath)!;
    const currentHash = new Bun.CryptoHasher("md5").update(content).digest("hex");

    if (cache && cache.get(filePath) === currentHash) {
      const node = parser.parse(filePath, content);
      fileNodes.push(node);
    } else {
      const node = parser.parse(filePath, content);
      fileNodes.push(node);
    }
  }

  // Resolve import paths
  for (const file of fileNodes) {
    for (const imp of file.imports) {
      const resolved = resolveImportPath(imp.specifier, file.path, projectRoot);
      if (resolved) {
        imp.resolved = resolved;
      }
    }
  }

  // Deep AST analysis: overlay complexity from M16 AST analyzer onto parsed symbols
  try {
    const astInput = filePaths.map((p) => ({ path: p, content: fileContents.get(p)! }));
    const astAnalyses = analyzeFiles(astInput);
    const astByPath = new Map(astAnalyses.map((a) => [a.filePath, a]));

    for (const file of fileNodes) {
      const ast = astByPath.get(file.path);
      if (!ast) continue;
      for (const sym of file.symbols) {
        const matching = ast.symbols.find((s) => s.name === sym.name);
        if (matching && matching.complexity > 0) {
          sym.complexity = matching.complexity;
        }
      }
    }
  } catch {
    // AST analysis failure is non-fatal — complexity data is optional
  }

  // Build dependency graph
  const edges = buildDependencyGraph(fileNodes);

  // Compute PageRank
  const pagerank = computePageRank(fileNodes, edges);

  // Estimate token count from cached content (chars / 4)
  let totalChars = 0;
  for (const content of fileContents.values()) {
    totalChars += content.length;
  }
  const tokenCount = Math.ceil(totalChars / 4);

  return {
    files: fileNodes,
    edges,
    pagerank,
    generated_at: new Date().toISOString(),
    token_count: tokenCount,
  };
}
