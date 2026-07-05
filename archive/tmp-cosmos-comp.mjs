import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();
const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

let cachedToken = null, tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      console.log('  Rate limited, waiting 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return gql(query, variables);
    }
    throw new Error(`GraphQL failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  return json.data;
}

const ENCOUNTER_ID = 3181; // Crown of the Cosmos
const TARGET_SPECS = ['Holy Paladin', 'Restoration Shaman', 'Mistweaver Monk', 'Restoration Druid'];

function normalizeSpec(icon) {
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

async function getRankings(className, specName, pages = 5) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    console.log(`Fetching ${specName} ${className} rankings page ${page}...`);
    const data = await gql(`{
      worldData {
        encounter(id: ${ENCOUNTER_ID}) {
          characterRankings(
            className: "${className}"
            specName: "${specName}"
            difficulty: 5
            metric: hps
            page: ${page}
          )
        }
      }
    }`);
    const rankings = data.worldData.encounter.characterRankings;
    const parsed = typeof rankings === 'string' ? JSON.parse(rankings) : rankings;
    if (parsed.rankings?.length > 0) {
      all.push(...parsed.rankings);
      console.log(`  Got ${parsed.rankings.length} (total: ${all.length})`);
    } else break;
  }
  return all;
}

async function getPlayerDetails(code, fightId) {
  const data = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          fights(fightIDs: [${fightId}]) { id name kill difficulty startTime endTime }
          playerDetails(fightIDs: [${fightId}])
        }
      }
    }
  `, { code });
  return data.reportData.report;
}

async function main() {
  // Search from RDruid rankings (rarest spec in comp for Crown)
  console.log('=== Finding Mythic Crown of the Cosmos kills with HPal/RDruid/RSham/MW comp ===\n');

  const rankings = await getRankings('Druid', 'Restoration', 5);
  console.log(`\nTotal RDruid rankings: ${rankings.length}\n`);

  const seen = new Set();
  const reportFights = [];
  for (const r of rankings) {
    const key = `${r.report.code}-${r.report.fightID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reportFights.push({ code: r.report.code, fightId: r.report.fightID, rdruidName: r.name });
  }
  console.log(`Unique report+fight combos: ${reportFights.length}\n`);

  const matches = [];
  for (let i = 0; i < reportFights.length; i++) {
    const rf = reportFights[i];
    process.stdout.write(`[${i + 1}/${reportFights.length}] ${rf.code} f${rf.fightId}... `);

    try {
      const report = await getPlayerDetails(rf.code, rf.fightId);
      let pd = report.playerDetails;
      if (typeof pd === 'string') pd = JSON.parse(pd);
      const inner = pd?.data?.playerDetails || pd?.playerDetails || pd;
      const healersList = inner?.healers || [];

      const healers = healersList.map(h => ({
        name: h.name, server: h.server, spec: normalizeSpec(h.icon), id: h.id,
      }));
      const specNames = healers.map(h => h.spec);

      const hasHPal = specNames.includes('Holy Paladin');
      const hasRSham = specNames.includes('Restoration Shaman');
      const hasMW = specNames.includes('Mistweaver Monk');
      const hasRDruid = specNames.includes('Restoration Druid');

      const matchCount = [hasHPal, hasRSham, hasMW, hasRDruid].filter(Boolean).length;

      if (matchCount >= 3) {
        const fight = report.fights?.[0];
        const duration = fight ? ((fight.endTime - fight.startTime) / 1000).toFixed(0) : '?';
        matches.push({
          code: rf.code, fightId: rf.fightId, matchCount,
          hasHPal, hasRSham, hasMW, hasRDruid,
          healers, specNames, duration: parseInt(duration), fight,
        });
        console.log(`MATCH (${matchCount}/4)! ${specNames.join(', ')}`);
      } else {
        console.log(`${specNames.join(', ') || '(no healers)'}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message.substring(0, 80)}`);
    }

    if (i % 15 === 14) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`RESULTS: Found ${matches.length} kills with 3+/4 target specs`);
  console.log(`${'='.repeat(70)}\n`);

  matches.sort((a, b) => b.matchCount - a.matchCount || a.duration - b.duration);

  const exact = matches.filter(m => m.matchCount === 4);
  const partial = matches.filter(m => m.matchCount === 3);

  console.log(`Exact matches (4/4): ${exact.length}`);
  console.log(`Partial matches (3/4): ${partial.length}\n`);

  for (const m of matches) {
    const compParts = [];
    if (m.hasHPal) compParts.push('HPal');
    if (m.hasRDruid) compParts.push('RDruid');
    if (m.hasRSham) compParts.push('RSham');
    if (m.hasMW) compParts.push('MW');
    const otherSpecs = m.specNames.filter(s => !TARGET_SPECS.includes(s));
    if (otherSpecs.length) compParts.push(...otherSpecs);

    console.log(`[${m.matchCount}/4] ${m.code} fight ${m.fightId} (${m.duration}s)`);
    console.log(`  Comp: ${compParts.join(' + ')}`);
    for (const h of m.healers) {
      console.log(`    ${h.spec}: ${h.name}-${h.server} (id:${h.id})`);
    }
    console.log();
  }

  mkdirSync(join(__dirname, 'data', 'comp-search'), { recursive: true });
  writeFileSync(
    join(__dirname, 'data', 'comp-search', 'matches-cosmos-4heal.json'),
    JSON.stringify(matches, null, 2)
  );
  console.log(`Saved to data/comp-search/matches-cosmos-4heal.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
