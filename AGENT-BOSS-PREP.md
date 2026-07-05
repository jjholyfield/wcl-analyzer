# WCL Boss Prep — Agent Execution Spec

You are producing a complete boss prep package for the raid team: exact talents, personal cooldown timings, healing CD assignments, and tank swap plan — distributed so every raider gets personal in-game reminders with TTS via NSRT.

## When to Use This Spec

- "Boss prep" / "prep package" for any boss
- "Give people the exact talents / when to pop CDs / when to taunt"
- Upgrading an existing CD sheet into a full prep with in-game distribution

## Inputs

- Encounter ID (see CLAUDE.md list), our most recent report code + best/deepest fight ID
- The existing healing CD sheet for the boss if one exists (`healing-cds/<boss>.html`)

## Pipeline

### 0. Roster + raid standards (before anything else)
- Confirm the actual roster from `playerDetails`/`masterData` on the latest log — comps change per boss, tanks change per pull.
- Confirm with the raid lead and add as plan lines where timed: **Bloodlust timing** (it is just a timed reminder — the pipeline supports it verbatim), **brez priority**, **interrupt/dispel assignments** (boss-conditional, usually text on the prep page not timers).
- Consumables coverage (flask/food/rune/pot from CombatantInfo) is checked at review time — AGENT-PLAN-REVIEW.md.

### 1. Talents — `scripts/pull-top-talents.mjs <encounterID> <ourReport> <ourFightID>`
Pulls top-5 mythic kills (speed rankings), extracts every player's **Blizzard talent import string** (`talentImportCode` — paste-ready, no conversion), groups by spec, and diffs our roster node-by-node against the best same-spec player.
- Present per player: node diff count + the top build's import string.
- **Do not auto-prescribe.** Small diffs (< ~10 nodes) are normal variance/preference. Large diffs (30+) usually mean a different hero tree or build archetype — flag those for a conversation, note what the top build gains, and let the player/RL decide. Our comp and assignments differ from top comps; a healer talent that fits their comp may be wrong for ours.
- No same-spec player in top 5? Pull more pages/kills before saying "no reference."

### 2. Tank swaps — `scripts/tank-swap-audit.mjs <topKillReport> <fightID>` (and again on our best pull)
Produces the taunt timeline (PICKUP / SWAP / ADD PICKUP), the boss abilities that precede each swap, and tank-targeted ability cadences. Derive the swap RULE from the pattern (e.g. Crown P2: off-tank taunts after each Rift Slash → Sting x2 → Rift Slash combo; P3: swap every 1-2 Voidstalker Stings). Compare our pull's timeline to the top kill's and call out deviations. Swap rules go in the prep page as text — they are event-driven, do not put them on note timers.

### 3. Healing CDs — existing CD sheet process (CLAUDE.md § "Process for Building a CD Sheet")
Reuse the boss's existing verified rotation if one exists. Verify every CD timer (walk each CD through the fight; flag zero-margin chains).

### 4. Personal defensives — damage windows from the boss config (`scripts/defensive-audit.mjs` BOSS_CONFIGS)
For each major damage window, add tag-targeted reminders: role-wide or everyone `text:` reminders for personals, using the DR classification from AGENT-DEFENSIVE-AUDIT.md (never tell a Shadow/Disc Priest to press DR they don't have).

### 5. Generate distribution — `scripts/nsrt-note.mjs healing-cds/plans/<boss>-<difficulty>.json <recentReportCode>`
**The report-code argument is MANDATORY before shipping** — it is the roster preflight: every player tag exact-matched (accents included) against log actor names. A mismatched tag silently never fires in game (this caught Voidhéart and Sìlencio on the first Crown plan). The generator also validates every CD chain against base cooldowns (`scripts/spell-cooldowns.mjs`): impossible chains are a hard error, zero-margin chains are flagged and belong on the prep page as "press ON the callout."

**Mid-night sub procedure (30 seconds):** edit the player names in the plan JSON → rerun `nsrt-note.mjs` with the current night's report code → raid leader reimports via `/ns`. Reminders follow the assignment, not the person. For calls that must survive any roster (transition personals), prefer role tags (`tag:healer`, `tag:everyone`) over names.
Write the plan JSON (see script header for shape), generate:
- **NSRT import string** — per-player TTS reminders (`/ns > Shared Notes > Import`, auto-shares to raid on ready check)
- **MRT display note** — classic brace block for the note frame
- **Discord block**

**Dialect rules (violating these = silent failure in game):**
- NSRT does NOT parse `{time:m:ss}` brace syntax. NSRT lines are semicolon `key:value`, time in **plain seconds**, and the `EncounterID:...;Name:...;Difficulty:...` header line must come first or nothing fires.
- `tag:` = targeting: character name without realm (spelling must match exactly or the reminder silently drops), `tank`/`healer`/`damager`, `groupN`, `melee`/`ranged`, `everyone`. TTS fires only for matching players.
- We emit `ph:1` pull-relative times (our boss timelines are stable across pulls). `ph:N` phase-relative needs NSRT's per-boss module — verify before using.
- TTS speaks 5s early by default; `countdown:N` adds a spoken countdown; TTSTimer/dur are clamped to the line's time.

### 6. Publish
One prep page per boss in `healing-cds/` (or update the existing boss page) with sections: **Talents** (per-player import strings + diff notes), **Tank Plan** (swap rule + timeline evidence), **Healing CDs**, **Personal Defensives by window**, **Import strings** (NSRT + MRT in copy blocks), **Discord block**. Index card. Same publishing rules as everything else (wcl-raid-analysis skill).

## Verified API Gotchas (do not rediscover these)

| Gotcha | Fact |
|---|---|
| Monk Provoke ID | Cast events log **115546**, never 116189 |
| Death Grip 49576 | Blood DK add-pickup tool, not a boss-swap taunt; DPS DKs also cast it — filter to tank sourceIDs |
| `filterExpression "target.id in (...)"` | Uses GAME IDs, not report actor IDs — silently returns zero for players; filter targets client-side |
| Tanks | Always from `playerDetails(fightIDs)` per fight — rosters change pull to pull (our June 30 log: Nucke + Glazedwhole, not Moistbear) |
| `talentImportCode(actorID)` | Per-FIGHT (captures mid-night talent swaps); batch all players via GraphQL aliases in one request |
| Summary table `combatantInfo.talents` | Empty legacy array — use `talentTree` or `talentImportCode` |
| Same-spec import strings | Share a long common prefix — diff `talentTree` node maps, never the strings |
| Environment casts | Exclude source "Environment" from swap-trigger candidates |
| `fightRankings` | JSON scalar — access `.rankings[].report.{code,fightID}` directly; costs API points |

## Common Mistakes

| Mistake | Reality |
|---|---|
| Prescribing top talents blind | Top comps differ from ours; large diffs are usually hero-tree archetypes, not errors. Present, flag, discuss. |
| Taunt reminders on note timers | Swaps are event-driven (combos/stacks), not clock-driven. Swap rules are text; timers drift. |
| Emitting brace syntax for NSRT | NSRT ignores it entirely — nothing fires, no error. Two dialects, never mix. |
| `time:1:00` in NSRT lines | NSRT time is plain seconds (`time:60`). m:ss belongs to the brace dialect only. |
| Misspelled/realm-suffixed names in `tag:` | Reminder silently never fires for that player. |
