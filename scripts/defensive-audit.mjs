/**
 * Defensive/death audit for a raid night — the CORRECTED methodology.
 *
 * Usage:
 *   node scripts/defensive-audit.mjs <reportCode> <encounterID> [bossKey]
 *   node scripts/defensive-audit.mjs qDfTzvAyV3pRb6rG 3181 crown
 *
 * Methodology (see AGENT-DEFENSIVE-AUDIT.md for the full spec):
 *   1. Only the FIRST 2 deaths per pull are "real" — the rest are cascade.
 *   2. Personals split into DR (proactive, auditable) vs reactive/immunity (not auditable the same way).
 *   3. Every death checked against active raid CDs — dying under Rally+Darkness is not a personal failure.
 *   4. Output classifies each real death into a quadrant: raid CD active × personal DR available.
 */
import { gql, gqlPaged, fmt } from './wcl-lib.mjs';

const [reportCode, encounterIdArg, bossKey, diffArg] = process.argv.slice(2);
if (!reportCode || !encounterIdArg) {
  console.error('Usage: node scripts/defensive-audit.mjs <reportCode> <encounterID> [bossKey] [difficulty=5]');
  process.exit(1);
}
const ENCOUNTER_ID = Number(encounterIdArg);
const DIFFICULTY = Number(diffArg) || 5;
const CASCADE_THRESHOLD = 2; // first N deaths per pull are real; the rest are cascade

// ── Per-boss phase/window configs. Add new bosses here. ──
const BOSS_CONFIGS = {
  beloren: {
    // Derived from JbM2DNfB4Vz83aTm fight 46 (Phoenix, 3:52 Mythic kill) via scripts/boss-timeline.mjs.
    // WARNING: Death Drop (burnout entry) is HP-driven, NOT a fixed timer — 1:04 on this kill,
    // 1:57 on the faster Dabing kill. Re-derive phase ends from our own pulls after night 1.
    phases: [
      { name: 'P1', end: 64 },
      { name: 'I1-BURNOUT', end: 106 },
      { name: 'P2', end: 190 },
      { name: 'BURN', end: Infinity },
    ],
    windows: [
      { from: 0, to: 10, name: 'Pull Voidlight Convergence (0:01)' },
      { from: 48, to: 60, name: 'Voidlight Convergence #2 (~0:51)' },
      { from: 64, to: 110, name: 'I1 Burnout — Light+Void Flames ramp' },
      { from: 108, to: 120, name: 'P2 Voidlight Convergence (~1:51)' },
      { from: 158, to: 172, name: 'P2 VLC + Voidlight Rupture (~2:41)' },
      { from: 188, to: 202, name: 'Second Death Drop (~3:10)' },
      { from: 202, to: 240, name: 'Final burn — Void+Light Flames' },
    ],
  },
  crown: {
    phases: [
      { name: 'P1', end: 134 },
      { name: 'INT', end: 173 },
      { name: 'P2', end: 304 },
      { name: 'P3', end: Infinity },
    ],
    windows: [
      { from: 55,  to: 70,  name: 'P1 Big Hit (~1:00)' },
      { from: 128, to: 145, name: 'P1 Exit / INT Entry' },
      { from: 168, to: 185, name: 'INT Exit / P2 Entry' },
      { from: 280, to: 305, name: 'P2 Exit / P3 Entry' },
      { from: 305, to: 320, name: 'P3 Simulacrum Backlash (~5:10)' },
      { from: 340, to: 360, name: 'P3 Gravity Collapse #1 (~5:48)' },
      { from: 385, to: 405, name: 'P3 Gravity Collapse #2 (~6:35)' },
      { from: 405, to: 430, name: 'P3 Peak Damage (~6:50-7:10)' },
      { from: 440, to: 460, name: 'P3 Void Expulsion (~7:30)' },
    ],
  },
};
if (bossKey && !BOSS_CONFIGS[bossKey]) {
  console.error('Unknown bossKey "' + bossKey + '". Valid keys: ' + Object.keys(BOSS_CONFIGS).join(', ') + '\nOmit bossKey for generic single-phase mode (no window attribution).');
  process.exit(1);
}
const cfg = BOSS_CONFIGS[bossKey] || { phases: [{ name: 'FIGHT', end: Infinity }], windows: [] };
if (!bossKey) console.log('⚠ Generic mode: no phase boundaries or damage windows — add a BOSS_CONFIGS entry for window attribution.\n');

function phase(t) {
  for (const p of cfg.phases) if (t < p.end) return p.name;
  return cfg.phases[cfg.phases.length - 1].name;
}
function damageWindow(t) {
  for (const w of cfg.windows) if (t >= w.from && t <= w.to) return w.name;
  return phase(t) + ' (other)';
}

// ── CATEGORY 1: proactive DR defensives — the auditable bucket ──
const DR_DEFENSIVES = {
  DK:  [{ id: 48707, name: 'Anti-Magic Shell', cd: 60 }, { id: 48792, name: 'Icebound Fortitude', cd: 180 }],
  WAR: [{ id: 184364, name: 'Enraged Regeneration', cd: 120 }],
  PRI: [], // SPriest/Disc have no proactive DR — Desperate Prayer is a heal, Dispersion locks you out
  MON: [{ id: 115203, name: 'Fortifying Brew', cd: 180 }, { id: 243435, name: 'Fortifying Brew', cd: 180 }, { id: 122783, name: 'Diffuse Magic', cd: 90 }],
  PAL: [{ id: 498, name: 'Divine Protection', cd: 60 }],
  DRU: [{ id: 22812, name: 'Barkskin', cd: 45 }, { id: 61336, name: 'Survival Instincts', cd: 180 }],
  WLK: [{ id: 104773, name: 'Unending Resolve', cd: 180 }, { id: 108416, name: 'Dark Pact', cd: 60 }],
  HUN: [{ id: 264735, name: 'Survival of the Fittest', cd: 120 }],
  SHA: [{ id: 108271, name: 'Astral Shift', cd: 90 }],
  EVO: [{ id: 363916, name: 'Obsidian Scales', cd: 150 }],
  ROG: [{ id: 1966, name: 'Feint', cd: 15 }],
  MAG: [{ id: 113862, name: 'Greater Invisibility', cd: 120 }, { id: 55342, name: 'Mirror Image', cd: 120 }],
  DH:  [{ id: 198589, name: 'Blur', cd: 60 }],
};

// ── CATEGORY 2: reactive heals / immunities — tracked but NOT counted as missed DR ──
const REACTIVE = {
  PRI: [{ id: 19236, name: 'Desperate Prayer', cd: 90 }, { id: 47585, name: 'Dispersion', cd: 120 }],
  HUN: [{ id: 109304, name: 'Exhilaration', cd: 120 }, { id: 186265, name: 'Aspect of the Turtle', cd: 180 }],
  PAL: [{ id: 642, name: 'Divine Shield', cd: 300 }],
  DH:  [{ id: 187827, name: 'Metamorphosis', cd: 180 }],
  ROG: [{ id: 31224, name: 'Cloak of Shadows', cd: 120 }, { id: 5277, name: 'Evasion', cd: 120 }],
  MAG: [{ id: 45438, name: 'Ice Block', cd: 240 }, { id: 342245, name: 'Alter Time', cd: 60 }],
};

const HEALTHSTONE = { id: 6262, name: 'Healthstone', cd: 300 };

// ── Raid CDs with active durations — to check coverage at time of death ──
const RAID_CDS = [
  { ids: [97462], name: 'Rallying Cry', dur: 10 },
  { ids: [51052], name: 'Anti-Magic Zone', dur: 10 },
  { ids: [196718], name: 'Darkness', dur: 8 },
  { ids: [62618], name: 'Barrier', dur: 10 },
  { ids: [31821], name: 'Aura Mastery', dur: 8 },
  { ids: [15286], name: 'Vampiric Embrace', dur: 15 },
  { ids: [115310, 388615], name: 'Revival', dur: 2 },
  { ids: [740], name: 'Tranquility', dur: 8 },
  { ids: [322118, 325197], name: "Yu'lon/Chi-Ji", dur: 25 },
];

const drIdToInfo = new Map();
for (const [cls, defs] of Object.entries(DR_DEFENSIVES)) for (const d of defs) drIdToInfo.set(d.id, { ...d, cls });
const reactiveIdToInfo = new Map();
for (const [cls, defs] of Object.entries(REACTIVE)) for (const d of defs) reactiveIdToInfo.set(d.id, { ...d, cls });

const allIds = [...drIdToInfo.keys(), ...reactiveIdToInfo.keys(), HEALTHSTONE.id, ...RAID_CDS.flatMap(r => r.ids)];
const spellFilter = allIds.map(id => 'ability.id=' + id).join(' OR ');

function detectClass(casts) {
  const counts = {};
  for (const c of casts) {
    const info = drIdToInfo.get(c.abilityGameID) || reactiveIdToInfo.get(c.abilityGameID);
    if (info) counts[info.cls] = (counts[info.cls] || 0) + 1;
  }
  let best = null, n = 0;
  for (const [cls, count] of Object.entries(counts)) if (count > n) { best = cls; n = count; }
  return best;
}

function wasAvailable(spellId, cd, playerID, deathTime, fightStart, fightCasts) {
  const casts = fightCasts
    .filter(c => c.abilityGameID === spellId && c.sourceID === playerID && (c.timestamp - fightStart) / 1000 < deathTime)
    .map(c => (c.timestamp - fightStart) / 1000)
    .sort((a, b) => b - a);
  if (casts.length === 0) return true;
  return casts[0] + cd <= deathTime;
}

async function main() {
  const fd = await gql('{ reportData { report(code: "' + reportCode + '") { fights(encounterID: ' + ENCOUNTER_ID + ') { id startTime endTime kill difficulty } } } }');
  const allFights = fd.reportData.report.fights.sort((a, b) => a.id - b.id);
  const fights = allFights.filter(f => f.difficulty === DIFFICULTY);
  if (allFights.length !== fights.length) console.log('⚠ Dropped ' + (allFights.length - fights.length) + ' pulls at other difficulties\n');
  const md = await gql('{ reportData { report(code: "' + reportCode + '") { masterData { actors(type: "Player") { id name } } } } }');
  const actors = {};
  md.reportData.report.masterData.actors.forEach(a => { actors[a.id] = a.name; });

  const fids = fights.map(f => f.id);
  let deaths = [], allCasts = [];
  for (let i = 0; i < fids.length; i += 10) {
    const batch = fids.slice(i, i + 10);
    deaths = deaths.concat(await gqlPaged(np =>
      '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + batch + '], dataType: Deaths, hostilityType: Friendlies' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'));
    allCasts = allCasts.concat(await gqlPaged(np =>
      '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + batch + '], dataType: Casts, filterExpression: "' + spellFilter + '"' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'));
  }
  console.log('Pulls: ' + fights.length + ' | Deaths: ' + deaths.length + ' | CD casts: ' + allCasts.length);

  const playerCastsByID = {};
  allCasts.forEach(c => { (playerCastsByID[c.sourceID] ||= []).push(c); });
  const playerClass = {};
  for (const [pid, casts] of Object.entries(playerCastsByID)) playerClass[pid] = detectClass(casts);

  const results = [];
  for (const fight of fights) {
    const fightDeaths = deaths
      .filter(d => d.timestamp >= fight.startTime && d.timestamp <= fight.endTime)
      .sort((a, b) => a.timestamp - b.timestamp);
    const fightCasts = allCasts.filter(c => c.timestamp >= fight.startTime && c.timestamp <= fight.endTime);

    const raidCdCasts = [];
    fightCasts.forEach(c => {
      for (const rcd of RAID_CDS) {
        if (rcd.ids.includes(c.abilityGameID)) {
          const t = (c.timestamp - fight.startTime) / 1000;
          if (!raidCdCasts.find(r => r.name === rcd.name && Math.abs(r.t - t) < 3))
            raidCdCasts.push({ name: rcd.name, t, end: t + rcd.dur });
        }
      }
    });

    let idx = 0;
    for (const death of fightDeaths) {
      idx++;
      const pid = death.targetID;
      const t = (death.timestamp - fight.startTime) / 1000;
      const cls = playerClass[pid];
      const drAvail = (cls ? DR_DEFENSIVES[cls] || [] : [])
        .filter(def => wasAvailable(def.id, def.cd, pid, t, fight.startTime, fightCasts)).map(d => d.name);
      const reactAvail = (cls ? REACTIVE[cls] || [] : [])
        .filter(def => wasAvailable(def.id, def.cd, pid, t, fight.startTime, fightCasts)).map(d => d.name);
      results.push({
        fight: fight.id, player: actors[pid] || 'Unknown', t,
        window: damageWindow(t), cascade: idx > CASCADE_THRESHOLD,
        clsUnknown: !cls,
        raidCDs: raidCdCasts.filter(r => t >= r.t && t <= r.end).map(r => r.name),
        drAvail, reactAvail,
        hsAvail: wasAvailable(HEALTHSTONE.id, HEALTHSTONE.cd, pid, t, fight.startTime, fightCasts),
      });
    }
  }

  const real = results.filter(r => !r.cascade);
  console.log('Real deaths (first ' + CASCADE_THRESHOLD + '/pull): ' + real.length + ' | Cascade: ' + (results.length - real.length) + '\n');

  // Quadrant classification
  let q = { coveredNoDR: 0, coveredHadDR: 0, uncoveredHadDR: 0, uncoveredNoDR: 0, unknown: 0 };
  for (const d of real) {
    if (d.clsUnknown) { q.unknown++; continue; }
    if (d.raidCDs.length && !d.drAvail.length) q.coveredNoDR++;
    else if (d.raidCDs.length && d.drAvail.length) q.coveredHadDR++;
    else if (!d.raidCDs.length && d.drAvail.length) q.uncoveredHadDR++;
    else q.uncoveredNoDR++;
  }
  console.log('DEATH CLASSIFICATION (real deaths only):');
  console.log('  Under raid CD, no personal DR left:   ' + q.coveredNoDR + '  (damage killed through — not a player failure)');
  console.log('  Under raid CD, had personal DR:       ' + q.coveredHadDR + '  (should stack personal on top)');
  console.log('  No raid CD, had personal DR:          ' + q.uncoveredHadDR + '  (coverage gap AND unpressed personal)');
  console.log('  No raid CD, no personal DR:           ' + q.uncoveredNoDR + '  (genuinely out of options)');
  if (q.unknown) console.log('  Class unknown (no tracked casts):     ' + q.unknown + '  (NOT classified — do not read as "out of options")');
  console.log('');

  // Where real deaths happen
  console.log('WHERE REAL DEATHS HAPPEN:');
  const byWindow = {};
  real.forEach(d => { (byWindow[d.window] ||= []).push(d); });
  for (const [w, ds] of Object.entries(byWindow).sort((a, b) => b[1].length - a[1].length)) {
    const underCD = ds.filter(d => d.raidCDs.length).length;
    const hadDR = ds.filter(d => d.drAvail.length).length;
    console.log('  ' + String(ds.length).padStart(3) + '  ' + w + '  (' + underCD + ' under raid CD, ' + hadDR + ' had DR)');
  }

  // Per player
  console.log('\nPER-PLAYER (real deaths only):');
  const byPlayer = {};
  real.forEach(d => { (byPlayer[d.player] ||= []).push(d); });
  for (const [p, ds] of Object.entries(byPlayer).sort((a, b) => b[1].length - a[1].length)) {
    const hadDR = ds.filter(d => d.drAvail.length).length;
    const underCD = ds.filter(d => d.raidCDs.length).length;
    console.log('  ' + p.padEnd(16) + ds.length + ' first-deaths | ' + hadDR + '/' + ds.length + ' had DR | ' + underCD + '/' + ds.length + ' under raid CD');
    ds.forEach(d => {
      const tags = [];
      if (d.raidCDs.length) tags.push('under ' + d.raidCDs.join('+'));
      if (d.drAvail.length) tags.push('HAD: ' + d.drAvail.join(', '));
      if (!d.raidCDs.length && !d.drAvail.length) tags.push('nothing available');
      console.log('    Pull ' + String(d.fight).padStart(2) + ' @ ' + fmt(d.t) + ' (' + d.window + ') ' + tags.join(' | '));
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
