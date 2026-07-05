import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

let cachedToken = null, tokenExpiry = 0;
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

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    console.log('  Rate limited, waiting 60s...');
    await new Promise(r => setTimeout(r, 60000));
    return gql(query, variables);
  }
  if (!res.ok) throw new Error(`GraphQL failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Healer CDs to track
const HEALER_CDS = {
  // HPal
  31884: { name: 'Avenging Wrath', spec: 'HPal', cd: 120 },
  31821: { name: 'Aura Mastery', spec: 'HPal', cd: 180 },
  // RSham
  98008: { name: 'Spirit Link Totem', spec: 'RSham', cd: 180 },
  114052: { name: 'Ascendance', spec: 'RSham', cd: 180 },
  // MW
  115310: { name: 'Revival', spec: 'MW', cd: 180 },
  388615: { name: 'Revival (Restoral)', spec: 'MW', cd: 180 },
  322118: { name: "Invoke Yu'lon", spec: 'MW', cd: 120 },
  325197: { name: 'Invoke Chi-Ji', spec: 'MW', cd: 120 },
  443028: { name: 'Celestial Conduit', spec: 'MW', cd: 90 },
  // RDruid
  740: { name: 'Tranquility', spec: 'RDruid', cd: 180 },
  33891: { name: 'Incarnation: Tree of Life', spec: 'RDruid', cd: 180 },
  197721: { name: 'Flourish', spec: 'RDruid', cd: 90 },
  124974: { name: "Nature's Vigil", spec: 'RDruid', cd: 90 },
  // Raid externals
  97462: { name: 'Rallying Cry', spec: 'Raid', cd: 180 },
  196718: { name: 'Darkness', spec: 'Raid', cd: 180 },
  15286: { name: 'Vampiric Embrace', spec: 'Raid', cd: 120 },
  51052: { name: 'Anti-Magic Zone', spec: 'Raid', cd: 120 },
};

const SPELL_IDS = Object.keys(HEALER_CDS).map(Number);

// Top 5 fastest 4-heal kills with exact comp
const TEAMS = [
  { code: '7ZR6Jv2dD8rhnHXC', fightId: 32, label: 'Team 1 (487s)', healerIds: [39, 2, 18, 28] },
  { code: 'ZPabHpN8v4f6QFW9', fightId: 38, label: 'Team 2 (495s)', healerIds: [673, 203, 194, 197] },
  { code: 'MRGPx9phrtAKX43D', fightId: 63, label: 'Team 3 (498s)', healerIds: [493, 488, 490, 492] },
  { code: 'Tq1wkv3An4tzxN2Q', fightId: 13, label: 'Team 4 (498s)', healerIds: [] },
  { code: 'DwpQrM421dGgRLJ3', fightId: 64, label: 'Team 5 (505s)', healerIds: [] },
];

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function main() {
  console.log('=== Pulling Healer CDs for Mythic Crown — HPal/RDruid/RSham/MW ===\n');

  // First, get playerDetails for teams 4 & 5 to fill in healer IDs
  for (const team of TEAMS) {
    if (team.healerIds.length > 0) continue;
    console.log(`Getting player details for ${team.label} (${team.code} f${team.fightId})...`);
    const data = await gql(`query ($code: String!) {
      reportData { report(code: $code) {
        playerDetails(fightIDs: [${team.fightId}])
      }}
    }`, { code: team.code });
    let pd = data.reportData.report.playerDetails;
    if (typeof pd === 'string') pd = JSON.parse(pd);
    const inner = pd?.data?.playerDetails || pd;
    const healers = inner?.healers || [];
    team.healerIds = healers.map(h => h.id);
    console.log(`  Healers: ${healers.map(h => `${h.name} (${h.id})`).join(', ')}\n`);
  }

  const allTeamData = [];

  for (const team of TEAMS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${team.label} — ${team.code} fight ${team.fightId}`);
    console.log(`${'='.repeat(60)}`);

    // Get fight start/end times
    const fightData = await gql(`query ($code: String!) {
      reportData { report(code: $code) {
        fights(fightIDs: [${team.fightId}]) { id startTime endTime }
      }}
    }`, { code: team.code });
    const fight = fightData.reportData.report.fights[0];
    const fightStart = fight.startTime;
    const fightDuration = fight.endTime - fight.startTime;
    console.log(`Fight duration: ${formatTime(fightDuration)}\n`);

    // Pull cast events for ALL players (healers + raid CDs)
    const teamCasts = [];

    // Query casts for each healer individually
    for (const sid of team.healerIds) {
      console.log(`  Pulling casts for sourceID ${sid}...`);
      const castData = await gql(`query ($code: String!) {
        reportData { report(code: $code) {
          events(
            fightIDs: [${team.fightId}]
            sourceID: ${sid}
            dataType: Casts
            startTime: ${fight.startTime}
            endTime: ${fight.endTime}
          ) { data }
        }}
      }`, { code: team.code });

      const events = castData.reportData.report.events.data || [];
      for (const e of events) {
        const cdInfo = HEALER_CDS[e.abilityGameID];
        if (cdInfo) {
          const relTime = e.timestamp - fightStart;
          teamCasts.push({
            time: relTime,
            timeStr: formatTime(relTime),
            spell: cdInfo.name,
            spec: cdInfo.spec,
            spellId: e.abilityGameID,
            sourceID: sid,
          });
        }
      }
    }

    // Also pull raid CDs from non-healers (Rally, Darkness, VE, AMZ)
    const raidCdIds = [97462, 196718, 15286, 51052];
    console.log(`  Pulling raid CDs...`);
    for (const spellId of raidCdIds) {
      const raidData = await gql(`query ($code: String!) {
        reportData { report(code: $code) {
          events(
            fightIDs: [${team.fightId}]
            dataType: Casts
            startTime: ${fight.startTime}
            endTime: ${fight.endTime}
            abilityID: ${spellId}
          ) { data }
        }}
      }`, { code: team.code });
      const events = raidData.reportData.report.events.data || [];
      for (const e of events) {
        const cdInfo = HEALER_CDS[e.abilityGameID];
        if (cdInfo) {
          const relTime = e.timestamp - fightStart;
          teamCasts.push({
            time: relTime,
            timeStr: formatTime(relTime),
            spell: cdInfo.name,
            spec: cdInfo.spec,
            spellId: e.abilityGameID,
            sourceID: e.sourceID,
          });
        }
      }
    }

    teamCasts.sort((a, b) => a.time - b.time);

    console.log(`\n  CD Timeline:`);
    for (const c of teamCasts) {
      console.log(`    ${c.timeStr}  [${c.spec.padEnd(6)}]  ${c.spell}`);
    }

    allTeamData.push({
      ...team,
      duration: fightDuration,
      casts: teamCasts,
    });
  }

  // ── CONSENSUS ANALYSIS ──
  console.log('\n\n' + '='.repeat(70));
  console.log('CONSENSUS ANALYSIS — What CDs do teams use at each damage window?');
  console.log('='.repeat(70) + '\n');

  // Known damage windows from existing page
  const WINDOWS = [
    { time: 8000, name: 'Opener (0:08)', range: [0, 25000] },
    { time: 45000, name: 'Void Expulsion Stack (0:45)', range: [25000, 70000] },
    { time: 80000, name: 'Late P1 + Tremor (1:20)', range: [70000, 115000] },
    { time: 128000, name: 'Silversunder (2:08)', range: [115000, 165000] },
    { time: 174000, name: 'Cosmic Barrier #1 (2:54)', range: [165000, 210000] },
    { time: 230000, name: 'Simulacrum Backlash (3:50)', range: [210000, 260000] },
    { time: 260000, name: 'Sustained P2 (4:20)', range: [260000, 310000] },
    { time: 308000, name: 'Cosmic Radiation (5:08)', range: [310000, 330000] },
    { time: 336000, name: 'Cosmic Barrier #2 (5:36)', range: [330000, 370000] },
    { time: 383000, name: 'Devouring Cosmos #1 (6:23)', range: [370000, 410000] },
    { time: 407000, name: 'Cosmic Barrier #3 (6:47)', range: [410000, 445000] },
    { time: 443000, name: 'Devouring Cosmos #2 (7:23)', range: [445000, 480000] },
    { time: 503000, name: 'Devouring Cosmos #3 + Kill (8:23)', range: [480000, 550000] },
  ];

  for (const win of WINDOWS) {
    console.log(`\n── ${win.name} ──`);
    const teamsUsing = {};

    for (const team of allTeamData) {
      const castsInWindow = team.casts.filter(c => c.time >= win.range[0] && c.time < win.range[1]);
      for (const c of castsInWindow) {
        const key = `${c.spec}: ${c.spell}`;
        if (!teamsUsing[key]) teamsUsing[key] = [];
        teamsUsing[key].push({ team: team.label, time: c.timeStr });
      }
    }

    const sorted = Object.entries(teamsUsing).sort((a, b) => b[1].length - a[1].length);
    for (const [cd, teams] of sorted) {
      const count = teams.length;
      const times = teams.map(t => t.time).join(', ');
      const consensus = count >= 4 ? '████' : count >= 3 ? '███░' : count >= 2 ? '██░░' : '█░░░';
      console.log(`  ${consensus} ${count}/5  ${cd}  (${times})`);
    }
  }

  // Save raw data
  mkdirSync(join(__dirname, 'data', 'comp-search'), { recursive: true });
  writeFileSync(
    join(__dirname, 'data', 'comp-search', 'cosmos-4heal-cds.json'),
    JSON.stringify(allTeamData, null, 2)
  );
  console.log('\nSaved to data/comp-search/cosmos-4heal-cds.json');
}

main().catch(e => { console.error(e); process.exit(1); });
