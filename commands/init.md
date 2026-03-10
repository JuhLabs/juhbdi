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

## Step 3: Create Configuration

Run the init utility:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/init.ts
```

Parse the JSON output.

## Step 4: Tailor the Intent Spec

After init creates the default files, update `.juhbdi/intent-spec.json` with what you learned:

1. **Project description**: Set to the user's description from Q1
2. **Audience**: Set based on Q2 (end-users/developers/internal)
3. **Goals**: Create 1-3 initial goals based on the project purpose (e.g., "g1: Core functionality", "g2: Test coverage", "g3: Documentation")
4. **Tradeoff weights**: Set based on Q3:
   - Quality first: `{ quality: 0.5, speed: 0.2, security: 0.3 }`
   - Speed first: `{ quality: 0.2, speed: 0.6, security: 0.2 }`
   - Security first: `{ quality: 0.3, speed: 0.1, security: 0.6 }`
   - Balanced: `{ quality: 0.4, speed: 0.3, security: 0.3 }`
5. **Constraints**: Add user-specified constraints from Q4, plus inferred ones (e.g., if TypeScript project, add "All code must be TypeScript")

Write the updated intent-spec.json.

## Step 5: Save User Preferences

Write `.juhbdi/user-preferences.json` with the work style and reporting preferences:

```json
{
  "work_style": "hands-off | hands-on | balanced",
  "reporting_level": "minimal | standard | full",
  "audience": "end-users | developers | internal",
  "created": "<ISO timestamp>",
  "version": "1.0.0"
}
```

The execute command should read this file to determine:
- `hands-off`: auto-approve waves, only pause at HITL gates
- `hands-on`: ask before each wave
- `balanced`: ask at wave boundaries for multi-wave plans, auto for single-wave

## Step 6: Update State

Update `.juhbdi/state.json` with discovered codebase info:
- `conventions`: detected patterns (test runner, linter, etc.)
- `architecture`: detected structure (monorepo, src layout, etc.)
- `tech_stack`: language, framework, key dependencies

## Step 7: Preview Before Creating

**Before reporting success**, show the user a preview of what was configured and ask for final approval:

Use AskUserQuestion:
```
## Preview — JuhBDI Configuration

**Project:** [description]
**Audience:** [end-users/developers/internal]
**Priority:** [quality/speed/security/balanced]
**Work style:** [hands-off/hands-on/balanced]
**Reporting:** [minimal/standard/full]

**Goals:**
1. [goal 1]
2. [goal 2]
3. [goal 3]

**Constraints:**
- [constraint 1]
- [constraint 2]

**Detected stack:** [language] + [framework] + [test runner]

Does this look right? (yes / edit — tell me what to change)
```

If the user says "edit", update the relevant config and re-preview only the changed parts.

## Step 8: Report

Once approved, tell the user what was set up:

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
- .juhbdi/user-preferences.json — your work style preferences
- .juhbdi/decision-trail.log — audit trail

**Next:** Run `/juhbdi:plan <what you want to build>` to create an execution plan.
```
