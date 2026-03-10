---
name: statusline
description: Interactive setup for the JuhBDI Claude Code statusline
allowed-tools: ["Bash", "Read", "Write", "AskUserQuestion"]
---

Configure the JuhBDI statusline for Claude Code. Detects existing configurations, lets you customize appearance, previews before applying, and writes to `~/.claude/settings.json`.

## Step 1: Detect Current Configuration

```bash
~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/statusline/setup.ts detect
```

Parse the JSON result. Based on what was detected:

**If JuhBDI statusline already configured (`is_juhbdi: true`):**
Tell the user: "JuhBDI statusline is already configured. Would you like to reconfigure it?"
Use AskUserQuestion with options:
- "Reconfigure — update preferences"
- "Keep current — no changes"
If keep: stop.

**If ccstatusline detected (`is_ccstatusline: true`):**
Tell the user: "Found ccstatusline configuration. JuhBDI statusline includes all ccstatusline features plus mood colors, trust badges, and context monitoring. Would you like to migrate?"
Use AskUserQuestion with options:
- "Migrate — replace ccstatusline with JuhBDI statusline"
- "Keep ccstatusline — no changes"
If keep: stop.

**If other statusline detected (`is_other: true`):**
Tell the user: "Found existing statusline: `<current_command>`. JuhBDI statusline will replace it."
Use AskUserQuestion:
- "Replace — use JuhBDI statusline"
- "Cancel — keep current"
If cancel: stop.

**If no statusline configured:**
Tell the user: "No statusline configured. Let's set one up!"

## Step 2: Ask Preferences

Ask the user 3 preference questions, 2 at a time:

### Round 1

Use AskUserQuestion:

**Q1:** "Statusline alignment:
- **Right-aligned** (recommended) — statusline appears on the right side of the terminal
- **Left-aligned** — standard left positioning"

**Q2:** "Mood colors — the statusline shifts colors as context drains (calm→warm→hot→critical):
- **On** (recommended) — visual urgency cues help you know when to wrap up
- **Off** — always use the calm Catppuccin palette"

### Round 2

Use AskUserQuestion:

**Q3:** "Which elements do you want to see? (comma-separated or 'all'):
- **Trust badge** — shows agent trust tier [P]/[S]/[J]/[I]
- **Git branch** — current branch name
- **Cost** — running session cost
- **Context bar** — gradient context usage bar
- **All** (recommended) — show everything"

## Step 3: Build Config

Map the user's answers to a StatuslineConfig:

```json
{
  "right_align": true/false,
  "mood_colors": true/false,
  "trust_badge": true/false,
  "git_branch": true/false,
  "cost_display": true/false,
  "context_bar": true/false
}
```

## Step 4: Preview

Generate a preview of the statusline with the user's config:

```bash
echo '<config_json>' | ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/statusline/setup.ts preview
```

Show the preview output to the user and ask:
"Here's how your statusline will look (with mock data):"
[preview output]

Use AskUserQuestion:
- "Apply — looks good, set it up"
- "Adjust — change some options"
- "Cancel — don't change anything"

If adjust: go back to Step 2, showing current choices as defaults.
If cancel: stop.

## Step 5: Apply

```bash
echo '<config_json>' | ~/.bun/bin/bun run ${CLAUDE_PLUGIN_ROOT}/src/statusline/setup.ts apply
```

Parse the JSON result. If `success: false`: show the error message and stop.

## Step 6: Confirm

Tell the user:

```
## Statusline Configured

**Script:** ~/.claude/juhbdi-statusline.cjs
**Settings:** ~/.claude/settings.json

Your statusline will appear at the top of Claude Code on the next response.
To reconfigure later, run `/juhbdi:statusline`.
```
