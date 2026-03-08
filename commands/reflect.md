---
name: reflect
description: Extract learned principles from recent execution outcomes
argument-hint: "[wave_id]"
allowed-tools: ["Bash", "Read"]
---

Extract principles from execution outcomes by comparing planned vs actual approaches. Principles that diverged significantly (planned approach != actual approach) and succeeded are captured as reusable knowledge.

## Step 1: Load Context

1. Read `.juhbdi/decision-trail.log` to find recent wave outcomes
2. Read `.juhbdi/roadmap-intent.json` to get task details

If a `wave_id` argument was provided, filter to only that wave's outcomes. Otherwise, use the most recently completed wave.

## Step 2: Build Wave Result

For each completed task in the target wave(s), construct an outcome record:

```json
{
  "task_id": "<task_id>",
  "planned_approach": "<from trail entry or task description>",
  "actual_approach": "<from trail entry 'approach' field>",
  "description": "<task description>",
  "domain_tags": ["<extracted from description>"],
  "test_passed": true,
  "files_modified": ["<from trail entry>"]
}
```

Only include tasks where `test_passed: true` — failures don't generate positive principles.

## Step 3: Extract Principles

Load the existing principle bank and run extraction:

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts list 0
```

Then for each wave result, use the `extractPrinciples()` logic:
- Compare planned vs actual approach (word-level divergence)
- If divergence > 30%: a principle is worth extracting
- If overlapping principle exists in bank: boost its confidence (+0.05)
- If new principle: create with confidence 0.5 + divergence * 0.3

## Step 4: Save Principles

Save extracted principles to the bank:

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/principles.ts save '<principles_json>'
```

## Step 5: Log to Trail

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/trail-append.ts '{"event_type":"decision","description":"Reflection extracted N principles from wave <wave_id>","reasoning":"<summary of principles extracted>","alternatives_considered":[],"constraint_refs":[],"outcome":"approved"}'
```

## Step 6: Report

Tell the user:
- Number of principles extracted (new vs updated)
- List each principle with its confidence score
- Suggest: "Run `/juhbdi:execute` to apply these principles in future tasks"
