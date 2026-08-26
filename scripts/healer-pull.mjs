/**
 * healer-pull.mjs — Pull + cache all event data needed for a healer audit.
 *
 * Kill fights get the full pull (casts, healing, damage done, deaths, enemy
 * casts, other healers' casts, damage taken if the player died). Wipes get a
 * light pull (deaths + player casts) for CD-discipline and death-pattern work.
 * Per-fight healing tables are pulled for every fight for HPS/overheal trends.
 *
 * Usage:
 *   node scripts/healer-pull.mjs <reportCode> <playerName> [difficulty=4]
 *
 * Output: data/<reportCode>/audit/  (meta.json, tables.json, combatantinfo.json,
 *         fight<id>-{casts,healing,dmgdone,dmgtaken,deaths,enemycasts,healercds}.json)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gql, gqlPaged } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const [code, playerName, diffArg] = process.argv.slice(2);
if (!code || !playerName) {
  console.error('Usage: node scripts/healer-pull.mjs <reportCode> <playerName> [difficulty=4]');
  process.exit(1);
}
const DIFF = Number(diffArg || 4);
const outDir = join(ROOT, 'data', code, 'audit');
mkdirSync(outDir, { recursive: true });

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function save(name, obj) {
  writeFileSync(join(outDir, name), JSON.stringify(obj));
  console.log('  saved', name);
}

async function events(fightID, params) {
  return gqlPaged((start) => {
    const s = start ? `, startTime: ${start}` : '';
    return `{reportData{report(code:"${code}"){events(${params}, fightIDs:[${fightID}]${s}){data, nextPageTimestamp}}}}`;
  });
}

// ── 1. Report metadata ──
const meta = await gql(`{reportData{report(code:"${code}"){
  title, startTime,
  fights{ id name difficulty kill encounterID fightPercentage startTime endTime }
  masterData{ abilities{ gameID name } actors{ id name type subType } }
}}}`);
const report = meta.reportData.report;
const fights = report.fights.filter((f) => f.difficulty === DIFF && f.encounterID);
const abilityMap = {};
for (const a of report.masterData.abilities) abilityMap[a.gameID] = a.name;

const player = report.masterData.actors.find(
  (a) => a.type === 'Player' && norm(a.name) === norm(playerName)
);
if (!player) {
  console.error('Player not found:', playerName);
  process.exit(1);
}
console.log(`Report ${code} — ${report.title} — player ${player.name} (id ${player.id}), ${fights.length} fights at difficulty ${DIFF}`);

// ── 2. Roster from a kill fight (fall back to longest fight) ──
const kills = fights.filter((f) => f.kill);
const rosterFight = kills[kills.length - 1] || fights.reduce((a, b) => (b.endTime - b.startTime > a.endTime - a.startTime ? b : a), fights[0]);
const pdRes = await gql(`{reportData{report(code:"${code}"){playerDetails(fightIDs:[${rosterFight.id}])}}}`);
const pd = pdRes.reportData.report.playerDetails.data.playerDetails;
const healers = (pd.healers || []).map((h) => ({ id: h.id, name: h.name, type: h.type, spec: h.specs?.[0]?.spec }));

save('meta.json', {
  code, title: report.title, startTime: report.startTime, difficulty: DIFF,
  player: { id: player.id, name: player.name },
  fights, healers, abilityMap,
  roster: { tanks: (pd.tanks || []).length, healers: healers.length, dps: (pd.dps || []).length },
});

// ── 3. Per-fight healing tables (all fights, batched) ──
const tables = {};
for (let i = 0; i < fights.length; i += 6) {
  const batch = fights.slice(i, i + 6);
  const frags = batch.map((f) => `f${f.id}: table(fightIDs:[${f.id}], dataType: Healing)`).join('\n');
  const res = await gql(`{reportData{report(code:"${code}"){ ${frags} }}}`);
  for (const f of batch) tables[f.id] = res.reportData.report['f' + f.id];
}
save('tables.json', tables);

// ── 4. CombatantInfo for the player (from roster fight) ──
const ciRes = await gql(`{reportData{report(code:"${code}"){events(dataType: CombatantInfo, fightIDs:[${rosterFight.id}], sourceID:${player.id}){data}}}}`);
save('combatantinfo.json', ciRes.reportData.report.events.data);

// ── 5. Per-fight event pulls ──
for (const f of fights) {
  const dur = Math.round((f.endTime - f.startTime) / 1000);
  console.log(`Fight ${f.id} ${f.name} ${f.kill ? 'KILL' : 'wipe'} (${dur}s)`);

  const deaths = await events(f.id, 'dataType: Deaths');
  save(`fight${f.id}-deaths.json`, deaths);

  const casts = await events(f.id, `dataType: Casts, sourceID:${player.id}`);
  save(`fight${f.id}-casts.json`, casts);

  if (!f.kill) continue; // light pull for wipes

  save(`fight${f.id}-healing.json`, await events(f.id, `dataType: Healing, sourceID:${player.id}`));
  save(`fight${f.id}-dmgdone.json`, await events(f.id, `dataType: DamageDone, sourceID:${player.id}`));

  const enemyCasts = await events(f.id, 'dataType: Casts, hostilityType: Enemies');
  save(`fight${f.id}-enemycasts.json`, enemyCasts.filter((e) => e.type === 'cast'));

  const others = healers.filter((h) => h.id !== player.id);
  const healerCasts = {};
  for (const h of others) healerCasts[h.name] = await events(f.id, `dataType: Casts, sourceID:${h.id}`);
  save(`fight${f.id}-healercds.json`, healerCasts);

  const playerDied = deaths.some((d) => d.targetID === player.id);
  if (playerDied) {
    save(`fight${f.id}-dmgtaken.json`, await events(f.id, `dataType: DamageTaken, hostilityType: Friendlies, sourceID:${player.id}`));
  }
}
console.log('Done. Cached to', outDir);
