# WCL Analyzer

Data-driven raid prep and review pipeline built on the Warcraft Logs v2 GraphQL API. It produces:

- **Boss preps**: exact talent builds from top kills (Blizzard import strings), healing CD assignments, tank swap rules derived from taunt timelines, personal defensive plans per damage window
- **In-game distribution**: NSRT (Northern Sky Raid Tools) import strings so every raider gets personal TTS callouts at their assigned times, plus MRT display notes and Discord blocks — all generated from one plan JSON per boss
- **Post-night reviews**: plan-vs-actual compliance scoring (on time / drifted / missed / off-plan), death audits with cascade filtering and DR classification, tank swap checks, talent adoption tracking, week-over-week deltas

## Structure

| Path | What |
|------|------|
| `CLAUDE.md` | Project instructions: API access, roster, encounter IDs, processes, new-boss checklist |
| `AGENT-*.md` | Execution specs per task type (boss prep, plan review, defensive audit, prog night report, per-role player audits) |
| `scripts/` | Parameterized pipeline scripts — all import `scripts/wcl-lib.mjs` for auth/paging |
| `healing-cds/` | Published HTML reports + `plans/` (one plan JSON per boss, the source of truth for assignments) |
| `skills/wcl-raid-analysis/` | Claude Code skill — install to get the full pipeline as an agent skill |

## Setup

1. Node.js 20+ (`npm install` not required — no dependencies, pure fetch)
2. WCL v2 API credentials (create a client at https://www.warcraftlogs.com/api/clients):
   - `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt`
   - `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-secret.txt`
   - (or edit the `SECRETS` path in `scripts/wcl-lib.mjs`)

## Core commands

```bash
# Boss prep
node scripts/pull-top-talents.mjs <encounterID> [ourReport] [ourFightID]
node scripts/tank-swap-audit.mjs <reportCode> <fightID>
node scripts/nsrt-note.mjs healing-cds/plans/<boss>.json <recentReportCode>   # report code = mandatory roster preflight

# Post-night review
node scripts/plan-compliance.mjs healing-cds/plans/<boss>.json <reportCode>
node scripts/defensive-audit.mjs <reportCode> <encounterID> [bossKey]
```

## Using as a Claude Code skill

Copy `skills/wcl-raid-analysis/` into your project's `.claude/skills/` (or `~/.claude/skills/` for personal use). Then any request like "run the logs", "build a boss prep", or "review last night against the plan" routes through the specs in this repo. Work from the repo root so the specs and scripts resolve.

## Ground rules baked into the pipeline

- Derive everything from log data, never from theory — talent builds, CD usage, swap patterns all come from actual casts
- Death analysis without cascade filtering is wrong (first 2 deaths per pull are real, the rest are cascade)
- NSRT and MRT notes are different dialects — the generator emits both correctly; hand-mixing them fails silently in game
- Player tags must exact-match log names (accents included) or reminders silently never fire — the roster preflight enforces this
- Every CD chain is validated against base cooldowns before a note ships
