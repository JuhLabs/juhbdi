---
name: quick
description: Execute a governed ad-hoc task without full init/plan pipeline
argument-hint: "<task description>"
allowed-tools: ["Bash", "Read", "Agent", "AskUserQuestion"]
---

Execute a single governed task with JuhBDI's intelligence stack (governance, model routing, memory, audit trail) without requiring /juhbdi:init or /juhbdi:plan.

## Prerequisites

The user must provide a task description as the argument.
If no description: ask "What task should I execute?"

## Step 1: Pre-Flight Check

```
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/quick/preflight.ts '<task_description>'
```

Parse JSON. If `approved: false`: display violations, ask user to override or cancel.
If `approved: true`: show routing info ("Routing to **<tier>**, confidence: <N>").

## Step 2: Create Worktree

```
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/worktree-ops.ts create quick-task
```

If worktree-ops fails (no .juhbdi/), create a branch: `git checkout -b quick-$(date +%s)`

## Step 3: Dispatch Task Executor

Use the Agent tool to dispatch a `task-executor` agent with the task description,
worktree path, and any memory context from preflight.

## Step 4: Handle Results

**Passed:** Merge worktree, record result:
```
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/quick/record.ts '<result_json>' '<description>'
```

**Failed:** Remove worktree, record failure, suggest `/juhbdi:plan` for full pipeline.
