import fs from "fs";
import path from "path";
import { getProjectState, getTrailEntries, getCostData, getMemoryStats, getContextHealth, getActiveSessions } from "./api";

const PORT = parseInt(process.env.JUHBDI_DASHBOARD_PORT || "3141", 10);
const cwd = process.cwd();
const juhbdiDir = path.join(cwd, ".juhbdi");

const clients = new Set<ReadableStreamDefaultController>();

function resolveProjectDir(url: URL): string {
  const pd = url.searchParams.get("project_dir");
  if (pd) {
    const resolved = path.join(pd, ".juhbdi");
    if (fs.existsSync(resolved)) return resolved;
  }
  return juhbdiDir;
}

function broadcastUpdate() {
  const sessions = getActiveSessions();
  const data = JSON.stringify({
    state: getProjectState(juhbdiDir),
    trail: getTrailEntries(juhbdiDir, 50),
    cost: getCostData(juhbdiDir),
    memory: getMemoryStats(juhbdiDir),
    context: getContextHealth(),
    sessions,
  });
  for (const controller of clients) {
    try { controller.enqueue(`data: ${data}\n\n`); }
    catch { clients.delete(controller); }
  }
}

// Watch .juhbdi/ for project state changes
let watchTimeout: ReturnType<typeof setTimeout> | null = null;
if (fs.existsSync(juhbdiDir)) {
  fs.watch(juhbdiDir, { recursive: true }, () => {
    if (watchTimeout) return;
    watchTimeout = setTimeout(() => {
      watchTimeout = null;
      broadcastUpdate();
    }, 1000);
  });
}

// Poll /tmp/ for bridge file changes (session context updates)
setInterval(() => {
  broadcastUpdate();
}, 5000);

const htmlPath = path.join(import.meta.dir, "index.html");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf-8") : "<h1>Dashboard HTML not found</h1>";

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    switch (url.pathname) {
      case "/":
        return new Response(html, { headers: { "Content-Type": "text/html" } });

      case "/api/state": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getProjectState(dir)), { headers });
      }

      case "/api/trail": {
        const dir = resolveProjectDir(url);
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        return new Response(JSON.stringify(getTrailEntries(dir, limit)), { headers });
      }

      case "/api/cost": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getCostData(dir)), { headers });
      }

      case "/api/memory": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getMemoryStats(dir)), { headers });
      }

      case "/api/context": {
        const sid = url.searchParams.get("session_id") || undefined;
        return new Response(JSON.stringify(getContextHealth(sid)), { headers });
      }

      case "/api/sessions":
        return new Response(JSON.stringify(getActiveSessions()), { headers });

      case "/api/events": {
        const stream = new ReadableStream({
          start(controller) {
            clients.add(controller);
            controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
          },
          cancel(controller) {
            clients.delete(controller);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      case "/assets/dashboardicons.png":
      case "/assets/juhbdilogo.png": {
        const assetName = url.pathname.split("/").pop()!;
        const assetPath = path.join(import.meta.dir, "assets", assetName);
        if (fs.existsSync(assetPath)) {
          return new Response(Bun.file(assetPath), {
            headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
          });
        }
        return new Response("Not found", { status: 404 });
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`JuhBDI Dashboard running at http://localhost:${PORT}`);
