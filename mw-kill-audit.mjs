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

const SPELL_NAMES = {
  115175: 'Soothing Mist', 116670: 'Vivify', 124682: 'Enveloping Mist',
  115151: 'Renewing Mist', 191837: 'Essence Font', 116680: 'Thunder Focus Tea',
  443028: 'Celestial Conduit', 115310: 'Revival', 388615: 'Restoral',
  322118: "Invoke Yu'lon", 325197: 'Invoke Chi-Ji', 116849: 'Life Cocoon',
  100780: 'Tiger Palm', 100784: 'Blackout Kick', 228649: 'Blackout Kick',
  107428: 'Rising Sun Kick', 185099: 'Rising Sun Kick', 101546: 'Spinning Crane Kick',
  388193: 'Jadefire Stomp', 327104: 'Jadefire Stomp', 123986: 'Chi Burst',
  325216: 'Bonedust Brew', 205523: 'Blackout Kick (proc)', 1: 'Melee',
};

function spellName(id) { return SPELL_NAMES[id] || `spell-${id}`; }

// Top 5 benchmarks from last night's audit
const TOP5_BENCHMARKS = {
  totalCPM: 59.7,
  remCPM: 10.1,
  vivCPM: 15.8,
  emCPM: 8.2,
  tftCPM: 2.7,
  ccUsesPer5min: 4.5,
  yulUsesPer5min: 3.5,
  lcUsesPer5min: 5.3,
  soothCPM: 0.6,
  deadTimePct: 4.4,
};

async function main() {
  // Get fight info and find Senssay
  const meta = await gql(`{
    reportData {
      report(code: "${REPORT}") {
        title
        playerDetails(fightIDs: [${FIGHT}])
        fights(fightIDs: [${FIGHT}]) { id name encounterID difficulty kill startTime endTime fightPercentage }
      }
    }
  }`);

  const fight = meta.reportData.report.fights[0];
  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const duration = (fight.endTime - fight.startTime) / 1000;
  const fightStart = fight.startTime;

  console.log('='.repeat(110));
  console.log(`  MW MONK KILL AUDIT: ${fight.name} — ${meta.reportData.report.title}`);
  console.log(`  ${fight.kill ? 'KILL' : 'WIPE (' + (fight.fightPercentage / 100).toFixed(1) + '%)'} — ${duration.toFixed(0)}s — Difficulty ${fight.difficulty === 5 ? 'Mythic' : fight.difficulty === 4 ? 'Heroic' : fight.difficulty}`);
  console.log('='.repeat(110));
  console.log();

  // Find Senssay
  let sourceId = null;
  let playerSpec = '';
  const JOSH_NAMES = ['senssay', 'mackspal'];
  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const p of role) {
      if (JOSH_NAMES.includes(p.name.toLowerCase())) {
        sourceId = p.id;
        playerSpec = p.icon || p.type || '';
        console.log(`  Player: ${p.name} (${playerSpec}, sourceID ${sourceId})`);
        break;
      }
    }
    if (sourceId) break;
  }

  if (!sourceId) {
    console.log('  ERROR: Could not find Senssay/Mackspal in fight');
    console.log('  Players found:');
    for (const [role, players] of Object.entries(details || {})) {
      if (!Array.isArray(players)) continue;
      for (const p of players) console.log(`    ${p.name} (${role}, ${p.icon})`);
    }
    return;
  }

  // Pull data
  console.log('  Pulling cast + healing data...');
  const [casts, healing] = await Promise.all([
    fetchAllEvents(REPORT, FIGHT, sourceId, 'Casts'),
    fetchAllEvents(REPORT, FIGHT, sourceId, 'Healing'),
  ]);
  console.log(`  Got ${casts.length} casts, ${healing.length} healing events`);
  console.log();

  const castTimeline = casts
    .filter(c => c.type === 'cast' || c.type === 'begincast')
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => ({
      time: (c.timestamp - fightStart) / 1000,
      timestamp: c.timestamp,
      spell: c.abilityGameID,
      name: spellName(c.abilityGameID),
      type: c.type,
    }));

  const castOnly = castTimeline.filter(c => c.type === 'cast');
  const durMin = duration / 60;

  // ── OVERVIEW ────────────────────────────────────────────────
  const totalCasts = castOnly.length;
  const totalCPM = totalCasts / durMin;

  const totalHealing = healing.reduce((s, h) => s + (h.amount || 0), 0);
  const totalOverheal = healing.reduce((s, h) => s + (h.overheal || 0), 0);
  const hps = Math.round(totalHealing / duration);
  const ohPct = totalHealing + totalOverheal > 0 ? ((totalOverheal / (totalHealing + totalOverheal)) * 100).toFixed(1) : '0.0';

  console.log('  ── OVERVIEW ──────────────────────────────────────────────');
  console.log(`  HPS: ${hps.toLocaleString()}    Total Healing: ${(totalHealing / 1e6).toFixed(1)}M    Overheal: ${ohPct}%`);
  console.log(`  Total Casts: ${totalCasts}    CPM: ${totalCPM.toFixed(1)}    (Top 5 avg: ${TOP5_BENCHMARKS.totalCPM})`);
  console.log();

  // ── KEY SPELL CPMs ──────────────────────────────────────────
  console.log('  ── KEY SPELLS (you vs top 5 benchmark) ────────────────');

  const spellChecks = [
    { ids: [RENEWING_MIST], name: 'Renewing Mist', bench: TOP5_BENCHMARKS.remCPM },
    { ids: [VIVIFY], name: 'Vivify', bench: TOP5_BENCHMARKS.vivCPM },
    { ids: [ENVELOPING_MIST], name: 'Enveloping Mist', bench: TOP5_BENCHMARKS.emCPM },
    { ids: [THUNDER_FOCUS_TEA], name: 'Thunder Focus Tea', bench: TOP5_BENCHMARKS.tftCPM },
    { ids: [SOOTHING_MIST], name: 'Soothing Mist', bench: TOP5_BENCHMARKS.soothCPM, lower: true },
  ];

  for (const s of spellChecks) {
    const count = castOnly.filter(c => s.ids.includes(c.spell)).length;
    const cpm = (count / durMin).toFixed(1);
    const diff = (parseFloat(cpm) - s.bench).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    const verdict = s.lower
      ? (parseFloat(cpm) > s.bench * 1.5 ? ' !! TOO HIGH' : ' OK')
      : (parseFloat(cpm) >= s.bench * 0.85 ? ' OK' : parseFloat(cpm) >= s.bench * 0.7 ? ' LOW' : ' !! WAY LOW');
    console.log(`    ${s.name.padEnd(22)} ${String(count).padStart(3)} casts  ${cpm.padStart(5)}/min  (top5: ${s.bench})  ${sign}${diff}${verdict}`);
  }

  // DPS spells (should be 0)
  const dpsSpells = [100780, 100784, 228649, 205523, 107428, 185099, 101546];
  const dpsCount = castOnly.filter(c => dpsSpells.includes(c.spell)).length;
  if (dpsCount > 0) {
    console.log(`    ${'DPS spells (BOK/RSK/TP)'.padEnd(22)} ${String(dpsCount).padStart(3)} casts  — top players cast 0. Each one = wasted GCD`);
  } else {
    console.log(`    ${'DPS spells (BOK/RSK/TP)'.padEnd(22)}   0 casts  — GOOD (matches top players)`);
  }
  console.log();

  // ── CD USAGE ────────────────────────────────────────────────
  console.log('  ── COOLDOWN USAGE ────────────────────────────────────');

  const cdChecks = [
    { ids: [REVIVAL, RESTORAL], name: 'Revival/Restoral', cd: 180 },
    { ids: [YULON, CHIJI], name: "Yu'lon/Chi-Ji", cd: 120 },
    { ids: [CELESTIAL_CONDUIT], name: 'Celestial Conduit', cd: 90 },
    { ids: [LIFE_COCOON], name: 'Life Cocoon', cd: 60 },
    { ids: [THUNDER_FOCUS_TEA], name: 'Thunder Focus Tea', cd: 20 },
  ];

  for (const cd of cdChecks) {
    const uses = castOnly.filter(c => cd.ids.includes(c.spell));
    const expected = Math.floor(duration / cd.cd) + 1;
    const timings = uses.map(u => u.time.toFixed(0) + 's').join(', ') || 'NEVER';
    const gaps = [];
    for (let i = 1; i < uses.length; i++) gaps.push((uses[i].time - uses[i - 1].time).toFixed(0));
    const maxGap = gaps.length > 0 ? Math.max(...gaps.map(Number)) : null;
    const verdict = uses.length >= expected - 1 ? 'OK' : uses.length >= expected - 2 ? 'MISSED 1' : `MISSED ${expected - 1 - uses.length}`;

    console.log(`    ${cd.name.padEnd(22)} ${uses.length}x (could fit ${expected - 1}) at ${timings}`);
    if (gaps.length > 0) {
      console.log(`    ${''.padEnd(22)} gaps: ${gaps.join('s, ')}s${maxGap > cd.cd * 1.3 ? ` !! ${maxGap}s gap (CD is ${cd.cd}s)` : ''}`);
    }
  }
  console.log();

  // ── SOOTHING MIST CHECK ─────────────────────────────────────
  console.log('  ── SOOTHING MIST HABITS ──────────────────────────────');

  const soothCasts = castTimeline.filter(c => c.spell === SOOTHING_MIST);
  const soothCount = soothCasts.length;

  let vivInSooth = 0, emInSooth = 0;
  for (let i = 0; i < castTimeline.length; i++) {
    if (castTimeline[i].spell === SOOTHING_MIST) {
      for (let j = i + 1; j < castTimeline.length; j++) {
        if (castTimeline[j].spell === VIVIFY) { vivInSooth++; }
        else if (castTimeline[j].spell === ENVELOPING_MIST) { emInSooth++; }
        else break;
      }
    }
  }

  const vivTotal = castOnly.filter(c => c.spell === VIVIFY).length;
  const emTotal = castOnly.filter(c => c.spell === ENVELOPING_MIST).length;

  console.log(`    Soothing Mist channels: ${soothCount} (${(soothCount / durMin).toFixed(1)}/min — top5: ${TOP5_BENCHMARKS.soothCPM}/min)`);
  console.log(`    Vivify through SooM: ${vivInSooth}/${vivTotal} (${vivTotal > 0 ? ((vivInSooth / vivTotal) * 100).toFixed(0) : 0}%)`);
  console.log(`    EM through SooM: ${emInSooth}/${emTotal} (${emTotal > 0 ? ((emInSooth / emTotal) * 100).toFixed(0) : 0}%)`);

  if (soothCount <= 3) {
    console.log(`    GOOD — minimal Soothing Mist usage, direct-casting like top players`);
  } else if (soothCount <= 6) {
    console.log(`    IMPROVED — down from 11 last session, but still higher than top players (1-6 total)`);
  } else {
    console.log(`    !! Still channeling too much SooM — drop it entirely, direct cast Viv/EM`);
  }
  console.log();

  // ── DEAD TIME ───────────────────────────────────────────────
  console.log('  ── DEAD TIME (gaps > 2.5s between casts) ─────────────');

  const nonMoveCasts = castOnly.filter(c => ![109132, 115008].includes(c.spell)); // exclude Roll/Chi Torpedo
  let deadGaps = [];
  let totalDeadTime = 0;
  for (let i = 1; i < nonMoveCasts.length; i++) {
    const gap = nonMoveCasts[i].time - nonMoveCasts[i - 1].time;
    if (gap > 2.5) {
      deadGaps.push({ start: nonMoveCasts[i - 1].time, end: nonMoveCasts[i].time, gap, before: nonMoveCasts[i - 1].name, after: nonMoveCasts[i].name });
      totalDeadTime += gap - 1.5;
    }
  }

  console.log(`    Total dead time: ${totalDeadTime.toFixed(1)}s (${(totalDeadTime / duration * 100).toFixed(1)}% — top5 avg: ${TOP5_BENCHMARKS.deadTimePct}%)`);
  console.log(`    Dead gaps: ${deadGaps.length}`);

  const worst = deadGaps.sort((a, b) => b.gap - a.gap).slice(0, 5);
  for (const g of worst) {
    console.log(`      ${g.start.toFixed(0)}s-${g.end.toFixed(0)}s (${g.gap.toFixed(1)}s) — after ${g.before}, before ${g.after}`);
  }
  console.log();

  // ── ReM MANAGEMENT ──────────────────────────────────────────
  console.log('  ── RENEWING MIST GAPS ────────────────────────────────');

  const remCasts = castOnly.filter(c => c.spell === RENEWING_MIST);
  const remGaps = [];
  for (let i = 1; i < remCasts.length; i++) remGaps.push(remCasts[i].time - remCasts[i - 1].time);
  const avgRemGap = remGaps.length > 0 ? (remGaps.reduce((a, b) => a + b, 0) / remGaps.length).toFixed(1) : 'N/A';
  const maxRemGap = remGaps.length > 0 ? Math.max(...remGaps).toFixed(1) : 'N/A';

  console.log(`    ${remCasts.length} casts (${(remCasts.length / durMin).toFixed(1)}/min — top5: ${TOP5_BENCHMARKS.remCPM}/min)`);
  console.log(`    Avg gap: ${avgRemGap}s    Max gap: ${maxRemGap}s    (top5 avg gap: ~5.5s)`);
  console.log();

  // ── HEALING BREAKDOWN ───────────────────────────────────────
  console.log('  ── TOP HEALING SOURCES ───────────────────────────────');

  const healBd = {};
  for (const h of healing) {
    const name = spellName(h.abilityGameID);
    if (!healBd[name]) healBd[name] = { total: 0, overheal: 0, count: 0 };
    healBd[name].total += (h.amount || 0);
    healBd[name].overheal += (h.overheal || 0);
    healBd[name].count++;
  }

  const sortedHeals = Object.entries(healBd)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 12);

  for (const [name, data] of sortedHeals) {
    const pct = (data.total / totalHealing * 100).toFixed(1);
    const oh = data.total + data.overheal > 0 ? ((data.overheal / (data.total + data.overheal)) * 100).toFixed(0) : '0';
    const hpsSpell = Math.round(data.total / duration);
    console.log(`    ${name.padEnd(28)} ${String(hpsSpell).padStart(6)} HPS  ${pct.padStart(5)}%  ${(oh + '% oh').padStart(7)}`);
  }
  console.log();

  // ── VIVIFY OVERHEAL ─────────────────────────────────────────
  const vivHeal = healBd['Vivify'];
  if (vivHeal) {
    const vivOH = vivHeal.total + vivHeal.overheal > 0 ? ((vivHeal.overheal / (vivHeal.total + vivHeal.overheal)) * 100).toFixed(0) : '0';
    console.log(`  ── VIVIFY OVERHEAL: ${vivOH}% (last session: 46%, top5: 13-27%) ──`);
    if (parseInt(vivOH) < 30) {
      console.log(`    GOOD — Vivify overheal under control, ReM coverage likely better`);
    } else if (parseInt(vivOH) < 40) {
      console.log(`    IMPROVED — down from 46% but still high, keep ReM rolling`);
    } else {
      console.log(`    !! Still high — not enough ReM targets for Vivify to cleave to`);
    }
    console.log();
  }

  // ── SCORECARD ───────────────────────────────────────────────
  console.log('='.repeat(110));
  console.log('  SCORECARD vs LAST SESSION (LBV fight #13)');
  console.log('='.repeat(110));
  console.log();

  const LAST = {
    hps: 118429, cpm: 42.4, remCPM: 6.9, vivCPM: 13.3, emCPM: 4.3,
    soothCount: 11, deadTimePct: 11.9, ccUses: 2, yulUses: 2, lcUses: 3,
    tftUses: 11, vivOH: 46,
  };

  function compare(label, now, last, top5, higher = true) {
    const arrow = higher
      ? (now > last ? 'BETTER' : now < last ? 'WORSE' : 'SAME')
      : (now < last ? 'BETTER' : now > last ? 'WORSE' : 'SAME');
    const vsTop = top5 != null ? `  top5: ${top5}` : '';
    console.log(`    ${label.padEnd(24)} ${String(now).padStart(7)}  (was ${String(last).padStart(7)})  ${arrow}${vsTop}`);
  }

  compare('HPS', hps, LAST.hps, null, true);
  compare('CPM', totalCPM.toFixed(1), LAST.cpm, TOP5_BENCHMARKS.totalCPM, true);
  compare('ReM CPM', (remCasts.length / durMin).toFixed(1), LAST.remCPM, TOP5_BENCHMARKS.remCPM, true);
  compare('Vivify CPM', (vivTotal / durMin).toFixed(1), LAST.vivCPM, TOP5_BENCHMARKS.vivCPM, true);
  compare('EM CPM', (emTotal / durMin).toFixed(1), LAST.emCPM, TOP5_BENCHMARKS.emCPM, true);
  compare('Soothing Mist', soothCount, LAST.soothCount, '1-6 total', false);
  compare('Dead Time %', (totalDeadTime / duration * 100).toFixed(1), LAST.deadTimePct, TOP5_BENCHMARKS.deadTimePct + '%', false);

  const ccUses = castOnly.filter(c => c.spell === CELESTIAL_CONDUIT).length;
  const yulUses = castOnly.filter(c => [YULON, CHIJI].includes(c.spell)).length;
  const lcUses = castOnly.filter(c => c.spell === LIFE_COCOON).length;
  const tftUses = castOnly.filter(c => c.spell === THUNDER_FOCUS_TEA).length;

  compare('CC uses', ccUses, LAST.ccUses, null, true);
  compare("Yu'lon uses", yulUses, LAST.yulUses, null, true);
  compare('Life Cocoon uses', lcUses, LAST.lcUses, null, true);
  compare('TFT uses', tftUses, LAST.tftUses, null, true);

  if (vivHeal) {
    const vivOH = vivHeal.total + vivHeal.overheal > 0 ? ((vivHeal.overheal / (vivHeal.total + vivHeal.overheal)) * 100).toFixed(0) : '0';
    compare('Vivify Overheal %', vivOH, LAST.vivOH, '13-27%', false);
  }

  console.log();
  console.log('='.repeat(110));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
