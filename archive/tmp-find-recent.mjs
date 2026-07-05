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

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function main() {
  // Search for recent reports from Josh's guild
  // Try character-based lookup for Senssay on Proudmoore
  const data = await gql(`{
    characterData {
      character(name: "Senssay", serverSlug: "proudmoore", serverRegion: "us") {
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
  }`);

  const reports = data.characterData?.character?.recentReports?.data || [];
  console.log('RECENT REPORTS FOR SENSSAY');
  console.log('='.repeat(80));

  for (const r of reports) {
    const date = new Date(r.startTime);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const duration = ((r.endTime - r.startTime) / 1000 / 60).toFixed(0);
    console.log(`  ${r.code} — ${dateStr} — ${r.title || r.zone?.name || 'Unknown'} (${duration} min)`);
  }

  // Pull fights from the most recent report
  if (reports.length > 0) {
    const latest = reports[0];
    console.log(`\nLATEST REPORT: ${latest.code}`);
    console.log('='.repeat(80));

    const fightData = await gql(`{
      reportData {
        report(code: "${latest.code}") {
          fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
          playerDetails
        }
      }
    }`);

    const fights = fightData.reportData.report.fights;
    console.log(`\nFights (${fights.length}):`);
    for (const f of fights) {
      const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
      const diff = f.difficulty === 5 ? 'M' : f.difficulty === 4 ? 'H' : 'N';
      console.log(`  #${f.id} ${diff} ${f.name} ${f.kill ? 'KILL' : 'WIPE'} ${dur}s enc:${f.encounterID}`);
    }

    // Show all DPS players
    const details = fightData.reportData.report.playerDetails?.data?.playerDetails;
    if (details?.dps) {
      console.log(`\nDPS Players (${details.dps.length}):`);
      for (const p of details.dps) {
        const spec = p.specs?.[0]?.spec || '?';
        console.log(`  ${p.name.padEnd(16)} ${spec} ${p.type}`);
      }
    }
    if (details?.healers) {
      console.log(`\nHealers (${details.healers.length}):`);
      for (const p of details.healers) {
        const spec = p.specs?.[0]?.spec || '?';
        console.log(`  ${p.name.padEnd(16)} ${spec} ${p.type}`);
      }
    }
    if (details?.tanks) {
      console.log(`\nTanks (${details.tanks.length}):`);
      for (const p of details.tanks) {
        const spec = p.specs?.[0]?.spec || '?';
        console.log(`  ${p.name.padEnd(16)} ${spec} ${p.type}`);
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
