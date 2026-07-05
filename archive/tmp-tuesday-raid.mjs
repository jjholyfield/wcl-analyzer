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

const BOSS_NAMES = {
  3176: 'Averzian', 3177: 'Vorasius', 3178: 'V&E', 3179: 'Salhadaar',
  3180: 'LBV', 3181: 'Crown', 3182: "Belo'ren", 3183: 'Midnight Falls', 3306: 'Chimaerus'
};

async function main() {
  console.log(`TUESDAY RAID — ${REPORT}`);
  console.log('='.repeat(90));

  const data = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        title
        startTime
        endTime
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
      }
    }
  }`);

  const report = data.reportData.report;
  const date = new Date(report.startTime);
  console.log(`${report.title || 'Untitled'} — ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  console.log(`Duration: ${((report.endTime - report.startTime) / 1000 / 60).toFixed(0)} minutes\n`);

  // Fights
  const fights = report.fights;
  console.log(`Fights (${fights.length}):`);

  const kills = [];
  const wipes = [];
  for (const f of fights) {
    const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
    const diff = f.difficulty === 5 ? 'M' : f.difficulty === 4 ? 'H' : 'N';
    const boss = BOSS_NAMES[f.encounterID] || f.name;
    const line = `  #${f.id.toString().padStart(2)} ${diff} ${boss.padEnd(14)} ${f.kill ? 'KILL' : 'WIPE'} ${dur}s`;
    console.log(line);
    if (f.kill) kills.push(f);
    else wipes.push(f);
  }

  console.log(`\nKills: ${kills.length} | Wipes: ${wipes.length}`);

  // Get player details from a kill fight (or first fight)
  const sampleFight = kills[0] || fights[0];
  const detailData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${sampleFight.id}])
      }
    }
  }`);

  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;

  // DPS table with damage done
  const dpsTable = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        table(dataType: DamageDone, fightIDs: [${kills.map(k => k.id).join(',')}])
      }
    }
  }`);

  const dpsEntries = dpsTable.reportData.report.table?.data?.entries || [];

  console.log(`\n${'─'.repeat(90)}`);
  console.log('  ROSTER');
  console.log('─'.repeat(90));

  if (details?.tanks) {
    console.log('\n  Tanks:');
    for (const p of details.tanks) {
      console.log(`    ${p.name.padEnd(16)} ${p.specs?.[0]?.spec} ${p.type}`);
    }
  }

  if (details?.healers) {
    console.log('\n  Healers:');
    for (const p of details.healers) {
      console.log(`    ${p.name.padEnd(16)} ${p.specs?.[0]?.spec} ${p.type}`);
    }
  }

  if (details?.dps) {
    console.log('\n  DPS:');
    // Sort by DPS from table
    const dpsWithNumbers = details.dps.map(p => {
      const entry = dpsEntries.find(e => e.name === p.name);
      return { ...p, totalDmg: entry?.total || 0 };
    }).sort((a, b) => b.totalDmg - a.totalDmg);

    for (const p of dpsWithNumbers) {
      const spec = `${p.specs?.[0]?.spec} ${p.type}`;
      const dmgStr = p.totalDmg > 0 ? `${(p.totalDmg / 1000000).toFixed(1)}M total` : '';
      console.log(`    ${p.name.padEnd(16)} ${spec.padEnd(24)} ${dmgStr}`);
    }
  }

  // Per-boss DPS breakdown for kills
  if (kills.length > 0) {
    console.log(`\n${'─'.repeat(90)}`);
    console.log('  PER-BOSS DPS (kills only)');
    console.log('─'.repeat(90));

    for (const kill of kills) {
      const dur = (kill.endTime - kill.startTime) / 1000;
      const diff = kill.difficulty === 5 ? 'M' : 'H';
      const boss = BOSS_NAMES[kill.encounterID] || kill.name;

      const bossTable = await gql(`{
        reportData {
          report(code: "${REPORT}") {
            table(dataType: DamageDone, fightIDs: [${kill.id}])
          }
        }
      }`);

      const entries = bossTable.reportData.report.table?.data?.entries || [];
      const sorted = entries
        .filter(e => details?.dps?.some(d => d.name === e.name))
        .sort((a, b) => b.total - a.total);

      console.log(`\n  ${diff} ${boss} (${fmt(dur)}):`);
      for (const e of sorted) {
        const dps = (e.total / dur).toFixed(0);
        const spec = details.dps.find(d => d.name === e.name);
        const specStr = spec ? `${spec.specs?.[0]?.spec} ${spec.type}` : '';
        console.log(`    ${e.name.padEnd(16)} ${Number(dps).toLocaleString().padStart(8)} DPS  ${specStr}`);
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
