---
name: compliance
description: "Check EU AI Act Article 12 compliance against decision trail"
allowed-tools: ["Read", "Bash"]
---

# /juhbdi:compliance

Check the current project's decision trail against EU AI Act Article 12 requirements.

## Steps

1. Read `.juhbdi/decision-trail.jsonl` — parse all entries
2. Run compliance checker: `~/.bun/bin/bun run src/governance/compliance-checker.ts <projectDir>`
3. Display formatted report showing:
   - Overall compliance score (0-100%)
   - Status: COMPLIANT / PARTIAL / NON-COMPLIANT
   - Days remaining until August 2, 2026 deadline
   - Each Article 12 requirement with present/missing/partial status
   - Specific fix instructions for each gap
4. If score < 100%, suggest running `/juhbdi:execute` with trail enrichment enabled
