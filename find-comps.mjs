import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  return json.data;
}

let ENCOUNTER_ID = 3179;

// ── Step 1: Get RSham rankings ──
async function getRShamRankings(pages = 5) {
  const allRankings = [];
  for (let page = 1; page <= pages; page++) {
    console.log(`Fetching RSham rankings page ${page}...`);
    const data = await gql(`{
      worldData {
        encounter(id: ${ENCOUNTER_ID}) {
          characterRankings(
            className: "Shaman"
            specName: "Restoration"
            difficulty: 5
            metric: hps
            page: ${page}
          )
        }
      }
    }`);
    const rankings = data.worldData.encounter.characterRankings;
    const parsed = typeof rankings === 'string' ? JSON.parse(rankings) : rankings;
    if (parsed.rankings && parsed.rankings.length > 0) {
      allRankings.push(...parsed.rankings);
      console.log(`  Got ${parsed.rankings.length} rankings (total: ${allRankings.length})`);
    } else {
      console.log(`  No more rankings on page ${page}`);
      break;
    }
  }
  return allRankings;
}

// ── Step 2: Get player details for a report+fight ──
async function getPlayerDetails(code, fightId) {
  const data = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          fights(fightIDs: [${fightId}]) {
            id
            name
            kill
            difficulty
            startTime
            endTime
          }
          playerDetails(fightIDs: [${fightId}])
        }
      }
    }
  `, { code });
  return data.reportData.report;
}

function normalizeSpec(icon) {
  // icon format: "Paladin-Holy", "Shaman-Restoration", "Monk-Mistweaver", "Evoker-Preservation"
  if (!icon) return 'Unknown';
  const map = {
    'Paladin-Holy': 'Holy Paladin',
    'Shaman-Restoration': 'Restoration Shaman',
    'Monk-Mistweaver': 'Mistweaver Monk',
    'Evoker-Preservation': 'Preservation Evoker',
    'Druid-Restoration': 'Restoration Druid',
    'Priest-Discipline': 'Discipline Priest',
    'Priest-Holy': 'Holy Priest',
  };
  return map[icon] || icon;
}

// ── Main ──
async function main() {
  const BOSS = process.argv[2] || 'salhadaar';
  const ENCOUNTER_MAP = {
    'salhadaar': { id: 3179, name: 'Salhadaar' },
    've': { id: 3178, name: 'Vaelgor & Ezzorak' },
    'averzian': { id: 3176, name: 'Averzian' },
    'vorasius': { id: 3177, name: 'Vorasius' },
    'lbv': { id: 3180, name: 'Lightblinded Vanguard' },
    'cosmos': { id: 3181, name: 'Crown of the Cosmos' },
    'beloren': { id: 3182, name: "Belo'ren" },
    'midnight': { id: 3183, name: 'Midnight Falls' },
    'chimaerus': { id: 3306, name: 'Chimaerus' },
  };
  const encounter = ENCOUNTER_MAP[BOSS];
  if (!encounter) {
    console.error(`Unknown boss: ${BOSS}. Options: ${Object.keys(ENCOUNTER_MAP).join(', ')}`);
    process.exit(1);
  }
  ENCOUNTER_ID = encounter.id;

  console.log(`=== Finding Mythic ${encounter.name} kills with HPal + RSham comp ===\n`);

  // Step 1: Get RSham rankings
  const rankings = await getRShamRankings(5);
  console.log(`\nTotal RSham rankings: ${rankings.length}\n`);

  // Extract unique report+fight combos
  const seen = new Set();
  const reportFights = [];
  for (const r of rankings) {
    const key = `${r.report.code}-${r.report.fightID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reportFights.push({
      code: r.report.code,
      fightId: r.report.fightID,
      rshamName: r.name,
      rshamServer: r.server?.slug || '',
    });
  }
  console.log(`Unique report+fight combos: ${reportFights.length}\n`);

  // Step 2: Check each report's healing comp
  const matches = [];
  const TARGET_SPECS = ['Holy Paladin', 'Restoration Shaman', 'Mistweaver Monk', 'Preservation Evoker'];

  for (let i = 0; i < reportFights.length; i++) {
    const rf = reportFights[i];
    process.stdout.write(`[${i + 1}/${reportFights.length}] ${rf.code} f${rf.fightId}... `);

    try {
      const report = await getPlayerDetails(rf.code, rf.fightId);

      // Navigate the nested playerDetails structure
      let pd = report.playerDetails;
      if (typeof pd === 'string') pd = JSON.parse(pd);
      // It can be { data: { playerDetails: { healers: [...], tanks: [...], dps: [...] } } }
      const inner = pd?.data?.playerDetails || pd?.playerDetails || pd;
      const healersList = inner?.healers || [];

      const healers = healersList.map(h => ({
        name: h.name,
        server: h.server,
        type: h.type,
        icon: h.icon,
        spec: normalizeSpec(h.icon),
      }));

      const specNames = healers.map(h => h.spec);

      const hasHPal = specNames.includes('Holy Paladin');
      const hasRSham = specNames.includes('Restoration Shaman');
      const hasMW = specNames.includes('Mistweaver Monk');
      const hasPEvo = specNames.includes('Preservation Evoker');

      const matchCount = [hasHPal, hasRSham, hasMW, hasPEvo].filter(Boolean).length;

      if (hasHPal && hasRSham) {
        const fight = report.fights?.[0];
        const duration = fight ? ((fight.endTime - fight.startTime) / 1000).toFixed(0) : '?';
        matches.push({
          code: rf.code,
          fightId: rf.fightId,
          matchCount,
          hasHPal, hasRSham, hasMW, hasPEvo,
          healers,
          specNames,
          duration: parseInt(duration),
          fight,
        });
        console.log(`MATCH (${matchCount}/4)! ${specNames.join(', ')}`);
      } else {
        console.log(`${specNames.join(', ') || '(no healers found)'}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message.substring(0, 80)}`);
    }

    // Small delay to avoid rate limiting
    if (i % 15 === 14) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`RESULTS: Found ${matches.length} kills with HPal + RSham`);
  console.log(`${'='.repeat(70)}\n`);

  // Sort by match count (best matches first), then by duration (faster kills first)
  matches.sort((a, b) => b.matchCount - a.matchCount || a.duration - b.duration);

  for (const m of matches) {
    const compParts = [];
    if (m.hasHPal) compParts.push('HPal');
    if (m.hasRSham) compParts.push('RSham');
    if (m.hasMW) compParts.push('MW');
    if (m.hasPEvo) compParts.push('PEvo');
    const otherSpecs = m.specNames.filter(s => !TARGET_SPECS.includes(s));
    if (otherSpecs.length) compParts.push(...otherSpecs);

    console.log(`[${m.matchCount}/4] ${m.code} fight ${m.fightId} (${m.duration}s)`);
    console.log(`  Comp: ${compParts.join(' + ')}`);
    for (const h of m.healers) {
      console.log(`    ${h.spec}: ${h.name}-${h.server}`);
    }
    console.log();
  }

  // Save results
  const outDir = join(__dirname, 'data', 'comp-search');
  mkdirSync(outDir, { recursive: true });
  const filename = `matches-${BOSS}.json`;
  writeFileSync(join(outDir, filename), JSON.stringify(matches, null, 2));
  console.log(`Saved ${matches.length} matches to data/comp-search/${filename}`);
}

main().catch(e => { console.error(e); process.exit(1); });
