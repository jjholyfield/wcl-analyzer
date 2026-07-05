import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// ── Spell Database ─────────────────────────────────────────────
const spellNames = JSON.parse(readFileSync(join(__dirname, 'spell-names.json'), 'utf8'));

function spellName(id) {
  return spellNames[id] || `spell-${id}`;
}

// ── Boss Ability Definitions (Mythic Salhadaar) ────────────────
const BOSS_ABILITIES = {
  1250686: { name: 'Twisting Obscurity',     type: 'raid-dot',   desc: 'Constant raid-wide DoT during intermission/add phases' },
  1285504: { name: 'Dark Radiation',          type: 'raid-burst', desc: 'Periodic heavy AoE burst — main CD trigger' },
  1254018: { name: 'Entropic Unraveling',     type: 'phase-dmg',  desc: 'Phase transition — massive sustained raid damage' },
  1284963: { name: 'Destabilizing Strikes',   type: 'constant',   desc: 'Constant tank/raid pulsing damage' },
  1260835: { name: 'Despotic Command',        type: 'raid-burst', desc: 'Periodic raid-wide burst damage' },
  1250828: { name: 'Void Exposure',           type: 'targeted',   desc: 'Targeted player damage (debuff)' },
  1262989: { name: 'Shattering Twilight',     type: 'mega-burst', desc: 'Massive burst — ALWAYS needs a CD' },
  1245592: { name: 'Torturous Extract',       type: 'targeted',   desc: 'Targeted extraction mechanic' },
  1251213: { name: 'Twilight Spikes',         type: 'targeted',   desc: 'Targeted spike damage' },
  1250803: { name: 'Shattering Twilight',     type: 'mega-burst', desc: 'Massive burst (alt ID)' },
  1260030: { name: 'Umbral Beams',            type: 'targeted',   desc: 'Beam mechanic' },
};

// ── Major Healing CDs by Class ─────────────────────────────────
// Multiple spell IDs per ability to catch variations/triggers
const HEALING_CDS = {
  // Holy Paladin
  'HPal': {
    'Avenging Wrath':      { ids: [31884, 216331, 231895, 317920], cd: 120, type: 'throughput', desc: 'Major throughput window' },
    'Aura Mastery':        { ids: [31821], cd: 180, type: 'raid-cd', desc: '3min raid-wide DR' },
    'Divine Toll':         { ids: [375576, 304971], cd: 60, type: 'burst-aoe', desc: 'Burst AoE heal' },
    'Lay on Hands':        { ids: [633], cd: 600, type: 'emergency', desc: 'Emergency single-target' },
    'Blessing of Sacrifice':{ ids: [6940], cd: 120, type: 'external', desc: 'External DR' },
    'Divine Protection':   { ids: [498], cd: 60, type: 'personal', desc: 'Personal DR' },
    'Tyr\'s Deliverance':  { ids: [200652], cd: 90, type: 'burst-aoe', desc: 'AoE burst heal' },
    'Daybreak':            { ids: [414170, 414171], cd: 60, type: 'burst-aoe', desc: 'AoE burst window' },
    'Barrier of Faith':    { ids: [148039], cd: 25, type: 'single-cd', desc: 'Single target absorb' },
    'Beacon of Virtue':    { ids: [200025], cd: 15, type: 'burst-aoe', desc: 'Multi-beacon burst' },
  },
  // Resto Shaman
  'RSham': {
    'Spirit Link Totem':   { ids: [98008], cd: 180, type: 'raid-cd', desc: '3min HP redistribution + DR' },
    'Healing Tide Totem':  { ids: [108280], cd: 180, type: 'raid-cd', desc: '3min raid-wide HoT' },
    'Ascendance':          { ids: [114052], cd: 180, type: 'throughput', desc: '3min major throughput' },
    'Ancestral Guidance':  { ids: [108281], cd: 120, type: 'throughput', desc: '2min dmg-to-healing' },
    'Mana Tide Totem':     { ids: [16191], cd: 180, type: 'utility', desc: 'Mana regen' },
    'Spiritwalker\'s Grace':{ ids: [79206], cd: 120, type: 'utility', desc: 'Casting while moving' },
    'Downpour':            { ids: [207778, 462488], cd: 35, type: 'burst-aoe', desc: 'Burst AoE heal' },
  },
  // MW Monk
  'MW': {
    'Revival':             { ids: [115310, 388615], cd: 180, type: 'raid-cd', desc: '3min instant raid heal + dispel' },
    'Invoke Yu\'lon':      { ids: [322118], cd: 180, type: 'throughput', desc: '3min major throughput pet' },
    'Invoke Chi-Ji':       { ids: [325197], cd: 180, type: 'throughput', desc: '3min fistweave throughput' },
    'Life Cocoon':         { ids: [116849], cd: 120, type: 'single-cd', desc: '2min single-target absorb' },
    'Celestial Conduit':   { ids: [443028], cd: 90, type: 'burst-aoe', desc: 'Major burst AoE' },
    'Thunder Focus Tea':   { ids: [116680], cd: 30, type: 'burst-aoe', desc: 'Next spell enhanced' },
  },
  // Preservation Evoker
  'PEvo': {
    'Rewind':              { ids: [363534], cd: 240, type: 'raid-cd', desc: '4min rewind all healing' },
    'Dream Flight':        { ids: [359816], cd: 120, type: 'burst-aoe', desc: '2min fly-through raid heal' },
    'Emerald Communion':   { ids: [370960], cd: 180, type: 'raid-cd', desc: '3min channel + raid heal' },
    'Stasis':              { ids: [370537], cd: 90, type: 'utility', desc: 'Store/replay heals' },
    'Dream Breath':        { ids: [355936], cd: 25, type: 'burst-aoe', desc: 'Empowered cone heal' },
    'Spiritbloom':         { ids: [382731], cd: 25, type: 'burst-aoe', desc: 'Empowered single/aoe heal' },
    'Temporal Anomaly':    { ids: [395152], cd: 15, type: 'burst-aoe', desc: 'AoE absorb orb' },
    'Tip the Scales':      { ids: [370553], cd: 120, type: 'utility', desc: 'Instant empower cast' },
  },
  // Holy Priest
  'HolP': {
    'Divine Hymn':         { ids: [64843], cd: 180, type: 'raid-cd', desc: '3min channel raid heal' },
    'Apotheosis':          { ids: [200183], cd: 120, type: 'throughput', desc: '2min Serenity/Sanctify reset' },
    'Holy Word: Salvation':{ ids: [265202], cd: 240, type: 'raid-cd', desc: '4min massive raid heal' },
    'Symbol of Hope':      { ids: [64901], cd: 180, type: 'utility', desc: '3min raid mana regen' },
    'Guardian Spirit':     { ids: [47788], cd: 60, type: 'single-cd', desc: 'Single-target save + heal increase' },
    'Power Word: Barrier': { ids: [62618], cd: 180, type: 'raid-cd', desc: '3min AoE DR zone (Disc)' },
  },
  // Disc Priest
  'DiscP': {
    'Power Word: Barrier': { ids: [62618], cd: 180, type: 'raid-cd', desc: '3min AoE DR zone' },
    'Evangelism':          { ids: [246287], cd: 90, type: 'throughput', desc: '1.5min extend atonements' },
    'Rapture':             { ids: [47536], cd: 90, type: 'throughput', desc: '1.5min unlimited PWS' },
    'Spirit Shell':        { ids: [109964], cd: 90, type: 'throughput', desc: '1.5min convert to absorb' },
    'Pain Suppression':    { ids: [33206], cd: 180, type: 'single-cd', desc: '3min single-target DR' },
  },
};

// Flatten all CD spell IDs into a quick lookup
const CD_LOOKUP = {};
for (const [spec, cds] of Object.entries(HEALING_CDS)) {
  for (const [cdName, info] of Object.entries(cds)) {
    for (const id of info.ids) {
      CD_LOOKUP[id] = { spec, name: cdName, ...info };
    }
  }
}

// ── Team Definitions ───────────────────────────────────────────
const TEAMS = [
  {
    name: 'Strat Roulette',
    code: '1mAGvxq7nptrJFQ2',
    fightId: 22,
    healers: [
      { name: 'Charlydin', spec: 'HPal', file: 'charlydin-fight22.json' },
      { name: 'Booninstasis', spec: 'PEvo', file: 'booninstasis-fight22.json' },
      { name: 'Montyrialú', spec: 'MW', file: 'montyrialú-fight22.json' },
      { name: 'Primetime', spec: 'HolP', file: 'primetime-fight22.json' },
      // Tessium is Elemental Shaman (DPS), not Resto
    ],
  },
  {
    name: 'Stacked',
    code: 'CrNF9DKZacqf864g',
    fightId: 38,
    healers: [
      { name: 'Shepardl', spec: 'HPal', file: 'shepardl-fight38.json' },
      { name: 'Haysevoker', spec: 'PEvo', file: 'haysevoker-fight38.json' },
      { name: 'Onlyrice', spec: 'HolP', file: 'onlyrice-fight38.json' },
      // Lolyo is Brewmaster (tank), not MW
    ],
  },
  {
    name: 'Conviction',
    code: 'xtmjZ2bJ4NHWAvKf',
    fightId: 43,
    healers: [
      { name: 'Chrolynn', spec: 'HPal', file: 'chrolynn-fight43.json' },
      { name: 'Wabssevo', spec: 'PEvo', file: 'wabssevo-fight43.json' },
      { name: 'Mistyballs', spec: 'MW', file: 'mistyballs-fight43.json' },
      { name: 'Ohnoe', spec: 'HolP', file: 'ohnoe-fight43.json' },
      // Dwarfgazmik + Elementalex are Elemental Shamans
    ],
  },
  {
    name: 'Esprit',
    code: 'Czxy4b9rTjnRPJvg',
    fightId: 13,
    healers: [
      { name: 'Ohfuk', spec: 'HPal', file: 'ohfuk-fight13.json' },
      { name: 'Soil', spec: 'PEvo', file: 'soil-fight13.json' },
      { name: 'Maczterrible', spec: 'HolP', file: 'maczterrible-fight13.json' },
      // No RSham or MW healer identified
    ],
  },
  {
    name: 'Fraudes',
    code: 'dQmvYyL1MnkD2XRC',
    fightId: 20,
    healers: [
      { name: 'Concha', spec: 'HPal', file: 'concha-fight20.json' },
      { name: 'Uyynt', spec: 'PEvo', file: 'uyynt-fight20.json' },
      { name: 'Erloko', spec: 'HolP', file: 'erloko-fight20.json' },
      // No RSham or MW healer identified
    ],
  },
];

// ── Analysis Functions ─────────────────────────────────────────

function loadHealerData(team, healer) {
  const filePath = join(DATA_DIR, team.code, healer.file);
  if (!existsSync(filePath)) {
    console.error(`  WARNING: Missing data file ${healer.file}`);
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function extractCDTimings(data) {
  if (!data) return [];
  const fightStart = data.fight.startTime;
  const cds = [];

  // Check casts
  for (const event of data.events.casts) {
    if (event.type !== 'cast') continue;
    const id = event.abilityGameID;
    if (CD_LOOKUP[id]) {
      const cd = CD_LOOKUP[id];
      // Only track significant CDs (>= 60s cooldown), skip minor ones
      if (cd.cd >= 60) {
        cds.push({
          time: ((event.timestamp - fightStart) / 1000).toFixed(1),
          timeRaw: (event.timestamp - fightStart) / 1000,
          ability: cd.name,
          spec: cd.spec,
          type: cd.type,
          cd: cd.cd,
          spellId: id,
        });
      }
    }
  }

  // Also check buffs for CDs that might only show as buff applications
  for (const event of data.events.buffs) {
    if (event.type !== 'applybuff') continue;
    const id = event.abilityGameID;
    if (CD_LOOKUP[id] && CD_LOOKUP[id].cd >= 60) {
      const cd = CD_LOOKUP[id];
      const timeRaw = (event.timestamp - fightStart) / 1000;
      // Check if we already have a cast event within 1 second
      const alreadyTracked = cds.some(c => c.ability === cd.name && Math.abs(c.timeRaw - timeRaw) < 1.5);
      if (!alreadyTracked) {
        cds.push({
          time: timeRaw.toFixed(1),
          timeRaw,
          ability: cd.name,
          spec: cd.spec,
          type: cd.type,
          cd: cd.cd,
          spellId: id,
        });
      }
    }
  }

  // Sort by time
  cds.sort((a, b) => a.timeRaw - b.timeRaw);
  return cds;
}

function extractBossDamagePhases(team) {
  // We use the first healer's data to get fight timing, then estimate boss phases
  // from the known boss ability timings
  const firstHealer = team.healers[0];
  const data = loadHealerData(team, firstHealer);
  if (!data) return { duration: 0, phases: [] };

  const duration = data.fight.duration / 1000;
  return { duration };
}

// ── Known Boss Ability Timeline (from Team 1 analysis) ─────────
// Extracted from the damage event timestamps
const BOSS_TIMELINE = {
  'Twisting Obscurity': {
    desc: 'Constant raid-wide DoT — hits every second during active phases',
    windows: [
      { start: 16, end: 52, note: 'Phase 1 adds' },
      { start: 62, end: 98, note: 'Phase 1 adds wave 2' },
      { start: 139, end: 175, note: 'Phase 2 adds' },
      { start: 185, end: 221, note: 'Phase 2 adds wave 2' },
      { start: 259, end: 295, note: 'Phase 3 adds' },
      { start: 304, end: 340, note: 'Phase 3 adds / burn' },
    ],
  },
  'Dark Radiation': {
    desc: 'Heavy AoE burst — hits ~20 players every ~2s during windows',
    windows: [
      { start: 28, end: 36, note: 'First set' },
      { start: 47, end: 55, note: 'Second set' },
      { start: 80, end: 87, note: 'Third set' },
      { start: 94, end: 101, note: 'Fourth set' },
      { start: 154, end: 161, note: 'Fifth set' },
      { start: 171, end: 178, note: 'Sixth set' },
      { start: 204, end: 211, note: 'Seventh set' },
      { start: 217, end: 224, note: 'Eighth set' },
      { start: 281, end: 298, note: 'Ninth set (extended)' },
      { start: 327, end: 349, note: 'Final set (burn phase)' },
    ],
  },
  'Entropic Unraveling': {
    desc: 'Phase transition — massive sustained raid damage for ~20s',
    windows: [
      { start: 103, end: 122, note: 'TRANSITION 1 — HEAVY CD REQUIRED' },
      { start: 224, end: 243, note: 'TRANSITION 2 — HEAVY CD REQUIRED' },
      { start: 346, end: 362, note: 'TRANSITION 3 / BURN — CD REQUIRED' },
    ],
  },
  'Shattering Twilight': {
    desc: 'Massive single burst hit — always needs a personal or external',
    times: [54.2, 100.4, 175.8, 222.0, 297.4, 342.4],
  },
  'Despotic Command': {
    desc: 'Periodic raid-wide burst — 12s ticking for ~12s each wave',
    windows: [
      { start: 24, end: 36, note: 'First' },
      { start: 71, end: 82, note: 'Second' },
      { start: 146, end: 158, note: 'Third' },
      { start: 191, end: 203, note: 'Fourth' },
      { start: 267, end: 279, note: 'Fifth' },
      { start: 313, end: 324, note: 'Sixth' },
    ],
  },
};

// ── Phase Breakdown ────────────────────────────────────────────
const PHASES = [
  { name: 'PHASE 1 — Boss Active', start: 0, end: 15, note: 'Light damage, build HoTs' },
  { name: 'P1 ADD WAVE 1 + Twisting Obscurity', start: 16, end: 55, note: 'Adds spawn, raid-wide DoT + Dark Radiation starts' },
  { name: 'P1 ADD WAVE 2 + Twisting Obscurity', start: 56, end: 102, note: 'Second add wave, more Dark Radiation sets' },
  { name: 'TRANSITION 1 — Entropic Unraveling', start: 103, end: 125, note: '*** HEAVIEST DAMAGE *** Stack CDs here' },
  { name: 'P2 BOSS ACTIVE', start: 126, end: 138, note: 'Brief respite, prep for next adds' },
  { name: 'P2 ADD WAVE 1 + Twisting Obscurity', start: 139, end: 180, note: 'Adds + DoT + Dark Radiation' },
  { name: 'P2 ADD WAVE 2 + Twisting Obscurity', start: 181, end: 223, note: 'More adds + Dark Radiation' },
  { name: 'TRANSITION 2 — Entropic Unraveling', start: 224, end: 247, note: '*** HEAVIEST DAMAGE *** Stack CDs here' },
  { name: 'P3 BOSS ACTIVE / Ramp to Burn', start: 248, end: 258, note: 'Brief window' },
  { name: 'P3 ADDS + BURN PHASE', start: 259, end: 362, note: 'Final adds, Dark Radiation extended, Transition 3 at end' },
];

// ── Main Analysis ──────────────────────────────────────────────

function findPhase(timeSec) {
  for (const p of PHASES) {
    if (timeSec >= p.start && timeSec <= p.end) return p.name;
  }
  return 'Unknown';
}

function findBossAbility(timeSec) {
  const abilities = [];
  for (const [name, info] of Object.entries(BOSS_TIMELINE)) {
    if (info.windows) {
      for (const w of info.windows) {
        if (timeSec >= w.start - 2 && timeSec <= w.end + 2) {
          abilities.push(`${name} (${w.note})`);
        }
      }
    }
    if (info.times) {
      for (const t of info.times) {
        if (Math.abs(timeSec - t) < 3) {
          abilities.push(name);
        }
      }
    }
  }
  return abilities.length > 0 ? abilities.join(' + ') : 'No major ability';
}

console.log('');
console.log('='.repeat(120));
console.log('  MYTHIC SALHADAAR — HEALING CD TIMELINE ANALYSIS');
console.log('  Analyzed from top-ranked kills across 5 different teams');
console.log('='.repeat(120));

// ── Section 1: Boss Ability Timeline ────────────────────────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 1: BOSS ABILITY TIMELINE');
console.log('━'.repeat(120));
console.log('\nFight Duration: ~350-370 seconds (5:50 - 6:10)');
console.log('\nPhase Breakdown:');
for (const p of PHASES) {
  const dur = p.end - p.start;
  console.log(`  ${formatTime(p.start)}-${formatTime(p.end)} (${dur}s) │ ${p.name}`);
  console.log(`  ${''.padStart(20)}│ ${p.note}`);
}

console.log('\nDamage Events by Ability:');
for (const [name, info] of Object.entries(BOSS_TIMELINE)) {
  console.log(`\n  ${name}: ${info.desc}`);
  if (info.windows) {
    for (const w of info.windows) {
      console.log(`    ${formatTime(w.start)}-${formatTime(w.end)} │ ${w.note}`);
    }
  }
  if (info.times) {
    console.log(`    Hits at: ${info.times.map(t => formatTime(t)).join(', ')}`);
  }
}

// ── Section 2: Per-Team CD Usage ────────────────────────────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 2: CD USAGE BY TEAM');
console.log('━'.repeat(120));

const allTeamCDs = [];

for (const team of TEAMS) {
  console.log(`\n${'─'.repeat(100)}`);
  console.log(`  TEAM: ${team.name} (Report: ${team.code}, Fight: ${team.fightId})`);
  console.log(`  Healer comp: ${team.healers.map(h => `${h.name} (${h.spec})`).join(', ')}`);
  console.log(`${'─'.repeat(100)}`);

  const teamCDs = [];

  for (const healer of team.healers) {
    const data = loadHealerData(team, healer);
    if (!data) continue;

    const cds = extractCDTimings(data);
    const fightDur = (data.fight.duration / 1000).toFixed(0);

    console.log(`\n  ${healer.name} (${healer.spec}) — Fight: ${fightDur}s | HPS: ${data.summary.hps}`);
    console.log(`  ${'─'.repeat(90)}`);

    if (cds.length === 0) {
      console.log(`    No major CDs detected in cast/buff data`);
      continue;
    }

    for (const cd of cds) {
      const phase = findPhase(cd.timeRaw);
      const bossAbility = findBossAbility(cd.timeRaw);
      const marker = cd.type === 'raid-cd' ? ' ★★★' : cd.type === 'throughput' ? ' ★★' : cd.type === 'burst-aoe' ? ' ★' : '';
      console.log(`    ${formatTime(cd.timeRaw)} │ ${cd.ability.padEnd(25)} │ ${cd.type.padEnd(12)} │ Covering: ${bossAbility}${marker}`);
      teamCDs.push({ ...cd, healer: healer.name, spec: healer.spec, team: team.name });
    }
  }

  allTeamCDs.push({ team: team.name, cds: teamCDs });
}

// ── Section 3: Consensus Analysis ───────────────────────────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 3: CONSENSUS PATTERNS — What CDs Cover Which Boss Abilities');
console.log('━'.repeat(120));

// Group all CDs by time windows matching boss abilities
const CRITICAL_WINDOWS = [
  { name: 'Dark Radiation #1', start: 26, end: 38, importance: 'HIGH' },
  { name: 'Dark Radiation #2', start: 45, end: 57, importance: 'HIGH' },
  { name: 'Shattering Twilight #1', start: 52, end: 56, importance: 'MEDIUM' },
  { name: 'Dark Radiation #3', start: 78, end: 89, importance: 'HIGH' },
  { name: 'Dark Radiation #4', start: 92, end: 103, importance: 'HIGH' },
  { name: 'Shattering Twilight #2', start: 98, end: 103, importance: 'MEDIUM' },
  { name: '★★★ TRANSITION 1 (Entropic Unraveling)', start: 100, end: 127, importance: 'CRITICAL' },
  { name: 'Dark Radiation #5', start: 152, end: 163, importance: 'HIGH' },
  { name: 'Dark Radiation #6', start: 169, end: 180, importance: 'HIGH' },
  { name: 'Shattering Twilight #3', start: 173, end: 178, importance: 'MEDIUM' },
  { name: 'Dark Radiation #7', start: 202, end: 213, importance: 'HIGH' },
  { name: 'Dark Radiation #8', start: 215, end: 226, importance: 'HIGH' },
  { name: 'Shattering Twilight #4', start: 220, end: 224, importance: 'MEDIUM' },
  { name: '★★★ TRANSITION 2 (Entropic Unraveling)', start: 222, end: 247, importance: 'CRITICAL' },
  { name: 'Dark Radiation #9 (Extended)', start: 279, end: 300, importance: 'HIGH' },
  { name: 'Shattering Twilight #5', start: 295, end: 300, importance: 'MEDIUM' },
  { name: 'Dark Radiation #10 (Burn)', start: 325, end: 350, importance: 'CRITICAL' },
  { name: 'Shattering Twilight #6', start: 340, end: 345, importance: 'MEDIUM' },
  { name: '★★★ TRANSITION 3 / BURN END', start: 344, end: 365, importance: 'CRITICAL' },
];

for (const window of CRITICAL_WINDOWS) {
  const cdsInWindow = [];
  for (const teamData of allTeamCDs) {
    for (const cd of teamData.cds) {
      if (cd.timeRaw >= window.start - 3 && cd.timeRaw <= window.end + 3) {
        cdsInWindow.push(cd);
      }
    }
  }

  if (cdsInWindow.length > 0) {
    const importanceTag = window.importance === 'CRITICAL' ? ' <<<< MUST HAVE CDs' :
                          window.importance === 'HIGH' ? ' << Should have CD' : '';
    console.log(`\n  ${window.name} (${formatTime(window.start)}-${formatTime(window.end)})${importanceTag}`);
    console.log(`  ${'─'.repeat(95)}`);

    // Group by team
    const byTeam = {};
    for (const cd of cdsInWindow) {
      if (!byTeam[cd.team]) byTeam[cd.team] = [];
      byTeam[cd.team].push(cd);
    }

    for (const [team, cds] of Object.entries(byTeam)) {
      const cdList = cds.map(c => `${c.healer}:${c.ability}`).join(', ');
      console.log(`    ${team.padEnd(18)} │ ${cdList}`);
    }
  }
}

// ── Section 4: Recommended CD Assignment for Josh's Comp ────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 4: RECOMMENDED CD ASSIGNMENT');
console.log('  Comp: HPal (McPounding) | RSham (Brew) | MW (Mackspal) | PEvo (Deuche)');
console.log('━'.repeat(120));

// Build based on what top teams do
const ASSIGNMENT = [
  {
    time: '0:00-0:15',
    phase: 'P1 Boss Active',
    damage: 'Light',
    cds: 'None needed — build HoTs, ramp',
    notes: 'PEvo: prep Dream Breath. RSham: Riptide around. MW: Renewing Mist spread.',
  },
  {
    time: '0:16-0:28',
    phase: 'P1 Adds Wave 1',
    damage: 'Moderate (Twisting Obscurity)',
    cds: 'McPounding: Divine Toll (0:20)',
    notes: 'Standard healing throughput. Twisting Obscurity starts ticking on raid.',
  },
  {
    time: '0:28-0:36',
    phase: 'Dark Radiation #1',
    damage: 'HIGH — Dark Radiation + Twisting Obscurity overlap',
    cds: 'Brew: Healing Tide Totem (0:28) | Deuche: Dream Flight (0:30)',
    notes: 'First heavy damage combo. RSham HTT covers the window. PEvo Dream Flight for burst.',
  },
  {
    time: '0:47-0:55',
    phase: 'Dark Radiation #2 + Shattering Twilight',
    damage: 'HIGH — Dark Radiation + potential Shattering Twilight at 0:54',
    cds: 'McPounding: Avenging Wrath (0:47) + Aura Mastery if needed',
    notes: 'HPal AW gives throughput window. Shattering Twilight target needs externals.',
  },
  {
    time: '0:56-1:02',
    phase: 'P1 Add Wave 2 Start',
    damage: 'Moderate (Twisting Obscurity resumes)',
    cds: 'Mackspal: Celestial Conduit (1:00) or Yu\'lon/Chi-Ji',
    notes: 'MW handles this window with throughput CD.',
  },
  {
    time: '1:18-1:30',
    phase: 'Dark Radiation #3+4 overlap',
    damage: 'HIGH — Dark Radiation sets back-to-back',
    cds: 'Brew: Spirit Link Totem (1:20) | Deuche: Emerald Communion (1:22)',
    notes: 'SLT equalizes HP. PEvo channels communion for sustained healing.',
  },
  {
    time: '1:38-1:42',
    phase: 'Shattering Twilight #2',
    damage: 'SPIKE — one-shot potential',
    cds: 'McPounding: Blessing of Sacrifice on target',
    notes: 'External the Shattering Twilight target.',
  },
  {
    time: '1:43-2:07',
    phase: '★★★ TRANSITION 1 — ENTROPIC UNRAVELING',
    damage: 'CRITICAL — heaviest sustained damage in the fight',
    cds: [
      'Mackspal: Revival (1:43) — instant raid heal + dispel',
      'McPounding: Aura Mastery (1:45) — raid-wide DR',
      'Brew: Ascendance (1:48) — major throughput',
      'Deuche: Rewind (1:55) — covers tail end of transition',
    ].join('\n             '),
    notes: 'STACK EVERYTHING. This is the first transition. All major raid CDs go here.',
  },
  {
    time: '2:08-2:18',
    phase: 'P2 Boss Active (Brief)',
    damage: 'Low — recovery window',
    cds: 'None — drink/regen. Prep for next add phase.',
    notes: 'McPounding: Divine Toll (off CD). Deuche: Dream Breath. Spread HoTs.',
  },
  {
    time: '2:19-2:40',
    phase: 'P2 Adds + Twisting Obscurity',
    damage: 'Moderate to High',
    cds: 'Brew: Healing Tide Totem #2 (2:28) | McPounding: Avenging Wrath #2 (2:28)',
    notes: 'Second uses of 3min CDs start coming back. HTT again for add phase.',
  },
  {
    time: '2:32-2:43',
    phase: 'Dark Radiation #5+6',
    damage: 'HIGH',
    cds: 'Deuche: Dream Flight #2 (2:35) | Mackspal: Celestial Conduit #2 (2:38)',
    notes: 'PEvo Dream Flight on 2min CD back up. MW burst.',
  },
  {
    time: '2:53-3:00',
    phase: 'Shattering Twilight #3',
    damage: 'SPIKE',
    cds: 'McPounding: BoSac on target | Mackspal: Life Cocoon',
    notes: 'External the target. MW cocoon if BoSac on CD.',
  },
  {
    time: '3:22-3:40',
    phase: 'Dark Radiation #7+8 + Shattering Twilight #4',
    damage: 'HIGH — overlapping damage',
    cds: 'Brew: Spirit Link Totem #2 (3:25) | Deuche: Emerald Communion #2 (3:28)',
    notes: 'SLT #2 (3min CD back). PEvo communion #2.',
  },
  {
    time: '3:42-4:07',
    phase: '★★★ TRANSITION 2 — ENTROPIC UNRAVELING',
    damage: 'CRITICAL — same as Transition 1',
    cds: [
      'Mackspal: Revival #2 (3:43) — raid heal',
      'McPounding: Aura Mastery #2 (3:45) — raid DR',
      'Brew: Ascendance #2 (3:48) — throughput',
      'Deuche: Rewind #2 (3:55) — 4min CD back up',
    ].join('\n             '),
    notes: 'SAME PLAN as Transition 1. All 3min CDs should be back.',
  },
  {
    time: '4:08-4:18',
    phase: 'P3 Boss Active (Brief)',
    damage: 'Low — recover',
    cds: 'Ramp and prepare for burn phase',
    notes: 'This is the last breather before the burn.',
  },
  {
    time: '4:19-5:00',
    phase: 'P3 Adds + Extended Dark Radiation',
    damage: 'VERY HIGH — everything stacks up',
    cds: [
      'Brew: Healing Tide Totem #3 (4:30)',
      'McPounding: Avenging Wrath #3 (4:30)',
      'Deuche: Dream Flight #3 (4:35)',
    ].join('\n             '),
    notes: 'Third use of 3min CDs. Dark Radiation is extended here.',
  },
  {
    time: '5:00-5:20',
    phase: 'Shattering Twilight #5+6 + Dark Radiation Burn',
    damage: 'CRITICAL — overlapping everything',
    cds: [
      'Brew: Spirit Link Totem #3 (5:00)',
      'Mackspal: Celestial Conduit #3 + Chi-Ji/Yu\'lon (5:05)',
      'McPounding: BoSac / Divine Protection as needed',
    ].join('\n             '),
    notes: 'SLT #3 for HP equalize during burn. MW goes all-in.',
  },
  {
    time: '5:20-5:50',
    phase: '★★★ TRANSITION 3 / BURN END',
    damage: 'CRITICAL — final transition, must survive',
    cds: [
      'Deuche: Rewind (if 4min CD is back) or Emerald Communion #3',
      'McPounding: Aura Mastery #3 (if back) or Lay on Hands emergency',
      'Brew: Ascendance #3 / HTT overlap if available',
      'Mackspal: Revival should NOT be up — use Life Cocoon + externals',
    ].join('\n             '),
    notes: 'Whatever you have left. Lust here if not lusted on Transition 1.',
  },
];

for (const a of ASSIGNMENT) {
  console.log(`\n  ${a.time} │ ${a.phase}`);
  console.log(`  Damage: ${a.damage}`);
  console.log(`  CDs:    ${a.cds}`);
  console.log(`  Notes:  ${a.notes}`);
}

// ── Section 5: CD Assignment Summary Grid ───────────────────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 5: QUICK REFERENCE — CD ASSIGNMENT GRID');
console.log('  McPounding (HPal) | Brew (RSham) | Mackspal (MW) | Deuche (PEvo)');
console.log('━'.repeat(120));

const GRID = [
  ['TIME',   'BOSS ABILITY',              'McPounding (HPal)',           'Brew (RSham)',              'Mackspal (MW)',              'Deuche (PEvo)'],
  ['0:20',   'P1 Adds start',             'Divine Toll',                 '---',                       '---',                        '---'],
  ['0:28',   'Dark Rad #1',               '---',                         'Healing Tide ①',           '---',                        'Dream Flight ①'],
  ['0:47',   'Dark Rad #2',               'Avenging Wrath ①',           '---',                       '---',                        '---'],
  ['1:00',   'P1 Adds Wave 2',            '---',                         '---',                       'Cel. Conduit ①',            '---'],
  ['1:20',   'Dark Rad #3+4',             '---',                         'Spirit Link ①',            '---',                        'Emerald Comm ①'],
  ['1:40',   'Shatt Twilight #2',         'BoSac (target)',              '---',                       '---',                        '---'],
  ['1:43',   '★ TRANSITION 1',           'Aura Mastery ①',             'Ascendance ①',              'Revival ①',                  'Rewind ①'],
  ['2:28',   'P2 Dark Rad #5',            'AW ② + Div Toll',            'Healing Tide ②',           '---',                        '---'],
  ['2:35',   'Dark Rad #6',               '---',                         '---',                       'Cel. Conduit ②',            'Dream Flight ②'],
  ['2:55',   'Shatt Twilight #3',         'BoSac (target)',              '---',                       'Life Cocoon',                '---'],
  ['3:25',   'Dark Rad #7+8',             '---',                         'Spirit Link ②',            '---',                        'Emerald Comm ②'],
  ['3:43',   '★ TRANSITION 2',           'Aura Mastery ②',             'Ascendance ②',              'Revival ②',                  'Rewind ②'],
  ['4:30',   'P3 Adds + DR#9',            'AW ③ + Div Toll',            'Healing Tide ③',           '---',                        'Dream Flight ③'],
  ['5:00',   'DR#10 Burn',                '---',                         'Spirit Link ③',            'Cel. Conduit ③',            '---'],
  ['5:05',   'Shatt Twilight #5+6',       'BoSac (target)',              '---',                       'Chi-Ji/Yu\'lon',             '---'],
  ['5:25',   '★ TRANSITION 3',           'AM③ or LoH',                  'Ascendance ③',              'Cocoon/externals',           'Em.Comm③ or Rewind③'],
];

// Print grid
const widths = GRID[0].map((_, i) => Math.max(...GRID.map(row => (row[i] || '').length)));
const separator = widths.map(w => '─'.repeat(w + 2)).join('┼');

for (let r = 0; r < GRID.length; r++) {
  if (r === 1) console.log(`  ┼${separator}┼`);
  const row = GRID[r].map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('│');
  console.log(`  │${row}│`);
}

// ── Section 6: Key Insights ─────────────────────────────────────
console.log('\n');
console.log('━'.repeat(120));
console.log('  SECTION 6: KEY INSIGHTS FROM ANALYZED KILLS');
console.log('━'.repeat(120));

console.log(`
  1. HEALER COMP PATTERNS:
     - Every team runs Holy Paladin + Preservation Evoker + Priest healer (3 is the core)
     - MW Monk and Resto Shaman are RARE — most teams bring 0 or 1
     - Many teams bring Elemental Shamans (DPS) for their off-healing + raid utility
     - Josh's comp (HPal/RSham/MW/PEvo) is STRONG because RSham and MW bring CDs most teams lack

  2. TRANSITION PHASES ARE KING:
     - Entropic Unraveling (transitions at ~1:43 and ~3:43) is the #1 wipe mechanic
     - EVERY team stacks 3-4 major raid CDs on each transition
     - Aura Mastery (HPal) + a throughput CD + a raid heal CD is the minimum
     - With RSham (SLT/HTT/Ascendance) + MW (Revival), Josh has MORE transition coverage than most teams

  3. DARK RADIATION REQUIRES STEADY CD ROTATION:
     - Dark Radiation comes in sets of 2-4 bursts, ~6-8 seconds apart
     - Teams rotate throughput CDs (AW, Dream Flight, Celestial Conduit) through these windows
     - The overlap of Dark Radiation + Twisting Obscurity is where most deaths happen

  4. SHATTERING TWILIGHT IS A PERSONAL/EXTERNAL CHECK:
     - ~3.9M damage to one person — needs Blessing of Sacrifice, Life Cocoon, or a personal
     - Comes ~every 45-55 seconds, fairly predictable
     - Assign specific externals to each Shattering Twilight

  5. BURN PHASE (P3, 4:19+) IS THE TIGHTEST:
     - Dark Radiation extends to 20+ seconds (vs 8s earlier)
     - Third transition overlaps with ongoing adds
     - Third-use CDs from 3min cooldowns are essential — don't waste earlier
     - This is where Bloodlust/Heroism goes if not used on Transition 1

  6. YOUR COMP ADVANTAGE:
     - RSham brings Spirit Link Totem — HP equalization is UNIQUE and extremely powerful for Dark Radiation
     - MW Revival is an instant raid heal + dispel — perfect for transition entry
     - PEvo Rewind is the strongest "oh shit" button for transitions
     - HPal Aura Mastery provides consistent DR every 3min for transitions
     - You have 4 distinct raid CDs for each transition vs most teams having 2-3
`);

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
