/**
 * Offensive burst-window recon from a kill log: when did they lust, and when did
 * each player send their long offensive CDs?
 *
 * Usage:
 *   node scripts/burst-windows.mjs <reportCode> <fightID>
 *
 * Long-CD detection is data-driven (no spell DB): a spell a player cast 1-3 times
 * in the fight, first cast either on pull (<25s) or later (a held CD), is treated
 * as a major CD. Filters out low-frequency utility noise by requiring the spell to
 * appear for at least 2 players OR be a known lust/major ID.
 */
import { gql, gqlPaged, fmt } from './wcl-lib.mjs';

const [reportCode, fightArg] = process.argv.slice(2);
if (!reportCode || !fightArg) {
  console.error('Usage: node scripts/burst-windows.mjs <reportCode> <fightID>');
  process.exit(1);
}
const FIGHT = Number(fightArg);

const LUST_IDS = new Map([
  [2825, 'Bloodlust'], [32182, 'Heroism'], [80353, 'Time Warp'],
  [390386, 'Fury of the Aspects'], [264667, 'Primal Rage'], [466904, "Harrier's Cry"],
]);

async function main() {
  const r = await gql(
    '{ reportData { report(code: "' + reportCode + '") { ' +
    'fights(fightIDs: [' + FIGHT + ']) { id startTime endTime kill } ' +
    'masterData { abilities { gameID name } actors(type: "Player") { id name subType } } ' +
    '} } }'
  );
  const fight = r.reportData.report.fights[0];
  if (!fight) throw new Error('Fight not found');
  const dur = (fight.endTime - fight.startTime) / 1000;
  const abilityName = {};
  r.reportData.report.masterData.abilities.forEach(a => { abilityName[a.gameID] = a.name; });
  const actors = {};
  r.reportData.report.masterData.actors.forEach(a => { actors[a.id] = a; });

  const casts = (await gqlPaged(np =>
    '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + FIGHT + '], dataType: Casts, hostilityType: Friendlies' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'))
    .filter(e => e.type === 'cast' && actors[e.sourceID]);

  console.log('Fight ' + FIGHT + ' (' + fmt(dur) + (fight.kill ? ', KILL' : ', wipe') + ')\n');

  // Lust
  const lusts = casts.filter(c => LUST_IDS.has(c.abilityGameID))
    .map(c => ({ t: (c.timestamp - fight.startTime) / 1000, name: LUST_IDS.get(c.abilityGameID), who: actors[c.sourceID].name }));
  console.log('══════ LUST ══════');
  if (!lusts.length) console.log('  none detected');
  lusts.forEach(l => console.log('  ' + fmt(l.t) + '  ' + l.name + ' (' + l.who + ')'));

  // Per player+spell cast counts and times
  const bySpell = {};
  for (const c of casts) {
    const key = c.sourceID + '|' + c.abilityGameID;
    (bySpell[key] ||= []).push((c.timestamp - fight.startTime) / 1000);
  }

  // Candidate major CDs: 1-3 casts per player
  const candidates = {};
  for (const [key, times] of Object.entries(bySpell)) {
    if (times.length < 1 || times.length > 3) continue;
    const [pid, sid] = key.split('|').map(Number);
    const name = abilityName[sid];
    if (!name) continue;
    (candidates[sid] ||= { name, players: [] }).players.push({
      who: actors[pid].name, spec: actors[pid].subType, times: times.sort((a, b) => a - b),
    });
  }

  // Keep spells used by 2+ players (raid-wide CD pattern) — per-spec uniques shown after
  console.log('\n══════ OFFENSIVE CD CLUSTERS (spells cast 1-3x by 2+ players) ══════');
  const shared = Object.entries(candidates).filter(([, v]) => v.players.length >= 2)
    .sort((a, b) => b[1].players.length - a[1].players.length);
  for (const [sid, v] of shared.slice(0, 25)) {
    const firstCasts = v.players.map(p => p.times[0]);
    const allCasts = v.players.flatMap(p => p.times).sort((a, b) => a - b);
    console.log('  ' + v.name.padEnd(30) + v.players.length + ' players | casts at: ' + allCasts.map(fmt).join(', '));
  }

  // Cluster ALL major-CD first+later casts into time buckets to reveal the send windows
  console.log('\n══════ SEND WINDOWS (all candidate major-CD casts, 15s buckets) ══════');
  const buckets = {};
  for (const v of Object.values(candidates)) {
    for (const p of v.players) for (const t of p.times) {
      const b = Math.floor(t / 15) * 15;
      buckets[b] = (buckets[b] || 0) + 1;
    }
  }
  const max = Math.max(...Object.values(buckets));
  for (const [b, n] of Object.entries(buckets).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    if (n < max * 0.25) continue;
    console.log('  ' + fmt(Number(b)).padEnd(7) + '#'.repeat(Math.round(n / max * 40)).padEnd(42) + n + ' CD casts');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
