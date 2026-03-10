---
name: dashboard
description: Launch the JuhBDI real-time governance dashboard
allowed-tools: ["Bash"]
---

Launch the real-time governance dashboard in your browser.

## Steps

1. Start the dashboard server in the background:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/dashboard/server.ts &
   ```

2. Open the dashboard:
   ```bash
   open http://localhost:3141 2>/dev/null || xdg-open http://localhost:3141 2>/dev/null || echo "Open http://localhost:3141 in your browser"
   ```

3. Tell the user: "Dashboard running at http://localhost:3141. It updates in real-time as you work. Close the browser tab to disconnect."

## Next Steps

- Run `/juhbdi:execute` to start work — the dashboard will show live progress
- Run `/juhbdi:status` for a CLI summary alongside the visual dashboard
