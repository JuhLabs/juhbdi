import fs from "fs";
import path from "path";

function safeReadJSON(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch { return null; }
}

export function getProjectState(juhbdiDir: string) {
  return {
    state: safeReadJSON(path.join(juhbdiDir, "state.json")),
    roadmap: safeReadJSON(path.join(juhbdiDir, "roadmap-intent.json")),
    intentSpec: safeReadJSON(path.join(juhbdiDir, "intent-spec.json")),
    preferences: safeReadJSON(path.join(juhbdiDir, "user-preferences.json")),
    timestamp: new Date().toISOString(),
  };
}

export function getTrailEntries(juhbdiDir: string, limit = 100) {
  const trailPath = path.join(juhbdiDir, "decision-trail.log");
  if (!fs.existsSync(trailPath)) return [];
  const lines = fs.readFileSync(trailPath, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function getCostData(juhbdiDir: string) {
  const trail = getTrailEntries(juhbdiDir);
  const routingEntries = trail.filter((e: any) => e.event_type === "routing");
  let totalSpend = 0;
  let opusEquivalent = 0;
  const modelCounts: Record<string, number> = {};

  for (const entry of routingEntries) {
    const cost = entry.cost_estimate || 0;
    totalSpend += cost;
    opusEquivalent += (entry.opus_equivalent_cost || cost);
    const model = entry.routed_to || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  }

  return {
    total_spend: totalSpend,
    opus_equivalent: opusEquivalent,
    savings: opusEquivalent - totalSpend,
    savings_pct: opusEquivalent > 0 ? Math.round(((opusEquivalent - totalSpend) / opusEquivalent) * 100) : 0,
    model_distribution: modelCounts,
  };
}

export function getMemoryStats(juhbdiDir: string) {
  const reflexions = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const principles = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const trust = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));

  return {
    reflexion_count: reflexions ? (reflexions.entries || []).length : 0,
    trace_count: traces ? (traces.traces || []).length : 0,
    principle_count: principles ? (principles.principles || []).length : 0,
    trust_score: trust?.overall_score ?? 0,
    trust_tier: trust?.tier ?? "unknown",
    recent_reflexions: reflexions ? (reflexions.entries || []).slice(-3).map((e: any) => ({
      task: e.task_description,
      lesson: e.lesson,
      outcome: e.outcome,
    })) : [],
  };
}

export function getContextHealth(sessionId?: string) {
  if (!sessionId) return { remaining_pct: 100, level: "NORMAL" };
  try {
    const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
    if (!fs.existsSync(bridgePath)) return { remaining_pct: 100, level: "NORMAL" };
    const bridge = JSON.parse(fs.readFileSync(bridgePath, "utf-8"));
    const pct = bridge.remaining_pct || 100;
    let level = "NORMAL";
    if (pct <= 22) level = "EMERGENCY";
    else if (pct <= 28) level = "CRITICAL";
    else if (pct <= 35) level = "URGENT";
    else if (pct <= 45) level = "WARNING";
    return { remaining_pct: Math.round(pct), level };
  } catch { return { remaining_pct: 100, level: "NORMAL" }; }
}

function contextLevel(pct: number): string {
  if (pct <= 22) return "EMERGENCY";
  if (pct <= 28) return "CRITICAL";
  if (pct <= 35) return "URGENT";
  if (pct <= 45) return "WARNING";
  return "NORMAL";
}

export interface SessionInfo {
  session_id: string;
  project_dir: string;
  ide_platform: string;
  remaining_pct: number;
  usable_pct: number;
  level: string;
  timestamp: string;
  stale: boolean;
}

export interface ProjectGroup {
  project_dir: string;
  sessions: SessionInfo[];
}

const SESSION_STALE_MS = 120_000; // 2 minutes without update = stale
const SESSION_EXPIRE_MS = 24 * 60 * 60_000; // drop sessions >24h old

export function getActiveSessions(): ProjectGroup[] {
  const bridgeFiles: string[] = [];
  try {
    const tmpEntries = fs.readdirSync("/tmp");
    for (const entry of tmpEntries) {
      if (entry.startsWith("juhbdi-ctx-") && entry.endsWith(".json") && !entry.endsWith(".tmp")) {
        bridgeFiles.push(path.join("/tmp", entry));
      }
    }
  } catch { return []; }

  const sessions: SessionInfo[] = [];
  const now = Date.now();

  for (const filePath of bridgeFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const bridge = JSON.parse(raw);
      if (!bridge.session_id) continue;

      const ts = bridge.timestamp ? new Date(bridge.timestamp).getTime() : 0;
      if ((now - ts) > SESSION_EXPIRE_MS) continue; // drop sessions >24h old
      const stale = (now - ts) > SESSION_STALE_MS;
      const pct = typeof bridge.remaining_pct === "number" ? bridge.remaining_pct : 100;

      sessions.push({
        session_id: bridge.session_id,
        project_dir: bridge.project_dir || "unknown",
        ide_platform: bridge.ide_platform || "unknown",
        remaining_pct: Math.round(pct),
        usable_pct: Math.round(bridge.usable_pct ?? pct),
        level: contextLevel(pct),
        timestamp: bridge.timestamp || new Date().toISOString(),
        stale,
      });
    } catch { /* skip malformed bridge files */ }
  }

  // Group by project_dir
  const grouped = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = s.project_dir;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  // Sort: active before stale, then by remaining_pct ascending (most urgent first)
  const result: ProjectGroup[] = [];
  for (const [project_dir, projSessions] of grouped) {
    projSessions.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? 1 : -1;
      return a.remaining_pct - b.remaining_pct;
    });
    result.push({ project_dir, sessions: projSessions });
  }

  // Sort projects: those with active sessions first
  result.sort((a, b) => {
    const aActive = a.sessions.some(s => !s.stale);
    const bActive = b.sessions.some(s => !s.stale);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.project_dir.localeCompare(b.project_dir);
  });

  return result;
}
