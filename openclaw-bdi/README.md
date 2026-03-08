# @juhlabs/openclaw-bdi

BDI governance plugin for [OpenClaw](https://openclaw.ai) agents. Makes any OpenClaw skill smarter with intent verification, audit trails, memory, and trust scoring.

Built by [JuhLabs](https://www.juhlabs.com/juhbdi).

## Install

```bash
openclaw plugins install @juhlabs/openclaw-bdi
```

Or via npm:

```bash
npm install @juhlabs/openclaw-bdi
```

## What it gives your agents

| Tool | Purpose |
|------|---------|
| `bdi_verify_intent` | Challenge risky or vague actions before execution |
| `bdi_recall` | Retrieve past experiences and learned principles |
| `bdi_log_decision` | SHA-256 hash-chained audit trail for every decision |
| `bdi_reflect` | Extract principles from plan-vs-actual divergence |
| `bdi_assess` | Estimate task difficulty and check model trust scores |

Plus **automatic hooks**: governance rules injected before every prompt, audit trail + trust scoring updated after every agent run.

## How it works

```
User Intent ──→ Verify Intent ──→ Recall Memory ──→ Execute
                     │                  │               │
              risk assessment    past approaches    audit logged
                     │                  │               │
              block if risky    pre-load wisdom    trust updated
                     │                  │               │
                     └──── Reflect on outcomes ◄────────┘
```

- **Intent Verification** — Flags destructive actions, credential operations, and complex tasks before execution
- **Memory Recall** — Retrieves relevant past experiences with speculation from failures
- **Audit Trail** — SHA-256 hash-chained, append-only, tamper-detectable decision log
- **Trust Scoring** — Tracks agent reliability per model tier, modulates routing confidence
- **Principle Extraction** — Learns from plan-vs-actual divergence, applies to future tasks

## Compatible with

Works with all 13,700+ OpenClaw skills. Any LLM — Claude, GPT, Gemini, DeepSeek, and more.

## Stats

- **28 tests, 0 failures**
- 5 tools, 2 hooks, 7 core modules
- Zero external dependencies beyond zod

## License

MIT
