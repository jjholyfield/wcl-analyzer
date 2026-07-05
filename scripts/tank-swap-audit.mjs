/**
 * Tank taunt / swap audit for a single fight (top kill or our pull).
 *
 * Usage:
 *   node scripts/tank-swap-audit.mjs <reportCode> <fightID>
 *   node scripts/tank-swap-audit.mjs ckW71zqxQ8Dbnf9g 39
 *
 * Verified API facts (2026-07-04):
 * - Tanks come from report.playerDetails(fightIDs) JSON scalar — NEVER hardcode roster.
 * - Monk Provoke logs as 115546 (116189 never appears in cast events).
 * - Death Grip 49576 is a Blood DK add-pickup tool, not a boss-swap taunt.
 * - filterExpression "target.id in (...)" uses GAME IDs, not report actor IDs — filter targets client-side.
 * - Environment-sourced "enemy" casts (e.g. ground effects) must be excluded from trigger candidates.
 */
import { gql, gqlPaged, fmt } from './wcl-lib.mjs';

const [reportCode, fightArg] = process.argv.slice(2);
if (!reportCode || !fightArg) {
  console.error('Usage: node scripts/tank-swap-audit.mjs <reportCode> <fightID>');
  process.exit(1);
}
const FIGHT = Number(fightArg);

const TAUNTS = {
  355: 'Taunt (Warrior)', 185245: 'Torment (DH)', 56222: 'Dark Command (DK)',
  6795: 'Growl (Druid)', 62124: 'Hand of Reckoning (Paladin)', 115546: 'Provoke (Monk)',
  49576: 'Death Grip (DK)',
};
const ADD_PICKUP_ONLY = new Set([49576]);
const tauntFilter = Object.keys(TAUNTS).map(id => 'ability.id=' + id).join(' OR ');

async function main() {
  const r = await gql(
    '{ reportData { report(code: "' + reportCode + '") { ' +
    'fights(fightIDs: [' + FIGHT + ']) { id startTime endTime kill } ' +
    'masterData { abilities { gameID name } actors { id name type subType } } ' +
    'playerDetails(fightIDs: [' + FIGHT + ']) ' +
    '} } }'
  );
  const report = r.reportData.report;
  const fight = report.fights[0];
  if (!fight) throw new Error('Fight ' + FIGHT + ' not found');
  const dur = (fight.endTime - fight.startTime) / 1000;

  const abilityName = {};
  report.masterData.abilities.forEach(a => { abilityName[a.gameID] = a.name; });
  const actorById = {};
  report.masterData.actors.forEach(a => { actorById[a.id] = a; });

  const tanks = report.playerDetails?.data?.playerDetails?.tanks || [];
  if (!tanks.length) throw new Error('No tanks in playerDetails for this fight');
  const tankIds = new Set(tanks.map(t => t.id));
  console.log('Fight ' + FIGHT + ' (' + fmt(dur) + (fight.kill ? ', KILL' : ', wipe') + ') — tanks: ' + tanks.map(t => t.name + ' (' + (t.specs?.[0]?.spec || t.type) + ')').join(', ') + '\n');

  const tauntCasts = (await gqlPaged(np =>
    '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + FIGHT + '], dataType: Casts, hostilityType: Friendlies, filterExpression: "' + tauntFilter + '"' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'))
    .filter(e => e.type === 'cast' && tankIds.has(e.sourceID))
    .map(e => ({
      t: (e.timestamp - fight.startTime) / 1000,
      tank: actorById[e.sourceID]?.name || '?',
      taunt: TAUNTS[e.abilityGameID],
      abilityId: e.abilityGameID,
      target: actorById[e.targetID],
      targetInstance: e.targetInstance,
    }))
    .sort((a, b) => a.t - b.t);

  const enemyOnTanks = (await gqlPaged(np =>
    '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + FIGHT + '], dataType: Casts, hostilityType: Enemies' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'))
    .filter(e => e.type === 'cast' && tankIds.has(e.targetID) && actorById[e.sourceID]?.name !== 'Environment')
    .map(e => ({
      t: (e.timestamp - fight.startTime) / 1000,
      ability: abilityName[e.abilityGameID] || 'spell:' + e.abilityGameID,
      abilityId: e.abilityGameID,
      source: actorById[e.sourceID]?.name || '?',
      targetTank: actorById[e.targetID]?.name || '?',
    }))
    .sort((a, b) => a.t - b.t);

  console.log('══════ TAUNT TIMELINE ══════');
  const seenBossTargets = new Set();
  for (const c of tauntCasts) {
    const isBoss = c.target?.subType === 'Boss';
    const isAddTool = ADD_PICKUP_ONLY.has(c.abilityId);
    let kind;
    if (!isBoss || isAddTool) kind = 'ADD PICKUP';
    else if (!seenBossTargets.has(c.target.id)) { kind = 'PICKUP'; seenBossTargets.add(c.target.id); }
    else kind = 'SWAP';

    const targetName = (c.target?.name || '?') + (c.targetInstance ? ' #' + c.targetInstance : '');
    console.log(fmt(c.t).padEnd(7) + kind.padEnd(12) + c.tank.padEnd(14) + c.taunt.padEnd(24) + '→ ' + targetName);

    if (kind === 'SWAP') {
      const preceding = enemyOnTanks.filter(e => e.t < c.t && e.t >= c.t - 20);
      preceding.slice(-4).forEach(e => {
        console.log('       '.padEnd(7) + '  trigger? '.padEnd(12) + ('-' + Math.round(c.t - e.t) + 's ').padEnd(8) + e.ability + ' → ' + e.targetTank);
      });
    }
  }

  console.log('\n══════ TANK-TARGETED BOSS ABILITY CADENCE ══════');
  const byAbility = {};
  enemyOnTanks.forEach(e => { (byAbility[e.ability] ||= []).push(e.t); });
  for (const [name, times] of Object.entries(byAbility).sort((a, b) => b[1].length - a[1].length)) {
    if (times.length < 2) { console.log('  ' + name + ': 1 cast @ ' + fmt(times[0])); continue; }
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    console.log('  ' + name + ': ' + times.length + ' casts, ~' + Math.round(median) + 's cadence (' + fmt(times[0]) + ' → ' + fmt(times[times.length - 1]) + ')');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
