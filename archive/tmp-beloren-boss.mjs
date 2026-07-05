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

async function fetchAllEvents(reportCode, fightId, dataType, extra = '') {
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
            ${timeFilter}
            ${extra}
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

const ENC_BELOREN = 3182;

async function main() {
  // Step 1: Find 5 mythic Belo'ren kills from speed rankings
  console.log('STEP 1: PULL BOSS ABILITY DATA FROM MYTHIC BELO\'REN KILLS');
  console.log('='.repeat(90));

  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_BELOREN}) {
        fightRankings(difficulty: 5, metric: speed, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.fightRankings?.rankings || [];
  console.log(`Found ${rankings.length} ranked kills\n`);

  // Pick 5 kills across a range of durations
  const kills = rankings.slice(0, 5);

  for (const kill of kills) {
    const report = kill.report.code;
    const fight = kill.report.fightID;
    const duration = kill.duration / 1000;

    console.log(`\n${'─'.repeat(90)}`);
    console.log(`  ${report} fight ${fight} — ${fmt(duration)} (${duration.toFixed(0)}s)`);
    console.log(`${'─'.repeat(90)}`);

    // Get fight info and masterData for spell names
    const meta = await gql(`{
      reportData {
        report(code: "${report}") {
          fights(fightIDs: [${fight}]) { id startTime endTime }
          masterData { abilities { gameID name } actors { id name type subType } }
          playerDetails(fightIDs: [${fight}])
        }
      }
    }`);

    const fightInfo = meta.reportData.report.fights[0];
    if (!fightInfo) { console.log('  Fight not found'); continue; }

    const fightStart = fightInfo.startTime;
    const fightDur = (fightInfo.endTime - fightInfo.startTime) / 1000;

    const spellNames = {};
    for (const a of meta.reportData.report.masterData?.abilities || []) {
      spellNames[a.gameID] = a.name;
    }
    const actorNames = {};
    for (const a of meta.reportData.report.masterData?.actors || []) {
      actorNames[a.id] = a.name;
    }

    // Show healer comp
    const details = meta.reportData.report.playerDetails?.data?.playerDetails;
    if (details?.healers) {
      const specs = details.healers.map(p => `${p.specs?.[0]?.spec} ${p.type}`).join(', ');
      console.log(`  Healers: ${specs}`);
    }

    // Pull ALL events (casts from enemies)
    const allCasts = await fetchAllEvents(report, fight, 'Casts');

    // Build player ID set
    const playerIds = new Set();
    for (const role of Object.values(details || {})) {
      if (!Array.isArray(role)) continue;
      for (const p of role) playerIds.add(p.id);
    }

    // Filter to boss/enemy casts only
    const bossCasts = allCasts.filter(e =>
      (e.type === 'cast' || e.type === 'begincast') && !playerIds.has(e.sourceID)
    );

    // Group by ability
    const abilityMap = {};
    for (const e of bossCasts) {
      const id = e.abilityGameID;
      const name = spellNames[id] || `spell-${id}`;
      const source = actorNames[e.sourceID] || `npc-${e.sourceID}`;
      const key = `${name}`;
      if (!abilityMap[key]) abilityMap[key] = { id, count: 0, times: [], source, type: e.type };
      abilityMap[key].count++;
      abilityMap[key].times.push((e.timestamp - fightStart) / 1000);
    }

    // Sort by first occurrence
    const sorted = Object.entries(abilityMap)
      .filter(([_, info]) => info.count >= 2 || info.times[0] < 30)
      .sort((a, b) => (a[1].times[0] || 0) - (b[1].times[0] || 0));

    console.log(`\n  Boss Abilities (${sorted.length} unique):`);
    for (const [name, info] of sorted) {
      const timesStr = info.times.slice(0, 15).map(t => fmt(t)).join(', ');
      const more = info.times.length > 15 ? ` (+${info.times.length - 15} more)` : '';

      // Calculate gaps
      let gapStr = '';
      if (info.times.length >= 2) {
        const gaps = [];
        for (let i = 1; i < Math.min(info.times.length, 6); i++) {
          gaps.push((info.times[i] - info.times[i-1]).toFixed(0));
        }
        gapStr = ` [gaps: ${gaps.join(', ')}s]`;
      }

      console.log(`    ${name} (${info.count}x, src: ${info.source}): ${timesStr}${more}${gapStr}`);
    }

    // Also pull damage taken to find big raid damage spikes
    console.log(`\n  Raid Damage Timeline (10s windows):`);
    const dmgTaken = await fetchAllEvents(report, fight, 'DamageTaken');

    // Aggregate by 10-second windows
    const windows = {};
    for (const e of dmgTaken) {
      if (e.type !== 'damage') continue;
      const t = (e.timestamp - fightStart) / 1000;
      const windowKey = Math.floor(t / 10) * 10;
      if (!windows[windowKey]) windows[windowKey] = { total: 0, abilities: {} };
      const dmg = (e.amount || 0) + (e.absorbed || 0);
      windows[windowKey].total += dmg;
      const name = spellNames[e.abilityGameID] || `spell-${e.abilityGameID}`;
      windows[windowKey].abilities[name] = (windows[windowKey].abilities[name] || 0) + dmg;
    }

    const windowKeys = Object.keys(windows).map(Number).sort((a, b) => a - b);
    const maxDmg = Math.max(...windowKeys.map(k => windows[k].total));

    for (const wk of windowKeys) {
      const w = windows[wk];
      const barLen = Math.floor((w.total / maxDmg) * 30);
      const bar = '█'.repeat(barLen);
      const topAbilities = Object.entries(w.abilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, dmg]) => `${name} ${(dmg/1000000).toFixed(1)}M`)
        .join(', ');
      console.log(`    ${fmt(wk)}-${fmt(wk+10)}  ${(w.total/1000000).toFixed(1).padStart(5)}M ${bar}  ${topAbilities}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
