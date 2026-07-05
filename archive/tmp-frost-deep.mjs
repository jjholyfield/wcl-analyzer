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

const ENC_LBV = 3180;

async function analyzeDeep(label, reportCode, fightId, playerName) {
  const meta = await gql(`{
    reportData {
      report(code: "${reportCode}") {
        playerDetails(fightIDs: [${fightId}])
        fights(fightIDs: [${fightId}]) { startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }`);

  const spellNames = {};
  for (const a of meta.reportData.report.masterData?.abilities || []) {
    spellNames[a.gameID] = a.name;
  }

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  let sourceId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === playerName) { sourceId = p.id; break; }
    }
    if (sourceId) break;
  }

  if (!sourceId) { console.log(`  ${playerName} not found`); return; }

  console.log(`\n${'='.repeat(90)}`);
  console.log(`  ${label}: ${playerName} — ${reportCode} fight ${fightId} (${fmt(duration)})`);
  console.log('='.repeat(90));

  const casts = await fetchAllEvents(reportCode, fightId, sourceId, 'Casts');
  const allCasts = casts
    .filter(e => e.type === 'cast' || e.type === 'begincast')
    .sort((a, b) => a.timestamp - b.timestamp);

  const castOnly = allCasts.filter(e => e.type === 'cast');

  // OPENER — first 25 casts
  console.log('\n  OPENER (first 25 casts):');
  const openerCasts = castOnly.slice(0, 25);
  for (const e of openerCasts) {
    const t = ((e.timestamp - fightStart) / 1000).toFixed(1);
    const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
    console.log(`    ${t.padStart(6)}s  ${name}`);
  }

  // CD WINDOWS — when Frozen Orb and Ray of Frost are used
  const frozenOrbId = Object.entries(spellNames).find(([_, name]) => name === 'Frozen Orb')?.[0];
  const rayId = Object.entries(spellNames).find(([_, name]) => name === 'Ray of Frost')?.[0];

  const orbCasts = castOnly.filter(e => spellNames[e.abilityGameID] === 'Frozen Orb');
  const rayCasts = castOnly.filter(e => spellNames[e.abilityGameID] === 'Ray of Frost');

  console.log(`\n  FROZEN ORB TIMING (${orbCasts.length}x):`);
  for (let i = 0; i < orbCasts.length; i++) {
    const t = (orbCasts[i].timestamp - fightStart) / 1000;
    const gap = i > 0 ? ((orbCasts[i].timestamp - orbCasts[i-1].timestamp) / 1000).toFixed(0) + 's gap' : 'opener';
    console.log(`    ${fmt(t)} (${gap})`);
  }

  console.log(`\n  RAY OF FROST TIMING (${rayCasts.length}x):`);
  for (let i = 0; i < rayCasts.length; i++) {
    const t = (rayCasts[i].timestamp - fightStart) / 1000;
    const gap = i > 0 ? ((rayCasts[i].timestamp - rayCasts[i-1].timestamp) / 1000).toFixed(0) + 's gap' : 'opener';
    console.log(`    ${fmt(t)} (${gap})`);
  }

  // FLURRY → ICE LANCE CHAINS — how quickly does Ice Lance follow Flurry?
  console.log('\n  FLURRY → ICE LANCE CHAINS:');
  let goodChains = 0;
  let slowChains = 0;
  let missedChains = 0;

  for (let i = 0; i < castOnly.length; i++) {
    if (spellNames[castOnly[i].abilityGameID] === 'Flurry') {
      const flurryTime = castOnly[i].timestamp;
      // Check next 1-2 casts for Ice Lance
      let foundLance = false;
      for (let j = i + 1; j < Math.min(i + 3, castOnly.length); j++) {
        if (spellNames[castOnly[j].abilityGameID] === 'Ice Lance') {
          const gap = (castOnly[j].timestamp - flurryTime) / 1000;
          if (gap < 1.5) goodChains++;
          else slowChains++;
          foundLance = true;
          break;
        }
      }
      if (!foundLance) missedChains++;
    }
  }
  const totalFlurry = castOnly.filter(e => spellNames[e.abilityGameID] === 'Flurry').length;
  console.log(`    Total Flurries: ${totalFlurry}`);
  console.log(`    → Ice Lance within 1.5s: ${goodChains} (${totalFlurry > 0 ? ((goodChains/totalFlurry)*100).toFixed(0) : 0}%)`);
  console.log(`    → Ice Lance slow (>1.5s): ${slowChains}`);
  console.log(`    → No Ice Lance follow-up: ${missedChains}`);

  // DEAD TIME ANALYSIS — what happens during big gaps
  console.log('\n  DEAD TIME — WHAT HAPPENS DURING GAPS:');
  const nonAuto = castOnly.filter(e => {
    const name = spellNames[e.abilityGameID] || '';
    return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
  });

  for (let i = 1; i < nonAuto.length; i++) {
    const gap = (nonAuto[i].timestamp - nonAuto[i-1].timestamp) / 1000;
    if (gap > 4.0) {
      const gapStart = (nonAuto[i-1].timestamp - fightStart) / 1000;
      const lastSpell = spellNames[nonAuto[i-1].abilityGameID] || `spell-${nonAuto[i-1].abilityGameID}`;
      const nextSpell = spellNames[nonAuto[i].abilityGameID] || `spell-${nonAuto[i].abilityGameID}`;

      // Check if player died during this gap
      console.log(`    ${fmt(gapStart)} — ${gap.toFixed(1)}s gap — ${lastSpell} → ${nextSpell}`);
    }
  }

  // FROSTBOLT BACK-TO-BACK — how many times does Frostbolt repeat without a proc in between?
  console.log('\n  FROSTBOLT CHAINS (consecutive Frostbolts without proc):');
  let maxChain = 0;
  let currentChain = 0;
  let chains = [];

  for (const e of castOnly) {
    const name = spellNames[e.abilityGameID] || '';
    if (name === 'Frostbolt') {
      currentChain++;
    } else {
      if (currentChain > 0) {
        chains.push(currentChain);
        if (currentChain > maxChain) maxChain = currentChain;
      }
      currentChain = 0;
    }
  }
  if (currentChain > 0) chains.push(currentChain);

  const avgChain = chains.length > 0 ? (chains.reduce((a, b) => a + b, 0) / chains.length).toFixed(1) : '0';
  console.log(`    Chains: ${chains.length} | Avg length: ${avgChain} | Max: ${maxChain}`);
  console.log(`    Distribution: ${chains.filter(c => c === 1).length}x single, ${chains.filter(c => c === 2).length}x double, ${chains.filter(c => c >= 3).length}x triple+`);

  // GLACIAL SPIKE — what precedes it and what follows
  console.log('\n  GLACIAL SPIKE CONTEXT:');
  for (let i = 0; i < castOnly.length; i++) {
    if (spellNames[castOnly[i].abilityGameID] === 'Glacial Spike') {
      const t = fmt((castOnly[i].timestamp - fightStart) / 1000);
      const prev = i > 0 ? spellNames[castOnly[i-1].abilityGameID] || '?' : 'start';
      const next = i < castOnly.length - 1 ? spellNames[castOnly[i+1].abilityGameID] || '?' : 'end';
      console.log(`    ${t}: ${prev} → GLACIAL SPIKE → ${next}`);
    }
  }

  // Check for deaths
  const deaths = await fetchAllEvents(reportCode, fightId, 'Deaths', '');
  // Can't filter deaths by sourceID easily, check manually
  console.log('\n  DEATH CHECK:');
  const deathEvents = deaths.filter(e => e.type === 'death' && e.targetID === sourceId);
  if (deathEvents.length > 0) {
    for (const d of deathEvents) {
      const t = fmt((d.timestamp - fightStart) / 1000);
      const killer = spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}`;
      console.log(`    DIED at ${t} — killed by ${killer}`);
    }
  } else {
    console.log(`    Did not die`);
  }
}

async function main() {
  // Analyze #1 Frost Mage on Mythic LBV
  const rankData = await gql(`{
    worldData {
      encounter(id: ${ENC_LBV}) {
        characterRankings(difficulty: 5, className: "Mage", specName: "Frost", metric: dps, page: 1)
      }
    }
  }`);

  const rankings = rankData.worldData.encounter.characterRankings?.rankings || [];
  const top = rankings[0];

  await analyzeDeep('#1 FROST MAGE', top.report.code, top.report.fightID, top.name);

  // Analyze Baodabao
  await analyzeDeep('BAODABAO', 'by6mKkdwXGcqQtRW', 30, 'Baodabao');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
