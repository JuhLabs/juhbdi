---
name: cost
description: Show routing cost intelligence report
allowed-tools: ["Bash"]
---

Display the JuhBDI cost intelligence report showing tier distribution, wave costs, and savings vs always-opus.

## Steps

1. Run the cost report utility:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/cost-report.ts
   ```

2. The output is already formatted for terminal display. Present it directly to the user.

3. If there's an error (e.g., no .juhbdi/ directory), tell the user to run `/juhbdi:init` first.
