// .claude-plugin/hooks/juhbdi-statusline.cjs
//
// Notification hook — renders context usage progress bar in Claude Code statusline.
// Writes metrics to /tmp/juhbdi-ctx-{session_id}.json for the context monitor hook.

const fs = require("fs");
const path = require("path");

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

  // Read trust store to get current tier badge
  let tierDisplay = "";
  try {
    const cwd = input.cwd || process.cwd();
    const trustPath = path.join(cwd, ".juhbdi", "trust-store.json");
    if (fs.existsSync(trustPath)) {
      const store = JSON.parse(fs.readFileSync(trustPath, "utf-8"));
      const records = Object.values(store.records || {});
      if (records.length > 0) {
        const r = records[0];
        const passRate = r.tasks_attempted > 0 ? r.tasks_passed / r.tasks_attempted : 0.5;
        const eff = Math.max(0, 1 - (r.avg_strikes || 0) / 3);
        const viol = Math.max(0, 1 - (r.violation_count || 0) * 0.2);
        const score = Math.min(1, passRate * 0.4 + eff * 0.3 + viol * 0.3);
        // Thresholds must match src/routing/tiered-autonomy.ts DEFAULT_TIERS
        const tier = score >= 0.85 ? "P" : score >= 0.6 ? "S" : score >= 0.35 ? "J" : "I";
        tierDisplay = ` ${tier}`;
      }
    }
  } catch { /* non-fatal */ }

  const statusLine = `JuhBDI ${bar} ${displayPct}%${tierDisplay}`;
  console.log(JSON.stringify({ status_line: statusLine }));
}

main().catch(() => {
  console.log(JSON.stringify({ status_line: "" }));
});
