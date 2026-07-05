# WCL Analyzer — Warcraft Logs Healing CD Planner

## Owner
Josh Holyfield — plays Holy Paladin (McPounding-Proudmoore) and MW Monk.

## What This Is
A toolkit for pulling Warcraft Logs data via the v2 GraphQL API, analyzing raid healing performance, and building healing CD assignment sheets for mythic progression. This is NOT part of the FRIDAY system.

## Current Raid Team Healing Comp (updated 2026-07-04, Crown of the Cosmos prog)
- MW Monk — Senssay (Josh)
- Holy Paladin — Dueche
- Disc Priest — Voidheart (running Barrier as of 2026-07 talent swap; Barrier and Ultimate Penitence are the same talent row — never assign both)
- Resto Druid — Silencio
- Raid CDs: Darkness (Nucke, VDH, 3min), Rallying Cry (Starfighter, 3min), Vampiric Embrace (Nurnyx, SPriest, 2min), Anti-Magic Zone x3 (Unholyftw, Glazedwhole, Bebeshakur, 2min each)
- Comp varies by boss (3-heal vs 5-heal) — confirm roster against the actual log before building assignments

## WCL API
- **Endpoint:** https://www.warcraftlogs.com/api/v2/client (GraphQL)
- **Auth:** OAuth2 client credentials → https://www.warcraftlogs.com/oauth/token
- **Credentials:** `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt` and `warcraftlogs-v2-client-secret.txt`
- **Current tier:** Zone 46 (The Voidspire / Darkreach / MQD)
- **Encounter IDs:** 3176 Averzian, 3177 Vorasius, 3178 V&E, 3179 Salhadaar, 3180 LBV, 3181 Crown of the Cosmos, 3182 Belo'ren, 3183 Midnight Falls, 3306 Chimaerus
- **Difficulty:** 5 = Mythic, 4 = Heroic

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/wcl-lib.mjs` | **Shared lib — import this in every new script.** `getToken()`, `gql()`, `gqlPaged()`, `fmt()`, `lcName()`. Never re-implement auth or paging. |
| `scripts/defensive-audit.mjs` | Death/defensive audit with cascade filtering, DR classification, raid-CD coverage. See AGENT-DEFENSIVE-AUDIT.md. `node scripts/defensive-audit.mjs <report> <encounterID> [bossKey]` |
| `scripts/pull-top-talents.mjs` | Top-kill talent builds (Blizzard import strings via `talentImportCode`) + node-diff vs our roster. `node scripts/pull-top-talents.mjs <encounterID> [ourReport] [ourFightID]` |
| `scripts/tank-swap-audit.mjs` | Taunt timeline (pickup/swap/add-pickup) + swap triggers + tank-hit cadences. `node scripts/tank-swap-audit.mjs <report> <fightID>` |
| `scripts/nsrt-note.mjs` | Plan JSON → NSRT import string (per-player TTS) + MRT display note + Discord block. See AGENT-BOSS-PREP.md for dialect rules. Plans in `healing-cds/plans/` |
| `scripts/plan-compliance.mjs` | Plan vs actual: scores every assignment across a night (on time / drift / missed / off-plan), difficulty-filtered, with week-over-week deltas. See AGENT-PLAN-REVIEW.md. `node scripts/plan-compliance.mjs <plan.json> <report>` |
| `scripts/spell-cooldowns.mjs` | Base CD table + alias groups for plan validation. Extend when adding new CDs to plans. |
| `wcl.mjs` | Main CLI — `lookup`, `report`, `pull` commands. Has `getToken()` and `gql()` for API access. |
| `find-comps.mjs` | Searches WCL rankings for teams matching a specific healer comp |
| `pull-cds.mjs` | Pulls healer CD timings from matched teams and analyzes consensus |
| `pull-boss-abilities.mjs` | Pulls enemy cast/damage data for boss ability timelines |
| `boss-cd-correlation.mjs` | Correlates boss abilities with healing CDs across teams |
| `rotation-compare.mjs` | Compares individual player rotation against a top-ranked player |
| `rotation-compare-top5.mjs` | Compares against top 5 ranked players on a boss |
| `healer-cd-timeline.mjs` | Earlier version of CD timeline (has hardcoded data, superseded by boss-cd-correlation) |
| `analyze.mjs` | Basic multi-fight analysis for McPounding |
| `analyze-kills.mjs` | Detailed kills analysis with trends and wipe comparison |
| `spell-names.json` | 3,469 spell ID → name mappings from report masterData |

## Data
- `data/<reportCode>/` — pulled fight JSON files per report
- `data/<reportCode>/boss-abilities-fight<id>.json` — boss cast/damage data
- `data/comp-search/` — comp matching results and CD analysis
- `data/characters/` — character lookup data

## Healing CD Output
- `healing-cds/<boss>.html` — final CD sheet with methodology, findings, assignments, and Discord copy block

## Process for Building a CD Sheet (for any boss)

This is the workflow we follow. Each step builds on the last.

### 1. Pull Boss Ability Data
Query WCL for enemy casts + damage on 3-5 kills of the target boss. Boss abilities follow fixed scripts — same ability, same second, every pull. Identify:
- Raid-wide damage events (what needs CDs)
- Damage amounts and durations per window
- The repeating cycle/phase structure
- Which mechanics are positioning/tank vs healing checks

### 2. Cross-Reference with Guides
Check wowhead/icy-veins/method for mechanic descriptions to understand WHAT each ability actually is in-game (orbs, beams, DoTs, soaks). The logs tell you when and how much; the guides tell you what it looks like and how to handle it mechanically.

### 3. Find Teams with Matching Healer Comp
Search WCL rankings starting with the rarest spec in the comp (e.g., RSham). For each ranked player, check if their report contains the other required specs. Filter to exact or near-exact comp matches. Aim for 5+ teams.

### 4. Pull All Healers' CD Timings
For each matching team, pull cast/buff events for every healer. Extract major CDs only (60s+ cooldown). Map each CD to the boss ability it was covering based on timing proximity.

### 5. Find Consensus
For each boss damage event, show which CDs all teams used. Look for patterns where 3/5+ teams agree. These are the non-negotiable assignments. Where teams disagree, note both approaches.

### 6. Build the Assignment Sheet
Assign CDs to damage events following consensus patterns. Group by the fight's natural rhythm (e.g., "orbs → orbs → beams" for Salhadaar, not raw timestamps).

### 7. Verify All CD Timers
Check every assignment against the actual cooldown duration. If a CD is assigned to a window where it's still on cooldown from a previous use, it's wrong. Fix conflicts by swapping assignments or moving CDs to adjacent windows.

### 8. Format Output
- HTML file in `healing-cds/` with dark theme, methodology, findings, and assignments
- Discord copy/paste block with the clean CD sheet
- Use the boss's mechanic names (e.g., "beams" not "transitions", "orbs" not "Dark Radiation windows")

## New Boss Checklist (first contact with a boss we have no plan for)
Every file that needs an entry before the pipeline works end-to-end:
1. `scripts/defensive-audit.mjs` → `BOSS_CONFIGS.<bossKey>` (phases + damage windows — derive from a damage-taken timeline on our first pulls or a top kill)
2. `healing-cds/plans/<boss>-<difficulty>.json` (plan JSON; start from the CD sheet process + AGENT-BOSS-PREP step 0 standards)
3. CD sheet if comp-consensus research is wanted: `find-comps.mjs` TARGET_SPECS is stale (last tier's HPal/RSham/MW/PEvo comp) — update to the current comp before using; `pull-cds.mjs` / `pull-boss-abilities.mjs` need their per-boss sets hand-edited
4. `healing-cds/<boss>.html` prep page + `healing-cds/index.html` card
5. NSRT note: `node scripts/nsrt-note.mjs <plan> <recentReport>` (roster preflight mandatory)

## Healing CD Definitions

### Holy Paladin
- Avenging Wrath (31884) — 2min, throughput
- Aura Mastery (31821) — 3min, raid-wide DR
- Blessing of Sacrifice (6940) — 2min, external (REACTIVE, don't pre-assign)
- Lay on Hands (633) — 10min, emergency (REACTIVE, don't pre-assign)
- Divine Protection (498) — 1min, personal

### Resto Shaman
- Spirit Link Totem (98008) — 3min, HP equalization + DR
- Ascendance (114052) — 3min, major throughput
- NOTE: Healing Tide Totem is REMOVED from the game in TWW. Do NOT reference it. Ascendance is the only option on that row.
- NOTE: Ancestral Guidance removed from game. Do NOT include in CD sheets.

### MW Monk
- Revival (115310/388615) — 3min, instant raid heal + dispel
- Invoke Yu'lon (322118) / Chi-Ji (325197) — 2min, throughput (data shows ~2:05 gaps, NOT 3min)
- Life Cocoon (116849) — 2min, single-target absorb (REACTIVE)
- Celestial Conduit (443028) — 90s, burst AoE

### Preservation Evoker
- Rewind (363534) — 3min, raid-wide reverse healing (data shows ~3:00 min gaps, NOT 4min)
- Dream Flight (359816) — 2min, fly-through raid heal
- Tip the Scales (370553) — ~90s, instant empower cast (data shows ~1:30 gaps)
- NOTE: Emerald Communion NOT used by top teams (0/5 on V&E). Do not include in CD sheets unless data shows otherwise.
- NOTE: Stasis NOT used by top teams (0/5 on V&E). Check actual casts before including.

### Raid CDs (non-healer)
- Anti-Magic Zone (DK) — 2min, raid-wide magic DR
- Darkness (DH) — 3min, 20% raid avoidance
- Rallying Cry (Warrior) — 3min, 15% max HP
- Vampiric Embrace (Shadow Priest) — 2min, damage-to-healing

## Publishing (mandatory for team-facing output)
- Every deliverable for the team = HTML page in `healing-cds/` + card in `healing-cds/index.html` + Discord copy block inside the page.
- Pages are served at `friday.joshholyfield.com/raid/<slug>` by `friday-server/src/routes/raid.js`. A report that exists only in chat or a scratchpad was not delivered.
- **Filenames: lowercase, accents stripped** (`lcName()` in scripts/wcl-lib.mjs). `voidhéart` in a filename 404s at /raid/.
- Log page slugs use the raid night's date **from the report metadata** (`log-YYYYMMDD-...`), not today's date or a guess from "last night."
- Discord posts: no markdown tables (use code blocks), real line breaks.
- Analysis scripts go in `scripts/` parameterized by report code — never the session scratchpad, never new `tmp-*.mjs` in the project root.

## Agent Specs (read the one matching the task before starting)
- `AGENT-PROG-RAID-ANALYZER.md` — raid-level prog night report (no kill)
- `AGENT-DEFENSIVE-AUDIT.md` — defensive usage / death audit (cascade filtering, DR classification, raid-CD coverage — all mandatory)
- `AGENT-BOSS-PREP.md` — full boss prep: talents + personal CDs + healing CDs + tank swaps + NSRT/MRT distribution (two note dialects — read the gotcha tables before generating notes)
- `AGENT-PLAN-REVIEW.md` — post-night review vs the plan JSON: compliance scoring, three-bucket findings (plan wrong / execution wrong / roster changed), regenerate NSRT after plan edits
- `AGENT-DPS-ANALYZER.md` / `AGENT-HEALER-ANALYZER.md` / `AGENT-TANK-ANALYZER.md` — individual player audits

## Important Notes
- **Divine Toll is rotational**, not a healing CD. Don't put it in CD sheets.
- **Lay on Hands, BoSac, Life Cocoon are reactive** — don't pre-assign to specific windows.
- Boss abilities are on fixed timers. Same times every pull. Use this to plan precisely.
- **Derive CDs from data, not theory.** Talent trees have choice nodes — don't assume a spec has all CDs simultaneously. Look at what top players actually cast. Confirm with team members what they're running.
- When the team calls something by a mechanic name (e.g., "beams", "orbs"), use that name in the output, not the spell name.
- Always verify CD timers before finalizing. A CD assigned where it's still on cooldown is worse than no assignment.
- The HTML output goes in `healing-cds/`. One file per boss.

## Completed Boss Plans
- **Mythic Salhadaar** — `healing-cds/mythic-salhadaar.html` — HPal/RSham/MW/PEvo, 13 matching teams found, 5 analyzed
- **Mythic Vaelgor & Ezzorak** — `healing-cds/mythic-ve.html` — HPal/RSham/MW/PEvo, 18 matching teams found, 5 analyzed. Includes raid reference section for whole team.
