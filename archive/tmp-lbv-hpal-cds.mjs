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

const ENC_LBV = 3180;

const HPAL_CDS = {
  31884: 'Avenging Wrath',
  216331: 'Avenging Crusader',
  31821: 'Aura Mastery',
  6940: 'Blessing of Sacrifice',
  633: 'Lay on Hands',
};
const hpalCdIds = Object.keys(HPAL_CDS).map(Number);

async function main() {
  // Search HPal rankings on mythic LBV
  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "Paladin", specName: "Holy", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.characterRankings?.rankings || [];
  console.log(`MYTHIC LBV — HOLY PALADIN CD USAGE FROM TOP RANKED KILLS`);
  console.log(`Found ${rankings.length} HPal rankings\n`);

  let analyzed = 0;
  const awGaps = [];
  const amGaps = [];

  for (const r of rankings) {
    if (analyzed >= 8) break;
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    // Get fight info + player details
    const meta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
        }
      }
    }`);

    const details = meta.reportData.report.playerDetails?.data?.playerDetails;
    const fightInfo = meta.reportData.report.fights[0];
    if (!fightInfo) continue;
    const fightStart = fightInfo.startTime;
    const duration = (fightInfo.endTime - fightInfo.startTime) / 1000;

    // Find this HPal's sourceID
    let hpalId = null;
    if (details?.healers) {
      for (const p of details.healers) {
        if (p.name === r.name && p.type === 'Paladin') {
          hpalId = p.id;
          break;
        }
      }
    }
    if (!hpalId) continue;

    // Pull their casts
    const casts = await fetchAllEvents(report, fight, hpalId, 'Casts');
    const cdCasts = casts
      .filter(e => e.type === 'cast' && hpalCdIds.includes(e.abilityGameID))
      .sort((a, b) => a.timestamp - b.timestamp);

    analyzed++;

    // Group by spell
    const bySpell = {};
    for (const e of cdCasts) {
      const name = HPAL_CDS[e.abilityGameID];
      if (!bySpell[name]) bySpell[name] = [];
      bySpell[name].push((e.timestamp - fightStart) / 1000);
    }

    console.log(`  #${analyzed} ${r.name} — ${report} fight ${fight} (${fmt(duration)})`);

    for (const [name, times] of Object.entries(bySpell)) {
      const timesStr = times.map(t => fmt(t)).join(', ');
      console.log(`    ${name.padEnd(22)} ${times.length}x — ${timesStr}`);

      // Track gaps
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (name === 'Avenging Wrath' || name === 'Avenging Crusader') awGaps.push(gap);
        if (name === 'Aura Mastery') amGaps.push(gap);
      }
    }
    console.log();
  }

  // Summary
  console.log('='.repeat(80));
  console.log('ACTUAL CD GAPS FROM DATA');
  console.log('='.repeat(80));

  if (awGaps.length > 0) {
    awGaps.sort((a, b) => a - b);
    console.log(`\n  Avenging Wrath / Avenging Crusader — ${awGaps.length} gaps observed:`);
    for (const g of awGaps) console.log(`    ${g.toFixed(0)}s (${fmt(g)})`);
    console.log(`    MIN: ${awGaps[0].toFixed(0)}s | MAX: ${awGaps[awGaps.length-1].toFixed(0)}s | AVG: ${(awGaps.reduce((a,b)=>a+b,0)/awGaps.length).toFixed(0)}s`);
  }

  if (amGaps.length > 0) {
    amGaps.sort((a, b) => a - b);
    console.log(`\n  Aura Mastery — ${amGaps.length} gaps observed:`);
    for (const g of amGaps) console.log(`    ${g.toFixed(0)}s (${fmt(g)})`);
    console.log(`    MIN: ${amGaps[0].toFixed(0)}s | MAX: ${amGaps[amGaps.length-1].toFixed(0)}s | AVG: ${(amGaps.reduce((a,b)=>a+b,0)/amGaps.length).toFixed(0)}s`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
