---
name: auto
description: One-command full pipeline — init, plan, execute, and reflect in a single flow
argument-hint: "<what to build>"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Write", "Agent", "AskUserQuestion"]
---

Full pipeline: init → plan → execute → reflect. Governance scales with task complexity. Interruptible via `/juhbdi:pause`.

**Shorthand:** `BUN=~/.bun/bin/bun`, `CLI=${CLAUDE_PLUGIN_ROOT}/src/cli-utils`

## Step 0: Parse Request + Tier

If no argument, ask: "What do you want to build?"

Estimate tier: words + scope keywords ("and","also","then","plus","additionally") × 15. ≤30=micro, ≤60=small, ≤120=medium, >120=large. Store as `TIER` (upgrade only, never downgrade).

| Tier | Approval | Reflect |
|------|----------|---------|
| Micro | None | Skip |
| Small | One-line y/n | If divergence > 30% |
| Medium | Full preview | Full |
| Large | Preview + checkpoints | Full + librarian |

## Step 1: Init + Roadmap Check

**No `.juhbdi/state.json`**: `BUN run ${CLI}/init.ts --quick`. Say "Initialized."
**Has state**: Silent for micro/small, "Loading context..." for medium+.
**Existing roadmap with pending tasks**: Ask Continue/Replace/Cancel.

## Step 2: Plan

Load intent-spec + state (skip if missing). Refresh repo map. Break REQUEST into waves:
- Self-contained tasks, build order, parallel when independent, 35-min guard
- Refine tier from actual task count (never downgrade)

**Tier-aware approval:**
- Micro: no approval, execute immediately
- Small: "Build [summary] in N waves (M tasks)? (yes/cancel)"
- Medium+: full preview with approve/edit/cancel

Write: `validate-roadmap.ts '<json>'`. Log trail.

## Step 2.5: Context Budget Pre-Flight

Before executing, estimate if the pipeline will fit in remaining context:
1. Read bridge file `/tmp/juhbdi-ctx-*.json` for `remaining_pct`
2. Calculate: `(taskCount × 8000 + waveCount × 2000 + 6000) / (remaining_pct% × 200000)`
3. If estimated usage > 85%: warn user "Pipeline may exhaust context (~N% of remaining). Proceed or split?"
4. If > 100%: strongly recommend splitting. Use AskUserQuestion.
5. If bridge file missing (no context data): proceed without warning.

## Step 3: Execute

Follow `/juhbdi:execute` protocol — all governance applies regardless of tier.

### 3a. Setup
1. Load roadmap + intent-spec
2. Load router calibration: `router-calibration.ts load` → pass thresholds to routeTask()
3. Log execution start. Refresh repo map.

### 3b. Per-Wave
Full execution protocol: context check → route → HITL → intent check → TNR → speculation → dispatch task-executor → governance → handle results → post-task wiring.

**After each task:** `router-calibration.ts merge '{"task_id":"<id>","recommended_tier":"<tier>","actual_outcome":"<outcome>","timestamp":"<ISO>"}'`

**Parallel waves:** ALL task-executors in ONE response.
**Between waves:** Beliefs update, context check, replan if horizon_sketch.
**Confidence < 0.5:** Pause, ask user to proceed or skip.

## Step 4: Reflect (Tier-Aware)

**Micro:** Skip entirely.
**Small:** Compute Jaccard divergence per task. If any > 30%: extract principle (confidence = 0.5 + divergence × 0.3), save via `principles.ts save`. No librarian.
**Medium+:** Full — build wave results, extract principles, boost overlapping (+0.05), save.
**Router calibration promotion:** If `total_routed >= 50`, promote thresholds to global bank.
**Librarian:** Large always, Medium if 10+ tasks. Non-fatal.

## Step 5: Summary

```
## Auto Pipeline Complete
**Request:** [REQUEST] | **Tier:** [TIER] | **Result:** N/M passed
Tasks: [id]: [brief] — PASSED/FAILED
Learnings: N principles | Cost: $X.XX (haiku: N, sonnet: N, opus: N)
Next: /juhbdi:status | /juhbdi:execute | /juhbdi:dashboard
```

Log final trail entry.
