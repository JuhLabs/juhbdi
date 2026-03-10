---
name: audit
description: Query the decision trail with filters and compliance reporting
argument-hint: "[--type TYPE] [--task ID] [--wave ID] [--from DATE] [--to DATE] [--compliance]"
allowed-tools: ["Bash"]
---

Query and filter the JuhBDI decision trail for governance auditing and EU AI Act / ISO 42001 compliance reporting.

## Steps

1. Pass any user-provided arguments to the audit utility. Available flags:
   - `--type <event_type>` — Filter by event type (decision, conflict, override, recovery, command)
   - `--task <task_id>` — Filter by task ID
   - `--wave <wave_id>` — Filter by wave ID
   - `--from <date>` — Filter entries from this date (ISO format)
   - `--to <date>` — Filter entries up to this date (ISO format)
   - `--compliance` — Generate EU AI Act / ISO 42001 compliance score report

2. Run:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/audit.ts [flags]
   ```

3. The output is already formatted. Present it directly to the user.

4. If no trail entries exist, inform the user that no decisions have been recorded yet.

### Export Options

If the user passes `--export json` or `--export csv`:

- **`--export json`**: Write the filtered trail entries to `.juhbdi/audit-export.json` as a JSON array. Report: "Exported N entries to `.juhbdi/audit-export.json`"
- **`--export csv`**: Write the filtered trail entries to `.juhbdi/audit-export.csv` with columns: `timestamp, event_type, description, task_id, wave_id, outcome, reasoning`. Report: "Exported N entries to `.juhbdi/audit-export.csv`"

### Summary Statistics

After displaying trail entries (or at the top of the output), show a summary statistics line:

```
Audit Summary: N total entries | X decisions | Y conflicts | Z overrides | W recoveries | V commands
```

If `--compliance` is used, also show:
```
Compliance: N/M fields populated (X%)
```
