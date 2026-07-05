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

const REPORT = 'by6mKkdwXGcqQtRW';

async function main() {
  // Get fights
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
      }
    }
  }`);

  const fights = fightData.reportData.report.fights
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));

  // Take the 5 longest pulls
  const bestPulls = fights.slice(0, 5);
  const bestIds = bestPulls.map(f => f.id);

  console.log('5 LONGEST PULLS:');
  for (const f of bestPulls) {
    const dur = (f.endTime - f.startTime) / 1000;
    console.log(`  #${f.id} — ${fmt(dur)} (${dur.toFixed(0)}s)`);
  }

  // Get roster from longest pull
  const detailData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${bestPulls[0].id}])
      }
    }
  }`);

  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;

  // Get DPS table across best 5 pulls
  const dpsTable = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        table(dataType: DamageDone, fightIDs: [${bestIds.join(',')}])
      }
    }
  }`);

  const dpsEntries = dpsTable.reportData.report.table?.data?.entries || [];
  const totalTime = bestPulls.reduce((s, f) => s + (f.endTime - f.startTime) / 1000, 0);

  console.log(`\nTotal time across 5 best pulls: ${fmt(totalTime)}`);

  console.log('\n─── ROSTER ───');

  if (details?.tanks) {
    console.log('\nTanks:');
    for (const p of details.tanks) {
      const entry = dpsEntries.find(e => e.name === p.name);
      const dps = entry ? (entry.total / totalTime).toFixed(0) : '?';
      console.log(`  ${p.name.padEnd(16)} ${(p.specs?.[0]?.spec + ' ' + p.type).padEnd(24)} ${Number(dps).toLocaleString()} DPS`);
    }
  }

  if (details?.healers) {
    console.log('\nHealers:');
    for (const p of details.healers) {
      const entry = dpsEntries.find(e => e.name === p.name);
      const dps = entry ? (entry.total / totalTime).toFixed(0) : '?';
      console.log(`  ${p.name.padEnd(16)} ${(p.specs?.[0]?.spec + ' ' + p.type).padEnd(24)} ${Number(dps).toLocaleString()} DPS`);
    }
  }

  if (details?.dps) {
    console.log('\nDPS:');
    const dpsWithNumbers = details.dps.map(p => {
      const entry = dpsEntries.find(e => e.name === p.name);
      return {
        name: p.name,
        spec: `${p.specs?.[0]?.spec} ${p.type}`,
        id: p.id,
        totalDmg: entry?.total || 0,
        dps: entry ? (entry.total / totalTime).toFixed(0) : '0',
      };
    }).sort((a, b) => b.totalDmg - a.totalDmg);

    for (const p of dpsWithNumbers) {
      console.log(`  ${p.name.padEnd(16)} ${p.spec.padEnd(24)} ${Number(p.dps).toLocaleString().padStart(8)} DPS avg`);
    }

    // Summary stats
    console.log(`\n─── DPS SUMMARY ───`);
    console.log(`  Players: ${dpsWithNumbers.length}`);
    const avgDps = dpsWithNumbers.reduce((s, p) => s + parseInt(p.dps), 0) / dpsWithNumbers.length;
    console.log(`  Average DPS: ${avgDps.toFixed(0)}`);
    const topDps = parseInt(dpsWithNumbers[0].dps);
    const botDps = parseInt(dpsWithNumbers[dpsWithNumbers.length - 1].dps);
    console.log(`  Top: ${dpsWithNumbers[0].name} (${topDps.toLocaleString()})`);
    console.log(`  Bottom: ${dpsWithNumbers[dpsWithNumbers.length - 1].name} (${botDps.toLocaleString()})`);
    console.log(`  Spread: ${((topDps / botDps - 1) * 100).toFixed(0)}% gap top to bottom`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
