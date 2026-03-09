---
name: stats
description: Show JuhBDI productivity stats — tasks completed, trust tier, memory usage, governance compliance
allowed-tools: ["Bash"]
---

Show the user their JuhBDI stats dashboard.

## Steps

1. Read the .juhbdi/ directory to gather data:
   - decision-trail.jsonl — total decisions, violations, overrides
   - memory-bank.json — experiences banked
   - trust-store.json — current trust score and tier
   - reflexion-bank.json — reflexions stored
   - principle-bank.json — principles learned

2. Run the stats utility:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/stats.ts
   ```

3. The output is already formatted for terminal display. Present it directly to the user.

4. If there's an error (e.g., no .juhbdi/ directory), tell the user to run `/juhbdi:init` first.
