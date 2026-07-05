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

const ENC_BELOREN = 3182;

// Target comp: MW / HPal / RSham / HPriest (4 healers)
// Search MW Monk rankings (rarest spec in the comp)
const TARGET_SPECS = new Set(['Mistweaver', 'Holy Paladin', 'Restoration Shaman', 'Holy Priest']);

function specKey(spec, type) {
  if (type === 'Paladin' && spec === 'Holy') return 'Holy Paladin';
  if (type === 'Priest' && spec === 'Holy') return 'Holy Priest';
  if (type === 'Shaman' && spec === 'Restoration') return 'Restoration Shaman';
  if (type === 'Monk' && spec === 'Mistweaver') return 'Mistweaver';
  if (type === 'Druid' && spec === 'Restoration') return 'Restoration Druid';
  if (type === 'Evoker' && spec === 'Preservation') return 'Preservation Evoker';
  if (type === 'Priest' && spec === 'Discipline') return 'Discipline Priest';
  return `${spec} ${type}`;
}

const CD_SPELLS = {
  // MW
  115310: 'Revival', 388615: 'Restoral', 322118: "Yu'lon", 325197: "Chi-Ji",
  443028: 'Celestial Conduit', 116849: 'Life Cocoon', 116680: 'TFT',
  // RSham
  98008: 'Spirit Link', 114052: 'Ascendance',
  // HPal
  31884: 'Avenging Wrath', 216331: 'Avenging Crusader', 31821: 'Aura Mastery',
  6940: 'BoSac', 633: 'Lay on Hands',
  // HPriest
  64843: 'Divine Hymn', 200183: 'Apotheosis', 47788: 'Guardian Spirit',
  265202: 'Holy Word: Salvation',
};
const allCdIds = Object.keys(CD_SPELLS).map(Number);

async function main() {
  // Search MW Monk rankings
  console.log('STEP 3+4: FIND MATCHING COMPS & PULL HEALER CDs');
  console.log('Target: MW / HPal / RSham / HPriest (4 healer)');
  console.log('='.repeat(90));

  const data = await gql(`{
    worldData {
      encounter(id: ${ENC_BELOREN}) {
        characterRankings(difficulty: 5, className: "Monk", specName: "Mistweaver", metric: hps, page: 1)
      }
    }
  }`);

  const rankings = data.worldData.encounter.characterRankings?.rankings || [];
  console.log(`Found ${rankings.length} MW Monk rankings on Mythic Belo'ren\n`);

  let matchCount = 0;
  const teamResults = [];

  for (const r of rankings) {
    if (matchCount >= 5) break;
    const report = r.report?.code;
    const fight = r.report?.fightID;
    if (!report || !fight) continue;

    const meta = await gql(`{
      reportData {
        report(code: "${report}") {
          playerDetails(fightIDs: [${fight}])
          fights(fightIDs: [${fight}]) { startTime endTime }
        }
      }
    }`);

    const details = meta.reportData.report.playerDetails?.data?.playerDetails;
    const fightInfo = meta.reportData.report.fights[0];
    if (!fightInfo || !details?.healers) continue;

    const fightStart = fightInfo.startTime;
    const duration = (fightInfo.endTime - fightInfo.startTime) / 1000;

    const healerSpecs = details.healers.map(p => ({
      name: p.name,
      id: p.id,
      type: p.type,
      spec: p.specs?.[0]?.spec,
      key: specKey(p.specs?.[0]?.spec, p.type),
    }));

    const specSet = new Set(healerSpecs.map(h => h.key));
    const numHealers = healerSpecs.length;

    // Check for exact match (4 healers, all 4 target specs)
    const hasAll = TARGET_SPECS.isSubsetOf ? false :
      [...TARGET_SPECS].every(s => specSet.has(s));

    // Also accept 3/4 match
    const matchedSpecs = [...TARGET_SPECS].filter(s => specSet.has(s));
    const matchScore = matchedSpecs.length;

    if (matchScore >= 3) {
      matchCount++;
      const label = matchScore === 4 ? 'EXACT' : `${matchScore}/4`;
      console.log(`\n${'─'.repeat(90)}`);
      console.log(`  MATCH ${matchCount} [${label}] — ${report} fight ${fight} (${fmt(duration)}, ${numHealers} healers)`);
      console.log(`  Healers: ${healerSpecs.map(h => `${h.name} (${h.key})`).join(', ')}`);
      console.log(`${'─'.repeat(90)}`);

      // Pull CDs for each healer
      const teamCDs = [];

      for (const healer of healerSpecs) {
        const casts = await fetchAllEvents(report, fight, healer.id, 'Casts');
        const cdCasts = casts
          .filter(e => e.type === 'cast' && allCdIds.includes(e.abilityGameID))
          .sort((a, b) => a.timestamp - b.timestamp);

        console.log(`\n  ${healer.name} (${healer.key}):`);

        const bySpell = {};
        for (const e of cdCasts) {
          const name = CD_SPELLS[e.abilityGameID];
          if (name === 'TFT') continue; // skip rotational
          if (!bySpell[name]) bySpell[name] = [];
          bySpell[name].push((e.timestamp - fightStart) / 1000);
        }

        for (const [name, times] of Object.entries(bySpell)) {
          const timesStr = times.map(t => fmt(t)).join(', ');
          console.log(`    ${name.padEnd(22)} ${times.length}x — ${timesStr}`);
          for (const t of times) {
            teamCDs.push({ time: t, healer: healer.name, spec: healer.key, cd: name });
          }
        }

        const tftCount = cdCasts.filter(e => CD_SPELLS[e.abilityGameID] === 'TFT').length;
        if (tftCount > 0) console.log(`    TFT                    ${tftCount}x`);
      }

      // Merged timeline
      teamCDs.sort((a, b) => a.time - b.time);
      console.log(`\n  ── MERGED TIMELINE ──`);

      let windowStart = -100;
      let windowCDs = [];

      function flushWindow() {
        if (windowCDs.length === 0) return;
        const t = fmt(windowCDs[0].time);
        console.log(`\n    ${t}:`);
        for (const cd of windowCDs) {
          const offset = cd.time - windowCDs[0].time;
          const offsetStr = offset > 1 ? ` (+${offset.toFixed(0)}s)` : '';
          console.log(`      ${cd.spec.padEnd(20)} ${cd.cd}${offsetStr}`);
        }
      }

      for (const cd of teamCDs) {
        if (cd.time - windowStart > 12) {
          flushWindow();
          windowStart = cd.time;
          windowCDs = [cd];
        } else {
          windowCDs.push(cd);
        }
      }
      flushWindow();

      teamResults.push({ report, fight, duration, healerSpecs, teamCDs });
    }
  }

  if (matchCount < 5) {
    console.log(`\n\nOnly found ${matchCount} matches with 3+/4 specs. Searching HPal rankings for more...`);

    const hpalData = await gql(`{
      worldData {
        encounter(id: ${ENC_BELOREN}) {
          characterRankings(difficulty: 5, className: "Paladin", specName: "Holy", metric: hps, page: 1)
        }
      }
    }`);

    const hpalRankings = hpalData.worldData.encounter.characterRankings?.rankings || [];

    for (const r of hpalRankings) {
      if (matchCount >= 5) break;
      const report = r.report?.code;
      const fight = r.report?.fightID;
      if (!report || !fight) continue;
      if (teamResults.some(t => t.report === report && t.fight === fight)) continue;

      const meta = await gql(`{
        reportData {
          report(code: "${report}") {
            playerDetails(fightIDs: [${fight}])
            fights(fightIDs: [${fight}]) { startTime endTime }
          }
        }
      }`);

      const details = meta.reportData.report.playerDetails?.data?.playerDetails;
      const fightInfo = meta.reportData.report.fights[0];
      if (!fightInfo || !details?.healers) continue;

      const healerSpecs = details.healers.map(p => ({
        name: p.name, id: p.id, type: p.type,
        spec: p.specs?.[0]?.spec,
        key: specKey(p.specs?.[0]?.spec, p.type),
      }));

      const specSet = new Set(healerSpecs.map(h => h.key));
      const matchedSpecs = [...TARGET_SPECS].filter(s => specSet.has(s));
      if (matchedSpecs.length >= 3) {
        matchCount++;
        const fightStart = fightInfo.startTime;
        const duration = (fightInfo.endTime - fightInfo.startTime) / 1000;
        const label = matchedSpecs.length === 4 ? 'EXACT' : `${matchedSpecs.length}/4`;

        console.log(`\n${'─'.repeat(90)}`);
        console.log(`  MATCH ${matchCount} [${label}] — ${report} fight ${fight} (${fmt(duration)}, ${healerSpecs.length} healers)`);
        console.log(`  Healers: ${healerSpecs.map(h => `${h.name} (${h.key})`).join(', ')}`);
        console.log(`${'─'.repeat(90)}`);

        for (const healer of healerSpecs) {
          const casts = await fetchAllEvents(report, fight, healer.id, 'Casts');
          const cdCasts = casts
            .filter(e => e.type === 'cast' && allCdIds.includes(e.abilityGameID))
            .sort((a, b) => a.timestamp - b.timestamp);

          console.log(`\n  ${healer.name} (${healer.key}):`);

          for (const e of cdCasts) {
            const name = CD_SPELLS[e.abilityGameID];
            if (name === 'TFT') continue;
            const t = (e.timestamp - fightStart) / 1000;
            console.log(`    ${fmt(t).padStart(5)}  ${name}`);
          }
        }
      }
    }
  }

  console.log(`\n\n${'='.repeat(90)}`);
  console.log(`FOUND ${matchCount} MATCHING TEAMS`);
  console.log('='.repeat(90));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
