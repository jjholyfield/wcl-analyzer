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

const DISC_CDS = {
  62618: 'Power Word: Barrier',
  271466: 'Luminous Barrier',
  246287: 'Evangelism',
  47536: 'Rapture',
  33206: 'Pain Suppression',
  109964: 'Spirit Shell',
  194509: 'Power Word: Radiance',
  421453: 'Ultimate Penitence',
  373178: 'Light\'s Wrath',
  314867: 'Shadow Covenant',
  120517: 'Halo',
  110744: 'Divine Star',
  34861: 'Holy Nova',
  204883: 'Circle of Healing',
  200174: 'Mindbender',
  123040: 'Mindbender',
  34433: 'Shadowfiend',
};
const discCdIds = Object.keys(DISC_CDS).map(Number);

async function main() {
  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "Priest", specName: "Discipline", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.characterRankings?.rankings || [];
  console.log(`MYTHIC LBV — DISC PRIEST CD USAGE FROM TOP RANKED KILLS`);
  console.log(`Found ${rankings.length} Disc Priest rankings\n`);

  const cdGaps = {};
  let analyzed = 0;

  for (const r of rankings) {
    if (analyzed >= 8) break;
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

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

    let discId = null;
    if (details?.healers) {
      for (const p of details.healers) {
        if (p.name === r.name && p.type === 'Priest') {
          discId = p.id;
          break;
        }
      }
    }
    if (!discId) continue;

    const casts = await fetchAllEvents(report, fight, discId, 'Casts');
    const cdCasts = casts
      .filter(e => e.type === 'cast' && discCdIds.includes(e.abilityGameID))
      .sort((a, b) => a.timestamp - b.timestamp);

    analyzed++;

    const bySpell = {};
    for (const e of cdCasts) {
      const name = DISC_CDS[e.abilityGameID];
      if (!bySpell[name]) bySpell[name] = [];
      bySpell[name].push((e.timestamp - fightStart) / 1000);
    }

    // Get healer comp
    const healerSpecs = [];
    if (details?.healers) {
      for (const p of details.healers) {
        healerSpecs.push(`${p.specs?.[0]?.spec} ${p.type}`);
      }
    }

    console.log(`  #${analyzed} ${r.name} — ${report} fight ${fight} (${fmt(duration)}) — ${healerSpecs.join(', ')}`);

    for (const [name, times] of Object.entries(bySpell)) {
      const timesStr = times.map(t => fmt(t)).join(', ');
      console.log(`    ${name.padEnd(24)} ${times.length}x — ${timesStr}`);

      if (!cdGaps[name]) cdGaps[name] = [];
      for (let i = 1; i < times.length; i++) {
        cdGaps[name].push(times[i] - times[i - 1]);
      }
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log('CD GAP SUMMARY');
  console.log('='.repeat(80));

  for (const [name, gaps] of Object.entries(cdGaps)) {
    if (gaps.length === 0) continue;
    gaps.sort((a, b) => a - b);
    console.log(`\n  ${name} — ${gaps.length} gaps:`);
    for (const g of gaps) console.log(`    ${g.toFixed(0)}s (${fmt(g)})`);
    console.log(`    MIN: ${gaps[0].toFixed(0)}s | AVG: ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(0)}s`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
