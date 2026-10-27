# WCL Analyzer — Warcraft Logs Healing CD Planner

## Owner
Josh Holyfield — mains Holy Priest **Sènnsei (Area-52)** as of Midnight Season 2 (2026-08). Previously Holy Paladin (McPounding-Proudmoore) and MW Monk (Senssay).

## What This Is
A toolkit for pulling Warcraft Logs data via the v2 GraphQL API, analyzing raid healing performance, and building healing CD assignment sheets for mythic progression. This is NOT part of the FRIDAY system.

## Current Raid Team Healing Comp (updated 2026-08-26, Venomous Abyss heroic)
- Holy Priest — Sènnsei (Josh)
- Holy Paladin — Dueche
- Holy Paladin — Zinkks
- Resto Shaman — Klune
- Raid CDs seen on this roster: Darkness (Nucke, VDH, 3min), Rallying Cry (Starfighter, 3min), Vampiric Embrace (Nurnyx, SPriest, 2min), Anti-Magic Zone (Unholyftw / Glazedwhole / Loaksdk, 2min each)
- Comp varies by boss — confirm roster against the actual log before building assignments

## Prior Comp (Voidspire tier, 2026-07)
- MW Monk Senssay (Josh), HPal Dueche, Disc Voidheart (Barrier build), RDruid Silencio

## WCL API
- **Endpoint:** https://www.warcraftlogs.com/api/v2/client (GraphQL)
- **Auth:** OAuth2 client credentials → https://www.warcraftlogs.com/oauth/token
- **Credentials:** `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt` and `warcraftlogs-v2-client-secret.txt`
- **Current tier:** Zone 53 (The Venomous Abyss, Midnight Season 2)
- **Encounter IDs:** 3470 Nek'zali the Soulcoiler, 3445 Entombed Sentinels, 3497 The Lost Explorers, 3455 Vashnik the Malignant, 3420 Sszorak, 3421 The Twin Fangs, 3379 Nymrissa Wavecaller (world boss, appears in raid logs). Coiled Altar + Ula'tek IDs unknown (not yet pulled).
- **Previous tier:** Zone 46 (Voidspire) — 3176 Averzian, 3177 Vorasius, 3178 V&E, 3179 Salhadaar, 3180 LBV, 3181 Crown, 3182 Belo'ren, 3183 Midnight Falls, 3306 Chimaerus
- **Difficulty:** 5 = Mythic, 4 = Heroic. Mythic+ keystone fights are difficulty 10 (zone 55 = Mythic+ Season 2; one fight per key with `keystoneLevel`, bosses and trash as `dungeonPulls`). M+ encounter ids seen: 12825 Den of Nalorakk, 61877 Temple of Sethraliss, 12923 Voidscar Arena. M+ rankings: `worldData.encounter(id).characterRankings(className, specName, metric: dps, difficulty: 10[, bracket: <keyLevel>])`.
- **Events paging gotcha (proven 2026-10-22):** `events(fightIDs, startTime)` WITHOUT `endTime` returns an EMPTY second page, so anything over 10,000 events of one type is silently truncated (a 23-minute key lost its last six minutes of buff events). Always pass `endTime: <fight.endTime>` with `startTime` when paging. `gqlPaged` leaves the query to you, so put it in the query you build.
- **`dataType: DamageTaken` filters by `sourceID` = the actor TAKING the damage** (`targetID` returns almost nothing).
- **`dataType: Debuffs` with `sourceID` likewise filters by the TARGET** (it returns the debuffs ON that player). The debuffs a player put on enemies come from `dataType: Debuffs, hostilityType: Enemies` with the player's id read from each event's `sourceID`; ww-conduit-pull.mjs does that and keeps only the player's own (`fight<N>-debuffs.json`).
- **Mythic+ reference pools:** `characterRankings(..., difficulty: 10, bracket: <keyLevel>)` returns players at that key level or above; a report may hold 20+ keys of one pusher (Kelimdall's HqaPZXckvydVnz1m has 22), so pull without `--fight` to get a whole reference set in one go.
- **`classResources` on cast events only carries the resource the ability costs** (energy for Tiger Palm, chi for Fists of Fury); energy at a chi spender is not in the log.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/wcl-lib.mjs` | **Shared lib — import this in every new script.** `getToken()`, `gql()`, `gqlPaged()`, `fmt()`, `lcName()`. Never re-implement auth or paging. |
| `scripts/healer-pull.mjs` | Pull + cache all events for a healer audit (kill fights full, wipes light, per-fight tables, CombatantInfo, team healer casts). `node scripts/healer-pull.mjs <report> <playerName> [difficulty=4]` → `data/<report>/audit/` |
| `scripts/top-priest-refs.mjs` | Comp-matched top-ranked reference finder + full event pull of the #1 (any healer class/spec despite the name). `node scripts/top-priest-refs.mjs <encounterID> <Class> <Spec> [difficulty=4] [healerCount=4]` → `data/refs/` |
| `scripts/defensive-audit.mjs` | Death/defensive audit with cascade filtering, DR classification, raid-CD coverage. See AGENT-DEFENSIVE-AUDIT.md. `node scripts/defensive-audit.mjs <report> <encounterID> [bossKey]` |
| `scripts/pull-top-talents.mjs` | Top-kill talent builds (Blizzard import strings via `talentImportCode`) + node-diff vs our roster. `node scripts/pull-top-talents.mjs <encounterID> [ourReport] [ourFightID]` |
| `scripts/tank-swap-audit.mjs` | Taunt timeline (pickup/swap/add-pickup) + swap triggers + tank-hit cadences. `node scripts/tank-swap-audit.mjs <report> <fightID>` |
| `scripts/nsrt-note.mjs` | Plan JSON → NSRT import string (per-player TTS) + MRT display note + Discord block. See AGENT-BOSS-PREP.md for dialect rules. Plans in `healing-cds/plans/` |
| `scripts/plan-compliance.mjs` | Plan vs actual: scores every assignment across a night (on time / drift / missed / off-plan), difficulty-filtered, with week-over-week deltas. See AGENT-PLAN-REVIEW.md. `node scripts/plan-compliance.mjs <plan.json> <report>` |
| `scripts/spell-cooldowns.mjs` | Base CD table + alias groups for plan validation. Extend when adding new CDs to plans. |
| `scripts/boss-timeline.mjs` | New-boss discovery: damage-taken timeline in 10s buckets, flags damage windows and phase lulls, prints a paste-ready BOSS_CONFIGS entry. `node scripts/boss-timeline.mjs <report> <fightID>` |
| `scripts/ww-conduit-pull.mjs` | Windwalker M+ data pull (casts with resources, buffs on the player, damage done/taken, resource changes, deaths, interrupts, CombatantInfo + talent code) for every keystone fight the player is in. `node scripts/ww-conduit-pull.mjs <report> [player] [--fight <id>]` → `data/<report>/ww/<player>/` |
| `scripts/ww-conduit-audit.mjs` | Windwalker Conduit rotational audit against `guides/ww-conduit-s2-rules.md`: 4pc consumer per Fists of Fury, FoF tick clipping with damage-loss estimate, HotJS windows and WDP/Unity overlaps, Conduit channel/cancel/timing, burst-window template checks, Zenith Stomp charge use, mastery breaks, energy capping, proc overcap, deaths with defensive availability, gear/stats/consumables, KPIs. Writes `audit.json` and a cast-by-cast `fight<id>-sequence.txt`. `node scripts/ww-conduit-audit.mjs <report> <player>`; `--compare <report>:<player> ...` prints KPIs side by side. |
| `scripts/ww-top-refs.mjs` | Top-ranked M+ reference finder for a dungeon encounter id (optional `--bracket <keyLevel>`; `--class Paladin --spec Retribution --dir ret` for other specs, default Monk/Windwalker/ww), `--pull` runs ww-conduit-pull on each so the audit grades the reference with the same ruler. `node scripts/ww-top-refs.mjs <encounterID> [--bracket 16] [--top 1] [--pull]` |
| `scripts/ret-audit.mjs` | Retribution Paladin (Herald of the Sun) M+ rotational audit against `guides/ret-s2-rules.md`: Holy Power model anchored on spender casts with waste attributed to the press that caused it, Wake/Divine Toll overcap, Divine Purpose/Art of War/Dawnlight/Divine Arbiter/Empyrean Legacy procs, Divine Storm vs Final Verdict by melee-range target count, Judgment and Expurgation uptime on bosses, Wings windows (ES/Wake/DT/potion/trinket offsets), deaths with defensive availability, gear and talents, KPIs; writes audit.json, fight<N>-sequence.txt and fight<N>-presses.json; `--compare` prints KPIs side by side. Pull first with `node scripts/ww-conduit-pull.mjs <report> <player> --dir ret`. |
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
- **The `/raid/` route is gone.** friday-server stopped serving `healing-cds/` on 2026-09-25 (owner order: "Delete the raid stuff"); `friday.joshholyfield.com/raid/<slug>` returns the platform 404. Pages still live in `healing-cds/` as the source of record; to hand one to the owner or the team, publish the file with the Artifact tool (private link) or open it from disk. `scripts/ww-conduit-report.mjs` writes its page in the Artifact fragment format (title + style + content, no html/body wrapper) for that reason.
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
