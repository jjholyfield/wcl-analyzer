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
const FIGHT = 30;

async function main() {
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { startTime endTime }
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

  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  // Find Baodabao
  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  let baoId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === 'Baodabao') { baoId = p.id; break; }
    }
    if (baoId) break;
  }

  console.log(`BAODABAO — Pull #${FIGHT} (${fmt(duration)}) — sourceID: ${baoId}`);
  console.log('='.repeat(90));

  const casts = await fetchAllEvents(REPORT, FIGHT, baoId, 'Casts');
  const castOnly = casts.filter(e => e.type === 'cast').sort((a, b) => a.timestamp - b.timestamp);

  // OPENER
  console.log('\n  OPENER (first 25 casts):');
  for (const e of castOnly.slice(0, 25)) {
    const t = ((e.timestamp - fightStart) / 1000).toFixed(1);
    const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
    console.log(`    ${t.padStart(6)}s  ${name}`);
  }

  // CD TIMING
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

  // FLURRY CHAINS
  console.log('\n  FLURRY → ICE LANCE CHAINS:');
  let goodChains = 0, slowChains = 0, missedChains = 0;
  const flurryCasts = [];

  for (let i = 0; i < castOnly.length; i++) {
    if (spellNames[castOnly[i].abilityGameID] === 'Flurry') {
      const flurryTime = castOnly[i].timestamp;
      let foundLance = false;
      for (let j = i + 1; j < Math.min(i + 3, castOnly.length); j++) {
        if (spellNames[castOnly[j].abilityGameID] === 'Ice Lance') {
          const gap = (castOnly[j].timestamp - flurryTime) / 1000;
          if (gap < 1.5) goodChains++;
          else slowChains++;
          foundLance = true;
          flurryCasts.push({ time: (flurryTime - fightStart) / 1000, gap, followed: true });
          break;
        }
      }
      if (!foundLance) {
        missedChains++;
        const nextSpell = i + 1 < castOnly.length ? spellNames[castOnly[i+1].abilityGameID] : 'nothing';
        flurryCasts.push({ time: (flurryTime - fightStart) / 1000, followed: false, next: nextSpell });
      }
    }
  }

  const totalFlurry = castOnly.filter(e => spellNames[e.abilityGameID] === 'Flurry').length;
  console.log(`    Total Flurries: ${totalFlurry}`);
  console.log(`    → Ice Lance within 1.5s: ${goodChains} (${totalFlurry > 0 ? ((goodChains/totalFlurry)*100).toFixed(0) : 0}%)`);
  console.log(`    → Ice Lance slow (>1.5s): ${slowChains}`);
  console.log(`    → No Ice Lance follow-up: ${missedChains}`);

  if (missedChains > 0) {
    console.log(`    Missed follow-ups:`);
    for (const f of flurryCasts.filter(f => !f.followed)) {
      console.log(`      ${fmt(f.time)}: Flurry → ${f.next} (no Ice Lance)`);
    }
  }

  // DEAD TIME — detailed
  console.log('\n  DEAD TIME GAPS (>3s):');
  const nonAuto = castOnly.filter(e => {
    const name = spellNames[e.abilityGameID] || '';
    return !name.match(/^(Melee|Auto Shot)$/i) && e.abilityGameID !== 1;
  });

  let totalDeadTime = 0;
  for (let i = 1; i < nonAuto.length; i++) {
    const gap = (nonAuto[i].timestamp - nonAuto[i-1].timestamp) / 1000;
    if (gap > 3.0) {
      const gapStart = (nonAuto[i-1].timestamp - fightStart) / 1000;
      const lastSpell = spellNames[nonAuto[i-1].abilityGameID] || '?';
      const nextSpell = spellNames[nonAuto[i].abilityGameID] || '?';
      console.log(`    ${fmt(gapStart)} — ${gap.toFixed(1)}s gap — ${lastSpell} → ${nextSpell}`);
      totalDeadTime += gap - 1.5;
    }
  }
  console.log(`    Total dead time: ${totalDeadTime.toFixed(1)}s (${(totalDeadTime/duration*100).toFixed(1)}%)`);

  // FROSTBOLT CHAINS
  console.log('\n  FROSTBOLT CHAINS:');
  let chains = [];
  let currentChain = 0;
  for (const e of castOnly) {
    if (spellNames[e.abilityGameID] === 'Frostbolt') currentChain++;
    else { if (currentChain > 0) chains.push(currentChain); currentChain = 0; }
  }
  if (currentChain > 0) chains.push(currentChain);
  const maxChain = chains.length > 0 ? Math.max(...chains) : 0;
  const avgChain = chains.length > 0 ? (chains.reduce((a,b)=>a+b,0)/chains.length).toFixed(1) : '0';
  console.log(`    Chains: ${chains.length} | Avg: ${avgChain} | Max: ${maxChain}`);
  console.log(`    ${chains.filter(c=>c===1).length}x single, ${chains.filter(c=>c===2).length}x double, ${chains.filter(c=>c>=3).length}x triple+`);

  // GLACIAL SPIKE CONTEXT
  console.log('\n  GLACIAL SPIKE CONTEXT:');
  for (let i = 0; i < castOnly.length; i++) {
    if (spellNames[castOnly[i].abilityGameID] === 'Glacial Spike') {
      const t = fmt((castOnly[i].timestamp - fightStart) / 1000);
      const prev = i > 0 ? spellNames[castOnly[i-1].abilityGameID] || '?' : 'start';
      const next = i < castOnly.length - 1 ? spellNames[castOnly[i+1].abilityGameID] || '?' : 'end';
      console.log(`    ${t}: ${prev} → GLACIAL SPIKE → ${next}`);
    }
  }

  // DEATHS
  console.log('\n  DEATHS:');
  const deaths = await fetchAllEvents(REPORT, FIGHT, null, 'Deaths');
  const myDeaths = deaths.filter(e => e.type === 'death' && e.targetID === baoId);
  if (myDeaths.length > 0) {
    for (const d of myDeaths) {
      const t = fmt((d.timestamp - fightStart) / 1000);
      const killer = spellNames[d.killingAbilityGameID] || `spell-${d.killingAbilityGameID}`;
      const killerNPC = actorNames[d.killerID] || '';
      console.log(`    DIED at ${t} — ${killer}${killerNPC ? ` (${killerNPC})` : ''}`);

      // What was he casting right before death?
      const preDeathCasts = castOnly.filter(e =>
        e.timestamp >= d.timestamp - 10000 && e.timestamp <= d.timestamp
      );
      if (preDeathCasts.length > 0) {
        console.log('    Last casts before death:');
        for (const e of preDeathCasts) {
          const ct = fmt((e.timestamp - fightStart) / 1000);
          console.log(`      ${ct} ${spellNames[e.abilityGameID] || '?'}`);
        }
      }
    }
  } else {
    console.log('    Did not die in this pull');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
