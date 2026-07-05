import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

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

function pad(s, n) { return String(s).padStart(n); }
function padEnd(s, n) { return String(s).padEnd(n); }

const RENEWING_MIST = 115151;
const VIVIFY = 116670;
const ENVELOPING_MIST = 124682;
const SOOTHING_MIST = 115175;
const THUNDER_FOCUS_TEA = 116680;
const CELESTIAL_CONDUIT = 443028;
const REVIVAL = 115310;
const RESTORAL = 388615;
const YULON = 322118;
const CHIJI = 325197;
const LIFE_COCOON = 116849;
const DPS_SPELLS = [100780, 100784, 228649, 205523, 107428, 185099, 101546];

function analyzePlayer(label, casts, healing, fightStart, fightEnd, isJosh = false) {
  const duration = (fightEnd - fightStart) / 1000;
  const durMin = duration / 60;

  const castTimeline = casts
    .filter(c => c.type === 'cast' || c.type === 'begincast')
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => ({
      time: (c.timestamp - fightStart) / 1000,
      spell: c.abilityGameID,
      type: c.type,
    }));

  const castOnly = castTimeline.filter(c => c.type === 'cast');
  const totalCPM = castOnly.length / durMin;

  const totalHealing = healing.reduce((s, h) => s + (h.amount || 0), 0);
  const totalOverheal = healing.reduce((s, h) => s + (h.overheal || 0), 0);
  const hps = Math.round(totalHealing / duration);
  const ohPct = totalHealing + totalOverheal > 0 ? ((totalOverheal / (totalHealing + totalOverheal)) * 100).toFixed(1) : '0.0';

  const count = (ids) => castOnly.filter(c => ids.includes(c.spell)).length;
  const cpm = (ids) => count(ids) / durMin;

  // ReM gaps
  const remCasts = castOnly.filter(c => c.spell === RENEWING_MIST);
  const remGaps = [];
  for (let i = 1; i < remCasts.length; i++) remGaps.push(remCasts[i].time - remCasts[i - 1].time);

  // Dead time
  const nonMove = castOnly.filter(c => ![109132, 115008].includes(c.spell));
  let totalDeadTime = 0, deadGapCount = 0;
  for (let i = 1; i < nonMove.length; i++) {
    const gap = nonMove[i].time - nonMove[i - 1].time;
    if (gap > 2.5) { totalDeadTime += gap - 1.5; deadGapCount++; }
  }

  // Vivify overheal
  const vivH = healing.filter(h => h.abilityGameID === VIVIFY);
  const vivTotal = vivH.reduce((s, h) => s + (h.amount || 0), 0);
  const vivOH = vivH.reduce((s, h) => s + (h.overheal || 0), 0);
  const vivOHpct = vivTotal + vivOH > 0 ? ((vivOH / (vivTotal + vivOH)) * 100).toFixed(0) : '0';

  // Soothing
  const soothCount = castTimeline.filter(c => c.spell === SOOTHING_MIST).length;

  // CD timings
  const cdTimes = (ids) => castOnly.filter(c => ids.includes(c.spell)).map(c => c.time);

  return {
    label, isJosh, duration, durMin, hps, ohPct, totalHealing,
    totalCasts: castOnly.length, totalCPM,
    remCPM: cpm([RENEWING_MIST]), remCount: count([RENEWING_MIST]),
    avgRemGap: remGaps.length > 0 ? remGaps.reduce((a, b) => a + b, 0) / remGaps.length : 0,
    maxRemGap: remGaps.length > 0 ? Math.max(...remGaps) : 0,
    vivCPM: cpm([VIVIFY]), vivCount: count([VIVIFY]), vivOHpct,
    emCPM: cpm([ENVELOPING_MIST]), emCount: count([ENVELOPING_MIST]),
    tftCPM: cpm([THUNDER_FOCUS_TEA]),
    soothCPM: soothCount / durMin, soothCount,
    dpsCount: count(DPS_SPELLS),
    ccCount: count([CELESTIAL_CONDUIT]),
    yulCount: count([YULON, CHIJI]),
    lcCount: count([LIFE_COCOON]),
    revCount: count([REVIVAL, RESTORAL]),
    deadTimePct: (totalDeadTime / duration * 100),
    totalDeadTime, deadGapCount,
    ccTimes: cdTimes([CELESTIAL_CONDUIT]),
    yulTimes: cdTimes([YULON, CHIJI]),
    lcTimes: cdTimes([LIFE_COCOON]),
    revTimes: cdTimes([REVIVAL, RESTORAL]),
    tftTimes: cdTimes([THUNDER_FOCUS_TEA]),
  };
}

const REPORT = process.argv[2] || 'B7h3VP1ndcXTQZ92';
const TARGET_FIGHT = process.argv[3] ? parseInt(process.argv[3]) : null;
const TARGET_BOSS = process.argv[4] || null;

async function main() {
  console.log('  Fetching report...');
  const reportMeta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        title
        fights(killType: Encounters) {
          id name encounterID difficulty kill startTime endTime fightPercentage
        }
      }
    }
  }`);

  const allFights = reportMeta.reportData.report.fights;

  let lastFight;
  if (TARGET_FIGHT) {
    lastFight = allFights.find(f => f.id === TARGET_FIGHT);
  } else if (TARGET_BOSS) {
    lastFight = allFights.find(f => f.name.toLowerCase().includes(TARGET_BOSS.toLowerCase()));
  } else {
    lastFight = allFights[allFights.length - 1];
  }
  if (!lastFight) { console.log('Fight not found. Available:', allFights.map(f => `#${f.id} ${f.name}`).join(', ')); return; }

  const FIGHT = lastFight.id;
  const ENCOUNTER_ID = lastFight.encounterID;
  const bossName = lastFight.name;
  const duration = (lastFight.endTime - lastFight.startTime) / 1000;
  const isKill = lastFight.kill;

  console.log(`  Report: ${reportMeta.reportData.report.title}`);
  console.log(`  Last fight: #${FIGHT} ${bossName} — ${isKill ? 'KILL' : 'WIPE (' + (lastFight.fightPercentage / 100).toFixed(1) + '%)'} — ${duration.toFixed(0)}s — ${lastFight.difficulty === 5 ? 'Mythic' : 'Heroic'}`);
  console.log(`  Encounter ID: ${ENCOUNTER_ID}`);
  console.log();

  // Step 2: Find Josh
  const fightMeta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { id startTime endTime }
      }
    }
  }`);

  const details = fightMeta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = fightMeta.reportData.report.fights[0];
  let joshSourceId = null, joshName = null;
  const JOSH_NAMES = ['senssay', 'mackspal'];
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (JOSH_NAMES.includes(p.name.toLowerCase())) {
        joshSourceId = p.id; joshName = p.name; break;
      }
    }
    if (joshSourceId) break;
  }

  if (!joshSourceId) {
    console.log('  Could not find Senssay/Mackspal. Players:');
    for (const [role, players] of Object.entries(details || {})) {
      if (!Array.isArray(players)) continue;
      for (const p of players) console.log(`    ${p.name} (${role}, ${p.icon})`);
    }
    return;
  }

  // Step 3: Pull Josh's data
  console.log(`  Pulling ${joshName} data...`);
  const [joshCasts, joshHealing] = await Promise.all([
    fetchAllEvents(REPORT, FIGHT, joshSourceId, 'Casts'),
    fetchAllEvents(REPORT, FIGHT, joshSourceId, 'Healing'),
  ]);
  console.log(`  Got ${joshCasts.length} casts, ${joshHealing.length} healing`);
  console.log();

  // Step 4: Find top 5 MW monks on this boss
  console.log(`  Finding top 5 MW Monks on Mythic ${bossName}...`);
  const rankings = await gql(`{
    worldData {
      encounter(id: ${ENCOUNTER_ID}) {
        characterRankings(
          className: "Monk"
          specName: "Mistweaver"
          difficulty: 5
          metric: hps
          page: 1
        )
      }
    }
  }`);

  const topList = rankings.worldData.encounter.characterRankings.rankings.slice(0, 5).map(r => ({
    name: r.name,
    server: r.server?.name || '',
    reportCode: r.report?.code,
    fightId: r.report?.fightID,
    hps: Math.round(r.amount),
    duration: r.duration,
  }));

  for (const tp of topList) {
    console.log(`    ${tp.name}-${tp.server}: ${tp.hps} HPS (${(tp.duration / 1000).toFixed(0)}s)`);
  }
  console.log();

  // Step 5: Pull top player data
  console.log('  Pulling top player data...');
  const allResults = [];

  const joshResult = analyzePlayer(joshName, joshCasts, joshHealing, fight.startTime, fight.endTime, true);
  allResults.push(joshResult);

  for (const tp of topList) {
    try {
      const meta = await gql(`{
        reportData {
          report(code: "${tp.reportCode}") {
            playerDetails(fightIDs: [${tp.fightId}])
            fights(fightIDs: [${tp.fightId}]) { id startTime endTime }
          }
        }
      }`);
      const det = meta.reportData.report.playerDetails?.data?.playerDetails;
      const f = meta.reportData.report.fights[0];
      let sid = null;
      for (const role of Object.values(det || {})) {
        if (!Array.isArray(role)) continue;
        for (const p of role) {
          if (p.name === tp.name) { sid = p.id; break; }
        }
        if (sid) break;
      }
      if (!sid) { console.log(`    ${tp.name}: NOT FOUND`); continue; }

      const [c, h] = await Promise.all([
        fetchAllEvents(tp.reportCode, tp.fightId, sid, 'Casts'),
        fetchAllEvents(tp.reportCode, tp.fightId, sid, 'Healing'),
      ]);
      console.log(`    ${tp.name}: ${c.length} casts, ${h.length} healing`);
      allResults.push(analyzePlayer(tp.name, c, h, f.startTime, f.endTime));
    } catch (e) {
      console.log(`    ${tp.name}: FAILED — ${e.message.slice(0, 80)}`);
    }
  }
  console.log();

  const josh = allResults.find(r => r.isJosh);
  const tops = allResults.filter(r => !r.isJosh);
  const all = [josh, ...tops];
  const topAvg = (fn) => tops.length > 0 ? tops.map(fn).reduce((a, b) => a + b, 0) / tops.length : 0;

  // ── OVERVIEW TABLE ──────────────────────────────────────────
  console.log('='.repeat(120));
  console.log(`  ${bossName.toUpperCase()} — PLAYER OVERVIEW`);
  console.log('='.repeat(120));
  console.log();

  const colW = 14;
  let header = '  ' + padEnd('', 22);
  for (const p of all) header += '  ' + pad(p.label, colW);
  console.log(header);
  console.log('  ' + '-'.repeat(22 + all.length * (colW + 2)));

  const printRow = (label, fn) => {
    let row = '  ' + padEnd(label, 22);
    for (const p of all) row += '  ' + pad(fn(p), colW);
    console.log(row);
  };

  printRow('HPS', p => p.hps.toLocaleString());
  printRow('Fight Duration', p => p.duration.toFixed(0) + 's');
  printRow('Total CPM', p => p.totalCPM.toFixed(1));
  printRow('Dead Time %', p => p.deadTimePct.toFixed(1) + '%');
  printRow('Overheal %', p => p.ohPct + '%');
  console.log();

  // ── CPM TABLE ───────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  CASTS PER MINUTE — KEY SPELLS');
  console.log('='.repeat(120));
  console.log();

  {
    let h = '  ' + padEnd('Spell', 22);
    for (const p of all) h += '  ' + pad(p.label, colW);
    h += '  ' + pad('Top5 Avg', colW);
    console.log(h);
    console.log('  ' + '-'.repeat(22 + (all.length + 1) * (colW + 2)));

    const rows = [
      { label: 'Renewing Mist', fn: p => p.remCPM },
      { label: 'Vivify', fn: p => p.vivCPM },
      { label: 'Enveloping Mist', fn: p => p.emCPM },
      { label: 'Thunder Focus Tea', fn: p => p.tftCPM },
      { label: 'Soothing Mist', fn: p => p.soothCPM },
      { label: 'DPS spells', fn: p => p.dpsCount / p.durMin },
    ];

    for (const s of rows) {
      let row = '  ' + padEnd(s.label, 22);
      for (const p of all) row += '  ' + pad(s.fn(p).toFixed(1), colW);
      row += '  ' + pad(topAvg(s.fn).toFixed(1), colW);
      console.log(row);
    }
  }
  console.log();

  // ── ReM ─────────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  RENEWING MIST MANAGEMENT');
  console.log('='.repeat(120));
  console.log();
  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.remCount} casts (${p.remCPM.toFixed(1)}/min), avg gap ${p.avgRemGap.toFixed(1)}s, max gap ${p.maxRemGap.toFixed(1)}s${tag}`);
  }
  console.log();

  // ── VIVIFY ──────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  VIVIFY EFFICIENCY');
  console.log('='.repeat(120));
  console.log();
  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.vivCount} casts (${p.vivCPM.toFixed(1)}/min), ${p.vivOHpct}% overheal${tag}`);
  }
  console.log();

  // ── CDs ─────────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  COOLDOWN USAGE');
  console.log('='.repeat(120));
  console.log();

  const cdGroups = [
    { key: 'rev', label: 'Revival (3min)', fn: p => p.revTimes },
    { key: 'yul', label: "Yu'lon/Chi-Ji (2min)", fn: p => p.yulTimes },
    { key: 'cc', label: 'Celestial Conduit (90s)', fn: p => p.ccTimes },
    { key: 'lc', label: 'Life Cocoon (2min)', fn: p => p.lcTimes },
  ];

  for (const cd of cdGroups) {
    console.log(`  ${cd.label}:`);
    for (const p of all) {
      const times = cd.fn(p);
      const str = times.map(t => t.toFixed(0) + 's').join(', ') || 'NEVER';
      const gaps = [];
      for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]).toFixed(0));
      const gapStr = gaps.length > 0 ? ` (gaps: ${gaps.join('s, ')}s)` : '';
      const tag = p.isJosh ? ' <-- YOU' : '';
      console.log(`    ${padEnd(p.label, 16)}: ${times.length}x at ${str}${gapStr}${tag}`);
    }
    console.log();
  }

  // ── DEAD TIME ───────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  DEAD TIME');
  console.log('='.repeat(120));
  console.log();
  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.totalDeadTime.toFixed(1)}s (${p.deadTimePct.toFixed(1)}%), ${p.deadGapCount} gaps${tag}`);
  }
  console.log();

  // ── SCORECARD ───────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log(`  SCORECARD: ${joshName} vs Top 5 ${bossName} Average`);
  console.log('='.repeat(120));
  console.log();

  function grade(label, yours, avg, higherBetter = true) {
    const pct = avg !== 0 ? ((yours / avg) * 100).toFixed(0) : 'N/A';
    const status = higherBetter
      ? (yours >= avg * 0.95 ? 'GOOD' : yours >= avg * 0.8 ? 'CLOSE' : yours >= avg * 0.6 ? 'GAP' : 'BIG GAP')
      : (yours <= avg * 1.05 ? 'GOOD' : yours <= avg * 1.3 ? 'CLOSE' : yours <= avg * 1.6 ? 'GAP' : 'BIG GAP');
    const y = typeof yours === 'number' ? (Number.isInteger(yours) ? yours : yours.toFixed(1)) : yours;
    const a = typeof avg === 'number' ? (Number.isInteger(avg) ? avg : avg.toFixed(1)) : avg;
    console.log(`    ${padEnd(label, 24)} You: ${pad(y, 8)}  Top5: ${pad(a, 8)}  (${pct}%)  ${status}`);
  }

  grade('HPS', josh.hps, topAvg(p => p.hps));
  grade('Total CPM', josh.totalCPM, topAvg(p => p.totalCPM));
  grade('Renewing Mist CPM', josh.remCPM, topAvg(p => p.remCPM));
  grade('Vivify CPM', josh.vivCPM, topAvg(p => p.vivCPM));
  grade('Enveloping Mist CPM', josh.emCPM, topAvg(p => p.emCPM));
  grade('TFT CPM', josh.tftCPM, topAvg(p => p.tftCPM));
  grade('Dead Time %', josh.deadTimePct, topAvg(p => p.deadTimePct), false);
  grade('Vivify Overheal %', parseInt(josh.vivOHpct), topAvg(p => parseInt(p.vivOHpct)), false);
  grade('Soothing Mist CPM', josh.soothCPM, topAvg(p => p.soothCPM), false);
  grade('CC uses', josh.ccCount, topAvg(p => p.ccCount));
  grade("Yu'lon uses", josh.yulCount, topAvg(p => p.yulCount));
  grade('Life Cocoon uses', josh.lcCount, topAvg(p => p.lcCount));
  grade('Revival uses', josh.revCount, topAvg(p => p.revCount));
  console.log();
  console.log('='.repeat(120));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
