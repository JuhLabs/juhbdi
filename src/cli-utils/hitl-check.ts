import type { HITLGate } from "../schemas/intent-spec";

export interface HITLCheckResult {
  requires_approval: boolean;
  matching_gates: string[];
  reason: string;
}

/**
 * Check if a task description matches any HITL gates.
 * Gates use glob-style patterns: "db:schema:*" matches any task
 * containing "db:schema:" in its description (case-insensitive).
 *
 * Only gates with `approval_required: true` are enforced.
 */
export function matchHITLGates(
  taskDescription: string,
  gates: HITLGate[]
): HITLCheckResult {
  const matching: string[] = [];
  const descLower = taskDescription.toLowerCase();

  for (const gate of gates) {
    if (!gate.approval_required) continue;

    // Convert glob pattern to simple prefix match
    // "db:schema:*" -> check if description contains "db:schema:"
    // Pattern "*" alone becomes prefix "" which matches everything (intentional catch-all)
    // Note: mid-string wildcards (e.g. "a:*:b") are not supported
    const pattern = gate.action_pattern.toLowerCase();
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;

    if (descLower.includes(prefix)) {
      matching.push(gate.action_pattern);
    }
  }

  return {
    requires_approval: matching.length > 0,
    matching_gates: matching,
    reason:
      matching.length > 0
        ? `Task matches HITL gate(s): ${matching.join(", ")}. Human approval required.`
        : "",
  };
}

// CLI entry point
async function main() {
  const taskDesc = process.argv[2];
  const gatesRaw = process.argv[3];

  if (!taskDesc || !gatesRaw) {
    console.error(
      JSON.stringify({
        error:
          "Usage: hitl-check.ts <task_description> <hitl_gates_json>",
      })
    );
    process.exit(1);
  }

  let gates: HITLGate[];
  try {
    gates = JSON.parse(gatesRaw);
  } catch {
    console.error(JSON.stringify({ error: "hitl_gates_json is not valid JSON" }));
    process.exit(1);
  }
  const result = matchHITLGates(taskDesc, gates);
  console.log(JSON.stringify(result));
}

// Only run CLI when executed directly (not imported for tests)
if (import.meta.main) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: String(err) }));
    process.exit(1);
  });
}
