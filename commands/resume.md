---
name: resume
description: Resume a paused JuhBDI session from handoff file
allowed-tools: ["Bash", "Read"]
---

Resume a previously paused JuhBDI session by reading `.juhbdi/handoff.json`.

## Step 1: Read Handoff

Read `.juhbdi/handoff.json`. If it doesn't exist, tell the user:
"No handoff file found. Nothing to resume. Use `/juhbdi:status` to check project state."

Validate the handoff:
```bash
~/.bun/bin/bun -e "
const { HandoffSchema } = require('${CLAUDE_PLUGIN_ROOT}/src/schemas/handoff');
const raw = require('fs').readFileSync('.juhbdi/handoff.json', 'utf-8');
const data = HandoffSchema.parse(JSON.parse(raw));
console.log(JSON.stringify(data));
"
```

## Step 2: Load Project Context

Read in parallel:
1. `.juhbdi/intent-spec.json` — goals and constraints
2. `.juhbdi/roadmap-intent.json` — execution plan
3. `.juhbdi/state.json` — beliefs and conventions

## Step 3: Present Restoration

Report to the user:
```
## Session Restored

**Paused at:** <paused_at>
**Context was:** <context_remaining_pct>%

### Progress
- **Wave:** <current_wave>
- **Current task:** <current_task>
- **Completed:** <tasks_completed count> tasks
- **Remaining:** <tasks_remaining count> tasks

### Decisions Made
<list decisions_made>

### Blockers
<list blockers, or "None">

### Next Action
<next_action>
```

## Step 4: Log Trail & Cleanup

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"session resumed from handoff","reasoning":"Restoring state from paused session","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```

Delete the handoff file after successful restoration:
```bash
rm .juhbdi/handoff.json
```

## Step 5: Continue

Ask: "Ready to continue execution? Run `/juhbdi:execute` to pick up where you left off."
