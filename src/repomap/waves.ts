// src/repomap/waves.ts — Dependency-aware wave optimizer
import type { RepoMap, FileNode, DependencyEdge } from "./types";
import type { Task, Wave } from "../schemas/roadmap-intent";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "to", "of", "in", "for", "on", "with",
  "add", "fix", "update", "create", "implement", "change", "modify", "remove",
]);

/**
 * Extract meaningful keywords from a task description.
 * Filters stopwords and tokens shorter than 3 chars.
 */
function extractKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .split(/[\s/\-_.,:;()]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Get 1-hop dependency neighbors for a file from the edge list.
 * Returns files that import from, or are imported by, the given file.
 */
function getNeighbors(filePath: string, edges: DependencyEdge[]): string[] {
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.from_file === filePath) neighbors.add(edge.to_file);
    if (edge.to_file === filePath) neighbors.add(edge.from_file);
  }
  return Array.from(neighbors);
}

/**
 * Estimate which files a task might affect based on keyword matching
 * against file paths and symbol names, plus 1-hop dependency neighbors.
 */
export function estimateAffectedFiles(task: Task, repoMap: RepoMap): string[] {
  const keywords = extractKeywords(task.description);
  if (keywords.length === 0) return [];

  const directMatches = new Set<string>();

  for (const file of repoMap.files) {
    // Match against file path segments
    const pathTokens = file.path.toLowerCase().split(/[\s/\-_.,:;()]+/).filter((t) => t.length >= 3);
    const pathMatch = keywords.some((kw) =>
      pathTokens.some((token) => token.includes(kw) || (token.length >= 4 && kw.includes(token)))
    );

    // Match against symbol names
    const symbolMatch = file.symbols.some((sym) => {
      const symLower = sym.name.toLowerCase();
      // Split camelCase and PascalCase symbol names
      const symParts = symLower.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/);
      return keywords.some(
        (kw) => symLower.includes(kw) || symParts.some((part) => part === kw || part.includes(kw))
      );
    });

    if (pathMatch || symbolMatch) {
      directMatches.add(file.path);
    }
  }

  // Expand to 1-hop neighbors
  const allAffected = new Set(directMatches);
  for (const matchedPath of directMatches) {
    for (const neighbor of getNeighbors(matchedPath, repoMap.edges)) {
      allAffected.add(neighbor);
    }
  }

  return Array.from(allAffected);
}

/**
 * Build a bidirectional conflict adjacency map.
 * Two tasks conflict if their affected file sets overlap.
 */
export function buildConflictGraph(
  affectedFiles: Map<string, string[]>
): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  const taskIds = Array.from(affectedFiles.keys());

  // Initialize all task entries
  for (const id of taskIds) {
    conflicts.set(id, []);
  }

  // Check each pair for overlap
  for (let i = 0; i < taskIds.length; i++) {
    for (let j = i + 1; j < taskIds.length; j++) {
      const a = taskIds[i];
      const b = taskIds[j];
      const filesA = new Set(affectedFiles.get(a) ?? []);
      const filesB = affectedFiles.get(b) ?? [];

      const hasOverlap = filesB.some((f) => filesA.has(f));
      if (hasOverlap) {
        conflicts.get(a)!.push(b);
        conflicts.get(b)!.push(a);
      }
    }
  }

  return conflicts;
}

/**
 * Optimize task execution order into dependency-aware waves.
 * Uses greedy graph coloring: each task goes in the earliest wave
 * that has no conflicting tasks.
 */
export function optimizeWaves(tasks: Task[], repoMap: RepoMap): Wave[] {
  if (tasks.length === 0) return [];

  // Step 1: Estimate affected files per task
  const affectedMap = new Map<string, string[]>();
  for (const task of tasks) {
    affectedMap.set(task.id, estimateAffectedFiles(task, repoMap));
  }

  // Step 2: Build conflict graph
  const conflicts = buildConflictGraph(affectedMap);

  // Step 3: Greedy graph coloring
  // Assign each task to the earliest wave with no conflicting tasks
  const taskWave = new Map<string, number>(); // task_id → wave index

  for (const task of tasks) {
    const taskConflicts = new Set(conflicts.get(task.id) ?? []);

    // Find earliest wave index with no conflicts
    let waveIdx = 0;
    while (true) {
      // Check if any task already in this wave conflicts
      const waveHasConflict = Array.from(taskWave.entries()).some(
        ([otherId, otherWave]) => otherWave === waveIdx && taskConflicts.has(otherId)
      );
      if (!waveHasConflict) break;
      waveIdx++;
    }

    taskWave.set(task.id, waveIdx);
  }

  // Step 4: Group tasks by wave
  const waveGroups = new Map<number, Task[]>();
  for (const task of tasks) {
    const idx = taskWave.get(task.id)!;
    if (!waveGroups.has(idx)) waveGroups.set(idx, []);
    waveGroups.get(idx)!.push(task);
  }

  // Step 5: Build Wave objects with sequential IDs
  const sortedWaveIndices = Array.from(waveGroups.keys()).sort((a, b) => a - b);

  return sortedWaveIndices.map((idx, i) => {
    const waveTasks = waveGroups.get(idx)!;
    return {
      id: `w${i + 1}`,
      parallel: waveTasks.length > 1,
      tasks: waveTasks,
    };
  });
}
