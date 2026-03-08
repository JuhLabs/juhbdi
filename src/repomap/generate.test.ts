// src/repomap/generate.test.ts
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { resolveImportPath, generateRepoMap } from "./generate";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TMP = join(import.meta.dir, "__test_tmp__");

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeFixture(relativePath: string, content: string) {
  const fullPath = join(TMP, relativePath);
  ensureDir(join(fullPath, ".."));
  writeFileSync(fullPath, content);
}

beforeAll(() => {
  // Clean slate
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  // Create fixture project
  writeFixture("src/index.ts", [
    'import { greet } from "./utils/greet";',
    'import { format } from "./utils/format";',
    'export function main() { return greet() + format(); }',
  ].join("\n"));

  writeFixture("src/utils/greet.ts", [
    'import { format } from "./format";',
    'export function greet() { return format("hello"); }',
  ].join("\n"));

  writeFixture("src/utils/format.ts", [
    'export function format(s: string) { return s.toUpperCase(); }',
  ].join("\n"));

  writeFixture("src/internal.ts", [
    'function _privateHelper() { return 42; }',
  ].join("\n"));

  // Test file (should be excluded)
  writeFixture("src/index.test.ts", [
    'import { main } from "./index";',
    'test("works", () => { expect(main()).toBeDefined(); });',
  ].join("\n"));

  // node_modules (should be excluded)
  writeFixture("node_modules/some-lib/index.ts", 'export const x = 1;');

  // dist (should be excluded)
  writeFixture("dist/index.js", 'export const x = 1;');
});

afterAll(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

describe("resolveImportPath", () => {
  test("resolves relative import with .ts extension", () => {
    const result = resolveImportPath("./utils/greet", "src/index.ts", TMP);
    expect(result).toBe("src/utils/greet.ts");
  });

  test("resolves relative import from subdirectory", () => {
    const result = resolveImportPath("./format", "src/utils/greet.ts", TMP);
    expect(result).toBe("src/utils/format.ts");
  });

  test("returns undefined for external packages", () => {
    const result = resolveImportPath("zod", "src/index.ts", TMP);
    expect(result).toBeUndefined();
  });

  test("returns undefined for non-existent relative import", () => {
    const result = resolveImportPath("./nonexistent", "src/index.ts", TMP);
    expect(result).toBeUndefined();
  });

  test("resolves index.ts in directory", () => {
    ensureDir(join(TMP, "src/lib"));
    writeFileSync(join(TMP, "src/lib/index.ts"), 'export const x = 1;');
    const result = resolveImportPath("./lib", "src/index.ts", TMP);
    expect(result).toBe("src/lib/index.ts");
  });
});

describe("generateRepoMap", () => {
  test("generates map with correct file count (excludes tests/node_modules/dist)", () => {
    const map = generateRepoMap(TMP);
    const paths = map.files.map((f) => f.path);
    // Should include: src/index.ts, src/utils/greet.ts, src/utils/format.ts, src/internal.ts, src/lib/index.ts
    // Should exclude: src/index.test.ts, node_modules/*, dist/*
    expect(paths).not.toContain("src/index.test.ts");
    expect(paths).not.toContain("node_modules/some-lib/index.ts");
    expect(paths).not.toContain("dist/index.js");
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/utils/greet.ts");
    expect(paths).toContain("src/utils/format.ts");
  });

  test("resolves import paths in file nodes", () => {
    const map = generateRepoMap(TMP);
    const indexFile = map.files.find((f) => f.path === "src/index.ts");
    expect(indexFile).toBeDefined();
    const resolvedImports = indexFile!.imports.filter((i) => i.resolved);
    expect(resolvedImports.length).toBeGreaterThanOrEqual(2);
    expect(resolvedImports.some((i) => i.resolved === "src/utils/greet.ts")).toBe(true);
    expect(resolvedImports.some((i) => i.resolved === "src/utils/format.ts")).toBe(true);
  });

  test("hub file (format.ts) gets higher PageRank than leaf files", () => {
    const map = generateRepoMap(TMP);
    const formatRank = map.pagerank["src/utils/format.ts"] ?? 0;
    const internalRank = map.pagerank["src/internal.ts"] ?? 0;
    // format.ts is imported by both index.ts and greet.ts, so it should rank higher
    expect(formatRank).toBeGreaterThan(internalRank);
  });

  test("estimates token count", () => {
    const map = generateRepoMap(TMP);
    expect(map.token_count).toBeGreaterThan(0);
    expect(typeof map.token_count).toBe("number");
  });

  test("returns valid generated_at timestamp", () => {
    const map = generateRepoMap(TMP);
    const date = new Date(map.generated_at);
    expect(date.getTime()).not.toBeNaN();
  });

  test("handles empty directory", () => {
    const emptyDir = join(TMP, "__empty__");
    ensureDir(emptyDir);
    const map = generateRepoMap(emptyDir);
    expect(map.files).toEqual([]);
    expect(map.edges).toEqual([]);
    expect(map.pagerank).toEqual({});
    expect(map.token_count).toBe(0);
  });

  test("uses cache to skip unchanged files", () => {
    // First generation
    const map1 = generateRepoMap(TMP);
    // Create cache from first generation
    const cache = new Map<string, string>();
    for (const file of map1.files) {
      cache.set(file.path, file.hash);
    }
    // Second generation with cache — should reuse nodes
    const map2 = generateRepoMap(TMP, { cache });
    expect(map2.files.length).toBe(map1.files.length);
    // Hashes should match since files haven't changed
    for (const file of map2.files) {
      const original = map1.files.find((f) => f.path === file.path);
      expect(file.hash).toBe(original!.hash);
    }
  });
});
