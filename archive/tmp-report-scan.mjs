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

const REPORT = 'x2jCDbqdvWHwKQFM';

async function main() {
  const data = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        title
        startTime
        endTime
        fights {
          id
          name
          encounterID
          difficulty
          kill
          startTime
          endTime
          friendlyPlayers
        }
      }
    }
  }`);

  const report = data.reportData.report;
  console.log('Report:', report.title);
  console.log('Date:', new Date(report.startTime).toLocaleDateString());
  console.log('');

  const fights = report.fights.filter(f => f.encounterID > 0);
  const bosses = {};
  for (const f of fights) {
    if (!bosses[f.name]) bosses[f.name] = { id: f.encounterID, difficulty: f.difficulty, fights: [], kills: 0 };
    bosses[f.name].fights.push(f.id);
    if (f.kill) bosses[f.name].kills++;
  }

  console.log('Bosses:');
  for (const [name, info] of Object.entries(bosses)) {
    const diff = info.difficulty === 5 ? 'Mythic' : info.difficulty === 4 ? 'Heroic' : 'Normal';
    console.log(`  ${name} (${diff}) — ${info.fights.length} pulls, ${info.kills} kills — fights: ${info.fights.join(',')}`);
  }

  console.log('');
  console.log('Total encounter fights:', fights.length);

  // Get player details — try multiple fights to catch everyone
  const allPlayers = { dps: new Map(), tanks: new Map(), healers: new Map() };
  const fightIds = fights.map(f => f.id);
  // Check first, middle, and last fight
  const checkFights = [fightIds[0], fightIds[Math.floor(fightIds.length/2)], fightIds[fightIds.length-1]];

  for (const fid of checkFights) {
    const pd = await gql(`{
      reportData {
        report(code: "${REPORT}") {
          playerDetails(fightIDs: [${fid}])
        }
      }
    }`);
    const details = pd.reportData.report.playerDetails?.data?.playerDetails;
    for (const role of ['dps', 'tanks', 'healers']) {
      if (details?.[role]) {
        for (const p of details[role]) {
          allPlayers[role].set(p.name, { name: p.name, spec: p.specs?.[0]?.spec || '?', type: p.type, id: p.id });
        }
      }
    }
  }

  console.log('\nPlayers:');
  console.log(`  DPS (${allPlayers.dps.size}):`);
  for (const p of allPlayers.dps.values()) console.log(`    ${p.name} — ${p.spec} ${p.type} — id:${p.id}`);
  console.log(`  Tanks (${allPlayers.tanks.size}):`);
  for (const p of allPlayers.tanks.values()) console.log(`    ${p.name} — ${p.spec} ${p.type} — id:${p.id}`);
  console.log(`  Healers (${allPlayers.healers.size}):`);
  for (const p of allPlayers.healers.values()) console.log(`    ${p.name} — ${p.spec} ${p.type} — id:${p.id}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
