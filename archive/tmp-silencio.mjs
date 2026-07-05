import { readFileSync } from 'fs';
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const t = await fetch('https://www.warcraftlogs.com/oauth/token', {
  method: 'POST',
  headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
const td = await t.json();
console.log('Token status:', t.status, 'token length:', td.access_token?.length);

const token = td.access_token;
const REPORT = 'x2jCDbqdvWHwKQFM';
const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ reportData { report(code: "${REPORT}") { fights(killType: Encounters) { id encounterID } } } }` }),
});
console.log('API status:', res.status);
const json = await res.json();
console.log('Raw response:', JSON.stringify(json).substring(0, 500));
