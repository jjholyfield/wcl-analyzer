import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data', 'dps-audit');

// Frost Mage spell IDs
const SPELLS = {
  FROSTBOLT: 116,
  FROSTFIRE_BOLT: 468082,
  ICE_LANCE: 30455,
  FLURRY: 44614,
  GLACIAL_SPIKE: 199786,
  ICY_VEINS: 12472,
  FROZEN_ORB: 84714,
  RAY_OF_FROST: 205021,
  COMET_STORM: 153595,
  SHIFTING_POWER: 382440,
  MIRROR_IMAGE: 55342,
  BLIZZARD: 190356,
  CONE_OF_COLD: 120,
  ICE_NOVA: 157997,
  FROST_NOVA: 122,
  BLINK: 1953,
  SHIMMER: 212653,
  ICE_BLOCK: 45438,
  TIME_WARP: 80353,
  COUNTERSPELL: 2139,
  SPELLSTEAL: 30449,
  FINGERS_OF_FROST: 44544,
  BRAIN_FREEZE: 190446,
  WINTERS_CHILL: 228358,
};

const SPELL_NAMES = {};
for (const [name, id] of Object.entries(SPELLS)) {
  SPELL_NAMES[id] = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const CD_SPELLS = [SPELLS.ICY_VEINS, SPELLS.FROZEN_ORB, SPELLS.RAY_OF_FROST, SPELLS.COMET_STORM, SPELLS.SHIFTING_POWER, SPELLS.MIRROR_IMAGE];
const CORE_ROTATION = [SPELLS.FROSTBOLT, SPELLS.FROSTFIRE_BOLT, SPELLS.ICE_LANCE, SPELLS.FLURRY, SPELLS.GLACIAL_SPIKE];

const CD_TIMERS = {
  [SPELLS.ICY_VEINS]: 120,
  [SPELLS.FROZEN_ORB]: 60,
  [SPELLS.RAY_OF_FROST]: 60,
  [SPELLS.COMET_STORM]: 30,
  [SPELLS.SHIFTING_POWER]: 60,
  [SPELLS.MIRROR_IMAGE]: 120,
};

function load(filename) {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function analyze(data) {
  const start = data.fight.startTime;
  const end = data.fight.endTime;
  const dur = (end - start) / 1000;
  const casts = data.events.casts.filter(e => e.type === 'cast');
  const buffs = data.events.buffs || [];

  // CPM
  const cpm = (casts.length / dur) * 60;

  // Cast breakdown
  const breakdown = {};
  for (const c of casts) {
    const id = c.abilityGameID;
    if (!breakdown[id]) breakdown[id] = { name: SPELL_NAMES[id] || `spell-${id}`, count: 0 };
    breakdown[id].count++;
  }

  // CD usage
  const cdUsage = {};
  for (const cdId of CD_SPELLS) {
    const uses = casts.filter(c => c.abilityGameID === cdId);
    const times = uses.map(c => (c.timestamp - start) / 1000);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

    // Expected uses based on fight duration and CD timer
    const cdTimer = CD_TIMERS[cdId] || 120;
    const expectedUses = Math.floor(dur / cdTimer) + 1;

    cdUsage[cdId] = {
      name: SPELL_NAMES[cdId] || `spell-${cdId}`,
      count: uses.length,
      expected: expectedUses,
      times: times.map(t => fmt(t)),
      gaps: gaps.map(g => g.toFixed(0) + 's'),
      firstUse: times.length > 0 ? fmt(times[0]) : 'never',
      efficiency: expectedUses > 0 ? ((uses.length / expectedUses) * 100).toFixed(0) : '0',
    };
  }

  // GCD gaps
  const sorted = [...casts].sort((a, b) => a.timestamp - b.timestamp);
  let totalDeadTime = 0;
  let gapsOver2 = 0, gapsOver3 = 0, gapsOver5 = 0;
  const bigGaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].timestamp - sorted[i - 1].timestamp) / 1000;
    if (gap > 2) gapsOver2++;
    if (gap > 3) { gapsOver3++; totalDeadTime += gap - 1.5; }
    if (gap > 5) gapsOver5++;
    if (gap > 4) {
      bigGaps.push({
        at: fmt((sorted[i - 1].timestamp - start) / 1000),
        gap: gap.toFixed(1) + 's',
        before: SPELL_NAMES[sorted[i - 1].abilityGameID] || `spell-${sorted[i - 1].abilityGameID}`,
        after: SPELL_NAMES[sorted[i].abilityGameID] || `spell-${sorted[i].abilityGameID}`,
      });
    }
  }
  const avgGap = sorted.length > 1 ? dur / (sorted.length - 1) : 0;

  // Icy Veins uptime
  const ivEvents = buffs.filter(e => e.abilityGameID === SPELLS.ICY_VEINS);
  let ivUptime = 0, ivStart = null;
  for (const e of ivEvents) {
    if (e.type === 'applybuff' || e.type === 'refreshbuff') ivStart = e.timestamp;
    else if (e.type === 'removebuff' && ivStart) { ivUptime += e.timestamp - ivStart; ivStart = null; }
  }
  if (ivStart) ivUptime += end - ivStart;

  // FoF procs
  const fofEvents = buffs.filter(e => e.abilityGameID === SPELLS.FINGERS_OF_FROST);
  const fofGained = fofEvents.filter(e => e.type === 'applybuff' || e.type === 'applybuffstack').length;
  const fofConsumed = fofEvents.filter(e => e.type === 'removebuffstack' || e.type === 'removebuff').length;

  // Brain Freeze
  const bfEvents = buffs.filter(e => e.abilityGameID === SPELLS.BRAIN_FREEZE);
  const bfGained = bfEvents.filter(e => e.type === 'applybuff').length;
  const bfConsumed = bfEvents.filter(e => e.type === 'removebuff').length;

  // Opener analysis (first 15s)
  const openerCasts = casts
    .filter(c => (c.timestamp - start) / 1000 < 15)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => ({
      time: ((c.timestamp - start) / 1000).toFixed(1),
      spell: SPELL_NAMES[c.abilityGameID] || `spell-${c.abilityGameID}`,
    }));

  return {
    dur, cpm, totalCasts: casts.length,
    breakdown, cdUsage,
    gcd: { avgGap, gapsOver2, gapsOver3, gapsOver5, totalDeadTime, bigGaps },
    ivUptime: { sec: (ivUptime / 1000).toFixed(1), pct: ((ivUptime / (end - start)) * 100).toFixed(1) },
    fof: { gained: fofGained, consumed: fofConsumed },
    bf: { gained: bfGained, consumed: bfConsumed },
    opener: openerCasts,
  };
}

// ═══════════════════════════════════════════════════════════════
// BOSS-BY-BOSS COMPARISONS
// ═══════════════════════════════════════════════════════════════
const comparisons = [
  {
    boss: 'Mythic Averzian',
    baodabao: 'baodabao-averzian-Ty6WFH92YBmGZ4Dj-f3.json',
    top: 'pnz-averzian-bHBvRYmnALP76T9h-f9.json',
    topLabel: 'Pnz (#1 ranked)',
  },
  {
    boss: 'Mythic Salhadaar',
    baodabao: 'baodabao-ZFB8LVN621dMXHQW-f37.json',
    top: 'lonelyseason-kK6nFf1QdM4Djcbg-f17.json',
    topLabel: 'Lonelyseason (#2 ranked)',
  },
  {
    boss: 'Mythic Vorasius',
    baodabao: 'baodabao-vorasius-XzJtFAw6n7Hhg1DP-f5.json',
    top: 'qingxingood-vorasius-83fnCXxrgjcbZT2p-f41.json',
    topLabel: 'Qingxingood (#1 ranked)',
  },
  {
    boss: 'Heroic Chimaerus',
    baodabao: 'baodabao-chimaerus-TtMaG8bXL4vBgDpc-f10.json',
    top: null,
    topLabel: null,
  },
];

console.log('═'.repeat(90));
console.log('  FROST MAGE DPS AUDIT — Baodabao (Thunderlord)');
console.log('  Across Multiple Boss Encounters');
console.log('═'.repeat(90));

const allBaoResults = [];
const allTopResults = [];

for (const comp of comparisons) {
  const baoData = load(comp.baodabao);
  const baoResult = analyze(baoData);
  allBaoResults.push({ boss: comp.boss, ...baoResult, ilvl: baoData.playerDetail?.minItemLevel || '?', kill: baoData.fight.kill });

  let topResult = null;
  if (comp.top) {
    const topData = load(comp.top);
    topResult = analyze(topData);
    allTopResults.push({ boss: comp.boss, ...topResult, ilvl: topData.playerDetail?.minItemLevel || '?', kill: topData.fight.kill, name: comp.topLabel });
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  ${comp.boss.toUpperCase()}`);
  console.log(`${'═'.repeat(90)}`);

  // Side-by-side comparison
  const baoLine = `Baodabao (iLvl ${baoData.playerDetail?.minItemLevel || '?'}) — ${baoData.fight.kill ? 'KILL' : 'WIPE'} ${fmt(baoResult.dur)}`;
  console.log(`\n  ${baoLine}`);
  if (topResult) {
    const topLine = `${comp.topLabel} (iLvl ${load(comp.top).playerDetail?.minItemLevel || '?'}) — KILL ${fmt(topResult.dur)}`;
    console.log(`  ${topLine}`);
  }

  // Cast rate comparison
  console.log(`\n  ┌── CAST RATE ${'─'.repeat(55)}`);
  console.log(`  │  Baodabao:  ${baoResult.cpm.toFixed(1)} CPM  (${baoResult.totalCasts} casts in ${fmt(baoResult.dur)})`);
  if (topResult) {
    console.log(`  │  Top:       ${topResult.cpm.toFixed(1)} CPM  (${topResult.totalCasts} casts in ${fmt(topResult.dur)})`);
    const pct = ((baoResult.cpm / topResult.cpm) * 100).toFixed(0);
    console.log(`  │  Delta:     ${pct}% of top player's cast rate`);
  }

  // Cast breakdown
  console.log(`  │`);
  console.log(`  ├── CAST BREAKDOWN ${'─'.repeat(49)}`);

  const allSpells = new Set([...Object.keys(baoResult.breakdown), ...(topResult ? Object.keys(topResult.breakdown) : [])]);
  const spellRows = [...allSpells]
    .map(id => {
      const bao = baoResult.breakdown[id];
      const top = topResult?.breakdown[id];
      return {
        id,
        name: bao?.name || top?.name || `spell-${id}`,
        baoCount: bao?.count || 0,
        topCount: top?.count || 0,
        baoCpm: ((bao?.count || 0) / baoResult.dur) * 60,
        topCpm: topResult ? ((top?.count || 0) / topResult.dur) * 60 : 0,
      };
    })
    .sort((a, b) => b.baoCount - a.baoCount)
    .filter(r => r.baoCount > 0 || r.topCount > 0)
    .slice(0, 15);

  const header = `  │  ${'Spell'.padEnd(25)} ${'Bao'.padStart(5)} ${'CPM'.padStart(6)}  ${topResult ? `${'Top'.padStart(5)} ${'CPM'.padStart(6)}` : ''}`;
  console.log(header);
  for (const r of spellRows) {
    const line = `  │  ${r.name.padEnd(25)} ${String(r.baoCount).padStart(5)} ${r.baoCpm.toFixed(1).padStart(6)}  ${topResult ? `${String(r.topCount).padStart(5)} ${r.topCpm.toFixed(1).padStart(6)}` : ''}`;
    console.log(line);
  }

  // Cooldown usage
  console.log(`  │`);
  console.log(`  ├── COOLDOWN USAGE ${'─'.repeat(49)}`);
  for (const cdId of CD_SPELLS) {
    const bCd = baoResult.cdUsage[cdId];
    const tCd = topResult?.cdUsage[cdId];
    if (bCd.count === 0 && (!tCd || tCd.count === 0)) continue;

    let line = `  │  ${bCd.name.padEnd(18)} Bao: ${bCd.count}/${bCd.expected} (${bCd.efficiency}%)  First: ${bCd.firstUse}`;
    if (tCd) line += `  │  Top: ${tCd.count}/${tCd.expected} (${tCd.efficiency}%)  First: ${tCd.firstUse}`;
    console.log(line);
    if (bCd.gaps.length > 0) console.log(`  │  ${''.padEnd(18)} Gaps: [${bCd.gaps.join(', ')}]`);
    if (tCd?.gaps.length > 0) console.log(`  │  ${''.padEnd(18)} Top gaps: [${tCd.gaps.join(', ')}]`);
  }

  // GCD Analysis
  console.log(`  │`);
  console.log(`  ├── GCD / DEAD TIME ${'─'.repeat(48)}`);
  console.log(`  │  Bao: avg ${baoResult.gcd.avgGap.toFixed(2)}s between casts, ${baoResult.gcd.gapsOver3} gaps >3s, ${baoResult.gcd.gapsOver5} gaps >5s, ~${baoResult.gcd.totalDeadTime.toFixed(0)}s dead time`);
  if (topResult) {
    console.log(`  │  Top: avg ${topResult.gcd.avgGap.toFixed(2)}s between casts, ${topResult.gcd.gapsOver3} gaps >3s, ${topResult.gcd.gapsOver5} gaps >5s, ~${topResult.gcd.totalDeadTime.toFixed(0)}s dead time`);
  }
  if (baoResult.gcd.bigGaps.length > 0) {
    console.log(`  │  Big gaps (>4s):`);
    for (const g of baoResult.gcd.bigGaps.slice(0, 8)) {
      console.log(`  │    ${g.at}: ${g.gap} gap after ${g.before}`);
    }
  }

  // Icy Veins & Procs
  console.log(`  │`);
  console.log(`  ├── ICY VEINS & PROCS ${'─'.repeat(46)}`);
  console.log(`  │  Bao IV uptime: ${baoResult.ivUptime.sec}s (${baoResult.ivUptime.pct}%)`);
  if (topResult) console.log(`  │  Top IV uptime: ${topResult.ivUptime.sec}s (${topResult.ivUptime.pct}%)`);
  console.log(`  │  Bao FoF: ${baoResult.fof.gained} gained / ${baoResult.fof.consumed} consumed  |  BF: ${baoResult.bf.gained} gained / ${baoResult.bf.consumed} consumed`);
  if (topResult) console.log(`  │  Top FoF: ${topResult.fof.gained} gained / ${topResult.fof.consumed} consumed  |  BF: ${topResult.bf.gained} gained / ${topResult.bf.consumed} consumed`);

  // Opener
  console.log(`  │`);
  console.log(`  ├── OPENER (first 15s) ${'─'.repeat(45)}`);
  console.log(`  │  Baodabao:`);
  for (const c of baoResult.opener) {
    console.log(`  │    ${c.time}s  ${c.spell}`);
  }
  if (topResult) {
    console.log(`  │  Top:`);
    for (const c of topResult.opener) {
      console.log(`  │    ${c.time}s  ${c.spell}`);
    }
  }

  console.log(`  └${'─'.repeat(68)}`);
}

// ═══════════════════════════════════════════════════════════════
// CROSS-BOSS SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(90)}`);
console.log('  CROSS-BOSS PATTERN SUMMARY');
console.log('═'.repeat(90));

console.log('\n  CPM across fights:');
for (const r of allBaoResults) {
  console.log(`    ${r.boss.padEnd(25)} ${r.cpm.toFixed(1)} CPM  (${r.totalCasts} casts, ${fmt(r.dur)})`);
}

const avgCpm = allBaoResults.reduce((s, r) => s + r.cpm, 0) / allBaoResults.length;
const topAvgCpm = allTopResults.length > 0 ? allTopResults.reduce((s, r) => s + r.cpm, 0) / allTopResults.length : 0;
console.log(`    ${'─'.repeat(55)}`);
console.log(`    Baodabao avg: ${avgCpm.toFixed(1)} CPM`);
if (topAvgCpm > 0) console.log(`    Top players avg: ${topAvgCpm.toFixed(1)} CPM`);

console.log('\n  Dead time across fights:');
for (const r of allBaoResults) {
  console.log(`    ${r.boss.padEnd(25)} ~${r.gcd.totalDeadTime.toFixed(0)}s dead  (${r.gcd.gapsOver3} gaps >3s)`);
}

console.log('\n  IV uptime across fights:');
for (const r of allBaoResults) {
  console.log(`    ${r.boss.padEnd(25)} ${r.ivUptime.pct}%`);
}

// ═══════════════════════════════════════════════════════════════
// ACTIONABLE FINDINGS
// ═══════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(90)}`);
console.log('  ACTIONABLE FINDINGS');
console.log('═'.repeat(90));

const topCpmRef = topAvgCpm > 0 ? topAvgCpm : 55;
const cpmPct = ((avgCpm / topCpmRef) * 100).toFixed(0);

const findings = [
  {
    title: 'ABC — ALWAYS BE CASTING',
    detail: `Baodabao averages ${avgCpm.toFixed(1)} CPM across ${allBaoResults.length} fights. Top players average ${topCpmRef.toFixed(1)} CPM. That's ${cpmPct}% of top player cast rate. Every second not casting is DPS left on the table. This is the single biggest DPS improvement available — press buttons faster, minimize downtime during movement.`,
    severity: avgCpm < topCpmRef * 0.8 ? 'CRITICAL' : avgCpm < topCpmRef * 0.9 ? 'HIGH' : 'MODERATE',
  },
];

const avgDeadTime = allBaoResults.reduce((s, r) => s + r.gcd.totalDeadTime, 0) / allBaoResults.length;
const topAvgDead = allTopResults.length > 0 ? allTopResults.reduce((s, r) => s + r.gcd.totalDeadTime, 0) / allTopResults.length : 0;
findings.push({
  title: 'DEAD TIME / MOVEMENT GAPS',
  detail: `Averaging ~${avgDeadTime.toFixed(0)}s of dead time per fight (gaps >3s between casts). Top players: ~${topAvgDead.toFixed(0)}s. These gaps likely happen during movement phases. Solutions: pre-position, use instant-cast procs (Ice Lance, Flurry) while moving, Shimmer to minimize movement time.`,
  severity: avgDeadTime > 30 ? 'HIGH' : 'MODERATE',
});

// CD efficiency
for (const cdId of [SPELLS.ICY_VEINS, SPELLS.FROZEN_ORB]) {
  const baoAvgEff = allBaoResults.reduce((s, r) => s + parseInt(r.cdUsage[cdId]?.efficiency || 0), 0) / allBaoResults.length;
  const name = SPELL_NAMES[cdId];
  if (baoAvgEff < 80) {
    findings.push({
      title: `${name.toUpperCase()} USAGE`,
      detail: `${name} used at ${baoAvgEff.toFixed(0)}% efficiency across fights (actual uses / expected uses based on fight duration). Lost uses = lost DPS windows. Use on cooldown — don't hold for "perfect" moments.`,
      severity: baoAvgEff < 60 ? 'HIGH' : 'MODERATE',
    });
  }
}

for (let i = 0; i < findings.length; i++) {
  const f = findings[i];
  console.log(`\n  ${i + 1}. [${f.severity}] ${f.title}`);
  console.log(`     ${f.detail}`);
}

console.log(`\n${'═'.repeat(90)}`);
console.log('  Analysis complete.');
console.log('═'.repeat(90));
