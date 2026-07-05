import { readFileSync } from 'fs';
import { join } from 'path';

const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
  method: 'POST',
  headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
const { access_token } = await res.json();

const query = `{
  reportData {
    report(code: "FgbKj64vPNc9HAVa") {
      title
      startTime
      endTime
      zone { name }
      owner { name }
      fights(killType: Encounters) {
        id
        name
        encounterID
        difficulty
        kill
        fightPercentage
        startTime
        endTime
      }
    }
  }
}`;

const r = await fetch('https://www.warcraftlogs.com/api/v2/client', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const data = await r.json();
const report = data.data.reportData.report;
console.log('Title:', report.title);
console.log('Zone:', report.zone?.name);
console.log('Owner:', report.owner?.name);
console.log('Date:', new Date(report.startTime).toLocaleDateString());
console.log('');
console.log('Fights:');
for (const f of report.fights) {
  const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
  const diff = f.difficulty === 5 ? 'M' : f.difficulty === 4 ? 'H' : f.difficulty;
  const result = f.kill ? 'KILL' : `${(f.fightPercentage / 100).toFixed(1)}%`;
  console.log(`  #${f.id} ${diff} ${f.name} -- ${dur}s -- ${result}`);
}
