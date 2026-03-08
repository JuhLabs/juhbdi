// .claude-plugin/hooks/juhbdi-statusline.cjs
//
// Notification hook — renders context usage progress bar in Claude Code statusline.
// Writes metrics to /tmp/juhbdi-ctx-{session_id}.json for the context monitor hook.

const fs = require("fs");

// Claude Code reserves ~16.5% for autocompact buffer
const AUTOCOMPACT_BUFFER = 16.5;

function getProgressBar(usedPct) {
  const segments = 10;
  const filled = Math.round((usedPct / 100) * segments);
  const empty = segments - filled;

  let color;
  if (usedPct < 50) color = "green";
  else if (usedPct < 65) color = "yellow";
  else if (usedPct < 80) color = "orange";
  else color = "red";

  const filledChar = "\u2588"; // █
  const emptyChar = "\u2591"; // ░
  const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);

  return { bar, color, usedPct: Math.round(usedPct) };
}

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const sessionId = input.session_id || "unknown";
  const contextWindow = input.context_window || {};
  const remainingPct = contextWindow.remaining_percentage;

  if (remainingPct === undefined || remainingPct === null) {
    // No context data available — output empty status
    console.log(JSON.stringify({ status_line: "" }));
    return;
  }

  const usedPct = 100 - remainingPct;
  const usablePct = Math.max(0, remainingPct - AUTOCOMPACT_BUFFER);
  const { bar, usedPct: displayPct } = getProgressBar(usedPct);

  // Write bridge file for context monitor hook
  const bridgeData = {
    session_id: sessionId,
    remaining_pct: remainingPct,
    usable_pct: usablePct,
    timestamp: new Date().toISOString(),
  };

  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
  try {
    fs.writeFileSync(bridgePath, JSON.stringify(bridgeData, null, 2) + "\n");
  } catch {
    // Non-fatal — statusline still works even if bridge file fails
  }

  const statusLine = `JuhBDI ${bar} ${displayPct}%`;
  console.log(JSON.stringify({ status_line: statusLine }));
}

main().catch(() => {
  console.log(JSON.stringify({ status_line: "" }));
});
