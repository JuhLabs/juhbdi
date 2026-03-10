// .claude-plugin/hooks/juhbdi-precompact.cjs
//
// PreCompact hook — fires before context compaction (auto or manual).
// Saves ALL intelligence state, generates handoff file, and preserves continuity.
// Uses atomic file writes (write to .tmp, then rename) to prevent partial reads.
//
// Toggle: Users can set "auto_save: true/false" in ~/.claude/juhbdi-settings.json
// Default: enabled (auto-saves on every compaction)

const fs = require("fs");
const path = require("path");

function getSettingsPath() {
  return path.join(process.env.HOME || "", ".claude", "juhbdi-settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), "utf-8"));
  } catch {
    return { auto_save_on_compact: true };
  }
}

function getHandoffDir(cwd) {
  const dir = path.join(cwd, ".juhbdi", "handoffs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
  return dir;
}

function atomicWrite(filePath, content) {
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch {
    // Fallback to direct write
    try {
      fs.writeFileSync(filePath, content);
      return true;
    } catch {
      return false;
    }
  }
}

function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getContextMetrics(sessionId) {
  // Read the bridge file written by the statusline hook
  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
  try {
    return JSON.parse(fs.readFileSync(bridgePath, "utf-8"));
  } catch {
    return { remaining_pct: 0, usable_pct: 0 };
  }
}

function getGitState(cwd) {
  const { execFileSync } = require("child_process");
  const result = {};

  try {
    result.branch = execFileSync("git", ["branch", "--show-current"], {
      cwd, timeout: 3000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch { result.branch = "unknown"; }

  try {
    result.status = execFileSync("git", ["status", "--porcelain"], {
      cwd, timeout: 3000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch { result.status = ""; }

  try {
    result.recent_commits = execFileSync("git", ["log", "--oneline", "-5"], {
      cwd, timeout: 3000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch { result.recent_commits = ""; }

  return result;
}

function getPendingTasks(cwd) {
  try {
    const roadmapPath = path.join(cwd, ".juhbdi", "roadmap-intent.json");
    if (!fs.existsSync(roadmapPath)) return [];
    const roadmap = JSON.parse(fs.readFileSync(roadmapPath, "utf-8"));
    return (roadmap.waves || [])
      .flatMap((w) => w.tasks || [])
      .filter((t) => t.status === "pending" || t.status === "in_progress")
      .map((t) => ({ id: t.id, description: t.description, status: t.status }));
  } catch {
    return [];
  }
}

function getRecentTrailEntries(cwd, count) {
  try {
    const trailPath = path.join(cwd, ".juhbdi", "decision-trail.jsonl");
    if (!fs.existsSync(trailPath)) return [];
    const lines = fs.readFileSync(trailPath, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(-count).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const settings = readSettings();

  // Check if auto-save is disabled
  if (settings.auto_save_on_compact === false) {
    // Still output a reminder even if auto-save is off
    console.log(JSON.stringify({
      additionalContext: [
        "[JUHBDI] Context compaction triggered. Auto-save is DISABLED.",
        "To enable: set auto_save_on_compact to true in ~/.claude/juhbdi-settings.json",
      ].join("\n")
    }));
    return;
  }

  const sessionId = input.session_id || "unknown";
  const cwd = input.cwd || process.cwd();
  const trigger = input.trigger || "auto"; // "auto" or "manual"
  const ts = new Date().toISOString();
  const tsSlug = ts.replace(/[:.]/g, "-").slice(0, 19);

  // Gather state
  const metrics = getContextMetrics(sessionId);
  const gitState = getGitState(cwd);
  const pendingTasks = getPendingTasks(cwd);
  const recentTrail = getRecentTrailEntries(cwd, 50); // Increased from 5 to 50

  const juhbdiDir = path.join(cwd, ".juhbdi");

  // Gather ALL intelligence state
  const reflexionBank = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const trustStore = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const principles = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const memoryBank = safeReadJSON(path.join(juhbdiDir, "memory-bank.json"));
  const bdiState = safeReadJSON(path.join(juhbdiDir, "bdi-state.json"));

  // Build intelligence_state summary
  const intelligenceState = {
    reflexion_count: reflexionBank ? (reflexionBank.entries || []).length : 0,
    trace_count: traces ? (traces.traces || []).length : 0,
    principle_count: principles ? (principles.principles || []).length : 0,
    memory_triplets: memoryBank ? (memoryBank.triplets || []).length : 0,
  };

  // Build handoff snapshot
  const snapshot = {
    generated: ts,
    trigger,
    session_id: sessionId,
    context_remaining_pct: metrics.remaining_pct,
    git: {
      branch: gitState.branch,
      uncommitted_changes: gitState.status ? gitState.status.split("\n").length : 0,
      recent_commits: gitState.recent_commits,
    },
    pending_tasks: pendingTasks,
    recent_decisions: recentTrail.map((e) => ({
      event: e.event_type,
      description: e.description,
      timestamp: e.timestamp,
    })),
    intelligence_state: intelligenceState,
    // Full state copies for restoration
    saved_state: {
      reflexion_bank: reflexionBank,
      trust_store: trustStore,
      experiential_traces: traces,
      principle_bank: principles,
      memory_bank: memoryBank,
      bdi_state: bdiState,
    },
  };

  // Write handoff file using atomic write
  const handoffDir = getHandoffDir(cwd);
  const handoffPath = path.join(handoffDir, `precompact-${tsSlug}.json`);
  atomicWrite(handoffPath, JSON.stringify(snapshot, null, 2));

  // Write a human-readable handoff prompt
  const promptPath = path.join(handoffDir, `continue-${tsSlug}.md`);
  const taskList = pendingTasks.length > 0
    ? pendingTasks.map((t) => `- [${t.status}] ${t.description}`).join("\n")
    : "No pending JuhBDI tasks.";
  const changeCount = snapshot.git.uncommitted_changes;

  const promptContent = `# JuhBDI Auto-Handoff
Generated: ${ts}
Trigger: ${trigger} compaction
Context remaining: ${Math.round(metrics.remaining_pct || 0)}%

## Git State
Branch: \`${gitState.branch}\`
Uncommitted changes: ${changeCount} file(s)
${gitState.status ? "```\n" + gitState.status + "\n```" : ""}

## Pending Tasks
${taskList}

## Intelligence State
Reflexions stored: ${intelligenceState.reflexion_count}
Experiential traces: ${intelligenceState.trace_count}
Principles: ${intelligenceState.principle_count}
Memory triplets: ${intelligenceState.memory_triplets}

## Recent Decisions
${recentTrail.slice(-3).map((e) => `- ${e.event_type}: ${e.description}`).join("\n") || "None recorded."}

## Next Session Prompt
\`\`\`
Continue from JuhBDI auto-handoff (${tsSlug}).
Read .juhbdi/handoffs/continue-${tsSlug}.md for context.
Branch: ${gitState.branch}. ${pendingTasks.length} pending tasks.
${changeCount > 0 ? `${changeCount} uncommitted changes — review before continuing.` : ""}
\`\`\`
`;

  atomicWrite(promptPath, promptContent);

  // Also save a "latest" pointer for the session-primer to find (atomic write)
  const latestPath = path.join(handoffDir, "latest.json");
  atomicWrite(latestPath, JSON.stringify({
    handoff_file: handoffPath,
    prompt_file: promptPath,
    timestamp: ts,
    session_id: sessionId,
    intelligence_state: intelligenceState,
  }, null, 2));

  // Build the context injection message
  const message = [
    ``,
    `[JUHBDI PRE-COMPACT] Context saved automatically (${trigger} trigger).`,
    `Handoff: .juhbdi/handoffs/continue-${tsSlug}.md`,
    ``,
    `IMPORTANT: Your context was just compacted. Key state preserved:`,
    `- Branch: ${gitState.branch} | ${changeCount} uncommitted changes`,
    pendingTasks.length > 0
      ? `- ${pendingTasks.length} pending task(s): ${pendingTasks.slice(0, 3).map((t) => t.description).join(", ")}`
      : `- No pending JuhBDI tasks`,
    `- Intelligence: ${intelligenceState.reflexion_count} reflexions, ${intelligenceState.trace_count} traces, ${intelligenceState.principle_count} principles`,
    `- Full state saved (reflexion bank, trust store, traces, principles, memory bank)`,
    `- Handoff saved for session continuity`,
    ``,
    `If starting a new session, run: /juhbdi:resume`,
  ].join("\n");

  console.log(JSON.stringify({ additionalContext: message }));
}

main().catch(() => {
  console.log(JSON.stringify({}));
});
