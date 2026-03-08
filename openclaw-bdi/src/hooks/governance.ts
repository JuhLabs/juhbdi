import { scoreMessage, DEFAULT_RULES } from "../core/rules.js";
import { retrieveWithContext } from "../core/memory.js";
import type { ExperienceTriplet, Principle } from "../core/schemas.js";

export interface GovernanceInjection {
  rules_text: string;
  memory_context: string;
  principle_context: string;
  flags_raised: number;
}

const BASE_GOVERNANCE_RULES = `
## BDI Governance (powered by JuhBDI)

You have access to BDI governance tools. Use them to make better decisions:

1. **Before destructive or risky actions** (deleting files, dropping databases, force pushing, deploying to production): Call \`bdi_verify_intent\` to check for governance flags.
2. **Before complex tasks** (building features, refactoring, migrations): Call \`bdi_recall\` to check if similar work was done before and learn from past approaches.
3. **After making important decisions**: Call \`bdi_log_decision\` to record why you chose this approach over alternatives. This creates an auditable trail.
4. **After completing tasks**: Call \`bdi_reflect\` to extract lessons from what worked differently than planned.
5. **When unsure about task complexity**: Call \`bdi_assess\` to estimate difficulty and check model trust scores.

These tools help you avoid repeating mistakes, build on past successes, and maintain an auditable decision history.
`.trim();

export function buildGovernanceInjection(
  currentMessage: string,
  triplets: ExperienceTriplet[],
  principles: Principle[]
): GovernanceInjection {
  let rules_text = BASE_GOVERNANCE_RULES;
  let memory_context = "";
  let principle_context = "";

  // Check if current message triggers any governance rules
  const suggestions = scoreMessage(currentMessage, DEFAULT_RULES, 0.5);
  const flags_raised = suggestions.length;

  if (flags_raised > 0) {
    const flagLines = suggestions.map(
      (s) => `- **${s.rule.description}** (confidence: ${Math.round(s.score * 100)}%)`
    );
    rules_text += `\n\n### Active Governance Flags\n${flagLines.join("\n")}`;
  }

  // Load relevant memories for the current task
  if (triplets.length > 0) {
    const relevant = retrieveWithContext(currentMessage, triplets, 3);
    if (relevant.length > 0) {
      const memLines = relevant.map(
        (m) => `- "${m.intent.task_description}" → approach: "${m.experience.approach}" (${m.experience.test_result}, utility: ${m.utility})`
      );
      memory_context = `\n### Relevant Past Experiences\n${memLines.join("\n")}`;
    }
  }

  // Load matching principles
  if (principles.length > 0) {
    const queryWords = new Set(currentMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const matching = principles.filter((p) => {
      const pWords = new Set(p.keywords.map((k) => k.toLowerCase()));
      let overlap = 0;
      for (const w of queryWords) if (pWords.has(w)) overlap++;
      return queryWords.size > 0 && overlap / queryWords.size >= 0.2;
    });

    if (matching.length > 0) {
      const pLines = matching
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map((p) => `- ${p.principle} (confidence: ${Math.round(p.confidence * 100)}%)`);
      principle_context = `\n### Learned Principles\n${pLines.join("\n")}`;
    }
  }

  return {
    rules_text: rules_text + memory_context + principle_context,
    memory_context,
    principle_context,
    flags_raised,
  };
}
