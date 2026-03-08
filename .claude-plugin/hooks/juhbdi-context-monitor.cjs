// .claude-plugin/hooks/juhbdi-context-monitor.cjs
//
// PostToolUse hook — reads bridge file, injects context warnings, and
// auto-generates handoff files when context gets critically low.
// Debounces warnings to avoid noise. Escalates severity without debounce.

const fs = require("fs");
const path = require("path");

const THRESHOLDS = {
  WARNING: 35,   // Start warning
  URGENT: 25,    // Strong warning + prepare handoff
  CRITICAL: 18,  // Auto-save handoff + demand stop
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
    return { last_level: "NORMAL", tool_uses_since_warning: 0, handoff_written: false };
  }
}

function writeMonitorState(sessionId, state) {
  try {
    fs.writeFileSync(getMonitorStatePath(sessionId), JSON.stringify(state));
  } catch {
    // Non-fatal
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

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const sessionId = input.session_id || "unknown";
  const cwd = input.cwd || process.cwd();
  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;

  // Read bridge file from statusline hook
  let bridge;
  try {
    bridge = JSON.parse(fs.readFileSync(bridgePath, "utf-8"));
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  const remainingPct = bridge.remaining_pct;
  if (remainingPct === undefined) {
    console.log(JSON.stringify({}));
    return;
  }

  // Determine current severity level
  let currentLevel = "NORMAL";
  if (remainingPct <= THRESHOLDS.CRITICAL) {
    currentLevel = "CRITICAL";
  } else if (remainingPct <= THRESHOLDS.URGENT) {
    currentLevel = "URGENT";
  } else if (remainingPct <= THRESHOLDS.WARNING) {
    currentLevel = "WARNING";
  }

  if (currentLevel === "NORMAL") {
    writeMonitorState(sessionId, { last_level: "NORMAL", tool_uses_since_warning: 0, handoff_written: false });
    console.log(JSON.stringify({}));
    return;
  }

  // Check debounce
  const state = readMonitorState(sessionId);
  const severityOrder = { NORMAL: 0, WARNING: 1, URGENT: 2, CRITICAL: 3 };
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

  // Auto-write handoff file at CRITICAL if not already done
  let handoffPath = null;
  if (currentLevel === "CRITICAL" && !state.handoff_written) {
    handoffPath = writeHandoffFile(cwd, sessionId, remainingPct);
  }

  // Update state
  writeMonitorState(sessionId, {
    last_level: currentLevel,
    tool_uses_since_warning: 0,
    handoff_written: state.handoff_written || (handoffPath !== null),
  });

  // Build warning message
  let message;
  const pct = Math.round(remainingPct);

  if (currentLevel === "CRITICAL") {
    message = [
      `\n!!! JUHBDI CONTEXT CRITICAL — ${pct}% REMAINING !!!`,
      ``,
      `You MUST stop new work NOW. Do these things immediately:`,
      `1. Save important context to memory files (Write tool → ~/.claude/projects/*/memory/)`,
      `2. Fill in the handoff file${handoffPath ? ` at ${handoffPath}` : ` (run /juhbdi:pause)`}`,
      `3. Tell the user: "Context is at ${pct}%. I've saved a handoff file. Start a new session with this prompt:"`,
      `4. Give the user a copy-paste prompt for the next session that summarizes current work`,
      ``,
      `DO NOT start any new tool calls, file reads, or code changes.`,
      `DO NOT say "I'll continue" — you are OUT of context.`,
    ].join("\n");
  } else if (currentLevel === "URGENT") {
    message = [
      `[JUHBDI CONTEXT URGENT] ${pct}% remaining — approaching critical.`,
      `Finish your current task, then:`,
      `• Update memory files with anything important from this session`,
      `• Warn the user that context is getting tight`,
      `• Prepare to write a handoff prompt if you can't finish`,
      `Do NOT start new multi-step tasks.`,
    ].join("\n");
  } else {
    message = [
      `[JUHBDI CONTEXT WARNING] ${pct}% remaining.`,
      `Be mindful of context usage. Wrap up current work before starting anything new.`,
      `If you have more work ahead, mention to the user that context is getting tight.`,
    ].join("\n");
  }

  console.log(JSON.stringify({ additionalContext: message }));
}

main().catch(() => {
  console.log(JSON.stringify({}));
});
