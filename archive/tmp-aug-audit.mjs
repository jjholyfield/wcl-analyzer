import { readFileSync, writeFileSync } from 'fs';
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
          events(fightIDs: [${fightId}], dataType: ${dataType}, ${srcFilter} ${timeFilter} limit: 10000) { data nextPageTimestamp }
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
const ENC_LBV = 3180;
const PLAYER = 'Balecoda';
const CLASS = 'Evoker';
const SPEC = 'Augmentation';

async function main() {
  // Get report metadata
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id encounterID difficulty startTime endTime }
        masterData { abilities { gameID name } actors { id name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) spellNames[a.gameID] = a.name;
  const actorNames = {};
  for (const a of meta.reportData.report.masterData?.actors || []) actorNames[a.id] = a.name;

  const fights = meta.reportData.report.fights.filter(f => f.encounterID === ENC_LBV).sort((a, b) => a.id - b.id);

  // Find player ID
  const detailData = await gql(`{
    reportData { report(code: "${REPORT}") { playerDetails(fightIDs: [${fights[0].id}]) } }
  }`);
  const details = detailData.reportData.report.playerDetails?.data?.playerDetails;
  let playerId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) { if (p.name === PLAYER) { playerId = p.id; break; } }
    if (playerId) break;
  }

  console.log(`${PLAYER} (${SPEC} ${CLASS}) — sourceID: ${playerId} — ${fights.length} pulls`);
  console.log('='.repeat(100));

  // Process each pull
  const pullData = [];
  for (const fight of fights) {
    const duration = (fight.endTime - fight.startTime) / 1000;
    const fightStart = fight.startTime;

    const dmgTable = await gql(`{
      reportData { report(code: "${REPORT}") { table(dataType: DamageDone, fightIDs: [${fight.id}]) } }
    }`);
    const entry = dmgTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
    const dps = entry ? Math.round(entry.total / duration) : 0;

    const casts = await fetchAllEvents(REPORT, fight.id, playerId, 'Casts');
    const castOnly = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

    const nonAuto = castOnly.filter(e => {
      const name = spellNames[e.abilityGameID] || '';
      return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
    });
    const cpm = nonAuto.length > 0 ? (nonAuto.length / (duration / 60)).toFixed(1) : '0';

    let deadTime = 0;
    for (let i = 1; i < nonAuto.length; i++) {
      const gap = (nonAuto[i].timestamp - nonAuto[i-1].timestamp) / 1000;
      if (gap > 2.0) deadTime += gap - 1.5;
    }

    const countSpell = (name) => castOnly.filter(e => spellNames[e.abilityGameID] === name).length;

    // Aug-specific spells
    const ebonMight = countSpell('Ebon Might');
    const prescience = countSpell('Prescience');
    const eruption = countSpell('Eruption');
    const fireBreath = countSpell('Fire Breath');
    const upheaval = countSpell('Upheaval');
    const breathOfEons = countSpell('Breath of Eons');
    const deepBreath = countSpell('Deep Breath');
    const tipTheScales = countSpell('Tip the Scales');
    const timeSkip = countSpell('Time Skip');
    const livingFlame = countSpell('Living Flame');
    const azureStrike = countSpell('Azure Strike');

    // Consumables
    const dpsPot = castOnly.filter(e => (spellNames[e.abilityGameID] || '').includes('Recklessness')).length;
    const healthstone = castOnly.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('healthstone')).length;
    const healthPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return n.includes('silvermoon') || (n.includes('potion') && n.includes('health'));
    }).length;

    // Defensives
    const obsidianScales = countSpell('Obsidian Scales');
    const renewingBlaze = countSpell('Renewing Blaze');
    const hover = countSpell('Hover');

    // Deaths
    const deaths = await fetchAllEvents(REPORT, fight.id, null, 'Deaths');
    const myDeaths = deaths.filter(e => e.type === 'death' && e.targetID === playerId);
    let earlyDeath = null;
    for (const d of myDeaths) {
      const deathTime = (d.timestamp - fightStart) / 1000;
      if (duration - deathTime > 30) {
        earlyDeath = { time: deathTime, ability: spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}`, timeLeft: duration - deathTime };
        break;
      }
    }

    const pull = {
      id: fight.id, duration, dps, cpm: parseFloat(cpm), deadPct: parseFloat(((deadTime / duration) * 100).toFixed(1)),
      ebonMight, prescience, eruption, fireBreath, upheaval, breathOfEons, deepBreath, tipTheScales, timeSkip, livingFlame, azureStrike,
      dpsPot, healthstone, healthPot, obsidianScales, renewingBlaze, hover, earlyDeath,
    };
    pullData.push(pull);

    const deathStr = earlyDeath ? `DIED ${fmt(earlyDeath.time)} (${earlyDeath.ability})` : '';
    const consStr = [dpsPot > 0 ? 'POT' : '', healthstone > 0 ? 'HS' : '', healthPot > 0 ? 'HP' : ''].filter(Boolean).join(' ') || 'no cons';
    console.log(`  #${fight.id.toString().padStart(2)} ${fmt(duration)} | ${dps.toLocaleString().padStart(7)} DPS | ${cpm.toString().padStart(4)} CPM | ${((deadTime/duration)*100).toFixed(1).padStart(4)}% dead | EM:${ebonMight} PR:${prescience} ER:${eruption} FB:${fireBreath} UH:${upheaval} BoE:${breathOfEons} | ${consStr} | ${deathStr}`);
  }

  // Summary
  console.log(`\n${'='.repeat(100)}`);
  console.log('NIGHT SUMMARY');
  console.log('='.repeat(100));

  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avgPerMin = (field) => avg(pullData.map(p => p[field] / (p.duration / 60)));

  console.log(`  Avg DPS:          ${Math.round(avg(pullData.map(p => p.dps))).toLocaleString()}`);
  console.log(`  Avg CPM:          ${avg(pullData.map(p => p.cpm)).toFixed(1)}`);
  console.log(`  Avg Dead Time:    ${avg(pullData.map(p => p.deadPct)).toFixed(1)}%`);
  console.log(`  Avg Ebon Might/m: ${avgPerMin('ebonMight').toFixed(1)}`);
  console.log(`  Avg Prescience/m: ${avgPerMin('prescience').toFixed(1)}`);
  console.log(`  Avg Eruption/m:   ${avgPerMin('eruption').toFixed(1)}`);
  console.log(`  Avg Fire Breath/m:${avgPerMin('fireBreath').toFixed(1)}`);
  console.log(`  Avg Upheaval/m:   ${avgPerMin('upheaval').toFixed(1)}`);
  console.log(`  Avg BoE/m:        ${avgPerMin('breathOfEons').toFixed(1)}`);
  console.log(`  Avg ObsScales/m:  ${avgPerMin('obsidianScales').toFixed(1)}`);
  console.log(`  Early Deaths:     ${pullData.filter(p => p.earlyDeath).length}/${pullData.length}`);
  console.log(`  DPS Pot:          ${pullData.filter(p => p.dpsPot > 0).length}/${pullData.length}`);
  console.log(`  Healthstone:      ${pullData.filter(p => p.healthstone > 0).length}/${pullData.length}`);
  console.log(`  Health Pot:       ${pullData.filter(p => p.healthPot > 0).length}/${pullData.length}`);

  if (pullData.some(p => p.earlyDeath)) {
    console.log('\n  Early Deaths:');
    const deathCauses = {};
    for (const p of pullData.filter(p => p.earlyDeath)) {
      console.log(`    #${p.id} at ${fmt(p.earlyDeath.time)} — ${p.earlyDeath.ability}`);
      deathCauses[p.earlyDeath.ability] = (deathCauses[p.earlyDeath.ability] || 0) + 1;
    }
    console.log('  Causes:', Object.entries(deathCauses).map(([a, c]) => `${a}: ${c}x`).join(', '));
  }

  // Now pull top 3 Aug Evokers on M LBV
  console.log(`\n${'='.repeat(100)}`);
  console.log('TOP AUG EVOKERS ON MYTHIC LBV');
  console.log('='.repeat(100));

  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "${CLASS}", specName: "${SPEC}", metric: dps, page: 1)
      }
    }
  }`);

  const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];
  console.log(`  Found ${rankings.length} ranked ${SPEC} ${CLASS}s\n`);

  for (let i = 0; i < Math.min(3, rankings.length); i++) {
    const r = rankings[i];
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    const topMeta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
          masterData { abilities { gameID name } }
        }
      }
    }`);

    const topSpells = {};
    for (const a of topMeta.reportData.report.masterData?.abilities || []) topSpells[a.gameID] = a.name;
    const topFight = topMeta.reportData.report.fights[0];
    if (!topFight) continue;
    const topDur = (topFight.endTime - topFight.startTime) / 1000;

    const topDetails = topMeta.reportData.report.playerDetails?.data?.playerDetails;
    let topId = null;
    for (const role of Object.values(topDetails || {})) {
      if (!Array.isArray(role)) continue;
      for (const p of role) { if (p.name === r.name) { topId = p.id; break; } }
      if (topId) break;
    }
    if (!topId) continue;

    const topDmg = await gql(`{
      reportData { report(code: "${report}") { table(dataType: DamageDone, fightIDs: [${fight}]) } }
    }`);
    const topEntry = topDmg.reportData.report.table?.data?.entries?.find(e => e.name === r.name);
    const topDPS = topEntry ? Math.round(topEntry.total / topDur) : 0;

    const topCasts = await fetchAllEvents(report, fight, topId, 'Casts');
    const topCastOnly = topCasts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

    const topNonAuto = topCastOnly.filter(e => {
      const name = topSpells[e.abilityGameID] || '';
      return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
    });
    const topCPM = (topNonAuto.length / (topDur / 60)).toFixed(1);

    const topCount = (name) => topCastOnly.filter(e => topSpells[e.abilityGameID] === name).length;

    console.log(`  #${i+1} ${r.name} — ${topDPS.toLocaleString()} DPS, ${topCPM} CPM (${fmt(topDur)})`);
    console.log(`    Ebon Might: ${topCount('Ebon Might')} (${(topCount('Ebon Might')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Prescience: ${topCount('Prescience')} (${(topCount('Prescience')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Eruption: ${topCount('Eruption')} (${(topCount('Eruption')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Fire Breath: ${topCount('Fire Breath')} (${(topCount('Fire Breath')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Upheaval: ${topCount('Upheaval')} (${(topCount('Upheaval')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Breath of Eons: ${topCount('Breath of Eons')} (${(topCount('Breath of Eons')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Living Flame: ${topCount('Living Flame')} (${(topCount('Living Flame')/(topDur/60)).toFixed(1)}/m)`);
    console.log(`    Azure Strike: ${topCount('Azure Strike')} (${(topCount('Azure Strike')/(topDur/60)).toFixed(1)}/m)`);
    console.log();
  }

  // Save data for page building
  writeFileSync('tmp-aug-data.json', JSON.stringify({ pullData, rankings: rankings.slice(0, 3).map(r => r.name) }, null, 2));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
