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

async function fetchAllEvents(reportCode, fightId, sourceId, dataType, extraFilter = '') {
  let all = [];
  let nextPage = null;
  while (true) {
    const sourceFilter = sourceId ? `sourceID: ${sourceId},` : '';
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            ${sourceFilter}
            ${timeFilter}
            ${extraFilter}
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

const ENC_LBV = 3180;

// Step 1: Find a mythic LBV kill from rankings to verify boss timings
async function findMythicLBVKill() {
  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        fightRankings(difficulty: 5, metric: speed, page: 1)
      }
    }
  }`);
  const rankings = data.worldData.encounter.fightRankings?.rankings || [];
  if (rankings.length === 0) {
    console.log('No mythic LBV kills found in rankings');
    return null;
  }
  // Pick the first kill
  const kill = rankings[0];
  console.log(`Reference kill: ${kill.report.code} fight ${kill.report.fightID} (${(kill.duration/1000).toFixed(0)}s)`);
  return { report: kill.report.code, fight: kill.report.fightID, duration: kill.duration / 1000 };
}

// Step 2: Verify boss ability timings
async function verifyBossTimings(report, fightId) {
  // Get fight info
  const meta = await gql(`{
    reportData {
      report(code: "${report}") {
        fights(fightIDs: [${fightId}]) { id startTime endTime enemyNPCs { id gameID } }
      }
    }
  }`);
  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  console.log(`\nFight duration: ${duration.toFixed(0)}s`);

  // Pull enemy casts (boss abilities)
  const enemyCasts = await fetchAllEvents(report, fightId, null, 'Casts', 'hostilityType: Enemies');

  // Key boss abilities to verify
  const SR_ID = 470689; // Searing Radiance - might need to find the right ID
  const MASS_AS_ID = 470167; // Mass Avenger's Shield - might need to find
  const TYRS_WRATH_ID = 470622; // Tyr's Wrath

  // Let's just dump all unique enemy abilities to find the right IDs
  const abilityMap = {};
  for (const e of enemyCasts) {
    if (e.type === 'cast' || e.type === 'begincast') {
      const id = e.abilityGameID;
      if (!abilityMap[id]) abilityMap[id] = { count: 0, times: [] };
      abilityMap[id].count++;
      abilityMap[id].times.push(((e.timestamp - fightStart) / 1000).toFixed(1));
    }
  }

  console.log('\n=== BOSS ABILITIES ===');
  const sorted = Object.entries(abilityMap).sort((a, b) => b[1].count - a[1].count);
  for (const [id, info] of sorted.slice(0, 30)) {
    console.log(`  spell-${id} (${info.count}x): ${info.times.slice(0, 10).join(', ')}${info.times.length > 10 ? '...' : ''}`);
  }

  return { fightStart, duration };
}

// Step 3: Check Josh's team report for healer CD timings
async function verifyTeamCDs() {
  const REPORT = 'w9CLGQXPWdDnfcrb';

  // Get fights from this report
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
      }
    }
  }`);

  const fights = fightData.reportData.report.fights;
  const lbvFights = fights.filter(f => f.encounterID === ENC_LBV);
  console.log(`\n=== JOSH'S TEAM REPORT (${REPORT}) ===`);
  for (const f of lbvFights) {
    const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
    const diff = f.difficulty === 5 ? 'M' : 'H';
    console.log(`  #${f.id} ${diff} ${f.name} ${f.kill ? 'KILL' : 'WIPE'} ${dur}s`);
  }

  // Find the kill or longest wipe
  const kill = lbvFights.find(f => f.kill) || lbvFights[lbvFights.length - 1];
  if (!kill) {
    console.log('No LBV fights found in this report');
    return;
  }
  console.log(`\nAnalyzing fight #${kill.id} (${kill.kill ? 'KILL' : 'WIPE'}, ${((kill.endTime - kill.startTime)/1000).toFixed(0)}s)`);

  // Get player details
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${kill.id}])
        fights(fightIDs: [${kill.id}]) { id startTime endTime }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  // Find healers
  const healers = [];
  if (details?.healers) {
    for (const p of details.healers) {
      healers.push({ name: p.name, id: p.id, type: p.type, spec: p.specs?.[0]?.spec });
    }
  }

  console.log(`\nHealers found:`);
  for (const h of healers) console.log(`  ${h.name} — ${h.spec} ${h.type} (ID: ${h.id})`);

  // Pull CDs for each healer
  const CD_SPELLS = {
    // MW
    115310: { name: 'Revival', cd: 180 },
    388615: { name: 'Restoral', cd: 180 },
    322118: { name: "Yu'lon", cd: 120 },
    325197: { name: "Chi-Ji", cd: 120 },
    443028: { name: 'Celestial Conduit', cd: 90 },
    116849: { name: 'Life Cocoon', cd: 120 },
    // RSham
    98008: { name: 'Spirit Link Totem', cd: 180 },
    114052: { name: 'Ascendance', cd: 180 },
    108280: { name: 'Healing Tide Totem', cd: 180 },
    // RDruid
    740: { name: 'Tranquility', cd: 180 },
    391528: { name: 'Convoke the Spirits', cd: 120 },
    393763: { name: 'Convoke the Spirits', cd: 120 },
    323764: { name: 'Convoke the Spirits', cd: 120 },
    102342: { name: 'Ironbark', cd: 90 },
    // HPal
    31884: { name: 'Avenging Wrath', cd: 120 },
    31821: { name: 'Aura Mastery', cd: 180 },
    6940: { name: 'Blessing of Sacrifice', cd: 120 },
    633: { name: 'Lay on Hands', cd: 600 },
    216331: { name: 'Avenging Crusader', cd: 120 },
    // HPriest
    64843: { name: 'Divine Hymn', cd: 180 },
    200183: { name: 'Apotheosis', cd: 120 },
    47788: { name: 'Guardian Spirit', cd: 60 },
    246287: { name: 'Evangelism', cd: 90 },
    // Raid CDs
    196718: { name: 'Darkness', cd: 180 },
    97462: { name: 'Rallying Cry', cd: 180 },
    15286: { name: 'Vampiric Embrace', cd: 120 },
    51052: { name: 'Anti-Magic Zone', cd: 120 },
  };

  const allCdIds = Object.keys(CD_SPELLS).map(Number);

  for (const healer of healers) {
    const casts = await fetchAllEvents(REPORT, kill.id, healer.id, 'Casts');
    const cdCasts = casts
      .filter(e => e.type === 'cast' && allCdIds.includes(e.abilityGameID))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (cdCasts.length === 0) continue;

    console.log(`\n  ${healer.name} (${healer.spec} ${healer.type}):`);
    for (const e of cdCasts) {
      const t = ((e.timestamp - fightStart) / 1000);
      const spell = CD_SPELLS[e.abilityGameID];
      const mins = Math.floor(t / 60);
      const secs = (t % 60).toFixed(0).padStart(2, '0');
      console.log(`    ${mins}:${secs}  ${spell?.name || `spell-${e.abilityGameID}`}`);
    }

    // Check for timer conflicts
    const bySpell = {};
    for (const e of cdCasts) {
      const id = e.abilityGameID;
      if (!bySpell[id]) bySpell[id] = [];
      bySpell[id].push((e.timestamp - fightStart) / 1000);
    }

    for (const [id, times] of Object.entries(bySpell)) {
      const spell = CD_SPELLS[id];
      if (!spell || times.length < 2) continue;
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (gap < spell.cd) {
          console.log(`    ⚠️ ${spell.name}: ${times[i-1].toFixed(0)}s → ${times[i].toFixed(0)}s = ${gap.toFixed(0)}s gap (CD is ${spell.cd}s)`);
        }
      }
    }
  }
}

// Also search rankings for a MW/RSham/RDruid/HPal/HPriest kill to compare CD patterns
async function findMatchingComp() {
  // Search MW Monk rankings on mythic LBV
  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "Monk", specName: "Mistweaver", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.characterRankings?.rankings || [];
  console.log(`\n=== MW MONK RANKINGS (Mythic LBV) — ${rankings.length} entries ===`);

  // Check first few for team comp
  for (const r of rankings.slice(0, 5)) {
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    // Get healers
    const meta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
        }
      }
    }`);

    const details = meta.reportData.report.playerDetails?.data?.playerDetails;
    const fightInfo = meta.reportData.report.fights[0];
    const duration = fightInfo ? ((fightInfo.endTime - fightInfo.startTime) / 1000).toFixed(0) : '?';
    const healerSpecs = [];
    if (details?.healers) {
      for (const p of details.healers) {
        const spec = p.specs?.[0]?.spec;
        const type = p.type;
        healerSpecs.push(`${spec} ${type}`);
      }
    }
    console.log(`  #${rankings.indexOf(r)+1} ${r.name} — ${report} fight ${fight} (${duration}s) — ${healerSpecs.join(', ')}`);
  }
}

async function main() {
  console.log('MYTHIC LBV GUIDE VERIFICATION');
  console.log('='.repeat(80));

  // First check Josh's team data
  await verifyTeamCDs();

  // Then check a ranked kill for boss timings
  console.log('\n' + '='.repeat(80));
  console.log('BOSS ABILITY TIMINGS FROM RANKED KILL');
  console.log('='.repeat(80));

  const kill = await findMythicLBVKill();
  if (kill) {
    await verifyBossTimings(kill.report, kill.fight);
  }

  // Check top MW monks for CD patterns
  console.log('\n' + '='.repeat(80));
  console.log('TOP MW MONKS — COMP CHECK');
  console.log('='.repeat(80));
  await findMatchingComp();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
