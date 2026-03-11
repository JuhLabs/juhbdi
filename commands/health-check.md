---
name: health-check
description: Report system readiness — checks project dir, state schema, dashboard, and decision trail
allowed-tools: ["Bash"]
---

Report system readiness by running the health-check utility and displaying results with clear pass/fail indicators.

## Steps

1. Run the health-check utility:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/health-check.ts
   ```

2. Parse the JSON output.

3. Format each check with emoji status indicators:
   - Pass: `✅`
   - Fail: `❌`

4. Display as a formatted list:

   ```
   ## System Health Check

   ✅ Project Directory — .juhbdi/ found
   ✅ State Schema — state.json valid
   ❌ Dashboard — Connection refused on port 3141
   ✅ Decision Trail — decision-trail.log found (42 entries)

   **Result: 3/4 checks passed**
   ```

5. If all checks pass, display: "System healthy — ready to go!"

6. If any checks fail, show remediation hints for each failed check:
   - `project_dir`: "Run `/juhbdi:init` to initialize"
   - `state_schema`: "Run `/juhbdi:validate` to inspect and fix"
   - `dashboard`: "Start with `/juhbdi:dashboard`"
   - `decision_trail`: "Run any JuhBDI command to create the trail"

7. If the utility errors (e.g., bun not found), show the raw error to the user.
