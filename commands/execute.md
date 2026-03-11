---
name: execute
description: Run the BDI execution loop on the current roadmap
argument-hint: "[--background]"
allowed-tools: ["Bash", "Read", "Agent", "AskUserQuestion"]
---

Execute the roadmap by processing waves through context-isolated task-executor agents with worktree isolation, intent checking, and automatic recovery.

**Shorthand used below:** `BUN=~/.bun/bin/bun`, `CLI=${CLAUDE_PLUGIN_ROOT}/src/cli-utils`

## Step 0: Background Mode

If `--background` passed: dispatch entire execute flow as a background Agent. Write progress via `${CLI}/../parallel/exec-progress.ts write '<json>'` after each wave. STOP foreground.

## Prerequisites

Read `.juhbdi/roadmap-intent.json` and `.juhbdi/intent-spec.json`. If missing, tell user to run `/juhbdi:init` then `/juhbdi:plan`.

## Step 1: Load Context

1. Read roadmap, intent-spec, state.json
2. Log: `trail-append.ts '{"event_type":"command","description":"execution loop started","reasoning":"Processing N waves",...,"outcome":"approved"}'`
3. Refresh repo map: `BUN run ${CLI}/repo-map.ts generate` (non-blocking if fails)
4. Show execution intent summary: goals, constraints, tradeoff bias, task/wave counts

## Step 2: Process Waves

For each wave in order:

### Pre-Wave Context Check

Read bridge file `/tmp/juhbdi-ctx-*.json`:
- `remaining_pct < 30` → **AUTO-PAUSE**: write handoff, log trail, tell user to `/juhbdi:resume`. STOP.
- `remaining_pct < 40` → **WARN**: execute this wave, auto-pause after.
- `>= 40` or missing → proceed.

### Route Task Model

For each task, determine optimal tier via 5 signals:
1. **Override** — task.model_tier if not "auto"
2. **Failure escalation** — retry_count > 0 bumps tier
3. **Memory match** — similar past tasks, use optimal_tier
4. **Structural complexity** — multi-factor: goal weight, verification type, description scope, bans, parallelism, keywords, difficulty
5. **Tradeoff bias** — quality vs speed shifts baseline

Pass route context (goals, wave_task_count, accuracy_history). Route includes cost_estimate.

**CRITICAL**: Log routing with `reasoning: JSON.stringify(route)` — the full ModelRoute object. `/juhbdi:cost` parses this. Include `task_id` and `wave_id` fields.

Set `model: <recommended_tier>` on Agent dispatch.

### Skip Rules
- `status: "passed"` → skip
- `status: "failed"` + `retry_count >= 3` → skip

### Execute: Parallel Waves (`parallel: true`)

**Phase 1** — Pre-checks (sequential): HITL gate → intent check → route model per task.
**Phase 2** — Create worktrees: `worktree-ops.ts create <task_id>` for each.
**Phase 3** — Dispatch ALL task-executors in ONE response (multiple Agent calls). This is what makes parallelism real.
**Phase 4** — Collect results.
**Phase 5** — Sequential merge: merge on pass (`worktree-ops.ts merge`), recovery on fail (`worktree-ops.ts remove`).

### Execute: Sequential Waves (`parallel: false`)

For each task:

**2a. HITL Gate**: `hitl-check.ts '<desc>' '<gates>'` — if approval needed, ask user. Rejected → blocked.

**2b. Intent Check**: `intent-check.ts '<task_json>'` — if fails, mark failed, skip.

**2c. Worktree**: `worktree-ops.ts create <task_id>`

**2c-post. TNR Checkpoint**: `tnr.ts checkpoint` — store for regression check after merge.

**2d-pre. Speculation + Intelligence**:
1. Difficulty: `difficulty.ts estimate '<json>'` → pass to route context
2. Speculation: `speculate.ts query '<desc>'` → inject recommended_approach, warnings, principles into prompt
3. Principles: `principles.ts query '<desc>' 3` (if speculation returned none)
4. Repo map: `repo-map.ts select '<desc>' 1024` for relevant files
5. Tool bank: `tool-bank.ts query '<desc>' 3` for reusable tools
6. Prepare reflexion/trace context via `prepareTaskContext()`

**2d. Dispatch task-executor Agent** with: task description, verification command (MANDATORY — run exactly), goal context, learned principles, recommended approach, past failure warnings, codebase insights, project state, banned approaches, tools, relevant files, worktree path. Agent reports: approach, files_written, test_passed, test_output, goal_alignment.

**2d-post. Governance**: `governance.ts '<check_json>'` per file. `allowed: false` → reject. `requires_approval` → ask user.

**2d-post. Post-Task Wiring** (MANDATORY):
1. `processTaskOutcome()` — reflexion + trace storage
2. `verifyTask()` — typecheck → lint → test → build chain
3. `buildArticle12Fields()` — EU AI Act compliance enrichment
4. `checkDivergence()` — replan if needed
5. `processObservation()` — context-saving output masking

**2e. Handle Results**:

*Tests passed:*
1. Merge worktree. Run `tnr.ts validate '<checkpoint>'` — if regressed, revert + fail.
2. Update task → "passed", log trail, record memory triplet (include model_tier + optimal_tier).
3. Record routing outcome: correct/escalated/overkill.
4. Update trust: `trust.ts update '<tier>' '{"passed":true,"strikes":N}'`
5. Mark applied principles: `principles.ts apply '<id>'`

*Tests failed:*
1. Remove worktree. Update trust (passed: false).
2. Classify: `classify-failure.ts '<output>'`
3. Query memory: `memory.ts retrieve '<desc>' 3`
4. Recovery budget: `recovery.ts '<task>' '<approach>' '<output>' 3` — if "give_up", mark failed, continue.
5. Dispatch **diagnostician** (test output + task spec, NO failed code)
6. Dispatch **strategist** (root cause + bans + memory + tradeoffs)
7. Update banned_approaches + retry_count, re-execute from 2b.

### Post-Wave

1. Persist roadmap: `validate-roadmap.ts '<updated>'`
2. If auto-pause flag set: write handoff, log, STOP.
3. Dispatch **belief-updater** (non-fatal): update state.json with wave results + context health.
4. Re-read state.json for next wave.
5. **Replan** if `horizon_sketch` has remaining goals: generate next wave from updated beliefs, append to roadmap, update horizon_sketch.

## Step 3: Post-Execution

1. Dispatch **librarian** (non-fatal) — compress execution state.
2. Log completion trail entry.
3. Report: tasks passed/failed/skipped, failures highlighted, suggest `/juhbdi:status` or re-run.
