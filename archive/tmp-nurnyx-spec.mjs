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
  return res.json();
}

const REPORT = 'x2jCDbqdvWHwKQFM';
const fights = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,20,21,22,23,24,25,26,27,28,29,30,31];

async function run() {
  const shadow = [];
  const disc = [];

  for (const fid of fights) {
    const pd = await gql(`{ reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [${fid}]) } } }`);
    const details = pd.data?.reportData?.report?.playerDetails?.data?.playerDetails;
    if (!details) {
      // check both structures
      const alt = pd.data?.reportData?.report?.playerDetails?.data;
      if (alt) {
        let found = false;
        for (const role of ['dps', 'healers', 'tanks']) {
          for (const p of (alt[role] || [])) {
            if (p.name === 'Nurnyx') {
              const spec = p.specs?.[0]?.spec || 'unknown';
              console.log(`Fight #${fid}: ${spec} (${role})`);
              if (spec === 'Shadow') shadow.push(fid);
              else disc.push(fid);
              found = true;
            }
          }
        }
        if (!found) console.log(`Fight #${fid}: NOT PRESENT`);
      } else {
        console.log(`Fight #${fid}: NO DATA`);
      }
      continue;
    }
    let found = false;
    for (const role of ['dps', 'healers', 'tanks']) {
      for (const p of (details[role] || [])) {
        if (p.name === 'Nurnyx') {
          const spec = p.specs?.[0]?.spec || 'unknown';
          console.log(`Fight #${fid}: ${spec} (${role})`);
          if (spec === 'Shadow') shadow.push(fid);
          else disc.push(fid);
          found = true;
        }
      }
    }
    if (!found) console.log(`Fight #${fid}: NOT PRESENT`);
  }

  console.log(`\nShadow fights: ${shadow.join(', ')}`);
  console.log(`Disc fights: ${disc.join(', ')}`);
}
run().catch(e => console.error(e));
