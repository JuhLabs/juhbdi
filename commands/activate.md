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
