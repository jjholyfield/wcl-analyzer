/**
 * Windwalker Monk Mythic+ data pull: everything needed to grade a WW's keys
 * against the Season 2 Conduit rules (guides/ww-conduit-s2-rules.md).
 *
 * Usage:
 *   node scripts/ww-conduit-pull.mjs <reportCode> [playerName] [--fight <fightID>]
 *
 * Picks the Windwalker-iconed Monk in the report unless a name is given.
 * Pulls every keystone fight the player was in. Output:
 *   data/<reportCode>/ww/<player>/meta.json        report, fights, actors, ability names, player
 *   data/<reportCode>/ww/<player>/fight<id>-casts.json      cast + begincast events, with classResources (energy/chi)
 *   data/<reportCode>/ww/<player>/fight<id>-buffs.json      buff events ON the player (apply/remove/refresh/stack)
 *   data/<reportCode>/ww/<player>/fight<id>-dmgdone.json    damage events BY the player (ticks, targets, crits)
 *   data/<reportCode>/ww/<player>/fight<id>-dmgtaken.json   damage events ON the player
 *   data/<reportCode>/ww/<player>/fight<id>-resources.json  resourcechange events for the player
 *   data/<reportCode>/ww/<player>/fight<id>-deaths.json     all friendly deaths in the key
 *   data/<reportCode>/ww/<player>/fight<id>-interrupts.json interrupts BY the player
 *   data/<reportCode>/ww/<player>/fight<id>-combatant.json  CombatantInfo (gear, talents, auras, stats) + talent import code
 */
import { gql, gqlPaged, lcName } from './wcl-lib.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const fightArgIdx = argv.indexOf('--fight');
const onlyFight = fightArgIdx >= 0 ? Number(argv[fightArgIdx + 1]) : null;
// --dir <name>: the subfolder under data/<report>/ (default "ww"; the Ret audit uses "ret"). The pull itself is class-agnostic.
const dirArgIdx = argv.indexOf('--dir');
const subDir = dirArgIdx >= 0 ? argv[dirArgIdx + 1] : 'ww';
const skip = new Set();
if (fightArgIdx >= 0) { skip.add(fightArgIdx); skip.add(fightArgIdx + 1); }
if (dirArgIdx >= 0) { skip.add(dirArgIdx); skip.add(dirArgIdx + 1); }
const [code, nameArg] = argv.filter((a, i) => !skip.has(i));
if (!code) {
  console.error('Usage: node scripts/ww-conduit-pull.mjs <reportCode> [playerName] [--fight <fightID>]');
  process.exit(1);
}

const report = (await gql(`query($code:String!){ reportData { report(code:$code){
  code title startTime endTime zone { id name }
  fights { id encounterID name kill difficulty keystoneLevel keystoneAffixes keystoneTime startTime endTime friendlyPlayers
    dungeonPulls { id name encounterID kill startTime endTime } }
  masterData(translate:true){ actors(type:"Player"){ id name server subType icon } abilities { gameID name type } }
}}}`, { code })).reportData.report;

const monks = report.masterData.actors.filter(a => a.subType === 'Monk');
const player = nameArg
  ? report.masterData.actors.find(a => lcName(a.name) === lcName(nameArg))
  : (monks.find(a => /Windwalker/i.test(a.icon || '')) || monks[0]);
if (!player) {
  console.error('No matching player. Monks in report: ' + monks.map(m => m.name + ' (' + m.icon + ')').join(', '));
  process.exit(1);
}

const keys = report.fights.filter(f => f.keystoneLevel && (f.friendlyPlayers || []).includes(player.id) && (onlyFight === null || f.id === onlyFight));
if (!keys.length) {
  console.error(player.name + ' is in no keystone fight of this report.');
  process.exit(1);
}

const outDir = join(__dirname, '..', 'data', code, subDir, lcName(player.name));
mkdirSync(outDir, { recursive: true });
const save = (name, obj) => writeFileSync(join(outDir, name), JSON.stringify(obj));

console.log(`${player.name}-${player.server} (${player.icon}) in ${keys.length} key(s): ` +
  keys.map(f => `[${f.id}] ${f.name} +${f.keystoneLevel}`).join(', '));

// WCL paging gotcha (proven 2026-10-22 on z38dgtbNhaKLQP6k): when startTime is passed WITHOUT
// endTime, the second page comes back empty, so any fight with more than 10,000 events of one
// type is silently truncated. Always pass the fight's endTime alongside startTime.
function events(fight, args) {
  return gqlPaged(np =>
    `{ reportData { report(code: "${code}") { events(fightIDs: [${fight.id}], limit: 10000${np ? ', startTime: ' + np + ', endTime: ' + fight.endTime : ''}, ${args}) { data nextPageTimestamp } } } }`);
}

const abilityNames = {};
for (const a of report.masterData.abilities) abilityNames[a.gameID] = a.name;

save('meta.json', {
  pulledAt: new Date().toISOString(),
  report: { code: report.code, title: report.title, startTime: report.startTime, endTime: report.endTime, zone: report.zone },
  player,
  actors: report.masterData.actors.filter(a => a.subType !== 'Unknown'),
  fights: keys,
  abilityNames,
});

for (const f of keys) {
  const tag = `fight${f.id}`;
  console.log(`\n[${f.id}] ${f.name} +${f.keystoneLevel} (${((f.endTime - f.startTime) / 1000).toFixed(0)}s)`);

  const casts = await events(f, `dataType: Casts, sourceID: ${player.id}, includeResources: true`);
  save(`${tag}-casts.json`, casts);
  console.log(`  casts ${casts.length}`);

  const buffs = await events(f, `dataType: Buffs, targetID: ${player.id}`);
  save(`${tag}-buffs.json`, buffs);
  console.log(`  buffs ${buffs.length}`);

  // debuffs the player put on enemies (Judgment, Expurgation, Dawnlight, Sun Sear ...). WCL: Debuffs with
  // sourceID filters by the TARGET (like DamageTaken), so fetch every enemy debuff and keep this player's.
  const debuffsAll = await events(f, `dataType: Debuffs, hostilityType: Enemies`);
  const debuffs = debuffsAll.filter(e => e.sourceID === player.id);
  save(`${tag}-debuffs.json`, debuffs);
  console.log(`  debuffs ${debuffs.length} (of ${debuffsAll.length} enemy debuff events)`);

  const dmg = await events(f, `dataType: DamageDone, sourceID: ${player.id}`);
  save(`${tag}-dmgdone.json`, dmg);
  console.log(`  dmgdone ${dmg.length}`);

  const taken = await events(f, `dataType: DamageTaken, sourceID: ${player.id}`); // DamageTaken: sourceID is the actor TAKING the damage
  save(`${tag}-dmgtaken.json`, taken);
  console.log(`  dmgtaken ${taken.length}`);

  const res = await events(f, `dataType: Resources, sourceID: ${player.id}`);
  save(`${tag}-resources.json`, res);
  console.log(`  resources ${res.length}`);

  const deaths = await events(f, `dataType: Deaths`);
  save(`${tag}-deaths.json`, deaths);
  console.log(`  deaths ${deaths.length}`);

  const ints = await events(f, `dataType: Interrupts, sourceID: ${player.id}`);
  save(`${tag}-interrupts.json`, ints);
  console.log(`  interrupts ${ints.length}`);

  const ci = await gql(`{ reportData { report(code: "${code}") {
    events(fightIDs: [${f.id}], dataType: CombatantInfo, sourceID: ${player.id}) { data }
    fights(fightIDs: [${f.id}]) { talentImportCode(actorID: ${player.id}) }
  } } }`);
  save(`${tag}-combatant.json`, {
    combatantInfo: ci.reportData.report.events.data,
    talentImportCode: ci.reportData.report.fights[0]?.talentImportCode || null,
  });
  console.log(`  combatantinfo ${ci.reportData.report.events.data.length}, talent code ${ci.reportData.report.fights[0]?.talentImportCode ? 'yes' : 'no'}`);
}

console.log(`\nSaved to ${outDir}`);
