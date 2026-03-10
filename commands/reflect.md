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

### Principle Usage Analysis

After listing extracted principles, analyze the full principle bank for usage patterns:

1. **Most Used Principles** (top 3 by `applied_count` or confidence): Show which principles are guiding the most decisions
2. **Least Used Principles** (bottom 3, or those with confidence < 0.3): Flag these for potential cleanup
3. **Unused Principles**: Any principle that has never been applied since creation (confidence still at initial value, no `applied_count`)

Display:
```
### Principle Health
Most applied:   "Prefer composition over inheritance" (confidence: 0.92, applied 14x)
                "Test edge cases first" (confidence: 0.88, applied 11x)
Least applied:  "Use factory pattern for models" (confidence: 0.31, applied 1x)
Never applied:  "Avoid global state" (confidence: 0.50, applied 0x) -- consider removing
```

If there are principles with confidence below 0.2, suggest: "N principles have very low confidence and may be obsolete. Consider reviewing and removing them manually from `.juhbdi/principle-bank.json`."
