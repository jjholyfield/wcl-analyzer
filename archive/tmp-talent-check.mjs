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
const FIGHT = 30; // best pull
const ENC_LBV = 3180;

// Players to check
const CHECK_PLAYERS = ['Kishnna', 'Alitheria', 'Moistbear', 'Smokinthisza', 'Starfighter'];

async function main() {
  // Get player details with talent info
  const data = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
      }
    }
  }`);

  const details = data.reportData.report.playerDetails?.data?.playerDetails;

  console.log('TALENT / BUILD CHECK — PLAYERS VS TOP RANKED');
  console.log('='.repeat(90));

  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (!CHECK_PLAYERS.includes(p.name)) continue;
      const spec = p.specs?.[0];
      console.log(`\n${p.name} — ${spec?.spec} ${p.type}`);
      console.log(`  Talents: ${JSON.stringify(spec?.talents, null, 2)?.substring(0, 500) || 'none'}`);

      // Show the raw spec data
      if (spec) {
        console.log(`  Spec data keys: ${Object.keys(spec).join(', ')}`);
        if (spec.talents) {
          console.log(`  Talent count: ${spec.talents.length}`);
          for (const t of spec.talents || []) {
            console.log(`    ${t.name} (id:${t.id || t.guid}, type:${t.type || '?'})`);
          }
        }
      }
    }
  }

  // Now check top ranked players for comparison
  const specChecks = [
    { name: 'Kishnna', class: 'Rogue', spec: 'Subtlety' },
    { name: 'Alitheria', class: 'Paladin', spec: 'Retribution' },
    { name: 'Moistbear', class: 'Druid', spec: 'Feral' },
    { name: 'Smokinthisza', class: 'Hunter', spec: 'Marksmanship' },
    { name: 'Starfighter', class: 'Warrior', spec: 'Arms' },
  ];

  for (const check of specChecks) {
    console.log(`\n${'─'.repeat(90)}`);
    console.log(`TOP 3 ${check.spec.toUpperCase()} ${check.class.toUpperCase()}S — TALENT CHECK`);
    console.log('─'.repeat(90));

    const rankData = await gql(`{
      worldData {
        encounter(id: ${ENC_LBV}) {
          characterRankings(difficulty: 5, className: "${check.class}", specName: "${check.spec}", metric: dps, page: 1)
        }
      }
    }`);

    const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];

    for (let i = 0; i < Math.min(3, rankings.length); i++) {
      const r = rankings[i];
      const report = r.report?.code;
      const fight = r.report?.fightID;
      if (!report || !fight) continue;

      const topData = await gql(`{
        reportData {
          report(code: "${report}") {
            playerDetails(fightIDs: [${fight}])
          }
        }
      }`);

      const topDetails = topData.reportData.report.playerDetails?.data?.playerDetails;
      for (const role of Object.values(topDetails || {})) {
        if (!Array.isArray(role)) continue;
        for (const p of role) {
          if (p.name === r.name) {
            const spec = p.specs?.[0];
            console.log(`\n  #${i+1} ${r.name} — ${spec?.spec} ${p.type}`);
            if (spec?.talents) {
              for (const t of spec.talents) {
                console.log(`    ${t.name} (id:${t.id || t.guid})`);
              }
            }
          }
        }
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
