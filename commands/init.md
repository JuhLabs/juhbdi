---
name: init
description: Initialize a new JuhBDI project in the current directory
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion"]
---

Initialize a JuhBDI governed project by understanding the project, creating `.juhbdi/` with tailored configuration, and setting up the governance foundation.

## Step 1: Check if Already Initialized

If `.juhbdi/intent-spec.json` already exists, tell the user: "This project is already initialized. Run `/juhbdi:status` to see current state, or `/juhbdi:plan` to plan new work."

### Monorepo Detection

Before creating a new `.juhbdi/`, check if one already exists in parent directories (up to 3 levels):
- Check `../.juhbdi/`, `../../.juhbdi/`, `../../../.juhbdi/`
- If found, warn the user: "Found existing JuhBDI project at `<path>`. This appears to be a monorepo. Options: (a) Initialize a sub-project here with its own governance, or (b) Use the parent project's governance. Which do you prefer?"
- If user chooses (b), stop and suggest using the parent `.juhbdi/` directory
- If user chooses (a), proceed with initialization but add `parent_juhbdi: "<path>"` to `.juhbdi/config.json`

## Step 2: Understand the Project

Before creating config files, understand what we're working with.

### 2a. Scan the Codebase

- Read `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent manifest
- Check for existing test setup (test runner, test files)
- Identify framework/language (React, Express, Rust, Python, etc.)
- Note existing conventions (ESLint, Prettier, CI config, etc.)

### 2b. Ask the User

Use AskUserQuestion to ask 2-3 targeted questions:

1. "What's the purpose of this project? (1-2 sentences)"
2. "What matters most — quality, speed, or security?" (present as options:
   - "Quality first — thorough testing, clean architecture"
   - "Speed first — ship fast, iterate later"
   - "Security first — audit everything, strict governance"
   - "Balanced — reasonable defaults")

If the codebase scan didn't reveal clear conventions:
3. "Any specific constraints? (e.g., 'no external dependencies', 'must support Node 18', 'follow existing API patterns')"

## Step 3: Create Configuration

Run the init utility:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/init.ts
```

Parse the JSON output.

## Step 4: Tailor the Intent Spec

After init creates the default files, update `.juhbdi/intent-spec.json` with what you learned:

1. **Project description**: Set to the user's description from Step 2b
2. **Goals**: Create 1-3 initial goals based on the project purpose (e.g., "g1: Core functionality", "g2: Test coverage", "g3: Documentation")
3. **Tradeoff weights**: Set based on user's priority answer:
   - Quality first: `{ quality: 0.5, speed: 0.2, security: 0.3 }`
   - Speed first: `{ quality: 0.2, speed: 0.6, security: 0.2 }`
   - Security first: `{ quality: 0.3, speed: 0.1, security: 0.6 }`
   - Balanced: `{ quality: 0.4, speed: 0.3, security: 0.3 }`
4. **Constraints**: Add any user-specified constraints, plus inferred ones (e.g., if TypeScript project, add "All code must be TypeScript")

Write the updated intent-spec.json.

## Step 5: Update State

Update `.juhbdi/state.json` with discovered codebase info:
- `conventions`: detected patterns (test runner, linter, etc.)
- `architecture`: detected structure (monorepo, src layout, etc.)
- `tech_stack`: language, framework, key dependencies

## Step 6: Report

Tell the user what was set up:

```
## JuhBDI Initialized

**Project:** [description]
**Priority:** [quality/speed/security/balanced]
**Goals:** [list initial goals]
**Constraints:** [list constraints]

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
