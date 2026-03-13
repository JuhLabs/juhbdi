---
name: trail
description: View and filter the decision trail
allowed-tools: ["Bash"]
---

Display the JuhBDI decision trail with optional filtering by event type, task, wave, or recency.

## Usage

```
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-view.ts [options]
```

### Options

- `--type <event_type>` — Filter by event type (decision, routing, command, recovery, override, conflict)
- `--last <N>` — Show only the N most recent entries
- `--task <task_id>` — Filter by task ID
- `--wave <wave_id>` — Filter by wave ID

Options can be combined. All filters use AND logic.

## Steps

1. Run the trail view utility with desired filters:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-view.ts --last 10
   ```

2. The output is already formatted for terminal display. Present it directly to the user.

3. If there's an error (e.g., no .juhbdi/ directory), tell the user to run `/juhbdi:init` first.

### Summary Statistics Line

After displaying the trail entries, show a summary statistics line at the bottom by counting entries by event_type:

```
Trail Summary: N decisions, X conflicts, Y overrides, Z recoveries
```

This gives users an at-a-glance count without needing to manually tally entries.

## Next Steps

After displaying trail entries, suggest relevant follow-up actions:

- "Filter by type: `/juhbdi:trail --type decision`"
- "Show recent only: `/juhbdi:trail --last 10`"
- "Full audit with compliance: `/juhbdi:audit --compliance`"
- "Visual timeline: open dashboard at `http://localhost:3141`"
