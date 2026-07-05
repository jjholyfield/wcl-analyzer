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
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            sourceID: ${sourceId}
            ${timeFilter}
            limit: 10000
          ) { data nextPageTimestamp }
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
const PLAYER = 'Baodabao';
const ENC_LBV = 3180;

async function analyzePlayer(reportCode, fightId, sourceId, fightStart, duration, spellNames) {
  const casts = await fetchAllEvents(reportCode, fightId, sourceId, 'Casts');
  const castEvents = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

  // Count by spell
  const spellCounts = {};
  for (const e of castEvents) {
    const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
    if (!spellCounts[name]) spellCounts[name] = { count: 0, id: e.abilityGameID, times: [] };
    spellCounts[name].count++;
    spellCounts[name].times.push((e.timestamp - fightStart) / 1000);
  }

  // Sort by count
  const sorted = Object.entries(spellCounts)
    .sort((a, b) => b[1].count - a[1].count);

  // Total casts (exclude auto attack / melee)
  const totalCasts = castEvents.filter(e => {
    const name = spellNames[e.abilityGameID] || '';
    return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
  }).length;
  const cpm = (totalCasts / (duration / 60)).toFixed(1);

  // Dead time (gaps > 2s between non-auto casts)
  const nonAuto = castEvents.filter(e => {
    const name = spellNames[e.abilityGameID] || '';
    return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
  });
  let deadTime = 0;
  let bigGaps = [];
  for (let i = 1; i < nonAuto.length; i++) {
    const gap = (nonAuto[i].timestamp - nonAuto[i - 1].timestamp) / 1000;
    if (gap > 2.0) {
      deadTime += gap - 1.5;
      if (gap > 3.0) {
        bigGaps.push({
          time: (nonAuto[i - 1].timestamp - fightStart) / 1000,
          gap: gap,
          nextSpell: spellNames[nonAuto[i].abilityGameID] || `spell-${nonAuto[i].abilityGameID}`,
        });
      }
    }
  }

  return { spellCounts: sorted, totalCasts, cpm, deadTime, deadPct: (deadTime / duration * 100).toFixed(1), bigGaps, duration };
}

async function main() {
  // Step 1: Find Baodabao's best pull from Tuesday
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of fightData.reportData.report.masterData?.abilities || []) {
    spellNames[a.gameID] = a.name;
  }

  const fights = fightData.reportData.report.fights
    .filter(f => f.encounterID === ENC_LBV)
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));

  // Take the 3 longest pulls
  const bestPulls = fights.slice(0, 3);

  // Find Baodabao's source ID
  const detailData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${bestPulls[0].id}])
      }
    }
  }`);

  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;
  let baoId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === PLAYER) { baoId = p.id; break; }
    }
    if (baoId) break;
  }

  console.log(`Baodabao source ID: ${baoId}`);

  // Analyze Baodabao on best pull
  const bestPull = bestPulls[0];
  const duration = (bestPull.endTime - bestPull.startTime) / 1000;
  console.log(`\nBest pull: #${bestPull.id} (${fmt(duration)})`);

  // Get DPS from damage table
  const dmgTable = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        table(dataType: DamageDone, fightIDs: [${bestPull.id}])
      }
    }
  }`);
  const baoEntry = dmgTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
  const baoDPS = baoEntry ? (baoEntry.total / duration).toFixed(0) : '?';

  console.log(`\n${'='.repeat(90)}`);
  console.log(`  BAODABAO — Frost Mage — Pull #${bestPull.id} (${fmt(duration)}) — ${Number(baoDPS).toLocaleString()} DPS`);
  console.log('='.repeat(90));

  const baoResult = await analyzePlayer(REPORT, bestPull.id, baoId, bestPull.startTime, duration, spellNames);

  console.log(`  CPM: ${baoResult.cpm} (${baoResult.totalCasts} casts)`);
  console.log(`  Dead Time: ${baoResult.deadTime.toFixed(1)}s (${baoResult.deadPct}%)`);
  console.log(`\n  Top spells:`);
  for (const [name, info] of baoResult.spellCounts.slice(0, 20)) {
    const cpm = (info.count / (duration / 60)).toFixed(1);
    console.log(`    ${name.padEnd(30)} ${info.count.toString().padStart(3)}x  (${cpm}/min)`);
  }

  if (baoResult.bigGaps.length > 0) {
    console.log(`\n  Big gaps (>3s) — ${baoResult.bigGaps.length} total:`);
    for (const g of baoResult.bigGaps.slice(0, 10)) {
      console.log(`    ${fmt(g.time)} — ${g.gap.toFixed(1)}s gap → ${g.nextSpell}`);
    }
  }

  // Step 2: Find #1 Frost Mage on Mythic LBV
  console.log(`\n${'='.repeat(90)}`);
  console.log('  TOP FROST MAGE ON MYTHIC LBV');
  console.log('='.repeat(90));

  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "Mage", specName: "Frost", metric: dps, page: 1)
      }
    }
  }`);

  const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];
  console.log(`  Found ${rankings.length} ranked Frost Mages\n`);

  // Analyze top 3
  for (let i = 0; i < Math.min(3, rankings.length); i++) {
    const r = rankings[i];
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    const meta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
          masterData { abilities { gameID name } }
        }
      }
    }`);

    const topSpellNames = {};
    for (const a of meta.reportData.report.masterData?.abilities || []) {
      topSpellNames[a.gameID] = a.name;
    }

    const fightInfo = meta.reportData.report.fights[0];
    if (!fightInfo) continue;
    const topDur = (fightInfo.endTime - fightInfo.startTime) / 1000;

    // Find source ID
    const topDetails = meta.reportData.report.playerDetails?.data?.playerDetails;
    let topId = null;
    for (const role of Object.values(topDetails || {})) {
      if (!Array.isArray(role)) continue;
      for (const p of role) {
        if (p.name === r.name) { topId = p.id; break; }
      }
      if (topId) break;
    }
    if (!topId) continue;

    // Get DPS
    const topDmgTable = await gql(`{
      reportData {
        report(code: "${report}") {
          table(dataType: DamageDone, fightIDs: [${fight}])
        }
      }
    }`);
    const topEntry = topDmgTable.reportData.report.table?.data?.entries?.find(e => e.name === r.name);
    const topDPS = topEntry ? (topEntry.total / topDur).toFixed(0) : '?';

    console.log(`  #${i + 1} ${r.name} — ${fmt(topDur)} — ${Number(topDPS).toLocaleString()} DPS`);

    const topResult = await analyzePlayer(report, fight, topId, fightInfo.startTime, topDur, topSpellNames);

    console.log(`  CPM: ${topResult.cpm} (${topResult.totalCasts} casts)`);
    console.log(`  Dead Time: ${topResult.deadTime.toFixed(1)}s (${topResult.deadPct}%)`);
    console.log(`\n  Top spells:`);
    for (const [name, info] of topResult.spellCounts.slice(0, 15)) {
      const cpm = (info.count / (topDur / 60)).toFixed(1);
      console.log(`    ${name.padEnd(30)} ${info.count.toString().padStart(3)}x  (${cpm}/min)`);
    }
    console.log();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
