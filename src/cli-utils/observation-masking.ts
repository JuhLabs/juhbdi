// src/cli-utils/observation-masking.ts
//
// Context optimization — truncate tool outputs while preserving reasoning.

const ERROR_PATTERNS = [
  /error/i,
  /Error/,
  /FAIL/,
  /failed/i,
  /FAILED/,
  /panic/i,
  /exception/i,
  /TypeError/,
  /ReferenceError/,
  /SyntaxError/,
];

const WARNING_PATTERNS = [
  /warn/i,
  /Warning/,
  /deprecated/i,
  /WARN/,
];

const IMPORT_EXPORT_PATTERNS = [
  /^import\s/,
  /^export\s/,
  /^from\s/,
  /^module\.exports/,
  /^require\(/,
];

/**
 * Score observation lines by importance.
 * Higher scores = more important to keep.
 * error > warning > import/export > info > blank
 */
export function scoreLines(
  lines: string[]
): Array<{ line: string; score: number; index: number }> {
  return lines.map((line, index) => {
    const trimmed = line.trim();

    // Blank lines get lowest score
    if (trimmed.length === 0) {
      return { line, score: 0, index };
    }

    // Error lines get highest score
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { line, score: 100, index };
      }
    }

    // Warning lines
    for (const pattern of WARNING_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { line, score: 70, index };
      }
    }

    // Import/export lines (useful for structure)
    for (const pattern of IMPORT_EXPORT_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { line, score: 50, index };
      }
    }

    // Regular info lines
    return { line, score: 30, index };
  });
}

/**
 * Mask/truncate a tool output to fit within a line budget.
 */
export function maskObservation(
  output: string,
  maxLines: number,
  options?: {
    preserveErrors?: boolean;
    preserveStructure?: boolean;
    summaryPrefix?: string;
  }
): string {
  const lines = output.split("\n");

  // Under budget — return as-is
  if (lines.length <= maxLines) {
    return output;
  }

  // Never truncate to less than 5 lines
  const effectiveMax = Math.max(5, maxLines);
  const prefix = options?.summaryPrefix ?? "[truncated]";

  const scored = scoreLines(lines);

  // Collect error lines if preserveErrors
  const errorLines = options?.preserveErrors
    ? scored.filter((s) => s.score >= 100)
    : [];

  // Collect structure lines (first 3 + last 3) if preserveStructure
  let structureLines: typeof scored = [];
  if (options?.preserveStructure) {
    const first3 = scored.slice(0, 3);
    const last3 = scored.slice(-3);
    structureLines = [...first3, ...last3];
  }

  // Merge all must-keep lines (deduplicated by index, sorted by original order)
  const mustKeepIndices = new Set<number>();
  for (const s of errorLines) mustKeepIndices.add(s.index);
  for (const s of structureLines) mustKeepIndices.add(s.index);

  const mustKeep = scored
    .filter((s) => mustKeepIndices.has(s.index))
    .sort((a, b) => a.index - b.index);

  // If must-keep already exceeds budget, just use must-keep + notice
  if (mustKeep.length >= effectiveMax - 1) {
    const kept = mustKeep.map((s) => s.line);
    const omitted = lines.length - kept.length;
    return `${prefix} ${omitted} lines omitted\n` + kept.join("\n");
  }

  // Fill remaining budget with highest-scored non-must-keep lines
  const remaining = scored
    .filter((s) => !mustKeepIndices.has(s.index))
    .sort((a, b) => b.score - a.score);

  const budget = effectiveMax - 1 - mustKeep.length; // -1 for truncation notice
  const extras = remaining.slice(0, budget);

  // Merge all selected lines, sorted by original index
  const allSelected = [...mustKeep, ...extras].sort((a, b) => a.index - b.index);
  const omitted = lines.length - allSelected.length;
  const result = allSelected.map((s) => s.line);

  return `${prefix} ${omitted} lines omitted\n` + result.join("\n");
}

/**
 * Compress a file content read for context injection.
 * Keeps imports, exports, function signatures, and class declarations.
 */
export function compressFileContent(
  content: string,
  maxLines: number
): string {
  const lines = content.split("\n");

  if (lines.length <= maxLines) {
    return content;
  }

  const scored = scoreLines(lines);

  // Prioritize imports/exports (score 50) and then by order
  const importExportLines = scored.filter((s) => s.score >= 50);
  const otherLines = scored.filter((s) => s.score < 50 && s.score > 0);

  const budget = maxLines - 1; // -1 for truncation notice
  let selected: typeof scored;

  if (importExportLines.length >= budget) {
    selected = importExportLines.slice(0, budget);
  } else {
    const remaining = budget - importExportLines.length;
    selected = [...importExportLines, ...otherLines.slice(0, remaining)];
  }

  selected.sort((a, b) => a.index - b.index);

  const omitted = lines.length - selected.length;
  return `[compressed] ${omitted} lines omitted\n` + selected.map((s) => s.line).join("\n");
}

/**
 * Estimate token count (rough: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate test output to essential info (pass/fail summary + first failure).
 */
export function truncateTestOutput(
  output: string,
  maxLines: number = 30
): string {
  const lines = output.split("\n");

  if (lines.length <= maxLines) {
    return output;
  }

  const result: string[] = [];

  // Find summary line (e.g., "X pass, Y fail" or "X tests passed")
  let summaryLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (/\d+\s+pass/i.test(line) || /tests?\s+passed/i.test(line) || /\d+\s+fail/i.test(line)) {
      summaryLineIdx = i;
      break;
    }
  }

  if (summaryLineIdx >= 0) {
    result.push(lines[summaryLineIdx]);
  }

  // Find first failure block
  let failStart = -1;
  let failEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/FAIL|failed|Error|error/i.test(lines[i])) {
      if (failStart < 0) failStart = i;
      failEnd = i;
      // Capture a few lines after the failure for stack trace
      const traceEnd = Math.min(i + 10, lines.length - 1);
      failEnd = traceEnd;
      break;
    }
  }

  if (failStart >= 0) {
    const failBlock = lines.slice(failStart, failEnd + 1);
    result.push("---");
    result.push(...failBlock);
  }

  // Ensure minimum 5 lines (deduplicate to avoid repeating already-captured lines)
  if (result.length < 5 && lines.length >= 5) {
    const alreadyIn = new Set(result);
    const needed = 5 - result.length;
    const prefix = lines.slice(0, needed).filter((l) => !alreadyIn.has(l));
    result.unshift(...prefix);
  }

  const omitted = lines.length - result.length;
  if (omitted > 0) {
    result.unshift(`[test output truncated] ${omitted} lines omitted`);
  }

  return result.join("\n");
}
