---
name: auto
description: One-command full pipeline — init, plan, execute, and reflect in a single flow
argument-hint: "<what to build>"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Write", "Agent", "AskUserQuestion"]
---

Execute the full JuhBDI pipeline in a single command: init (if needed) → plan → execute → reflect. Designed for new users and fast workflows. Fully governed — trail, trust, verification all fire. Interruptible via `/juhbdi:pause` at any point.

## Step 0: Parse Request

The user must provide a description of what they want to build as the argument.
If no description was provided, use AskUserQuestion: "What do you want to build? Describe it in 1-3 sentences."

Store the description as `REQUEST`.

## Step 1: Check Project State

### 1a. Check if JuhBDI is initialized

Check if `.juhbdi/intent-spec.json` exists.

**If NOT initialized:**

Tell the user: "No JuhBDI project found. Running quick initialization..."

Perform a fast init (no Socratic rounds — infer everything):

1. Scan the codebase:
   - Read `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent
   - Detect language, framework, test runner, conventions
   - Detect project structure

2. Run init utility:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/init.ts
   ```

3. Update `.juhbdi/intent-spec.json` with inferred values:
   - Description: from codebase scan
   - Goals: `["g1: Implement user request"]`
   - Tradeoff weights: `{ quality: 0.4, speed: 0.3, security: 0.3 }` (balanced default)
   - Constraints: inferred from detected stack

4. Write `.juhbdi/user-preferences.json`:
   ```json
   {
     "work_style": "hands-off",
     "reporting_level": "standard",
     "audience": "developers",
     "created": "<ISO timestamp>",
     "version": "1.0.0"
   }
   ```

5. Log trail entry:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"auto-init: quick initialization for /juhbdi:auto pipeline","reasoning":"No .juhbdi/ found, created with balanced defaults","alternatives_considered":["full interactive init"],"constraint_refs":[],"outcome":"approved"}'
   ```

Tell the user: "Initialized with balanced defaults. You can customize later with `/juhbdi:init`."

**If already initialized:** Tell the user: "JuhBDI project found. Loading context..."

### 1b. Check for existing roadmap

Read `.juhbdi/roadmap-intent.json`.

- If it exists AND has pending tasks: ask the user with AskUserQuestion:
  "An existing roadmap with N pending tasks was found. Options:
  - **Continue** — resume execution of existing roadmap
  - **Replace** — create a new plan for your request (existing plan will be archived)
  - **Cancel** — stop and let you decide"

  If **Continue**: skip to Step 3 (Execute).
  If **Replace**: archive current roadmap to `.juhbdi/roadmap-intent.archived-<timestamp>.json`, proceed to Step 2.
  If **Cancel**: stop.

- If no roadmap or all tasks completed: proceed to Step 2.

## Step 2: Plan (Streamlined)

Generate a roadmap from the user's request. This is a streamlined version of `/juhbdi:plan` — no Socratic rounds, direct planning.

### 2a. Load Context

Read:
1. `.juhbdi/intent-spec.json` — goals, constraints, tradeoffs
2. `.juhbdi/state.json` — conventions, architecture, tech stack

### 2b. Analyze Codebase

1. Refresh repo map:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/repo-map.ts generate
   ```

2. Read relevant files based on the REQUEST to understand current state.

### 2c. Generate Waves

Break the REQUEST into atomic micro-tasks following these principles:
- Self-contained task descriptions (complete enough for isolated agent)
- Build order: setup → implementation → integration → verification
- Parallel when independent tasks exist
- 35-minute time guard per task (auto-split if exceeded)
- Each task has: id, description, goal_refs, status: "pending", verification, retry_count: 0, estimated_minutes

### 2d. Quick Preview

Show a compact preview to the user:

```
## Auto Plan Preview

**Request:** [REQUEST]
**Waves:** N (M tasks, ~X min total)

W1: [purpose] — t1: [brief], t2: [brief]
W2: [purpose] — t3: [brief], t4: [brief]

Approve and execute? (yes / edit / cancel)
```

Use AskUserQuestion. If **yes**: validate and write. If **edit**: adjust and re-preview. If **cancel**: stop.

### 2e. Write Roadmap

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/validate-roadmap.ts '<roadmap_json>'
```

Log trail:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"auto-plan: generated N waves with M tasks","reasoning":"Streamlined planning for auto pipeline","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```

## Step 3: Execute

Run the full execution loop. This follows the same flow as `/juhbdi:execute` — all governance applies.

Tell the user: "Executing plan..."

### 3a. Pre-Execution Setup

1. Read `.juhbdi/roadmap-intent.json` and `.juhbdi/intent-spec.json`
2. Log execution start:
   ```bash
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"auto-execute: execution loop started","reasoning":"Processing N waves in auto pipeline","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
   ```
3. Refresh repo map (if not already done in Step 2b)

### 3b. Process Waves

For each wave in the roadmap, follow the FULL execution protocol from `/juhbdi:execute`:

1. **Pre-wave context check** — auto-pause if context < 30%
2. **Route each task** — model routing with trail logging (CRITICAL: JSON.stringify(route) in reasoning field)
3. **HITL gate check** — pause for high-risk tasks
4. **Intent check** — structural validation
5. **TNR checkpoint** — pre-task test snapshot
6. **Speculation + principles** — query memory for past learnings
7. **Dispatch task-executor** — with full context (reflexions, traces, tools, repo map)
8. **Governance check** — validate file writes
9. **Handle results** — merge on pass, recovery on fail
10. **Post-task wiring** — processTaskOutcome, verifyTask, article12 fields, divergence check

**Parallel waves**: Dispatch all task-executors in a SINGLE response for actual parallelism.

**Between waves**: Update beliefs, check context health, replan if horizon_sketch exists.

### 3c. Confidence Gate

For tasks where the model router returns confidence < 0.5 or the speculation engine returns warnings:
- Pause and show the user: "Low confidence on task <id>: <reason>. Proceed or skip?"
- If skip: mark task as "blocked", continue to next
- If proceed: execute with an extra note in the task-executor prompt about the risk

## Step 4: Reflect

After execution completes, automatically extract principles from outcomes.

### 4a. Build Wave Results

For each completed wave, construct outcome records:
- task_id, planned_approach, actual_approach, description, domain_tags, test_passed, files_modified

### 4b. Extract Principles

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts list 0
```

For each successful task where planned approach diverged from actual (>30% word-level divergence):
- Extract principle with confidence 0.5 + divergence * 0.3
- Boost existing overlapping principles by +0.05

### 4c. Save Principles

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts save '<principles_json>'
```

### 4d. Dispatch Librarian

Non-fatal — compress execution state:
Use the Agent tool to dispatch a `librarian` agent to compress the session state.

## Step 5: Final Summary

Present a comprehensive summary to the user:

```
## Auto Pipeline Complete

**Request:** [REQUEST]
**Duration:** [start to end]
**Result:** N/M tasks passed

### Tasks
- [task_id]: [brief] — PASSED
- [task_id]: [brief] — FAILED: [reason]

### Learnings
- N new principles extracted
- N existing principles reinforced
- [Top principle if any]

### Cost
- Model tiers used: [haiku: N, sonnet: N, opus: N]
- Estimated cost: $X.XX

### Next Steps
- `/juhbdi:status` — view project dashboard
- `/juhbdi:execute` — retry failed tasks
- `/juhbdi:reflect` — deep-dive into learnings
- `/juhbdi:dashboard` — real-time monitoring
```

Log final trail:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"auto pipeline complete: N passed, N failed, N principles extracted","reasoning":"Full pipeline: init→plan→execute→reflect","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```
