import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// Step 1: Find recent reports for Destval
console.log('Looking up Destval-Area52...\n');

const charData = await gql(`
  query($name: String!, $server: String!, $region: String!) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        name
        server { slug }
        classID
        recentReports(limit: 10) {
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

const char = charData.characterData.character;
if (!char) {
  console.error('Character not found!');
  process.exit(1);
}

console.log(`Found: ${char.name}-${char.server.slug} (classID: ${char.classID})\n`);
console.log('Recent Reports:');
console.log('─'.repeat(70));

for (const r of char.recentReports.data) {
  const date = new Date(r.startTime).toLocaleDateString();
  const dur = ((r.endTime - r.startTime) / 1000 / 60).toFixed(0);
  console.log(`  [${r.code}] ${r.title} — ${r.zone?.name || 'Unknown'} (${date}, ${dur}min)`);
}

// Find M+ reports (zone name usually contains "Mythic+" or the dungeon name)
const mplusReports = char.recentReports.data.filter(r =>
  r.zone?.name && !['The Voidspire', 'Darkreach Citadel'].includes(r.zone.name)
);

if (mplusReports.length === 0) {
  console.log('\nNo obvious M+ reports found. Checking the most recent report for dungeon fights...');
  // Fall through to check the most recent report
}

// Take the most recent report and look at its fights
const targetReport = char.recentReports.data[0];
console.log(`\n\nChecking most recent report: ${targetReport.code} (${targetReport.title})...`);

const reportData = await gql(`
  query($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        startTime
        endTime
        fights {
          id
          encounterID
          name
          kill
          difficulty
          keystoneLevel
          startTime
          endTime
          bossPercentage
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
`, { code: targetReport.code });

const report = reportData.reportData.report;
console.log(`\n── ${report.title} ──\n`);

console.log('FIGHTS:');
console.log('─'.repeat(70));
for (const f of report.fights) {
  const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
  const status = f.kill ? 'KILL' : `${(f.bossPercentage / 100).toFixed(1)}%`;
  const keyInfo = f.keystoneLevel ? ` [+${f.keystoneLevel}]` : '';
  console.log(`  [${f.id}] ${f.name}${keyInfo} — ${status} (${dur}s) diff:${f.difficulty}`);
}

console.log('\nPLAYERS:');
console.log('─'.repeat(70));
for (const p of report.masterData.actors) {
  console.log(`  [${p.id}] ${p.name}-${p.server} (${p.subType})`);
}

// Save for next step
writeFileSync('data/destval-recent.json', JSON.stringify({ char, report }, null, 2));
console.log('\nSaved to data/destval-recent.json');
