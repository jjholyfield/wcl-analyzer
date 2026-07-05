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

async function fetchAllEvents(code, fightID, sourceID, filterExpression, useTarget = false) {
  let allEvents = [];
  let nextPageTimestamp = null;

  while (true) {
    const startArg = nextPageTimestamp ? `, startTime: ${nextPageTimestamp}` : '';
    const sourceField = useTarget ? 'targetID' : 'sourceID';
    const data = await gql(`
      query($code: String!) {
        reportData {
          report(code: $code) {
            events(fightIDs: [${fightID}], ${sourceField}: ${sourceID}, filterExpression: "${filterExpression}"${startArg}) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `, { code });

    const events = data.reportData.report.events;
    allEvents = allEvents.concat(events.data);
    if (!events.nextPageTimestamp) break;
    nextPageTimestamp = events.nextPageTimestamp;
  }

  return allEvents;
}

const spellNames = JSON.parse(readFileSync('spell-names.json', 'utf8'));
function spellName(id) { return spellNames[String(id)] || `Unknown(${id})`; }

// ═══════════════════════════════════════════════════════════════════
// PART 1: Timeline analysis of Destval's Flash Heals vs damage
// ═══════════════════════════════════════════════════════════════════

console.log('Loading Destval data...\n');
const destvalData = JSON.parse(readFileSync('data/destval-mplus/seat-12-raw.json', 'utf8'));

const { casts, healing, damage, buffs, dmgTaken } = destvalData;

// Get fight start time (first event timestamp)
const fightStart = Math.min(...casts.map(e => e.timestamp));
const fightEnd = Math.max(...casts.map(e => e.timestamp));
const fightDuration = (fightEnd - fightStart) / 1000;

function toSec(ts) { return ((ts - fightStart) / 1000).toFixed(0); }

// Break fight into 10-second windows
const WINDOW = 10000; // 10 seconds
const windows = [];
for (let t = fightStart; t < fightEnd; t += WINDOW) {
  const windowEnd = t + WINDOW;

  // Damage taken in this window
  const windowDmgTaken = dmgTaken.filter(e => e.timestamp >= t && e.timestamp < windowEnd);
  const totalDmgTaken = windowDmgTaken.reduce((sum, e) => sum + (e.amount || 0) + (e.absorbed || 0), 0);

  // Flash Heals in this window
  const windowFlash = casts.filter(e => e.timestamp >= t && e.timestamp < windowEnd && e.type === 'cast' && e.abilityGameID === 2061);

  // Radiance in this window
  const windowRadiance = casts.filter(e => e.timestamp >= t && e.timestamp < windowEnd && e.type === 'cast' && e.abilityGameID === 194509);

  // Evangelism in this window
  const windowEv = casts.filter(e => e.timestamp >= t && e.timestamp < windowEnd && e.type === 'cast' && e.abilityGameID === 246287);

  windows.push({
    start: toSec(t),
    dmgTaken: totalDmgTaken,
    flashHeals: windowFlash.length,
    radiance: windowRadiance.length,
    evangelism: windowEv.length,
  });
}

// Find the windows with Flash Heal usage and show damage context
console.log('═'.repeat(70));
console.log('  DESTVAL TIMELINE — Flash Heal clusters vs Incoming Damage');
console.log('═'.repeat(70));
console.log('  (10-second windows where Flash Heal was cast)\n');
console.log('  Time     | Dmg Taken  | Flash | Radiance | Evang | Pattern');
console.log('  ' + '─'.repeat(65));

let flashBeforeDmg = 0;
let flashAfterDmg = 0;

for (let i = 0; i < windows.length; i++) {
  const w = windows[i];
  if (w.flashHeals === 0) continue;

  // Check if radiance was cast in the 10s BEFORE this window
  const prevWindow = windows[i - 1];
  const hadPreRamp = prevWindow && prevWindow.radiance > 0;

  let pattern = '';
  if (w.dmgTaken > 500000 && !hadPreRamp && w.flashHeals >= 2) {
    pattern = '<-- REACTIVE (no pre-ramp)';
    flashAfterDmg += w.flashHeals;
  } else if (hadPreRamp) {
    pattern = '(had ramp)';
    flashBeforeDmg += w.flashHeals;
  } else if (w.dmgTaken < 200000) {
    pattern = '(low pressure)';
  }

  const dmgStr = (w.dmgTaken / 1000).toFixed(0) + 'K';
  console.log(`  ${w.start.padStart(5)}s   | ${dmgStr.padStart(8)}  |   ${w.flashHeals}   |    ${w.radiance}     |   ${w.evangelism}   | ${pattern}`);
}

console.log('\n  Flash Heals in windows with pre-ramp: ' + flashBeforeDmg);
console.log('  Flash Heals in reactive windows (no ramp, high dmg): ' + flashAfterDmg);

// ═══════════════════════════════════════════════════════════════════
// PART 2: Find top Disc Priest for comparison
// ═══════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('  FINDING TOP DISC PRIEST FOR COMPARISON');
console.log('═'.repeat(70));

// Search WCL rankings for Disc Priest in M+ Seat of the Triumvirate
// encounterID for Seat in M+ — let's use the rankings API
console.log('\nSearching for top Disc Priest rankings in Seat of the Triumvirate...\n');

// WCL M+ rankings use a different query structure
const rankData = await gql(`
  query {
    worldData {
      encounter(id: 13355) {
        name
        characterRankings(
          className: "Priest"
          specName: "Discipline"
          metric: hps
          difficulty: 12
          leaderboard: LogsOnly
        )
      }
    }
  }
`).catch(async () => {
  // If encounter ID doesn't work, try the rankings endpoint differently
  // Let's try finding M+ rankings via character rankings
  console.log('  Trying alternative ranking query...');
  return null;
});

if (rankData && rankData.worldData?.encounter) {
  console.log(`  Found encounter: ${rankData.worldData.encounter.name}`);
  const rankings = rankData.worldData.encounter.characterRankings;
  console.log(JSON.stringify(rankings, null, 2).slice(0, 2000));
} else {
  console.log('  Standard encounter ranking failed, trying M+ leaderboard approach...');

  // Try getting M+ rankings directly
  const mplusRanks = await gql(`
    query {
      worldData {
        encounter(id: 62516) {
          name
          id
        }
      }
    }
  `).catch(() => null);

  if (mplusRanks) {
    console.log('  Encounter lookup:', JSON.stringify(mplusRanks, null, 2));
  }
}

// Alternative: search recent reports for Disc Priests in Seat
console.log('\n  Searching recent public reports for top Disc Priests in Seat...');

const searchResult = await gql(`
  query {
    reportData {
      reports(guildID: 0, limit: 10, zoneID: 42) {
        data {
          code
          title
          startTime
        }
      }
    }
  }
`).catch(() => null);

// Let's try the character rankings for M+ specifically
console.log('\n  Trying M+ character rankings for Disc Priest...');
const discRankings = await gql(`
  query {
    characterData {
      character(name: "Destval", serverSlug: "area-52", serverRegion: "us") {
        encounterRankings(encounterID: 62516, difficulty: 12, specName: "Discipline", className: "Priest")
      }
    }
  }
`).catch(e => { console.log('  Rankings query error:', e.message.slice(0, 200)); return null; });

if (discRankings) {
  console.log(JSON.stringify(discRankings, null, 2).slice(0, 1000));
}

// Let's try a different approach - look at the other recent report which has more data
console.log('\n  Checking your 5/5 session (longer session, more keys)...');
const sessionReport = await gql(`
  query {
    reportData {
      report(code: "YVQ68WvjrH2dpKx9") {
        title
        fights {
          id
          encounterID
          name
          kill
          keystoneLevel
          startTime
          endTime
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
`);

const sessReport = sessionReport.reportData.report;
console.log(`\n  ${sessReport.title}`);
console.log(`  Total fights: ${sessReport.fights.length}`);
console.log('');

const seatFights = sessReport.fights.filter(f => f.name && f.name.includes('Seat'));
const allDungeonFights = sessReport.fights.filter(f => f.keystoneLevel);

console.log('  M+ dungeons in this session:');
for (const f of allDungeonFights) {
  const dur = ((f.endTime - f.startTime) / 1000 / 60).toFixed(1);
  console.log(`    [${f.id}] ${f.name} +${f.keystoneLevel} — ${f.kill ? 'TIMED' : 'DEPLETED'} (${dur}min)`);
}

// Find other Disc Priests in the report
const priests = sessReport.masterData.actors.filter(a => a.subType === 'Priest');
console.log('\n  Priests in session:', priests.map(p => `${p.name}-${p.server}`).join(', '));

// Now let's find a top Disc via the WCL rankings API for M+
console.log('\n\n  Fetching WCL M+ Disc Priest rankings (HPS metric)...');
const mPlusRankings = await gql(`
  query {
    worldData {
      encounter(id: 62516) {
        name
        id
        characterRankings(
          className: "Priest"
          specName: "Discipline"
          metric: hps
        )
      }
    }
  }
`).catch(async (e) => {
  console.log('  62516 failed:', e.message.slice(0, 150));

  // Try to find the right encounter ID for Seat M+
  // Let's look at what zone/encounter IDs are available
  const zones = await gql(`
    query {
      worldData {
        zones {
          id
          name
          encounters {
            id
            name
          }
        }
      }
    }
  `).catch(() => null);

  if (zones) {
    const mplusZones = zones.worldData.zones.filter(z =>
      z.name.toLowerCase().includes('mythic') || z.name.toLowerCase().includes('season')
    );
    for (const z of mplusZones.slice(0, 5)) {
      console.log(`  Zone ${z.id}: ${z.name}`);
      for (const e of (z.encounters || []).slice(0, 10)) {
        if (e.name.toLowerCase().includes('seat') || e.name.toLowerCase().includes('triumph')) {
          console.log(`    >>> MATCH: Encounter ${e.id}: ${e.name}`);
        }
      }
    }
    // Print all encounters from the current M+ season
    const currentSeason = mplusZones.find(z => z.name.includes('Season 1') && z.encounters?.length > 0);
    if (currentSeason) {
      console.log(`\n  Current M+ Season: ${currentSeason.name} (Zone ${currentSeason.id})`);
      for (const e of currentSeason.encounters) {
        console.log(`    Encounter ${e.id}: ${e.name}`);
      }
    }
  }
  return null;
});

if (mPlusRankings) {
  console.log(JSON.stringify(mPlusRankings, null, 2).slice(0, 2000));
}
