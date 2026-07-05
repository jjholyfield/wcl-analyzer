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
    const sourceFilter = sourceId ? `sourceID: ${sourceId},` : '';
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            ${sourceFilter}
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

// Use ranked kill #2 — MW/HPal/RSham/HPriest comp (close to Josh's)
const REPORT = 'cV6aXYdTnN1FMjK2';
const FIGHT = 23;

const CD_SPELLS = {
  // MW
  115310: { name: 'Revival', cd: 180 },
  388615: { name: 'Restoral', cd: 180 },
  322118: { name: "Yu'lon", cd: 120 },
  325197: { name: "Chi-Ji", cd: 120 },
  443028: { name: 'Celestial Conduit', cd: 90 },
  116849: { name: 'Life Cocoon', cd: 120 },
  116680: { name: 'Thunder Focus Tea', cd: 30 },
  // RSham
  98008: { name: 'Spirit Link Totem', cd: 180 },
  114052: { name: 'Ascendance', cd: 180 },
  108280: { name: 'Healing Tide Totem', cd: 180 },
  // HPal
  31884: { name: 'Avenging Wrath', cd: 120 },
  216331: { name: 'Avenging Crusader', cd: 120 },
  31821: { name: 'Aura Mastery', cd: 180 },
  6940: { name: 'Blessing of Sacrifice', cd: 120 },
  // HPriest
  64843: { name: 'Divine Hymn', cd: 180 },
  200183: { name: 'Apotheosis', cd: 120 },
  47788: { name: 'Guardian Spirit', cd: 60 },
  // DPriest
  246287: { name: 'Evangelism', cd: 90 },
  62618: { name: 'Power Word: Barrier', cd: 180 },
  271466: { name: 'Luminous Barrier', cd: 180 },
  // PEvo
  363534: { name: 'Rewind', cd: 180 },
  359816: { name: 'Dream Flight', cd: 120 },
  370553: { name: 'Tip the Scales', cd: 90 },
  // RDruid
  740: { name: 'Tranquility', cd: 180 },
  391528: { name: 'Convoke', cd: 60 },
  393763: { name: 'Convoke', cd: 60 },
  323764: { name: 'Convoke', cd: 60 },
  102342: { name: 'Ironbark', cd: 90 },
  // Raid CDs
  196718: { name: 'Darkness', cd: 180 },
  97462: { name: 'Rallying Cry', cd: 180 },
  15286: { name: 'Vampiric Embrace', cd: 120 },
  51052: { name: 'Anti-Magic Zone', cd: 120 },
};
const allCdIds = Object.keys(CD_SPELLS).map(Number);

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function main() {
  console.log(`RANKED KILL #2 — ${REPORT} fight ${FIGHT}`);
  console.log('Comp: PEvo / MW / HPal / RSham / HPriest');
  console.log('='.repeat(80));

  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { id startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  console.log(`Duration: ${fmt(duration)} (${duration.toFixed(0)}s)\n`);

  // Build spell name lookup from masterData
  const spellNames = {};
  if (meta.reportData.report.masterData?.abilities) {
    for (const a of meta.reportData.report.masterData.abilities) {
      spellNames[a.gameID] = a.name;
    }
  }

  // Find healers
  const healers = [];
  if (details?.healers) {
    for (const p of details.healers) {
      healers.push({ name: p.name, id: p.id, type: p.type, spec: p.specs?.[0]?.spec });
    }
  }

  for (const h of healers) console.log(`  ${h.name} — ${h.spec} ${h.type} (ID: ${h.id})`);

  // Pull CDs for each healer
  for (const healer of healers) {
    const casts = await fetchAllEvents(REPORT, FIGHT, healer.id, 'Casts');
    const cdCasts = casts
      .filter(e => e.type === 'cast' && allCdIds.includes(e.abilityGameID))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (cdCasts.length === 0) continue;

    console.log(`\n  ${healer.name} (${healer.spec} ${healer.type}):`);
    for (const e of cdCasts) {
      const t = (e.timestamp - fightStart) / 1000;
      const spell = CD_SPELLS[e.abilityGameID];
      console.log(`    ${fmt(t).padStart(5)}  ${spell?.name || spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`}`);
    }

    // Check gaps
    const bySpell = {};
    for (const e of cdCasts) {
      const id = e.abilityGameID;
      if (!bySpell[id]) bySpell[id] = [];
      bySpell[id].push((e.timestamp - fightStart) / 1000);
    }

    for (const [id, times] of Object.entries(bySpell)) {
      const spell = CD_SPELLS[id];
      if (!spell || times.length < 2) continue;
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        console.log(`    → ${spell.name}: ${fmt(times[i-1])} → ${fmt(times[i])} = ${gap.toFixed(0)}s gap (listed CD: ${spell.cd}s) ${gap < spell.cd ? '⚠️ SHORTER' : '✓'}`);
      }
    }
  }

  // Now also pull boss abilities with names
  console.log(`\n${'='.repeat(80)}`);
  console.log('BOSS ABILITIES (with names from masterData)');
  console.log('='.repeat(80));

  const enemyCasts = await fetchAllEvents(REPORT, FIGHT, null, 'Casts');
  // Filter to enemy casts only (look for common boss NPC IDs or just filter by hostile)
  // Actually we can't easily filter by hostility in events, so let's look at all casts
  // and find abilities NOT cast by players

  const playerIds = new Set();
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) playerIds.add(p.id);
  }

  const bossCasts = enemyCasts.filter(e =>
    (e.type === 'cast' || e.type === 'begincast') && !playerIds.has(e.sourceID)
  );

  const abilityMap = {};
  for (const e of bossCasts) {
    const id = e.abilityGameID;
    const name = spellNames[id] || `spell-${id}`;
    if (!abilityMap[name]) abilityMap[name] = { id, count: 0, times: [] };
    abilityMap[name].count++;
    abilityMap[name].times.push(((e.timestamp - fightStart) / 1000));
  }

  // Sort by first occurrence
  const sorted = Object.entries(abilityMap).sort((a, b) => (a[1].times[0] || 0) - (b[1].times[0] || 0));
  for (const [name, info] of sorted) {
    if (info.count < 2 && !name.toLowerCase().includes('searing') && !name.toLowerCase().includes('avenger') && !name.toLowerCase().includes('tyr')) continue;
    const timesStr = info.times.slice(0, 12).map(t => fmt(t)).join(', ');
    console.log(`  ${name} (${info.count}x): ${timesStr}${info.times.length > 12 ? '...' : ''}`);
  }

  // Specifically look for Searing Radiance, Mass Avenger's Shield, Tyr's Wrath
  console.log(`\n${'='.repeat(80)}`);
  console.log('KEY MECHANICS SEARCH');
  console.log('='.repeat(80));

  for (const keyword of ['Searing', 'Avenger', 'Tyr', 'Sacred Toll', 'Divine Storm', 'Execution', 'Sacred Shield']) {
    const matches = sorted.filter(([name]) => name.toLowerCase().includes(keyword.toLowerCase()));
    for (const [name, info] of matches) {
      console.log(`  ${name} (${info.count}x): ${info.times.map(t => fmt(t)).join(', ')}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
