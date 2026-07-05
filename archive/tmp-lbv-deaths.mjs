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

async function fetchAllEvents(reportCode, fightId, dataType, extra = '') {
  let all = [];
  let nextPage = null;
  while (true) {
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            ${timeFilter}
            ${extra}
            limit: 10000
          ) { data nextPageTimestamp }
        }
      }
    }`);
    const result = data.reportData.report.events;
    if (result.data?.length > 0) all = all.concat(result.data);
    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }
  return all;
}

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const REPORT = 'w9CLGQXPWdDnfcrb';
const ENC_LBV = 3180;

async function main() {
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
        masterData { abilities { gameID name } actors { id name type subType } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of fightData.reportData.report.masterData?.abilities || []) {
    spellNames[a.gameID] = a.name;
  }
  const actorNames = {};
  for (const a of fightData.reportData.report.masterData?.actors || []) {
    actorNames[a.id] = a.name;
  }

  const allFights = fightData.reportData.report.fights
    .filter(f => f.encounterID === ENC_LBV && f.difficulty === 5)
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));

  // Check the 5 longest pulls
  const pulls = allFights.slice(0, 5);

  console.log('MYTHIC LBV — WHAT IS KILLING YOU?');
  console.log('='.repeat(90));

  for (const pull of pulls) {
    const duration = (pull.endTime - pull.startTime) / 1000;
    const fightStart = pull.startTime;

    console.log(`\n${'─'.repeat(90)}`);
    console.log(`  FIGHT #${pull.id} — WIPE at ${fmt(duration)}`);
    console.log(`${'─'.repeat(90)}`);

    // Pull deaths
    const deaths = await fetchAllEvents(REPORT, pull.id, 'Deaths');
    const deathEvents = deaths
      .filter(e => e.type === 'death')
      .sort((a, b) => a.timestamp - b.timestamp);

    if (deathEvents.length === 0) {
      console.log('  No deaths recorded');
      continue;
    }

    console.log(`\n  Death order:`);
    for (const d of deathEvents.slice(0, 10)) {
      const t = (d.timestamp - fightStart) / 1000;
      const name = actorNames[d.targetID] || `player-${d.targetID}`;
      // Get killing blow info
      const killingAbility = d.killingAbilityGameID ? (spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}`) : 'unknown';
      const killer = d.killerID ? (actorNames[d.killerID] || `npc-${d.killerID}`) : '';
      console.log(`    ${fmt(t)}  ${name.padEnd(16)} killed by: ${killingAbility}${killer ? ` (${killer})` : ''}`);
    }

    // Pull damage taken in the last 30s before wipe
    const last30sStart = pull.endTime - 30000;
    console.log(`\n  Top damage sources in last 30s (${fmt((last30sStart - fightStart)/1000)} - ${fmt(duration)}):`);

    const dmgTaken = await fetchAllEvents(REPORT, pull.id, 'DamageTaken', `startTime: ${last30sStart}`);
    const dmgByAbility = {};
    for (const e of dmgTaken) {
      if (e.type !== 'damage') continue;
      const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
      if (!dmgByAbility[name]) dmgByAbility[name] = { total: 0, hits: 0 };
      dmgByAbility[name].total += (e.amount || 0) + (e.absorbed || 0);
      dmgByAbility[name].hits++;
    }

    const sorted = Object.entries(dmgByAbility)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    for (const [name, info] of sorted) {
      console.log(`    ${(info.total / 1000000).toFixed(1).padStart(5)}M  ${name} (${info.hits} hits)`);
    }

    // Also show damage taken timeline in the 2:00-wipe window
    console.log(`\n  Damage spike timeline (2:00 onward):`);
    const lateStart = fightStart + 120000;
    const lateDmg = await fetchAllEvents(REPORT, pull.id, 'DamageTaken', `startTime: ${lateStart}`);

    // Aggregate by 5-second windows
    const windows = {};
    for (const e of lateDmg) {
      if (e.type !== 'damage') continue;
      const t = (e.timestamp - fightStart) / 1000;
      const windowKey = Math.floor(t / 5) * 5;
      if (!windows[windowKey]) windows[windowKey] = { total: 0, abilities: {} };
      windows[windowKey].total += (e.amount || 0) + (e.absorbed || 0);
      const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
      windows[windowKey].abilities[name] = (windows[windowKey].abilities[name] || 0) + (e.amount || 0) + (e.absorbed || 0);
    }

    const windowKeys = Object.keys(windows).map(Number).sort((a, b) => a - b);
    for (const wk of windowKeys) {
      const w = windows[wk];
      const topAbility = Object.entries(w.abilities).sort((a, b) => b[1] - a[1])[0];
      const bar = '█'.repeat(Math.min(40, Math.floor(w.total / 500000)));
      console.log(`    ${fmt(wk)}-${fmt(wk+5)}  ${(w.total/1000000).toFixed(1).padStart(4)}M ${bar}  ${topAbility[0]}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
