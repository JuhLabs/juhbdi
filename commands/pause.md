---
name: pause
description: Pause the current JuhBDI session and create a handoff file for resumption
allowed-tools: ["Bash", "Read", "Write"]
---

Pause the current JuhBDI session by capturing full state to `.juhbdi/handoff.json`.

## Step 1: Load Current State

1. Read `.juhbdi/roadmap-intent.json` — extract wave/task progress
2. Read `.juhbdi/state.json` — project state
3. Read bridge file if available:
   ```bash
   cat /tmp/juhbdi-ctx-*.json 2>/dev/null | head -1
   ```

## Step 2: Gather Handoff Data

From the roadmap, determine:
- `current_wave`: the wave currently being processed (or last completed + 1)
- `current_task`: the task in progress (or next pending)
- `tasks_completed`: all tasks with status "passed"
- `tasks_remaining`: all tasks with status != "passed"

From the bridge file (if available):
- `context_remaining_pct`: remaining context percentage

Ask the user (via AskUserQuestion):
- "Any key decisions made this session?" (free text)
- "Any blockers or issues?" (free text)
- "What should the next session start with?" (free text)

## Step 3: Write Handoff

Validate and write the handoff:
```bash
~/.bun/bin/bun -e "
const { HandoffSchema } = require('${CLAUDE_PLUGIN_ROOT}/src/schemas/handoff');
const data = HandoffSchema.parse(JSON.parse(process.argv[1]));
require('fs').writeFileSync('.juhbdi/handoff.json', JSON.stringify(data, null, 2) + '\n');
console.log('Handoff written successfully');
" '<handoff_json>'
```

## Step 4: Log Trail Entry

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"session paused — handoff created","reasoning":"Context at <X>%, saving state for resumption","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```

## Step 5: Report

Tell the user:
- Handoff saved to `.juhbdi/handoff.json`
- Wave X, Task Y — where they left off
- To resume: start a new session and run `/juhbdi:resume`
