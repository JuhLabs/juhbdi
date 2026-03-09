<p align="center">
  <img src="site/juhbdilogo.png" alt="JuhBDI" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/v1.4.1-lavender?style=flat-square&label=JuhBDI&labelColor=1e1e2e&color=b4befe" alt="version" />
  <a href="https://www.npmjs.com/package/juhbdi"><img src="https://img.shields.io/npm/v/juhbdi?style=flat-square&label=npm&labelColor=1e1e2e&color=f9e2af" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/juhbdi"><img src="https://img.shields.io/npm/dm/juhbdi?style=flat-square&label=downloads&labelColor=1e1e2e&color=f9e2af" alt="downloads" /></a>
  <a href="https://github.com/JuhLabs/juhbdi"><img src="https://img.shields.io/github/stars/JuhLabs/juhbdi?style=flat-square&labelColor=1e1e2e&color=f2cdcd" alt="stars" /></a>
  <img src="https://img.shields.io/badge/670-green?style=flat-square&label=tests&labelColor=1e1e2e&color=a6e3a1" alt="tests" />
  <img src="https://img.shields.io/badge/0-green?style=flat-square&label=failures&labelColor=1e1e2e&color=a6e3a1" alt="failures" />
  <img src="https://img.shields.io/badge/TypeScript-blue?style=flat-square&label=lang&labelColor=1e1e2e&color=89b4fa" alt="typescript" />
  <img src="https://img.shields.io/badge/Bun-peach?style=flat-square&label=runtime&labelColor=1e1e2e&color=fab387" alt="bun" />
  <img src="https://img.shields.io/badge/MIT-mauve?style=flat-square&label=license&labelColor=1e1e2e&color=cba6f7" alt="license" />
  <a href="https://www.npmjs.com/package/@juhlabs/openclaw-bdi"><img src="https://img.shields.io/npm/v/@juhlabs/openclaw-bdi?style=flat-square&label=openclaw-bdi&labelColor=1e1e2e&color=f38ba8" alt="npm" /></a>
</p>

<h1 align="center">JuhBDI</h1>

<h4 align="center">Intent-driven autonomous development engine for Claude Code</h4>

<p align="center">
  <a href="https://www.juhlabs.com/juhbdi">Website</a> &middot;
  <a href="#install">Install</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#openclaw-integration">OpenClaw</a> &middot;
  <a href="#architecture">Architecture</a>
</p>

---

JuhBDI is a Claude Code plugin that transforms AI-assisted coding from prompt-and-pray into a governed development engine. Built on the **BDI (Belief-Desire-Intention) cognitive model**, it brings enterprise-grade governance, auditability, and intelligent automation to every task.

**The loop:** Define intent &rarr; Challenge assumptions &rarr; Plan waves &rarr; Execute in isolation &rarr; Learn from outcomes &rarr; Repeat.

```
User Intent ──→ Socratic Challenge ──→ Wave Planning ──→ Parallel Execution
                     │                      │                    │
              intent-spec.json      roadmap-intent.json    git worktrees
                     │                      │                    │
              HITL gates             dependency waves      task-executor agents
                     │                      │                    │
                     └──── decision-trail.log ◄──── audit everything ───┘
```

## Why JuhBDI

Most AI coding tools do what you tell them. JuhBDI does what you *mean*.

- **No more context loss** — persistent beliefs, memory, and state across sessions
- **No more cowboy AI** — every decision audited, every file governed, every task verified
- **No more wasted tokens** — 5-signal model routing sends tasks to the cheapest tier that works
- **No more manual retry** — 3-strike recovery with root cause analysis and alternative strategies
- **No more blind execution** — Socratic challenge catches bad ideas before they become bad code

## Install

### npm (all platforms)

```bash
npx juhbdi@latest
```

### macOS

```bash
curl -fsSL https://www.juhlabs.com/juhbdi/install.sh | bash -s -- --global
```

### Linux (Ubuntu/Debian/Fedora/Arch/WSL2)

```bash
# Ensure prerequisites
sudo apt install -y nodejs npm git    # Debian/Ubuntu

# Install JuhBDI
curl -fsSL https://www.juhlabs.com/juhbdi/install.sh | bash -s -- --global

# If CLI not on PATH after install
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

### Windows (WSL2)

```powershell
# Install WSL2 first (if not already installed)
wsl --install

# Then inside WSL2 (Ubuntu):
sudo apt install -y nodejs npm git
curl -fsSL https://www.juhlabs.com/juhbdi/install.sh | bash -s -- --global
```

### Interactive mode

```bash
curl -fsSL https://www.juhlabs.com/juhbdi/install.sh -o install.sh && bash install.sh
```

**Platforms:** macOS &middot; Linux &middot; Windows (WSL2)
**Requirements:** [Bun](https://bun.sh) (auto-installs if missing) &middot; [Node.js](https://nodejs.org) &middot; [Claude Code](https://claude.ai/code) &middot; Git

## Commands

| Command | Description |
|---------|-------------|
| `/juhbdi:init` | Initialize project — scans codebase, asks about goals, creates governance config |
| `/juhbdi:plan` | Interactive planning — discovers intent, analyzes code, generates wave-based roadmap |
| `/juhbdi:execute` | Governed execution loop with parallel worktrees, model routing, and auto-recovery |
| `/juhbdi:quick` | Fast-track simple tasks (skips full planning, keeps governance) |
| `/juhbdi:status` | Dashboard: progress, routing stats, cost intelligence, context health |
| `/juhbdi:cost` | Cost analysis: per-task spend, savings vs always-opus, tier distribution |
| `/juhbdi:trail` | Query the SHA-256 chained audit trail |
| `/juhbdi:audit` | Verify decision trail integrity (tamper detection) |
| `/juhbdi:reflect` | Extract learned principles from plan-vs-actual divergence |
| `/juhbdi:pause` | Pause execution with full context handoff |
| `/juhbdi:resume` | Resume from handoff in a new session |
| `/juhbdi:validate` | Validate roadmap structure and intent alignment |
| `/juhbdi:activate` | Inject JuhBDI activation into CLAUDE.md |

## How It Works

### The BDI Loop

JuhBDI implements a cognitive architecture where the AI maintains persistent **Beliefs** (what it knows about the project), **Desires** (what the user wants to achieve), and **Intentions** (the concrete plan to get there).

```
┌─────────────────────────────────────────────────────┐
│                    BDI Control Loop                 │
│                                                     │
│   Beliefs ──→ Desires ──→ Intentions ──→ Actions    │
│     ↑                                       │       │
│     └───────── observe outcomes ◄───────────┘       │
└─────────────────────────────────────────────────────┘
```

1. **Intent Specification** — You define goals, constraints, and tradeoff weights (`quality ↔ speed ↔ security`). JuhBDI challenges your request against these constraints through Socratic review.

2. **Wave Planning** — Tasks are decomposed into dependency-aware waves. Wave 1 is concrete; future work is a horizon sketch refined after each wave (receding-horizon planning).

3. **Parallel Execution** — Each task runs in an isolated git worktree with its own agent. Independent tasks execute simultaneously. Every file write passes through governance checks.

4. **Recovery** — Failed tasks get classified, diagnosed by a specialist agent, and retried with alternative strategies. Approaches that failed are banned from retries.

5. **Learning** — Successful patterns are stored in cross-linked memory (A-MEM). Future tasks get pre-loaded with relevant approaches, warnings, and principles.

### Model Routing (5-Signal Algorithm)

Every task is routed to the cheapest model tier that will succeed:

| Signal | What It Does |
|--------|-------------|
| **Override** | Respects explicit tier locks from the user |
| **Failure escalation** | Auto-bumps tier on retries |
| **Memory match** | Learns "this type of task passed with haiku" |
| **Structural complexity** | Multi-factor score: goal weight, verification type, scope, keywords |
| **Tradeoff bias** | Quality-biased projects shift toward opus; speed-biased toward haiku |

Trust scoring modulates confidence — unreliable tiers get less weight. Difficulty estimation enriches routing context.

### The Audit Trail

Every autonomous decision is logged to an append-only, SHA-256 chained trail:

```json
{
  "event_type": "routing",
  "description": "Routed task t3 to haiku",
  "reasoning": "{\"recommended_tier\":\"haiku\",\"confidence\":0.85}",
  "timestamp": "2026-03-08T12:00:00.000Z",
  "hash": "a1b2c3...",
  "prev_hash": "d4e5f6..."
}
```

## OpenClaw Integration

<p align="center">
  <strong>JuhBDI governance for OpenClaw agents</strong>
</p>

JuhBDI is available as an **OpenClaw plugin** that brings BDI governance to any OpenClaw agent, regardless of which LLM it runs on (Claude, GPT, Gemini, DeepSeek, etc.).

```bash
# Install via OpenClaw
openclaw plugins install @juhlabs/openclaw-bdi

# Or via npm
npm install @juhlabs/openclaw-bdi
```

### What it gives your OpenClaw agents

| Tool | Purpose |
|------|---------|
| `bdi_verify_intent` | Challenge risky or vague actions before execution |
| `bdi_recall` | Retrieve past experiences and learned principles |
| `bdi_log_decision` | SHA-256 hash-chained audit trail for every decision |
| `bdi_reflect` | Extract principles from plan-vs-actual divergence |
| `bdi_assess` | Estimate task difficulty and check model trust scores |

Plus **automatic hooks**: governance rules injected before every prompt, audit trail + trust scoring updated after every agent run.

**28 tests, 0 failures.** Works with all 13,700+ OpenClaw skills. See [`openclaw-bdi/`](openclaw-bdi/) for source.

## Agents

| Agent | Role |
|-------|------|
| **task-executor** | Executes tasks in isolated worktrees with TDD verification |
| **diagnostician** | Root-cause analysis on failures (no code access — pure analysis) |
| **strategist** | Alternative approach generation from banned approaches + memory |
| **librarian** | Compresses execution state, updates project beliefs |
| **belief-updater** | Propagates wave outcomes into project state between waves |

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| **statusline** | Notification | Catppuccin Mocha gradient context display |
| **context-monitor** | PostToolUse | 3-tier warnings + auto-handoff at critical context |
| **session-primer** | SessionStart | Surfaces pending tasks and relevant memory |
| **auto-trigger** | UserPromptSubmit | Suggests JuhBDI commands on natural language prompts |

## Architecture

```
src/
├── auto-trigger/     # Rule-based command suggestion scoring
├── bench/            # Performance benchmarks + routing simulation
├── cli-utils/        # 25+ CLI wrappers (thin shells over core logic)
├── core/             # Config, trail, tradeoffs, patterns
├── cost/             # Token cost estimation + reporting
├── integration/      # End-to-end integration tests
├── memory/           # A-MEM, tool bank, TNR, principles, speculation
├── parallel/         # Execution progress tracking
├── repomap/          # PageRank graph, semantic edges, knowledge extraction
├── routing/          # Trust scoring, difficulty estimation
├── schemas/          # Zod v4 schemas (11 modules)
├── trail/            # Audit trail filtering + formatting
└── quick/            # Quick mode preflight, governance, recording

openclaw-bdi/         # OpenClaw governance plugin
├── src/core/         # Portable BDI algorithms (adapted from src/)
├── src/tools/        # 5 agent tools
├── src/hooks/        # Governance injection + audit hooks
└── tests/            # 28 tests

commands/             # 13 slash commands
agents/               # 5 agent system prompts
hooks/                # Hook configuration
site/                 # Landing page (juhlabs.com/juhbdi)
.claude-plugin/
├── plugin.json       # Plugin manifest
└── hooks/            # 4 event hooks (.cjs)
```

## Benchmarks

| Metric | Value |
|--------|-------|
| Test suite | **642 tests, 0 failures** |
| Auto-trigger latency | **0.01ms** per evaluation |
| Trust scoring | **<0.001ms** per update |
| Routing savings | **~80% vs always-opus** |
| Competitive score | **27/27 capabilities** (next closest: 12) |
| Unique capabilities | **14** (zero competitors have them) |

## Built by

**Julian Hermstad** — [JuhLabs](https://www.juhlabs.com) &middot; [LinkedIn](https://www.linkedin.com/in/julian-h-7b1b07172) &middot; [GitHub](https://github.com/JuhLabs)

## License

MIT
