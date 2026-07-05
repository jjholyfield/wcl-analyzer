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

const REPORT = 'B7h3VP1ndcXTQZ92';
const FIGHT = 24;

const SPELLS = {
  115175: 'Soothing Mist',
  116670: 'Vivify',
  124682: 'Enveloping Mist',
  115151: 'Renewing Mist',
  191837: 'Essence Font',
  116680: 'Thunder Focus Tea',
  443028: 'Celestial Conduit',
  115310: 'Revival',
  388615: 'Restoral',
  322118: "Yu'lon",
  325197: "Chi-Ji",
  116849: 'Life Cocoon',
  100780: 'Tiger Palm',
  100784: 'Blackout Kick',
  228649: 'Blackout Kick',
  205523: 'Blackout Kick',
  107428: 'Rising Sun Kick',
  185099: 'Rising Sun Kick',
  101546: 'Spinning Crane Kick',
  388193: 'Jadefire Stomp',
  327104: 'Jadefire Stomp',
  123986: 'Chi Burst',
  325216: 'Bonedust Brew',
  451968: 'Sheilun\'s Gift',
  198898: 'Song of Chi-Ji',
  1: 'Melee',
};

const HEAL_SPELLS = [115175, 116670, 124682, 115151, 191837, 443028, 115310, 388615, 322118, 325197, 116849, 451968, 198898, 388193, 327104, 123986];
const DPS_SPELLS = [100780, 100784, 228649, 205523, 107428, 185099, 101546];
const CDS = [443028, 115310, 388615, 322118, 325197, 116849, 116680];

function spellName(id) { return SPELLS[id] || `spell-${id}`; }

async function main() {
  // Get player details and fight info
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { id startTime endTime }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  const duration = (fight.endTime - fight.startTime) / 1000;
  const fightStart = fight.startTime;

  // Find ALL MW monks in the raid
  const monks = [];
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const pl of role) {
      if (pl.specs?.[0]?.spec === 'Mistweaver' || pl.type === 'Monk') {
        monks.push({ name: pl.name, id: pl.id, spec: pl.specs?.[0]?.spec });
      }
    }
  }

  // Also search healers specifically
  if (details?.healers) {
    for (const pl of details.healers) {
      if (pl.type === 'Monk' && !monks.find(m => m.id === pl.id)) {
        monks.push({ name: pl.name, id: pl.id, spec: pl.specs?.[0]?.spec });
      }
    }
  }

  console.log(`\nBelo'ren Kill — Fight #${FIGHT} — ${duration.toFixed(0)}s`);
  console.log(`Found ${monks.length} MW Monk(s): ${monks.map(m => m.name).join(', ')}`);
  console.log('='.repeat(100));

  // Also pull healing done for HPS
  const healingData = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        table(fightIDs: [${FIGHT}], dataType: Healing)
      }
    }
  }`);

  const healingTable = healingData.reportData.report.table?.data?.entries || [];

  for (const monk of monks) {
    const isJosh = monk.name === 'Senssay' || monk.name === 'Mackspal';
    const tag = isJosh ? ' <<< YOU' : '';

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${monk.name} (sourceID: ${monk.id})${tag}`);
    console.log(`${'─'.repeat(50)}`);

    // Get healing numbers from table
    const healEntry = healingTable.find(e => e.name === monk.name);
    if (healEntry) {
      const hps = (healEntry.total / duration).toFixed(0);
      const ohPct = healEntry.overhealingAbsorbed != null
        ? ((healEntry.overhealingAbsorbed / (healEntry.total + healEntry.overhealingAbsorbed)) * 100).toFixed(1)
        : 'N/A';
      console.log(`  HPS: ${Number(hps).toLocaleString()} | Total: ${Number(healEntry.total).toLocaleString()} | Overheal: ${ohPct}%`);
    }

    // Pull casts
    const casts = await fetchAllEvents(REPORT, FIGHT, monk.id, 'Casts');
    const timeline = casts
      .filter(e => e.type === 'cast' || e.type === 'begincast')
      .sort((a, b) => a.timestamp - b.timestamp);

    // Count spells
    const spellCounts = {};
    const castOnly = timeline.filter(e => e.type === 'cast');
    for (const e of castOnly) {
      const name = spellName(e.abilityGameID);
      spellCounts[name] = (spellCounts[name] || 0) + 1;
    }

    // Key metrics
    const rem = castOnly.filter(e => e.abilityGameID === 115151).length;
    const viv = castOnly.filter(e => e.abilityGameID === 116670).length;
    const em = castOnly.filter(e => e.abilityGameID === 124682).length;
    const ef = castOnly.filter(e => e.abilityGameID === 191837).length;
    const tft = castOnly.filter(e => e.abilityGameID === 116680).length;
    const soom = castOnly.filter(e => e.abilityGameID === 115175).length;
    const lc = castOnly.filter(e => e.abilityGameID === 116849).length;
    const dpsCasts = castOnly.filter(e => DPS_SPELLS.includes(e.abilityGameID)).length;
    const totalCasts = castOnly.filter(e => e.abilityGameID !== 1).length; // exclude melee
    const cpm = (totalCasts / (duration / 60)).toFixed(1);

    console.log(`  CPM: ${cpm} (${totalCasts} casts)`);
    console.log(`  ReM: ${rem} (${(rem / (duration/60)).toFixed(1)}/min)`);
    console.log(`  Vivify: ${viv} (${(viv / (duration/60)).toFixed(1)}/min)`);
    console.log(`  Enveloping Mist: ${em} (${(em / (duration/60)).toFixed(1)}/min)`);
    console.log(`  Essence Font: ${ef}`);
    console.log(`  TFT: ${tft}`);
    console.log(`  Soothing Mist: ${soom}`);
    console.log(`  Life Cocoon: ${lc}`);
    console.log(`  DPS casts: ${dpsCasts}`);

    // CDs with timestamps
    console.log(`\n  CD Usage:`);
    for (const cdId of CDS) {
      const cdCasts = castOnly.filter(e => e.abilityGameID === cdId);
      if (cdCasts.length > 0) {
        const times = cdCasts.map(e => ((e.timestamp - fightStart) / 1000).toFixed(1) + 's').join(', ');
        console.log(`    ${spellName(cdId)}: ${cdCasts.length}x — ${times}`);
      }
    }

    // Soothing Mist patterns
    if (soom > 0) {
      console.log(`\n  Soothing Mist patterns:`);
      for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].abilityGameID === 115175 && timeline[i].type === 'cast') {
          const time = ((timeline[i].timestamp - fightStart) / 1000).toFixed(1);
          if (i + 1 < timeline.length) {
            const next = timeline[i + 1];
            const gap = ((next.timestamp - timeline[i].timestamp) / 1000).toFixed(2);
            console.log(`    ${time}s: SooM → ${spellName(next.abilityGameID)} (${gap}s gap)`);
          } else {
            console.log(`    ${time}s: SooM (last cast)`);
          }
        }
      }
    }

    // Dead time analysis (gaps > 2s between casts, excluding melee)
    const nonMelee = castOnly.filter(e => e.abilityGameID !== 1);
    let deadTime = 0;
    let deadGaps = [];
    for (let i = 1; i < nonMelee.length; i++) {
      const gap = (nonMelee[i].timestamp - nonMelee[i - 1].timestamp) / 1000;
      if (gap > 2.0) {
        deadTime += gap - 1.5; // 1.5s is reasonable GCD
        if (gap > 3.0) {
          const t = ((nonMelee[i - 1].timestamp - fightStart) / 1000).toFixed(1);
          deadGaps.push(`${t}s (${gap.toFixed(1)}s gap → ${spellName(nonMelee[i].abilityGameID)})`);
        }
      }
    }
    const deadPct = ((deadTime / duration) * 100).toFixed(1);
    console.log(`\n  Dead Time: ${deadTime.toFixed(1)}s (${deadPct}%)`);
    if (deadGaps.length > 0) {
      console.log(`  Big gaps (>3s):`);
      for (const g of deadGaps.slice(0, 10)) console.log(`    ${g}`);
    }

    // Full cast timeline
    console.log(`\n  Full cast sequence:`);
    for (const e of castOnly.filter(e => e.abilityGameID !== 1)) {
      const t = ((e.timestamp - fightStart) / 1000).toFixed(1);
      console.log(`    ${t.padStart(6)}s  ${spellName(e.abilityGameID)}`);
    }
  }

  // Also pull Vivify overheal per monk
  console.log(`\n${'='.repeat(100)}`);
  console.log('  VIVIFY OVERHEAL COMPARISON');
  console.log('='.repeat(100));

  for (const monk of monks) {
    const isJosh = monk.name === 'Senssay' || monk.name === 'Mackspal';
    const healing = await fetchAllEvents(REPORT, FIGHT, monk.id, 'Healing');
    const vivHeals = healing.filter(e => e.abilityGameID === 116670);
    const totalVivHeal = vivHeals.reduce((s, e) => s + (e.amount || 0), 0);
    const totalVivOver = vivHeals.reduce((s, e) => s + (e.overheal || 0), 0);
    const vivOhPct = totalVivHeal + totalVivOver > 0
      ? ((totalVivOver / (totalVivHeal + totalVivOver)) * 100).toFixed(1)
      : '0';
    console.log(`  ${monk.name}${isJosh ? ' <<<' : ''}: Vivify overheal ${vivOhPct}% (${totalVivOver.toLocaleString()} / ${(totalVivHeal + totalVivOver).toLocaleString()})`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
