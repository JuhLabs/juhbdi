---
name: dashboard
description: Launch the JuhBDI live dashboard in the browser
allowed-tools: ["Bash"]
---

Launch the JuhBDI live dashboard server and open it in the browser. The dashboard provides a real-time view of project state, decision trail, cost data, memory stats, and context health via SSE.

## Steps

1. Determine the port from the `JUHBDI_DASHBOARD_PORT` environment variable, defaulting to `3141`.

2. Check if the port is already in use:
   ```
   lsof -i :3141 -sTCP:LISTEN -t 2>/dev/null
   ```

3. **If the port IS already in use:**
   - Tell the user the dashboard is already running.
   - Open the browser:
     ```
     open http://localhost:3141
     ```
   - Display: `Dashboard already running at http://localhost:3141`

4. **If the port is NOT in use:**
   - Verify `.juhbdi/` exists in the current project. If not, tell the user to run `/juhbdi:init` first.
   - Start the dashboard server in the background:
     ```
     ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/dashboard/server.ts &
     ```
   - Wait 1 second for the server to start:
     ```
     sleep 1
     ```
   - Verify the server is now listening:
     ```
     lsof -i :3141 -sTCP:LISTEN -t 2>/dev/null
     ```
   - If verification fails, report the error to the user and show any output from the server start attempt.
   - Open the browser:
     ```
     open http://localhost:3141
     ```

5. Display the following message to the user:

   ```
   JuhBDI Dashboard running at http://localhost:3141

   The dashboard shows:
   - Project state (beliefs, intentions, progress)
   - Decision trail (live-updating)
   - Cost intelligence
   - Memory & reflexion stats
   - Context health monitor

   The server runs in the background and auto-refreshes via SSE.
   To stop it: kill $(lsof -i :3141 -sTCP:LISTEN -t)
   ```

## Notes

- The port can be overridden with the `JUHBDI_DASHBOARD_PORT` environment variable.
- The server watches `.juhbdi/` for file changes and broadcasts updates to all connected browsers.
- The server also polls `/tmp/` bridge files every 5 seconds for session context updates.
