import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const DATA_DIR = join(__dirname, 'data');

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

// Paginated event fetcher for enemy events
async function fetchAllEnemyEvents(code, fightId, dataType, startTimeOverride = null) {
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
            hostilityType: Enemies
            ${timeFilter}
            limit: 10000
          ) {
            data
            nextPageTimestamp
          }
        }
      }
    }`);

    const result = data.reportData.report.events;
    if (result.data && result.data.length > 0) {
      allEvents = allEvents.concat(result.data);
    }

    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }

  return allEvents;
}

// Fetch masterData (ability names, actors)
async function fetchMasterData(code) {
  const data = await gql(`{
    reportData {
      report(code: "${code}") {
        masterData {
          abilities {
            gameID
            name
            type
          }
          actors(type: "NPC") {
            id
            gameID
            name
            subType
          }
        }
      }
    }
  }`);
  return data.reportData.report.masterData;
}

// Fetch fight info
async function fetchFightInfo(code, fightId) {
  const data = await gql(`{
    reportData {
      report(code: "${code}") {
        fights(fightIDs: [${fightId}]) {
          id
          name
          startTime
          endTime
          kill
          bossPercentage
          difficulty
        }
      }
    }
  }`);
  return data.reportData.report.fights[0];
}

// Fetch damage-done table for a summary view
async function fetchDamageTable(code, fightId) {
  const data = await gql(`{
    reportData {
      report(code: "${code}") {
        table(
          fightIDs: [${fightId}]
          dataType: DamageDone
          hostilityType: Enemies
        )
      }
    }
  }`);
  return data.reportData.report.table;
}

// ── Teams ──────────────────────────────────────────────────────
const TEAM_SETS = {
  salhadaar: [
    { name: 'Strat Roulette', code: '1mAGvxq7nptrJFQ2', fightId: 22 },
    { name: 'Stacked',        code: 'CrNF9DKZacqf864g', fightId: 38 },
    { name: 'Conviction',     code: 'xtmjZ2bJ4NHWAvKf', fightId: 43 },
    { name: 'Esprit',         code: 'Czxy4b9rTjnRPJvg', fightId: 13 },
    { name: 'Fraudes',        code: 'dQmvYyL1MnkD2XRC', fightId: 20 },
  ],
  ve: [
    { name: 'Team 1 (Hyjal)',     code: 'mtJnrPkdGWjMzQ6y', fightId: 40 },
    { name: 'Team 2 (Gordunni)',   code: 'kWtChn3w6r9LKcFZ', fightId: 7 },
    { name: 'Team 3 (Blackhand)',  code: 'b8hRNHAgPK3qca1M', fightId: 16 },
    { name: 'Team 4 (Ysondre)',    code: '1LG7Nrw3BZThAt9W', fightId: 33 },
    { name: 'Team 5 (Illidan)',    code: 'C42df6Ybj7gzVH8F', fightId: 32 },
  ],
  averzian: [
    { name: 'Frostmane (EU)',      code: 'L6zZcwdjCH3GqMQJ', fightId: 2 },
    { name: 'Burning Blade (CN)',  code: 'Rjrpz7Xg2cdqHZTW', fightId: 13 },
    { name: 'Swift Breeze (CN)',   code: '3dXQ1p9xNhtZYgJb', fightId: 42 },
    { name: 'Luo Ning (CN)',       code: 'kFrgH3CDznmYZ6t2', fightId: 28 },
    { name: 'Golden Plains (CN)',  code: 'yNgHh2Z1pGPLqbV8', fightId: 17 },
  ],
  vorasius: [
    { name: 'Sargeras (US)',       code: 'vrFCKRW9VHfpnjMJ', fightId: 25 },
    { name: 'Luo Ning (CN)',       code: 'kFrgH3CDznmYZ6t2', fightId: 32 },
    { name: 'Frostmane (EU)',      code: 'V8MybCjvtkrnG79W', fightId: 12 },
    { name: 'Swift Breeze (CN)',   code: '7FVMGmZayYAvLxct', fightId: 17 },
    { name: 'Antonidas (EU)',      code: 'PGVhzHYmcLCj2DAN', fightId: 39 },
  ],
  chimaerus: [
    { name: 'Kazzak (EU)',         code: 'QNP3LAZBmaxMHCcT', fightId: 6 },
    { name: 'Frostmane (EU)',      code: 'L6zZcwdjCH3GqMQJ', fightId: 20 },
    { name: 'Blackmoore (EU)',     code: 'yD4azXngJVAYf6vq', fightId: 8 },
    { name: "Zul'jin (US)",        code: 'zZrxNkftXDnKPwQ3', fightId: 30 },
    { name: 'Luo Ning (CN)',       code: '1fGqNC3mvLRjy2kP', fightId: 1 },
  ],
  lbv: [
    { name: 'Area52 (US)',         code: 'RJtvkayqwQG7bY1K', fightId: 41 },
    { name: 'Area52 (US) #2',     code: 'YDRC4QjfZqXKa9cV', fightId: 36 },
    { name: 'Ravencrest (EU)',     code: 'Kf7XFZ3NAjdBTWPm', fightId: 30 },
    { name: 'Illidan (US)',        code: 'aBdf89HDpKy27n6M', fightId: 24 },
    { name: 'Blackmoore (EU)',     code: 'zRgJW2fFvpHQCtbr', fightId: 34 },
  ],
  cosmos: [
    { name: 'Team 1 (EU)',        code: 'GW2xnNP3Fzbm6LMp', fightId: 21 },
    { name: 'Team 2 (EU)',        code: 'H6p73kJvh2xQzNyF', fightId: 70 },
    { name: 'Team 3 (CN)',        code: 'Fj476pJw8PRv1Lmd', fightId: 58 },
    { name: 'Team 4 (CN)',        code: 'Fj476pJw8PRv1Lmd', fightId: 16 },
    { name: 'Team 5 (CN)',        code: 'm1pnRaNHvPGFXwYC', fightId: 22 },
  ],
};

const boss = process.argv[2] || 'salhadaar';
const TEAMS = TEAM_SETS[boss];
if (!TEAMS) {
  console.error(`Unknown boss: ${boss}. Options: ${Object.keys(TEAM_SETS).join(', ')}`);
  process.exit(1);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  // Allow targeting a specific team by index or "all"
  const arg = process.argv[3] || 'all';
  const teamsToProcess = arg === 'all' ? TEAMS : [TEAMS[parseInt(arg)]];

  for (const team of teamsToProcess) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`  ${team.name} — Report: ${team.code}, Fight: ${team.fightId}`);
    console.log(`${'='.repeat(80)}`);

    const outDir = join(DATA_DIR, team.code);
    mkdirSync(outDir, { recursive: true });

    // 1. Fight info
    console.log('\n  Fetching fight info...');
    const fight = await fetchFightInfo(team.code, team.fightId);
    const fightDur = ((fight.endTime - fight.startTime) / 1000).toFixed(1);
    console.log(`  Fight: ${fight.name} — ${fight.kill ? 'KILL' : 'WIPE'} — ${fightDur}s`);

    // 2. MasterData (abilities + NPC actors)
    console.log('  Fetching masterData (abilities + NPCs)...');
    const masterData = await fetchMasterData(team.code);
    const abilityMap = {};
    for (const a of masterData.abilities) {
      abilityMap[a.gameID] = { name: a.name, type: a.type };
    }
    console.log(`  Got ${masterData.abilities.length} abilities, ${masterData.actors.length} NPC actors`);

    // 3. Enemy casts
    console.log('  Fetching enemy CASTS (all pages)...');
    const casts = await fetchAllEnemyEvents(team.code, team.fightId, 'Casts');
    console.log(`  Got ${casts.length} enemy cast events`);

    // 4. Enemy damage done
    console.log('  Fetching enemy DAMAGE DONE (all pages)...');
    const damage = await fetchAllEnemyEvents(team.code, team.fightId, 'DamageDone');
    console.log(`  Got ${damage.length} enemy damage events`);

    // 5. Damage table summary
    console.log('  Fetching enemy damage TABLE summary...');
    const damageTable = await fetchDamageTable(team.code, team.fightId);
    console.log(`  Got damage table`);

    // 6. Save everything
    const output = {
      team: team.name,
      report: { code: team.code },
      fight: {
        id: fight.id,
        name: fight.name,
        kill: fight.kill,
        duration: fight.endTime - fight.startTime,
        startTime: fight.startTime,
        endTime: fight.endTime,
      },
      masterData: {
        abilities: abilityMap,
        actors: masterData.actors,
      },
      enemyCasts: casts,
      enemyDamage: damage,
      damageTable,
    };

    const filename = `boss-abilities-fight${team.fightId}.json`;
    writeFileSync(join(outDir, filename), JSON.stringify(output, null, 2));
    console.log(`\n  Saved: data/${team.code}/${filename}`);

    // Quick summary of unique boss abilities
    const castAbilities = {};
    for (const c of casts) {
      const id = c.abilityGameID;
      const name = abilityMap[id]?.name || `spell-${id}`;
      if (!castAbilities[id]) castAbilities[id] = { name, count: 0 };
      castAbilities[id].count++;
    }

    console.log(`\n  Enemy abilities cast during fight:`);
    const sorted = Object.entries(castAbilities).sort((a, b) => b[1].count - a[1].count);
    for (const [id, info] of sorted) {
      console.log(`    [${id}] ${info.name} — ${info.count} casts`);
    }

    // Quick damage summary
    const dmgAbilities = {};
    for (const d of damage) {
      const id = d.abilityGameID;
      const name = abilityMap[id]?.name || `spell-${id}`;
      if (!dmgAbilities[id]) dmgAbilities[id] = { name, totalDmg: 0, hits: 0, targets: new Set() };
      dmgAbilities[id].totalDmg += (d.amount || 0) + (d.absorbed || 0);
      dmgAbilities[id].hits++;
      if (d.targetID) dmgAbilities[id].targets.add(d.targetID);
    }

    console.log(`\n  Enemy damage abilities (by total damage):`);
    const dmgSorted = Object.entries(dmgAbilities)
      .sort((a, b) => b[1].totalDmg - a[1].totalDmg)
      .slice(0, 25);
    for (const [id, info] of dmgSorted) {
      const avgTargets = info.targets.size;
      const raidWide = avgTargets > 10 ? ' [RAID-WIDE]' : avgTargets > 3 ? ' [MULTI]' : '';
      console.log(`    [${id}] ${info.name} — ${(info.totalDmg / 1e6).toFixed(1)}M total, ${info.hits} hits, ${avgTargets} unique targets${raidWide}`);
    }

    // Small delay between reports to avoid rate limiting
    if (teamsToProcess.length > 1) {
      console.log('\n  Waiting 2s before next report...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n\nDone! All boss ability data saved.');
}

main().catch(e => { console.error(e); process.exit(1); });
