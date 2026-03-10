---
name: validate
description: Validate all JuhBDI project files against their Zod schemas
allowed-tools: ["Bash", "AskUserQuestion", "Write", "Read"]
---

Validate the JuhBDI project's schema files to ensure they conform to the required structure.

## Steps

1. Run the validate utility:
   ```
   ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/cli-utils/validate.ts
   ```

2. Parse the JSON output.

3. Display results for each file:
   - PASS or FAIL status
   - If FAIL: list the specific validation errors with fix suggestions

4. **Fix Suggestions**: For each error type, provide an actionable fix:
   - Missing required field: "Add `<field_name>: <default_value>` to `<file>`"
   - Invalid type (string expected, got number): "Change `<field>` from `<actual>` to `\"<actual>\"` (wrap in quotes)"
   - Invalid enum value: "Valid values for `<field>` are: `<valid_values>`. Change `<actual>` to one of these."
   - Extra unknown field: "Remove `<field>` from `<file>` — not in schema"
   - Array expected: "Wrap `<field>` value in brackets: `[<value>]`"
   - File not found: "Run `/juhbdi:init` to create missing configuration files"

5. Summarize: "All files valid." or "Validation failed — N file(s) have errors. See fix suggestions above."

## Next Steps

After displaying validation results, suggest relevant next actions:

- If all files are valid: `"All good! Run /juhbdi:status for a full project overview, or /juhbdi:plan to start new work."`
- If errors were found: `"Want me to fix these automatically? (y/n) Or run /juhbdi:init to regenerate config files."`
- If `.juhbdi/` is missing entirely: `"No JuhBDI project found. Run /juhbdi:init to set one up."`

Use AskUserQuestion to offer the auto-fix option when errors are found. If the user says yes, apply the fix suggestions from step 4 automatically, then re-run validation to confirm.
