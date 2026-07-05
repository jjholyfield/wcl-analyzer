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
const PLAYER = 'Nucke';
const DPS_POT_KEYWORDS = ['recklessness', "light's potential", 'zealotry', 'rampant abandon'];

async function main() {
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        fights(killType: Encounters) { id encounterID startTime endTime }
        masterData { abilities { gameID name } actors { id name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) spellNames[a.gameID] = a.name;

  const fights = meta.reportData.report.fights.filter(f => f.encounterID === ENC_LBV).sort((a, b) => a.id - b.id);

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

  console.log(`${PLAYER} (Vengeance DH) — sourceID: ${playerId} — ${fights.length} pulls`);
  console.log('='.repeat(100));

  // First, get all spells from the longest pull to identify VDH abilities
  const bestFights = [...fights].sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime)).slice(0, 5);

  console.log('\nAll spells from best pull:');
  const bestCasts = await fetchAllEvents(REPORT, bestFights[0].id, playerId, 'Casts');
  const bestCastOnly = bestCasts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);
  const spellCounts = {};
  for (const e of bestCastOnly) {
    const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
    spellCounts[name] = (spellCounts[name] || 0) + 1;
  }
  const sorted = Object.entries(spellCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  ${name.padEnd(30)} ${count}x`);
  }

  // Now process all pulls with VDH-specific spells
  console.log('\n' + '='.repeat(100));
  const pullData = [];

  for (const fight of fights) {
    const duration = (fight.endTime - fight.startTime) / 1000;
    const fightStart = fight.startTime;
    const isBest = bestFights.some(f => f.id === fight.id);

    const dmgTable = await gql(`{
      reportData { report(code: "${REPORT}") { table(dataType: DamageDone, fightIDs: [${fight.id}]) } }
    }`);
    const entry = dmgTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
    const dps = entry ? Math.round(entry.total / duration) : 0;

    const dtpsTable = await gql(`{
      reportData { report(code: "${REPORT}") { table(dataType: DamageTaken, fightIDs: [${fight.id}]) } }
    }`);
    const dtpsEntry = dtpsTable.reportData.report.table?.data?.entries?.find(e => e.name === PLAYER);
    const dtps = dtpsEntry ? Math.round(dtpsEntry.total / duration) : 0;

    const casts = await fetchAllEvents(REPORT, fight.id, playerId, 'Casts');
    const castOnly = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

    const countSpell = (name) => castOnly.filter(e => spellNames[e.abilityGameID] === name).length;

    // VDH abilities
    const soulCleave = countSpell('Soul Cleave');
    const spiritBomb = countSpell('Spirit Bomb');
    const fracture = countSpell('Fracture');
    const immolationAura = countSpell('Immolation Aura');
    const demonSpikes = countSpell('Demon Spikes');
    const fieryBrand = countSpell('Fiery Brand');
    const metamorphosis = countSpell('Metamorphosis');
    const felDevastation = countSpell('Fel Devastation');
    const sigilOfFlame = countSpell('Sigil of Flame');
    const sigilOfSpite = countSpell('Sigil of Spite');
    const soulCarver = countSpell('Soul Carver');
    const infernalStrike = countSpell('Infernal Strike');
    const reaversGlaive = countSpell("Reaver's Glaive");

    // Consumables
    const dpsPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return DPS_POT_KEYWORDS.some(k => n.includes(k));
    }).length;
    const healthstone = castOnly.filter(e => (spellNames[e.abilityGameID] || '').toLowerCase().includes('healthstone')).length;
    const healthPot = castOnly.filter(e => {
      const n = (spellNames[e.abilityGameID] || '').toLowerCase();
      return n.includes('silvermoon') || (n.includes('potion') && n.includes('health'));
    }).length;

    // Deaths
    const deaths = await fetchAllEvents(REPORT, fight.id, null, 'Deaths');
    const myDeaths = deaths.filter(e => e.type === 'death' && e.targetID === playerId);
    let earlyDeath = null;
    for (const d of myDeaths) {
      const deathTime = (d.timestamp - fightStart) / 1000;
      if (duration - deathTime > 30) {
        earlyDeath = { time: deathTime, ability: spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}` };
        break;
      }
    }

    const deathStr = earlyDeath ? `DIED ${fmt(earlyDeath.time)} (${earlyDeath.ability})` : '';
    const consStr = [dpsPot > 0 ? 'POT' : '', healthstone > 0 ? 'HS' : '', healthPot > 0 ? 'HP' : ''].filter(Boolean).join(' ') || 'no cons';

    console.log(`  #${fight.id.toString().padStart(2)} ${fmt(duration)} | ${dps.toLocaleString().padStart(6)} DPS ${dtps.toLocaleString().padStart(6)} DTPS | SC:${soulCleave} SpB:${spiritBomb} Fr:${fracture} IA:${immolationAura} | DS:${demonSpikes} FB:${fieryBrand} Meta:${metamorphosis} | ${consStr} | ${deathStr}`);

    if (isBest) {
      console.log('    Defensive CD timing:');
      const defensiveSpells = ['Demon Spikes', 'Fiery Brand', 'Metamorphosis', 'Fel Devastation'];
      for (const spell of defensiveSpells) {
        const uses = castOnly.filter(e => spellNames[e.abilityGameID] === spell);
        if (uses.length > 0) {
          const times = uses.map(e => fmt((e.timestamp - fightStart) / 1000)).join(', ');
          console.log(`      ${spell.padEnd(22)} ${uses.length}x — ${times}`);
        }
      }
    }

    pullData.push({
      id: fight.id, duration, dps, dtps,
      soulCleave, spiritBomb, fracture, immolationAura,
      demonSpikes, fieryBrand, metamorphosis, felDevastation,
      sigilOfFlame, sigilOfSpite, soulCarver, reaversGlaive,
      dpsPot, healthstone, healthPot, earlyDeath,
    });
  }

  // Summary
  const avg = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const avgPerMin = (field) => avg(pullData.map(p => p[field] / (p.duration / 60)));

  console.log(`\nNIGHT SUMMARY:`);
  console.log(`  Avg DPS:            ${Math.round(avg(pullData.map(p => p.dps))).toLocaleString()}`);
  console.log(`  Avg DTPS:           ${Math.round(avg(pullData.map(p => p.dtps))).toLocaleString()}`);
  console.log(`  Avg Soul Cleave/m:  ${avgPerMin('soulCleave').toFixed(1)}`);
  console.log(`  Avg Spirit Bomb/m:  ${avgPerMin('spiritBomb').toFixed(1)}`);
  console.log(`  Avg Fracture/m:     ${avgPerMin('fracture').toFixed(1)}`);
  console.log(`  Avg Immol Aura/m:   ${avgPerMin('immolationAura').toFixed(1)}`);
  console.log(`  Avg Demon Spikes/m: ${avgPerMin('demonSpikes').toFixed(1)}`);
  console.log(`  Avg Fiery Brand/m:  ${avgPerMin('fieryBrand').toFixed(1)}`);
  console.log(`  Avg Meta/m:         ${avgPerMin('metamorphosis').toFixed(1)}`);
  console.log(`  Avg Fel Devast/m:   ${avgPerMin('felDevastation').toFixed(1)}`);
  console.log(`  Early Deaths:       ${pullData.filter(p => p.earlyDeath).length}/${pullData.length}`);
  console.log(`  DPS Pot:            ${pullData.filter(p => p.dpsPot > 0).length}/${pullData.length}`);
  console.log(`  Healthstone:        ${pullData.filter(p => p.healthstone > 0).length}/${pullData.length}`);
  console.log(`  Health Pot:         ${pullData.filter(p => p.healthPot > 0).length}/${pullData.length}`);

  const earlyDeaths = pullData.filter(p => p.earlyDeath);
  if (earlyDeaths.length > 0) {
    console.log('\n  Early Deaths:');
    for (const p of earlyDeaths) {
      console.log(`    #${p.id} at ${fmt(p.earlyDeath.time)} — ${p.earlyDeath.ability}`);
    }
  }

  // Top VDH
  console.log(`\nTOP 3 VENGEANCE DH ON MYTHIC LBV:`);
  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "DemonHunter", specName: "Vengeance", metric: dps, page: 1)
      }
    }
  }`);

  const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];
  console.log(`  Found ${rankings.length} ranked\n`);

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
    const topStart = topFight.startTime;

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

    const topDtps = await gql(`{
      reportData { report(code: "${report}") { table(dataType: DamageTaken, fightIDs: [${fight}]) } }
    }`);
    const topDtpsEntry = topDtps.reportData.report.table?.data?.entries?.find(e => e.name === r.name);
    const topDTPS = topDtpsEntry ? Math.round(topDtpsEntry.total / topDur) : 0;

    const topCasts = await fetchAllEvents(report, fight, topId, 'Casts');
    const topCastOnly = topCasts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);
    const topCount = (name) => topCastOnly.filter(e => topSpells[e.abilityGameID] === name).length;

    console.log(`  #${i+1} ${r.name} — ${topDPS.toLocaleString()} DPS, ${topDTPS.toLocaleString()} DTPS (${fmt(topDur)})`);

    // Show all spells sorted by count
    const topSpellCounts = {};
    for (const e of topCastOnly) {
      const name = topSpells[e.abilityGameID] || `spell-${e.abilityGameID}`;
      topSpellCounts[name] = (topSpellCounts[name] || 0) + 1;
    }
    const topSorted = Object.entries(topSpellCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [name, count] of topSorted) {
      console.log(`    ${name.padEnd(26)} ${count.toString().padStart(4)}x  (${(count/(topDur/60)).toFixed(1)}/m)`);
    }

    // Defensive timing
    console.log('    Defensive timing:');
    for (const spell of ['Demon Spikes', 'Fiery Brand', 'Metamorphosis', 'Fel Devastation']) {
      const uses = topCastOnly.filter(e => topSpells[e.abilityGameID] === spell);
      if (uses.length > 0) {
        const times = uses.map(e => fmt((e.timestamp - topStart) / 1000)).join(', ');
        console.log(`      ${spell.padEnd(22)} ${times}`);
      }
    }
    console.log();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
