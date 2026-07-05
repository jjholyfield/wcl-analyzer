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

const REPORT = 'by6mKkdwXGcqQtRW';

async function main() {
  // Check multiple fights for Iconserve
  const fights = [1, 3, 5, 8, 12, 19, 24, 30];
  for (const fightId of fights) {
    const data = await gql(`{
      reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [${fightId}]) } }
    }`);
    const details = data.reportData.report.playerDetails?.data?.playerDetails;
    if (details?.healers) {
      for (const p of details.healers) {
        if (p.name === 'Iconserve' || p.name.toLowerCase().includes('icon')) {
          console.log(`Fight #${fightId}: Found ${p.name} — ${p.specs?.[0]?.spec} ${p.type} — sourceID: ${p.id}`);
        }
      }
    }
    // Also check DPS in case they're categorized differently
    if (details?.dps) {
      for (const p of details.dps) {
        if (p.name === 'Iconserve' || p.name.toLowerCase().includes('icon')) {
          console.log(`Fight #${fightId}: Found ${p.name} (DPS) — ${p.specs?.[0]?.spec} ${p.type} — sourceID: ${p.id}`);
        }
      }
    }
  }

  // Also just list ALL healers from fight 30 to see who's there
  const data30 = await gql(`{
    reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [30]) } }
  }`);
  console.log('\nAll healers in fight #30:');
  for (const p of data30.reportData.report.playerDetails?.data?.playerDetails?.healers || []) {
    console.log(`  ${p.name} — ${p.specs?.[0]?.spec} ${p.type} — sourceID: ${p.id}`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
