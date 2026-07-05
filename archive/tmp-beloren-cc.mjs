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

const ENC_BELOREN = 3182;
const CC_ID = 443028;

function specKey(spec, type) {
  if (type === 'Paladin' && spec === 'Holy') return 'HPal';
  if (type === 'Priest' && spec === 'Holy') return 'HPriest';
  if (type === 'Shaman' && spec === 'Restoration') return 'RSham';
  if (type === 'Monk' && spec === 'Mistweaver') return 'MW';
  if (type === 'Druid' && spec === 'Restoration') return 'RDruid';
  if (type === 'Evoker' && spec === 'Preservation') return 'PEvo';
  if (type === 'Priest' && spec === 'Discipline') return 'DPriest';
  return `${spec} ${type}`;
}

async function main() {
  // Pull all MW Monk rankings
  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_BELOREN}) {
        characterRankings(difficulty: 5, className: "Monk", specName: "Mistweaver", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.characterRankings?.rankings || [];
  console.log('CELESTIAL CONDUIT TIMING — ALL MW MONKS ON MYTHIC BELO\'REN');
  console.log('='.repeat(90));

  let analyzed = 0;
  const allCCTimings = [];

  for (const r of rankings) {
    if (analyzed >= 15) break;
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
    if (!fightInfo || !details?.healers) continue;

    const fightStart = fightInfo.startTime;
    const duration = (fightInfo.endTime - fightInfo.startTime) / 1000;

    // Find MW monk
    let mwId = null;
    for (const p of details.healers) {
      if (p.name === r.name && p.type === 'Monk') {
        mwId = p.id;
        break;
      }
    }
    if (!mwId) continue;

    const healerSpecs = details.healers.map(p => specKey(p.specs?.[0]?.spec, p.type)).join('/');

    // Pull casts
    const casts = await fetchAllEvents(report, fight, mwId, 'Casts');
    const ccCasts = casts
      .filter(e => e.type === 'cast' && e.abilityGameID === CC_ID)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(e => (e.timestamp - fightStart) / 1000);

    if (ccCasts.length === 0) continue;
    analyzed++;

    const timesStr = ccCasts.map(t => fmt(t)).join(', ');
    const firstUse = ccCasts[0];
    const window = firstUse < 10 ? 'opener' : firstUse < 40 ? 'early' : firstUse < 60 ? 'VLC#2' : 'late';

    console.log(`  #${analyzed.toString().padStart(2)} ${r.name.padEnd(16)} ${fmt(duration)}  [${healerSpecs}]`);
    console.log(`      CC: ${ccCasts.length}x — ${timesStr}  (first: ${window})`);

    allCCTimings.push({ name: r.name, duration, ccCasts, healerSpecs, window });
  }

  // Summary
  console.log(`\n${'='.repeat(90)}`);
  console.log('SUMMARY');
  console.log('='.repeat(90));

  const openerCount = allCCTimings.filter(t => t.ccCasts[0] < 10).length;
  const earlyCount = allCCTimings.filter(t => t.ccCasts[0] >= 10 && t.ccCasts[0] < 40).length;
  const vlc2Count = allCCTimings.filter(t => t.ccCasts[0] >= 40 && t.ccCasts[0] < 65).length;
  const lateCount = allCCTimings.filter(t => t.ccCasts[0] >= 65).length;

  console.log(`\n  First CC use:`);
  console.log(`    Opener (0-10s):   ${openerCount}/${analyzed}`);
  console.log(`    Early (10-40s):   ${earlyCount}/${analyzed}`);
  console.log(`    VLC #2 (40-65s):  ${vlc2Count}/${analyzed}`);
  console.log(`    Late (65s+):      ${lateCount}/${analyzed}`);

  console.log(`\n  Total CC uses per fight:`);
  const useCounts = {};
  for (const t of allCCTimings) {
    useCounts[t.ccCasts.length] = (useCounts[t.ccCasts.length] || 0) + 1;
  }
  for (const [count, num] of Object.entries(useCounts).sort()) {
    console.log(`    ${count}x: ${num}/${analyzed} monks`);
  }

  // Show the exact timing chains
  console.log(`\n  CC timing chains:`);
  for (const t of allCCTimings) {
    const chain = t.ccCasts.map(c => fmt(c)).join(' → ');
    const gaps = [];
    for (let i = 1; i < t.ccCasts.length; i++) {
      gaps.push((t.ccCasts[i] - t.ccCasts[i-1]).toFixed(0) + 's');
    }
    const gapStr = gaps.length > 0 ? ` [gaps: ${gaps.join(', ')}]` : '';
    console.log(`    ${t.name.padEnd(16)} ${chain}${gapStr}`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
