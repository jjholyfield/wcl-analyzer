import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = 'C:/DRIVE/CODE/wcl-analyzer/data';
const SPELL_MAP = JSON.parse(readFileSync('C:/DRIVE/CODE/wcl-analyzer/spell-names.json', 'utf8'));

function spell(id) { return SPELL_MAP[id] || `spell-${id}`; }

const MAJOR_CDS = {
  31884: 'Avenging Wrath',
  375576: 'Divine Toll',
  498: 'Divine Protection',
  31821: 'Aura Mastery',
  633: 'Lay on Hands',
  1022: 'Blessing of Protection',
  6940: 'Blessing of Sacrifice',
  853: 'Hammer of Justice',
};

const REPORT_DATES = {
  'XNAfKR6V4CabL8pZ': 'Mar 26',
  'JX4PcWA7tvQGL3pk': 'Mar 31',
  'nATLJYjzqRh9V3MZ': 'Mar 31',
  'yrtNXKxaDWdJ87Qq': 'Apr 7',
  'RpTqBVCcKfv1YHAh': 'Apr 14',
  'XgfKbhztC62Dxcnj': 'Apr 14',
  'nJmcgbtWwLh4KrY7': 'Apr 15',
  'JFLptr6QM87jmvDd': 'Apr 15',
  'qbA4xYMh6jZDgfm2': 'Apr 16',
  'XzJtFAw6n7Hhg1DP': 'Apr 16',
  'yK9mvGrjdwgNAFaM': 'Apr 16',
  'AmH6TqPnjWDdBLvV': 'Apr 16',
  'Ty6WFH92YBmGZ4Dj': 'Apr 21',
  'ZFB8LVN621dMXHQW': 'Apr 21',
};

function analyzeFight(data) {
  const { casts, buffs, healing, damage } = data.events;
  if (casts.length === 0 && healing.length === 0) return null;

  const fStart = data.fight.startTime;
  const fEnd = data.fight.endTime;
  const dur = (fEnd - fStart) / 1000;

  // Cast counts
  const castCounts = {};
  const cdTimings = {};
  for (const c of casts) {
    if (c.type !== 'cast' || c.fake) continue;
    const id = c.abilityGameID;
    const name = spell(id);
    castCounts[name] = (castCounts[name] || 0) + 1;
    if (MAJOR_CDS[id]) {
      if (!cdTimings[MAJOR_CDS[id]]) cdTimings[MAJOR_CDS[id]] = [];
      cdTimings[MAJOR_CDS[id]].push(((c.timestamp - fStart) / 1000).toFixed(0));
    }
  }

  // Healing
  const healBreak = {};
  let totalHeal = 0, totalOH = 0;
  for (const h of healing) {
    const name = spell(h.abilityGameID);
    if (!healBreak[name]) healBreak[name] = { eff: 0, oh: 0, count: 0 };
    healBreak[name].eff += (h.amount || 0);
    healBreak[name].oh += (h.overheal || 0);
    healBreak[name].count++;
    totalHeal += (h.amount || 0);
    totalOH += (h.overheal || 0);
  }

  let totalDmg = 0;
  for (const d of damage) totalDmg += (d.amount || 0);

  const ohPct = totalHeal > 0 ? ((totalOH / (totalHeal + totalOH)) * 100).toFixed(1) : '0';

  return {
    boss: data.fight.name,
    kill: data.fight.kill,
    dur,
    hps: (totalHeal / dur).toFixed(0),
    dps: (totalDmg / dur).toFixed(0),
    totalHeal, totalOH, ohPct,
    totalDmg,
    castCounts,
    cdTimings,
    healBreak: Object.fromEntries(
      Object.entries(healBreak)
        .sort((a, b) => b[1].eff - a[1].eff)
        .slice(0, 10)
    ),
  };
}

// Load all mcpounding fights
const allFights = [];
const reports = readdirSync(DATA_DIR).filter(d => d !== 'characters');
for (const report of reports) {
  const dir = join(DATA_DIR, report);
  try {
    const files = readdirSync(dir).filter(f => f.startsWith('mcpounding-'));
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const analysis = analyzeFight(data);
      if (!analysis) continue;
      analysis.report = report;
      analysis.date = REPORT_DATES[report] || '???';
      analysis.file = f;
      allFights.push(analysis);
    }
  } catch {}
}

// Sort by date
const dateOrder = ['Mar 26', 'Mar 31', 'Apr 7', 'Apr 14', 'Apr 15', 'Apr 16', 'Apr 21'];
allFights.sort((a, b) => dateOrder.indexOf(a.date) - dateOrder.indexOf(b.date));

// Filter to kills only
const kills = allFights.filter(f => f.kill);
const wipes = allFights.filter(f => !f.kill);

console.log('═══════════════════════════════════════════════════════════════════');
console.log(' McPOUNDING — ALL MYTHIC KILLS DETAILED ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Group kills by boss
const bosses = {};
for (const k of kills) {
  if (!bosses[k.boss]) bosses[k.boss] = [];
  bosses[k.boss].push(k);
}

for (const [boss, bKills] of Object.entries(bosses)) {
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log(`│  ${boss.toUpperCase().padEnd(62)}│`);
  console.log(`│  ${bKills.length} kills across ${new Set(bKills.map(k => k.date)).size} weeks${' '.repeat(62 - 20 - String(bKills.length).length - String(new Set(bKills.map(k => k.date)).size).length)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  for (const k of bKills) {
    console.log(`  ${k.date} | ${k.dur.toFixed(0)}s | HPS: ${k.hps} | DPS: ${k.dps} | OH: ${k.ohPct}%`);
  }

  // Averages
  const avgHPS = (bKills.reduce((s, k) => s + parseInt(k.hps), 0) / bKills.length).toFixed(0);
  const avgDPS = (bKills.reduce((s, k) => s + parseInt(k.dps), 0) / bKills.length).toFixed(0);
  const avgOH = (bKills.reduce((s, k) => s + parseFloat(k.ohPct), 0) / bKills.length).toFixed(1);
  console.log(`  ─── AVG: HPS ${avgHPS} | DPS ${avgDPS} | OH ${avgOH}% ───\n`);

  // Trend
  if (bKills.length >= 2) {
    const first = bKills[0];
    const last = bKills[bKills.length - 1];
    const hpsDelta = parseInt(last.hps) - parseInt(first.hps);
    const ohDelta = (parseFloat(last.ohPct) - parseFloat(first.ohPct)).toFixed(1);
    const arrow = (v) => v > 0 ? '↑' : v < 0 ? '↓' : '→';
    console.log(`  TREND (${first.date} → ${last.date}):`);
    console.log(`    HPS: ${arrow(hpsDelta)} ${hpsDelta > 0 ? '+' : ''}${hpsDelta}`);
    console.log(`    OH:  ${arrow(-parseFloat(ohDelta))} ${ohDelta > 0 ? '+' : ''}${ohDelta}%`);
    console.log('');
  }

  // CD usage across kills
  console.log('  CD TIMING PATTERNS:');
  for (const cdName of Object.values(MAJOR_CDS)) {
    const allTimings = bKills.map(k => k.cdTimings[cdName] || []).filter(t => t.length > 0);
    if (allTimings.length === 0) continue;
    const avgUses = (allTimings.reduce((s, t) => s + t.length, 0) / bKills.length).toFixed(1);
    const firstUse = allTimings.map(t => parseInt(t[0]));
    const avgFirstUse = firstUse.length > 0 ? (firstUse.reduce((s, v) => s + v, 0) / firstUse.length).toFixed(0) : 'N/A';
    console.log(`    ${cdName}: avg ${avgUses} uses/fight, avg first use at ${avgFirstUse}s`);
    for (let i = 0; i < bKills.length; i++) {
      const t = bKills[i].cdTimings[cdName];
      if (t) console.log(`      ${bKills[i].date}: ${t.join('s, ')}s`);
    }
  }

  // Top healing abilities (averaged across kills)
  console.log('\n  HEALING BREAKDOWN (avg across kills):');
  const healAgg = {};
  for (const k of bKills) {
    for (const [name, v] of Object.entries(k.healBreak)) {
      if (!healAgg[name]) healAgg[name] = { eff: 0, oh: 0, count: 0, fights: 0 };
      healAgg[name].eff += v.eff;
      healAgg[name].oh += v.oh;
      healAgg[name].count += v.count;
      healAgg[name].fights++;
    }
  }
  const sortedHeals = Object.entries(healAgg)
    .sort((a, b) => b[1].eff - a[1].eff)
    .slice(0, 8);
  for (const [name, v] of sortedHeals) {
    const avgEff = (v.eff / bKills.length).toLocaleString();
    const ohPct = v.eff > 0 ? ((v.oh / (v.eff + v.oh)) * 100).toFixed(1) : '0';
    console.log(`    ${name}: ${avgEff} avg eff (${ohPct}% oh)`);
  }

  // Cast efficiency
  console.log('\n  CAST PRIORITIES (avg per fight):');
  const castAgg = {};
  for (const k of bKills) {
    for (const [name, count] of Object.entries(k.castCounts)) {
      castAgg[name] = (castAgg[name] || 0) + count;
    }
  }
  const sortedCasts = Object.entries(castAgg)
    .map(([n, c]) => [n, (c / bKills.length).toFixed(1)])
    .filter(([n]) => !['Reclamation'].includes(n))
    .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
    .slice(0, 12);
  for (const [name, avg] of sortedCasts) {
    const perMin = (parseFloat(avg) / (bKills.reduce((s, k) => s + k.dur, 0) / bKills.length / 60)).toFixed(2);
    console.log(`    ${name}: ${avg}/fight (${perMin}/min)`);
  }

  console.log('\n');
}

// Cross-boss comparison
console.log('═══════════════════════════════════════════════════════════════════');
console.log(' CROSS-BOSS COMPARISON');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`${'Boss'.padEnd(28)} ${'Kills'.padStart(5)} ${'Avg HPS'.padStart(8)} ${'Avg DPS'.padStart(8)} ${'Avg OH%'.padStart(8)}`);
console.log('─'.repeat(60));
for (const [boss, bKills] of Object.entries(bosses)) {
  const avgHPS = (bKills.reduce((s, k) => s + parseInt(k.hps), 0) / bKills.length).toFixed(0);
  const avgDPS = (bKills.reduce((s, k) => s + parseInt(k.dps), 0) / bKills.length).toFixed(0);
  const avgOH = (bKills.reduce((s, k) => s + parseFloat(k.ohPct), 0) / bKills.length).toFixed(1);
  console.log(`${boss.padEnd(28)} ${String(bKills.length).padStart(5)} ${avgHPS.padStart(8)} ${avgDPS.padStart(8)} ${(avgOH + '%').padStart(8)}`);
}

// Wipe analysis
if (wipes.length > 0) {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' WIPE vs KILL COMPARISON (same bosses)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const wipesByBoss = {};
  for (const w of wipes) {
    if (!wipesByBoss[w.boss]) wipesByBoss[w.boss] = [];
    wipesByBoss[w.boss].push(w);
  }

  for (const [boss, bWipes] of Object.entries(wipesByBoss)) {
    if (!bosses[boss]) continue;
    const bKills2 = bosses[boss];
    const kHPS = (bKills2.reduce((s, k) => s + parseInt(k.hps), 0) / bKills2.length).toFixed(0);
    const kOH = (bKills2.reduce((s, k) => s + parseFloat(k.ohPct), 0) / bKills2.length).toFixed(1);
    const wHPS = (bWipes.reduce((s, w) => s + parseInt(w.hps), 0) / bWipes.length).toFixed(0);
    const wOH = (bWipes.reduce((s, w) => s + parseFloat(w.ohPct), 0) / bWipes.length).toFixed(1);
    console.log(`  ${boss}:`);
    console.log(`    Kills (${bKills2.length}): avg HPS ${kHPS}, avg OH ${kOH}%`);
    console.log(`    Wipes (${bWipes.length}): avg HPS ${wHPS}, avg OH ${wOH}%`);
    console.log(`    Delta: HPS ${(parseInt(kHPS) - parseInt(wHPS) > 0 ? '+' : '')}${parseInt(kHPS) - parseInt(wHPS)}, OH ${(parseFloat(kOH) - parseFloat(wOH)).toFixed(1)}%`);
    console.log('');
  }
}
