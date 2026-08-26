/**
 * top-priest-refs.mjs — Find comp-matched top-ranked healers for an encounter
 * and cache the primary reference's full event data for rotation comparison.
 *
 * Pulls US+EU characterRankings (metric hps), comp-filters to reports whose
 * healer count matches ours, keeps the top 5, and fully pulls the #1:
 * casts, healing, damage done, enemy casts, CombatantInfo, fight meta.
 *
 * Usage:
 *   node scripts/top-priest-refs.mjs <encounterID> <className> <specName> [difficulty=4] [healerCount=4]
 *   e.g. node scripts/top-priest-refs.mjs 3420 Priest Holy 4 4
 *
 * Output: data/refs/<encounterID>-d<difficulty>-<class>-<spec>/
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gql, gqlPaged } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const [encArg, className, specName, diffArg, hcArg] = process.argv.slice(2);
if (!encArg || !className || !specName) {
  console.error('Usage: node scripts/top-priest-refs.mjs <encounterID> <className> <specName> [difficulty=4] [healerCount=4]');
  process.exit(1);
}
const ENC = Number(encArg);
const DIFF = Number(diffArg || 4);
const HEALER_COUNT = Number(hcArg || 4);
const outDir = join(ROOT, 'data', 'refs', `${ENC}-d${DIFF}-${className.toLowerCase()}-${specName.toLowerCase()}`);
mkdirSync(outDir, { recursive: true });

function save(name, obj) {
  writeFileSync(join(outDir, name), JSON.stringify(obj));
  console.log('  saved', name);
}

// ── 1. Rankings US + EU ──
const rank = await gql(`{worldData{encounter(id:${ENC}){
  us: characterRankings(className:"${className}", specName:"${specName}", difficulty:${DIFF}, metric: hps, serverRegion:"US", page:1)
  eu: characterRankings(className:"${className}", specName:"${specName}", difficulty:${DIFF}, metric: hps, serverRegion:"EU", page:1)
}}}`);
const merged = [
  ...(rank.worldData.encounter.us?.rankings || []),
  ...(rank.worldData.encounter.eu?.rankings || []),
]
  .filter((r) => r.report?.code)
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 12);
console.log(`Rankings: ${merged.length} candidates for enc ${ENC} d${DIFF} ${className}/${specName}`);

// ── 2. Comp check (per-candidate — a single private report must not sink the batch) ──
const candidates = [];
for (let i = 0; i < merged.length; i++) {
  const r = merged[i];
  try {
    const pdRes = await gql(`{reportData{ t: report(code:"${r.report.code}"){ playerDetails(fightIDs:[${r.report.fightID}]) } }}`);
    const pd = pdRes.reportData.t.playerDetails.data.playerDetails;
    const healerList = pd.healers || [];
    const me = healerList.find((h) => h.name === r.name);
    candidates.push({
      name: r.name, server: r.server?.name, region: r.server?.region,
      hps: Math.round(r.amount), duration: r.duration,
      reportCode: r.report.code, fightID: r.report.fightID,
      sourceID: me?.id ?? null,
      healerCount: healerList.length,
      compMatch: healerList.length === HEALER_COUNT,
      healers: healerList.map((h) => `${h.name} (${h.type}/${h.specs?.[0]?.spec})`),
    });
  } catch { /* private/broken report — skip */ }
}
const matched = candidates.filter((c) => c.compMatch && c.sourceID != null);
const top5 = (matched.length >= 3 ? matched : candidates.filter((c) => c.sourceID != null)).slice(0, 5);
save('candidates.json', { all: candidates, top5, healerCountWanted: HEALER_COUNT });
if (!top5.length) {
  console.error('No usable references found.');
  process.exit(1);
}
const primary = top5[0];
console.log('Primary reference:', primary.name, primary.server, primary.hps, 'hps —', primary.reportCode, 'fight', primary.fightID, `(${primary.healerCount} healers)`);

// ── 3. Full pull for primary ──
const rc = primary.reportCode, rf = primary.fightID, rid = primary.sourceID;
async function events(params) {
  return gqlPaged((start) => {
    const s = start ? `, startTime: ${start}` : '';
    return `{reportData{report(code:"${rc}"){events(${params}, fightIDs:[${rf}]${s}){data, nextPageTimestamp}}}}`;
  });
}
const metaRes = await gql(`{reportData{report(code:"${rc}"){
  fights(fightIDs:[${rf}]){ id name startTime endTime kill }
  masterData{ abilities{ gameID name } }
}}}`);
save('primary-meta.json', {
  ...primary,
  fight: metaRes.reportData.report.fights[0],
  abilityMap: Object.fromEntries(metaRes.reportData.report.masterData.abilities.map((a) => [a.gameID, a.name])),
});
save('primary-casts.json', await events(`dataType: Casts, sourceID:${rid}`));
save('primary-healing.json', await events(`dataType: Healing, sourceID:${rid}`));
save('primary-dmgdone.json', await events(`dataType: DamageDone, sourceID:${rid}`));
save('primary-enemycasts.json', (await events('dataType: Casts, hostilityType: Enemies')).filter((e) => e.type === 'cast'));

const ciRes = await gql(`{reportData{report(code:"${rc}"){events(dataType: CombatantInfo, fightIDs:[${rf}], sourceID:${rid}){data}}}}`);
save('primary-combatantinfo.json', ciRes.reportData.report.events.data);

// CombatantInfo for the rest of top5 (talent table)
for (let i = 1; i < top5.length; i++) {
  const c = top5[i];
  try {
    const r = await gql(`{reportData{report(code:"${c.reportCode}"){events(dataType: CombatantInfo, fightIDs:[${c.fightID}], sourceID:${c.sourceID}){data}}}}`);
    save(`ref${i}-combatantinfo.json`, r.reportData.report.events.data);
  } catch (e) { console.log('  ref' + i + ' CombatantInfo failed:', e.message.slice(0, 80)); }
}
console.log('Done. Cached to', outDir);
