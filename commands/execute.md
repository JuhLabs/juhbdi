---
name: execute
description: Run the BDI execution loop on the current roadmap
argument-hint: "[--background]"
allowed-tools: ["Bash", "Read", "Agent", "AskUserQuestion"]
---

Execute the JuhBDI roadmap by processing each wave of tasks through context-isolated agents with worktree isolation, intent checking, and automatic recovery.

## Step 0: Check Arguments

If `--background` was passed as an argument:
1. Tell the user: "Launching execution in background. You'll be notified after each wave."
2. Dispatch the ENTIRE remaining execute flow as a single background Agent with `run_in_background: true`.
3. The background agent should follow all steps below (Step 1 onward).
4. After each wave, write progress:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/parallel/exec-progress.ts write '<progress_json>'
   ```
   Where progress_json follows: `{"started_at":"<ISO>","current_wave":<N>,"total_waves":<M>,"tasks_passed":<P>,"tasks_failed":<F>,"tasks_skipped":<S>,"last_wave_result":"<passed|failed|skipped>","status":"running"}`
5. On completion, write final progress with `"status":"completed"` (or `"failed"` if any failures).
6. STOP — do not continue to Step 1 in the foreground session.

If no `--background` argument: proceed to Step 1 normally.

## Prerequisites

Read `.juhbdi/roadmap-intent.json` and `.juhbdi/intent-spec.json`. If either is missing, tell the user to run the appropriate command first (`/juhbdi:init` then `/juhbdi:plan`).

## Step 1: Load Context

1. Read `.juhbdi/roadmap-intent.json` — the execution plan with waves and tasks
2. Read `.juhbdi/intent-spec.json` — project goals, constraints, tradeoffs
3. Read `.juhbdi/state.json` — project state (conventions, architecture, history)

Log execution start:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"execution loop started","reasoning":"Processing N waves","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```

### Step 1.5: Refresh Repo Map

Generate or refresh the repo map for codebase intelligence:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/repo-map.ts generate
```

This produces `.juhbdi/repo-map.json` used for smart file selection in task prompts. If this fails (e.g., no TypeScript files found), continue without repo map — it is not blocking.

### Intent Verification Preamble

Before processing waves, summarize the execution intent to the user:

1. Extract all unique goals from intent-spec.json
2. Count total tasks, waves, parallel vs sequential
3. Present: **"Executing N tasks across M waves to achieve:"**
   - Goal 1: [description]
   - Goal 2: [description]
   - Constraints: [list active constraints]
   - Tradeoff bias: [quality vs speed vs security weights]

This grounds every action in user intent. Do not skip this step.

## Step 2: Process Waves

For each wave in the roadmap (in order):

### Pre-Wave Context Check

Before dispatching any wave, check context health:

1. Find the bridge file:
   ```bash
   ls /tmp/juhbdi-ctx-*.json 2>/dev/null | head -1
   ```

2. If bridge file exists, read `remaining_pct`:
   - If `remaining_pct < 30`: **AUTO-PAUSE** — run `/juhbdi:pause` logic inline (write handoff.json, log trail entry, inform user: "Context too low to start wave N. Session paused. Run `/juhbdi:resume` in a new session.")  STOP execution.
   - If `remaining_pct < 40`: **WARN** — tell user "Context is tight (X% remaining). Will execute this wave but auto-pause after." Set a flag to pause after wave.
   - If `remaining_pct >= 40` or bridge file missing: proceed normally.

### Route Task Model

Before dispatching each task, determine the optimal model tier:

1. Load the memory bank:
   ```bash
   cat .juhbdi/memory-bank.json 2>/dev/null
   ```

2. For each task, compute the route by evaluating 5 signals with structural analysis:
   - **Override**: If `task.model_tier` is set (not "auto"), use it directly
   - **Failure escalation**: If `task.retry_count > 0`, bump tier (1 retry → +1 tier, 2+ → opus)
   - **Memory match**: Query memory bank for similar past tasks — use `optimal_tier` (learned cheapest tier that works) if available, else `model_tier`
   - **Structural complexity**: Multi-factor score from goal weight, verification type, description scope, banned approaches count, wave parallelism, keywords (tiebreaker)
   - **Tradeoff bias**: intent-spec quality vs speed weights shift the baseline

   Pass route context: goals from intent-spec, wave task count, and accuracy history from past routing outcomes.

   The route includes a `cost_estimate` with estimated token usage and per-tier USD costs.

3. Log the routing decision to the trail.

   **CRITICAL CONTRACT**: The `reasoning` field MUST be `JSON.stringify(route)` — the full ModelRoute object from `routeTask()`. The `/juhbdi:cost` command parses this JSON to extract `recommended_tier`, `signals`, and `cost_estimate`. Free-text reasoning will cause cost reporting to show empty results.

   Also include `task_id` and `wave_id` fields so cost data aggregates correctly per wave.

   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"routing","task_id":"<task_id>","wave_id":"<wave_id>","description":"Routed task <task_id> to <tier>","reasoning":"<JSON.stringify(route)>","alternatives_considered":["<other tiers considered>"],"constraint_refs":[],"outcome":"approved"}'
   ```

   Where `<JSON.stringify(route)>` is the stringified result of `routeTask()` containing:
   ```json
   {
     "task_id": "...",
     "recommended_tier": "haiku|sonnet|opus",
     "confidence": 0.0-1.0,
     "signals": { "override": null, "tradeoff_bias": "...", "heuristic_score": 0.0, "memory_match": null, "failure_escalation": false },
     "cost_estimate": { "estimated_input_tokens": N, "estimated_output_tokens": N, "tier_costs_usd": { "haiku": N, "sonnet": N, "opus": N }, "chosen_cost_usd": N, "savings_vs_opus_usd": N }
   }
   ```

4. When dispatching the task-executor Agent, set `model: <recommended_tier>` on the Agent tool call.

### Skip Completed Tasks
- If a task has `status: "passed"` → skip it (already done)
- If a task has `status: "failed"` and `retry_count >= 3` → skip it (max retries reached)

### Execute Tasks

#### Parallel Waves (`parallel: true`)

For parallel waves, batch ALL operations for maximum concurrency:

**Phase 1 — Pre-checks (sequential):**
For each executable task in the wave:
1. Run HITL gate check (step 2a below)
2. Run intent check (step 2b below)
3. Route task model (determine tier, log routing to trail)
If any task is blocked/rejected, remove it from the batch.

**Phase 2 — Batch worktree creation (sequential):**
For each approved task:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/worktree-ops.ts create <task_id>
```
Collect all worktree paths into a map: `{ task_id: worktree_path }`.

**Phase 3 — Batch agent dispatch (SINGLE RESPONSE):**
In ONE response, dispatch ALL task-executor agents simultaneously using multiple Agent tool calls. Each agent gets its own worktree path, task description, verification command, goal context, and `model: <recommended_tier>`.

**CRITICAL: You MUST send all Agent tool calls in a single message.** This is what makes parallel execution actually parallel. Do NOT dispatch them one at a time.

Example for a wave with tasks t1, t2, t3:
- Agent call 1: task-executor for t1 in worktree_t1
- Agent call 2: task-executor for t2 in worktree_t2
- Agent call 3: task-executor for t3 in worktree_t3
All three in the SAME response.

**Phase 4 — Collect results:**
All agents return independently. Gather all results.

**Phase 5 — Sequential merge and recording:**
For each task (in wave order):

If tests passed:
1. Merge worktree: `worktree-ops.ts merge <task_id>`
   - If merge FAILS (conflict): mark task as "failed", remove worktree, log trail entry with `description: "merge conflict on task <task_id>"`. Do NOT retry — continue merging remaining tasks.
2. Follow step 2e "If tests passed" for status update, trail entry, memory recording, routing outcome.

If tests failed:
1. Remove worktree: `worktree-ops.ts remove <task_id>`
2. Follow step 2e "If tests failed" for recovery flow (classify, diagnostician, strategist)
3. Recovery retries execute as SEQUENTIAL (not parallel) — re-enter from step 2b

#### Sequential Waves (`parallel: false`)

Process tasks one at a time, following steps 2a through 2e below.

For each executable task:

#### 2a. HITL Gate Check
Check if this task triggers any human-in-the-loop gates:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/hitl-check.ts '<task_description>' '<hitl_gates_json>'
```
Where `<hitl_gates_json>` is `JSON.stringify(intentSpec.hitl_gates)` from the loaded intent-spec.

If `requires_approval: true`:
1. Ask the user: "Task '<task_id>' matches HITL gate: <matching_gates>. Approve execution?"
   - Option 1: "Approve -- execute this task"
   - Option 2: "Reject -- skip this task"
2. If rejected: mark task as "blocked", log trail entry with event_type "decision" and outcome "rejected", skip to next task
3. If approved: log trail entry with event_type "override" and outcome "approved", continue to 2b

#### 2b. Intent Check
Run the pre-task structural validation:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/intent-check.ts '<task_json>'
```
If check fails (passed: false), log the violation and mark task as failed. Skip to next task.

#### 2c. Create Worktree
Create an isolated git worktree for the task:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/worktree-ops.ts create <task_id>
```
Note the returned worktree path.

#### 2c-post. TNR Checkpoint
Before dispatching the task executor, capture a test snapshot for regression detection:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/tnr.ts checkpoint
```
Store the checkpoint JSON — it will be used after merging to validate no regressions.

#### 2d-pre. Speculation Check

Before dispatching the task-executor, query the memory and principle banks for relevant intelligence:

1. **Difficulty estimation**: Compute task difficulty to enrich the routing context:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/difficulty.ts estimate '{"description":"<task_description>","affected_file_count":<N>,"verification_type":"<type>","historical_failure_rate":<rate>,"technical_term_count":<N>}'
   ```
   Pass the `difficulty` value from the result as `context.difficulty` when routing (step "Route Task Model").

2. **Speculation query**: Check if similar past tasks exist and if any learned principles apply:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/speculate.ts query '<task_description>'
   ```
   If `has_speculation: true` in the result:
   - If `recommended_approach` is non-null → include as "Recommended Approach" section in the task-executor prompt
   - If `warnings` is non-empty → include as "Past Failure Warnings" section
   - If `principles` is non-empty → include as "Learned Principles" section
   - Log speculation result to trail:
     ```bash
     ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"decision","description":"Speculation for task <task_id>: source=<source>, confidence=<confidence>","reasoning":"<recommended_approach or 'no approach'>","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
     ```

3. **Principle query** (if speculation returned no principles): Query principles directly:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts query '<task_description>' 3
   ```
   Include any matches as "Learned Principles" in the task-executor prompt.

4. **Code knowledge query**: Extract structural facts from the repo map for this task's domain.

#### 2d. Dispatch Task Executor Agent
Use the Agent tool to dispatch a `task-executor` agent with this prompt:

```
You are executing task <task_id> for the JuhBDI project.

## Task
<task description from roadmap>

## Verification Command (MANDATORY — run exactly this)
<task.verification.command>

Do NOT substitute, modify, or replace this command. Run this exact command for verification.
If it fails, fix your implementation and re-run this SAME command.

## Verification Type
<task.verification.type>

## Intent Spec
<summarize relevant goals and constraints>

## Goal Context
This task serves goal: <goal_id> — "<goal description from intent-spec>"
The user's intent: <project description from intent-spec>
Interpret ambiguity in favor of this goal.

## Learned Principles
<If principles match this task's keywords, list them here. These are rules learned from past execution.>
Follow these principles unless you have a strong, documented reason not to.

## Recommended Approach
<If speculation found a successful past approach for a similar task, include it here.>
Consider this approach first. Deviate only if the current task has meaningfully different constraints.

## Past Failure Warnings
<If speculation found past failures for similar tasks, list them here with banned approaches.>
Avoid these approaches — they have failed before on similar work.

## Codebase Insights
<If code knowledge facts are available, list top 5 structural facts about relevant files.>
Use these to understand file importance and avoid breaking hot paths.

## Project State
<conventions, architecture from state.json>

## Banned Approaches (DO NOT USE)
<list any banned_approaches from the task>

## Available Tools (from tool bank)
<output of: ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/tool-bank.ts query '<task_description>' 3>

If tools are listed above, consider reusing them. They are scripts from past tasks.

## Relevant Files (from repo map)
<output of: ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/repo-map.ts select '<task_description>' 1024>

These are the most relevant files to your task based on codebase structural analysis. Start by reading these.

## Working Directory
<worktree_path>

Implement this task in the worktree directory. Write the necessary code files, then run the verification command above to confirm it passes.

Report back:
- approach: what approach you used
- files_written: list of files created/modified
- test_passed: true/false
- test_output: the test command output
- verification_command_used: the exact command you ran (must match the one above)
- goal_alignment: how this implementation serves the stated goal
```

#### 2d-post. Governance Check
Before accepting the task-executor's file writes, validate each through governance:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/governance.ts '<governance_check_json>'
```
For each file the agent wrote:
- If `allowed: false`: reject the file write, log violation to trail, treat as task failure
- If `requires_approval: true`: use AskUserQuestion to confirm before proceeding
- If `allowed: true` and not requiring approval: proceed normally

#### 2d-PRE-WIRING: Pre-Task Context Injection (MANDATORY)

Before dispatching each task-executor:

1. **Prepare task context**: Call `prepareTaskContext(projectDir, taskDescription, domainTags)` to retrieve relevant reflexions and experiential traces. Inject the returned `reflexionContext` and `traceContext` into the task-executor dispatch prompt.

#### 2d-INTEGRATION: Post-Task Wiring (MANDATORY)

After each task-executor completes (and after governance check passes):

1. **Process outcome**: Call `processTaskOutcome(projectDir, taskId, taskDescription, domainTags, approach, filesModified, testPassed, errorSummary, waveId, traceData)` with the task-executor's results.
   - Generates reflexion entry (success or failure) and appends to `.juhbdi/reflexion-bank.json`
   - Stores experiential trace (success only) to `.juhbdi/execution-traces.json`
   - Auto-links related reflexions by keyword overlap

3. **Run verifier chain**: Call `verifyTask(projectDir)`
   - Runs typecheck -> lint -> test -> build
   - Returns structured verification result
   - If required step fails, mark task as FAILED

4. **Enrich trail entry**: Call `buildArticle12Fields()` with task context + tier info
   - Populates EU AI Act compliance fields on the trail entry
   - Add `verificationResult` from step 3 to the trail entry
   - Every trail entry now carries full audit data

5. **Check divergence**: Call `checkDivergence()` with expected vs actual step results
   - If replan needed, pause wave and dispatch strategist with replan context
   - Inject reflexion memory into strategist context

6. **Mask observations**: All tool outputs processed through `processObservation()`
   - Preserves errors and warnings
   - Truncates verbose info output
   - Saves ~15-25% context per task

#### 2d-INTEGRATION-WAVE: Between-Wave Dashboard

After each wave completes, before starting next wave:

1. **Render BDI dashboard**: Call `buildBDIState()` then `renderDashboard()` to show current beliefs, desires, and intentions
2. **Show verification summary**: Passed/failed tasks with verifier chain results
3. **Show reflexion count**: "N new reflexions stored this wave"
4. **Show context remaining**: Current % with color-coded warning level

#### 2e. Handle Results

**If tests passed:**
1. Merge the worktree:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/worktree-ops.ts merge <task_id>
   ```
   After merging, validate no regressions against the pre-task checkpoint:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/tnr.ts validate '<checkpoint_json>'
   ```
   If `regressed: true` in the result: auto-revert with `tnr.ts revert <checkpoint_hash>`, mark task as failed, log trail entry with `description: "TNR regression detected"`, enter recovery flow.
2. Update task status to "passed" in the roadmap
3. Log success trail entry
4. Record to memory bank:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/memory.ts record '<triplet_json>'
   ```
   Where triplet includes: task description, goal_refs, domain tags (extract from description), approach used, files written, "pass", strikes used, banned approaches, and computed utility.

   Include `model_tier: "<tier used>"` in the experience object of the triplet, so future routing can learn from this result.

   Also compute `optimal_tier` for the experience:
   - If task passed with 0 strikes (first try): `optimal_tier` = one tier below the used tier (opus→sonnet, sonnet→haiku, haiku stays haiku)
   - If task passed after 1+ strikes: `optimal_tier` = same as used tier (it was needed)
   - If task failed: do not record `optimal_tier`

   Include `optimal_tier: "<inferred tier>"` in the experience object when applicable.

5. Record routing outcome:
   - If task passed at the routed tier with 0 strikes: `actual_outcome: "correct"` (unless optimal_tier < recommended_tier, then `"overkill"`)
   - If task failed and required retry at higher tier: `actual_outcome: "escalated"`
   - Log to trail: `event_type: "routing"`, description should include `routing_outcome: <actual_outcome>`, reasoning should be a human-readable summary (NOT JSON — only the initial routing entry from step 2 uses JSON reasoning for cost tracking)

6. Update trust score for the model tier used:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trust.ts update '<tier>' '{"passed":true,"strikes":<strikes_used>,"violation":false}'
   ```
   This updates the trust store so future routing decisions can factor in agent reliability.

7. Mark applied principles as used (if any principles were injected in step 2d-pre):
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts apply '<principle_id>'
   ```
   Run once per principle that was included in the task-executor prompt.

**If tests failed:**
1. Remove the worktree:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/worktree-ops.ts remove <task_id>
   ```

1b. Update trust score for the failed tier:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trust.ts update '<tier>' '{"passed":false,"strikes":<strikes_used>,"violation":<had_governance_violation>}'
   ```

2. Classify the failure:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/classify-failure.ts '<test_output>'
   ```

3. Query memory bank for similar past experiences:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/memory.ts retrieve '<task_description>' 3
   ```

4. Check recovery budget:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/recovery.ts '<task_json>' '<approach>' '<test_output>' 3
   ```
   If recovery says "give_up": mark task as failed, log trail entry, record to memory bank with utility 0, continue to next task.

5. **Dispatch Diagnostician agent** with:
   - Test output (from failed verification)
   - Task spec (description, goal_refs, verification command)
   - Failure classification (from step 2)
   - Project state (conventions, architecture)
   - Do NOT include the failed code or approach description

6. **Dispatch Strategist agent** with:
   - Root cause analysis (from Diagnostician)
   - Banned approaches (from task + newly banned approach)
   - Memory bank matches (from step 3)
   - Task specification
   - Tradeoff weights (from intent-spec)

7. Update task with new banned_approaches and retry_count from recovery.ts output.

8. Re-execute from step 2b with the Strategist's approach injected into the task-executor prompt as the required approach.

### Persist State After Each Wave

After processing all tasks in a wave, write the updated roadmap back:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/validate-roadmap.ts '<updated_roadmap_json>'
```

### Post-Wave Context Check

After persisting roadmap state, if the auto-pause flag was set during the pre-wave check:
1. Execute auto-pause: write `.juhbdi/handoff.json` with current wave/task progress
2. Log trail entry: `event_type: "command"`, `description: "auto-paused after wave N — context tight"`
3. Inform user: "Auto-paused after wave N. Context at X%. Run `/juhbdi:resume` in a new session."
4. **STOP execution** — do not proceed to the next wave

### Update Beliefs Between Waves

After persisting the roadmap state and before starting the next wave, dispatch the belief-updater agent:

Use the Agent tool to dispatch a `belief-updater` agent with:
- The current wave ID that just completed
- Path to state.json and decision-trail.log

This is non-fatal — if the belief-updater fails, log a warning and continue to the next wave with the existing state.

Also instruct the belief-updater to read the context bridge file at `/tmp/juhbdi-ctx-*.json` if it exists, and update `state.json` `active_context.context_health` with:
- `remaining_pct`: from bridge file
- `trend`: "stable" if remaining_pct > 50, "declining" if 30-50, "critical" if < 30
- `last_checked`: current ISO timestamp
- `waves_remaining_estimate`: calculate based on context consumed per wave so far

Re-read `.juhbdi/state.json` after the belief-updater completes to get the updated state for the next wave's tasks.

### Replan Next Wave (Receding-Horizon)

If the roadmap has a `horizon_sketch` and there are remaining goals in it:

1. Read the updated `state.json` (from belief propagation)
2. Read the execution results from the just-completed wave
3. Evaluate: Did the wave achieve its goals? Any surprises or new constraints?
4. Generate the next concrete wave based on:
   - Updated beliefs (state.json)
   - Remaining goals from horizon_sketch
   - Key unknowns (which may now be resolved)
   - What was learned from execution
5. Update the horizon sketch:
   - Remove resolved unknowns
   - Add any newly discovered unknowns
   - Update estimated remaining waves
   - Set `adaptation_notes` if the plan changed and why
6. Append the new wave to `roadmap-intent.json` and update horizon_sketch
7. Validate and persist:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/validate-roadmap.ts '<updated_roadmap_json>'
   ```
8. Log a trail entry: `event_type: "decision"`, `description: "Replanned wave N+1"`, `reasoning: "[why plan changed]"`

If `horizon_sketch` has no remaining goals, skip replanning and proceed to post-execution.

If the roadmap has NO `horizon_sketch` (legacy behavior), execute all existing waves without replanning.

## Step 3: Post-Execution

After all waves complete:

1. **Dispatch Librarian Agent** (non-fatal — if this fails, just warn):
   Use the Agent tool to dispatch a `librarian` agent to compress the execution state.

2. **Log completion**:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"execution loop completed: N passed, N failed, N skipped","reasoning":"Processed N waves","alternatives_considered":[],"constraint_refs":[],"outcome":"approved/escalated"}'
   ```

3. **Report to user**:
   - Tasks passed / failed / skipped
   - If failures: highlight which tasks failed and why
   - Suggest next steps: `/juhbdi:status` to see dashboard, or fix issues and re-run `/juhbdi:execute`
