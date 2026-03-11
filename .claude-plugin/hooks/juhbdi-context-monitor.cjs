// .claude-plugin/hooks/juhbdi-context-monitor.cjs
//
// PostToolUse hook — reads bridge file, injects context warnings, and
// auto-generates handoff files when context gets critically low.
// Debounces warnings to avoid noise. Escalates severity without debounce.
//
// 4-Level Threshold System (M12 Context Fortress):
//   WARNING   45% — early heads-up
//   URGENT    35% — strong warning, prepare handoff
//   CRITICAL  28% — auto-save ALL state
//   EMERGENCY 22% — DEMAND session end, refuse further work

const fs = require("fs");
const path = require("path");

const THRESHOLDS = {
  WARNING: 45,   // Was 35% — now warns much earlier
  URGENT: 35,    // Was 28% — escalation point
  CRITICAL: 28,  // Was 22% — auto-saves everything
  EMERGENCY: 22, // NEW — demands immediate session end
};
const DEBOUNCE_TOOL_USES = 4;

function getMonitorStatePath(sessionId) {
  return `/tmp/juhbdi-monitor-${sessionId}.json`;
}

function readMonitorState(sessionId) {
  try {
    const raw = fs.readFileSync(getMonitorStatePath(sessionId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { last_level: "NORMAL", tool_uses_since_warning: 0, handoff_written: false, emergency_fired: false };
  }
}

function writeMonitorState(sessionId, state) {
  const filePath = getMonitorStatePath(sessionId);
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state));
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Fallback to direct write
    try { fs.writeFileSync(filePath, JSON.stringify(state)); } catch { /* non-fatal */ }
  }
}

function logError(message) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync("/tmp/juhbdi-errors.log", `[${ts}] context-monitor: ${message}\n`);
  } catch {
    // Non-fatal
  }
}

function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    logError(`Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

function saveStateFiles(cwd, sessionId, remainingPct) {
  const juhbdiDir = path.join(cwd, ".juhbdi");
  const handoffDir = path.join(juhbdiDir, "handoffs");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  try {
    fs.mkdirSync(handoffDir, { recursive: true });
  } catch { return null; }

  // Gather all intelligence state
  const stateSnapshot = {
    generated: new Date().toISOString(),
    session_id: sessionId,
    context_remaining_pct: Math.round(remainingPct),
    saved_files: {},
    intelligence_state: {},
  };

  // Copy reflexion bank
  const reflexionPath = path.join(juhbdiDir, "reflexion-bank.json");
  const reflexionData = safeReadJSON(reflexionPath);
  if (reflexionData) {
    stateSnapshot.saved_files.reflexion_bank = true;
    stateSnapshot.intelligence_state.reflexion_count = (reflexionData.entries || []).length;
    atomicWrite(path.join(handoffDir, `reflexion-bank-${ts}.json`), JSON.stringify(reflexionData, null, 2));
  }

  // Copy trust store
  const trustPath = path.join(juhbdiDir, "trust-store.json");
  const trustData = safeReadJSON(trustPath);
  if (trustData) {
    stateSnapshot.saved_files.trust_store = true;
    atomicWrite(path.join(handoffDir, `trust-store-${ts}.json`), JSON.stringify(trustData, null, 2));
  }

  // Copy last 50 trail entries
  try {
    const trailPath = path.join(juhbdiDir, "decision-trail.log");
    if (fs.existsSync(trailPath)) {
      const lines = fs.readFileSync(trailPath, "utf-8").trim().split("\n").filter(Boolean);
      const last50 = lines.slice(-50).join("\n") + "\n";
      stateSnapshot.saved_files.decision_trail = true;
      stateSnapshot.intelligence_state.trail_entries = Math.min(lines.length, 50);
      atomicWrite(path.join(handoffDir, `decision-trail-${ts}.jsonl`), last50);
    }
  } catch { /* non-fatal */ }

  // Copy experiential traces
  const tracesPath = path.join(juhbdiDir, "experiential-traces.json");
  const tracesData = safeReadJSON(tracesPath);
  if (tracesData) {
    stateSnapshot.saved_files.experiential_traces = true;
    stateSnapshot.intelligence_state.trace_count = (tracesData.traces || []).length;
    atomicWrite(path.join(handoffDir, `experiential-traces-${ts}.json`), JSON.stringify(tracesData, null, 2));
  }

  // Copy principle bank
  const principlesPath = path.join(juhbdiDir, "principle-bank.json");
  const principlesData = safeReadJSON(principlesPath);
  if (principlesData) {
    stateSnapshot.saved_files.principle_bank = true;
    stateSnapshot.intelligence_state.principle_count = (principlesData.principles || []).length;
    atomicWrite(path.join(handoffDir, `principle-bank-${ts}.json`), JSON.stringify(principlesData, null, 2));
  }

  // Copy BDI state
  const bdiPath = path.join(juhbdiDir, "bdi-state.json");
  const bdiData = safeReadJSON(bdiPath);
  if (bdiData) {
    stateSnapshot.saved_files.bdi_state = true;
    atomicWrite(path.join(handoffDir, `bdi-state-${ts}.json`), JSON.stringify(bdiData, null, 2));
  }

  // Write context snapshot
  const snapshotPath = path.join(handoffDir, `context-snapshot-${ts}.json`);
  atomicWrite(snapshotPath, JSON.stringify(stateSnapshot, null, 2));

  return { snapshotPath, ts, stateSnapshot };
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

function writeHandoffFile(cwd, sessionId, remainingPct) {
  const handoffDir = path.join(cwd, ".juhbdi");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const handoffPath = path.join(handoffDir, `handoff-${ts}.md`);

  try {
    fs.mkdirSync(handoffDir, { recursive: true });
  } catch { return null; }

  const content = `# JuhBDI Session Handoff
Generated: ${new Date().toISOString()}
Session: ${sessionId}
Context remaining: ${Math.round(remainingPct)}%

## What was happening
<!-- The context monitor auto-generated this file because context hit ${Math.round(remainingPct)}%. -->
<!-- Claude should have filled in the details below before the session ended. -->

### Current task
_[Auto-fill: what were you working on?]_

### Progress so far
_[Auto-fill: what's done, what's not]_

### Blockers or open questions
_[Auto-fill: anything unresolved]_

### Files changed this session
_[Auto-fill: key files modified]_

## Next session prompt
\`\`\`
Continue from handoff: .juhbdi/${path.basename(handoffPath)}

The previous session ran out of context while working on [TASK].
Pick up where it left off. Read the handoff file first.
\`\`\`
`;

  try {
    fs.writeFileSync(handoffPath, content);
    return handoffPath;
  } catch {
    return null;
  }
}

function writeLatestJson(cwd, sessionId, remainingPct, savedState) {
  const juhbdiDir = path.join(cwd, ".juhbdi");
  const handoffDir = path.join(juhbdiDir, "handoffs");
  const ts = new Date().toISOString();
  const tsSlug = ts.replace(/[:.]/g, "-").slice(0, 19);

  try {
    fs.mkdirSync(handoffDir, { recursive: true });
  } catch { return; }

  // Build a human-readable prompt file (matches precompact format)
  const promptPath = path.join(handoffDir, `continue-${tsSlug}.md`);

  // Read git state for context
  let branch = "unknown";
  try {
    const { execFileSync } = require("child_process");
    branch = execFileSync("git", ["branch", "--show-current"], {
      cwd, timeout: 3000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch { /* non-fatal */ }

  // Read pending tasks
  let pendingTasks = [];
  try {
    const roadmapPath = path.join(juhbdiDir, "roadmap-intent.json");
    if (fs.existsSync(roadmapPath)) {
      const roadmap = JSON.parse(fs.readFileSync(roadmapPath, "utf-8"));
      pendingTasks = (roadmap.waves || [])
        .flatMap((w) => w.tasks || [])
        .filter((t) => t.status === "pending" || t.status === "in_progress")
        .map((t) => ({ id: t.id, description: t.description, status: t.status }));
    }
  } catch { /* non-fatal */ }

  const taskList = pendingTasks.length > 0
    ? pendingTasks.map((t) => `- [${t.status}] ${t.description}`).join("\n")
    : "No pending JuhBDI tasks.";

  const promptContent = `# JuhBDI Context-Monitor Handoff
Generated: ${ts}
Trigger: context-monitor (${Math.round(remainingPct)}% remaining)

## Git State
Branch: \`${branch}\`

## Pending Tasks
${taskList}

## Intelligence State
${savedState && savedState.stateSnapshot ? Object.entries(savedState.stateSnapshot.intelligence_state || {}).map(([k, v]) => `- ${k}: ${v}`).join("\n") : "State snapshot not available."}

## Next Session Prompt
\`\`\`
Continue from JuhBDI context-monitor handoff (${tsSlug}).
Read .juhbdi/handoffs/continue-${tsSlug}.md for context.
Branch: ${branch}. ${pendingTasks.length} pending tasks.
\`\`\`
`;

  const promptWritten = atomicWrite(promptPath, promptContent);
  if (!promptWritten) return; // Don't write latest.json pointing to a missing prompt file

  // Write latest.json in the same format precompact uses
  const latestPath = path.join(handoffDir, "latest.json");
  const intelligenceState = savedState && savedState.stateSnapshot
    ? savedState.stateSnapshot.intelligence_state || {}
    : {};

  atomicWrite(latestPath, JSON.stringify({
    handoff_file: savedState ? savedState.snapshotPath : null,
    prompt_file: promptPath,
    timestamp: ts,
    session_id: sessionId,
    intelligence_state: intelligenceState,
  }, null, 2));
}

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const sessionId = input.session_id || "unknown";
  const cwd = input.cwd || process.cwd();
  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;

  // Read bridge file from statusline hook with JSON validation
  let bridge;
  try {
    if (!fs.existsSync(bridgePath)) {
      // Bridge file missing — statusline hasn't run yet or file was deleted
      logError(`Bridge file missing: ${bridgePath}`);
      console.log(JSON.stringify({
        additionalContext: "[JUHBDI] Context monitor cannot read statusline data — bridge file missing. If this persists, check that the statusline hook is active."
      }));
      return;
    }
    const raw = fs.readFileSync(bridgePath, "utf-8");
    bridge = JSON.parse(raw);
    if (typeof bridge !== "object" || bridge === null) {
      throw new Error("Bridge file is not a valid JSON object");
    }
  } catch (err) {
    logError(`Bridge file parse error: ${err.message}`);
    console.log(JSON.stringify({}));
    return;
  }

  const remainingPct = bridge.remaining_pct;
  if (remainingPct === undefined || typeof remainingPct !== "number" || isNaN(remainingPct)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Determine current severity level (4-level system)
  let currentLevel = "NORMAL";
  if (remainingPct <= THRESHOLDS.EMERGENCY) {
    currentLevel = "EMERGENCY";
  } else if (remainingPct <= THRESHOLDS.CRITICAL) {
    currentLevel = "CRITICAL";
  } else if (remainingPct <= THRESHOLDS.URGENT) {
    currentLevel = "URGENT";
  } else if (remainingPct <= THRESHOLDS.WARNING) {
    currentLevel = "WARNING";
  }

  if (currentLevel === "NORMAL") {
    const prevState = readMonitorState(sessionId);
    writeMonitorState(sessionId, {
      last_level: "NORMAL",
      tool_uses_since_warning: 0,
      handoff_written: prevState.handoff_written,
      emergency_fired: prevState.emergency_fired,
    });
    console.log(JSON.stringify({}));
    return;
  }

  // Check debounce — fires every DEBOUNCE_TOOL_USES calls (>= so 4th call fires, not 5th)
  const state = readMonitorState(sessionId);
  const severityOrder = { NORMAL: 0, WARNING: 1, URGENT: 2, CRITICAL: 3, EMERGENCY: 4 };
  const isEscalation = severityOrder[currentLevel] > severityOrder[state.last_level];
  const isFirstWarning = state.last_level === "NORMAL";
  const debounceExpired = state.tool_uses_since_warning >= DEBOUNCE_TOOL_USES;

  if (!isFirstWarning && !isEscalation && !debounceExpired) {
    writeMonitorState(sessionId, {
      ...state,
      tool_uses_since_warning: state.tool_uses_since_warning + 1,
    });
    console.log(JSON.stringify({}));
    return;
  }

  // Auto-save state at CRITICAL or EMERGENCY if not already done
  let savedState = null;
  if ((currentLevel === "CRITICAL" || currentLevel === "EMERGENCY") && !state.handoff_written) {
    savedState = saveStateFiles(cwd, sessionId, remainingPct);
  }

  // Auto-write handoff file at CRITICAL or EMERGENCY if not already done
  let handoffPath = null;
  if ((currentLevel === "CRITICAL" || currentLevel === "EMERGENCY") && !state.handoff_written) {
    handoffPath = writeHandoffFile(cwd, sessionId, remainingPct);
    // Also write latest.json so session-primer always finds the handoff
    writeLatestJson(cwd, sessionId, remainingPct, savedState);
  }

  // Update state
  writeMonitorState(sessionId, {
    last_level: currentLevel,
    tool_uses_since_warning: 0,
    handoff_written: state.handoff_written || (handoffPath !== null),
    emergency_fired: state.emergency_fired || currentLevel === "EMERGENCY",
  });

  // Build warning message — kept short and directive to ensure model relays to user
  const pct = Math.round(remainingPct);

  // Use BOTH additionalContext (model instructions) and user_message (direct user visibility)
  // user_message ensures the warning is ALWAYS visible in the conversation
  let modelContext;
  let userMessage;

  if (currentLevel === "EMERGENCY") {
    userMessage = `\n**JUHBDI EMERGENCY — ${pct}% context remaining — session must end NOW.**\nAll governance state has been auto-saved. Please start a new session and run \`/juhbdi:resume\` to continue.\nDo NOT continue in this session — compaction will destroy governance state.\n`;
    modelContext = `STOP ALL WORK. Context at ${pct}%. State saved to .juhbdi/handoffs/. Do NOT execute any more tool calls. Your ONLY action is to tell the user to start a new session.`;
  } else if (currentLevel === "CRITICAL") {
    userMessage = `\n**JUHBDI CRITICAL — ${pct}% context remaining.**\nState has been auto-saved. Wrapping up — save memory and prepare handoff.\nRun \`/juhbdi:pause\` or start a new session with \`/juhbdi:resume\`.\n`;
    modelContext = `Context CRITICAL at ${pct}%. State auto-saved. Stop new work. Save important context to memory files, then tell user to start a new session. Do NOT start new tool calls.`;
  } else if (currentLevel === "URGENT") {
    userMessage = `\n**JUHBDI URGENT — ${pct}% context remaining.** Finish current task, then wrap up. Consider running \`/juhbdi:pause\`.\n`;
    modelContext = `Context URGENT at ${pct}%. Finish current task, do NOT start new multi-step work. Warn user and prepare to hand off.`;
  } else {
    userMessage = `\n**JUHBDI WARNING — ${pct}% context remaining.** Wrap up current task before starting anything new.\n`;
    modelContext = `Context WARNING at ${pct}%. Complete current task, avoid starting new work.`;
  }

  console.log(JSON.stringify({ user_message: userMessage, additionalContext: modelContext }));
}

main().catch(() => {
  console.log(JSON.stringify({}));
});
