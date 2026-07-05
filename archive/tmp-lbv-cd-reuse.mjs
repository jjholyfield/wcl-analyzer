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

// Track DH and Tranq specifically, plus all other big CDs
const TRACK = {
  64843: 'Divine Hymn',
  740: 'Tranquility',
  200183: 'Apotheosis',
  47788: 'Guardian Spirit',
  391528: 'Convoke', 393763: 'Convoke', 323764: 'Convoke',
  102342: 'Ironbark',
  114052: 'Ascendance',
  98008: 'Spirit Link',
  363534: 'Rewind',
  359816: 'Dream Flight',
  370553: 'Tip the Scales',
};
const trackIds = Object.keys(TRACK).map(Number);

async function main() {
  const fightData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
        playerDetails(fightIDs: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40, 41])
      }
    }
  }`);

  const allFights = fightData.reportData.report.fights
    .filter(f => f.encounterID === ENC_LBV && f.difficulty === 5)
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));

  const details = fightData.reportData.report.playerDetails?.data?.playerDetails;

  // Find Voidheart and Silencio IDs
  let voidId = null, silId = null;
  if (details?.healers) {
    for (const p of details.healers) {
      if (p.name.startsWith('Void')) voidId = p.id;
      if (p.name.startsWith('Sìl') || p.name.startsWith('Sil')) silId = p.id;
    }
  }

  console.log('DID VOIDHEART & SILENCIO RE-USE DH/TRANQ WHEN THEY CAME BACK UP?');
  console.log(`Voidheart ID: ${voidId}, Silencio ID: ${silId}`);
  console.log('Only showing pulls that lasted 150s+ (long enough for CDs to come back)\n');
  console.log('='.repeat(90));

  // Check all pulls 150s+ where DH/Tranq could come back
  const longPulls = allFights.filter(f => (f.endTime - f.startTime) / 1000 >= 150);

  for (const pull of longPulls) {
    const duration = (pull.endTime - pull.startTime) / 1000;
    const fightStart = pull.startTime;

    console.log(`\nFight #${pull.id} — WIPE at ${fmt(duration)} (${duration.toFixed(0)}s)`);

    // Voidheart - DH
    if (voidId) {
      const casts = await fetchAllEvents(REPORT, pull.id, voidId, 'Casts');
      const dhCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 64843)
        .sort((a, b) => a.timestamp - b.timestamp);
      const apoCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 200183)
        .sort((a, b) => a.timestamp - b.timestamp);
      const gsCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 47788)
        .sort((a, b) => a.timestamp - b.timestamp);

      const dhTimes = dhCasts.map(e => (e.timestamp - fightStart) / 1000);
      const apoTimes = apoCasts.map(e => (e.timestamp - fightStart) / 1000);
      const gsTimes = gsCasts.map(e => (e.timestamp - fightStart) / 1000);

      console.log(`  Voidheart:`);
      console.log(`    Divine Hymn:  ${dhTimes.length}x — ${dhTimes.map(t => fmt(t)).join(', ') || 'never'}`);
      console.log(`    Apotheosis:   ${apoTimes.length}x — ${apoTimes.map(t => fmt(t)).join(', ') || 'never'}`);
      console.log(`    Guardian Spr: ${gsTimes.length}x — ${gsTimes.map(t => fmt(t)).join(', ') || 'never'}`);

      if (dhTimes.length === 1 && dhTimes[0] < 30) {
        const cdBack = dhTimes[0] + 160; // ~160s real CD
        if (cdBack < duration) {
          console.log(`    ⚠️ DH back up at ~${fmt(cdBack)} — fight lasted ${fmt(duration)} — HAD ${(duration - cdBack).toFixed(0)}s to use it. DID NOT.`);
        } else {
          console.log(`    → DH wouldn't be back before wipe (back at ~${fmt(cdBack)})`);
        }
      } else if (dhTimes.length >= 2) {
        console.log(`    ✓ Used DH ${dhTimes.length}x — gap: ${(dhTimes[1] - dhTimes[0]).toFixed(0)}s`);
      }
    }

    // Silencio - Tranq
    if (silId) {
      const casts = await fetchAllEvents(REPORT, pull.id, silId, 'Casts');
      const tranqCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 740)
        .sort((a, b) => a.timestamp - b.timestamp);
      const convokeCasts = casts.filter(e => e.type === 'cast' && [391528, 393763, 323764].includes(e.abilityGameID))
        .sort((a, b) => a.timestamp - b.timestamp);
      const ibCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 102342)
        .sort((a, b) => a.timestamp - b.timestamp);

      const tranqTimes = tranqCasts.map(e => (e.timestamp - fightStart) / 1000);
      const convokeTimes = convokeCasts.map(e => (e.timestamp - fightStart) / 1000);
      const ibTimes = ibCasts.map(e => (e.timestamp - fightStart) / 1000);

      console.log(`  Silencio:`);
      console.log(`    Tranquility:  ${tranqTimes.length}x — ${tranqTimes.map(t => fmt(t)).join(', ') || 'never'}`);
      console.log(`    Convoke:      ${convokeTimes.length}x — ${convokeTimes.map(t => fmt(t)).join(', ') || 'never'}`);
      console.log(`    Ironbark:     ${ibTimes.length}x — ${ibTimes.map(t => fmt(t)).join(', ') || 'never'}`);

      if (tranqTimes.length === 1 && tranqTimes[0] < 30) {
        const cdBack = tranqTimes[0] + 160;
        if (cdBack < duration) {
          console.log(`    ⚠️ Tranq back up at ~${fmt(cdBack)} — fight lasted ${fmt(duration)} — HAD ${(duration - cdBack).toFixed(0)}s to use it. DID NOT.`);
        } else {
          console.log(`    → Tranq wouldn't be back before wipe (back at ~${fmt(cdBack)})`);
        }
      } else if (tranqTimes.length >= 2) {
        console.log(`    ✓ Used Tranq ${tranqTimes.length}x — gap: ${(tranqTimes[1] - tranqTimes[0]).toFixed(0)}s`);
      }
    }
  }

  // Now check ALL pulls — how often is DH/Tranq used at 0:20 vs held?
  console.log(`\n${'='.repeat(90)}`);
  console.log('SUMMARY: DH & TRANQ FIRST USE ACROSS ALL PULLS');
  console.log('='.repeat(90));

  let dhFirstUse = [];
  let tranqFirstUse = [];

  for (const pull of allFights) {
    const fightStart = pull.startTime;
    const duration = (pull.endTime - pull.startTime) / 1000;

    if (voidId) {
      const casts = await fetchAllEvents(REPORT, pull.id, voidId, 'Casts');
      const dhCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 64843);
      if (dhCasts.length > 0) {
        const first = (dhCasts[0].timestamp - fightStart) / 1000;
        dhFirstUse.push({ fight: pull.id, time: first, duration, total: dhCasts.length });
      }
    }

    if (silId) {
      const casts = await fetchAllEvents(REPORT, pull.id, silId, 'Casts');
      const tranqCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 740);
      if (tranqCasts.length > 0) {
        const first = (tranqCasts[0].timestamp - fightStart) / 1000;
        tranqFirstUse.push({ fight: pull.id, time: first, duration, total: tranqCasts.length });
      }
    }
  }

  console.log(`\n  Voidheart — Divine Hymn first use (${dhFirstUse.length} pulls):`);
  const dhEarly = dhFirstUse.filter(d => d.time < 30).length;
  const dhLate = dhFirstUse.filter(d => d.time >= 30).length;
  console.log(`    Used in first 30s: ${dhEarly}/${dhFirstUse.length} pulls (${((dhEarly/dhFirstUse.length)*100).toFixed(0)}%)`);
  console.log(`    Held past 30s:    ${dhLate}/${dhFirstUse.length} pulls`);
  const dhReused = dhFirstUse.filter(d => d.total >= 2).length;
  console.log(`    Used 2+ times:    ${dhReused}/${dhFirstUse.length} pulls`);

  console.log(`\n  Silencio — Tranquility first use (${tranqFirstUse.length} pulls):`);
  const tranqEarly = tranqFirstUse.filter(d => d.time < 30).length;
  const tranqLate = tranqFirstUse.filter(d => d.time >= 30).length;
  console.log(`    Used in first 30s: ${tranqEarly}/${tranqFirstUse.length} pulls (${((tranqEarly/tranqFirstUse.length)*100).toFixed(0)}%)`);
  console.log(`    Held past 30s:    ${tranqLate}/${tranqFirstUse.length} pulls`);
  const tranqReused = tranqFirstUse.filter(d => d.total >= 2).length;
  console.log(`    Used 2+ times:    ${tranqReused}/${tranqFirstUse.length} pulls`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
