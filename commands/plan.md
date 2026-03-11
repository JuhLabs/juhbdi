---
name: plan
description: Generate a governed execution roadmap from a development request
argument-hint: "[development request]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Agent", "AskUserQuestion"]
---

Generate a governed roadmap-intent.json through discovery, codebase analysis, Socratic challenge, and wave-based planning.

**Shorthand:** `BUN=~/.bun/bin/bun`, `CLI=${CLAUDE_PLUGIN_ROOT}/src/cli-utils`

## Prerequisites

If `.juhbdi/` doesn't exist, tell user to run `/juhbdi:init` first. Stop.

## Step 1: Discovery

**Detailed request provided**: skip to Step 1b.
**Short/vague request**: enter Discovery Mode — ask focused questions (2-3 per round, max 3 rounds):
- Round 1: What are you building? Most important outcome?
- Round 2: Integrate with existing code or standalone? Tech preferences? Who uses it?
- Round 3 (optional): Only if genuinely ambiguous.

### 1a. Analyze Codebase

1. Read manifest (package.json etc.) for stack, deps
2. Scan key directories for architecture, patterns, test setup
3. Read `.juhbdi/repo-map.json` if exists
4. Read relevant files if modifying existing code

### 1b. Structured Summary

Present to user:
```
## Here's what I understand
**Request:** [1-2 sentences]  |  **Scope:** small/medium/large  |  **Approach:** [technical approach]
**Key decisions:** [list]  |  **Codebase findings:** [list]  |  **Assumptions:** [list]
Does this look right?
```
Wait for confirmation. Update if corrected.

## Step 2: Load Project Context

Read `.juhbdi/intent-spec.json` (goals, constraints, tradeoffs) and `.juhbdi/state.json` (history, conventions).

## Step 3: Socratic Challenge

Evaluate request against EVERY constraint in intent-spec:
- No hard violations → approved, proceed
- Soft conflicts → warn, proceed
- Hard violations → display, ask user to override or stop

Log: `trail-append.ts '{"event_type":"decision","description":"Socratic challenge: [result]",...}'`

## Step 4: Generate Waves

Break request into atomic micro-tasks in sequential waves.

**Principles:** Self-contained descriptions (isolated agent can execute with NO history). Receding-horizon (Wave 1 concrete, rest in horizon_sketch). Build order: setup → impl → integration → verify. Parallel when independent.

**35-Minute Guard:** If estimated > 35 min, auto-split. Show warnings for tasks approaching limit.

**Each task requires:** id, description (detailed + self-contained), goal_refs, status: "pending", verification: {type, command}, retry_count: 0, estimated_minutes.

**Bad description:** "Add user model"
**Good description:** "Create src/models/user.ts with User interface (id, email, name, createdAt). Export interface. Add createUser() with email validation. Write tests in user.test.ts covering: valid creation, invalid email, required fields."

## Step 5: Preview

Show wave structure and ask for approval:
```
## Plan Preview
**Request:** [refined]  |  **Waves:** N (M tasks, ~X min)
W1 — [purpose]: t1 (~N min), t2 (~N min)
W2 — [purpose]: t3 (~N min)
Horizon: [remaining goals, unknowns]
Options: ✓ Approve | ✎ Edit | ✗ Cancel
```
Use AskUserQuestion. Edit → adjust + re-preview. Cancel → log + stop.

## Step 6: Write Roadmap

```bash
BUN run ${CLI}/validate-roadmap.ts '<roadmap_json>'
```

## Step 7: Confirm

Show final plan summary. Suggest `/juhbdi:execute`.

## Step 8: Log Trail

```bash
BUN run ${CLI}/trail-append.ts '{"event_type":"command","description":"Plan generated: N waves, M tasks","reasoning":"...","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```
