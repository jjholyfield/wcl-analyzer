import { readFileSync } from 'fs';
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

async function getToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) { console.error(JSON.stringify(json.errors)); process.exit(1); }
  return json.data;
}

const data = await gql(`
  query($name: String!, $server: String!, $region: String!) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        recentReports(limit: 5) {
          data {
            code
            title
            startTime
            endTime
            zone { name }
          }
        }
      }
    }
  }
`, { name: "Destval", server: "area-52", region: "us" });

const reports = data.characterData.character.recentReports.data;
for (const r of reports) {
  const date = new Date(r.startTime).toLocaleString();
  const dur = ((r.endTime - r.startTime) / 1000 / 60).toFixed(0);
  console.log(`${r.code} | ${r.title} | ${date} | ${r.zone?.name} | ${dur}min`);
}

// Check the most recent one for fights
const latest = reports[0];
console.log(`\nChecking latest: ${latest.code}...`);

const reportData = await gql(`
  query($code: String!) {
    reportData {
      report(code: $code) {
        title
        fights {
          id
          name
          keystoneLevel
          kill
          startTime
          endTime
        }
        masterData(translate: true) {
          actors(type: "Player") {
            id
            name
            server
            subType
          }
        }
      }
    }
  }
`, { code: latest.code });

const report = reportData.reportData.report;
console.log(`\nFights in ${report.title}:`);
for (const f of report.fights) {
  const dur = ((f.endTime - f.startTime) / 1000 / 60).toFixed(1);
  const keyInfo = f.keystoneLevel ? ` +${f.keystoneLevel}` : '';
  console.log(`  [${f.id}] ${f.name}${keyInfo} — ${f.kill ? 'TIMED' : 'DEPLETED'} (${dur}min)`);
}
console.log('\nPlayers:');
for (const p of report.masterData.actors.filter(a => a.subType && a.subType !== 'Unknown')) {
  console.log(`  [${p.id}] ${p.name}-${p.server} (${p.subType})`);
}
