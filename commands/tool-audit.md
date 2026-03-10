---
name: tool-audit
description: "Audit MCP tools for poisoning patterns and security risks"
allowed-tools: ["Read", "Bash"]
---

# /juhbdi:tool-audit

Scan all available MCP tools for poisoning patterns, hidden instructions, and exfiltration attempts.

## Steps

1. List all available MCP tools and their descriptions
2. Run MCP sanitizer against each tool description and parameter set
3. Display formatted audit report:
   - Total tools scanned
   - Clean / Suspicious / Dangerous / Blocked counts
   - For each non-clean tool: findings with severity, category, and matched text
4. If any tools are BLOCKED or DANGEROUS, warn the user and suggest disabling those MCP servers
5. Record audit results in decision trail with event_type: "tool_audit"
