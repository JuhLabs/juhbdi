---
name: init
description: Initialize a new JuhBDI project in the current directory
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Write", "AskUserQuestion"]
---

Initialize a JuhBDI governed project through progressive discovery — understanding the project, confirming findings, and creating `.juhbdi/` with tailored configuration.

## Step 1: Check if Already Initialized

If `.juhbdi/intent-spec.json` already exists, tell the user: "This project is already initialized. Run `/juhbdi:status` to see current state, or `/juhbdi:plan` to plan new work."

### Monorepo Detection

Before creating a new `.juhbdi/`, check if one already exists in parent directories (up to 3 levels):
- Check `../.juhbdi/`, `../../.juhbdi/`, `../../../.juhbdi/`
- If found, warn the user: "Found existing JuhBDI project at `<path>`. This appears to be a monorepo. Options: (a) Initialize a sub-project here with its own governance, or (b) Use the parent project's governance. Which do you prefer?"
- If user chooses (b), stop and suggest using the parent `.juhbdi/` directory
- If user chooses (a), proceed with initialization but add `parent_juhbdi: "<path>"` to `.juhbdi/config.json`

## Step 2: Understand the Project (Progressive Discovery)

Ask questions across 3 rounds, 2 questions at a time. Wait for answers before proceeding to the next round.

### Round 1 — Foundation (Purpose + Audience)

Use AskUserQuestion to ask:

**Q1:** "What's the purpose of this project? Describe it like you'd explain to a teammate. (1-2 sentences)"

**Q2:** "Who uses this?"
- End users (customers, public)
- Developers (API, SDK, library)
- Internal team (tools, dashboards, scripts)

### Scan + Confirm

After Round 1, scan the codebase silently, then **confirm findings with the user** before proceeding:

**Scan these:**
- Read `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent manifest
- Check for existing test setup (test runner, test files)
- Identify framework/language (React, Express, Rust, Python, etc.)
- Note existing conventions (ESLint, Prettier, CI config, etc.)
- Detect project structure (monorepo, src layout, etc.)

**Present findings for confirmation:**

Use AskUserQuestion:
"Here's what I found in your codebase:
- **Language:** [detected language]
- **Framework:** [detected framework or 'none']
- **Test runner:** [detected or 'none']
- **Conventions:** [linter/formatter or 'none detected']
- **Structure:** [monorepo/src-layout/flat/etc.]

Is this correct? (yes / no — tell me what's different)"

If the user corrects anything, update your understanding before proceeding.

### Round 2 — Priorities + Constraints

Use AskUserQuestion to ask:

**Q3:** "What matters most for this project? I'll tailor governance accordingly:
- **Quality** — thorough testing, clean architecture, code review gates
- **Speed** — ship fast, iterate, minimal ceremony
- **Security** — strict validation, audit trail, compliance-ready
- **Balanced** — reasonable defaults across all three"

**Q4:** "Any hard constraints I should know about? Examples:
- 'Must pass CI before merge'
- 'No external dependencies'
- 'Must support Node 18'
- 'Follow existing API patterns'
(or 'none' if no constraints)"

### Round 3 — Work Style Preference

Use AskUserQuestion to ask:

**Q5:** "How do you want to work with JuhBDI?
- **Hands-off** — execute automatically, pause only at governance gates (HITL)
- **Hands-on** — ask me before each wave of tasks
- **Balanced** — ask at major milestones, auto-execute smaller tasks"

**Q6:** "One last thing — what level of governance reporting do you want?
- **Minimal** — just pass/fail, errors only
- **Standard** — progress updates, key decisions logged
- **Full** — detailed trail, cost tracking, reflexion learning"

## Step 3: Preview Before Creating

**Before creating any files**, show the user a preview of the planned configuration and ask for approval:

Based on all answers (Q1-Q6) and the scan results, prepare the configuration values:

**Tradeoff weights** (from Q3):
- Quality first: `{ quality: 0.5, speed: 0.2, security: 0.3 }`
- Speed first: `{ quality: 0.2, speed: 0.6, security: 0.2 }`
- Security first: `{ quality: 0.3, speed: 0.1, security: 0.6 }`
- Balanced: `{ quality: 0.4, speed: 0.3, security: 0.3 }`

**Goals**: Create 1-3 initial goals based on the project purpose (e.g., "g1: Core functionality", "g2: Test coverage", "g3: Documentation")

Use AskUserQuestion to show the preview:
```
## Preview — JuhBDI Configuration

**Project:** [description from Q1]
**Audience:** [from Q2]
**Priority:** [from Q3]
**Work style:** [from Q5]
**Reporting:** [from Q6]

**Goals:**
1. [goal 1]
2. [goal 2]
3. [goal 3]

**Constraints:**
- [from Q4 + inferred, e.g., "All code must be TypeScript"]

**Detected stack:** [language] + [framework] + [test runner]

**Files to create:**
- .juhbdi/intent-spec.json — project goals & governance rules
- .juhbdi/roadmap-intent.json — execution roadmap (empty)
- .juhbdi/state.json — project beliefs & context
- .juhbdi/config.json — JuhBDI configuration
- .juhbdi/decision-trail.log — audit trail

Does this look right? (yes / edit — tell me what to change)
```

If the user says "edit", update the relevant values and re-preview only the changed parts.
If the user says "yes", proceed to Step 4.

## Step 4: Create Configuration

Run the init utility:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/init.ts
```

Parse the JSON output.

## Step 5: Tailor the Intent Spec

After init creates the default files, update `.juhbdi/intent-spec.json` with the approved values:

1. **Project description**: from Q1
2. **Audience**: from Q2
3. **Goals**: as shown in preview
4. **Tradeoff weights**: as determined from Q3
5. **Constraints**: from Q4 + inferred (e.g., if TypeScript project, add "All code must be TypeScript")

Write the updated intent-spec.json.

## Step 6: Update State

Update `.juhbdi/state.json` with discovered codebase info:
- `conventions`: detected patterns (test runner, linter, etc.)
- `architecture`: detected structure (monorepo, src layout, etc.)
- `tech_stack`: language, framework, key dependencies

## Step 8: Report

Tell the user what was set up:

```
## JuhBDI Initialized ✓

**Project:** [description]
**Priority:** [quality/speed/security/balanced]
**Work style:** [hands-off/hands-on/balanced]

**Detected:**
- Stack: [language/framework]
- Tests: [test runner or "none detected"]
- Conventions: [linter/formatter or "none detected"]

**Files created:**
- .juhbdi/intent-spec.json — project goals & governance rules
- .juhbdi/roadmap-intent.json — execution roadmap (empty)
- .juhbdi/state.json — project beliefs & context
- .juhbdi/config.json — JuhBDI configuration
- .juhbdi/decision-trail.log — audit trail

**Next:** Run `/juhbdi:plan <what you want to build>` to create an execution plan.
```
