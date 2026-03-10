---
name: activate
description: Inject JuhBDI governance rules into project CLAUDE.md for auto-activation
allowed-tools: ["Bash", "Read"]
---

Activate JuhBDI governance for this project by writing rules into CLAUDE.md.

## Steps

1. Run: `~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/quick/activate.ts`
2. If successful: "JuhBDI governance is now active. Every session will apply governance, memory, and cost-conscious routing."
3. If already exists: "JuhBDI governance is already active in CLAUDE.md."
4. If no .juhbdi/: suggest running `/juhbdi:init` first.

## What Governance Rules Do

After activation, briefly explain what each governance capability does:

```
### Active Governance Rules

- **Intent Alignment**: Every code change is checked against your project's stated goals and constraints before execution
- **Model Routing**: Tasks are automatically routed to the most cost-effective AI tier (haiku/sonnet/opus) based on complexity
- **Decision Trail**: All decisions, conflicts, and overrides are logged to an immutable audit trail for accountability
- **Memory Bank**: Successful patterns and learned principles are stored and reused across sessions
- **TDD Enforcement**: Tests are required before implementation — code is verified against acceptance criteria
- **Trust Scoring**: Agent autonomy increases as trust is earned through successful task completion
- **Cost Intelligence**: Token usage and costs are tracked per task, with savings vs always-opus reported
```
