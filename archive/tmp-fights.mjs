import { readFileSync } from 'fs';
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const r = await fetch('https://www.warcraftlogs.com/oauth/token', {
  method: 'POST',
  headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
const { access_token } = await r.json();

const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ reportData { report(code: "B7h3VP1ndcXTQZ92") { fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime } } } }` }),
});
const data = await res.json();
for (const f of data.data.reportData.report.fights) {
  const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
  const diff = f.difficulty === 5 ? 'M' : 'H';
  console.log(`#${f.id} ${diff} ${f.name} ${f.kill ? 'KILL' : 'WIPE'} ${dur}s enc:${f.encounterID}`);
}
