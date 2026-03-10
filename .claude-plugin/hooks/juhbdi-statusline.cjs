// .claude-plugin/hooks/juhbdi-statusline.cjs
//
// Notification hook — renders context usage progress bar in Claude Code statusline.
// Writes metrics to /tmp/juhbdi-ctx-{session_id}.json for the context monitor hook.

const fs = require("fs");
const path = require("path");

// Claude Code reserves ~16.5% for autocompact buffer
const AUTOCOMPACT_BUFFER = 16.5;

function getProgressBar(usedPct) {
  // NaN guard
  if (typeof usedPct !== "number" || isNaN(usedPct)) {
    usedPct = 0;
  }
  usedPct = Math.max(0, Math.min(100, usedPct));

  const segments = 10;
  const filled = Math.round((usedPct / 100) * segments);
  const empty = segments - filled;

  let color;
  if (usedPct < 50) color = "green";
  else if (usedPct < 65) color = "yellow";
  else if (usedPct < 80) color = "orange";
  else color = "red";

  const filledChar = "\u2588"; // block
  const emptyChar = "\u2591"; // light shade
  const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);

  return { bar, color, usedPct: Math.round(usedPct) };
}

function writeBridgeFile(bridgePath, bridgeData) {
  const content = JSON.stringify(bridgeData, null, 2) + "\n";
  const tmpPath = bridgePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, bridgePath);
    return true;
  } catch {
    // Fallback to direct write
    try { fs.writeFileSync(bridgePath, content); return true; } catch { return false; }
  }
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

  // NaN guard on remaining percentage
  const safeRemainingPct = (typeof remainingPct === "number" && !isNaN(remainingPct))
    ? remainingPct
    : 100;

  const usedPct = 100 - safeRemainingPct;
  const usablePct = Math.max(0, safeRemainingPct - AUTOCOMPACT_BUFFER);
  const { bar, usedPct: displayPct } = getProgressBar(usedPct);

  // Write bridge file for context monitor hook (with retry)
  const bridgeData = {
    session_id: sessionId,
    remaining_pct: safeRemainingPct,
    usable_pct: usablePct,
    timestamp: new Date().toISOString(),
  };

  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
  writeBridgeFile(bridgePath, bridgeData);

  // Read trust store to get current tier badge
  let tierDisplay = "";
  try {
    const cwd = input.cwd || process.cwd();
    const trustPath = path.join(cwd, ".juhbdi", "trust-store.json");
    if (fs.existsSync(trustPath)) {
      const raw = fs.readFileSync(trustPath, "utf-8");
      const store = JSON.parse(raw);
      // Validate structure before accessing
      if (store && typeof store === "object" && store.records && typeof store.records === "object") {
        const records = Object.values(store.records);
        if (records.length > 0) {
          const r = records[0];
          const tasksAttempted = typeof r.tasks_attempted === "number" ? r.tasks_attempted : 0;
          const tasksPassed = typeof r.tasks_passed === "number" ? r.tasks_passed : 0;
          const passRate = tasksAttempted > 0 ? tasksPassed / tasksAttempted : 0.5;
          const avgStrikes = typeof r.avg_strikes === "number" ? r.avg_strikes : 0;
          const violationCount = typeof r.violation_count === "number" ? r.violation_count : 0;
          const eff = Math.max(0, 1 - avgStrikes / 3);
          const viol = Math.max(0, 1 - violationCount * 0.2);
          const score = Math.min(1, passRate * 0.4 + eff * 0.3 + viol * 0.3);
          // NaN guard on score
          if (!isNaN(score)) {
            // Thresholds must match src/routing/tiered-autonomy.ts DEFAULT_TIERS
            const tier = score >= 0.85 ? "P" : score >= 0.6 ? "S" : score >= 0.35 ? "J" : "I";
            tierDisplay = ` ${tier}`;
          }
        }
      }
    }
  } catch { /* non-fatal */ }

  const statusLine = `JuhBDI ${bar} ${displayPct}%${tierDisplay}`;
  console.log(JSON.stringify({ status_line: statusLine }));
}

main().catch(() => {
  console.log(JSON.stringify({ status_line: "" }));
});
