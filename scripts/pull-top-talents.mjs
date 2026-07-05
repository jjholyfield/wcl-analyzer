/**
 * Pull exact talent builds from top-ranked kills, optionally diffed against our roster.
 *
 * Usage:
 *   node scripts/pull-top-talents.mjs <encounterID> [ourReportCode] [ourFightID] [topN]
 *   node scripts/pull-top-talents.mjs 3181 qDfTzvAyV3pRb6rG 25
 *
 * Output: console summary + data/boss-prep/talents-<encounterID>.json
 *
 * Key API facts (verified 2026-07-04):
 * - fights(fightIDs).talentImportCode(actorID) returns the literal Blizzard import string.
 * - events(dataType: CombatantInfo) gives one event per player: specID + talentTree [{id, rank, nodeID}].
 * - Same-spec import strings share a common prefix — diff the talentTree node maps, present the string.
 */
import { gql } from './wcl-lib.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// talentTree "id" is a TRAIT ENTRY id, NOT a spell id — resolving names via spell-names.json
// produces plausible-but-WRONG labels (verified: a Druid spell name appeared in a Paladin diff).
// Until a proper trait-node DB is added, label diffs by nodeID (look up via Wowhead talent calc).
const talentLabel = n => 'node:' + (n.nodeID ?? n.id);

const [encounterIdArg, ourReport, ourFightArg, topNArg] = process.argv.slice(2);
if (!encounterIdArg) {
  console.error('Usage: node scripts/pull-top-talents.mjs <encounterID> [ourReportCode] [ourFightID] [topN]');
  process.exit(1);
}
const ENCOUNTER_ID = Number(encounterIdArg);
const TOP_N = Number(topNArg) || 5;

const SPEC_NAMES = {
  62: 'Arcane Mage', 63: 'Fire Mage', 64: 'Frost Mage',
  65: 'Holy Paladin', 66: 'Prot Paladin', 70: 'Ret Paladin',
  71: 'Arms Warrior', 72: 'Fury Warrior', 73: 'Prot Warrior',
  102: 'Balance Druid', 103: 'Feral Druid', 104: 'Guardian Druid', 105: 'Resto Druid',
  250: 'Blood DK', 251: 'Frost DK', 252: 'Unholy DK',
  253: 'BM Hunter', 254: 'MM Hunter', 255: 'Survival Hunter',
  256: 'Disc Priest', 257: 'Holy Priest', 258: 'Shadow Priest',
  259: 'Assassination Rogue', 260: 'Outlaw Rogue', 261: 'Sub Rogue',
  262: 'Ele Shaman', 263: 'Enh Shaman', 264: 'Resto Shaman',
  265: 'Affliction Lock', 266: 'Demo Lock', 267: 'Destro Lock',
  268: 'Brewmaster Monk', 269: 'WW Monk', 270: 'MW Monk',
  577: 'Havoc DH', 581: 'Vengeance DH',
  1467: 'Devastation Evoker', 1468: 'Preservation Evoker', 1473: 'Augmentation Evoker',
};

async function pullFightTalents(code, fightID) {
  const r = await gql(
    '{ reportData { report(code: "' + code + '") { ' +
    'masterData { actors(type: "Player") { id name } } ' +
    'events(fightIDs: [' + fightID + '], dataType: CombatantInfo, limit: 10000) { data } ' +
    '} } }'
  );
  const actors = {};
  r.reportData.report.masterData.actors.forEach(a => { actors[a.id] = a.name; });
  const infos = r.reportData.report.events.data.filter(e => e.talentTree && e.talentTree.length);

  // Batch all import codes for this fight in one aliased request
  const aliases = infos.map(e => 'a' + e.sourceID + ': talentImportCode(actorID: ' + e.sourceID + ')').join(' ');
  const codes = await gql('{ reportData { report(code: "' + code + '") { fights(fightIDs: [' + fightID + ']) { id ' + aliases + ' } } } }');
  const fightNode = codes.reportData.report.fights[0];

  return infos.map(e => ({
    player: actors[e.sourceID] || 'Unknown',
    specID: e.specID,
    spec: SPEC_NAMES[e.specID] || 'spec:' + e.specID,
    importCode: fightNode['a' + e.sourceID] || null,
    nodes: new Map(e.talentTree.map(n => [n.nodeID, { id: n.id, rank: n.rank }])),
  }));
}

function diffNodes(ours, theirs) {
  const theyOnly = [], weOnly = [], rankDiff = [];
  for (const [nodeID, t] of theirs) {
    const o = ours.get(nodeID);
    if (!o) theyOnly.push(talentLabel({ id: t.id, nodeID }));
    else if (o.id !== t.id) rankDiff.push(talentLabel({ id: o.id, nodeID }) + ' → ' + talentLabel({ id: t.id, nodeID }));
    else if (o.rank !== t.rank) rankDiff.push(talentLabel({ id: t.id, nodeID }) + ' r' + o.rank + '→r' + t.rank);
  }
  for (const [nodeID, o] of ours) if (!theirs.has(nodeID)) weOnly.push(talentLabel({ id: o.id, nodeID }));
  return { theyOnly, weOnly, rankDiff, total: theyOnly.length + weOnly.length + rankDiff.length };
}

async function main() {
  const rd = await gql('{ worldData { encounter(id: ' + ENCOUNTER_ID + ') { name fightRankings(difficulty: 5, metric: speed, page: 1) } } }');
  const enc = rd.worldData.encounter;
  const rankings = (enc.fightRankings.rankings || []).slice(0, TOP_N);
  console.log(enc.name + ' — top ' + rankings.length + ' mythic kills (speed):');
  rankings.forEach((k, i) => console.log('  ' + (i + 1) + '. ' + (k.guild?.name || '?') + ' — ' + k.report.code + ' fight ' + k.report.fightID));

  const topPlayers = [];
  for (const [i, k] of rankings.entries()) {
    const players = await pullFightTalents(k.report.code, k.report.fightID);
    players.forEach(p => topPlayers.push({ ...p, rank: i + 1, guild: k.guild?.name || '?', report: k.report.code }));
  }

  // Group by spec, best-ranked first
  const bySpec = {};
  for (const p of topPlayers) (bySpec[p.specID] ||= []).push(p);

  console.log('\n════════ TOP BUILDS BY SPEC ════════');
  for (const [specID, players] of Object.entries(bySpec).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const distinct = new Set(players.map(p => p.importCode)).size;
    const best = players[0];
    console.log('\n' + best.spec + ' — ' + players.length + ' top players, ' + distinct + ' distinct build(s)');
    console.log('  Reference (rank ' + best.rank + ', ' + best.guild + '): ' + best.player);
    console.log('  Import: ' + best.importCode);
  }

  const out = { encounterID: ENCOUNTER_ID, encounter: enc.name, pulledAt: new Date().toISOString(), topKills: rankings.map(k => ({ code: k.report.code, fightID: k.report.fightID, guild: k.guild?.name })), specs: {} };
  for (const [specID, players] of Object.entries(bySpec)) {
    out.specs[specID] = players.map(p => ({ player: p.player, guild: p.guild, rank: p.rank, spec: p.spec, importCode: p.importCode }));
  }

  // Diff our roster against the top builds
  if (ourReport && ourFightArg) {
    const ours = await pullFightTalents(ourReport, Number(ourFightArg));
    console.log('\n════════ OUR ROSTER vs TOP BUILDS ════════');
    out.ourRoster = [];
    for (const us of ours.sort((a, b) => a.spec.localeCompare(b.spec))) {
      const refs = bySpec[us.specID];
      if (!refs || !refs.length) {
        console.log('\n' + us.player + ' (' + us.spec + '): no top-kill player of this spec in sampled kills');
        out.ourRoster.push({ player: us.player, spec: us.spec, reference: null });
        continue;
      }
      const ref = refs[0];
      const d = diffNodes(us.nodes, ref.nodes);
      const verdict = d.total === 0 ? 'MATCHES top build' : d.total + ' node diffs (' + d.theyOnly.length + ' they-have, ' + d.weOnly.length + ' we-have, ' + d.rankDiff.length + ' rank/choice)';
      console.log('\n' + us.player + ' (' + us.spec + ') vs ' + ref.player + ' [' + ref.guild + ']: ' + verdict);
      if (d.theyOnly.length) console.log('  They take, we skip: ' + d.theyOnly.slice(0, 12).join(', ') + (d.theyOnly.length > 12 ? ' …' : ''));
      if (d.weOnly.length) console.log('  We take, they skip: ' + d.weOnly.slice(0, 12).join(', ') + (d.weOnly.length > 12 ? ' …' : ''));
      if (d.rankDiff.length) console.log('  Choice/rank diffs:  ' + d.rankDiff.slice(0, 8).join(', ') + (d.rankDiff.length > 8 ? ' …' : ''));
      if (d.total > 0) console.log('  Reference build import: ' + ref.importCode);
      out.ourRoster.push({ player: us.player, spec: us.spec, ourImportCode: us.importCode, reference: { player: ref.player, guild: ref.guild, importCode: ref.importCode }, diffs: d });
    }
  }

  const outDir = join(__dirname, '..', 'data', 'boss-prep');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'talents-' + ENCOUNTER_ID + '.json');
  writeFileSync(outFile, JSON.stringify(out, (k, v) => v instanceof Map ? undefined : v, 2));
  console.log('\nSaved: ' + outFile);
}

main().catch(e => { console.error(e); process.exit(1); });
