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
    const srcFilter = sourceId ? `sourceID: ${sourceId},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            ${srcFilter}
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

async function main() {
  // Get all fights + spell names + player ID
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id name encounterID difficulty kill startTime endTime }
        masterData { abilities { gameID name } actors { id name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) {
    spellNames[a.gameID] = a.name;
  }
  const actorNames = {};
  for (const a of meta.reportData.report.masterData?.actors || []) {
    actorNames[a.id] = a.name;
  }

  const fights = meta.reportData.report.fights.sort((a, b) => a.id - b.id);

  // Find Baodabao's ID from first fight
  const detailData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${fights[0].id}])
      }
    }
  }`);
  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;
  let baoId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === 'Baodabao') { baoId = p.id; break; }
    }
    if (baoId) break;
  }

  console.log(`BAODABAO — ALL 26 PULLS — sourceID: ${baoId}`);
  console.log('='.repeat(100));

  const pullData = [];

  for (const fight of fights) {
    const duration = (fight.endTime - fight.startTime) / 1000;
    const fightStart = fight.startTime;

    // Get DPS
    const dmgTable = await gql(`{
      reportData {
        report(code: "${REPORT}") {
          table(dataType: DamageDone, fightIDs: [${fight.id}])
        }
      }
    }`);
    const baoEntry = dmgTable.reportData.report.table?.data?.entries?.find(e => e.name === 'Baodabao');
    const dps = baoEntry ? Math.round(baoEntry.total / duration) : 0;

    // Get casts
    const casts = await fetchAllEvents(REPORT, fight.id, baoId, 'Casts');
    const castOnly = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

    // CPM (exclude melee/auto)
    const nonAuto = castOnly.filter(e => {
      const name = spellNames[e.abilityGameID] || '';
      return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
    });
    const cpm = nonAuto.length > 0 ? (nonAuto.length / (duration / 60)).toFixed(1) : '0';

    // Dead time
    let deadTime = 0;
    for (let i = 1; i < nonAuto.length; i++) {
      const gap = (nonAuto[i].timestamp - nonAuto[i-1].timestamp) / 1000;
      if (gap > 2.0) deadTime += gap - 1.5;
    }
    const deadPct = ((deadTime / duration) * 100).toFixed(1);

    // Key spell counts
    const countSpell = (name) => castOnly.filter(e => spellNames[e.abilityGameID] === name).length;
    const flurry = countSpell('Flurry');
    const frostbolt = countSpell('Frostbolt');
    const iceLance = countSpell('Ice Lance');
    const frozenOrb = countSpell('Frozen Orb');
    const rayOfFrost = countSpell('Ray of Frost');
    const glacialSpike = countSpell('Glacial Spike');
    const iceBarrier = countSpell('Ice Barrier');

    // Consumables
    const dpsPot = castOnly.filter(e => (spellNames[e.abilityGameID] || '').includes('Recklessness')).length;
    const healthstone = castOnly.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('healthstone')).length;
    const healthPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return n.includes('silvermoon') || (n.includes('potion') && n.includes('health'));
    }).length;

    // Deaths (early = died before wipe, > 30s before fight end)
    const deaths = await fetchAllEvents(REPORT, fight.id, null, 'Deaths');
    const myDeaths = deaths.filter(e => e.type === 'death' && e.targetID === baoId);
    let earlyDeath = null;
    for (const d of myDeaths) {
      const deathTime = (d.timestamp - fightStart) / 1000;
      if (duration - deathTime > 30) {
        earlyDeath = {
          time: deathTime,
          ability: spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}`,
          timeLeft: duration - deathTime,
        };
        break;
      }
    }

    const pull = {
      id: fight.id, duration, dps, cpm: parseFloat(cpm), deadPct: parseFloat(deadPct),
      flurry, frostbolt, iceLance, frozenOrb, rayOfFrost, glacialSpike, iceBarrier,
      dpsPot, healthstone, healthPot, earlyDeath,
    };
    pullData.push(pull);

    const deathStr = earlyDeath ? `DIED ${fmt(earlyDeath.time)} (${earlyDeath.ability})` : '';
    const potStr = dpsPot > 0 ? 'POT' : '';
    const hsStr = healthstone > 0 ? 'HS' : '';
    const hpStr = healthPot > 0 ? 'HP' : '';
    console.log(`  #${fight.id.toString().padStart(2)} ${fmt(duration)} | ${dps.toLocaleString().padStart(7)} DPS | ${cpm.toString().padStart(4)} CPM | ${deadPct.toString().padStart(4)}% dead | FL:${flurry.toString().padStart(2)} FB:${frostbolt.toString().padStart(2)} IL:${iceLance.toString().padStart(3)} | IB:${iceBarrier.toString().padStart(2)} | ${[potStr, hsStr, hpStr].filter(Boolean).join(' ') || 'no cons'} | ${deathStr}`);
  }

  // Summary stats
  console.log(`\n${'='.repeat(100)}`);
  console.log('NIGHT SUMMARY');
  console.log('='.repeat(100));

  const avgDPS = Math.round(pullData.reduce((s, p) => s + p.dps, 0) / pullData.length);
  const avgCPM = (pullData.reduce((s, p) => s + p.cpm, 0) / pullData.length).toFixed(1);
  const avgDead = (pullData.reduce((s, p) => s + p.deadPct, 0) / pullData.length).toFixed(1);
  const earlyDeaths = pullData.filter(p => p.earlyDeath).length;
  const potPulls = pullData.filter(p => p.dpsPot > 0).length;
  const hsPulls = pullData.filter(p => p.healthstone > 0).length;
  const hpPulls = pullData.filter(p => p.healthPot > 0).length;
  const avgFlurry = (pullData.reduce((s, p) => s + p.flurry / (p.duration / 60), 0) / pullData.length).toFixed(1);
  const avgFrostbolt = (pullData.reduce((s, p) => s + p.frostbolt / (p.duration / 60), 0) / pullData.length).toFixed(1);
  const avgIceBarrier = (pullData.reduce((s, p) => s + p.iceBarrier / (p.duration / 60), 0) / pullData.length).toFixed(1);
  const avgFrozenOrb = (pullData.reduce((s, p) => s + p.frozenOrb / (p.duration / 60), 0) / pullData.length).toFixed(1);

  console.log(`  Avg DPS:        ${avgDPS.toLocaleString()}`);
  console.log(`  Avg CPM:        ${avgCPM}`);
  console.log(`  Avg Dead Time:  ${avgDead}%`);
  console.log(`  Avg Flurry/min: ${avgFlurry}`);
  console.log(`  Avg FB/min:     ${avgFrostbolt}`);
  console.log(`  Avg IB/min:     ${avgIceBarrier}`);
  console.log(`  Avg FOrb/min:   ${avgFrozenOrb}`);
  console.log(`  Early Deaths:   ${earlyDeaths}/${pullData.length} pulls (${((earlyDeaths/pullData.length)*100).toFixed(0)}%)`);
  console.log(`  DPS Pot used:   ${potPulls}/${pullData.length} pulls`);
  console.log(`  Healthstone:    ${hsPulls}/${pullData.length} pulls`);
  console.log(`  Health Pot:     ${hpPulls}/${pullData.length} pulls`);

  // Early death breakdown
  if (earlyDeaths > 0) {
    console.log(`\n  Early Deaths:`);
    const deathAbilities = {};
    for (const p of pullData.filter(p => p.earlyDeath)) {
      const ab = p.earlyDeath.ability;
      deathAbilities[ab] = (deathAbilities[ab] || 0) + 1;
      console.log(`    #${p.id} at ${fmt(p.earlyDeath.time)} — ${ab} (${fmt(p.earlyDeath.timeLeft)} before wipe)`);
    }
    console.log(`\n  Death causes:`);
    for (const [ab, count] of Object.entries(deathAbilities).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ab}: ${count}x`);
    }
  }

  // CPM trend (first 10 vs last 10 pulls)
  const firstHalf = pullData.slice(0, Math.ceil(pullData.length / 2));
  const secondHalf = pullData.slice(Math.ceil(pullData.length / 2));
  const firstCPM = (firstHalf.reduce((s, p) => s + p.cpm, 0) / firstHalf.length).toFixed(1);
  const secondCPM = (secondHalf.reduce((s, p) => s + p.cpm, 0) / secondHalf.length).toFixed(1);
  console.log(`\n  CPM Trend: First half ${firstCPM} → Second half ${secondCPM}`);

  const firstDead = (firstHalf.reduce((s, p) => s + p.deadPct, 0) / firstHalf.length).toFixed(1);
  const secondDead = (secondHalf.reduce((s, p) => s + p.deadPct, 0) / secondHalf.length).toFixed(1);
  console.log(`  Dead Time Trend: First half ${firstDead}% → Second half ${secondDead}%`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
