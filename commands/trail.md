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
