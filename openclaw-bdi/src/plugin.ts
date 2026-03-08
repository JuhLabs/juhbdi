/**
 * @juhlabs/openclaw-bdi
 *
 * BDI governance layer for OpenClaw agents.
 * Provides intent verification, SHA-256 audit trails, learning memory,
 * and trust scoring — works with any LLM.
 *
 * https://www.juhlabs.com/juhbdi
 */

import { verifyIntent, type VerifyIntentInput } from "./tools/verify-intent.js";
import { recall, type RecallInput } from "./tools/recall.js";
import { logDecision, type LogDecisionInput } from "./tools/log-decision.js";
import { reflectOnOutcomes, type ReflectInput } from "./tools/reflect.js";
import { assess, type AssessInput } from "./tools/assess.js";
import { buildGovernanceInjection } from "./hooks/governance.js";
import { auditAgentRun, type AgentRunResult } from "./hooks/audit.js";
import {
  ensureDataDir,
  loadMemory,
  appendMemory,
  loadTrust,
  saveTrust,
  loadPrinciples,
  savePrinciples,
  trailPath,
} from "./storage.js";

// ── OpenClaw Plugin API types ───────────────────────────────
// These match OpenClaw's plugin SDK interface

interface OpenClawPluginApi {
  registerTool(name: string, config: ToolConfig): void;
  on(event: string, handler: (...args: any[]) => any): void;
  log(level: "info" | "warn" | "error", message: string): void;
}

interface ToolConfig {
  description: string;
  parameters: Record<string, ParameterDef>;
  handler: (params: any) => Promise<any>;
}

interface ParameterDef {
  type: string;
  description: string;
  required?: boolean;
  default?: any;
  items?: { type: string };
}

// ── Plugin Entry ────────────────────────────────────────────

export default async function register(api: OpenClawPluginApi): Promise<void> {
  await ensureDataDir();
  api.log("info", "JuhBDI governance layer loaded — intent verification, audit trails, memory, trust scoring");

  // ── Tool: bdi_verify_intent ─────────────────────────────
  api.registerTool("bdi_verify_intent", {
    description:
      "Verify intent before executing an action. Checks for destructive operations, " +
      "sensitive data exposure, and complex tasks that need planning. Returns risk level, " +
      "governance flags, and recommendations.",
    parameters: {
      message: {
        type: "string",
        description: "The user's request or the action about to be taken",
        required: true,
      },
      context: {
        type: "string",
        description: "Additional context about the current task or environment",
        required: false,
      },
    },
    handler: async (params: VerifyIntentInput) => {
      return verifyIntent(params);
    },
  });

  // ── Tool: bdi_recall ────────────────────────────────────
  api.registerTool("bdi_recall", {
    description:
      "Recall relevant past experiences and learned principles for a task. " +
      "Searches the memory bank for similar work done before, returns successful " +
      "approaches, warnings from past failures, and applicable principles.",
    parameters: {
      query: {
        type: "string",
        description: "Description of the current task to find relevant memories for",
        required: true,
      },
      top_k: {
        type: "number",
        description: "Maximum number of experiences to return",
        required: false,
        default: 5,
      },
    },
    handler: async (params: RecallInput) => {
      const [triplets, bank] = await Promise.all([loadMemory(), loadPrinciples()]);
      return recall(params, triplets, bank.principles);
    },
  });

  // ── Tool: bdi_log_decision ──────────────────────────────
  api.registerTool("bdi_log_decision", {
    description:
      "Log an important decision to the SHA-256 hash-chained audit trail. " +
      "Records what was decided, why, and what alternatives were considered. " +
      "Creates a tamper-evident, verifiable decision history.",
    parameters: {
      description: {
        type: "string",
        description: "What was decided",
        required: true,
      },
      reasoning: {
        type: "string",
        description: "Why this decision was made",
        required: true,
      },
      alternatives_considered: {
        type: "array",
        description: "Other options that were considered",
        required: false,
        items: { type: "string" },
      },
      risk_level: {
        type: "string",
        description: "Risk level: low, medium, high, or critical",
        required: false,
        default: "low",
      },
      outcome: {
        type: "string",
        description: "Decision outcome: approved, rejected, or escalated",
        required: false,
        default: "approved",
      },
      task_id: {
        type: "string",
        description: "Optional task identifier for cross-referencing",
        required: false,
      },
    },
    handler: async (params: LogDecisionInput) => {
      return logDecision(params, trailPath());
    },
  });

  // ── Tool: bdi_reflect ───────────────────────────────────
  api.registerTool("bdi_reflect", {
    description:
      "Extract learned principles from completed tasks by analyzing what " +
      "diverged between planned and actual approaches. Builds a growing " +
      "knowledge base that improves future task execution.",
    parameters: {
      outcomes: {
        type: "array",
        description: "Array of task outcomes with planned vs actual approaches",
        required: true,
        items: { type: "object" },
      },
    },
    handler: async (params: ReflectInput) => {
      const bank = await loadPrinciples();
      const { result, newPrinciples } = reflectOnOutcomes(params, bank);

      if (newPrinciples.length > 0) {
        // Merge: update existing, add new
        const existingIds = new Map(bank.principles.map((p) => [p.id, p]));
        for (const np of newPrinciples) {
          existingIds.set(np.id, np);
        }
        await savePrinciples({
          version: "1.0.0",
          principles: [...existingIds.values()],
        });
      }

      return result;
    },
  });

  // ── Tool: bdi_assess ────────────────────────────────────
  api.registerTool("bdi_assess", {
    description:
      "Assess task difficulty and model trust. Estimates how complex a task " +
      "is based on scope, technical terms, and file count. Returns trust " +
      "scores for the specified model based on historical performance.",
    parameters: {
      description: {
        type: "string",
        description: "Task description to assess",
        required: true,
      },
      affected_file_count: {
        type: "number",
        description: "Number of files likely to be modified",
        required: false,
        default: 1,
      },
      model_id: {
        type: "string",
        description: "Model identifier to check trust score for",
        required: false,
      },
    },
    handler: async (params: AssessInput) => {
      const store = await loadTrust();
      return assess(params, store);
    },
  });

  // ── Hook: before_prompt_build ───────────────────────────
  api.on("before_prompt_build", async (context: { message?: string; systemPrompt?: string }) => {
    const message = context.message ?? "";
    const [triplets, bank] = await Promise.all([loadMemory(), loadPrinciples()]);
    const injection = buildGovernanceInjection(message, triplets, bank.principles);

    return {
      systemPromptAppend: injection.rules_text,
    };
  });

  // ── Hook: after_agent_run ───────────────────────────────
  api.on("after_agent_run", async (context: {
    success?: boolean;
    model?: string;
    summary?: string;
    approach?: string;
    duration_ms?: number;
    files_modified?: string[];
  }) => {
    const run: AgentRunResult = {
      success: context.success ?? true,
      model_id: context.model ?? "unknown",
      task_description: context.summary ?? "Agent task",
      approach: context.approach ?? "Direct execution",
      duration_ms: context.duration_ms ?? 0,
      files_modified: context.files_modified,
    };

    try {
      const [trustStore, memories] = await Promise.all([loadTrust(), loadMemory()]);
      const { audit, updatedTrust, newMemory } = await auditAgentRun(
        run,
        trailPath(),
        trustStore,
        memories
      );

      await saveTrust(updatedTrust);
      if (newMemory) {
        await appendMemory(newMemory);
      }

      api.log("info", `BDI audit: ${run.success ? "PASS" : "FAIL"} | trust: ${audit.new_trust_score} | trail: ${audit.trail_entry_hash.slice(0, 8)}...`);
    } catch (err) {
      api.log("warn", `BDI audit failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

// Also export individual modules for direct use
export { verifyIntent } from "./tools/verify-intent.js";
export { recall } from "./tools/recall.js";
export { logDecision } from "./tools/log-decision.js";
export { reflectOnOutcomes } from "./tools/reflect.js";
export { assess } from "./tools/assess.js";
export { buildGovernanceInjection } from "./hooks/governance.js";
export { auditAgentRun } from "./hooks/audit.js";
export * from "./core/schemas.js";
