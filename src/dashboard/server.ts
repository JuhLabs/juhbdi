import fs from "fs";
import path from "path";
import { getProjectState, getTrailEntries, getCostData, getMemoryStats, getContextHealth } from "./api";

const PORT = parseInt(process.env.JUHBDI_DASHBOARD_PORT || "3141", 10);
const cwd = process.cwd();
const juhbdiDir = path.join(cwd, ".juhbdi");

const clients = new Set<ReadableStreamDefaultController>();

function broadcastUpdate() {
  const data = JSON.stringify({
    state: getProjectState(juhbdiDir),
    trail: getTrailEntries(juhbdiDir, 50),
    cost: getCostData(juhbdiDir),
    memory: getMemoryStats(juhbdiDir),
    context: getContextHealth(),
  });
  for (const controller of clients) {
    try { controller.enqueue(`data: ${data}\n\n`); }
    catch { clients.delete(controller); }
  }
}

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

      case "/api/state":
        return new Response(JSON.stringify(getProjectState(juhbdiDir)), { headers });

      case "/api/trail":
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        return new Response(JSON.stringify(getTrailEntries(juhbdiDir, limit)), { headers });

      case "/api/cost":
        return new Response(JSON.stringify(getCostData(juhbdiDir)), { headers });

      case "/api/memory":
        return new Response(JSON.stringify(getMemoryStats(juhbdiDir)), { headers });

      case "/api/context":
        const sid = url.searchParams.get("session_id") || undefined;
        return new Response(JSON.stringify(getContextHealth(sid)), { headers });

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

      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`JuhBDI Dashboard running at http://localhost:${PORT}`);
