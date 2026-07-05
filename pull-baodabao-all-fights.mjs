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

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Get Baodabao's recent reports with ALL fights (not just kills)
  console.log('Fetching Baodabao recent reports (all fights)...');
  const charData = await gql(`{
    characterData {
      character(name: "Baodabao", serverSlug: "thunderlord", serverRegion: "US") {
        id name classID
        recentReports(limit: 15) {
          data {
            code title startTime
            zone { id name }
            fights {
              id name encounterID kill difficulty
              startTime endTime bossPercentage
              friendlyPlayers
            }
          }
        }
      }
    }
  }`);

  const char = charData.characterData.character;
  console.log(`Found: ${char.name}\n`);

  // Collect all Zone 46 (current tier) fights, mythic or heroic, kills and wipes
  const allFights = [];
  for (const report of char.recentReports.data) {
    if (!report.zone || report.zone.id !== 46) continue;
    for (const fight of report.fights) {
      if (fight.difficulty < 4) continue; // heroic+ only
      if (!fight.encounterID) continue; // skip trash
      const dur = (fight.endTime - fight.startTime) / 1000;
      if (dur < 30) continue; // skip very short wipes
      allFights.push({
        boss: ENCOUNTERS[fight.encounterID] || fight.name,
        encounterID: fight.encounterID,
        difficulty: fight.difficulty,
        diffLabel: fight.difficulty === 5 ? 'M' : 'H',
        kill: fight.kill,
        code: report.code,
        fightId: fight.id,
        duration: dur.toFixed(1),
        startTime: fight.startTime,
        endTime: fight.endTime,
        bossPercentage: fight.bossPercentage,
        reportTitle: report.title,
      });
    }
  }

  console.log(`Found ${allFights.length} heroic+ boss fights across recent reports:\n`);

  // Group by boss and difficulty
  const grouped = {};
  for (const f of allFights) {
    const key = `${f.diffLabel} ${f.boss}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  for (const [key, fights] of Object.entries(grouped).sort()) {
    const kills = fights.filter(f => f.kill).length;
    const wipes = fights.length - kills;
    console.log(`  ${key}: ${kills} kills, ${wipes} wipes`);
    for (const f of fights) {
      const pct = f.bossPercentage != null ? ` (${(f.bossPercentage / 100).toFixed(1)}%)` : '';
      console.log(`    ${f.kill ? 'KILL' : 'WIPE'} ${f.duration}s${pct} — ${f.code} f${f.fightId}`);
    }
  }

  // Pick best/longest fights to pull for each mythic boss (prefer kills, then longest wipes)
  const toPull = [];
  for (const [key, fights] of Object.entries(grouped)) {
    if (!key.startsWith('M ')) continue; // mythic only for audit

    // Sort: kills first, then by duration descending (longer = more data)
    const sorted = fights.sort((a, b) => {
      if (a.kill !== b.kill) return b.kill - a.kill;
      return parseFloat(b.duration) - parseFloat(a.duration);
    });

    toPull.push(sorted[0]); // take best fight per boss
  }

  console.log(`\n\nWill pull cast data for ${toPull.length} mythic fights:`);
  for (const f of toPull) {
    console.log(`  ${f.boss} — ${f.kill ? 'KILL' : 'WIPE'} ${f.duration}s — ${f.code} f${f.fightId}`);
  }

  // Save summary
  writeFileSync(join(DATA_DIR, 'baodabao-all-fights.json'), JSON.stringify({ allFights, toPull }, null, 2));
  console.log('\nSaved: data/dps-audit/baodabao-all-fights.json');
}

main().catch(e => { console.error(e); process.exit(1); });
