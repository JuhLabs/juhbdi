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

  // Build time-series: sort by timestamp, accumulate
  const sorted = [...routingEntries].sort((a: any, b: any) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });

  let cumulative = 0;
  const spendOverTime: Array<{ timestamp: string; cumulative: number }> = [];

  for (const entry of sorted) {
    const cost = entry.cost_estimate || 0;
    cumulative += cost;
    spendOverTime.push({
      timestamp: entry.timestamp || new Date().toISOString(),
      cumulative,
    });
  }

  for (const entry of routingEntries) {
    const cost = entry.cost_estimate || 0;
    totalSpend += cost;
    opusEquivalent += (entry.opus_equivalent_cost || cost);
    let model = entry.routed_to;
    if (!model && entry.description) {
      const match = entry.description.match(/\bto\s+(opus|sonnet|haiku|claude[^\s]*)/i);
      if (match) model = match[1].toLowerCase();
    }
    model = model || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  }

  return {
    total_spend: totalSpend,
    opus_equivalent: opusEquivalent,
    savings: opusEquivalent - totalSpend,
    savings_pct: opusEquivalent > 0 ? Math.round(((opusEquivalent - totalSpend) / opusEquivalent) * 100) : 0,
    model_distribution: modelCounts,
    spend_over_time: spendOverTime,
  };
}

export function getMemoryStats(juhbdiDir: string) {
  const reflexions = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const principles = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const trust = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));

  const allReflexions = reflexions ? (reflexions.entries || []).map((e: any) => ({
    task: e.task_description,
    lesson: e.lesson,
    outcome: e.outcome,
  })) : [];

  const allTraces = traces ? (traces.traces || []).map((t: any) => ({
    summary: t.summary || t.description || "",
    success: t.success ?? t.outcome === "success",
  })) : [];

  const allPrinciples = principles ? (principles.principles || []).map((p: any) => ({
    text: p.text || p.principle || "",
    source: p.source || "unknown",
    confidence: p.confidence ?? 0,
  })) : [];

  return {
    reflexion_count: allReflexions.length,
    trace_count: allTraces.length,
    principle_count: allPrinciples.length,
    trust_score: trust?.overall_score ?? 0,
    trust_tier: trust?.tier ?? "unknown",
    recent_reflexions: allReflexions.slice(-3),
    all_reflexions: allReflexions,
    all_traces: allTraces,
    all_principles: allPrinciples,
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

// --- Code Health (M16 deep analysis, cached) ---

import { analyzeFiles } from "../repomap/ast-analyzer";
import { buildCallGraph } from "../repomap/call-graph";
import { detectDeadCode } from "../repomap/dead-code";

interface CodeHealthResult {
  complexity: Array<{ file: string; function: string; complexity: number }>;
  deadCode: Array<{ file: string; export: string; confidence: string }>;
  callGraph: { entryPoints: string[]; hotPaths: string[]; edgeCount: number };
  summary: { clean: number; warning: number; hot: number };
  cached_at: string;
}

let codehealthCache: CodeHealthResult | null = null;

export function getCodeHealth(projectRoot: string, refresh = false): CodeHealthResult {
  if (codehealthCache && !refresh) return codehealthCache;

  try {
    const srcDir = path.join(projectRoot, "src");
    const files = findTsFiles(srcDir, projectRoot);
    const fileInputs = files.map(f => ({
      path: f,
      content: fs.readFileSync(path.join(projectRoot, f), "utf-8"),
    }));

    const analyses = analyzeFiles(fileInputs);
    const callGraph = buildCallGraph(analyses);
    const deadCode = detectDeadCode(analyses);

    const complexity = analyses
      .flatMap(a => a.symbols
        .filter(s => s.kind === "function" || s.kind === "method")
        .map(s => ({ file: a.filePath, function: s.name, complexity: s.complexity }))
      )
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 20);

    const deadCodeList = deadCode.candidates
      .filter(c => c.confidence === "high" || c.confidence === "medium")
      .slice(0, 20)
      .map(c => ({ file: c.file, export: c.symbol, confidence: c.confidence }));

    let clean = 0, warning = 0, hot = 0;
    for (const a of analyses) {
      if (a.complexity > 15) hot++;
      else if (a.complexity > 5) warning++;
      else clean++;
    }

    codehealthCache = {
      complexity,
      deadCode: deadCodeList,
      callGraph: {
        entryPoints: callGraph.entry_points.slice(0, 10),
        hotPaths: callGraph.hot_paths.slice(0, 10),
        edgeCount: callGraph.edges.length,
      },
      summary: { clean, warning, hot },
      cached_at: new Date().toISOString(),
    };
    return codehealthCache;
  } catch {
    return {
      complexity: [], deadCode: [],
      callGraph: { entryPoints: [], hotPaths: [], edgeCount: 0 },
      summary: { clean: 0, warning: 0, hot: 0 },
      cached_at: new Date().toISOString(),
    };
  }
}

function findTsFiles(dir: string, projectRoot: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      results.push(...findTsFiles(fullPath, projectRoot));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      results.push(path.relative(projectRoot, fullPath));
    }
  }
  return results;
}
