import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// ── Formatting Helpers ────────────────────────────────────────
function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDelta(seconds) {
  const sign = seconds >= 0 ? '+' : '-';
  return `${sign}${Math.abs(seconds).toFixed(1)}s`;
}

// ── Major Healing CDs (same as healer-cd-timeline.mjs) ────────
const HEALING_CDS = {
  'HPal': {
    'Avenging Wrath':      { ids: [31884, 216331, 231895, 317920], cd: 120, type: 'throughput' },
    'Aura Mastery':        { ids: [31821], cd: 180, type: 'raid-cd' },
    'Divine Toll':         { ids: [375576, 304971], cd: 60, type: 'burst-aoe' },
    'Lay on Hands':        { ids: [633], cd: 600, type: 'emergency' },
    'Blessing of Sacrifice':{ ids: [6940], cd: 120, type: 'external' },
    'Tyr\'s Deliverance':  { ids: [200652], cd: 90, type: 'burst-aoe' },
    'Daybreak':            { ids: [414170, 414171], cd: 60, type: 'burst-aoe' },
  },
  'RSham': {
    'Spirit Link Totem':   { ids: [98008], cd: 180, type: 'raid-cd' },
    'Healing Tide Totem':  { ids: [108280], cd: 180, type: 'raid-cd' },
    'Ascendance':          { ids: [114052], cd: 180, type: 'throughput' },
    'Ancestral Guidance':  { ids: [108281], cd: 120, type: 'throughput' },
    'Mana Tide Totem':     { ids: [16191], cd: 180, type: 'utility' },
  },
  'MW': {
    'Revival':             { ids: [115310, 388615], cd: 180, type: 'raid-cd' },
    'Invoke Yu\'lon':      { ids: [322118], cd: 180, type: 'throughput' },
    'Invoke Chi-Ji':       { ids: [325197], cd: 180, type: 'throughput' },
    'Life Cocoon':         { ids: [116849], cd: 120, type: 'single-cd' },
    'Celestial Conduit':   { ids: [443028], cd: 90, type: 'burst-aoe' },
  },
  'PEvo': {
    'Rewind':              { ids: [363534], cd: 240, type: 'raid-cd' },
    'Dream Flight':        { ids: [359816], cd: 120, type: 'burst-aoe' },
    'Emerald Communion':   { ids: [370960], cd: 180, type: 'raid-cd' },
    'Stasis':              { ids: [370537], cd: 90, type: 'utility' },
    'Tip the Scales':      { ids: [370553], cd: 120, type: 'utility' },
  },
  'HolP': {
    'Divine Hymn':         { ids: [64843], cd: 180, type: 'raid-cd' },
    'Apotheosis':          { ids: [200183], cd: 120, type: 'throughput' },
    'Holy Word: Salvation':{ ids: [265202], cd: 240, type: 'raid-cd' },
    'Symbol of Hope':      { ids: [64901], cd: 180, type: 'utility' },
    'Guardian Spirit':     { ids: [47788], cd: 60, type: 'single-cd' },
  },
  'DiscP': {
    'Power Word: Barrier': { ids: [62618], cd: 180, type: 'raid-cd' },
    'Evangelism':          { ids: [246287], cd: 90, type: 'throughput' },
    'Rapture':             { ids: [47536], cd: 90, type: 'throughput' },
    'Pain Suppression':    { ids: [33206], cd: 180, type: 'single-cd' },
  },
};

// Flatten all CD spell IDs
const CD_LOOKUP = {};
for (const [spec, cds] of Object.entries(HEALING_CDS)) {
  for (const [cdName, info] of Object.entries(cds)) {
    for (const id of info.ids) {
      CD_LOOKUP[id] = { spec, name: cdName, ...info };
    }
  }
}

// ── Team Definitions ──────────────────────────────────────────
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
    ],
  },
];

// ── Key boss ability spell IDs (the ones that matter for CD planning) ──
const BOSS_ABILITY_CAST_IDS = {
  1285211: 'Dark Radiation',
  1246175: 'Entropic Unraveling',
  1253032: 'Shattering Twilight',
  1260823: 'Despotic Command',
  1250686: 'Twisting Obscurity',
  1243453: 'Void Convergence',
  1250828: 'Void Exposure',
  1245592: 'Torturous Extract',
  1254081: 'Fractured Projection',
  1271577: 'Destabilizing Strikes',
  1260030: 'Umbral Beams',
  1251213: 'Twilight Spikes',
};

// Damage spell IDs (different from cast IDs for some abilities)
const BOSS_DAMAGE_IDS = {
  1285504: 'Dark Radiation',       // damage ID differs from cast ID 1285211
  1254018: 'Entropic Unraveling',  // damage ID differs from cast ID 1246175
  1262989: 'Shattering Twilight (AoE)',
  1250803: 'Shattering Twilight (ST)',
  1284963: 'Destabilizing Strikes',
  1260835: 'Despotic Command',
  1250686: 'Twisting Obscurity',
  1250828: 'Void Exposure',
  1245592: 'Torturous Extract',
  1251213: 'Twilight Spikes',
  1260030: 'Umbral Beams',
};

// Which boss abilities are raid-wide and need healing CDs
const RAIDWIDE_ABILITIES = [
  'Dark Radiation',
  'Entropic Unraveling',
  'Despotic Command',
  'Twisting Obscurity',
  'Shattering Twilight',
  'Shattering Twilight (AoE)',
];

// ── Load Boss Ability Data ────────────────────────────────────
function loadBossAbilities(team) {
  const filePath = join(DATA_DIR, team.code, `boss-abilities-fight${team.fightId}.json`);
  if (!existsSync(filePath)) {
    console.error(`  MISSING: ${filePath}`);
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// Extract boss cast events with relative timestamps
function extractBossCasts(bossData) {
  if (!bossData) return [];
  const fightStart = bossData.fight.startTime;
  const casts = [];

  for (const event of bossData.enemyCasts) {
    const id = event.abilityGameID;
    const name = BOSS_ABILITY_CAST_IDS[id];
    if (!name) continue; // Skip non-boss abilities (player pets, etc.)

    casts.push({
      timeSec: (event.timestamp - fightStart) / 1000,
      name,
      spellId: id,
      sourceId: event.sourceID,
    });
  }

  casts.sort((a, b) => a.timeSec - b.timeSec);
  return casts;
}

// Extract boss damage windows from damage events
function extractBossDamageWindows(bossData) {
  if (!bossData) return {};
  const fightStart = bossData.fight.startTime;
  const windows = {};

  for (const event of bossData.enemyDamage) {
    const id = event.abilityGameID;
    const name = BOSS_DAMAGE_IDS[id];
    if (!name) continue;

    if (!windows[name]) windows[name] = [];
    windows[name].push({
      timeSec: (event.timestamp - fightStart) / 1000,
      damage: (event.amount || 0) + (event.absorbed || 0),
      targetId: event.targetID,
    });
  }

  return windows;
}

// Cluster damage events into windows (group hits within Xs of each other)
function clusterDamageWindows(events, gapThreshold = 5) {
  if (events.length === 0) return [];
  events.sort((a, b) => a.timeSec - b.timeSec);

  const clusters = [];
  let current = { start: events[0].timeSec, end: events[0].timeSec, totalDmg: 0, hits: 0, targets: new Set() };

  for (const e of events) {
    if (e.timeSec - current.end > gapThreshold) {
      current.targets = current.targets.size;
      clusters.push(current);
      current = { start: e.timeSec, end: e.timeSec, totalDmg: 0, hits: 0, targets: new Set() };
    }
    current.end = e.timeSec;
    current.totalDmg += e.damage;
    current.hits++;
    current.targets.add(e.targetId);
  }
  current.targets = current.targets.size;
  clusters.push(current);

  return clusters;
}

// ── Load Healer CD Data ──────────────────────────────────────
function loadHealerData(team, healer) {
  const filePath = join(DATA_DIR, team.code, healer.file);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function extractCDTimings(data) {
  if (!data) return [];
  const fightStart = data.fight.startTime;
  const cds = [];

  for (const event of data.events.casts) {
    if (event.type !== 'cast') continue;
    const id = event.abilityGameID;
    if (CD_LOOKUP[id] && CD_LOOKUP[id].cd >= 60) {
      const cd = CD_LOOKUP[id];
      cds.push({
        timeSec: (event.timestamp - fightStart) / 1000,
        ability: cd.name,
        spec: cd.spec,
        type: cd.type,
        cd: cd.cd,
      });
    }
  }

  // Also check buffs
  for (const event of data.events.buffs) {
    if (event.type !== 'applybuff') continue;
    const id = event.abilityGameID;
    if (CD_LOOKUP[id] && CD_LOOKUP[id].cd >= 60) {
      const cd = CD_LOOKUP[id];
      const timeSec = (event.timestamp - fightStart) / 1000;
      const alreadyTracked = cds.some(c => c.ability === cd.name && Math.abs(c.timeSec - timeSec) < 1.5);
      if (!alreadyTracked) {
        cds.push({
          timeSec,
          ability: cd.name,
          spec: cd.spec,
          type: cd.type,
          cd: cd.cd,
        });
      }
    }
  }

  cds.sort((a, b) => a.timeSec - b.timeSec);
  return cds;
}

// ── Find nearest boss ability for a healer CD ─────────────────
function findNearestBossAbility(cdTimeSec, bossWindows, windowSec = 10) {
  let nearest = null;
  let nearestDelta = Infinity;

  for (const [abilityName, clusters] of Object.entries(bossWindows)) {
    if (!RAIDWIDE_ABILITIES.includes(abilityName)) continue;
    for (const cluster of clusters) {
      // Check if the CD is within windowSec of the start of the damage window
      const delta = cdTimeSec - cluster.start;
      if (Math.abs(delta) < nearestDelta && delta >= -5 && delta <= windowSec + 5) {
        nearestDelta = Math.abs(delta);
        nearest = {
          ability: abilityName,
          windowStart: cluster.start,
          windowEnd: cluster.end,
          delta,
          totalDmg: cluster.totalDmg,
          hits: cluster.hits,
          targets: cluster.targets,
        };
      }
    }
  }

  return nearest;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ANALYSIS
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('='.repeat(130));
console.log('  MYTHIC SALHADAAR — BOSS ABILITY / HEALING CD CORRELATION');
console.log('  Data: ACTUAL boss casts + damage from WCL API for 5 Mythic kills');
console.log('='.repeat(130));

// ── Section 1: Actual Boss Ability Timelines ──────────────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 1: ACTUAL BOSS ABILITY CAST TIMELINES (from WCL API)');
console.log('━'.repeat(130));

const allBossData = {};
const allBossClusters = {};
const allHealerCDs = {};

for (const team of TEAMS) {
  const bossData = loadBossAbilities(team);
  if (!bossData) continue;

  const casts = extractBossCasts(bossData);
  const damageWindows = extractBossDamageWindows(bossData);
  const fightDur = bossData.fight.duration / 1000;

  // Cluster damage into windows
  const clusters = {};
  for (const [name, events] of Object.entries(damageWindows)) {
    clusters[name] = clusterDamageWindows(events, name === 'Twisting Obscurity' ? 3 : 5);
  }

  allBossData[team.code] = { casts, damageWindows, clusters, fightDur };
  allBossClusters[team.code] = clusters;

  console.log(`\n${'─'.repeat(110)}`);
  console.log(`  ${team.name} — Fight Duration: ${fightDur.toFixed(1)}s (${fmt(fightDur)})`);
  console.log(`${'─'.repeat(110)}`);

  // Group casts by ability
  const castsByAbility = {};
  for (const c of casts) {
    if (!castsByAbility[c.name]) castsByAbility[c.name] = [];
    castsByAbility[c.name].push(c.timeSec);
  }

  for (const [name, times] of Object.entries(castsByAbility).sort()) {
    console.log(`  ${name} (${times.length} casts):`);
    console.log(`    Cast times: ${times.map(t => fmt(t)).join(', ')}`);

    // Show damage windows for this ability
    const clusterName = name === 'Despotic Command' ? 'Despotic Command' :
                        name === 'Dark Radiation' ? 'Dark Radiation' :
                        name === 'Entropic Unraveling' ? 'Entropic Unraveling' :
                        name === 'Shattering Twilight' ? 'Shattering Twilight (AoE)' : null;
    if (clusterName && clusters[clusterName]) {
      console.log(`    Damage windows:`);
      for (const w of clusters[clusterName]) {
        const dur = (w.end - w.start).toFixed(1);
        console.log(`      ${fmt(w.start)}-${fmt(w.end)} (${dur}s) — ${(w.totalDmg / 1e6).toFixed(1)}M dmg, ${w.hits} hits, ${w.targets} targets`);
      }
    }
  }
}

// ── Section 2: Cross-Team Boss Ability Consensus ──────────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 2: BOSS ABILITY TIMING CONSENSUS (averaged across 5 kills)');
console.log('━'.repeat(130));

// For key abilities, average the cast times across all 5 teams
const KEY_ABILITIES = ['Dark Radiation', 'Entropic Unraveling', 'Shattering Twilight', 'Despotic Command', 'Twisting Obscurity'];

for (const abilityName of KEY_ABILITIES) {
  console.log(`\n  ${abilityName}:`);

  // Collect cast times from all teams
  const allCastTimes = [];
  for (const team of TEAMS) {
    const data = allBossData[team.code];
    if (!data) continue;
    const times = data.casts.filter(c => c.name === abilityName).map(c => c.timeSec);
    allCastTimes.push({ team: team.name, times, fightDur: data.fightDur });
  }

  // Show side by side
  const maxCasts = Math.max(...allCastTimes.map(t => t.times.length));
  console.log(`    ${'Cast #'.padEnd(10)} ${TEAMS.map(t => t.name.padEnd(18)).join('')}`);
  console.log(`    ${'─'.repeat(10)} ${TEAMS.map(() => '─'.repeat(18)).join('')}`);

  for (let i = 0; i < maxCasts; i++) {
    const row = `    ${`#${i + 1}`.padEnd(10)} `;
    const cells = allCastTimes.map(t => {
      if (i < t.times.length) return fmt(t.times[i]).padEnd(18);
      return '---'.padEnd(18);
    }).join('');
    console.log(row + cells);
  }
}

// ── Section 3: Damage Windows — Where the Hurt Happens ────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 3: RAID-WIDE DAMAGE WINDOWS (actual damage from all 5 kills)');
console.log('━'.repeat(130));

// Build a unified timeline of "damage events" across all teams
// Focus on the big raid-wide abilities
const DAMAGE_ABILITIES_OF_INTEREST = ['Dark Radiation', 'Entropic Unraveling', 'Despotic Command'];

for (const abilityName of DAMAGE_ABILITIES_OF_INTEREST) {
  console.log(`\n  ${abilityName}:`);
  console.log(`    ${'Window'.padEnd(8)} ${'Time Range'.padEnd(16)} ${'Duration'.padEnd(10)} ${'Total Dmg'.padEnd(12)} ${'Hits'.padEnd(8)} ${'Targets'.padEnd(10)}`);
  console.log(`    ${'─'.repeat(8)} ${'─'.repeat(16)} ${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);

  // Use first team (Strat Roulette) as reference, but show if consistent
  for (const team of TEAMS) {
    const clusters = allBossClusters[team.code];
    if (!clusters) continue;

    const windows = clusters[abilityName] || [];
    if (windows.length === 0) continue;

    console.log(`    ${team.name}:`);
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const dur = (w.end - w.start).toFixed(1);
      console.log(`      #${i + 1}`.padEnd(10) +
        `${fmt(w.start)}-${fmt(w.end)}`.padEnd(16) +
        `${dur}s`.padEnd(10) +
        `${(w.totalDmg / 1e6).toFixed(1)}M`.padEnd(12) +
        `${w.hits}`.padEnd(8) +
        `${w.targets}`);
    }
  }
}

// ── Section 4: Healer CDs Correlated to ACTUAL Boss Abilities ──
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 4: HEALER CD → BOSS ABILITY CORRELATION');
console.log('  For each healing CD used, shows the ACTUAL boss ability it was covering');
console.log('━'.repeat(130));

// Build a map of boss ability instance -> healer CDs used
// Key: "{ability}@{approximate_time}" -> list of healer CDs
const bossAbilityCoverage = {};

for (const team of TEAMS) {
  const bossData = allBossData[team.code];
  if (!bossData) continue;

  console.log(`\n${'─'.repeat(110)}`);
  console.log(`  ${team.name}`);
  console.log(`${'─'.repeat(110)}`);

  const teamHealerCDs = [];

  for (const healer of team.healers) {
    const data = loadHealerData(team, healer);
    if (!data) continue;

    const cds = extractCDTimings(data);
    if (cds.length === 0) continue;

    console.log(`\n  ${healer.name} (${healer.spec}):`);

    for (const cd of cds) {
      const nearest = findNearestBossAbility(cd.timeSec, bossData.clusters);
      const marker = cd.type === 'raid-cd' ? ' ★★★' : cd.type === 'throughput' ? ' ★★' : '';

      if (nearest) {
        console.log(
          `    ${fmt(cd.timeSec)} │ ${cd.ability.padEnd(22)} │ → ${nearest.ability} at ${fmt(nearest.windowStart)} (${fmtDelta(nearest.delta)})${marker}`
        );

        // Track coverage
        const key = `${nearest.ability}@${Math.round(nearest.windowStart / 10) * 10}`;
        if (!bossAbilityCoverage[key]) {
          bossAbilityCoverage[key] = {
            ability: nearest.ability,
            approxTime: nearest.windowStart,
            teams: {},
          };
        }
        if (!bossAbilityCoverage[key].teams[team.name]) {
          bossAbilityCoverage[key].teams[team.name] = [];
        }
        bossAbilityCoverage[key].teams[team.name].push({
          healer: healer.name,
          spec: healer.spec,
          cd: cd.ability,
          time: cd.timeSec,
          type: cd.type,
        });
      } else {
        console.log(
          `    ${fmt(cd.timeSec)} │ ${cd.ability.padEnd(22)} │ → (no nearby raid-wide ability)${marker}`
        );
      }

      teamHealerCDs.push({ ...cd, healer: healer.name, spec: healer.spec });
    }
  }

  allHealerCDs[team.code] = teamHealerCDs;
}

// ── Section 5: Boss Ability → CD Coverage Consensus ───────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 5: BOSS ABILITY → HEALING CD CONSENSUS');
console.log('  What CDs do teams use for each major damage event?');
console.log('━'.repeat(130));

// Build a unified timeline of boss events with their associated CDs
// Use the first 4 teams (which have standard ~360s kills) to build the "standard" timeline
const standardTeams = TEAMS.filter(t => t.code !== 'dQmvYyL1MnkD2XRC'); // Fraudes is 249s, outlier

// Build canonical boss event list from Strat Roulette (team 1) since most standard kill
const refData = allBossData['1mAGvxq7nptrJFQ2'];
const refClusters = allBossClusters['1mAGvxq7nptrJFQ2'];

// For each key raid-wide damage ability, show what CDs were used across all teams
const CANONICAL_EVENTS = [];

// Dark Radiation windows
if (refClusters['Dark Radiation']) {
  for (let i = 0; i < refClusters['Dark Radiation'].length; i++) {
    const w = refClusters['Dark Radiation'][i];
    CANONICAL_EVENTS.push({
      name: `Dark Radiation #${i + 1}`,
      refStart: w.start,
      refEnd: w.end,
      refDmg: w.totalDmg,
      importance: w.totalDmg > 8e6 ? 'HIGH' : 'MODERATE',
    });
  }
}

// Entropic Unraveling windows
if (refClusters['Entropic Unraveling']) {
  for (let i = 0; i < refClusters['Entropic Unraveling'].length; i++) {
    const w = refClusters['Entropic Unraveling'][i];
    CANONICAL_EVENTS.push({
      name: `ENTROPIC UNRAVELING #${i + 1}`,
      refStart: w.start,
      refEnd: w.end,
      refDmg: w.totalDmg,
      importance: 'CRITICAL',
    });
  }
}

// Despotic Command windows
if (refClusters['Despotic Command']) {
  for (let i = 0; i < refClusters['Despotic Command'].length; i++) {
    const w = refClusters['Despotic Command'][i];
    CANONICAL_EVENTS.push({
      name: `Despotic Command #${i + 1}`,
      refStart: w.start,
      refEnd: w.end,
      refDmg: w.totalDmg,
      importance: 'MODERATE',
    });
  }
}

// Shattering Twilight
if (refClusters['Shattering Twilight (AoE)']) {
  for (let i = 0; i < refClusters['Shattering Twilight (AoE)'].length; i++) {
    const w = refClusters['Shattering Twilight (AoE)'][i];
    CANONICAL_EVENTS.push({
      name: `Shattering Twilight #${i + 1}`,
      refStart: w.start,
      refEnd: w.end,
      refDmg: w.totalDmg,
      importance: 'HIGH',
    });
  }
}

// Sort by time
CANONICAL_EVENTS.sort((a, b) => a.refStart - b.refStart);

// Now for each canonical event, find healer CDs used within that window across all teams
for (const event of CANONICAL_EVENTS) {
  const windowStart = event.refStart - 5;
  const windowEnd = event.refEnd + 8; // Allow CDs a few seconds after damage starts

  const tag = event.importance === 'CRITICAL' ? ' <<<< STACK CDS' :
              event.importance === 'HIGH' ? ' << NEED CD' : '';

  console.log(`\n  ${event.name} — ${fmt(event.refStart)}-${fmt(event.refEnd)} — ${(event.refDmg / 1e6).toFixed(1)}M ref dmg${tag}`);
  console.log(`  ${'─'.repeat(105)}`);

  const cdsByTeam = {};
  const cdsBySpec = {};

  for (const team of TEAMS) {
    const healerCDs = allHealerCDs[team.code] || [];
    const teamName = team.name;
    cdsByTeam[teamName] = [];

    // For non-reference teams, we need to match by relative position
    // Since all fights have same ability order, find the matching window in this team's data
    const teamClusters = allBossClusters[team.code];
    if (!teamClusters) continue;

    // Find the actual time of this event in this team's fight
    let actualStart = event.refStart;
    let actualEnd = event.refEnd;

    // Try to match by counting instances of the ability
    const abilityBase = event.name.replace(/ #\d+$/, '').replace('ENTROPIC UNRAVELING', 'Entropic Unraveling');
    const clusterKey = abilityBase === 'Shattering Twilight' ? 'Shattering Twilight (AoE)' : abilityBase;
    const teamWindows = teamClusters[clusterKey] || [];
    const eventIndex = parseInt(event.name.match(/#(\d+)/)?.[1] || '1') - 1;

    if (teamWindows[eventIndex]) {
      actualStart = teamWindows[eventIndex].start;
      actualEnd = teamWindows[eventIndex].end;
    }

    // Find healer CDs within this window
    for (const cd of healerCDs) {
      if (cd.timeSec >= actualStart - 5 && cd.timeSec <= actualEnd + 8) {
        cdsByTeam[teamName].push(cd);
        const specKey = `${cd.spec}:${cd.ability}`;
        if (!cdsBySpec[specKey]) cdsBySpec[specKey] = { spec: cd.spec, ability: cd.ability, type: cd.type, count: 0 };
        cdsBySpec[specKey].count++;
      }
    }
  }

  // Print per-team
  for (const [teamName, cds] of Object.entries(cdsByTeam)) {
    if (cds.length > 0) {
      const cdList = cds.map(c => `${c.healer}:${c.ability}@${fmt(c.timeSec)}`).join(', ');
      console.log(`    ${teamName.padEnd(18)} │ ${cdList}`);
    } else {
      console.log(`    ${teamName.padEnd(18)} │ (no major CDs)`);
    }
  }

  // Consensus
  const sorted = Object.values(cdsBySpec).sort((a, b) => b.count - a.count);
  if (sorted.length > 0) {
    const consensus = sorted.map(c => `${c.ability} (${c.count}/${TEAMS.length})`).join(', ');
    console.log(`    CONSENSUS:        │ ${consensus}`);
  }
}

// ── Section 6: Recommended CD Plan for Josh's Comp ────────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 6: RECOMMENDED CD PLAN FOR JOSH\'S COMP');
console.log('  Based on ACTUAL boss ability timings from 5 Mythic kills');
console.log('  Comp: McPounding (HPal) | Brew (RSham) | Mackspal (MW) | Deuche (PEvo)');
console.log('━'.repeat(130));

// PRIORITY-BASED CD ASSIGNMENT
// Pass 1: Lock in transitions (non-negotiable)
// Pass 2: Fill Dark Radiation windows with remaining CDs
// Pass 3: Assign externals to Shattering Twilight

const refDarkRad = refClusters['Dark Radiation'] || [];
const refEntropic = refClusters['Entropic Unraveling'] || [];
const refDespotic = refClusters['Despotic Command'] || [];
const refShattering = refClusters['Shattering Twilight (AoE)'] || [];
const refShatteringST = refClusters['Shattering Twilight (ST)'] || [];

// Build full timeline
const timeline = [];
for (let i = 0; i < refDarkRad.length; i++) {
  timeline.push({ time: refDarkRad[i].start, event: `Dark Radiation #${i + 1}`, end: refDarkRad[i].end, dmg: refDarkRad[i].totalDmg, type: 'raid-burst' });
}
for (let i = 0; i < refEntropic.length; i++) {
  timeline.push({ time: refEntropic[i].start, event: `ENTROPIC UNRAVELING #${i + 1}`, end: refEntropic[i].end, dmg: refEntropic[i].totalDmg, type: 'transition' });
}
for (let i = 0; i < refShattering.length; i++) {
  timeline.push({ time: refShattering[i].start, event: `Shattering Twilight #${i + 1}`, end: refShattering[i].end, dmg: refShattering[i].totalDmg, type: 'spike' });
}
timeline.sort((a, b) => a.time - b.time);

const transitionTimes = refEntropic.map(w => w.start);

// CD tracker
const cdDefs = {
  'McPounding': { 'Aura Mastery': 180, 'Avenging Wrath': 120, 'Blessing of Sacrifice': 120, 'Lay on Hands': 600 },
  'Brew': { 'Spirit Link Totem': 180, 'Healing Tide Totem': 180, 'Ascendance': 180, 'Ancestral Guidance': 120 },
  'Mackspal': { 'Revival': 180, 'Celestial Conduit': 90, 'Invoke Chi-Ji': 180, 'Life Cocoon': 120 },
  'Deuche': { 'Rewind': 240, 'Dream Flight': 120, 'Emerald Communion': 180 },
};

const cdUsage = {};
for (const [h, abs] of Object.entries(cdDefs)) {
  cdUsage[h] = {};
  for (const a of Object.keys(abs)) cdUsage[h][a] = [];
}

function canUse(h, a, t) {
  const cd = cdDefs[h]?.[a];
  if (cd === undefined) return false;
  const uses = cdUsage[h][a];
  return uses.length === 0 || (t - uses[uses.length - 1]) >= cd;
}

function markUsed(h, a, t) { cdUsage[h][a].push(t); }

// PASS 1: Lock transition CDs first (these are sacred)
const transitionPlan = {};
for (const event of timeline.filter(e => e.type === 'transition')) {
  const t = event.time;
  const cds = [];

  if (canUse('Mackspal', 'Revival', t)) {
    cds.push({ healer: 'Mackspal', cd: 'Revival', note: 'instant raid heal + dispel' });
    markUsed('Mackspal', 'Revival', t);
  }
  if (canUse('McPounding', 'Aura Mastery', t)) {
    cds.push({ healer: 'McPounding', cd: 'Aura Mastery', note: 'raid-wide DR' });
    markUsed('McPounding', 'Aura Mastery', t);
  }
  if (canUse('Brew', 'Ascendance', t)) {
    cds.push({ healer: 'Brew', cd: 'Ascendance', note: 'major throughput' });
    markUsed('Brew', 'Ascendance', t);
  }
  if (canUse('Deuche', 'Rewind', t + 10)) {
    cds.push({ healer: 'Deuche', cd: 'Rewind', note: 'rewind tail end (+10s into transition)' });
    markUsed('Deuche', 'Rewind', t + 10);
  } else if (canUse('Deuche', 'Emerald Communion', t)) {
    cds.push({ healer: 'Deuche', cd: 'Emerald Communion', note: 'sustained healing channel' });
    markUsed('Deuche', 'Emerald Communion', t);
  }
  // Backup if Ascendance unavailable
  if (!cds.some(c => c.healer === 'Brew') && canUse('Brew', 'Healing Tide Totem', t)) {
    cds.push({ healer: 'Brew', cd: 'Healing Tide Totem', note: 'sustained raid HoT' });
    markUsed('Brew', 'Healing Tide Totem', t);
  }
  if (!cds.some(c => c.healer === 'Brew') && canUse('Brew', 'Spirit Link Totem', t)) {
    cds.push({ healer: 'Brew', cd: 'Spirit Link Totem', note: 'HP equalize + DR' });
    markUsed('Brew', 'Spirit Link Totem', t);
  }

  transitionPlan[event.event] = cds;
}

// PASS 2: Fill DR windows + Shattering Twilight (transitions already locked)
const assignments = [];

for (const event of timeline) {
  const t = event.time;

  if (event.type === 'transition') {
    assignments.push({ ...event, cds: transitionPlan[event.event] });

  } else if (event.type === 'raid-burst' && event.dmg > 3e6) {
    const transitionSoon = transitionTimes.some(tt => tt > t && tt - t < 25);
    const cds = [];

    // RSham: save 3min CDs if transition is imminent
    if (!transitionSoon && canUse('Brew', 'Healing Tide Totem', t)) {
      cds.push({ healer: 'Brew', cd: 'Healing Tide Totem', note: 'sustained raid healing' });
      markUsed('Brew', 'Healing Tide Totem', t);
    } else if (!transitionSoon && canUse('Brew', 'Spirit Link Totem', t)) {
      cds.push({ healer: 'Brew', cd: 'Spirit Link Totem', note: 'HP equalization + DR' });
      markUsed('Brew', 'Spirit Link Totem', t);
    } else if (canUse('Brew', 'Ancestral Guidance', t)) {
      cds.push({ healer: 'Brew', cd: 'Ancestral Guidance', note: 'dmg-to-healing' });
      markUsed('Brew', 'Ancestral Guidance', t);
    }

    if (canUse('McPounding', 'Avenging Wrath', t)) {
      cds.push({ healer: 'McPounding', cd: 'Avenging Wrath', note: 'throughput window' });
      markUsed('McPounding', 'Avenging Wrath', t);
    }

    if (canUse('Deuche', 'Dream Flight', t)) {
      cds.push({ healer: 'Deuche', cd: 'Dream Flight', note: 'burst raid heal' });
      markUsed('Deuche', 'Dream Flight', t);
    } else if (!transitionSoon && canUse('Deuche', 'Emerald Communion', t)) {
      cds.push({ healer: 'Deuche', cd: 'Emerald Communion', note: 'sustained healing' });
      markUsed('Deuche', 'Emerald Communion', t);
    }

    if (canUse('Mackspal', 'Celestial Conduit', t)) {
      cds.push({ healer: 'Mackspal', cd: 'Celestial Conduit', note: 'burst AoE' });
      markUsed('Mackspal', 'Celestial Conduit', t);
    } else if (!transitionSoon && canUse('Mackspal', 'Invoke Chi-Ji', t)) {
      cds.push({ healer: 'Mackspal', cd: 'Invoke Chi-Ji', note: 'fistweave throughput' });
      markUsed('Mackspal', 'Invoke Chi-Ji', t);
    }

    if (cds.length > 0) assignments.push({ ...event, cds });

  } else if (event.type === 'spike') {
    const cds = [];
    if (canUse('McPounding', 'Blessing of Sacrifice', t)) {
      cds.push({ healer: 'McPounding', cd: 'Blessing of Sacrifice', note: 'external on target' });
      markUsed('McPounding', 'Blessing of Sacrifice', t);
    }
    if (canUse('Mackspal', 'Life Cocoon', t)) {
      cds.push({ healer: 'Mackspal', cd: 'Life Cocoon', note: 'absorb on target' });
      markUsed('Mackspal', 'Life Cocoon', t);
    }
    if (cds.length > 0) assignments.push({ ...event, cds });
  }
}

// Print the plan
for (const a of assignments) {
  const dur = (a.end - a.time).toFixed(1);
  const tag = a.type === 'transition' ? ' ★★★ CRITICAL' : a.type === 'raid-burst' ? ' ★★' : ' ★';
  console.log(`\n  ${fmt(a.time)}-${fmt(a.end)} │ ${a.event} (${dur}s, ${(a.dmg / 1e6).toFixed(1)}M dmg)${tag}`);
  for (const cd of a.cds) {
    console.log(`    → ${cd.healer.padEnd(12)} ${cd.cd.padEnd(22)} ${cd.note}`);
  }
}

// ── Section 7: Quick Reference Grid ──────────────────────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 7: QUICK REFERENCE — CD ASSIGNMENT GRID');
console.log('  McPounding (HPal) | Brew (RSham) | Mackspal (MW) | Deuche (PEvo)');
console.log('━'.repeat(130));

const gridHeader = ['TIME', 'BOSS ABILITY', 'McPounding (HPal)', 'Brew (RSham)', 'Mackspal (MW)', 'Deuche (PEvo)'];
const gridRows = [gridHeader];

for (const a of assignments) {
  const row = [
    fmt(a.time),
    a.event,
    a.cds.filter(c => c.healer === 'McPounding').map(c => c.cd).join('+') || '---',
    a.cds.filter(c => c.healer === 'Brew').map(c => c.cd).join('+') || '---',
    a.cds.filter(c => c.healer === 'Mackspal').map(c => c.cd).join('+') || '---',
    a.cds.filter(c => c.healer === 'Deuche').map(c => c.cd).join('+') || '---',
  ];
  gridRows.push(row);
}

const widths = gridHeader.map((_, i) => Math.max(...gridRows.map(row => (row[i] || '').length)));
const separator = widths.map(w => '─'.repeat(w + 2)).join('┼');

for (let r = 0; r < gridRows.length; r++) {
  if (r === 1) console.log(`  ┼${separator}┼`);
  const row = gridRows[r].map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('│');
  console.log(`  │${row}│`);
}

// ── Section 8: Key Findings ──────────────────────────────────
console.log('\n');
console.log('━'.repeat(130));
console.log('  SECTION 8: KEY FINDINGS FROM ACTUAL BOSS DATA');
console.log('━'.repeat(130));

const refFightDur = refData.fightDur;

console.log(`
  FIGHT STRUCTURE (from actual WCL data):
    - Standard kill time: ${TEAMS.filter(t => t.code !== 'dQmvYyL1MnkD2XRC').map(t => `${allBossData[t.code].fightDur.toFixed(0)}s`).join(', ')}
    - Fraudes killed in ${allBossData['dQmvYyL1MnkD2XRC']?.fightDur.toFixed(0)}s (much faster, higher DPS)
    - Dark Radiation: ${refDarkRad.length} windows across the fight (every ~30-40s during add phases)
    - Entropic Unraveling: ${refEntropic.length} transitions (the fight-defining mechanic)
    - Despotic Command: ${refDespotic.length} waves (periodic but less threatening)
    - Shattering Twilight: ${refShattering.length} AoE bursts + ${refShatteringST.length} ST hits

  DAMAGE HIERARCHY (from actual numbers):
    1. Twisting Obscurity: ~95M total (constant DoT, not bursty, heal through it)
    2. Dark Radiation: ~66M total (the CD rotation driver)
    3. Entropic Unraveling: ~54M total (stack ALL CDs, transitions)
    4. Destabilizing Strikes: ~30M (tank damage only)
    5. Despotic Command: ~11M (hurts but manageable)
    6. Shattering Twilight: ~4M AoE + ~3M ST (spike on 1 person + splash)

  TIMING CONSISTENCY ACROSS TEAMS:
    - Boss abilities follow a FIXED script: same ability order every pull
    - Dark Radiation cast at same relative times across all 5 kills
    - Entropic Unraveling transitions are predictable and unavoidable
    - Only variable: Fraudes kills faster so they see fewer casts of everything

  YOUR COMP ADVANTAGE (HPal/RSham/MW/PEvo):
    - 4 distinct major raid CDs for transitions (AM, Ascendance, Revival, Rewind)
    - Spirit Link Totem is UNIQUE: HP equalization during Dark Radiation is elite
    - Revival instant heal + dispel is perfect for transition entry
    - Rewind on 4min CD lines up for transitions 1 and 3
    - Most top teams run 3 healers not 4: your 4th healer is pure gravy

  WHAT THE DATA CHANGED VS OLD HARDCODED TIMELINE:
    - Dark Radiation is 12 casts (11 dmg windows), not 10: old timeline missed some
    - Entropic Unraveling transitions confirmed at 1:43, 3:44, 5:46 (not estimated)
    - Shattering Twilight hits at 0:54, 1:40, 2:55, 3:41, 4:57, 5:42 (precise, 6 windows)
    - Dark Radiation #9 is DOUBLE LENGTH (16.8s vs normal 6.5s): needs extra CD coverage
    - Despotic Command overlaps with Dark Radiation frequently, not independently timed
`);

console.log('Done.');
