/**
 * Top Windwalker Mythic+ reference finder (and puller).
 * Lists the top-ranked Windwalker Monk runs of a dungeon from WCL rankings and,
 * with --pull, pulls each one through ww-conduit-pull.mjs so ww-conduit-audit.mjs
 * can grade the reference rotation with the same ruler as ours.
 *
 * Usage:
 *   node scripts/ww-top-refs.mjs <encounterID> [--bracket <keyLevel>] [--top <n>] [--pull] [--any-name]
 *
 * encounterID is the M+ dungeon encounter id as it appears on report.fights (e.g. 12825 Den of
 * Nalorakk, 61877 Temple of Sethraliss, 12923 Voidscar Arena, Midnight Season 2). --bracket pins
 * the key level (rankings without it are the overall top). Names outside the Latin alphabet are
 * skipped unless --any-name (they do not survive the Windows command line into the pull script).
 * Output: console list, data/refs/ww-<encounterID>[-b<bracket>].json, and with --pull the usual
 * data/<report>/ww/<player>/ folders.
 */
import { gql } from './wcl-lib.mjs';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const encounterID = Number(argv.find(a => /^\d+$/.test(a)));
const bracket = opt('--bracket', null);
const top = Number(opt('--top', 3));
const doPull = argv.includes('--pull');
const anyName = argv.includes('--any-name');
if (!encounterID) {
  console.error('Usage: node scripts/ww-top-refs.mjs <encounterID> [--bracket <keyLevel>] [--top <n>] [--pull] [--any-name]');
  process.exit(1);
}

const args = `className: "Monk", specName: "Windwalker", metric: dps, difficulty: 10${bracket ? ', bracket: ' + Number(bracket) : ''}`;
const r = await gql(`{ worldData { encounter(id: ${encounterID}) { name characterRankings(${args}) } } }`);
const enc = r.worldData.encounter;
const all = (enc.characterRankings?.rankings || []);
const latin = (s) => /^[\x20-\x7EÀ-ɏḀ-ỿ]+$/.test(s);
const picked = all.filter(x => x.report?.code && (anyName || latin(x.name))).slice(0, top);

console.log(`${enc.name} (${encounterID})${bracket ? ' +' + bracket : ' overall'}: ${all.length} ranked Windwalkers, showing ${picked.length}`);
for (const [i, x] of picked.entries()) {
  console.log(`  #${i + 1} ${x.name}-${x.server?.name} +${x.bracketData} ${Math.round(x.amount).toLocaleString()} dps ${(x.duration / 60000).toFixed(1)}min report ${x.report.code} fight ${x.report.fightID}`);
}
mkdirSync(join(__dirname, '..', 'data', 'refs'), { recursive: true });
writeFileSync(join(__dirname, '..', 'data', 'refs', `ww-${encounterID}${bracket ? '-b' + bracket : ''}.json`), JSON.stringify({ encounter: enc.name, encounterID, bracket, pulledAt: new Date().toISOString(), rankings: all.slice(0, 50) }, null, 1));

if (doPull) {
  for (const x of picked) {
    console.log(`\nPulling ${x.name} from ${x.report.code} fight ${x.report.fightID} ...`);
    const res = spawnSync(process.execPath, [join(__dirname, 'ww-conduit-pull.mjs'), x.report.code, x.name, '--fight', String(x.report.fightID)], { stdio: 'inherit' });
    if (res.status !== 0) console.log(`  pull failed for ${x.name} (${x.report.code})`);
  }
}
