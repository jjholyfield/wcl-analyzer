import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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

async function fetchAllEvents(code, fightId, sourceId, dataType) {
  let allEvents = [];
  let nextPage = null;
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

async function findSourceId(code, fightId, playerName) {
  const data = await gql(`{
    reportData {
      report(code: "${code}") {
        playerDetails(fightIDs: [${fightId}])
      }
    }
  }`);
  const details = data.reportData.report.playerDetails?.data?.playerDetails;
  if (!details) return null;
  for (const role of Object.values(details)) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === playerName) return { id: p.id, detail: p };
    }
  }
  return null;
}

async function pullPlayerFight(label, playerName, code, fightId, bossName, isKill, difficulty) {
  const safeBoss = bossName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `${playerName.toLowerCase()}-${safeBoss}-${code}-f${fightId}.json`;
  const filepath = join(DATA_DIR, filename);

  if (existsSync(filepath)) {
    console.log(`  [SKIP] ${filename} already exists`);
    return filename;
  }

  const result = await findSourceId(code, fightId, playerName);
  if (!result) {
    console.log(`  [SKIP] ${playerName} not found in ${code} f${fightId}`);
    return null;
  }

  console.log(`  Pulling ${playerName} casts/buffs (sourceID: ${result.id})...`);
  const casts = await fetchAllEvents(code, fightId, result.id, 'Casts');
  const buffs = await fetchAllEvents(code, fightId, result.id, 'Buffs');
  const debuffs = await fetchAllEvents(code, fightId, result.id, 'Debuffs');
  console.log(`  Got ${casts.length} casts, ${buffs.length} buffs, ${debuffs.length} debuffs`);

  const fightInfo = await gql(`{
    reportData {
      report(code: "${code}") {
        fights(fightIDs: [${fightId}]) {
          id name startTime endTime kill difficulty
        }
      }
    }
  }`);
  const fight = fightInfo.reportData.report.fights[0];

  const output = {
    label,
    player: { id: result.id, name: playerName, spec: 'Mage' },
    playerDetail: result.detail,
    fight: {
      code,
      id: fightId,
      name: bossName,
      kill: fight.kill,
      difficulty: fight.difficulty,
      duration: fight.endTime - fight.startTime,
      startTime: fight.startTime,
      endTime: fight.endTime,
    },
    events: { casts, buffs, debuffs },
  };

  writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`  Saved: ${filename}`);
  return filename;
}

async function getTopFrostMages(encounterID, difficulty = 5) {
  const data = await gql(`{
    worldData {
      encounter(id: ${encounterID}) {
        characterRankings(
          className: "Mage"
          specName: "Frost"
          difficulty: ${difficulty}
          metric: dps
          page: 1
        )
      }
    }
  }`);
  return data.worldData.encounter.characterRankings?.rankings || [];
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════
  // PART 1: Pull Baodabao's fights we don't already have
  // ═══════════════════════════════════════════════════════════════
  console.log('═'.repeat(70));
  console.log('  PART 1: Pulling Baodabao fight data');
  console.log('═'.repeat(70));

  const baodabaoFights = [
    // Already have: Salhadaar f37 and Averzian f3
    // Need: Vorasius best wipe, Heroic Salhadaar kill, Heroic Chimaerus kill
    { code: 'XzJtFAw6n7Hhg1DP', fightId: 5, boss: 'Vorasius', kill: false, diff: 5, label: 'BAODABAO_M_VORASIUS' },
    { code: 'nJmcgbtWwLh4KrY7', fightId: 10, boss: 'Salhadaar', kill: true, diff: 4, label: 'BAODABAO_H_SALHADAAR' },
    { code: 'TtMaG8bXL4vBgDpc', fightId: 10, boss: 'Chimaerus', kill: true, diff: 4, label: 'BAODABAO_H_CHIMAERUS' },
    { code: 'nJmcgbtWwLh4KrY7', fightId: 4, boss: 'Chimaerus', kill: false, diff: 5, label: 'BAODABAO_M_CHIMAERUS' },
  ];

  for (const f of baodabaoFights) {
    console.log(`\n${f.diff === 5 ? 'M' : 'H'} ${f.boss} (${f.kill ? 'KILL' : 'WIPE'}):`);
    await pullPlayerFight(f.label, 'Baodabao', f.code, f.fightId, f.boss, f.kill, f.diff);
    await new Promise(r => setTimeout(r, 1500));
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 2: Find top Frost Mages on relevant bosses
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  PART 2: Finding top Frost Mages for comparison');
  console.log('═'.repeat(70));

  const bossesToCompare = [
    { id: 3176, name: 'Averzian' },
    { id: 3177, name: 'Vorasius' },
  ];

  for (const boss of bossesToCompare) {
    console.log(`\nTop Frost Mages on M ${boss.name}:`);
    const rankings = await getTopFrostMages(boss.id, 5);
    const top3 = rankings.slice(0, 3);
    for (const r of top3) {
      console.log(`  ${r.name}-${r.server?.name} — ${r.amount?.toFixed(0)} DPS — ${r.report?.code} f${r.report?.fightID}`);
    }

    // Pull top 1 for each boss
    if (top3.length > 0) {
      const top = top3[0];
      console.log(`\nPulling #1 ${top.name} on ${boss.name}...`);
      await pullPlayerFight(
        `TOP1_${boss.name.toUpperCase()}_${top.name}`,
        top.name,
        top.report.code,
        top.report.fightID,
        boss.name,
        true,
        5
      );
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log('\n\nAll data pulled. Ready for analysis.');
}

main().catch(e => { console.error(e); process.exit(1); });
