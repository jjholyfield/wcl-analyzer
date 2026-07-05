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

async function fetchAllEvents(reportCode, fightId, sourceId, dataType) {
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
            sourceID: ${sourceId}
            ${timeFilter}
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

// CDs to track per spec
const MW_CDS = [115310, 388615, 322118, 325197, 443028, 116849, 116680];
const RSHAM_CDS = [98008, 114052, 108280];
const RDRUID_CDS = [740, 391528, 393763, 323764, 102342, 197721]; // 197721 = flourish
const HPAL_CDS = [31884, 216331, 31821, 6940, 633];
const HPRIEST_CDS = [64843, 200183, 47788, 265202]; // 265202 = holy word salvation
const PEVO_CDS = [363534, 359816, 370553, 382614]; // 382614 = dream breath

const ALL_CDS = [...new Set([...MW_CDS, ...RSHAM_CDS, ...RDRUID_CDS, ...HPAL_CDS, ...HPRIEST_CDS, ...PEVO_CDS])];

const CD_NAMES = {
  115310: 'Revival', 388615: 'Restoral', 322118: "Yu'lon", 325197: "Chi-Ji",
  443028: 'Celestial Conduit', 116849: 'Life Cocoon', 116680: 'TFT',
  98008: 'Spirit Link', 114052: 'Ascendance', 108280: 'Healing Tide',
  740: 'Tranquility', 391528: 'Convoke', 393763: 'Convoke', 323764: 'Convoke',
  102342: 'Ironbark', 197721: 'Flourish',
  31884: 'Avenging Wrath', 216331: 'Avenging Crusader', 31821: 'Aura Mastery',
  6940: 'BoSac', 633: 'Lay on Hands',
  64843: 'Divine Hymn', 200183: 'Apotheosis', 47788: 'Guardian Spirit',
  265202: 'Holy Word: Salvation',
  363534: 'Rewind', 359816: 'Dream Flight', 370553: 'Tip the Scales',
  382614: 'Dream Breath',
};

async function main() {
  // Get all LBV fights
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
      }
    }
  }`);

  const fights = fightData.reportData.report.fights
    .filter(f => f.encounterID === ENC_LBV && f.difficulty === 5)
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));

  // Take the 3 longest pulls
  const bestPulls = fights.slice(0, 3);
  console.log('MYTHIC LBV — YOUR TEAM\'S HEALER CD USAGE');
  console.log(`Report: ${REPORT}`);
  console.log(`Analyzing ${bestPulls.length} longest pulls\n`);

  for (const pull of bestPulls) {
    const duration = (pull.endTime - pull.startTime) / 1000;
    const fightStart = pull.startTime;
    console.log('='.repeat(90));
    console.log(`  FIGHT #${pull.id} — ${pull.kill ? 'KILL' : 'WIPE'} at ${fmt(duration)} (${duration.toFixed(0)}s)`);
    console.log('='.repeat(90));

    // Get player details
    const meta = await gql(`{
      reportData {
        report(code: "${REPORT}") {
          playerDetails(fightIDs: [${pull.id}])
        }
      }
    }`);

    const details = meta.reportData.report.playerDetails?.data?.playerDetails;
    const healers = [];
    if (details?.healers) {
      for (const p of details.healers) {
        healers.push({ name: p.name, id: p.id, type: p.type, spec: p.specs?.[0]?.spec });
      }
    }

    // Get HPS from healing table
    const healTable = await gql(`{
      reportData {
        report(code: "${REPORT}") {
          table(fightIDs: [${pull.id}], dataType: Healing)
        }
      }
    }`);
    const healEntries = healTable.reportData.report.table?.data?.entries || [];

    // Build unified timeline of ALL healer CDs
    const cdTimeline = [];

    for (const healer of healers) {
      const hEntry = healEntries.find(e => e.name === healer.name);
      const hps = hEntry ? (hEntry.total / duration).toFixed(0) : '?';

      const casts = await fetchAllEvents(REPORT, pull.id, healer.id, 'Casts');
      const cdCasts = casts
        .filter(e => e.type === 'cast' && ALL_CDS.includes(e.abilityGameID))
        .sort((a, b) => a.timestamp - b.timestamp);

      const specLabel = `${healer.spec} ${healer.type}`.replace('Restoration ', 'R').replace('Preservation ', 'P').replace('Holy ', 'H').replace('Mistweaver ', 'MW ');
      console.log(`\n  ${healer.name} (${specLabel}) — ${Number(hps).toLocaleString()} HPS`);

      if (cdCasts.length === 0) {
        console.log(`    (no major CDs used)`);
        continue;
      }

      for (const e of cdCasts) {
        const t = (e.timestamp - fightStart) / 1000;
        const name = CD_NAMES[e.abilityGameID] || `spell-${e.abilityGameID}`;
        // Skip TFT spam — just count it
        if (e.abilityGameID === 116680) continue;
        console.log(`    ${fmt(t).padStart(5)}  ${name}`);
        cdTimeline.push({ time: t, healer: healer.name, spec: specLabel, cd: name });
      }

      // TFT count
      const tftCount = cdCasts.filter(e => e.abilityGameID === 116680).length;
      if (tftCount > 0) console.log(`    TFT: ${tftCount}x`);
    }

    // Print merged timeline
    console.log(`\n  ── MERGED CD TIMELINE (fight #${pull.id}) ──`);
    cdTimeline.sort((a, b) => a.time - b.time);

    // Group into windows (CDs within 10s of each other)
    let windowStart = -100;
    let windowCDs = [];

    function flushWindow() {
      if (windowCDs.length === 0) return;
      const t = fmt(windowCDs[0].time);
      console.log(`\n    ${t}:`);
      for (const cd of windowCDs) {
        const offset = cd.time - windowCDs[0].time;
        const offsetStr = offset > 1 ? ` (+${offset.toFixed(0)}s)` : '';
        console.log(`      ${cd.healer.padEnd(14)} ${cd.cd}${offsetStr}`);
      }
    }

    for (const cd of cdTimeline) {
      if (cd.time - windowStart > 15) {
        flushWindow();
        windowStart = cd.time;
        windowCDs = [cd];
      } else {
        windowCDs.push(cd);
      }
    }
    flushWindow();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
