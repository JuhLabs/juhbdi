// Multi-Persona Reflection
// Research: Prevents degeneration in single-perspective reflection
// Spawns 2-3 critic personas to debate failure causes before accepting reflexion

export interface CriticPersona {
  name: string;
  perspective: string; // what this critic focuses on
  prompt_prefix: string;
}

export const DEFAULT_CRITICS: CriticPersona[] = [
  {
    name: "Architect",
    perspective: "structural design and separation of concerns",
    prompt_prefix: "As a software architect focused on system design, analyze this failure:",
  },
  {
    name: "Debugger",
    perspective: "root cause analysis and error propagation",
    prompt_prefix: "As a systematic debugger focused on root causes, analyze this failure:",
  },
  {
    name: "Pragmatist",
    perspective: "simplest fix and avoiding over-engineering",
    prompt_prefix:
      "As a pragmatic engineer focused on the simplest effective solution, analyze this failure:",
  },
];

export interface FailureContext {
  task_description: string;
  approach_taken: string;
  error_summary: string;
  files_modified: string[];
  test_output?: string;
}

export interface CriticAnalysis {
  persona: string;
  root_cause: string;
  suggested_fix: string;
  confidence: number; // 0-1
  disagrees_with?: string; // name of persona they disagree with
}

export interface DebateResult {
  consensus: boolean;
  agreed_root_cause?: string;
  agreed_fix?: string;
  analyses: CriticAnalysis[];
  synthesized_lesson: string;
}

// Build debate prompt for a single critic
export function buildCriticPrompt(
  critic: CriticPersona,
  failure: FailureContext,
  previousAnalyses?: CriticAnalysis[],
): string {
  const lines: string[] = [];
  lines.push(critic.prompt_prefix);
  lines.push("");
  lines.push(`Task: ${failure.task_description}`);
  lines.push(`Approach: ${failure.approach_taken}`);
  lines.push(`Error: ${failure.error_summary}`);
  lines.push(`Files: ${failure.files_modified.join(", ")}`);

  if (failure.test_output) {
    lines.push(`Test output (truncated): ${failure.test_output.substring(0, 500)}`);
  }

  if (previousAnalyses && previousAnalyses.length > 0) {
    lines.push("");
    lines.push("Previous analyses from other critics:");
    for (const prev of previousAnalyses) {
      lines.push(
        `  ${prev.persona}: root cause="${prev.root_cause}", fix="${prev.suggested_fix}"`,
      );
    }
    lines.push("");
    lines.push("Do you agree or disagree? Provide your own analysis.");
  }

  lines.push("");
  lines.push("Respond with:");
  lines.push("ROOT_CAUSE: <1 sentence>");
  lines.push("FIX: <1 sentence>");
  lines.push("CONFIDENCE: <0-1>");
  if (previousAnalyses && previousAnalyses.length > 0) {
    lines.push("DISAGREES_WITH: <persona name or NONE>");
  }

  return lines.join("\n");
}

// Synthesize debate into single lesson
export function synthesizeDebate(analyses: CriticAnalysis[]): DebateResult {
  if (analyses.length === 0) {
    return {
      consensus: false,
      analyses: [],
      synthesized_lesson: "No analyses provided.",
    };
  }

  // Check for consensus: pairwise word overlap between all root causes
  const rootCauses = analyses.map((a) => a.root_cause.toLowerCase());
  const consensus = rootCauses.length > 0 && rootCauses.every((rc, i) =>
    rootCauses.every((other, j) => {
      if (i === j) return true;
      const words = other.split(" ").filter((w) => w.length > 3);
      return words.length > 0 && words.some((word) => rc.includes(word));
    }),
  );

  // Weight by confidence
  const sorted = [...analyses].sort((a, b) => b.confidence - a.confidence);
  const bestAnalysis = sorted[0];

  // Build synthesized lesson
  let lesson: string;

  if (consensus) {
    lesson = `Root cause: ${bestAnalysis.root_cause}. Fix: ${bestAnalysis.suggested_fix}.`;
  } else {
    lesson =
      `Debated root cause (no consensus). ` +
      `${bestAnalysis.persona} (${Math.round(bestAnalysis.confidence * 100)}% confident): ${bestAnalysis.root_cause}. ` +
      `Alternative view from ${sorted[1]?.persona || "unknown"}: ${sorted[1]?.root_cause || "n/a"}.`;
  }

  return {
    consensus,
    agreed_root_cause: consensus ? bestAnalysis.root_cause : undefined,
    agreed_fix: consensus ? bestAnalysis.suggested_fix : undefined,
    analyses,
    synthesized_lesson: lesson,
  };
}
