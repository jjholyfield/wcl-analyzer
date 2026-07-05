import { readFileSync } from 'fs';
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

let cachedToken = null;
let tokenExpiry = 0;
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gql(query) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchAllEvents(reportCode, fightId, sourceId, dataType) {
  let all = [];
  let nextPage = null;
  while (true) {
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const srcFilter = sourceId ? `sourceID: ${sourceId},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(fightIDs: [${fightId}], dataType: ${dataType}, ${srcFilter} ${timeFilter} limit: 10000) { data nextPageTimestamp }
        }
      }
    }`);
    const result = data.reportData.report.events;
    if (result.data?.length > 0) all = all.concat(result.data);
    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }
  return all;
}

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const REPORT = 'by6mKkdwXGcqQtRW';
const ENC_LBV = 3180;
const PLAYER = process.argv[2];
const CLASS = process.argv[3];
const SPEC = process.argv[4];
const DPS_POT_KEYWORDS = ['recklessness', "light's potential", 'zealotry', 'rampant abandon'];

if (!PLAYER || !CLASS || !SPEC) {
  console.log('Usage: node tmp-healer-audit.mjs <name> <class> <spec>');
  process.exit(1);
}

async function main() {
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id encounterID startTime endTime }
        masterData { abilities { gameID name } actors { id name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) spellNames[a.gameID] = a.name;

  const fights = meta.reportData.report.fights.filter(f => f.encounterID === ENC_LBV).sort((a, b) => a.id - b.id);

  const detailData = await gql(`{
    reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [${fights[Math.min(4, fights.length-1)].id}]) } }
  }`);
  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;
  let playerId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) { if (p.name === PLAYER) { playerId = p.id; break; } }
    if (playerId) break;
  }

  console.log(`${PLAYER} (${SPEC} ${CLASS}) â€” sourceID: ${playerId} â€” ${fights.length} pulls`);
  console.log('='.repeat(100));

  // First get all spells from longest pull
  const bestFights = [...fights].sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime)).slice(0, 5);
  console.log('\nAll spells from best pull:');
  const bestCasts = await fetchAllEvents(REPORT, bestFights[0].id, playerId, 'Casts');
  const bestCastOnly = bestCasts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);
  const spellCountsBest = {};
  for (const e of bestCastOnly) {
    const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
    spellCountsBest[name] = (spellCountsBest[name] || 0) + 1;
  }
  for (const [name, count] of Object.entries(spellCountsBest).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(30)} ${count}x`);
  }

  // Process all pulls
  console.log('\n' + '='.repeat(100));
  const pullData = [];

  for (const fight of fights) {
    const duration = (fight.endTime - fight.startTime) / 1000;
    const fightStart = fight.startTime;

    // HPS
    const healTable = await gql(`{
      reportData { report(code: "${REPORT}") { table(dataType: Healing, fightIDs: [${fight.id}]) } }
    }`);
    const healEntry = healTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
    const hps = healEntry ? Math.round(healEntry.total / duration) : 0;
    const overhealPct = healEntry && healEntry.total > 0
      ? ((healEntry.overhealingAbsorbed || 0) / ((healEntry.total || 0) + (healEntry.overhealingAbsorbed || 0)) * 100).toFixed(1)
      : '0';

    // DPS
    const dmgTable = await gql(`{
      reportData { report(code: "${REPORT}") { table(dataType: DamageDone, fightIDs: [${fight.id}]) } }
    }`);
    const dmgEntry = dmgTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
    const dps = dmgEntry ? Math.round(dmgEntry.total / duration) : 0;

    // Casts
    const casts = await fetchAllEvents(REPORT, fight.id, playerId, 'Casts');
    const castOnly = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);
    const nonAuto = castOnly.filter(e => {
      const name = spellNames[e.abilityGameID] || '';
      return !name.match(/^(Melee|Auto Shot|Auto Attack)$/i) && e.abilityGameID !== 1;
    });
    const cpm = nonAuto.length > 0 ? (nonAuto.length / (duration / 60)).toFixed(1) : '0';

    let deadTime = 0;
    for (let i = 1; i < nonAuto.length; i++) {
      const gap = (nonAuto[i].timestamp - nonAuto[i-1].timestamp) / 1000;
      if (gap > 2.0) deadTime += gap - 1.5;
    }

    // All spell counts
    const spellCounts = {};
    for (const e of castOnly) {
      const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
      spellCounts[name] = (spellCounts[name] || 0) + 1;
    }

    // Consumables
    const dpsPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return DPS_POT_KEYWORDS.some(k => n.includes(k));
    }).length;
    const healthstone = castOnly.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('healthstone')).length;
    const healthPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return n.includes('silvermoon') || (n.includes('potion') && n.includes('health'));
    }).length;
    const manaPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return n.includes('mana');
    }).length;

    // Deaths
    const deaths = await fetchAllEvents(REPORT, fight.id, null, 'Deaths');
    const myDeaths = deaths.filter(e => e.type === 'death' && e.targetID === playerId);
    let earlyDeath = null;
    for (const d of myDeaths) {
      const deathTime = (d.timestamp - fightStart) / 1000;
      if (duration - deathTime > 30) {
        earlyDeath = { time: deathTime, ability: spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}` };
        break;
      }
    }

    pullData.push({
      id: fight.id, duration, hps, dps, overhealPct: parseFloat(overhealPct),
      cpm: parseFloat(cpm), deadPct: parseFloat(((deadTime / duration) * 100).toFixed(1)),
      spellCounts, dpsPot, healthstone, healthPot, manaPot, earlyDeath,
    });

    const deathStr = earlyDeath ? `DIED ${fmt(earlyDeath.time)} (${earlyDeath.ability})` : '';
    const consStr = [dpsPot > 0 ? 'POT' : '', healthstone > 0 ? 'HS' : '', healthPot > 0 ? 'HP' : '', manaPot > 0 ? 'MP' : ''].filter(Boolean).join(' ') || 'no cons';
    console.log(`  #${fight.id.toString().padStart(2)} ${fmt(duration)} | ${hps.toLocaleString().padStart(7)} HPS ${dps.toLocaleString().padStart(6)} DPS | ${cpm.toString().padStart(4)} CPM | ${overhealPct.toString().padStart(4)}% OH | ${((deadTime/duration)*100).toFixed(1).padStart(4)}% dead | ${consStr} | ${deathStr}`);
  }

  // Summary
  const avg = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  console.log(`\nNIGHT SUMMARY:`);
  console.log(`  Avg HPS:        ${Math.round(avg(pullData.map(p => p.hps))).toLocaleString()}`);
  console.log(`  Avg DPS:        ${Math.round(avg(pullData.map(p => p.dps))).toLocaleString()}`);
  console.log(`  Avg CPM:        ${avg(pullData.map(p => p.cpm)).toFixed(1)}`);
  console.log(`  Avg Overheal:   ${avg(pullData.map(p => p.overhealPct)).toFixed(1)}%`);
  console.log(`  Avg Dead Time:  ${avg(pullData.map(p => p.deadPct)).toFixed(1)}%`);
  console.log(`  Early Deaths:   ${pullData.filter(p => p.earlyDeath).length}/${pullData.length}`);
  console.log(`  DPS Pot:        ${pullData.filter(p => p.dpsPot > 0).length}/${pullData.length}`);
  console.log(`  Healthstone:    ${pullData.filter(p => p.healthstone > 0).length}/${pullData.length}`);
  console.log(`  Health Pot:     ${pullData.filter(p => p.healthPot > 0).length}/${pullData.length}`);
  console.log(`  Mana Pot:       ${pullData.filter(p => p.manaPot > 0).length}/${pullData.length}`);

  const earlyDeaths = pullData.filter(p => p.earlyDeath);
  if (earlyDeaths.length > 0) {
    console.log('\n  Deaths:');
    for (const p of earlyDeaths) console.log(`    #${p.id} at ${fmt(p.earlyDeath.time)} â€” ${p.earlyDeath.ability}`);
  }

  // Top spells
  const allSpellCounts = {};
  const totalDuration = pullData.reduce((s, p) => s + p.duration, 0);
  for (const p of pullData) {
    for (const [name, count] of Object.entries(p.spellCounts)) {
      allSpellCounts[name] = (allSpellCounts[name] || 0) + count;
    }
  }
  const topSpells = Object.entries(allSpellCounts)
    .filter(([name]) => !name.match(/^(Melee|Auto Shot|Auto Attack)$/i))
    .sort((a, b) => b[1] - a[1]).slice(0, 20);

  console.log('\n  Top spells (all pulls):');
  for (const [name, count] of topSpells) {
    console.log(`    ${name.padEnd(30)} ${count.toString().padStart(5)}x  (${(count / (totalDuration / 60)).toFixed(1)}/min)`);
  }

  // Top ranked healers
  console.log(`\nTOP 3 ${SPEC.toUpperCase()} ${CLASS.toUpperCase()}S ON MYTHIC LBV:`);
  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "${CLASS}", specName: "${SPEC}", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];
  console.log(`  Found ${rankings.length} ranked\n`);

  for (let i = 0; i < Math.min(3, rankings.length); i++) {
    const r = rankings[i];
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    const topMeta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
          masterData { abilities { gameID name } }
          table(dataType: Healing, fightIDs: [${fight}])
        }
      }
    }`);

    const topSpellNames = {};
    for (const a of topMeta.reportData.report.masterData?.abilities || []) topSpellNames[a.gameID] = a.name;
    const topFight = topMeta.reportData.report.fights[0];
    if (!topFight) continue;
    const topDur = (topFight.endTime - topFight.startTime) / 1000;

    const topHealEntry = topMeta.reportData.report.table?.data?.entries?.find(e => e.name === r.name);
    const topHPS = topHealEntry ? Math.round(topHealEntry.total / topDur) : 0;
    const topOH = topHealEntry && topHealEntry.total > 0
      ? ((topHealEntry.overhealingAbsorbed || 0) / ((topHealEntry.total || 0) + (topHealEntry.overhealingAbsorbed || 0)) * 100).toFixed(1)
      : '0';

    const topDetails = topMeta.reportData.report.playerDetails?.data?.playerDetails;
    let topId = null;
    for (const role of Object.values(topDetails || {})) {
      if (!Array.isArray(role)) continue;
      for (const p of role) { if (p.name === r.name) { topId = p.id; break; } }
      if (topId) break;
    }
    if (!topId) continue;

    const topCasts = await fetchAllEvents(report, fight, topId, 'Casts');
    const topCastOnly = topCasts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);
    const topNonAuto = topCastOnly.filter(e => {
      const name = topSpellNames[e.abilityGameID] || '';
      return !name.match(/^(Melee|Auto Shot|Auto Attack)$/i) && e.abilityGameID !== 1;
    });
    const topCPM = (topNonAuto.length / (topDur / 60)).toFixed(1);

    console.log(`  #${i+1} ${r.name} â€” ${topHPS.toLocaleString()} HPS, ${topCPM} CPM, ${topOH}% OH (${fmt(topDur)})`);

    const topSpellCounts = {};
    for (const e of topCastOnly) {
      const name = topSpellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
      topSpellCounts[name] = (topSpellCounts[name] || 0) + 1;
    }
    const topSorted = Object.entries(topSpellCounts)
      .filter(([name]) => !name.match(/^(Melee|Auto Shot|Auto Attack)$/i))
      .sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [name, count] of topSorted) {
      console.log(`    ${name.padEnd(30)} ${count.toString().padStart(4)}x  (${(count/(topDur/60)).toFixed(1)}/m)`);
    }
    console.log();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

