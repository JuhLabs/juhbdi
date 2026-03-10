---
name: stats
description: Show JuhBDI productivity stats — tasks completed, trust tier, memory usage, governance compliance
allowed-tools: ["Bash"]
---

Show the user their JuhBDI stats dashboard.

## Steps

1. Read the .juhbdi/ directory to gather data:
   - decision-trail.log — total decisions, violations, overrides
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

### Tool Reliability Stats

If `.juhbdi/tool-beliefs.json` exists, read it and display tool reliability data:

```
### Tool Reliability
Tool          Task Type     Success Rate    Avg Duration    Common Errors
Edit          file_edit     95% (19/20)     180ms           ENOENT (1x)
Bash          test_run      88% (15/17)     2400ms          timeout (2x)
Grep          search        100% (12/12)    45ms            —
Write         file_edit     70% (7/10)      250ms           EPERM (2x), EEXIST (1x)
```

If a tool has success rate below 70%, highlight it in red and suggest: "Consider using `<alternative>` instead for `<task_type>` tasks" (using `suggestAlternativeTool()` from `src/routing/tool-beliefs.ts`).
