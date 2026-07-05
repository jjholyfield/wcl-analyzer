# WCL Healer Analyzer — Agent Execution Spec

You are a Warcraft Logs analysis agent. Your job is to pull combat log data from the WCL v2 GraphQL API, correlate healer performance against boss mechanics, top-ranked reference players, and the rest of the healing team, then produce a detailed HTML analysis page for each healer in a given raid log.

This document is your complete execution spec. Follow it exactly. Every API call, data structure, calculation, and edge case is documented here because we discovered them the hard way.

## How Healer Analysis Differs from DPS

DPS analysis measures uptime and execution efficiency — casts per second during mechanic windows. Healer analysis measures **decision quality** — did the right spells hit the right targets at the right time? Key differences:

1. **CD timing relative to boss events** — a healer CD used 6 seconds late is a wasted CD, even if the HPS looks fine
2. **Team coordination** — 4 healers share responsibility. Overlapping CDs wastes throughput. Missing a Bloom with no CD is a team failure. You must pull ALL healers' data, not just the one being analyzed
3. **Ramp timing** (spec-specific) — Disc Priest ramps Atonements BEFORE damage. Resto Druid pre-hots. Holy Priest charges Holy Words. The analysis must understand how each spec prepares for damage
4. **Overheal breakdown** — DPS never overheals. Healers routinely waste 25-40% of their output. The COMPOSITION of overheal matters: high overheal on Atonement during no-damage windows is fine, high overheal on expensive cooldowns is a problem
5. **DPS contribution** — healers are expected to DPS during low-damage windows. Zero DPS filler casts (Smite, Wrath, Lightning Bolt) = wasted globals
6. **Mana management** — running OOM at 60% fight means poor spell selection or no mana cooldowns
7. **Death attribution** — if the healer died, what killed them? Avoidable mechanic? Lack of external? This is the single highest-impact event because a dead healer = 0 contribution for the rest of the fight
8. **Maintenance abilities** — DoT/HoT uptime, shield on tank, etc. These run continuously regardless of damage events

## Input

You will receive:
- **Report code** — the WCL report ID (e.g., `1Mch2jqLWmAZ8r9a`)
- **Players to analyze** — either "all healers" or specific player names
- **Output directory** — where to write HTML files (default: `wcl-analyzer/healing-cds/`)
- **Analysis mode** — either "kill" (default) or "prog" (no kill in the log)

## PROG MODE — Aggregate Healer Analysis Across ALL Pulls

When the boss was NOT killed (prog night), the entire analysis changes. Do NOT analyze a single pull and compare to a reference kill. Instead, aggregate performance across ALL pulls to show consistency, death patterns, CD usage discipline, and improvement trends.

### Why Prog Mode Is Different for Healers
On a prog night, one pull could be a 45-second tank death wipe where the healer barely cast. Analyzing that pull is meaningless. What matters across prog is: Are they using CDs at the right time consistently? Are they dying to mechanics? Is their HPS stable on the longer pulls? Are they improving their ramp timing as they learn the fight?

### Prog Mode Data Collection

#### Pull ALL Per-Fight HPS Tables
For every fight in the log, pull the healer's HPS:
```graphql
{
  reportData {
    report(code: "<code>") {
      f1: table(fightIDs: [1], dataType: Healing)
      f2: table(fightIDs: [2], dataType: Healing)
      # ... every fight ID
    }
  }
}
```
Batch into groups of 5-8 fight IDs per query. Record for each pull: fight ID, HPS, overheal %, fight duration, boss %. Filter to pulls > 60 seconds for meaningful analysis.

#### Pull CD Usage Across ALL Pulls
For every fight, pull cast events for the healer's major CDs (60s+ cooldown abilities). Record WHEN each CD was used in each pull. This shows:
- Are they using CDs at consistent timings? (Good — they've learned the pattern)
- Are CDs sitting unused? (Bad — wasted throughput)
- Are CDs overlapping with other healers? (Team coordination issue)

#### Pull ALL Death Events Across ALL Pulls
Same approach as DPS prog mode — for every fight, pull death events. Record fight ID, death time, killing ability, damage sequence.

#### Pull ALL Other Healers' CD Timings (Team Context)
On prog, team coordination matters more than individual throughput. Pull the other healers' major CDs across all pulls to identify:
- Consistent CD overlaps (two healers always pop CDs at the same time)
- Uncovered damage windows (nobody CDs a specific mechanic)
- Coordination improvement over the session

### Prog Mode Analysis for Healers

#### 1. Performance Across All Pulls
- **Average HPS** across qualifying pulls (>60s)
- **Average overheal %** — is it trending down as they learn the fight?
- **Best pull HPS** vs worst pull HPS
- **Trend line** — HPS improvement through the session
- **Mana at death/wipe** — if available, are they OOM on longer pulls?

#### 2. CD Discipline (Most Important for Healer Prog)
- **CD usage rate** — "Used Aura Mastery in 18/27 pulls, averaged at 1:45 into the fight"
- **CD timing consistency** — standard deviation of CD timing across pulls. Low = they've learned the pattern. High = reactive/inconsistent
- **Unused CDs** — pulls where a major CD was never cast (wasted value)
- **CD timing vs boss events** — are their CDs landing on damage events or in dead time?
- **Team overlap frequency** — how often do their CDs overlap with another healer's CD?

#### 3. Death Analysis
Same as DPS prog mode:
- Death frequency, average survival time, death causes ranked
- Repeated mechanic failures highlighted
- Deaths that are especially impactful (healer death = cascading raid deaths)

**2-Death Threshold Rule:** Once 2 players have died in a pull, the pull is compromised. Do NOT count subsequent deaths against this healer — they're cascade. Do NOT include HPS/DPS data from after the 2nd raid death in averages. Only count deaths where this player was one of the first 2 to die in the pull.

#### 4. Ramp Quality Across Pulls (Spec-Specific)
For specs that ramp (Disc, Resto Druid):
- Is ramp timing getting better through the session?
- Consistent ramp issues (always late, always too early, inconsistent)

#### 5. DPS Contribution Consistency
- Average DPS across pulls — are they filling during low-damage windows?
- DPS on short vs long pulls — do they DPS early and heal later, or vice versa?

### Prog Mode HTML Structure for Healers

#### Summary Cards (4-column)
- **Avg HPS** (across all pulls >60s)
- **Item Level**
- **Survival Rate** (X/Y pulls)
- **Avg Overheal %** (color: green <30%, yellow 30-40%, red >40%)

#### HPS Across All Pulls
Bar chart of HPS per pull, color-coded by survived/died. Trend line overlay. Average HPS line.

#### Per-Phase Performance Breakdown (NEW — key healer prog section)
Using the phases identified in Step 3b, show healing broken down by phase:

**Phase Reach Rate:**
- "Reached Phase 2 in 22/27 pulls, reached Phase 3 in 8/27 pulls"

**Per-Phase HPS/Overheal Table:**
| Phase | Pulls Seen | Avg HPS | Avg Overheal | Deaths in Phase | CDs Used |
|-------|-----------|---------|-------------|-----------------|----------|
| P1 | 27/27 | 98.2K | 42% | 1 | Aura Mastery x18 |
| Intermission | 25/27 | 145.1K | 18% | 3 | — |
| P2 | 22/27 | 125.8K | 28% | 4 | Aura Mastery x15 |
| P3 | 8/27 | 152.4K | 22% | 2 | Aura Mastery x5 |

**Key insights this reveals:**
- "42% overheal in P1 means mana is being wasted before the hard healing in P2/P3"
- "HPS jumps 27% from P1 to P2 — good, scaling output to match incoming damage"
- "CDs deployed in P1 when damage is manageable — consider saving for P2 healing windows"

#### CD Discipline Analysis (by phase)
Table per major CD:
- CD Name | Used in X/Y Pulls | Avg Timing | Which Phase | Timing Std Dev
- Show which phase each CD lands in — CDs in low-damage phases may be misspent
- Highlight unused CDs in red

#### Death Pattern Analysis (by phase)
Same death tracking as DPS prog mode, but grouped by which phase deaths occur in.
A healer dying in P1 (low damage) to an avoidable mechanic is very different from dying in P3 when everything is overlapping.

#### Team CD Coordination (NEW)
- Timeline showing all 5 healers' major CDs across the longest pull
- Phase boundaries marked on the timeline
- Identify overlaps and gaps PER PHASE
- "Aura Mastery and Spirit Link overlap at 2:00 (P1) in 15/27 pulls — P1 doesn't need both, save one for P2"

#### Actionable Items (Prog-Focused)
1. **#1 death cause** — survival first, which phase it happens in
2. **CD discipline by phase** — CDs wasted in easy phases, missing in hard phases
3. **Team coordination** — overlaps, uncovered windows, especially in later phases
4. **Phase-specific mana management** — high overheal in P1 = less mana for P2/P3
5. **Ramp timing** — if applicable to spec, how it changes per phase

### Prog Mode vs Kill Mode Decision
The workflow prompt will tell you which mode to use. If not specified:
- If there is a kill in the log → kill mode (existing pipeline)
- If there is no kill → prog mode (this section)

## Prerequisites

### API Authentication
- **Endpoint:** `https://www.warcraftlogs.com/api/v2/client` (GraphQL)
- **Token endpoint:** `https://www.warcraftlogs.com/oauth/token`
- **Credentials location:**
  - Client ID: `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt`
  - Client Secret: `~/.openclaw/workspace/.secrets/warcraftlogs-v2-client-secret.txt`
- **Auth flow:** OAuth2 client credentials. POST to token endpoint with `grant_type=client_credentials&client_id=X&client_secret=Y`, get back `access_token`.
- **All API calls:** Send `Authorization: Bearer <token>` header with `Content-Type: application/json`.

### Token Helper
```javascript
async function getToken() {
  const fs = require('fs');
  const os = require('os');
  const clientId = fs.readFileSync(os.homedir() + '/.openclaw/workspace/.secrets/warcraftlogs-v2-client-id.txt', 'utf8').trim();
  const clientSecret = fs.readFileSync(os.homedir() + '/.openclaw/workspace/.secrets/warcraftlogs-v2-client-secret.txt', 'utf8').trim();
  const r = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + clientId + '&client_secret=' + clientSecret
  });
  return (await r.json()).access_token;
}
```

### GraphQL Helper
```javascript
async function gql(token, query) {
  const r = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return r.json();
}
```

### Paginated Events Helper
Events queries return max ~300 events per page. You MUST paginate using `nextPageTimestamp`.

```javascript
async function allEvents(token, code, fightID, params) {
  let all = [];
  let start = 0;
  while (true) {
    const startParam = start ? ', startTime: ' + start : '';
    const q = `{reportData{report(code:"${code}"){events(${params}, fightIDs:[${fightID}]${startParam}){data, nextPageTimestamp}}}}`;
    const r = await gql(token, q);
    const ev = r.data.reportData.report.events;
    all = all.concat(ev.data);
    if (!ev.nextPageTimestamp) break;
    start = ev.nextPageTimestamp;
  }
  return all;
}
```

## File Locations

- **Working directory:** `c:/DRIVE/CODE/wcl-analyzer/`
- **Data directory:** `wcl-analyzer/data/<reportCode>/` — cache all pulled data here
- **Per-player data:** `wcl-analyzer/data/<reportCode>/<playerName>/` — player-specific event data
- **Reference data:** `wcl-analyzer/data/<reportCode>/<playerName>/ref-<refName>/` — reference player data
- **Output HTML:** `wcl-analyzer/healing-cds/log-<date>-<playerName>.html`
- **Spell name cache:** `wcl-analyzer/spell-names.json` — accumulated spell ID → name mappings
- **Existing data files that may already exist:**
  - `players.json` — player roster (OBJECT keyed by source ID string, NOT an array)
  - `fights.json` — fight metadata array
  - `per-fight.json` — per-fight DPS/HPS per player (keyed by fight ID string)
  - `deaths.json` — death events per fight (keyed by fight ID string)
  - `rankings-top5.json` — top 5 rankings per spec (keyed by `"<Class>-<Spec>_hps"`)
  - `player-casts.json` — aggregate cast data per player

---

## PIPELINE — Execute These Steps In Order

### Step 0: Look Up Current Spec Guide

Before any data analysis, **web search for the current class/spec guide** for the healer you are analyzing. Search for: `"<Class> <Spec> guide Wowhead" OR "<Class> <Spec> rotation Icy Veins"` (e.g., "Restoration Shaman guide Wowhead"). Read the healing priority, CD usage, ramp sequences, talent synergies, and hero talent differences for the current patch.

You need this to:
- Understand which CDs are throughput vs defensive vs utility
- Know ramp timing for specs like Disc Priest or Resto Druid
- Identify correct spell priorities and mana efficiency choices
- Know which hero talent tree changes the healing rotation
- Avoid making outdated claims about ability interactions from previous expansions

**Cache this knowledge mentally for the analysis.** Every actionable item and verdict paragraph should reflect current-patch understanding.

### Step 1: Pull Report Metadata

If not already cached, pull:

```graphql
{
  reportData {
    report(code: "<CODE>") {
      fights { id, name, difficulty, kill, startTime, endTime, encounterID, fightPercentage }
      masterData {
        abilities { gameID, name }
        actors { id, name, type, subType }
      }
      playerDetails(fightIDs: [<KILL_FIGHT_ID>])
    }
  }
}
```

**CRITICAL — playerDetails has DOUBLE NESTING:**
```javascript
const pd = result.data.reportData.report.playerDetails;
const allPlayers = pd.data.playerDetails; // <-- double .data.playerDetails
const tanks = allPlayers.tanks || [];
const dps = allPlayers.dps || [];
const healers = allPlayers.healers || [];
```

Each player object has: `{ id, name, type, specs: [{ spec }] }` where `id` is the sourceID used in all event queries.

**Save:**
- `fights.json` — the fights array
- `players.json` — build an OBJECT keyed by sourceID string: `{ "8": { name: "Tiareynna", type: "Priest", spec: "Discipline", role: "healer" } }`
- `ability-map.json` — object mapping gameID → name from masterData abilities

**Identify the kill fight(s):** Filter fights where `kill === true`. A report may have kills on multiple bosses — group by encounterID. Each boss gets its own analysis.

**Identify all fight IDs for the same boss:** All fights with the same encounterID are attempts at that boss (wipes + kill). You need ALL of them for wipe progression analysis.

**Identify ALL healers in the roster.** You need every healer's ID, name, spec, and class — not just the one being analyzed. The team coordination analysis requires pulling data from all of them.

### Step 2: Pull Rankings for All Healer Specs Present

For each unique healer spec in the roster, pull rankings on this boss from **US and EU regions only**:

```graphql
{
  worldData {
    encounter(id: <ENCOUNTER_ID>) {
      us: characterRankings(
        className: "<CLASS>"
        specName: "<SPEC>"
        difficulty: <DIFFICULTY>
        metric: hps
        serverRegion: "US"
        page: 1
      )
      eu: characterRankings(
        className: "<CLASS>"
        specName: "<SPEC>"
        difficulty: <DIFFICULTY>
        metric: hps
        serverRegion: "EU"
        page: 1
      )
    }
  }
}
```

**CRITICAL — US/EU regions only.** Do NOT include CN, KR, or TW — different metas make cross-region comparisons misleading.

**CRITICAL — Use `metric: hps` for healers, not `dps`.**

**CRITICAL — Class and Spec Name Formatting:**
- API uses spaces and capital case: `"Death Knight"` not `"DeathKnight"`, `"Demon Hunter"` not `"DemonHunter"`
- Spec names: `"Discipline"` not `"Disc"`, `"Restoration"` not `"Resto"`, `"Mistweaver"` not `"MW"`, `"Preservation"` not `"Pres"`, `"Holy"` stays `"Holy"`

Merge US + EU results, sort by HPS descending, take the **top 10 candidates** (more than 5 because comp filtering in Step 8 will remove mismatched comps).

The response gives `characterRankings.rankings[]` with: `{ name, server, class, spec, amount (HPS), report { code, fightID }, duration, bracketData, ... }`

For each reference candidate, note: `{ name, server, amount (HPS), reportCode, fightID, duration }`.

### Step 3: Build Boss Mechanic Timeline and Identify Phases

**Most mythic bosses have distinct phases** with different healing demands. You MUST identify these phases from the data. This applies to BOTH kill mode and prog mode.

#### 3a. Pull ALL enemy casts from the analysis fight (kill fight or longest pull):

```javascript
const bossCasts = await allEvents(token, code, analysisFightID, 'hostilityType:Enemies, dataType:Casts');
```

**Filter to `type === "cast"` only** — `begincast` events fire when the cast starts, `cast` events fire when it completes. If you count both, you double-count.

**Convert to relative timestamps:** Subtract the fight's `startTime` from every event `timestamp`, divide by 1000 for seconds.

**Map ability IDs to names** using the ability-map from masterData.

**Group by ability name** and calculate cast count, timing pattern, and average interval.

**Identify mechanic categories** relevant to healers:
- **Raid-wide damage** (Blooms, unavoidable AoE) = where CDs should be deployed
- **Periodic damage** (DoT ticks, environmental) = steady healing required
- **Movement mechanics** (roots, spreads) = limited casting window
- **Dispellable debuffs** = healer responsibility
- **Tank damage** = specific healer assignment (external CDs, tank healing)

**GOTCHA — Environmental/shared spell IDs:** Some abilities in the hostile events may share spell IDs with player abilities. Identify by: (a) very high cast count, (b) many events at the exact same timestamp, (c) sourceID 0 or an environmental actor. Exclude from the mechanic timeline.

**You MUST research the boss** to understand which abilities are raid-wide healing checks vs tank hits vs avoidable mechanics. Use web search for Wowhead/Icy Veins/Method guides on the specific boss and difficulty.

#### 3b. Identify Boss Phases

After building the enemy cast timeline, identify distinct fight phases:

1. **Transition abilities** — one-time casts that signal a phase change (e.g., "Silversunder Catastrophe" for Crown P1→Intermission)
2. **New enemy actors** — new sourceIDs that start casting abilities not present before (e.g., Rift Simulacrum spawning marks Crown P2)
3. **Abilities that stop** — a regularly-repeating ability suddenly stops and is replaced by new ones
4. **Activity gaps** — 10-30s of no enemy casts often indicates an intermission
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

#### 3c. Per-Phase Healer Analysis

Each phase has different healing demands — P1 may be steady tank damage + periodic AoE, while P3 is constant raid-wide damage requiring CD rotation. Break down healer performance by phase:

- **Per-phase HPS** — how healing output changes across phases
- **Per-phase overheal %** — overheal in low-damage P1 is fine; high overheal in heavy-damage P3 is bad spell selection
- **CD usage by phase** — which CDs were used in each phase? Were any phases uncovered?
- **Deaths by phase** — which phase is killing people? That phase needs more healing
- **DPS filler by phase** — in low-damage phases, healers should be DPSing more

**In prog mode:** Aggregate per-phase stats across all pulls. Track phase reach rate. "This healer reached P3 in 8/27 pulls — their P2 CD timing is consistent but their P1 overheal is 45% (wasting mana before it matters)."

### Step 4: Define Healing Windows

Based on the boss timeline, create an ordered list of windows where healer CDs are expected:

```javascript
const healingWindows = [
  { type: 'raid-wide', name: 'Bloom', num: 1, time: 120, duration: 15, description: 'Full raid AoE. Major healing CD required.' },
  { type: 'raid-wide', name: 'Bloom', num: 2, time: 256, duration: 15, description: 'Second Bloom. CDs should be back up.' },
  { type: 'movement', name: 'Vines', num: 1, time: 43, duration: 12, description: 'Roots players. Sustained AoE damage.' },
  // ... etc
];
```

**Duration guidelines for healers:**
- Raid-wide burst damage: 10-15s window (CD deployment + burst healing)
- Sustained AoE damage: 15-25s window (throughput check)
- Movement mechanics: 10-15s (reduced casting, instant-cast priority)
- Tank damage windows: 5-10s (external CDs, tank healing spells)

**Quiet windows** are gaps between healing windows where DPS filler is expected from healers.

### Step 5: Pull Player Event Data

For the healer being analyzed, pull SIX event types from the kill fight:

**5a. Cast events (what they pressed):**
```javascript
const casts = await allEvents(token, code, killFightID, 'dataType:Casts, sourceID:' + playerSourceID);
```

**5b. Healing events (what healed and how much):**
```javascript
const healing = await allEvents(token, code, killFightID, 'dataType:Healing, sourceID:' + playerSourceID);
```

Each healing event has:
```javascript
{
  timestamp: 7954452,
  type: "heal",            // or "absorb"
  sourceID: 8,             // the healer
  targetID: 14,            // who was healed
  abilityGameID: 194384,   // which spell
  amount: 45000,           // effective healing
  overheal: 12000,         // wasted healing (target was already full)
  absorbed: 0,             // absorbed by a shield
  hitType: 2               // 1=normal, 2=crit
}
```

**5c. Damage done (DPS contribution during downtime):**
```javascript
const dmgDone = await allEvents(token, code, killFightID, 'dataType:DamageDone, sourceID:' + playerSourceID);
```

**5d. Damage taken (what hit them — critical for death forensics):**
```javascript
const dmgTaken = await allEvents(token, code, killFightID,
  'dataType:DamageTaken, hostilityType:Friendlies, sourceID:' + playerSourceID);
```

**GOTCHA:** Without `hostilityType:Friendlies`, `DamageTaken` returns 0 events. You MUST include `hostilityType:Friendlies` and use `sourceID` (not `targetID`).

**5e. Buffs applied (Atonement tracking, CDs, externals):**
```javascript
const buffs = await allEvents(token, code, killFightID, 'dataType:Buffs, sourceID:' + playerSourceID);
```

This returns buffs the player APPLIED (to themselves and others). For Disc Priest, this is how you track Atonement count. For all specs, this shows CD usage timing (Evangelism, Tranquility, Ascendance, etc.).

**5f. CombatantInfo (talents and gear):**
```graphql
{
  reportData {
    report(code: "<CODE>") {
      events(dataType: CombatantInfo, fightIDs: [<FIGHT_ID>], sourceID: <PLAYER_ID>) {
        data
      }
    }
  }
}
```

Returns: `gear`, `talentTree: [{ id, rank, nodeID }]`, `specID`, primary/secondary stats.

**Calculate average item level:** Filter gear to `itemLevel > 10`, then average. Slots with ilvl 0 are empty, and slots with ilvl 1 are cosmetic items (Shirt slot 3, Tabard slot 17) that have no stats — including them drags the average down by ~30 points.

### Step 6: Pull ALL Other Healers' Cast Events

**This is unique to healer analysis.** You need every other healer's CD usage to build the team coordination picture.

For each other healer in the roster:
```javascript
const otherCasts = await allEvents(token, code, killFightID, 'dataType:Casts, sourceID:' + otherHealerID);
```

You only need their MAJOR CD casts, not every spell. Filter to known healing CDs:

```javascript
const MAJOR_HEALING_CDS = [
  // Resto Druid
  'Tranquility', 'Incarnation: Tree of Life', 'Flourish', 'Convoke the Spirits',
  // Resto Shaman
  'Spirit Link Totem', 'Ascendance',
  // Holy Priest
  'Divine Hymn', 'Apotheosis', 'Holy Word: Salvation', 'Symbol of Hope',
  // Disc Priest
  'Power Word: Barrier', 'Evangelism', 'Rapture', 'Ultimate Penitence',
  // Holy Paladin
  'Avenging Wrath', 'Aura Mastery',
  // MW Monk
  'Revival', 'Invoke Yu\'lon, the Jade Serpent', 'Invoke Chi-Ji, the Red Crane', 'Celestial Conduit',
  // Preservation Evoker
  'Rewind', 'Dream Flight',
  // Raid CDs (non-healer)
  'Anti-Magic Zone', 'Darkness', 'Rallying Cry', 'Vampiric Embrace',
];
```

Map each CD to the nearest healing window to build the team coordination picture.

### Step 7: Pull Death Events

```javascript
const deaths = await allEvents(token, code, killFightID, 'dataType:Deaths');
```

Map targetID to player name from players.json. Map killingAbilityGameID to ability name.

**If the analyzed healer died:** This is THE most important finding. A dead healer contributes 0 for the rest of the fight. Build a detailed death forensic timeline:

1. Pull the last 20 seconds of damage taken events before death
2. Pull healing received by the healer (filter healing events where `targetID === healerID`)
3. Check what self-healing/defensive CDs were used (Desperate Prayer, Healthstone, personal defensives)
4. Determine cause: avoidable mechanic? Lack of external? Healer error? Overwhelmed by damage?
5. Calculate time dead as percentage of fight: `(fightDuration - deathTime) / fightDuration * 100`

### Step 8: Pull Reference Player Data

For the top 10 reference candidates from Step 2:

**8a. Pull playerDetails and verify comp match:**
```graphql
{
  t0: reportData { report(code: "<REF_CODE_0>") { playerDetails(fightIDs: [<REF_FIGHT_ID_0>]) } }
  t1: reportData { report(code: "<REF_CODE_1>") { playerDetails(fightIDs: [<REF_FIGHT_ID_1>]) } }
  // ... batch all 10 with aliases
}
```

For each reference, count their raid comp from `playerDetails.data.playerDetails`:
- Number of healers: `healers[].length`
- Number of DPS: `dps[].length`
- Number of tanks: `tanks[].length`
- Total players: sum of all three

**CRITICAL — Filter to references whose healer count matches the current raid's healer count.** A healer in a 4-heal comp has fundamentally different HPS than in a 5-heal comp — the healing load splits fewer ways. Comparing a 5-heal Disc against a top-ranked 4-heal Disc produces an unfair HPS gap that isn't a player skill issue.

After filtering, take the top 5 by HPS. If fewer than 5 match, use what's available and note the smaller reference pool in the HTML output.

Find the player matching the target spec in `healers[]`. Get their `id` (sourceID).

**8b. Get their CombatantInfo (talents, gear, stats):**
Batch all 5 with aliases.

**8c. Talent comparison:**
Build a Map of `nodeID → { id, rank }` for both players. Count differences:
```javascript
let diffs = 0;
const allNodes = new Set([...playerMap.keys(), ...refMap.keys()]);
for (const n of allNodes) {
  const p = playerMap.get(n), r = refMap.get(n);
  if (!p || !r || p.id !== r.id || p.rank !== r.rank) diffs++;
}
```

**8d. Select primary reference:**
Choose the reference with the FEWEST talent differences and closest item level. For healers, talent differences matter more than for DPS because different talent builds create fundamentally different playstyles (e.g., Disc with Ultimate Penitence vs without is a different toolkit).

**CRITICAL — Talent claims must come from CombatantInfo data, NEVER from web search guides.** The Step 0 web search teaches you how a spec's rotation works — it does NOT tell you what any specific player runs. When you report talent differences (including hero talent trees), you MUST be comparing the actual `talentTree` arrays from CombatantInfo for both the player and the reference. If both players run the same hero talent tree, do NOT recommend switching to a different one just because a guide says it's "meta." The data is the truth.

**8e. Pull primary reference's data:**
```javascript
const refCasts = await allEvents(token, refCode, refFightID, 'dataType:Casts, sourceID:' + refSourceID);
const refHealing = await allEvents(token, refCode, refFightID, 'dataType:Healing, sourceID:' + refSourceID);
```

Also pull their fight metadata and ability map:
```graphql
{
  reportData {
    report(code: "<REF_CODE>") {
      fights(fightIDs: [<REF_FIGHT_ID>]) { id, startTime, endTime, kill }
      masterData { abilities { gameID, name } }
    }
  }
}
```

**8f. Get reference fight durations for all 5 (for the comparison table):**
```graphql
{
  r0: reportData { report(code: "<CODE0>") { fights(fightIDs: [<FIGHT0>]) { startTime, endTime } } }
  r1: reportData { report(code: "<CODE1>") { fights(fightIDs: [<FIGHT1>]) { startTime, endTime } } }
  // ... batch all 5
}
```

### Step 9: Cast Profile Comparison

Build a cast-per-minute (CPM) comparison between the analyzed player and the primary reference:

```javascript
const playerDuration = playerAliveTime / 60; // minutes alive, NOT full fight time
const refDuration = refFightDuration / 60;

const playerCPM = {};
casts.filter(e => e.type === 'cast' && relativeTime(e) <= playerAliveTime)
  .forEach(e => {
    const name = abilityMap[e.abilityGameID];
    playerCPM[name] = (playerCPM[name] || 0) + 1;
  });
for (const name in playerCPM) playerCPM[name] /= playerDuration;
```

**CRITICAL — use alive time for the analyzed player's CPM, not full fight time.** If a healer died at 3:08, their CPM should be calculated over 3.13 minutes, not 7.97 minutes.

**Sort abilities by importance for the spec.** Every healer spec has a priority list:

#### Disc Priest Priority
1. **Smite** — primary Atonement filler. THIS IS THE #1 THING TO CHECK. Zero Smite = broken rotation.
2. **Penance** — core rotational, should be on CD
3. **Shadow Word: Death** — major Atonement damage source (execute/talent)
4. **Power Word: Radiance** — ramp ability (5 Atonements each)
5. **Flash Heal** — triage filler between ramps
6. **Mind Blast** — damage for Atonement on CD
7. **Evangelism** — ramp extender, should align with boss events
8. **Power Infusion** — self/external damage buff
9. **Shadow Word: Pain** — maintenance DoT (should NOT be high CPM)
10. **PW: Shield** — single Atonement application (should be moderate)
11. **Plea** — single Atonement (should be lower than PWR)

#### Resto Druid Priority
1. **Wild Growth** — primary AoE heal, should be on CD during damage
2. **Rejuvenation** — blanket hot, primary filler
3. **Swiftmend** — core rotational, feeds mastery/talents
4. **Lifebloom** — tank hot maintenance (100% uptime expected)
5. **Wrath/Sunfire/Moonfire** — DPS filler during downtime
6. **Regrowth** — spot heal/triage
7. **Tranquility/Convoke/Flourish/Incarnation** — major CDs, checked in CD coordination section

#### Resto Shaman Priority
1. **Riptide** — core rotational, should be on CD
2. **Healing Wave/Healing Surge** — primary fillers
3. **Chain Heal** — AoE heal during damage
4. **Lightning Bolt** — DPS filler during downtime
5. **Healing Rain** — ground AoE, should have high uptime during damage
6. **Flame Shock/Lava Burst** — DPS filler
7. **Spirit Link Totem/Ascendance** — major CDs

#### Holy Priest Priority
1. **Prayer of Mending** — bouncing heal, should be on CD
2. **Holy Word: Serenity** — single-target CD, track usage
3. **Holy Word: Sanctify** — AoE CD, track usage
4. **Flash Heal/Heal** — primary fillers
5. **Holy Fire/Smite** — DPS filler during downtime
6. **Circle of Healing** — AoE heal
7. **Divine Hymn/Apotheosis/Salvation** — major CDs

**Flag these patterns:**
- **Zero casts of a core filler** (Smite for Disc, Wrath for RDruid, Lightning Bolt for RSham) = critical issue
- **Over-casting maintenance abilities** (SW:Pain at 6+ CPM, Rejuv blanketing at full health) = wasting globals
- **Under-casting ramp abilities** (PWR for Disc, Wild Growth for RDruid) = not preparing for damage
- **Angelic Feather / movement spam** (high count vs reference) = positioning problems

### Step 10: Ramp Analysis (Spec-Specific)

This is the healer-specific version of the DPS "per-mechanic window" analysis. Instead of measuring CPS during damage, measure **preparation BEFORE damage**.

#### Disc Priest Ramp Analysis

For each raid-wide damage event (Bloom, etc.):

1. **Find the ramp start:** Look for the first PW:Radiance cast in the 15s window before the damage event
2. **Count Atonements applied:** Track applybuff/refreshbuff events for "Atonement" on the analyzed player (these show Atonements applied to raid members)
3. **Measure ramp timing:** `rampStart - damageEventTime` (negative = before, positive = LATE)
4. **Check Evangelism timing:** Evangelism should fire AFTER the last PWR but BEFORE the damage event
5. **Check damage spell sequence after Evangelism:** Should be SW:Death → Mind Blast → Penance → Smite spam (highest damage first for Atonement healing)

**The textbook Disc Priest Bloom ramp:**
```
-5.0s: PW: Radiance       (~5 Atonements)
-3.5s: PW: Radiance       (~10 Atonements)
-2.5s: PW: Radiance + Evangelism  (15+ extended)
-1.5s: SW:Pain / SW:Death (damage setup)
 0.0s: >>>DAMAGE HITS<<<  (15+ Atonements active, all extended)
+0.5s: Mind Blast + Penance (big damage = big Atonement healing)
+2.0s: Power Infusion
+3.0s: Smite spam (sustained Atonement throughput)
```

**Compare vs reference.** Side-by-side cast timeline for 15s before and 15s after each Bloom.

**Key metrics per ramp:**
- Time of first PWR relative to damage event (should be -5 to -6s)
- Number of PWR casts before Evangelism (should be 3)
- Atonement count at moment of damage (should be 10-15+)
- Time from damage to first damage spell (should be immediate)
- Total effective healing in the 15s window

#### Resto Druid Ramp Analysis

For each raid-wide damage event:
1. **Pre-hotting:** Count Rejuvenation/Wild Growth applications in the 10s before damage
2. **Ironbark/Cenarion Ward timing:** Should be on a tank or vulnerable target before damage
3. **Tranquility/Convoke/Incarnation timing:** Should start at or just after damage hits
4. **Flourish timing:** Should extend existing HoTs, ideally after major HoT applications

#### Resto Shaman Ramp Analysis

For each raid-wide damage event:
1. **Healing Rain placement:** Should be down before damage hits
2. **Riptide blanket:** Multiple Riptides out before damage for Tidal Waves procs
3. **Spirit Link Totem / Ascendance timing:** Should fire at or just before damage
4. **Chain Heal usage during damage window:** Primary throughput tool

#### Holy Priest Ramp Analysis

For each raid-wide damage event:
1. **Apotheosis timing:** Should activate before or at damage for instant Holy Words
2. **Holy Word: Sanctify usage:** Big AoE heal, should fire during damage
3. **Prayer of Mending bouncing:** Should be active before damage
4. **Divine Hymn timing:** Should channel during highest damage

### Step 11: Team CD Coordination

For each healing window (Bloom, major AoE event):

1. List every healer's CDs used within ±20s of the event
2. Map each CD to the window it covered
3. Identify:
   - **Gaps:** Windows with 0-1 healer CDs (dangerous, team failure)
   - **Stacking:** Windows with 3+ CDs (wasteful, could redistribute)
   - **Late CDs:** CDs deployed >5s after damage started (reduced effectiveness)
   - **Missing CDs:** Healer was alive but used no CD for this event (should they have?)

**Format as a grid:**
```
                   Bloom #1    Bloom #2    Bloom #3
Silencio (RDruid)  Tranq 2:03  Convoke 4:28  Convoke 6:49
Brewtote (RSham)   Asc 1:58    —           SLT 6:34 + Asc 6:40
Tiareynna (Disc)   Evang 2:06  DEAD        DEAD
Voidheart (HPriest) Apo 2:04   Apo 4:20    Apo 6:37
```

**Highlight the analyzed player's row.** Flag any window where they were alive but contributed no CD.

### Step 12: Healing Breakdown

Group all healing events by ability name:

```javascript
const byAbility = {};
healing.forEach(e => {
  const name = abilityMap[e.abilityGameID];
  if (!byAbility[name]) byAbility[name] = { effective: 0, overheal: 0, count: 0 };
  byAbility[name].effective += (e.amount || 0);
  byAbility[name].overheal += (e.overheal || 0);
  byAbility[name].count++;
});
```

**Calculate per-ability overheal percentage:**
```javascript
const totalRaw = d.effective + d.overheal;
const ohPct = totalRaw > 0 ? (d.overheal / totalRaw * 100) : 0;
```

**Do the same for the reference player.** Side-by-side comparison.

**Total overheal comparison:**
```javascript
const totalEffective = Object.values(byAbility).reduce((s, d) => s + d.effective, 0);
const totalOverheal = Object.values(byAbility).reduce((s, d) => s + d.overheal, 0);
const totalOhPct = totalOverheal / (totalEffective + totalOverheal) * 100;
```

**Benchmark:** 25-35% total overheal is normal. >40% suggests poor timing or spell selection. <20% suggests the fight was very damage-heavy or the healer was underhealing.

**Flag high overheal on expensive abilities:**
- Penance at >50% overheal = casting Penance on full-health targets
- PWR at >40% overheal = ramping when no damage is coming
- Tranquility at >50% overheal = channeling during low-damage window

### Step 13: DPS Contribution

Sum all damage done events (filter to `relativeTime <= aliveTime`):

```javascript
const totalDamage = dmgDone.filter(e => relativeTime(e) <= aliveTime)
  .reduce((s, e) => s + (e.amount || 0), 0);
const dps = totalDamage / aliveTime;
```

**Break down by ability** to see what DPS spells are being used. Expected DPS filler by spec:
- **Disc Priest:** Smite, Penance (damage component), Mind Blast, SW:Pain, SW:Death
- **Resto Druid:** Wrath, Sunfire, Moonfire, Starfire (if talented)
- **Resto Shaman:** Lightning Bolt, Flame Shock, Lava Burst
- **Holy Priest:** Holy Fire, Smite

**Zero DPS filler = critical finding.** Every GCD not spent healing during low-damage windows should be a DPS filler. Zero filler means the healer is either standing still doing nothing, or spamming heals on full-health targets (overheal issue).

### Step 14: Death Forensics (If Player Died)

If the healer died, build a detailed forensic timeline of the last 20 seconds:

**14a. Damage taken timeline:**
```javascript
const last20s = dmgTaken.filter(e => relativeTime(e) >= deathTime - 20 && relativeTime(e) <= deathTime);
```

For each event: timestamp, ability name, damage amount, absorbed amount.

**14b. Healing received:**
Filter ALL healing events (from all sources, not just self) where `targetID === healerID` in the last 20s.

**14c. Self-healing and defensives used:**
From the healer's own cast events, find: personal CDs (Desperate Prayer, Healthstone, Astral Shift, etc.), movement abilities (Angelic Feather, Spiritwalker's Grace), self-heals.

**14d. Damage escalation pattern:**
Many boss mechanics deal escalating damage. Track the damage-per-tick pattern to show how fast it ramped. Example:
```
180s: Vines 67K (absorbed)
181s: Vines 67K (absorbed)
182s: Vines 34K + 34K absorbed → shields breaking
183s: Vines 67K → unmitigated
186s: Vines 75K → escalating
187s: Vines 75K + 155K → 257K in 1 second → DEAD
```

**14e. Calculate cost of death:**
- Time dead: `fightDuration - deathTime`
- Percentage of fight missed: `timeDead / fightDuration * 100`
- Healing CDs missed: List which boss events occurred after death that the healer would have contributed CDs to
- Example: "Died at 3:08. Dead for 62% of fight. Missed Bloom #2 and #3 — zero Disc CDs for 2 of 3 major healing events."

### Step 15: Wipe Progression

Using per-fight.json, show the player's HPS across ALL pulls:

```javascript
for (const [fightID, data] of Object.entries(perFight)) {
  const healEntry = data.heal?.find(h => h.name.toLowerCase().includes(playerName.toLowerCase()));
  const hps = healEntry ? Math.round(healEntry.total / (data.totalTime / 1000)) : 0;
  const duration = `${Math.floor(data.totalTime / 60000)}:${String(Math.round((data.totalTime % 60000) / 1000)).padStart(2, '0')}`;
}
```

**Analysis points:**
- Is there improvement across pulls? (Learning curve)
- Does HPS spike on wipes? (Expected — more damage taken = more healing needed)
- Was the kill fight their best performance?
- Do they die on the same mechanic across multiple pulls? (Systematic positioning issue)

### Step 16: Healer Team Ranking

From per-fight data for the kill fight, rank all healers:

```javascript
const healers = kill.heal.filter(h => isHealer(h.name)); // filter to actual healers, not DPS self-healing
healers.sort((a, b) => b.total - a.total);
```

Show: rank, name, spec, total healing, HPS, survived/died status.

Context: A healer who died early will have lower total HPS but may have had high throughput while alive. Note this.

### Step 17: Build the HTML Page

**Filename:** `log-<date>-<playerName>.html` in the output directory.

**Served via:** friday-server route at `/raid/<slug>` which serves files from `wcl-analyzer/healing-cds/`.

**Page structure (in order):**

#### 17a. Header
- Back-link to the log index page: `<a href="/raid/log-<date>" style="display:inline-block;margin-bottom:16px;font-size:13px;color:#8b949e;text-decoration:none;">&larr; <Date> Log Analysis</a>`
- Player name, spec, class
- Boss name, difficulty, kill time
- Date, report code

#### 17b. Summary Cards (4-column grid)
- HPS (full fight, including time dead)
- Item level
- Kill status (Survived / **Died at X:XX** in red)
- Total overheal percentage

#### 17c. Bottom Line Verdict
A 2-3 sentence summary card with a colored left border (green for good, yellow for issues, red for critical problems). State the core finding upfront:
- "Died at 3:08 — missed 62% of the fight. Zero Smite casts and late Bloom ramp."
- "Survived. Strong CD timing. Overheal elevated at 42% — check Rejuv blanketing."
- "Solid performance. 207K HPS, all CDs aligned with Blooms, 28% overheal."

#### 17d. Reference Comparison Table
Show all 5 reference players + the analyzed player:
- Name, HPS, kill time, ilvl, talent delta, overheal %
- Highlight the primary reference
- Note any major talent differences (e.g., "Espéon has Ultimate Penitence which Tiareynna lacks")

#### 17e. Boss Mechanic Timeline
Visual timeline bar spanning the full fight:
- Markers for each raid-wide damage event
- Death marker if player died (skull + dashed line)
- "Alive" zone (green tint) vs "Dead" zone (red tint)
- Time markers at 0:00, midpoint, and fight end

#### 17f. Ramp Analysis (Spec-Specific)
Side-by-side cast timeline comparison for each raid-wide damage event:
- Left column: reference player (green header)
- Right column: analyzed player (red header if late, green if on time)
- Each line: timestamp, ability name, green/red/neutral highlighting
- Bold line for the damage event (divider)
- Summary: effective healing in window, Atonement count at damage time

#### 17g. Team CD Coordination
Table/grid showing all healers' CDs at each healing window:
- Row per healer, column per boss event
- Class-colored CD pills
- "DEAD" pill if healer was dead for that event
- "No major CD" pill if alive but didn't use a CD
- Summary below noting any windows with insufficient CD coverage

#### 17h. Cast Profile Comparison Table
Full ability CPM comparison:
- Ability, player CPM, player casts, reference CPM, reference casts, delta %, assessment tag
- Sort by spec priority (see Step 9)
- Red highlight for MISSING abilities (0 casts)
- Yellow highlight for over-casting or under-casting
- Green highlight for matching reference

#### 17i. Cast Profile Analysis Cards
2-column grid with the top findings:
- "Zero Smite Problem" card explaining what the missing filler means
- "Over-Casting Pattern" card showing what replaced the missing filler
- Or for a well-played healer: "Strong Rotation" + "DPS Contribution" cards

#### 17j. Healing Breakdown Table
Per-ability healing comparison:
- Source, player effective, player OH%, overheal bar (green/red), reference effective, reference OH%
- Top 8-10 abilities by total raw healing

#### 17k. DPS Contribution
3-column stat cards: DPS value, total damage, primary filler damage.
Context note about what the DPS filler should be.

#### 17l. Death Forensics (if died)
Card with monospace timeline of the last 20 seconds:
- Color-coded: red for damage, green for healing, cyan for absorbs
- Escalation pattern highlighted
- "DEAD" final line emphasized
- Analysis card explaining cause and prevention

#### 17m. Wipe Progression Chart
Bar chart of HPS per pull:
- Color gradient: red (low) → yellow → green (high/kill)
- Hover tooltips with HPS and fight duration
- Fight labels at start and end

#### 17n. Healer Team Ranking Table
All healers on the kill fight:
- Rank, name, spec, total healing, HPS, status (survived/died tag)
- Analyzed player highlighted

#### 17o. Actionable Items
3-5 specific improvement items. Sorted by impact. Each should:
- Name the issue in bold
- Explain what it means in concrete terms
- Reference specific fight moments and numbers
- State what should change

**Critical items** (rotation fundamentals, death to avoidable mechanic) get a red-bordered card.
**Important items** (CD timing, DPS filler, overheal) get a blue-bordered card.

#### 17p. Footer
- Data source (report code, fight ID)
- Reference player info (name, report, talent delta)
- Talent difference notes (e.g., "Espéon has Ultimate Penitence, Tiareynna does not. Smite/ramp issues are talent-independent.")

### CSS Theme

Use the same dark theme as the DPS analyzer:
```css
:root {
  --bg: #0d1117; --surface: #161b22; --border: #30363d;
  --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
  --green: #3fb950; --red: #f85149; --yellow: #d29922; --orange: #db6d28;
  --purple: #bc8cff; --cyan: #39d2c0;
}
```

**Class colors for healer team coordination pills:**
- Druid: `background: rgba(255,125,10,0.15); color: #ff7d0a;`
- Shaman: `background: rgba(0,112,222,0.15); color: #0070de;`
- Priest (Disc): `background: rgba(255,255,255,0.1); color: #e0e0e0;`
- Priest (Holy): `background: rgba(255,245,105,0.15); color: #fff569;`
- Paladin: `background: rgba(244,140,186,0.15); color: #f48cba;`
- Monk: `background: rgba(0,255,150,0.15); color: #00ff96;`
- Evoker: `background: rgba(51,147,127,0.15); color: #33937f;`

---

## EDGE CASES AND GOTCHAS

### API Quirks (same as DPS, repeated for completeness)
1. **playerDetails double nesting:** `result.data.reportData.report.playerDetails.data.playerDetails.{tanks,dps,healers}`.
2. **Events use `abilityGameID`** as a top-level field, NOT nested under `ability.guid`.
3. **DamageTaken requires `hostilityType:Friendlies`** and uses `sourceID` (the player taking damage), NOT `targetID`.
4. **`begincast` vs `cast`:** Filter to `type === "cast"` for counting. Only use `begincast` for "started but not completed" analysis.
5. **Events are paginated.** Max ~300 per response. Always check `nextPageTimestamp`.
6. **GraphQL aliases for batching:** `t0:reportData{...} t1:reportData{...}`.
7. **Rankings class names use spaces:** `"Death Knight"`, `"Demon Hunter"`. Spec names are single words: `"Discipline"`, `"Restoration"`.
8. **Timestamps are absolute.** Subtract `fight.startTime` for relative time.
9. **Rankings metric must be `hps` for healers**, not `dps`.

### Data Structure Quirks
1. **players.json is an OBJECT** keyed by source ID string. Access as `players['8']`.
2. **per-fight.json keyed by fight ID string.** Each entry has `{ heal: [...], dmg: [...], totalTime }` where `totalTime` is in MILLISECONDS.
3. **Fight IDs are not sequential.** Don't assume contiguous IDs.
4. **Healing events include absorb shields.** `type: "absorb"` events are shields absorbing damage, not direct heals. Include them in healing totals but note them separately if needed.

### Spec Knowledge — Use Current Guides, Not Training Data
**Do NOT rely on your training data for how a healer spec works.** Your training data is from a previous expansion. Before analyzing a player, **web search for the current rotation/spec guide** (Wowhead, Icy Veins, or Archon) for their class and spec. This gives you accurate understanding of CD interactions, ramp sequences, talent synergies, and priority lists for the current patch. Use this knowledge to provide informed, contextual feedback — not just raw number comparisons.

### Healer-Specific Gotchas
1. **Overheal is EXPECTED and NORMAL** for some abilities. Don't flag Rejuvenation overheal at 30% — it's a HoT that ticks on schedule regardless of health bars. DO flag Tranquility at 60% overheal — that's a major CD wasted on a low-damage window.
2. **HPS comparisons across different fight lengths are misleading.** A 6-minute kill has fewer damage events than an 8-minute kill. HPS is affected by both healer skill AND fight length. Always note kill time when comparing.
3. **Dead healers inflate surviving healers' HPS.** If one healer dies early, the other 3 do more healing to compensate. Their HPS goes up because there's more damage to heal and fewer healers to do it. Don't penalize surviving healers for high HPS on a kill where someone died.
4. **Disc Priest HPS is proportional to damage dealt.** Disc heals through Atonement — damage spells heal all players with Atonement buffs. Zero DPS filler = zero sustained Atonement healing. This is why Smite is the most important button for Disc.
5. **Atonement tracking:** To count active Atonements at a specific moment, track `applybuff`, `refreshbuff`, and `removebuff` events for the "Atonement" ability. Each apply/refresh adds one, each remove subtracts one. This is complex — for a simpler approximation, count distinct targets healed by Atonement events in a 3-second window around the moment.
6. **Healing Done includes Atonement and absorbs.** Disc Priest healing events include Atonement transfers (separate events from the damage that triggered them), PW:Shield absorbs, Divine Aegis absorbs, and direct heals. The healing event has `abilityGameID` — use it to separate Atonement healing from direct healing.
7. **CPM should use alive time, not fight time.** A healer who died at 3:08 in a 7:58 fight should have CPM calculated over 3.13 minutes, not 7.97. Otherwise their CPM looks artificially low.
8. **Some healing events have `amount: 0` with overheal.** This means the spell healed but the target was already full — 100% overheal. Include these in overheal calculations.
9. **Team coordination requires ALL healers' data.** Unlike DPS analysis where each player is analyzed independently, healer analysis must consider the team. Always pull all healers' CD timing even if only analyzing one.
10. **Boss mechanic timers are fixed** across kills of the same boss. Bloom #1 fires at the same second in every pull. Use this for precise pre-ramp timing expectations.

### Spec-Specific Gotchas
1. **Disc Priest — Penance appears as both healing AND damage events.** Penance has a healing component (via Atonement) and a direct damage component. In healing events, you'll see "Penance" healing and "Penance (Contrition)" healing (a talent that adds passive healing per Penance bolt). In cast events, Penance appears once per cast (not per bolt).
2. **Disc Priest — Void Shield/Litany of Lightblind Wrath** are passive proc-based healing abilities, not active casts. They appear in healing events but not in cast events. Don't flag "zero casts" for these.
3. **Resto Druid — Lifebloom uptime** should be near 100%. Track by checking for `removebuff` events without a corresponding `applybuff` within 2 seconds (fallen off vs refreshed).
4. **Resto Shaman — Healing Tide Totem is REMOVED from the game in TWW.** Do NOT reference it. Ascendance is the only option on that talent row.
5. **Holy Paladin — Divine Toll is rotational**, not a healing CD. Don't include it in CD coordination.

### Write Tool Requirement
If a file already exists at the output path, you MUST Read it first (even just 3 lines) before Writing. The Write tool will error if you haven't read an existing file.

---

## EXECUTION CHECKLIST

Before generating each healer's page, verify:

- [ ] All event data pulled and cached (casts, healing, dmg done, dmg taken, buffs, combatant info)
- [ ] Boss timeline built with named abilities and mechanic categories
- [ ] Healing windows defined with types and durations
- [ ] ALL other healers' CD casts pulled for team coordination
- [ ] Reference player selected (fewest talent diffs, closest ilvl)
- [ ] Reference player's cast + healing events pulled
- [ ] Talent comparison completed (count diffs, note major differences like Ultimate Penitence)
- [ ] Cast profile CPM comparison built for all abilities
- [ ] Ramp analysis completed for each raid-wide damage event (spec-specific)
- [ ] Team CD coordination grid built
- [ ] Healing breakdown with overheal calculated (both players)
- [ ] DPS contribution calculated
- [ ] Death forensics built (if player died)
- [ ] Wipe progression data collected
- [ ] Healer team ranking built
- [ ] Top 3-5 actionable items identified and quantified

---

## SCALING TO MULTIPLE HEALERS

When analyzing all healers in a raid:

1. Steps 1-4 (report metadata, rankings, boss timeline, healing windows) are done ONCE per boss — shared across all healers
2. Step 6 (other healers' CDs) is done ONCE and shared — every healer's analysis needs the same team CD data
3. Steps 5, 7-8 (player events, reference data) are per-player and per-spec
4. Steps 9-17 (analysis and page generation) are per-player

**Efficiency:** The team CD coordination data is pulled once and reused. Each healer analysis page shows the same CD grid but highlights a different row.

**Parallelism:** Individual healer analyses are independent after shared data is pulled.

---

## QUALITY STANDARDS

The output must be:
1. **Objective** — no opinions without data. "Late ramp" means you measured the timestamp delta. "Zero Smite" means you counted 0 cast events.
2. **Contextual** — account for death time (don't compare 3-minute performance to a full-fight reference), talent differences, ilvl gaps, team composition.
3. **Actionable** — every improvement item must say WHAT to change, WHEN in the fight it matters, and quantify the expected impact.
4. **Fair** — acknowledge what the player does well. If their Penance CPM matches the reference, say so. The page should motivate improvement, not just list failures.
5. **Specific** — "Evangelism at 2:06 was 5.6s after Bloom at 2:00. Espéon fires Evangelism at 1:57, 3s before." Not "improve ramp timing."
6. **Team-aware** — healer performance is not individual. A healer who dies costs the whole team. A healer whose CDs overlap with another healer wastes the team's CD budget. Always show the team context.
