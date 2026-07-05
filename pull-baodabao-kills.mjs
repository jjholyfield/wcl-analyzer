import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const DATA_DIR = join(__dirname, 'data', 'dps-audit');

const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

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
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`GQL failed: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Encounter IDs for Zone 46
const ENCOUNTERS = {
  3176: 'Averzian',
  3177: 'Vorasius',
  3178: 'Vaelgor & Ezzorak',
  3179: 'Salhadaar',
  3180: 'Lightblinded Vanguard',
  3181: 'Crown of the Cosmos',
  3182: "Belo'ren",
  3183: 'Midnight Falls',
  3306: 'Chimaerus',
};

async function fetchAllEvents(code, fightId, sourceId, dataType, startTimeOverride = null) {
  let allEvents = [];
  let nextPage = startTimeOverride;
  while (true) {
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${code}") {
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
    if (result.data?.length > 0) allEvents = allEvents.concat(result.data);
    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }
  return allEvents;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Step 1: Find Baodabao's character ID
  console.log('Looking up Baodabao-Thunderlord...');
  const charData = await gql(`{
    characterData {
      character(name: "Baodabao", serverSlug: "thunderlord", serverRegion: "US") {
        id
        name
        classID
        recentReports(limit: 10) {
          data {
            code
            title
            startTime
            endTime
            zone { id name }
            fights(killType: Kills) {
              id
              name
              encounterID
              kill
              difficulty
              startTime
              endTime
              friendlyPlayers
            }
          }
        }
      }
    }
  }`);

  const char = charData.characterData.character;
  if (!char) { console.error('Character not found!'); return; }
  console.log(`Found: ${char.name} (classID: ${char.classID})`);

  // Step 2: Find all mythic kills where Baodabao participated
  const mythicKills = [];
  for (const report of char.recentReports.data) {
    if (!report.zone || report.zone.id !== 46) continue;
    for (const fight of report.fights) {
      if (fight.difficulty !== 5) continue; // mythic only
      if (!fight.kill) continue;
      const bossName = ENCOUNTERS[fight.encounterID] || fight.name;
      mythicKills.push({
        boss: bossName,
        encounterID: fight.encounterID,
        code: report.code,
        fightId: fight.id,
        duration: ((fight.endTime - fight.startTime) / 1000).toFixed(1),
        startTime: fight.startTime,
        endTime: fight.endTime,
        reportTitle: report.title,
        friendlyPlayers: fight.friendlyPlayers,
      });
    }
  }

  console.log(`\nFound ${mythicKills.length} mythic kills across recent reports:`);
  for (const k of mythicKills) {
    console.log(`  ${k.boss} — ${k.duration}s — report ${k.code} fight ${k.fightId}`);
  }

  if (mythicKills.length === 0) {
    console.log('\nNo mythic kills found. Checking heroic kills instead...');
    for (const report of char.recentReports.data) {
      if (!report.zone || report.zone.id !== 46) continue;
      for (const fight of report.fights) {
        if (fight.difficulty < 4) continue;
        if (!fight.kill) continue;
        const bossName = ENCOUNTERS[fight.encounterID] || fight.name;
        mythicKills.push({
          boss: bossName,
          encounterID: fight.encounterID,
          code: report.code,
          fightId: fight.id,
          duration: ((fight.endTime - fight.startTime) / 1000).toFixed(1),
          startTime: fight.startTime,
          endTime: fight.endTime,
          reportTitle: report.title,
          difficulty: fight.difficulty,
          friendlyPlayers: fight.friendlyPlayers,
        });
      }
    }
    console.log(`Found ${mythicKills.length} heroic+ kills`);
    for (const k of mythicKills) {
      console.log(`  ${k.boss} — ${k.duration}s — diff ${k.difficulty} — report ${k.code} fight ${k.fightId}`);
    }
  }

  // Step 3: For each kill, find Baodabao's sourceID and pull cast/buff data
  // Deduplicate by boss (take best/latest kill per boss)
  const bestKills = {};
  for (const k of mythicKills) {
    if (!bestKills[k.encounterID] || parseFloat(k.duration) < parseFloat(bestKills[k.encounterID].duration)) {
      bestKills[k.encounterID] = k;
    }
  }

  const killsToPull = Object.values(bestKills);
  console.log(`\nPulling data for ${killsToPull.length} unique boss kills...`);

  for (const kill of killsToPull) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${kill.boss} — ${kill.duration}s — report ${kill.code} fight ${kill.fightId}`);

    // Find Baodabao's sourceID from playerDetails
    const detailData = await gql(`{
      reportData {
        report(code: "${kill.code}") {
          playerDetails(fightIDs: [${kill.fightId}])
        }
      }
    }`);

    const playerDetails = detailData.reportData.report.playerDetails?.data?.playerDetails;
    let sourceId = null;
    let playerDetail = null;

    if (playerDetails) {
      for (const role of Object.values(playerDetails)) {
        if (!Array.isArray(role)) continue;
        for (const p of role) {
          if (p.name === 'Baodabao') {
            sourceId = p.id;
            playerDetail = p;
            break;
          }
        }
        if (sourceId) break;
      }
    }

    if (!sourceId) {
      console.log('  Could not find Baodabao in this fight, skipping...');
      continue;
    }

    console.log(`  sourceID: ${sourceId}, spec: ${playerDetail.icon || playerDetail.type}`);

    // Pull casts, buffs, debuffs
    console.log('  Pulling casts...');
    const casts = await fetchAllEvents(kill.code, kill.fightId, sourceId, 'Casts');
    console.log(`  Got ${casts.length} cast events`);

    console.log('  Pulling buffs...');
    const buffs = await fetchAllEvents(kill.code, kill.fightId, sourceId, 'Buffs');
    console.log(`  Got ${buffs.length} buff events`);

    console.log('  Pulling debuffs...');
    const debuffs = await fetchAllEvents(kill.code, kill.fightId, sourceId, 'Debuffs');
    console.log(`  Got ${debuffs.length} debuff events`);

    const output = {
      label: `BAODABAO_${kill.boss.replace(/[^a-zA-Z]/g, '_').toUpperCase()}`,
      player: { id: sourceId, name: 'Baodabao', server: 'Thunderlord', spec: 'Mage' },
      playerDetail: playerDetail || {},
      fight: {
        code: kill.code,
        id: kill.fightId,
        name: kill.boss,
        encounterID: kill.encounterID,
        kill: true,
        duration: parseFloat(kill.duration) * 1000,
        startTime: kill.startTime,
        endTime: kill.endTime,
      },
      events: { casts, buffs, debuffs },
    };

    const safeFileName = kill.boss.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const filename = `baodabao-${safeFileName}-${kill.code}-f${kill.fightId}.json`;
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(output, null, 2));
    console.log(`  Saved: data/dps-audit/${filename}`);

    await new Promise(r => setTimeout(r, 1500));
  }

  // Also save the kill list
  writeFileSync(join(DATA_DIR, 'baodabao-kills.json'), JSON.stringify({ mythicKills, bestKills: killsToPull }, null, 2));
  console.log('\nSaved kill list: data/dps-audit/baodabao-kills.json');
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
