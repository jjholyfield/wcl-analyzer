import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const DIR = 'data/dps-audit';

const SPELL_NAMES = {
  55090: 'Scourge Strike', 47541: 'Death Coil', 1242174: 'Necrotic Coil',
  85948: 'Festering Strike', 458128: 'Festering Scythe', 1247378: 'Putrefy',
  343294: 'Soul Reaper', 77575: 'Outbreak', 1233448: 'Dark Transformation',
  42650: 'Army of the Dead', 1259633: 'Charge!', 1236994: 'Raise Abomination',
  20572: 'Blood Fury', 207167: 'Blinding Sleet', 274738: 'Ancestral Call',
  444347: 'Unholy Assault', 49998: 'Death Strike', 51723: 'Unholy Pact',
  63560: 'Dark Simulacrum', 48707: 'Anti-Magic Shell', 48265: 'Death\'s Advance',
  48792: 'Icebound Fortitude', 327574: 'Sacrificial Pact', 49576: 'Death Grip',
};

const CORE_SPELLS = [55090, 47541, 1242174, 85948, 458128, 1247378, 343294, 77575];
const CD_SPELLS = [1233448, 42650, 1236994, 1259633, 444347, 20572];
const CD_TIMERS = { 1233448: 45, 42650: 120, 1236994: 90, 444347: 90, 20572: 120 };

function load(file) {
  return JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
}

function analyzeCasts(casts, fightStart) {
  const counts = {};
  const timestamps = {};
  casts.forEach(c => {
    const id = c.abilityGameID;
    counts[id] = (counts[id] || 0) + 1;
    if (!timestamps[id]) timestamps[id] = [];
    timestamps[id].push((c.timestamp - fightStart) / 1000);
  });
  return { counts, timestamps, totalCasts: casts.length };
}

function fightDuration(casts) {
  if (!casts.length) return 0;
  return (casts[casts.length - 1].timestamp - casts[0].timestamp) / 1000;
}

function cpm(count, durationSec) {
  return durationSec > 0 ? (count / (durationSec / 60)).toFixed(2) : '0.00';
}

function avgGap(timestamps) {
  if (!timestamps || timestamps.length < 2) return null;
  let total = 0;
  for (let i = 1; i < timestamps.length; i++) total += timestamps[i] - timestamps[i - 1];
  return (total / (timestamps.length - 1)).toFixed(1);
}

function cdEfficiency(timestamps, cdSeconds) {
  if (!timestamps || timestamps.length < 2) return null;
  let totalDelay = 0;
  let count = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    const delay = gap - cdSeconds;
    if (delay > 2) { totalDelay += delay; count++; }
  }
  return { totalDelay: totalDelay.toFixed(1), delayedUses: count };
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// === LOAD DATA ===

const unholyVorCasts = load('unholyftw-vorasius-casts.json');
const unholyAverCasts = load('unholyftw-averzian-casts.json');
const unholyChimCasts = load('unholyftw-chimaerus-casts.json');
const glizzardVorCasts = load('glizzard-vorasius-casts.json');

const unholyVorDmg = load('unholyftw-vorasius-damage.json');
const glizzardVorDmg = load('glizzard-vorasius-damage.json');

const vorTop5 = load('vorasius-top5-rankings.json');
const averTop1 = load('averzian-top1.json');
const chimTop1 = load('chimaerus-top1.json');
const salTop1 = load('salhadaar-top1.json');

// === ANALYZE FIGHTS ===

const vorStart = unholyVorCasts[0].timestamp;
const vorDur = fightDuration(unholyVorCasts);
const vorAnalysis = analyzeCasts(unholyVorCasts, vorStart);

const averStart = unholyAverCasts[0].timestamp;
const averDur = fightDuration(unholyAverCasts);
const averAnalysis = analyzeCasts(unholyAverCasts, averStart);

const chimStart = unholyChimCasts[0].timestamp;
const chimDur = fightDuration(unholyChimCasts);
const chimAnalysis = analyzeCasts(unholyChimCasts, chimStart);

const glizStart = glizzardVorCasts[0].timestamp;
const glizDur = fightDuration(glizzardVorCasts);
const glizAnalysis = analyzeCasts(glizzardVorCasts, glizStart);

// Total damage from entries
function sumDamage(dmgData) {
  if (!dmgData?.data?.entries) return 0;
  return dmgData.data.entries.reduce((s, e) => s + (e.total || 0), 0);
}

const unholyVorTotal = sumDamage(unholyVorDmg);
const glizVorTotal = sumDamage(glizzardVorDmg);

// Boss data
const bosses = [
  {
    name: 'Averzian', id: 3176,
    unholy: { dur: averDur, analysis: averAnalysis, casts: unholyAverCasts },
    top: { name: averTop1.name, dps: averTop1.amount, dur: averTop1.duration / 1000 },
    unholyParse: { ilvlPct: 93, totalPct: 45 },
  },
  {
    name: 'Vorasius', id: 3177,
    unholy: { dur: vorDur, analysis: vorAnalysis, casts: unholyVorCasts, totalDmg: unholyVorTotal },
    top: { name: 'Glizzard', dps: vorTop5[0].amount, dur: vorTop5[0].duration / 1000 },
    topAnalysis: glizAnalysis,
    topDur: glizDur,
    topTotalDmg: glizVorTotal,
    unholyParse: { ilvlPct: 89, totalPct: 59 },
  },
  {
    name: 'Chimaerus', id: 3306,
    unholy: { dur: chimDur, analysis: chimAnalysis, casts: unholyChimCasts },
    top: { name: chimTop1.name, dps: chimTop1.amount, dur: chimTop1.duration / 1000 },
    unholyParse: { ilvlPct: 84, totalPct: 49 },
  },
];

// UnholyFTW's DPS per boss (estimated from total damage / duration)
const unholyDPS = {
  Averzian: unholyVorTotal ? null : null, // we don't have averzian dmg data
  Vorasius: unholyVorTotal / vorDur,
};

// === BUILD HTML ===

function buildSpellRow(spellId, analysis, topAnalysis, dur, topDur, label, topLabel) {
  const name = SPELL_NAMES[spellId] || `Spell ${spellId}`;
  const count = analysis.counts[spellId] || 0;
  const topCount = topAnalysis ? (topAnalysis.counts[spellId] || 0) : null;
  const cpmVal = cpm(count, dur);
  const topCpmVal = topAnalysis ? cpm(topCount, topDur) : null;
  const diff = topCpmVal ? (parseFloat(cpmVal) - parseFloat(topCpmVal)).toFixed(2) : null;
  const isOutbreak = spellId === 77575;
  const diffColor = diff !== null ? (isOutbreak ? (parseFloat(diff) > 0 ? '#ff6b6b' : '#4caf50') : (parseFloat(diff) >= 0 ? '#4caf50' : '#ff6b6b')) : '#888';
  const diffStr = diff !== null ? (parseFloat(diff) >= 0 ? `+${diff}` : diff) : '—';

  return `<tr>
    <td style="color:#ddd">${name}</td>
    <td>${count}</td>
    <td>${cpmVal}</td>
    ${topAnalysis !== undefined ? `<td>${topCount !== null ? topCount : '—'}</td>
    <td>${topCpmVal || '—'}</td>
    <td style="color:${diffColor};font-weight:600">${diffStr}</td>` : ''}
  </tr>`;
}

function buildCDTimeline(analysis, dur) {
  const cdSpells = [42650, 1236994, 1233448, 444347, 20572];
  let rows = '';
  for (const id of cdSpells) {
    const ts = analysis.timestamps[id];
    if (!ts || !ts.length) continue;
    const name = SPELL_NAMES[id] || `Spell ${id}`;
    const times = ts.map(t => formatTime(t)).join(', ');
    const gap = avgGap(ts);
    const cdSec = CD_TIMERS[id];
    let effStr = '';
    if (cdSec && ts.length >= 2) {
      const eff = cdEfficiency(ts, cdSec);
      if (eff.delayedUses > 0) {
        effStr = `<span style="color:#ffa940"> (${eff.totalDelay}s wasted across ${eff.delayedUses} delayed use${eff.delayedUses > 1 ? 's' : ''})</span>`;
      } else {
        effStr = `<span style="color:#4caf50"> (no delays)</span>`;
      }
    }
    rows += `<tr>
      <td style="color:#ddd">${name}</td>
      <td>${ts.length}</td>
      <td>${gap ? gap + 's' : '—'}</td>
      <td>${times}${effStr}</td>
    </tr>`;
  }
  return rows;
}

function buildOutbreakSection(analysis) {
  const outbreakCount = analysis.counts[77575] || 0;
  const ts = analysis.timestamps[77575];
  const times = ts ? ts.map(t => formatTime(t)).join(', ') : '—';
  const color = outbreakCount > 3 ? '#ff6b6b' : outbreakCount > 1 ? '#ffa940' : '#4caf50';
  return { count: outbreakCount, times, color };
}

function buildBossSection(boss, index) {
  const { analysis, dur } = boss.unholy;
  const hasTop = boss.topAnalysis !== undefined;
  const topA = boss.topAnalysis;
  const topD = boss.topDur;

  const outbreakData = buildOutbreakSection(analysis);

  const unholyDpsEst = boss.unholy.totalDmg ? (boss.unholy.totalDmg / dur).toFixed(0) : null;
  const topDpsEst = boss.topTotalDmg ? (boss.topTotalDmg / topD).toFixed(0) : null;

  let dpsCompare = '';
  if (unholyDpsEst) {
    dpsCompare = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">UnholyFTW DPS</div>
        <div class="stat-value">${Number(unholyDpsEst).toLocaleString()}</div>
        <div class="stat-sub">${formatTime(dur)} kill</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${boss.top.name} (#1) DPS</div>
        <div class="stat-value" style="color:#4caf50">${Math.round(boss.top.dps).toLocaleString()}</div>
        <div class="stat-sub">${formatTime(boss.top.dur)} kill</div>
      </div>
    </div>`;
  } else {
    dpsCompare = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">UnholyFTW</div>
        <div class="stat-value">${boss.unholyParse.ilvlPct}%</div>
        <div class="stat-sub">ilvl parse / ${formatTime(dur)} kill</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${boss.top.name} (#1) DPS</div>
        <div class="stat-value" style="color:#4caf50">${Math.round(boss.top.dps).toLocaleString()}</div>
        <div class="stat-sub">${formatTime(boss.top.dur)} kill</div>
      </div>
    </div>`;
  }

  // GCD analysis
  const allTs = Object.values(analysis.timestamps).flat().sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < allTs.length; i++) {
    const gap = allTs[i] - allTs[i - 1];
    if (gap > 0.3 && gap < 5) gaps.push(gap);
  }
  const avgGcd = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) : '—';
  const longGaps = gaps.filter(g => g > 2.0).length;
  const gcdPct = gaps.length ? ((gaps.filter(g => g < 1.5).length / gaps.length) * 100).toFixed(1) : '—';

  return `
  <h2>${boss.name}</h2>
  <div class="parse-badges">
    <span class="badge badge-ilvl">${boss.unholyParse.ilvlPct}% ilvl</span>
    <span class="badge badge-total">${boss.unholyParse.totalPct}% overall</span>
  </div>

  ${dpsCompare}

  <h3>Core Rotation — Casts Per Minute</h3>
  <table class="audit-table">
    <thead><tr>
      <th>Ability</th>
      <th>Casts</th>
      <th>CPM</th>
      ${hasTop ? `<th>${boss.top.name} Casts</th><th>${boss.top.name} CPM</th><th>Diff</th>` : ''}
    </tr></thead>
    <tbody>
      ${CORE_SPELLS.map(id => buildSpellRow(id, analysis, hasTop ? topA : undefined, dur, topD, 'UnholyFTW', boss.top.name)).join('\n')}
    </tbody>
  </table>

  <h3>Outbreak Waste</h3>
  <div class="finding ${outbreakData.count > 3 ? 'finding-bad' : outbreakData.count > 1 ? 'finding-warn' : 'finding-good'}">
    <span class="finding-count" style="color:${outbreakData.color}">${outbreakData.count} casts</span>
    <span class="finding-text">${outbreakData.count > 3 ? 'Significant waste — Outbreak only needs 1 cast on pull. Every extra cast is a GCD that could have been Scourge Strike or Death Coil.' : outbreakData.count <= 1 ? 'Clean — applied once on pull as expected.' : 'Mild waste — a couple extra applications, likely on add spawns.'}</span>
    <div class="finding-times">Cast at: ${outbreakData.times}</div>
  </div>

  <h3>Cooldown Usage</h3>
  <table class="audit-table">
    <thead><tr>
      <th>Cooldown</th>
      <th>Uses</th>
      <th>Avg Gap</th>
      <th>Cast Times</th>
    </tr></thead>
    <tbody>
      ${buildCDTimeline(analysis, dur)}
    </tbody>
  </table>

  <h3>GCD Efficiency</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:8px">
    <div class="stat-card">
      <div class="stat-label">Avg GCD</div>
      <div class="stat-value" style="font-size:20px">${avgGcd}s</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sub-1.5s GCDs</div>
      <div class="stat-value" style="font-size:20px">${gcdPct}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Long Gaps (>2s)</div>
      <div class="stat-value" style="font-size:20px;color:${longGaps > 5 ? '#ff6b6b' : '#4caf50'}">${longGaps}</div>
    </div>
  </div>
  `;
}

// Cross-boss pattern analysis
function buildCrossBossSection() {
  const bossData = [
    { name: 'Averzian', a: averAnalysis, dur: averDur },
    { name: 'Vorasius', a: vorAnalysis, dur: vorDur },
    { name: 'Chimaerus', a: chimAnalysis, dur: chimDur },
  ];

  let outbreakRows = '';
  let coreRows = '';

  for (const b of bossData) {
    const ob = b.a.counts[77575] || 0;
    const obColor = ob > 3 ? '#ff6b6b' : ob > 1 ? '#ffa940' : '#4caf50';
    outbreakRows += `<tr>
      <td>${b.name}</td>
      <td style="color:${obColor};font-weight:600">${ob}</td>
      <td>${(ob * 1.5).toFixed(1)}s</td>
    </tr>`;
  }

  const coreIds = [55090, 1242174, 47541, 85948, 458128, 1247378, 343294];
  for (const id of coreIds) {
    const name = SPELL_NAMES[id];
    let cells = `<td style="color:#ddd">${name}</td>`;
    for (const b of bossData) {
      const count = b.a.counts[id] || 0;
      cells += `<td>${cpm(count, b.dur)}</td>`;
    }
    coreRows += `<tr>${cells}</tr>`;
  }

  return `
  <h2>Cross-Boss Patterns</h2>

  <h3>Outbreak Waste — All Bosses</h3>
  <p style="color:#888;font-size:13px;margin-bottom:12px">Outbreak applies Virulent Plague. One cast on pull is all you need — the disease doesn't fall off during a boss fight. Every extra Outbreak is ~1.5s of wasted GCDs.</p>
  <table class="audit-table">
    <thead><tr><th>Boss</th><th>Outbreak Casts</th><th>GCD Time Wasted</th></tr></thead>
    <tbody>${outbreakRows}</tbody>
  </table>

  <h3>Core Ability CPM — Cross-Boss Comparison</h3>
  <table class="audit-table">
    <thead><tr><th>Ability</th>${bossData.map(b => `<th>${b.name}</th>`).join('')}</tr></thead>
    <tbody>${coreRows}</tbody>
  </table>

  <div class="finding finding-warn" style="margin-top:16px">
    <span class="finding-text"><strong>Chimaerus notably lower CPM across the board.</strong> Scourge Strike, Necrotic Coil, and Festering Strike CPM all dip on this boss — likely due to movement-heavy mechanics or intermissions. Focus on maintaining GCD uptime during forced movement.</span>
  </div>
  `;
}

function buildActionItems() {
  return `
  <h2>Priority Action Items</h2>
  <div class="actions">
    <div class="action action-high">
      <div class="action-priority">HIGH</div>
      <div class="action-body">
        <strong>Stop re-casting Outbreak mid-fight.</strong> Apply once on pull, never again. This is 7-14 wasted GCDs across your kills — each one could be a Scourge Strike or Death Coil. Macro Outbreak into your pull sequence and remove it from your rotation bar if needed.
      </div>
    </div>
    <div class="action action-high">
      <div class="action-priority">HIGH</div>
      <div class="action-body">
        <strong>Increase Scourge Strike and Death Coil CPM.</strong> Top players hit 10+ Scourge Strike CPM and 7+ Death Coil CPM. You're consistently 1-2 CPM lower on both. This is the single biggest DPS gap after Outbreak waste. Fill every GCD — if you can't melee, Death Coil.
      </div>
    </div>
    <div class="action action-med">
      <div class="action-priority">MEDIUM</div>
      <div class="action-body">
        <strong>Tighten cooldown usage.</strong> Army of the Dead and Dark Transformation usage is good overall, but check for delayed second uses. Every second a CD sits off-cooldown is free DPS left on the table.
      </div>
    </div>
    <div class="action action-med">
      <div class="action-priority">MEDIUM</div>
      <div class="action-body">
        <strong>Chimaerus-specific: maintain uptime during movement.</strong> Your CPM drops notably on this boss. Pre-position for mechanics, use Death Coil during forced movement, and keep Festering Scythe rolling for passive cleave.
      </div>
    </div>
    <div class="action action-low">
      <div class="action-priority">LOW</div>
      <div class="action-body">
        <strong>Kill time is a team issue, not you.</strong> Much of the overall parse gap comes from longer kill times (your team kills slower, spreading the same damage over more time). The ilvl parse (which normalizes gear) is strong — 93% Averzian, 89% Vorasius. Focus on rotation tightening, and overall parse will climb as the team gets faster kills.
      </div>
    </div>
  </div>
  `;
}

// === GENERATE HTML ===

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DPS Audit — UnholyFTW (Unholy DK)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 32px; max-width: 960px; margin: 0 auto; line-height: 1.5; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 18px; font-weight: 600; color: #c41f3b; margin-top: 40px; margin-bottom: 12px; border-bottom: 1px solid #222; padding-bottom: 6px; }
  h3 { font-size: 15px; font-weight: 600; color: #999; margin-top: 24px; margin-bottom: 10px; }
  .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .overview-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px; text-align: center; }
  .overview-boss { font-size: 12px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .overview-parse { font-size: 28px; font-weight: 700; }
  .overview-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .parse-orange { color: #ff8000; }
  .parse-purple { color: #a335ee; }
  .parse-blue { color: #0070dd; }
  .parse-green { color: #1eff00; }
  .parse-gray { color: #888; }
  .parse-badges { display: flex; gap: 8px; margin-bottom: 16px; }
  .badge { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 4px; }
  .badge-ilvl { background: #2a1a00; color: #ff8000; }
  .badge-total { background: #1a1a2a; color: #a0a0ff; }
  .stat-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 6px; padding: 12px; text-align: center; }
  .stat-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .stat-value { font-size: 24px; font-weight: 700; color: #fff; }
  .stat-sub { font-size: 11px; color: #555; margin-top: 2px; }
  .audit-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
  .audit-table th { text-align: left; padding: 8px 12px; background: #141414; color: #888; font-weight: 600; border-bottom: 1px solid #222; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .audit-table td { padding: 6px 12px; border-bottom: 1px solid #1a1a1a; color: #aaa; }
  .audit-table tr:hover { background: #161616; }
  .finding { background: #141414; border-radius: 6px; padding: 14px 18px; margin-bottom: 12px; }
  .finding-bad { border-left: 3px solid #ff6b6b; background: #1a1212; }
  .finding-warn { border-left: 3px solid #ffa940; background: #1a1710; }
  .finding-good { border-left: 3px solid #4caf50; background: #121a14; }
  .finding-count { font-size: 20px; font-weight: 700; display: block; margin-bottom: 4px; }
  .finding-text { font-size: 13px; color: #bbb; line-height: 1.6; }
  .finding-times { font-size: 12px; color: #666; margin-top: 6px; font-family: 'Courier New', monospace; }
  .actions { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
  .action { display: flex; gap: 16px; background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px 20px; }
  .action-priority { font-size: 11px; font-weight: 700; letter-spacing: 1px; min-width: 60px; padding-top: 2px; }
  .action-high .action-priority { color: #ff6b6b; }
  .action-med .action-priority { color: #ffa940; }
  .action-low .action-priority { color: #4caf50; }
  .action-body { font-size: 13px; color: #bbb; line-height: 1.6; }
  .action-body strong { color: #fff; }
  .summary-box { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; }
  .summary-box p { font-size: 14px; color: #bbb; line-height: 1.7; margin-bottom: 8px; }
  .summary-box p:last-child { margin-bottom: 0; }
  details { margin-top: 36px; }
  summary { font-size: 14px; font-weight: 600; color: #666; cursor: pointer; padding: 8px 0; }
  summary:hover { color: #999; }
  .details-inner { background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 16px 20px; margin-top: 8px; font-size: 13px; color: #888; line-height: 1.7; }
  .details-inner a { color: #7cacf8; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #444; text-align: center; }
</style>
</head>
<body>

<h1>DPS Audit &mdash; UnholyFTW</h1>
<p class="subtitle">Unholy Death Knight &mdash; Zul'jin US &mdash; Four Dads One Pizza &mdash; Mythic Liberation of Undermine</p>

<div class="summary-box">
  <p><strong>TL;DR:</strong> Strong ilvl parses (84-93%) indicate solid fundamentals for gear level. The main gap to top players is <strong>Outbreak waste</strong> (7-14 extra casts per fight) and <strong>lower core ability CPM</strong> (Scourge Strike, Death Coil). Cooldown usage (Army, Dark Transformation) is good. GCD efficiency is tight (~1.15s average). Overall parse (45-59%) is dragged down partly by longer team kill times.</p>
</div>

<div class="overview-grid">
  <div class="overview-card">
    <div class="overview-boss">Averzian</div>
    <div class="overview-parse parse-orange">93%</div>
    <div class="overview-sub">ilvl parse</div>
    <div class="overview-sub" style="color:#888">45% overall</div>
  </div>
  <div class="overview-card">
    <div class="overview-boss">Vorasius</div>
    <div class="overview-parse parse-purple">89%</div>
    <div class="overview-sub">ilvl parse</div>
    <div class="overview-sub" style="color:#888">59% overall</div>
  </div>
  <div class="overview-card">
    <div class="overview-boss">Chimaerus</div>
    <div class="overview-parse parse-blue">84%</div>
    <div class="overview-sub">ilvl parse</div>
    <div class="overview-sub" style="color:#888">49% overall</div>
  </div>
  <div class="overview-card">
    <div class="overview-boss">Salhadaar</div>
    <div class="overview-parse parse-green">30%</div>
    <div class="overview-sub">ilvl parse</div>
    <div class="overview-sub" style="color:#888">30% overall</div>
  </div>
</div>

${bosses.map((b, i) => buildBossSection(b, i)).join('\n')}

${buildCrossBossSection()}

${buildActionItems()}

<details>
  <summary>Methodology &amp; Data Sources</summary>
  <div class="details-inner">
    <strong>Data pulled from Warcraft Logs v2 API</strong><br><br>

    <strong>UnholyFTW's kills analyzed:</strong><br>
    &bull; Averzian — cast data (${averAnalysis.totalCasts} casts over ${formatTime(averDur)})<br>
    &bull; Vorasius — cast data + damage table (${vorAnalysis.totalCasts} casts over ${formatTime(vorDur)})<br>
    &bull; Chimaerus — cast data (${chimAnalysis.totalCasts} casts over ${formatTime(chimDur)})<br>
    &bull; Salhadaar — kill not found in searched reports (only 1 kill exists)<br><br>

    <strong>Top player comparisons:</strong><br>
    &bull; Vorasius #1: Glizzard (Sylvanas EU, Hatewatching) — 116,190 DPS, ${formatTime(vorTop5[0].duration / 1000)} kill — full cast + damage data<br>
    &bull; Averzian #1: Ðeathbro (Blackhand EU) — 127,468 DPS, ${formatTime(averTop1.duration / 1000)} kill<br>
    &bull; Chimaerus #1: ${chimTop1.name} (${chimTop1.server.name} ${chimTop1.server.region}) — 118,085 DPS, ${formatTime(chimTop1.duration / 1000)} kill<br>
    &bull; Salhadaar #1: ${salTop1.name} (${salTop1.server.name} ${salTop1.server.region}) — 125,912 DPS, ${formatTime(salTop1.duration / 1000)} kill<br><br>

    <strong>Metrics explained:</strong><br>
    &bull; <strong>CPM</strong> = Casts Per Minute. Higher is better — it means more ability usage in the same timeframe.<br>
    &bull; <strong>ilvl parse</strong> = percentile compared to players at similar item level. Removes the gear variable.<br>
    &bull; <strong>Overall parse</strong> = percentile across all players regardless of gear.<br>
    &bull; <strong>GCD efficiency</strong> = how tightly abilities are chained. Unholy DK base GCD is ~1.0-1.15s with haste.<br><br>

    <a href="https://www.warcraftlogs.com/character/us/zuljin/unholyftw" target="_blank">UnholyFTW on Warcraft Logs</a>
  </div>
</details>

<div class="footer">
  Generated by WCL Analyzer &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
</div>

</body>
</html>`;

writeFileSync('healing-cds/dps-audit-unholyftw.html', html);
console.log('Written: healing-cds/dps-audit-unholyftw.html');
console.log(`Vorasius: ${vorAnalysis.totalCasts} casts, ${formatTime(vorDur)} fight`);
console.log(`Averzian: ${averAnalysis.totalCasts} casts, ${formatTime(averDur)} fight`);
console.log(`Chimaerus: ${chimAnalysis.totalCasts} casts, ${formatTime(chimDur)} fight`);
console.log(`Glizzard (top1 Vor): ${glizAnalysis.totalCasts} casts, ${formatTime(glizDur)} fight`);

// Show key findings
console.log('\n=== KEY FINDINGS ===');
for (const b of bosses) {
  const ob = b.unholy.analysis.counts[77575] || 0;
  console.log(`${b.name}: Outbreak x${ob}, SS CPM ${cpm(b.unholy.analysis.counts[55090] || 0, b.unholy.dur)}, DC CPM ${cpm(b.unholy.analysis.counts[47541] || 0, b.unholy.dur)}`);
}
console.log(`\nGlizzard #1 Vorasius: SS CPM ${cpm(glizAnalysis.counts[55090] || 0, glizDur)}, DC CPM ${cpm(glizAnalysis.counts[47541] || 0, glizDur)}`);
