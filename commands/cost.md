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

### Per-Task Cost Breakdown

After the overall cost report, read the decision trail and roadmap to compute per-task cost breakdown:

1. For each task that has routing trail entries, compute: tier used, estimated input/output tokens, estimated cost
2. Display a table sorted by cost (highest first):

```
### Per-Task Cost Breakdown
Task ID   Description                    Tier      Est. Cost
t5        Add database migrations        opus      $0.42  <-- MOST EXPENSIVE
t3        Write API endpoint tests       sonnet    $0.18
t1        Create user model              haiku     $0.03
t2        Add input validation           haiku     $0.02
```

3. Highlight the most expensive task with a callout: "Most expensive task: `<task_id>` ($X.XX) — consider if this could have been routed to a cheaper tier."
