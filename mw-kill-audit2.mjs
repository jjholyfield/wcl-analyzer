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

const REPORT = 'nWbjJHDraydg4qGz';
const FIGHT = 19;
const ENCOUNTER_ID = 3306; // Chimaerus

const SOOTHING_MIST = 115175;
const VIVIFY = 116670;
const ENVELOPING_MIST = 124682;
const RENEWING_MIST = 115151;
const THUNDER_FOCUS_TEA = 116680;
const CELESTIAL_CONDUIT = 443028;
const REVIVAL = 115310;
const RESTORAL = 388615;
const YULON = 322118;
const CHIJI = 325197;
const LIFE_COCOON = 116849;
const DPS_SPELLS = [100780, 100784, 228649, 205523, 107428, 185099, 101546];

function spellName(id) {
  const names = {
    115175: 'Soothing Mist', 116670: 'Vivify', 124682: 'Enveloping Mist',
    115151: 'Renewing Mist', 191837: 'Essence Font', 116680: 'Thunder Focus Tea',
    443028: 'Celestial Conduit', 115310: 'Revival', 388615: 'Restoral',
    322118: "Invoke Yu'lon", 325197: 'Invoke Chi-Ji', 116849: 'Life Cocoon',
    100780: 'Tiger Palm', 100784: 'Blackout Kick', 228649: 'Blackout Kick',
    107428: 'Rising Sun Kick', 185099: 'Rising Sun Kick', 101546: 'Spinning Crane Kick',
    388193: 'Jadefire Stomp', 327104: 'Jadefire Stomp', 123986: 'Chi Burst',
    325216: 'Bonedust Brew', 205523: 'Blackout Kick (proc)', 1: 'Melee',
  };
  return names[id] || `spell-${id}`;
}

function pad(s, n) { return String(s).padStart(n); }
function padEnd(s, n) { return String(s).padEnd(n); }

async function pullPlayerFull(reportCode, fightId, playerName) {
  const meta = await gql(`{
    reportData {
      report(code: "${reportCode}") {
        playerDetails(fightIDs: [${fightId}])
        fights(fightIDs: [${fightId}]) { id startTime endTime }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];

  let sourceId = null;
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (p.name === playerName) { sourceId = p.id; break; }
    }
    if (sourceId) break;
  }
  if (!sourceId) return null;

  const [casts, healing] = await Promise.all([
    fetchAllEvents(reportCode, fightId, sourceId, 'Casts'),
    fetchAllEvents(reportCode, fightId, sourceId, 'Healing'),
  ]);

  return { casts, healing, fight, sourceId };
}

function analyzePlayer(label, casts, healing, fightStart, fightEnd, isJosh = false) {
  const duration = (fightEnd - fightStart) / 1000;
  const durMin = duration / 60;

  const castTimeline = casts
    .filter(c => c.type === 'cast' || c.type === 'begincast')
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => ({
      time: (c.timestamp - fightStart) / 1000,
      spell: c.abilityGameID,
      name: spellName(c.abilityGameID),
      type: c.type,
    }));

  const castOnly = castTimeline.filter(c => c.type === 'cast');
  const totalCasts = castOnly.length;
  const totalCPM = totalCasts / durMin;

  const totalHealing = healing.reduce((s, h) => s + (h.amount || 0), 0);
  const totalOverheal = healing.reduce((s, h) => s + (h.overheal || 0), 0);
  const hps = Math.round(totalHealing / duration);
  const ohPct = totalHealing + totalOverheal > 0 ? ((totalOverheal / (totalHealing + totalOverheal)) * 100).toFixed(1) : '0.0';

  // Key spell counts
  const remCount = castOnly.filter(c => c.spell === RENEWING_MIST).length;
  const vivCount = castOnly.filter(c => c.spell === VIVIFY).length;
  const emCount = castOnly.filter(c => c.spell === ENVELOPING_MIST).length;
  const tftCount = castOnly.filter(c => c.spell === THUNDER_FOCUS_TEA).length;
  const soothCount = castTimeline.filter(c => c.spell === SOOTHING_MIST).length;
  const dpsCount = castOnly.filter(c => DPS_SPELLS.includes(c.spell)).length;
  const ccCount = castOnly.filter(c => c.spell === CELESTIAL_CONDUIT).length;
  const yulCount = castOnly.filter(c => [YULON, CHIJI].includes(c.spell)).length;
  const lcCount = castOnly.filter(c => c.spell === LIFE_COCOON).length;
  const revCount = castOnly.filter(c => [REVIVAL, RESTORAL].includes(c.spell)).length;

  // ReM gaps
  const remCasts = castOnly.filter(c => c.spell === RENEWING_MIST);
  const remGaps = [];
  for (let i = 1; i < remCasts.length; i++) remGaps.push(remCasts[i].time - remCasts[i - 1].time);
  const avgRemGap = remGaps.length > 0 ? remGaps.reduce((a, b) => a + b, 0) / remGaps.length : 0;
  const maxRemGap = remGaps.length > 0 ? Math.max(...remGaps) : 0;

  // Dead time
  const nonMoveCasts = castOnly.filter(c => ![109132, 115008].includes(c.spell));
  let totalDeadTime = 0;
  let deadGapCount = 0;
  for (let i = 1; i < nonMoveCasts.length; i++) {
    const gap = nonMoveCasts[i].time - nonMoveCasts[i - 1].time;
    if (gap > 2.5) { totalDeadTime += gap - 1.5; deadGapCount++; }
  }

  // Vivify overheal
  const vivHealing = healing.filter(h => h.abilityGameID === VIVIFY);
  const vivTotal = vivHealing.reduce((s, h) => s + (h.amount || 0), 0);
  const vivOH = vivHealing.reduce((s, h) => s + (h.overheal || 0), 0);
  const vivOHpct = vivTotal + vivOH > 0 ? ((vivOH / (vivTotal + vivOH)) * 100).toFixed(0) : '0';

  // CD timings
  const cdTimings = {};
  for (const group of [
    { key: 'revival', ids: [REVIVAL, RESTORAL] },
    { key: 'yulon', ids: [YULON, CHIJI] },
    { key: 'cc', ids: [CELESTIAL_CONDUIT] },
    { key: 'lc', ids: [LIFE_COCOON] },
    { key: 'tft', ids: [THUNDER_FOCUS_TEA] },
  ]) {
    cdTimings[group.key] = castOnly.filter(c => group.ids.includes(c.spell)).map(c => c.time);
  }

  // Soothing before Viv/EM
  let soothBeforeViv = 0, soothBeforeEM = 0;
  for (let i = 0; i < castTimeline.length; i++) {
    if (castTimeline[i].spell === SOOTHING_MIST) {
      for (let j = i + 1; j < castTimeline.length; j++) {
        if (castTimeline[j].spell === VIVIFY) soothBeforeViv++;
        else if (castTimeline[j].spell === ENVELOPING_MIST) soothBeforeEM++;
        else break;
      }
    }
  }

  return {
    label, isJosh, duration, durMin, hps, ohPct, totalHealing,
    totalCasts, totalCPM,
    remCount, remCPM: remCount / durMin, avgRemGap, maxRemGap,
    vivCount, vivCPM: vivCount / durMin, vivOHpct,
    emCount, emCPM: emCount / durMin,
    tftCount, tftCPM: tftCount / durMin,
    soothCount, soothCPM: soothCount / durMin, soothBeforeViv, soothBeforeEM,
    dpsCount,
    ccCount, yulCount, lcCount, revCount,
    deadTimePct: (totalDeadTime / duration * 100),
    deadGapCount, totalDeadTime,
    cdTimings,
  };
}

async function main() {
  console.log('='.repeat(120));
  console.log('  MW MONK KILL AUDIT: Senssay vs Top 5 MW Monks on Mythic Chimaerus');
  console.log('='.repeat(120));
  console.log();

  // Step 1: Get Josh's data
  console.log('  [1/3] Pulling Senssay data from tonight\'s kill...');
  const joshMeta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        title
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { id name encounterID difficulty kill startTime endTime }
      }
    }
  }`);

  const joshFight = joshMeta.reportData.report.fights[0];
  const joshDetails = joshMeta.reportData.report.playerDetails?.data?.playerDetails;
  let joshSourceId = null;
  const JOSH_NAMES = ['senssay', 'mackspal'];
  for (const role of Object.values(joshDetails || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (JOSH_NAMES.includes(p.name.toLowerCase())) { joshSourceId = p.id; break; }
    }
    if (joshSourceId) break;
  }

  const [joshCasts, joshHealing] = await Promise.all([
    fetchAllEvents(REPORT, FIGHT, joshSourceId, 'Casts'),
    fetchAllEvents(REPORT, FIGHT, joshSourceId, 'Healing'),
  ]);
  console.log(`  ${joshFight.name} — ${joshFight.kill ? 'KILL' : 'WIPE'} — ${((joshFight.endTime - joshFight.startTime) / 1000).toFixed(0)}s`);
  console.log(`  Got ${joshCasts.length} casts, ${joshHealing.length} healing events`);
  console.log();

  // Step 2: Find top 5 MW monks on Chimaerus
  console.log('  [2/3] Finding top 5 MW Monks on Mythic Chimaerus...');
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

  // Step 3: Pull top player data
  console.log('  [3/3] Pulling cast data for top 5...');
  const allResults = [];

  // Josh first
  const joshResult = analyzePlayer('Senssay', joshCasts, joshHealing, joshFight.startTime, joshFight.endTime, true);
  allResults.push(joshResult);

  // Top players
  for (const tp of topList) {
    try {
      const data = await pullPlayerFull(tp.reportCode, tp.fightId, tp.name);
      if (!data) { console.log(`    ${tp.name}: NOT FOUND`); continue; }
      console.log(`    ${tp.name}: ${data.casts.length} casts, ${data.healing.length} healing`);
      const result = analyzePlayer(tp.name, data.casts, data.healing, data.fight.startTime, data.fight.endTime);
      allResults.push(result);
    } catch (e) {
      console.log(`    ${tp.name}: FAILED — ${e.message}`);
    }
  }
  console.log();

  const tops = allResults.filter(r => !r.isJosh);
  const josh = allResults.find(r => r.isJosh);

  function topAvg(fn) {
    if (tops.length === 0) return 0;
    return tops.map(fn).reduce((a, b) => a + b, 0) / tops.length;
  }

  // ── PLAYER OVERVIEW TABLE ───────────────────────────────────
  console.log('='.repeat(120));
  console.log('  PLAYER OVERVIEW');
  console.log('='.repeat(120));
  console.log();

  const colW = 14;
  const all = [josh, ...tops];

  let header = '  ' + padEnd('', 22);
  for (const p of all) header += '  ' + pad(p.label, colW);
  console.log(header);
  console.log('  ' + '-'.repeat(22 + all.length * (colW + 2)));

  function printRow(label, fn) {
    let row = '  ' + padEnd(label, 22);
    for (const p of all) row += '  ' + pad(fn(p), colW);
    console.log(row);
  }

  printRow('HPS', p => p.hps.toLocaleString());
  printRow('Fight Duration', p => p.duration.toFixed(0) + 's');
  printRow('Total Healing', p => (p.totalHealing / 1e6).toFixed(1) + 'M');
  printRow('Overheal %', p => p.ohPct + '%');
  printRow('Total CPM', p => p.totalCPM.toFixed(1));
  printRow('Dead Time %', p => p.deadTimePct.toFixed(1) + '%');
  console.log();

  // ── CPM COMPARISON ──────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  CASTS PER MINUTE — KEY SPELLS');
  console.log('='.repeat(120));
  console.log();

  const spellRows = [
    { label: 'Renewing Mist', fn: p => p.remCPM },
    { label: 'Vivify', fn: p => p.vivCPM },
    { label: 'Enveloping Mist', fn: p => p.emCPM },
    { label: 'Thunder Focus Tea', fn: p => p.tftCPM },
    { label: 'Soothing Mist', fn: p => p.soothCPM },
    { label: 'DPS spells', fn: p => p.dpsCount / p.durMin },
  ];

  {
    let h = '  ' + padEnd('Spell', 22);
    for (const p of all) h += '  ' + pad(p.label, colW);
    h += '  ' + pad('Top5 Avg', colW);
    console.log(h);
    console.log('  ' + '-'.repeat(22 + (all.length + 1) * (colW + 2)));

    for (const s of spellRows) {
      let row = '  ' + padEnd(s.label, 22);
      for (const p of all) row += '  ' + pad(s.fn(p).toFixed(1), colW);
      row += '  ' + pad(topAvg(s.fn).toFixed(1), colW);
      console.log(row);
    }
  }
  console.log();

  // ── ReM MANAGEMENT ──────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  RENEWING MIST MANAGEMENT');
  console.log('='.repeat(120));
  console.log();

  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.remCount} casts (${p.remCPM.toFixed(1)}/min), avg gap ${p.avgRemGap.toFixed(1)}s, max gap ${p.maxRemGap.toFixed(1)}s${tag}`);
  }
  console.log();

  // ── VIVIFY OVERHEAL ─────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  VIVIFY EFFICIENCY');
  console.log('='.repeat(120));
  console.log();

  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.vivCount} casts (${p.vivCPM.toFixed(1)}/min), ${p.vivOHpct}% overheal${tag}`);
  }
  console.log();

  // ── CD USAGE ────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  COOLDOWN USAGE TIMING');
  console.log('='.repeat(120));
  console.log();

  const cdGroups = [
    { key: 'revival', label: 'Revival/Restoral (3min)' },
    { key: 'yulon', label: "Yu'lon/Chi-Ji (2min)" },
    { key: 'cc', label: 'Celestial Conduit (90s)' },
    { key: 'lc', label: 'Life Cocoon (~1min)' },
  ];

  for (const cd of cdGroups) {
    console.log(`  ${cd.label}:`);
    for (const p of all) {
      const times = p.cdTimings[cd.key];
      const timingsStr = times.map(t => t.toFixed(0) + 's').join(', ') || 'NEVER';
      const gaps = [];
      for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]).toFixed(0));
      const gapStr = gaps.length > 0 ? ` (gaps: ${gaps.join('s, ')}s)` : '';
      const tag = p.isJosh ? ' <-- YOU' : '';
      console.log(`    ${padEnd(p.label, 16)}: ${times.length}x at ${timingsStr}${gapStr}${tag}`);
    }
    console.log();
  }

  // ── SOOTHING MIST ───────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  SOOTHING MIST USAGE');
  console.log('='.repeat(120));
  console.log();

  for (const p of all) {
    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.label, 16)}: ${p.soothCount} channels (${p.soothCPM.toFixed(1)}/min), ${p.soothBeforeViv} Viv + ${p.soothBeforeEM} EM through SooM${tag}`);
  }
  console.log();

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
  console.log('  SCORECARD: Senssay vs Top 5 Chimaerus Average');
  console.log('='.repeat(120));
  console.log();

  function grade(label, yours, avg, higherBetter = true) {
    const pct = avg !== 0 ? ((yours / avg) * 100).toFixed(0) : 'N/A';
    const status = higherBetter
      ? (yours >= avg * 0.95 ? 'GOOD' : yours >= avg * 0.8 ? 'CLOSE' : yours >= avg * 0.6 ? 'GAP' : 'BIG GAP')
      : (yours <= avg * 1.05 ? 'GOOD' : yours <= avg * 1.3 ? 'CLOSE' : yours <= avg * 1.6 ? 'GAP' : 'BIG GAP');
    console.log(`    ${padEnd(label, 24)} You: ${pad(typeof yours === 'number' ? (Number.isInteger(yours) ? yours : yours.toFixed(1)) : yours, 8)}  Top5: ${pad(typeof avg === 'number' ? (Number.isInteger(avg) ? avg : avg.toFixed(1)) : avg, 8)}  (${pct}%)  ${status}`);
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
