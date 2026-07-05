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

const REPORT = 'by6mKkdwXGcqQtRW';
const FIGHT = 30; // best pull

async function main() {
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) {
    spellNames[a.gameID] = a.name;
  }

  // Check ALL DPS players for consumable usage
  const allPlayers = [...(details?.dps || []), ...(details?.healers || []), ...(details?.tanks || [])];

  const consumableKeywords = ['healthstone', 'potion', 'health potion', 'silvermoon', 'recklessness', 'phial', 'flask', 'cauldron'];

  console.log(`CONSUMABLE USAGE — Fight #${FIGHT} (${fmt(duration)})`);
  console.log('='.repeat(90));

  for (const player of allPlayers) {
    const casts = await fetchAllEvents(REPORT, FIGHT, player.id, 'Casts');
    const castEvents = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

    const consumables = [];
    for (const e of castEvents) {
      const name = (spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`).toLowerCase();
      if (consumableKeywords.some(k => name.includes(k)) ||
          name.includes('healthstone') || name.includes('potion') ||
          name.includes('gift of the naaru') || name.includes('desperate prayer') ||
          name.includes('health stone')) {
        consumables.push({
          name: spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`,
          time: (e.timestamp - fightStart) / 1000,
        });
      }
    }

    // Also check healing received for healthstone/potion heals
    const healing = await fetchAllEvents(REPORT, FIGHT, player.id, 'Healing');
    const selfHeals = healing.filter(e =>
      e.sourceID === player.id && e.targetID === player.id
    );

    const potionHeals = selfHeals.filter(e => {
      const name = (spellNames[e.abilityGameID] || '').toLowerCase();
      return name.includes('potion') || name.includes('healthstone') || name.includes('silvermoon');
    });

    const spec = `${player.specs?.[0]?.spec || '?'} ${player.type}`;
    const role = details?.dps?.some(d => d.id === player.id) ? 'DPS' :
                 details?.healers?.some(d => d.id === player.id) ? 'HEAL' : 'TANK';

    if (role === 'DPS') {
      const potionCasts = castEvents.filter(e => {
        const name = (spellNames[e.abilityGameID] || '').toLowerCase();
        return name.includes('potion') || name.includes('healthstone');
      });

      const potionNames = potionCasts.map(e => ({
        name: spellNames[e.abilityGameID],
        time: fmt((e.timestamp - fightStart) / 1000),
      }));

      const hsCount = potionCasts.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('healthstone')).length;
      const dpsPotion = potionCasts.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('recklessness')).length;
      const healPotion = potionCasts.filter(e => {
        const name = (spellNames[e.abilityGameID] || '').toLowerCase();
        return name.includes('silvermoon') || (name.includes('potion') && name.includes('health'));
      }).length;

      console.log(`  ${player.name.padEnd(16)} ${spec.padEnd(24)} HS:${hsCount} DPSpot:${dpsPotion} HealPot:${healPotion}`);
      if (potionNames.length > 0) {
        for (const p of potionNames) {
          console.log(`    ${p.time} ${p.name}`);
        }
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
