/**
 * Crown of the Cosmos — P2 Simulacrum Damage Analysis
 *
 * Compares Simulacrum Backlash + Cosmic Barrier damage in P2 between
 * our prog pulls and top-ranked reference kills.
 *
 * Key finding: Simulacrum Backlash is a continuous AoE that hits the entire
 * raid for as long as the Rift Simulacrums are alive. More damage = slower kills.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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
  if (!res.ok) throw new Error(`GraphQL failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  return json.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Config ──
const REPORT_CODE = 'Hz1Lm672dZnBw9YC';
const ENCOUNTER_ID = 3181;
const DIFFICULTY = 5;
const FIGHT_IDS = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,25];
const P2_START_REL = 173;
const P2_END_REL = 309;

// Simulacrum-related ability IDs (mapped from masterData)
const SIMULACRUM_ABILITIES = {
  1260019: 'Simulacrum Backlash',
  1261289: 'Cosmic Barrier',
  1261287: 'Cosmic Barrier',  // alternate ID
};

// All P2 abilities for context
const ALL_P2_ABILITIES = {
  1260019: 'Simulacrum Backlash',
  1261289: 'Cosmic Barrier',
  1261287: 'Cosmic Barrier',
  1237040: 'Voidstalker Sting',
  1237038: 'Voidstalker Sting',
  1233826: 'Void Expulsion',
  1233819: 'Void Expulsion',
  1260000: 'Void Barrage',
  1260026: 'Grasp of Emptiness',
  1260027: 'Grasp of Emptiness',
  1255378: 'Bursting Emptiness',
  1246461: 'Rift Slash',
  1242553: 'Void Remnants',
  1238709: 'Dark Rush',
};

const SIM_IDS = new Set(Object.keys(SIMULACRUM_ABILITIES).map(Number));

async function getAllDamageTaken(reportCode, fightId, startTime, endTime) {
  let allEvents = [];
  let nextPage = startTime;
  while (nextPage !== null && nextPage < endTime) {
    const data = await gql(`
      query ($code: String!) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: [${fightId}]
              hostilityType: Friendlies
              dataType: DamageTaken
              startTime: ${nextPage}
              endTime: ${endTime}
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `, { code: reportCode });
    const events = data.reportData.report.events;
    allEvents.push(...events.data);
    nextPage = events.nextPageTimestamp;
    if (nextPage) await sleep(100);
  }
  return allEvents;
}

function analyzeDamageEvents(events, fightStartTime, p2Duration) {
  let simBacklashDmg = 0, simBacklashHits = 0;
  let cosmicBarrierDmg = 0, cosmicBarrierHits = 0;
  let totalSimDmg = 0, totalSimHits = 0;
  let totalAllDmg = 0;

  const byAbility = {};

  for (const e of events) {
    const dmg = (e.amount || 0) + (e.absorbed || 0);
    totalAllDmg += dmg;

    const id = e.abilityGameID;
    const name = ALL_P2_ABILITIES[id] || SIMULACRUM_ABILITIES[id] || `ID-${id}`;

    if (!byAbility[name]) byAbility[name] = { total: 0, count: 0 };
    byAbility[name].total += dmg;
    byAbility[name].count++;

    if (SIM_IDS.has(id)) {
      totalSimDmg += dmg;
      totalSimHits++;

      if (id === 1260019) {
        simBacklashDmg += dmg;
        simBacklashHits++;
      }
      if (id === 1261289 || id === 1261287) {
        cosmicBarrierDmg += dmg;
        cosmicBarrierHits++;
      }
    }
  }

  return {
    simBacklash: { total: simBacklashDmg, hits: simBacklashHits, dtps: p2Duration > 0 ? simBacklashDmg / p2Duration : 0 },
    cosmicBarrier: { total: cosmicBarrierDmg, hits: cosmicBarrierHits, dtps: p2Duration > 0 ? cosmicBarrierDmg / p2Duration : 0 },
    totalSim: { total: totalSimDmg, hits: totalSimHits, dtps: p2Duration > 0 ? totalSimDmg / p2Duration : 0 },
    totalAllP2: { total: totalAllDmg, dtps: p2Duration > 0 ? totalAllDmg / p2Duration : 0 },
    byAbility,
  };
}

async function main() {
  console.log('=== Crown of the Cosmos — P2 Simulacrum Damage Analysis ===\n');

  // ── Step 1: Get our fight metadata ──
  console.log('Step 1: Fetching fight metadata...');
  const metaData = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          fights(encounterID: ${ENCOUNTER_ID}) {
            id startTime endTime kill difficulty fightPercentage
          }
        }
      }
    }
  `, { code: REPORT_CODE });

  const allFights = metaData.reportData.report.fights
    .filter(f => f.difficulty === DIFFICULTY && FIGHT_IDS.includes(f.id));

  const p2Fights = allFights.filter(f => {
    const dur = (f.endTime - f.startTime) / 1000;
    return dur > P2_START_REL;
  });

  console.log(`  ${allFights.length} Crown fights total, ${p2Fights.length} reached P2\n`);

  // ── Step 2: Pull our P2 Simulacrum damage for all qualifying fights ──
  console.log('Step 2: Pulling our P2 damage...');
  const ourResults = [];

  for (const fight of p2Fights) {
    const duration = (fight.endTime - fight.startTime) / 1000;
    const p2Duration = Math.min(duration, P2_END_REL) - P2_START_REL;
    const p2StartAbs = fight.startTime + (P2_START_REL * 1000);
    const p2EndAbs = fight.startTime + (Math.min(duration, P2_END_REL) * 1000);

    console.log(`  Fight ${fight.id}: ${duration.toFixed(0)}s total, ${p2Duration.toFixed(0)}s in P2`);

    const events = await getAllDamageTaken(REPORT_CODE, fight.id, p2StartAbs, p2EndAbs);
    const analysis = analyzeDamageEvents(events, fight.startTime, p2Duration);

    ourResults.push({
      fightId: fight.id,
      kill: fight.kill,
      fightPercentage: fight.fightPercentage,
      totalDuration: duration,
      p2Duration,
      ...analysis,
    });

    await sleep(200);
  }

  // ── Step 3: Pull reference kills ──
  console.log('\nStep 3: Pulling reference kills...');

  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENCOUNTER_ID}) {
        us: characterRankings(className: "Warrior", specName: "Fury", difficulty: ${DIFFICULTY}, metric: dps, serverRegion: "US", page: 1)
        eu: characterRankings(className: "Warrior", specName: "Fury", difficulty: ${DIFFICULTY}, metric: dps, serverRegion: "EU", page: 1)
      }
    }
  }`);

  const usR = rankData.worldData.encounter.us?.rankings || [];
  const euR = rankData.worldData.encounter.eu?.rankings || [];
  const allRankings = [...usR, ...euR];
  console.log(`  Found ${usR.length} US + ${euR.length} EU rankings`);

  const seen = new Set();
  const uniqueKills = [];
  for (const r of allRankings) {
    const code = r.report?.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    uniqueKills.push(r);
    if (uniqueKills.length >= 10) break;
  }

  const refResults = [];

  for (const kill of uniqueKills) {
    if (refResults.length >= 5) break;

    const code = kill.report.code;
    const fightId = kill.report.fightID;
    console.log(`  Checking ${code} fight ${fightId}...`);

    try {
      const fightData = await gql(`
        query ($code: String!) {
          reportData {
            report(code: $code) {
              fights(fightIDs: [${fightId}]) {
                id startTime endTime kill difficulty
              }
            }
          }
        }
      `, { code });

      const fight = fightData.reportData.report.fights[0];
      if (!fight || !fight.kill) { console.log('    Not a kill'); continue; }

      const duration = (fight.endTime - fight.startTime) / 1000;
      if (duration < P2_START_REL) { console.log(`    Too short (${duration.toFixed(0)}s)`); continue; }

      const p2Duration = Math.min(duration, P2_END_REL) - P2_START_REL;
      const p2StartAbs = fight.startTime + (P2_START_REL * 1000);
      const p2EndAbs = fight.startTime + (Math.min(duration, P2_END_REL) * 1000);

      console.log(`    Kill: ${duration.toFixed(0)}s total, ${p2Duration.toFixed(0)}s P2`);

      const events = await getAllDamageTaken(code, fightId, p2StartAbs, p2EndAbs);
      const analysis = analyzeDamageEvents(events, fight.startTime, p2Duration);

      refResults.push({
        reportCode: code,
        fightId,
        totalDuration: duration,
        p2Duration,
        guild: kill.guild?.name || 'Unknown',
        server: kill.server?.name || 'Unknown',
        ...analysis,
      });

      console.log(`    Sim Backlash: ${(analysis.simBacklash.total / 1e6).toFixed(1)}M (${analysis.simBacklash.dtps.toFixed(0)} DTPS)`);
      console.log(`    Cosmic Barrier: ${(analysis.cosmicBarrier.total / 1e6).toFixed(1)}M (${analysis.cosmicBarrier.dtps.toFixed(0)} DTPS)`);
      console.log(`    Combined Sim: ${(analysis.totalSim.total / 1e6).toFixed(1)}M (${analysis.totalSim.dtps.toFixed(0)} DTPS)`);

    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }

    await sleep(300);
  }

  // ── Step 4: Compute comparisons ──
  console.log('\n=== COMPARISON ===');

  const ourAvgSimDtps = ourResults.reduce((s, r) => s + r.totalSim.dtps, 0) / ourResults.length;
  const ourAvgBacklashDtps = ourResults.reduce((s, r) => s + r.simBacklash.dtps, 0) / ourResults.length;
  const ourAvgBarrierDtps = ourResults.reduce((s, r) => s + r.cosmicBarrier.dtps, 0) / ourResults.length;

  const refAvgSimDtps = refResults.reduce((s, r) => s + r.totalSim.dtps, 0) / refResults.length;
  const refAvgBacklashDtps = refResults.reduce((s, r) => s + r.simBacklash.dtps, 0) / refResults.length;
  const refAvgBarrierDtps = refResults.reduce((s, r) => s + r.cosmicBarrier.dtps, 0) / refResults.length;

  console.log(`Our avg Sim Backlash DTPS: ${ourAvgBacklashDtps.toFixed(0)} vs Ref: ${refAvgBacklashDtps.toFixed(0)} (${((ourAvgBacklashDtps / refAvgBacklashDtps - 1) * 100).toFixed(0)}% delta)`);
  console.log(`Our avg Cosmic Barrier DTPS: ${ourAvgBarrierDtps.toFixed(0)} vs Ref: ${refAvgBarrierDtps.toFixed(0)} (${((ourAvgBarrierDtps / refAvgBarrierDtps - 1) * 100).toFixed(0)}% delta)`);
  console.log(`Our avg Combined Sim DTPS: ${ourAvgSimDtps.toFixed(0)} vs Ref: ${refAvgSimDtps.toFixed(0)} (${((ourAvgSimDtps / refAvgSimDtps - 1) * 100).toFixed(0)}% delta)`);

  // Save everything
  const output = {
    targetAbilities: Object.entries(SIMULACRUM_ABILITIES).map(([id, name]) => ({ id: Number(id), name })),
    allP2Abilities: Object.entries(ALL_P2_ABILITIES).map(([id, name]) => ({ id: Number(id), name })),
    ourResults,
    refResults,
    allFights: allFights.map(f => ({
      id: f.id,
      duration: (f.endTime - f.startTime) / 1000,
      kill: f.kill,
      fightPercentage: f.fightPercentage,
      reachedP2: (f.endTime - f.startTime) / 1000 > P2_START_REL,
    })),
    comparison: {
      ourAvgSimDtps, ourAvgBacklashDtps, ourAvgBarrierDtps,
      refAvgSimDtps, refAvgBacklashDtps, refAvgBarrierDtps,
      backlashDeltaPct: ((ourAvgBacklashDtps / refAvgBacklashDtps - 1) * 100),
      barrierDeltaPct: ((ourAvgBarrierDtps / refAvgBarrierDtps - 1) * 100),
      combinedDeltaPct: ((ourAvgSimDtps / refAvgSimDtps - 1) * 100),
    },
  };

  writeFileSync(
    join(__dirname, 'data', 'crown-p2-analysis.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('\nData saved to data/crown-p2-analysis.json');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
