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
          events(fightIDs: [${fightId}], dataType: ${dataType}, sourceID: ${sourceId}, ${timeFilter} limit: 10000) { data nextPageTimestamp }
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

const REPORT = 'by6mKkdwXGcqQtRW';
const ENC_LBV = 3180;

const DPS_POT_KEYWORDS = ['recklessness', "light's potential", 'zealotry', 'rampant abandon'];

const PLAYERS = [
  'Balecoda', 'Youngn', 'Orichamaru', 'Starfighter', 'Baodabao',
  'Zinnks', 'Mßaku', 'Snackznchill', 'Smokinthisza', 'Sonìc',
  'Kishnna', 'Alitheria', 'Moistbear'
];

async function main() {
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id encounterID startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) spellNames[a.gameID] = a.name;

  const fights = meta.reportData.report.fights.filter(f => f.encounterID === ENC_LBV).sort((a, b) => a.id - b.id);

  // Get all player IDs
  const detailData = await gql(`{
    reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [${fights[0].id}]) } }
  }`);
  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;
  const playerIds = {};
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (PLAYERS.includes(p.name)) playerIds[p.name] = p.id;
    }
  }

  console.log('DPS POTION RE-CHECK — ALL POTION TYPES');
  console.log(`Searching for: ${DPS_POT_KEYWORDS.join(', ')}`);
  console.log('='.repeat(90));

  for (const playerName of PLAYERS) {
    const playerId = playerIds[playerName];
    if (!playerId) { console.log(`  ${playerName}: NOT FOUND`); continue; }

    let potPulls = 0;
    let potTypes = {};
    let totalPots = 0;

    for (const fight of fights) {
      const casts = await fetchAllEvents(REPORT, fight.id, playerId, 'Casts');
      const castOnly = casts.filter(e => e.type === 'cast');

      let foundPot = false;
      for (const e of castOnly) {
        const name = (spellNames[e.abilityGameID] || '').toLowerCase();
        for (const keyword of DPS_POT_KEYWORDS) {
          if (name.includes(keyword)) {
            const fullName = spellNames[e.abilityGameID];
            potTypes[fullName] = (potTypes[fullName] || 0) + 1;
            totalPots++;
            foundPot = true;
          }
        }
      }
      if (foundPot) potPulls++;
    }

    const potStr = Object.entries(potTypes).map(([name, count]) => `${name}: ${count}x`).join(', ') || 'NONE';
    const verdict = potPulls >= 20 ? 'OK' : potPulls >= 10 ? 'WARN' : potPulls === 0 ? 'BAD' : 'WARN';
    console.log(`  ${playerName.padEnd(16)} ${potPulls}/${fights.length} pulls potted (${totalPots} total) [${verdict}]`);
    console.log(`    Types: ${potStr}`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
