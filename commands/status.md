---
name: status
description: Show current JuhBDI project state dashboard
allowed-tools: ["Bash"]
---

Display the JuhBDI project status dashboard showing beliefs, intentions, progress, and recovery stats.

## Steps

1. Run the status utility:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/status.ts
   ```

2. The output is already formatted for terminal display. Present it directly to the user.

3. If there's an error (e.g., no .juhbdi/ directory), tell the user to run `/juhbdi:init` first.

## Model Routing Stats

Read `.juhbdi/decision-trail.log` and filter for `event_type: "routing"` entries. Display:

```
### Routing Summary
- Tasks routed to haiku: N
- Tasks routed to sonnet: N
- Tasks routed to opus: N
- Override count: N (user-specified tiers)
- Escalation count: N (failure-driven tier bumps)
```

### Cost Summary

Sum the cost data from routing trail entries (each entry's reasoning field contains cost estimates). Display:

```
### Cost Intelligence
- Estimated total spend:  $X.XX
- vs always-opus:         $Y.YY
- Savings:                $Z.ZZ (N%)
```

If no routing entries exist, skip this section.

### Router Accuracy

If routing outcome data is available (from `routing_outcome` annotations in trail entries), display:

```
### Router Accuracy
- Accuracy: N% (X/Y correct)
- Overkill: N (tasks that could have used a cheaper tier)
- Escalated: N (tasks that needed a tier bump)
- Confidence: calibrated/conservative/relaxed
```

If fewer than 5 routing outcomes exist, show "Insufficient data for accuracy stats" instead.

## Next Steps

After displaying all status information, suggest relevant next actions based on current state:

- If pending tasks exist: `"Ready to continue? Run /juhbdi:execute to pick up where you left off."`
- If no roadmap exists: `"No active plan. Run /juhbdi:plan <what to build> to create one."`
- If all tasks are complete: `"All tasks complete! Run /juhbdi:reflect to capture learnings, or /juhbdi:plan for new work."`
- If there are failures: `"Some tasks failed. Run /juhbdi:execute to retry, or /juhbdi:trail --failures to investigate."`
- Always include: `"Other options: /juhbdi:pause to save progress, /juhbdi:stats for detailed metrics."`

### Week-over-Week Comparison

If there are trail entries from more than 7 days ago, compute a week-over-week comparison:

1. Split trail entries into "this week" (last 7 days) vs "last week" (8-14 days ago)
2. For each period, compute: tasks completed, pass rate, average cost per task
3. Display:

```
### Week-over-Week
                    This Week    Last Week    Change
Tasks completed:    N            N            +/-N
Pass rate:          N%           N%           +/-N%
Avg cost/task:      $X.XX        $X.XX        +/-$X.XX
Trust score:        X.XX         X.XX         +/-X.XX
```

Use green for improvements, red for regressions. If no data from last week, show "First week — comparison available next week."
