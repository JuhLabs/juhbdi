---
name: plan
description: Generate a governed execution roadmap from a development request
argument-hint: "[development request]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Agent", "AskUserQuestion"]
---

Generate a governed roadmap-intent.json by understanding the user's intent through discovery, analyzing the codebase, challenging assumptions through Socratic review, and producing a wave-based execution plan.

## Prerequisites

If `.juhbdi/` doesn't exist, tell the user to run `/juhbdi:init` first and stop.

## Step 1: Discovery — Understand What the User Wants

**If the user provided a detailed request** (multiple sentences, clear scope): proceed to the structured summary in Step 1b.

**If the user provided a short or vague request** (or no request at all): enter Discovery Mode.

### Discovery Mode

Your goal is to understand the FULL picture before planning. Ask focused questions — not a wall of text. Ask 2-3 questions at a time, max 3 rounds.

**Round 1 — What and Why:**
Use AskUserQuestion to ask:
- "What are you building? Describe it like you're explaining to a teammate."
- "What's the most important outcome? (e.g., working MVP, production-ready, prototype for feedback)"

**Round 2 — Scope and Constraints:**
Based on Round 1 answers, ask relevant follow-ups like:
- "Should this integrate with existing code or be standalone?"
- "Any specific tech preferences or things to avoid?"
- "Who will use this — end users, developers, internal team?"

**Round 3 (optional) — Clarify Unknowns:**
Only ask if something is genuinely ambiguous. Don't ask questions you can infer from context.

### 1a. Analyze the Codebase

Before summarizing, understand what already exists:

1. Check project structure:
   - Read `package.json` (or equivalent manifest) for tech stack, dependencies
   - Scan key directories to understand the architecture
   - Look for existing patterns, conventions, test setup

2. If `.juhbdi/repo-map.json` exists, read it for structural understanding.

3. If the request involves modifying existing code, read the relevant files to understand current state.

### 1b. Structured Summary

Present a clear summary back to the user before planning:

```
## Here's what I understand

**Request:** [1-2 sentence refined request]
**Scope:** [small / medium / large — based on estimated tasks]
**Approach:** [high-level technical approach]
**Key decisions:**
- [Decision 1 — e.g., "Using existing auth module vs building new"]
- [Decision 2]

**What I found in the codebase:**
- [Relevant existing code/patterns that affect the plan]
- [Dependencies or constraints from current architecture]

**Assumptions I'm making:**
- [Assumption 1 — e.g., "Tests should use the existing bun test setup"]
- [Assumption 2]

Does this look right? Anything to change before I generate the plan?
```

Wait for user confirmation. If they correct anything, update your understanding and re-summarize only the changed parts.

## Step 2: Load Project Context

Read from `.juhbdi/`:
1. **Intent Spec**: `.juhbdi/intent-spec.json` — goals, constraints, tradeoff weights, HITL gates
2. **Project State**: `.juhbdi/state.json` — compressed project history, conventions, architecture

## Step 3: Socratic Challenge

You are now the **Socratic Governance Agent**. Evaluate the refined request against EVERY constraint in the intent spec.

For each constraint in `intent-spec.json`:
1. Check if the development request conflicts with it
2. If conflict found, record: `constraint_id`, `description` (why), `severity` (hard/soft)

Determine approval:
- **Approved** if NO hard constraint violations
- **Not approved** if ANY hard constraint is violated

**If approved with no conflicts**: Proceed to Step 4.

**If approved with soft conflicts**: Show warnings, proceed to Step 4.

**If NOT approved (hard conflicts)**:
1. Display all conflicts clearly
2. Ask: "Hard constraint violations detected. Override and continue, or stop to address them?"
3. If stop: log trail entry, stop
4. If override: log override trail entry, proceed

Log the challenge result:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"decision","description":"Socratic challenge: [approved/conflicts found]","reasoning":"Evaluated request against N constraints. Found N conflicts.","alternatives_considered":["suggestions here"],"constraint_refs":["constraint_ids"],"outcome":"approved/escalated"}'
```

## Step 4: Generate Execution Waves

You are now the **Wave Planning Agent**. Break the refined request into atomic micro-tasks in sequential waves.

### Planning Principles

1. **Self-contained tasks**: Each task description must be complete enough for an isolated agent with NO conversation history to execute it. Include file paths, expected behavior, and acceptance criteria.
2. **Receding-horizon**: Generate Wave 1 as concrete tasks. Remaining work goes in `horizon_sketch`.
3. **Build order**: setup → implementation → integration → verification
4. **Parallel when possible**: Independent tasks in the same wave get `parallel: true`

### Time Estimation (35-Minute Guard)

For each task, estimate its time using the Time Guard (research: Zylos 2026 — success decreases after 35 minutes, doubling duration quadruples failure rate):
- Count the files the task will create/modify
- Assess complexity (0-1): 0.2 for boilerplate, 0.5 for standard, 0.8+ for complex logic
- Factor in test writing (+40%) and refactoring (+30%)
- If estimated > 35 minutes: auto-decompose into subtasks and add a note

Show time estimates in the plan output:
```
- t1: [description] (~N min)
- t2: [description] (~N min, WARNING: approaching 35-min limit)
- t3: [description] (~N min, AUTO-SPLIT into t3a, t3b)
```

### Task Requirements

Each task MUST have:
- `id`: unique (e.g., "t1", "t2")
- `description`: **Detailed, self-contained.** Bad: "Add user model". Good: "Create src/models/user.ts with a User interface containing id (string), email (string), name (string), createdAt (Date). Export the interface. Add a createUser() function that validates email format and returns a User object. Write tests in src/models/user.test.ts covering: valid creation, invalid email rejection, required field validation."
- `goal_refs`: array of goal IDs from intent-spec
- `status`: "pending"
- `verification`: `{ type: "test"|"lint"|"manual", command: "..." }`
- `retry_count`: 0
- `estimated_minutes`: estimated time from Time Guard (number)

### Output Format

```json
{
  "version": "1.0.0",
  "intent_spec_ref": ".juhbdi/intent-spec.json",
  "waves": [
    {
      "id": "w1",
      "parallel": false,
      "tasks": [
        {
          "id": "t1",
          "description": "...",
          "goal_refs": ["g1"],
          "status": "pending",
          "verification": { "type": "test", "command": "bun test src/..." },
          "retry_count": 0
        }
      ]
    }
  ],
  "horizon_sketch": {
    "remaining_goals": ["g2", "g3"],
    "estimated_waves": 3,
    "key_unknowns": ["How auth module integrates with existing DB"]
  }
}
```

## Step 5: Validate and Write Roadmap

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/validate-roadmap.ts '<roadmap_json>'
```

If validation fails, fix and retry.

## Step 6: Present the Plan

Show the user a clear, visual summary:

```
## Execution Plan

**Request:** [refined request]
**Waves:** N (M tasks total)
**Estimated approach:** [wave-by-wave overview]

### Wave 1 — [purpose] (N tasks, parallel/sequential)
- t1: [brief description]
- t2: [brief description]

### Horizon (remaining work)
- [remaining goal 1]
- [remaining goal 2]
- Key unknowns: [list]

Ready to execute? Run `/juhbdi:execute`
```

## Step 7: Log Trail

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"command","description":"Plan generated and written to roadmap-intent.json","reasoning":"Generated N waves with N total tasks","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```
