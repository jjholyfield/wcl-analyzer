import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = 'C:/DRIVE/CODE/wcl-analyzer/data';

const SPELL_NAMES = {
  1: 'Melee', 20473: 'Holy Shock', 25914: 'Holy Shock (heal)', 19750: 'Flash of Light',
  82326: 'Holy Light', 85222: 'Light of Dawn', 275773: 'Judgment', 156322: 'Eternal Flame',
  415388: 'Reclamation', 415091: 'Shield of the Righteous', 375576: 'Divine Toll',
  53652: 'Beacon of Light', 431415: 'Sun Sear', 143924: 'Leech', 469421: 'Lightbearer',
  364343: 'Echo', 31884: 'Avenging Wrath', 53563: 'Beacon of Light (cast)',
  498: 'Divine Protection', 596: 'Prayer of Healing', 26573: 'Consecration',
  1250828: 'Void Exposure', 1250686: 'Twisting Obscurity', 390971: 'Dawnlight',
  378213: 'Golden Hour', 1265595: 'Brought to Light', 119611: 'Renewing Mist',
  33076: 'Prayer of Mending', 157982: 'Tranquility', 139: 'Renew',
  355913: 'Emerald Blossom', 443126: 'Sureki Zealots Insignia',
  1262763: 'Benediction', 61295: 'Riptide', 1064: 'Chain Heal',
};

const MAJOR_CDS = [31884, 375576, 498]; // AW, Divine Toll, Divine Protection
const CD_NAMES = { 31884: 'Avenging Wrath', 375576: 'Divine Toll', 498: 'Divine Protection' };

function spellName(id) {
  return SPELL_NAMES[id] || `spell-${id}`;
}

function loadFight(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

function analyzeFight(data) {
  if (!data || !data.events) return null;
  const { casts, buffs, healing, damage } = data.events;
  const fightStart = data.fight.startTime;
  const fightEnd = data.fight.endTime;
  const duration = (fightEnd - fightStart) / 1000;

  // Cast counts (real casts only)
  const castCounts = {};
  const cdTimings = {};
  for (const c of casts) {
    if (c.type !== 'cast' || c.fake) continue;
    const id = c.abilityGameID;
    const name = spellName(id);
    castCounts[name] = (castCounts[name] || 0) + 1;

    if (MAJOR_CDS.includes(id)) {
      if (!cdTimings[CD_NAMES[id]]) cdTimings[CD_NAMES[id]] = [];
      cdTimings[CD_NAMES[id]].push(((c.timestamp - fightStart) / 1000).toFixed(1));
    }
  }

  // Healing breakdown
  const healBreak = {};
  let totalHeal = 0, totalOH = 0;
  for (const h of healing) {
    const name = spellName(h.abilityGameID);
    if (!healBreak[name]) healBreak[name] = { total: 0, oh: 0, count: 0 };
    healBreak[name].total += (h.amount || 0);
    healBreak[name].oh += (h.overheal || 0);
    healBreak[name].count++;
    totalHeal += (h.amount || 0);
    totalOH += (h.overheal || 0);
  }

  // Damage
  let totalDmg = 0;
  for (const d of damage) totalDmg += (d.amount || 0);

  // Buff uptimes for major CDs
  const cdUptimes = {};
  const buffStarts = {};
  for (const b of buffs) {
    const id = b.abilityGameID;
    if (!MAJOR_CDS.includes(id) && id !== 31884) continue;
    const name = spellName(id);
    if (b.type === 'applybuff') {
      buffStarts[name] = b.timestamp;
    } else if (b.type === 'removebuff' && buffStarts[name]) {
      if (!cdUptimes[name]) cdUptimes[name] = 0;
      cdUptimes[name] += b.timestamp - buffStarts[name];
      delete buffStarts[name];
    }
  }

  return {
    boss: data.fight.name,
    kill: data.fight.kill,
    bossPercent: data.fight.bossPercentage,
    duration,
    hps: (totalHeal / duration).toFixed(0),
    dps: (totalDmg / duration).toFixed(0),
    totalHeal,
    totalOH,
    ohPercent: totalHeal > 0 ? ((totalOH / (totalHeal + totalOH)) * 100).toFixed(1) : '0',
    castCounts,
    cdTimings,
    healBreak: Object.fromEntries(
      Object.entries(healBreak)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([n, v]) => [n, {
          eff: v.total,
          oh: v.total > 0 ? ((v.oh / (v.total + v.oh)) * 100).toFixed(1) + '%' : '0%',
          casts: v.count,
        }])
    ),
  };
}

// Find all mcpounding fight files
const reports = readdirSync(DATA_DIR).filter(d => d !== 'characters');
const fights = [];

for (const report of reports) {
  const dir = join(DATA_DIR, report);
  try {
    const files = readdirSync(dir).filter(f => f.startsWith('mcpounding-'));
    for (const f of files) {
      const data = loadFight(join(dir, f));
      if (data && data.events.casts.length > 0) {
        fights.push({ report, file: f, ...analyzeFight(data) });
      }
    }
  } catch {}
}

// Sort by date (use report code order from recent reports)
const reportOrder = ['nJmcgbtWwLh4KrY7', 'qbA4xYMh6jZDgfm2', 'XzJtFAw6n7Hhg1DP', 'Ty6WFH92YBmGZ4Dj', 'ZFB8LVN621dMXHQW'];

fights.sort((a, b) => {
  const ai = reportOrder.indexOf(a.report);
  const bi = reportOrder.indexOf(b.report);
  return ai - bi;
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('McPOUNDING — MULTI-FIGHT ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const f of fights) {
  const status = f.kill ? 'KILL' : `${(f.bossPercent / 100).toFixed(1)}% wipe`;
  console.log(`── ${f.boss} [${status}] ${f.duration.toFixed(0)}s ──`);
  console.log(`   HPS: ${f.hps} | DPS: ${f.dps} | Overheal: ${f.ohPercent}%`);
  console.log(`   Total Healing: ${f.totalHeal.toLocaleString()} | Total OH: ${f.totalOH.toLocaleString()}`);

  console.log('   Casts:');
  const sorted = Object.entries(f.castCounts)
    .filter(([n]) => n !== 'Reclamation')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [name, count] of sorted) {
    console.log(`     ${name}: ${count}`);
  }

  console.log('   CD Timings (seconds into fight):');
  for (const [cd, times] of Object.entries(f.cdTimings)) {
    console.log(`     ${cd}: ${times.join('s, ')}s`);
  }

  console.log('   Top Heals:');
  for (const [name, v] of Object.entries(f.healBreak).slice(0, 5)) {
    console.log(`     ${name}: ${v.eff.toLocaleString()} eff (${v.oh} oh, ${v.casts} hits)`);
  }
  console.log('');
}

// Trend summary
console.log('═══════════════════════════════════════════════════════════════');
console.log('TREND SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

const byBoss = {};
for (const f of fights) {
  if (!byBoss[f.boss]) byBoss[f.boss] = [];
  byBoss[f.boss].push(f);
}

for (const [boss, bfights] of Object.entries(byBoss)) {
  console.log(`${boss} (${bfights.length} fights):`);
  const avgHPS = (bfights.reduce((s, f) => s + parseInt(f.hps), 0) / bfights.length).toFixed(0);
  const avgOH = (bfights.reduce((s, f) => s + parseFloat(f.ohPercent), 0) / bfights.length).toFixed(1);
  const avgDPS = (bfights.reduce((s, f) => s + parseInt(f.dps), 0) / bfights.length).toFixed(0);
  console.log(`  Avg HPS: ${avgHPS} | Avg DPS: ${avgDPS} | Avg OH: ${avgOH}%`);

  // CD usage per minute
  for (const cdName of Object.values(CD_NAMES)) {
    const uses = bfights.map(f => (f.cdTimings[cdName]?.length || 0));
    const durations = bfights.map(f => f.duration);
    const perMin = uses.map((u, i) => (u / durations[i] * 60).toFixed(2));
    const avgPerMin = (perMin.reduce((s, v) => s + parseFloat(v), 0) / perMin.length).toFixed(2);
    console.log(`  ${cdName}: avg ${avgPerMin}/min`);
  }
  console.log('');
}

// Now load top players for comparison
console.log('═══════════════════════════════════════════════════════════════');
console.log('TOP PLAYER CD COMPARISON (Salhadaar)');
console.log('═══════════════════════════════════════════════════════════════\n');

const topFiles = [
  { name: 'Charlydin (#1)', path: join(DATA_DIR, '1mAGvxq7nptrJFQ2/charlydin-fight22.json') },
  { name: 'Shepardl (#4)', path: join(DATA_DIR, 'CrNF9DKZacqf864g/shepardl-fight38.json') },
];

for (const tf of topFiles) {
  const data = loadFight(tf.path);
  if (!data || data.events.casts.length === 0) continue;
  const a = analyzeFight(data);
  console.log(`── ${tf.name} — ${a.boss} [KILL] ${a.duration.toFixed(0)}s ──`);
  console.log(`   HPS: ${a.hps} | DPS: ${a.dps} | Overheal: ${a.ohPercent}%`);
  console.log('   CD Timings:');
  for (const [cd, times] of Object.entries(a.cdTimings)) {
    console.log(`     ${cd}: ${times.join('s, ')}s`);
  }
  console.log('   Top Heals:');
  for (const [name, v] of Object.entries(a.healBreak).slice(0, 5)) {
    console.log(`     ${name}: ${v.eff.toLocaleString()} eff (${v.oh} oh, ${v.casts} hits)`);
  }
  console.log('');
}
