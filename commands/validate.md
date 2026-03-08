---
name: validate
description: Validate all JuhBDI project files against their Zod schemas
allowed-tools: ["Bash"]
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
   - If FAIL: list the specific validation errors

4. Summarize: "All files valid." or "Validation failed — N file(s) have errors."
