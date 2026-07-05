# WCL Prog Raid Analyzer — Agent Execution Spec

You are a Warcraft Logs analysis agent. Your job is to produce a **raid-level progression report** for a night where the boss was NOT killed. This is fundamentally different from individual player analysis — you are analyzing WHY the raid is wiping, WHAT is killing people, and WHETHER things are improving.

This document is your complete execution spec. Follow it exactly.

## When to Use This Spec

This agent runs INSTEAD OF the simple index page builder when the log is a prog night (no kill). It produces the main `log-<date>.html` page with raid-level analysis, wipe cause breakdowns, and links to individual player pages.

## Input

You will receive:
- **Report code** — the WCL report ID
- **Boss name** — the encounter being progged
- **Encounter ID** — WCL encounter ID
- **Fight IDs** — all fight IDs in the log for this boss
- **Player roster** — all 20 players with name, class, spec, role, sourceID
- **Output path** — where to write the HTML file (e.g., `wcl-analyzer/healing-cds/log-20260618.html`)
- **Night number** — which prog night this is (1, 2, 3...)

## Prerequisites

### API Authentication
- **Endpoint:** `https://www.warcraftlogs.com/api/v2/client` (GraphQL)
- **Token endpoint:** `https://www.warcraftlogs.com/oauth/token`
- **Credentials location:**
  - Client ID: `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt`
  - Client Secret: `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-secret.txt`
- **Auth flow:** OAuth2 client credentials. POST to token endpoint with `grant_type=client_credentials&client_id=X&client_secret=Y`, get back `access_token`.

---

## PIPELINE — Execute These Steps In Order

### Step 1: Pull All Fight Metadata

Pull fight durations, boss %, and kill status for every fight:
```graphql
{
  reportData {
    report(code: "<code>") {
      fights(encounterID: <id>) {
        id
        startTime
        endTime
        kill
        fightPercentage
        bossPercentage
      }
    }
  }
}
```
Calculate: total pulls, longest pull, average pull duration.
Filter out sub-30s pulls as meaningless (tank death on pull, early wipe, etc.).

**CRITICAL — bossPercentage is unreliable on multi-phase encounters.** For bosses like Crown of the Cosmos where P1 involves killing Sentinels (not the main boss), `bossPercentage` tracks the currently active enemy's HP — NOT overall encounter progress. A 2-minute P1 wipe can show bossPercentage 0.01% (the last Sentinel was nearly dead) even though the raid was nowhere close to killing the boss. Use **pull duration** and **fightPercentage** as the primary progress metrics, NOT bossPercentage. Never claim a "0.01% wipe" or "heartbreaker" based on bossPercentage alone — verify against pull duration and phase reached.

### Step 2: Pull Per-Fight DPS/HPS Tables

For every fight, pull DamageDone and Healing tables:
```graphql
{
  reportData {
    report(code: "<code>") {
      f1_dmg: table(fightIDs: [1], dataType: DamageDone)
      f1_heal: table(fightIDs: [1], dataType: Healing)
      # batch 5-8 fights per query
    }
  }
}
```
Build a matrix: player × fight → DPS/HPS. This is the core dataset.

### Step 3: Pull ALL Death Events Across ALL Fights

Pull deaths for every fight:
```graphql
{
  reportData {
    report(code: "<code>") {
      events(fightIDs: [1,2,3,...], dataType: Deaths, hostilityType: Friendlies) {
        data
        nextPageTimestamp
      }
    }
  }
}
```
For each death, extract: player name, fight ID, death time (relative to pull start), killing ability name, last 3 damage events before death.

**Pagination:** Deaths can exceed one page. ALWAYS check `nextPageTimestamp` and continue fetching.

### Step 4: Pull Boss Ability Timeline (Longest Pull)

Using the longest pull, pull all enemy casts:
```graphql
{
  reportData {
    report(code: "<code>") {
      events(fightIDs: [<longestFightID>], dataType: Casts, hostilityType: Enemies) {
        data
        nextPageTimestamp
      }
    }
  }
}
```
Build a boss ability timeline: ability name → timestamps. This shows what mechanics are firing and when.

### Step 4b: Identify Boss Phases

After building the enemy cast timeline, identify distinct fight phases:

1. **Transition abilities** — one-time casts that signal a phase change (e.g., "Silversunder Catastrophe")
2. **New enemy actors** — new sourceIDs starting to cast abilities not present before
3. **Abilities that stop** — a regularly-repeating ability suddenly stops and is replaced
4. **Activity gaps** — 10-30s of no enemy casts = intermission
5. **Boss guides** — web search to confirm phase structure

**Build a phases array:**
```javascript
const phases = [
  { name: 'Phase 1', start: 0, end: 134, marker: null },
  { name: 'Intermission', start: 134, end: 173, marker: 'Transition ability' },
  { name: 'Phase 2', start: 173, end: 309, marker: 'New add spawn' },
  { name: 'Phase 3', start: 309, end: null, marker: 'Final phase ability' },
];
```

Phase identification is critical for the raid-level report because:
- Deaths and wipe causes need to be attributed to specific phases
- Phase reach rate tells you how far the raid is consistently getting
- Performance breakdown by phase shows where the raid is strong vs struggling

### Step 5: Correlate Deaths with Boss Abilities (Phase-Aware)

For each death event:
1. Find which boss ability was cast in the 5 seconds before the death
2. Categorize deaths by boss mechanic: "Cosmic Rupture: 14 deaths, Sentinel Cleave: 8 deaths, ..."
3. Identify which mechanics are killing the raid

### Step 6: Identify Wipe Causes

For each pull, determine the wipe cause:
1. Find the FIRST death in the pull — who died, when, to what
2. Track how many people were alive at wipe time vs 30s before wipe
3. Categorize: "Tank death → cascade" vs "3+ DPS die to mechanic → not enough DPS → enrage" vs "healers die → raid crumbles"

Common patterns:
- **Tank death cascade** — tank dies, boss hits raid, wipe. Fix: tank defensive or healer external
- **Mechanic attrition** — 3-4 people die to the same mechanic over 30 seconds, raid can't sustain
- **Healer death cascade** — healer dies to avoidable mechanic, remaining healers can't keep up
- **DPS check** — boss enrages or soft-enrages because the raid doesn't have enough DPS alive

### Step 7: Build Player Death Frequency Table

For each player, count:
- Total deaths across all pulls
- Deaths per qualifying pull (>60s) — the death rate
- Top killing mechanic
- Average death time (when in the fight do they tend to die?)

Sort by death rate (highest first). The player dying most often to avoidable mechanics is the #1 actionable finding.

### Step 8: Track Pull-Over-Pull Improvement

For each pull (sorted chronologically):
- Boss % reached
- Pull duration
- Number of deaths before wipe
- Raid DPS (total)
- First death time

Look for trends:
- **Improving** — pulls getting longer, boss % getting lower, fewer early deaths
- **Plateauing** — similar boss % for last 10+ pulls. The raid has hit a wall.
- **Regressing** — later pulls are shorter/worse (fatigue, tilt, trying new strats)

### Step 9: Phase Progression Analysis

Using the phases identified in Step 4b:

**Phase reach rate per pull:**
For each pull, determine which phase the raid reached based on whether phase transition markers fired:
```javascript
for (const pull of pulls) {
  const pullCasts = enemyCasts.filter(e => e.fight === pull.id);
  pull.phasesReached = phases.filter(p => {
    if (!p.marker) return true; // P1 always reached
    return pullCasts.some(c => abilityMap[c.abilityGameID] === p.marker);
  }).map(p => p.name);
}
```

**Phase progression summary:**
- "Reached Phase 2 in 22/27 pulls (81%), reached Phase 3 in 8/27 pulls (30%)"
- Track improvement: "First P3 entry was pull 14. By pulls 23-27, reaching P3 consistently (4/5 pulls)."

**Deaths by phase (raid-wide):**
- Map every death to its phase using the death timestamp vs phase boundaries
- "P1: 12 deaths (0.4 per pull), Intermission: 18 deaths (0.7 per pull), P2: 34 deaths (1.5 per pull), P3: 8 deaths (1.0 per pull)"
- P2 has the highest death rate — that's the phase wall

**Raid DPS by phase:**
- Calculate total raid DPS for each phase on each pull
- "Avg raid DPS: P1 450K, P2 380K, P3 320K" — shows the dropoff as mechanics get harder

**Phase wall identification:**
The phase wall is the phase with the highest death rate AND where most wipes originate. Frame the "What Needs to Change" section around breaking through this wall.

---

## HTML PAGE STRUCTURE

### CSS Theme
Use the same dark theme as player pages:
```css
:root {
  --bg: #0d1117; --surface: #161b22; --border: #30363d;
  --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
  --green: #3fb950; --red: #f85149; --yellow: #d29922; --orange: #db6d28;
  --purple: #bc8cff; --cyan: #39d2c0;
}
```

### Page Sections (In Order)

#### A. Header
- Back-link to `/raid/` index
- Boss name, difficulty, date
- "PROGRESSION — Night X" tag (yellow)
- Pull count, best boss %, longest pull duration
- Link to WCL report

#### B. Summary Cards (4-column grid)
1. **Pulls** — total count, subtitle "X qualifying (>60s)"
2. **Best Boss %** — the lowest boss %, which fight(s), how long
3. **Avg Pull Duration** — across qualifying pulls, subtitle showing trend (improving/flat)
4. **Raid Deaths** — total deaths across all pulls, subtitle "X unique players died"

#### C. Phase Reach Rate (NEW — top-level phase summary)
Show which phases the raid reached across all pulls:

| Phase | Pulls Reached | Rate | First Reached | Deaths in Phase |
|-------|--------------|------|---------------|-----------------|
| P1: Sentinels | 27/27 | 100% | Pull 1 | 12 |
| Intermission | 25/27 | 93% | Pull 1 | 18 |
| P2: Rift | 22/27 | 81% | Pull 3 | 34 |
| P3: Cosmos | 8/27 | 30% | Pull 14 | 8 |

Color-code rates: green (>80%), yellow (50-80%), red (<50%).
Highlight the **phase wall** — "P2 is the wall: 81% of pulls reach it, but only 30% make it to P3. 34 deaths in P2 (1.5 per pull) — the highest death rate of any phase."

#### D. Pull Progression Chart
A visual chart showing every pull:
- X-axis: pull number (chronological)
- Each pull shown as a vertical bar, height = pull duration
- Color = boss % reached (gradient: red at 100% → yellow at 50% → green at 10% → gold at 0%)
- **Phase labels on y-axis** — horizontal dashed lines at each phase transition time (e.g., 2:14 for P1→Intermission, 2:53 for P2 start, 5:04 for P3 start). Bars that reach above a phase line visually show which phases were entered.
- Death count shown as number on or below each bar
- Trend line for pull duration
- Key milestones labeled: "First time reaching Phase 2", "First P3 entry", "Longest pull", "Best boss %"

#### E. What's Killing Us — By Phase (Primary Analysis Section)
The single most important section. **Group all analysis by phase.**

For EACH phase, show:

1. **Phase header** with death count and death rate
2. **Top killers in this phase** — ranked list:
   - Mechanic name, deaths, wipes caused
   - Visual bar showing relative frequency
   - Brief description of what this mechanic does and how to handle it

3. **Death heatmap within this phase** — when in the phase are people dying?
   - X-axis: time relative to phase start
   - Y-axis: deaths per 15s bucket
   - Annotated with boss abilities that fire at those times

Example:
```
─── Phase 2: Rift (2:53 – 5:04) ──────────────────────
34 deaths across 22 pulls (1.5 per pull) — PHASE WALL

  Call of the Void:    ████████████ 14 deaths
  Voidstalker Sting:   ████████ 9 deaths  
  Rift Slash:          █████ 6 deaths
  Void Barrage:        ███ 5 deaths
```

After the per-phase breakdowns:

4. **First Death Analysis** — who dies first, and what happens after
   - "First death before 2:00 (P1) in 12/27 pulls — when first death is in P1, average pull lasts 3:12. When no one dies until P2, average pull lasts 5:45."
   - This quantifies the cascade effect
   - Note WHICH PHASE first deaths tend to occur in

#### F. Player Death Leaderboard (Phase-Aware)
Table of all 20 players sorted by death rate:
- Rank, Name (linked to player page), Spec, Total Deaths, Death Rate, #1 Killer, **Worst Phase** (phase where they die most), Avg Death Time
- Color-coded: green (0-1 deaths), yellow (2-4), orange (5-7), red (8+)
- Highlight players dying to AVOIDABLE mechanics vs unavoidable
- "Worst Phase" column shows which phase each player struggles with most

#### G. Raid DPS by Pull (Phase-Colored)
- Bar chart showing total raid DPS per pull
- **Color-code bars by phase reached** — pulls that only reached P1 are red, P2 are yellow, P3 are green
- Shows whether the raid's overall damage output is consistent or volatile
- Mark pulls where key DPS players died early

#### H. DPS Leaderboard (Aggregate + Per-Phase)
Table of all DPS players:
- Name (linked), Spec, Avg DPS (overall), **P1 DPS**, **P2 DPS**, **P3 DPS**, Survival Rate, Best Pull
- Sorted by average DPS
- Color survival rate column
- Per-phase DPS columns show WHERE each player's performance drops off. A player with 55K P1 / 48K P2 / 30K P3 has a P3 execution problem. A player with flat 40K across all phases may have a gear/build issue.

#### I. Healer Performance (Aggregate + Per-Phase)
Table of all healers:
- Name (linked), Spec, Avg HPS (overall), **P1 HPS**, **P2 HPS**, **P3 HPS**, Avg Overheal %, Survival Rate
- Per-phase HPS shows whether healers scale output to match damage. P1 HPS should be lower than P2/P3. If a healer's HPS is flat across phases, they may be "wasting" throughput in easy phases.

#### J. Tank Performance (Aggregate + Per-Phase)
Table of both tanks:
- Name (linked), Spec, Avg DPS, **P1 DTPS**, **P2 DTPS**, **P3 DTPS**, Survival Rate, Swap Consistency
- Per-phase DTPS shows where damage intake spikes. P3 DTPS doubling from P1 is expected — but if one tank's DTPS spikes more than the other's, their mitigation is worse.

#### K. Session Trend Analysis (Phase-Aware)
- **Early pulls (1-9)** vs **Mid pulls (10-18)** vs **Late pulls (19-27)**: average boss %, avg deaths, avg duration, **phases reached**
- Is the raid improving, plateauing, or regressing?
- "The raid's best pulls came in the [early/mid/late] session"
- "P3 was first reached on pull 14. By pulls 23-27, the raid reached P3 in 4/5 pulls — improvement is clear."

#### L. What Needs to Change (Actionable Section — Phase-Framed)
3-5 concrete, prioritized items. **Frame each item around the phase it affects:**
1. **Phase wall breaker** — the #1 thing preventing consistent P3 entry: mechanic, who's failing it, specific fix
2. **[Phase X] death pattern** — "In P2, Call of the Void kills 1.5 players per pull. Players: [names]. Fix: [specific]."
3. **Phase transition execution** — if deaths cluster at phase transitions (intermission, P1→P2), the raid needs better CDs or positioning for the transition
4. **DPS check** — if the raid is hitting P3 but wiping to soft enrage, show how much more DPS is needed and which players have the biggest gaps to close (per-phase DPS comparison makes this concrete)
5. **What's working** — which phase is clean, which players are consistent. Always end on positive. "P1 is clean — 0.4 deaths per pull. The improvement from pull 14 onward shows the team is learning P2."

#### M. Player Pages (Links)
Grid of all 20 players with links to their individual analysis pages:
- Same layout as current index (role-grouped, sorted by DPS/HPS)
- Each card shows: Avg DPS/HPS across all pulls, survival rate, **worst phase**, #1 death cause

#### M. Footer
- Data source info, pull count, qualifying pull criteria
- Link to WCL report

---

## EDGE CASES

1. **Sub-30s pulls** — exclude from all analysis. They're usually tank death on pull or someone disconnected.
2. **Fight ID gaps** — fight IDs are NOT sequential. Don't assume contiguous IDs.
3. **Players joining/leaving** — some players may not be present for all pulls. Count deaths and survival rate against THEIR pull count, not total pulls.
4. **Phase identification** — boss ability gaps/new abilities indicate phase changes. If you can't cleanly identify phases from the data, don't force it.
5. **Deaths pagination** — always check `nextPageTimestamp` on death events.
6. **Duplicate deaths** — a player can die, be battle-rezzed, and die again in the same pull. Count each death separately.
7. **2-death threshold (CRITICAL)** — once 2 players have died in a pull, the pull is compromised. From that point forward:
   - Do NOT count subsequent deaths as "early deaths" against individual players — they're cascade deaths caused by the raid being shorthanded, not individual mistakes.
   - Do NOT include performance data (DPS, HPS, DTPS) from after the 2nd death in player averages — the numbers from a broken pull are meaningless and pollute the analysis.
   - DO still track what caused the first 2 deaths — those are the actual actionable failures.
   - For "wipe cause" analysis, focus on the first 2 deaths (who, when, to what). Everything after is cascade.
   - For player death frequency stats, only count deaths where the player was one of the first 2 to die in that pull.

---

## QUALITY STANDARDS

1. **Raid-level, not individual** — this page answers "what does the RAID need to fix" not "what does player X need to fix." Individual pages handle that.
2. **Data-driven** — every claim backed by specific numbers from specific pulls. "12/27 pulls had a death before 2:00" not "people keep dying early."
3. **Actionable** — the "What Needs to Change" section must give concrete, prioritized actions the raid leader can communicate to the team.
4. **Honest about progress** — if the raid improved through the night, show it. If they plateaued, say so. If they regressed, say so.
5. **Context-aware** — first prog night is expected to be rough. Night 5 of the same boss with the same wipe causes is a different story. Frame findings relative to the night number.
