---
name: compliance
description: "Check EU AI Act + NIST AI RMF compliance against decision trail"
allowed-tools: ["Read", "Bash"]
---

Check the current project's governance compliance across EU AI Act Article 12 and NIST AI RMF 1.0 frameworks.

## Step 1: Generate Full Report

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/governance/compliance-report.ts
```

If the script doesn't have a CLI entry, generate the report by reading files directly:

1. Read `.juhbdi/decision-trail.log` — parse all JSONL entries
2. Read `.juhbdi/intent-spec.json` — get risk class, retention policy

## Step 2: EU AI Act Section

Run compliance checker:
```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/governance/compliance-checker.ts
```

Display:
- Overall compliance score with progress bar: `[████████████░░░░░░░░] 60%`
- Status: COMPLIANT / PARTIAL / NON-COMPLIANT
- Days remaining until August 2, 2026 deadline
- Each Article 12 requirement with status icon:
  - `[x]` present
  - `[~]` partial
  - `[ ]` missing
- Fix instructions for each gap

## Step 3: NIST AI RMF Section

Display NIST crosswalk coverage:

```
NIST AI RMF 1.0 Coverage

  GOVERN   [████████████████████] 100% (10/10 full)
  MAP      [████████████████████] 100% (10/10 full)
  MEASURE  [████████████████████] 100% (10/10 full)
  MANAGE   [████████████████████] 100% (10/10 full)

  Overall: 100% across 40 mappings
```

For each function with < 100% coverage, list the specific gaps.

## Step 4: Trail Integrity

Display:
- Total entries in decision trail
- Date range (oldest → newest)
- Entries with AI Act enrichment (count and percentage)

## Step 5: Recommendations

List all actionable recommendations from the report:
- Missing EU AI Act fields with fix instructions
- NIST gaps with implementation guidance
- Trail quality improvements

If score < 100% for either framework, suggest: "Run `/juhbdi:execute` with trail enrichment to improve compliance coverage."
