/**
 * Raid damage-taken timeline for a single fight — first-contact tool for a new boss.
 * Closes New Boss Checklist item 1: derive BOSS_CONFIGS phases + damage windows
 * from a damage-taken timeline on a top kill (or our best pull).
 *
 * Usage:
 *   node scripts/boss-timeline.mjs <reportCode> <fightID>
 *   node scripts/boss-timeline.mjs JbM2DNfB4Vz83aTm 46
 *
 * Method:
 *   1. Pull ALL friendly DamageTaken events (paged).
 *   2. Aggregate into 10s buckets: total damage + top 3 abilities per bucket.
 *   3. Print the timeline with bars; buckets > 1.5x fight average are damage windows.
 *   4. Guess phase boundaries from damage lulls (< 0.35x average) — mark as TODO.
 *   5. Print a ready-to-paste BOSS_CONFIGS entry for scripts/defensive-audit.mjs.
 */
import { gql, gqlPaged, fmt, lcName } from './wcl-lib.mjs';

const [reportCode, fightArg] = process.argv.slice(2);
if (!reportCode || !fightArg) {
  console.error('Usage: node scripts/boss-timeline.mjs <reportCode> <fightID>');
  process.exit(1);
}
const FIGHT = Number(fightArg);

const BUCKET = 10;            // seconds per bucket
const WINDOW_FACTOR = 1.5;    // bucket > 1.5x avg = damage window
const LULL_FACTOR = 0.35;     // bucket < 0.35x avg = lull (phase boundary candidate)
const BAR_WIDTH = 40;         // chars for the biggest bucket

function mfmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}

async function main() {
  const r = await gql(
    '{ reportData { report(code: "' + reportCode + '") { ' +
    'fights(fightIDs: [' + FIGHT + ']) { id name startTime endTime kill difficulty } ' +
    'masterData { abilities { gameID name } } ' +
    '} } }'
  );
  const report = r.reportData.report;
  const fight = report.fights[0];
  if (!fight) throw new Error('Fight ' + FIGHT + ' not found');
  const dur = (fight.endTime - fight.startTime) / 1000;
  const abilityName = {};
  report.masterData.abilities.forEach(a => { abilityName[a.gameID] = a.name; });

  const events = await gqlPaged(np =>
    '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + FIGHT + '], dataType: DamageTaken, hostilityType: Friendlies' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }');

  console.log(fight.name + ' — fight ' + FIGHT + ' (' + fmt(dur) + (fight.kill ? ', KILL' : ', wipe') + ', difficulty ' + fight.difficulty + ') — ' + events.length + ' damage events\n');

  // ── Aggregate into buckets: total + per-ability ──
  const nBuckets = Math.ceil(dur / BUCKET);
  const buckets = Array.from({ length: nBuckets }, () => ({ total: 0, byAbility: {} }));
  for (const e of events) {
    const amt = (e.amount || 0) + (e.absorbed || 0);
    if (!amt) continue;
    const t = (e.timestamp - fight.startTime) / 1000;
    const b = buckets[Math.min(Math.floor(t / BUCKET), nBuckets - 1)];
    b.total += amt;
    const name = abilityName[e.abilityGameID] || 'spell:' + e.abilityGameID;
    b.byAbility[name] = (b.byAbility[name] || 0) + amt;
  }

  const totalDamage = buckets.reduce((s, b) => s + b.total, 0);
  const avg = totalDamage / nBuckets;
  const max = Math.max(...buckets.map(b => b.total));

  const topAbilities = b => Object.entries(b.byAbility).sort((a, c) => c[1] - a[1]).slice(0, 3);

  console.log('══════ DAMAGE-TAKEN TIMELINE (' + BUCKET + 's buckets, avg ' + mfmt(avg) + '/bucket) ══════');
  buckets.forEach((b, i) => {
    const t0 = i * BUCKET;
    const bar = '█'.repeat(Math.round((b.total / max) * BAR_WIDTH));
    const flag = b.total > avg * WINDOW_FACTOR ? ' ◆' : (b.total < avg * LULL_FACTOR ? ' ·lull' : '');
    const tops = topAbilities(b).map(([n, v]) => n + ' ' + mfmt(v)).join(', ');
    console.log(fmt(t0).padStart(5) + '-' + fmt(Math.min(t0 + BUCKET, dur)).padEnd(6) + mfmt(b.total).padStart(7) + ' ' + bar.padEnd(BAR_WIDTH + 1) + flag.padEnd(7) + (tops ? ' ' + tops : ''));
  });

  // ── Merge adjacent hot buckets into damage windows ──
  const windows = [];
  for (let i = 0; i < nBuckets; i++) {
    if (buckets[i].total <= avg * WINDOW_FACTOR) continue;
    const start = i;
    while (i + 1 < nBuckets && buckets[i + 1].total > avg * WINDOW_FACTOR) i++;
    const slice = buckets.slice(start, i + 1);
    const byAbility = {};
    slice.forEach(b => { for (const [n, v] of Object.entries(b.byAbility)) byAbility[n] = (byAbility[n] || 0) + v; });
    windows.push({
      from: start * BUCKET,
      to: Math.min((i + 1) * BUCKET, Math.ceil(dur)),
      total: slice.reduce((s, b) => s + b.total, 0),
      top: Object.entries(byAbility).sort((a, c) => c[1] - a[1]).slice(0, 3),
    });
  }

  console.log('\n══════ DAMAGE WINDOWS (buckets > ' + WINDOW_FACTOR + 'x avg) ══════');
  for (const w of windows) {
    console.log('  ' + fmt(w.from) + '-' + fmt(w.to) + '  ' + mfmt(w.total).padStart(7) + '  ' + w.top.map(([n, v]) => n + ' ' + mfmt(v)).join(', '));
  }

  // ── Lulls = phase boundary candidates ──
  const lulls = [];
  for (let i = 1; i < nBuckets - 1; i++) {  // skip first/last bucket (pull + kill ramp)
    if (buckets[i].total >= avg * LULL_FACTOR) continue;
    const start = i;
    while (i + 1 < nBuckets - 1 && buckets[i + 1].total < avg * LULL_FACTOR) i++;
    lulls.push({ from: start * BUCKET, to: (i + 1) * BUCKET });
  }
  console.log('\n══════ LULLS (buckets < ' + LULL_FACTOR + 'x avg — phase boundary candidates) ══════');
  if (!lulls.length) console.log('  none — fight may be single-phase or evenly paced');
  for (const l of lulls) console.log('  ' + fmt(l.from) + '-' + fmt(l.to));

  // ── Ready-to-paste BOSS_CONFIGS entry ──
  const bossKey = lcName(fight.name).replace(/[^a-z0-9]/g, '').slice(0, 12) || 'newboss';
  console.log('\n══════ BOSS_CONFIGS ENTRY (paste into scripts/defensive-audit.mjs) ══════');
  console.log('  ' + bossKey + ': {');
  console.log('    // Derived from ' + reportCode + ' fight ' + FIGHT + ' (' + fmt(dur) + (fight.kill ? ' kill' : ' wipe') + '). Verify phases on our own pulls.');
  console.log('    phases: [');
  if (lulls.length) {
    let prev = 'P1';
    lulls.forEach((l, i) => {
      console.log('      { name: \'' + prev + '\', end: ' + l.from + ' },  // TODO: lull ' + fmt(l.from) + '-' + fmt(l.to) + ' — confirm phase boundary');
      prev = 'P' + (i + 2);
    });
    console.log('      { name: \'' + prev + '\', end: Infinity },');
  } else {
    console.log('      { name: \'P1\', end: Infinity },  // TODO: no lulls detected — confirm single-phase');
  }
  console.log('    ],');
  console.log('    windows: [');
  for (const w of windows) {
    const name = w.top.slice(0, 2).map(([n]) => n).join(' + ') + ' (~' + fmt(w.from + BUCKET / 2) + ')';
    console.log('      { from: ' + w.from + ', to: ' + w.to + ', name: \'' + name.replace(/'/g, "\\'") + '\' },');
  }
  console.log('    ],');
  console.log('  },');
}

main().catch(e => { console.error(e); process.exit(1); });
