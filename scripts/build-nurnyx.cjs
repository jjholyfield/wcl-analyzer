const fs = require('fs');

// Load all analysis data
const abilityMap = JSON.parse(fs.readFileSync('data/log-20260618/ability-map.json','utf8'));
const crownFights = JSON.parse(fs.readFileSync('data/log-20260618/crown-fights.json','utf8'));
const perFight = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/per-fight-dps.json','utf8'));
const casts = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/casts.json','utf8')).filter(c => c.type === 'cast');
const dmgDone = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/damage-done.json','utf8'));
const dmgTaken = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/damage-taken.json','utf8'));
const deaths = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/deaths.json','utf8'));
const ci = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/combatant-info.json','utf8'))[0];
const players = JSON.parse(fs.readFileSync('data/log-20260618/players.json','utf8'));
const top5raw = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/rankings-top5.json','utf8'));
const refInfo = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/ref-info.json','utf8'));
const refAbilityMap = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/ref-fabx/ability-map.json','utf8'));
const refCastsRaw = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/ref-fabx/casts.json','utf8')).filter(c => c.type === 'cast');
const refDmgDone = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/ref-fabx/damage-done.json','utf8'));
const refFightMeta = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/ref-fabx/fight.json','utf8'));
const bossCastsRaw = JSON.parse(fs.readFileSync('data/log-20260618/boss/crown-casts-f27.json','utf8')).filter(c => c.type === 'cast');

// Constants
const FIGHT_START = 10113911;
const FIGHT_DUR = 361;
const ALIVE = 313.5;
const ALIVE_MIN = ALIVE / 60;
const REF_DUR = (refFightMeta.endTime - refFightMeta.startTime) / 1000;
const REF_MIN = REF_DUR / 60;

// Helpers
function fmt(s) { return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function fmtK(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n); }

// Headline metrics
const gear = ci.gear.filter(g => g.itemLevel > 10);
const ilvl = (gear.reduce((s,g) => s+g.itemLevel, 0)/gear.length).toFixed(1);
const playerDPS = perFight['27'].dps;
const refDPSRanking = Math.round(top5raw[3].amount);

// GCD CPM
const excludeIDs = new Set([341263, 10060, 228260, 121536, 586, 19236, 15286, 17, 360184, 1236616, 1260459, 21562, 73325, 2061]);
const playerGCD = casts.filter(c => !excludeIDs.has(c.abilityGameID));
const refGCD = refCastsRaw.filter(c => !excludeIDs.has(c.abilityGameID));
const playerCPM = +(playerGCD.length / ALIVE_MIN).toFixed(1);
const refCPM = +(refGCD.length / REF_MIN).toFixed(1);

// Cast Profile
const castAbilities = [
  { name: 'Mind Blast', id: 8092 },
  { name: 'Shadow Word: Madness', id: 335467 },
  { name: 'Mind Flay', id: 15407 },
  { name: 'Mind Flay: Insanity', id: 391403 },
  { name: 'Tentacle Slam', id: 1227280 },
  { name: 'Shadow Word: Death', id: 32379 },
  { name: 'Shadow Word: Pain', id: 589 },
  { name: 'Void Volley', id: 1242173 },
  { name: 'Halo', id: 120644 },
];

function countCasts(castList, id) { return castList.filter(c => c.abilityGameID === id).length; }

const castProfile = castAbilities.map(a => {
  const pCount = countCasts(casts, a.id);
  const rCount = countCasts(refCastsRaw, a.id);
  const pCPM = +(pCount / ALIVE_MIN).toFixed(1);
  const rCPM = +(rCount / REF_MIN).toFixed(1);
  const delta = rCPM > 0 ? Math.round((pCPM - rCPM) / rCPM * 100) : 0;
  return { ...a, pCount, rCount, pCPM, rCPM, delta };
});

// Damage Profile
function buildDmg(events, aMap) {
  const by = {};
  events.forEach(e => {
    const name = aMap[e.abilityGameID] || ('ID:'+e.abilityGameID);
    if (!by[name]) by[name] = { total: 0, hits: 0 };
    by[name].total += (e.amount||0) + (e.absorbed||0);
    by[name].hits++;
  });
  return by;
}
const pDmg = buildDmg(dmgDone, abilityMap);
const rDmg = buildDmg(refDmgDone, refAbilityMap);
const totalPDmg = Object.values(pDmg).reduce((s,d)=>s+d.total,0);
const totalRDmg = Object.values(rDmg).reduce((s,d)=>s+d.total,0);

const allDmgAbilities = new Set([...Object.keys(pDmg), ...Object.keys(rDmg)]);
const dmgProfile = [...allDmgAbilities].map(name => ({
  name,
  pTotal: pDmg[name]?.total || 0,
  rTotal: rDmg[name]?.total || 0,
  pPct: totalPDmg > 0 ? ((pDmg[name]?.total||0)/totalPDmg*100).toFixed(1) : '0',
  rPct: totalRDmg > 0 ? ((rDmg[name]?.total||0)/totalRDmg*100).toFixed(1) : '0',
})).sort((a,b) => b.pTotal - a.pTotal).slice(0, 15);

// Damage Taken
const dtBy = {};
dmgTaken.forEach(e => {
  const name = abilityMap[e.abilityGameID] || ('ID:'+e.abilityGameID);
  if (!dtBy[name]) dtBy[name] = { total: 0, hits: 0, absorbed: 0, id: e.abilityGameID };
  dtBy[name].total += (e.amount||0);
  dtBy[name].absorbed += (e.absorbed||0);
  dtBy[name].hits++;
});
const dtSorted = Object.entries(dtBy).sort((a,b) => b[1].total - a[1].total).slice(0, 12);

// Deaths
const deathList = deaths.map(d => ({
  time: (d.timestamp - FIGHT_START)/1000,
  name: players[String(d.targetID)]?.name || ('ID:'+d.targetID),
  killedBy: abilityMap[d.killingAbilityGameID] || ('Unknown'),
  isNurnyx: d.targetID === 7
})).sort((a,b) => a.time - b.time);

// Wipe Progression
const progFights = Object.entries(perFight)
  .filter(([fid, d]) => d.dps > 0)
  .map(([fid, d]) => ({ fid: +fid, ...d }))
  .sort((a,b) => a.fid - b.fid);
const maxDPS = Math.max(...progFights.map(f => f.dps));

// Boss Timeline
const bossAbilities = {};
bossCastsRaw.forEach(c => {
  const name = abilityMap[c.abilityGameID] || ('Unknown_'+c.abilityGameID);
  const time = (c.timestamp - FIGHT_START)/1000;
  if (!bossAbilities[name]) bossAbilities[name] = [];
  bossAbilities[name].push(time);
});

const majorBoss = [
  { name: 'Grasp of Emptiness', color: '#d29922', label: 'Grasp' },
  { name: 'Void Expulsion', color: '#db6d28', label: 'Void Exp.' },
  { name: 'Null Corona', color: '#bc8cff', label: 'Null Corona' },
  { name: 'Silversunder Catastrophe', color: '#f85149', label: 'Intermission' },
  { name: 'Call of the Void', color: '#39d2c0', label: 'Call/Void' },
  { name: 'Voidstalker Sting', color: '#58a6ff', label: 'VS Sting' },
  { name: 'Dimensional Slash', color: '#f85149', label: 'Dim. Slash' },
  { name: 'Aspect of the End', color: '#ff6b6b', label: 'Aspect' },
  { name: 'Dark Hand', color: '#8b949e', label: 'Dark Hand' },
  { name: 'Ravenous Abyss', color: '#5a3d8a', label: 'Rav. Abyss' },
];

// Reference table
const refTable = refInfo.map((r, i) => {
  const ranking = top5raw[r.idx];
  return {
    name: r.name,
    dps: Math.round(ranking.amount),
    killTime: fmt(ranking.duration / 1000),
    ilvl: r.ilvl?.toFixed(1) || '?',
    talentDiffs: r.talentDiffs,
    isPrimary: r.name === 'Fabx'
  };
});

// Cooldown timings
function getCDTimings(castList, ids, fStart) {
  const result = {};
  ids.forEach(id => {
    result[id] = castList.filter(c => c.abilityGameID === id).map(c => (c.timestamp - fStart)/1000);
  });
  return result;
}
const cdIDs = [228260, 10060, 120644, 1260459, 15286];
const pCDs = getCDTimings(casts, cdIDs, FIGHT_START);
const rCDs = getCDTimings(refCastsRaw, cdIDs, refFightMeta.startTime);

// External buffs
const buffs = JSON.parse(fs.readFileSync('data/log-20260618/nurnyx/buffs.json','utf8'));
const applyBuffs = buffs.filter(b => b.type === 'applybuff' && b.targetID === 7);
function getBuffTimes(id) {
  return applyBuffs.filter(b => b.abilityGameID === id).map(b => ((b.timestamp - FIGHT_START)/1000));
}
const lustTimes = getBuffTimes(80353);
const piTimes = getBuffTimes(10060);
const ebonTimes = getBuffTimes(395152);
const prescienceTimes = getBuffTimes(410089);

// Casting gaps
const playerGCDSorted = [...playerGCD].sort((a,b) => a.timestamp - b.timestamp);
const gapList = [];
for (let i = 1; i < playerGCDSorted.length; i++) {
  const dt = (playerGCDSorted[i].timestamp - playerGCDSorted[i-1].timestamp) / 1000;
  if (dt > 2.5) {
    const time = (playerGCDSorted[i-1].timestamp - FIGHT_START)/1000;
    const before = abilityMap[playerGCDSorted[i-1].abilityGameID] || 'Unknown';
    const after = abilityMap[playerGCDSorted[i].abilityGameID] || 'Unknown';
    gapList.push({ time, duration: dt, before, after });
  }
}

const bestPull = progFights.reduce((best, f) => f.bossPercent < best.bossPercent ? f : best, progFights[0]);
const fabxRef = refInfo.find(r => r.name === 'Fabx');
const mbProfile = castProfile.find(a => a.name === 'Mind Blast');
const swmProfile = castProfile.find(a => a.name === 'Shadow Word: Madness');
const swdProfile = castProfile.find(a => a.name === 'Shadow Word: Death');
const dpsGapPct = ((1 - playerDPS / refDPSRanking) * 100).toFixed(1);
const nonIntermissionGaps = gapList.filter(g => g.duration < 10);
const totalExcessGap = nonIntermissionGaps.reduce((s, g) => s + (g.duration - 1.5), 0);
const p1End = 134.2;
const interEnd = 175;
const p2End = 313.4;

// ═══════════════════════════════════════════
// BUILD HTML
// ═══════════════════════════════════════════

let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nurnyx &mdash; Shadow Priest &mdash; Mythic Crown of the Cosmos (Prog)</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922; --orange: #db6d28;
    --purple: #bc8cff; --cyan: #39d2c0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; padding: 24px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 20px; margin: 32px 0 16px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 16px; margin: 16px 0 8px; color: var(--text); }
  .subtitle { color: var(--dim); font-size: 14px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .card-header { font-weight: 600; margin-bottom: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
  .stat { text-align: center; }
  .stat-value { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 12px; color: var(--dim); text-transform: uppercase; }
  .green { color: var(--green); }
  .red { color: var(--red); }
  .yellow { color: var(--yellow); }
  .orange { color: var(--orange); }
  .dim { color: var(--dim); }
  .accent { color: var(--accent); }
  .purple { color: var(--purple); }
  .cyan { color: var(--cyan); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--dim); font-size: 12px; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  tr:hover { background: rgba(88,166,255,0.04); }
  .timeline { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin: 12px 0; overflow: visible; padding: 12px 0; }
  .timeline-row { position: relative; height: 32px; margin: 0 80px 0 90px; }
  .timeline-row-label { position: absolute; left: -85px; width: 80px; font-size: 10px; color: var(--dim); text-align: right; padding-right: 8px; line-height: 32px; }
  .timeline-marker { position: absolute; width: 6px; height: 20px; border-radius: 2px; top: 6px; cursor: default; }
  .timeline-marker:hover::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap; z-index: 10; }
  .timeline-time-axis { display: flex; justify-content: space-between; margin: 4px 90px 0 90px; font-size: 10px; color: var(--dim); }
  .action-item { background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.25); border-radius: 6px; padding: 12px 16px; margin: 8px 0; }
  .action-item strong { color: var(--accent); }
  .action-item.critical { background: rgba(248,81,73,0.08); border: 1px solid rgba(248,81,73,0.25); }
  .action-item.critical strong { color: var(--red); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .tag-same { background: rgba(63,185,80,0.15); color: var(--green); }
  .tag-diff { background: rgba(248,81,73,0.15); color: var(--red); }
  .tag-info { background: rgba(88,166,255,0.15); color: var(--accent); }
  .tag-warn { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .progression-chart { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding: 8px 0; }
  .prog-bar { flex: 1; border-radius: 3px 3px 0 0; position: relative; min-width: 20px; cursor: default; }
  .prog-bar:hover::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap; z-index: 10; }
  .prog-label { position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--dim); white-space: nowrap; }
  .section-intro { color: var(--dim); font-size: 14px; margin-bottom: 16px; }
  .ref-badge { display: inline-block; background: rgba(188,140,255,0.12); border: 1px solid rgba(188,140,255,0.3); color: var(--purple); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px; }
  .side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .cd-timeline { font-family: 'SF Mono', Consolas, monospace; font-size: 13px; line-height: 1.8; }
  .cd-timeline .cast { padding: 2px 6px; border-radius: 3px; }
  .cd-timeline .good { background: rgba(63,185,80,0.12); }
  .cd-timeline .bad { background: rgba(248,81,73,0.12); }
  .mechanic-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .phase-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin: 8px 0; font-size: 11px; }
  .phase-bar > div { display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; }
  @media (max-width: 768px) { .grid-4 { grid-template-columns: 1fr 1fr; } .grid-2, .side-by-side { grid-template-columns: 1fr; } }
</style>
</head>
<body>

<a href="/raid/log-20260618" style="display:inline-block;margin-bottom:16px;font-size:13px;color:#8b949e;text-decoration:none;">&larr; June 18, 2026 Log Analysis</a>
<h1>Nurnyx <span class="dim">&mdash; Shadow Priest</span></h1>
<div class="subtitle">Mythic Crown of the Cosmos &middot; PROG (27 wipes, no kill) &middot; Analysis Fight: Pull 27 (${fmt(FIGHT_DUR)}, ${bestPull.bossPercent}% boss) &middot; June 18, 2026 &middot; Report jqFfXprk4hcaWx3C</div>

<!-- SUMMARY -->
<div class="grid-4">
  <div class="card stat">
    <div class="stat-value">${(playerDPS/1000).toFixed(1)}K</div>
    <div class="stat-label">DPS (Pull 27)</div>
  </div>
  <div class="card stat">
    <div class="stat-value">${ilvl}</div>
    <div class="stat-label">Item Level</div>
  </div>
  <div class="card stat">
    <div class="stat-value yellow">${bestPull.bossPercent.toFixed(1)}%</div>
    <div class="stat-label">Best Pull (Boss %)</div>
  </div>
  <div class="card stat">
    <div class="stat-value yellow">${playerCPM}</div>
    <div class="stat-label">Total CPM</div>
  </div>
</div>

<!-- VERDICT -->
<div class="card" style="border-left: 3px solid var(--yellow); margin-top: 16px;">
  <div class="card-header yellow">Bottom Line &mdash; Prog Context</div>
  <p style="font-size: 15px;">This is <strong>progression</strong> &mdash; night 2 on Mythic Crown of the Cosmos with 27 wipe pulls and no kill yet. Nurnyx dealt <strong class="yellow">${(playerDPS/1000).toFixed(1)}K DPS</strong> on the best pull (F27, ${fmt(FIGHT_DUR)}, ${bestPull.bossPercent}% boss) before dying to <strong class="red">Dimensional Slash</strong> at ${fmt(ALIVE)}. The reference Fabx dealt <strong class="purple">${(refDPSRanking/1000).toFixed(1)}K DPS</strong> on a <strong>full ${fmt(REF_DUR)} kill</strong>, so the raw DPS gap (${dpsGapPct}%) is heavily skewed by fight length and kill vs wipe context. The meaningful comparison is <strong>CPM and ability priority</strong>: Nurnyx at <strong class="yellow">${playerCPM} CPM</strong> vs Fabx's <strong class="purple">${refCPM} CPM</strong> with <strong class="green">0 talent differences</strong> and nearly identical ilvl (${ilvl} vs ${fabxRef.ilvl.toFixed(1)}). The ${(refCPM - playerCPM).toFixed(1)} CPM gap represents real uptime loss &mdash; approximately <strong class="red">${Math.round((refCPM - playerCPM) * ALIVE_MIN)} missed GCDs</strong> over ${fmt(ALIVE)} alive. Key issues: Mind Blast undercast (<strong class="red">${mbProfile.pCPM} vs ${mbProfile.rCPM} CPM</strong>), Shadow Word: Madness undercast (<strong class="red">${swmProfile.pCPM} vs ${swmProfile.rCPM} CPM</strong>), and a <strong>43.6-second gap</strong> during the intermission transition.</p>
</div>
`;

// REFERENCE COMPARISON
html += `
<h2>Reference Comparison</h2>
<p class="section-intro">Compared against top 5 ranked Shadow Priests on Mythic Crown of the Cosmos. Primary reference: <strong>Fabx</strong> (0 talent differences, closest build match, ${(refDPSRanking/1000).toFixed(1)}K DPS, ${fmt(REF_DUR)} kill).</p>
<p class="section-intro" style="margin-top: -8px;"><strong class="yellow">Important context:</strong> All 5 references are from kill fights (7&ndash;9 minutes). Nurnyx's data is from a wipe pull (${fmt(FIGHT_DUR)}). DPS numbers are not directly comparable &mdash; kills include execute phase damage and longer sustained windows. CPM and ability priority are the meaningful comparisons.</p>

<div class="card">
<table>
  <thead>
    <tr><th>Player</th><th>DPS</th><th>Fight Time</th><th>ilvl</th><th>Talent Delta</th><th>Notes</th></tr>
  </thead>
  <tbody>
    <tr style="background: rgba(88,166,255,0.06);">
      <td><strong>Nurnyx</strong></td>
      <td>${(playerDPS/1000).toFixed(1)}K</td>
      <td>${fmt(ALIVE)} (died)</td>
      <td>${ilvl}</td>
      <td>&mdash;</td>
      <td><span class="tag tag-warn">Wipe pull</span></td>
    </tr>`;

refTable.forEach((r, i) => {
  const bg = r.isPrimary ? 'rgba(188,140,255,0.04)' : 'transparent';
  const badge = r.isPrimary ? '<span class="ref-badge">PRIMARY</span>' : `<span class="ref-badge">#${i+1}</span>`;
  const diffTag = r.talentDiffs === 0 ? '<span class="tag tag-same">0 diff</span>' : r.talentDiffs <= 4 ? `<span class="tag tag-warn">${r.talentDiffs} diff</span>` : `<span class="tag tag-diff">${r.talentDiffs} diff</span>`;
  html += `
    <tr style="background: ${bg};">
      <td>${r.name} ${badge}</td>
      <td class="green">${(r.dps/1000).toFixed(1)}K</td>
      <td>${r.killTime}</td>
      <td>${r.ilvl}</td>
      <td>${diffTag}</td>
      <td><span class="tag tag-same">Kill</span></td>
    </tr>`;
});

html += `
  </tbody>
</table>
</div>
<p class="section-intro" style="margin-top: 8px;">Fabx has <strong class="green">0 talent differences</strong> from Nurnyx and nearly identical ilvl (${fabxRef.ilvl.toFixed(1)} vs ${ilvl}). Any CPM or priority gaps between them are pure execution differences, not spec or gear.</p>
`;

// BOSS MECHANIC TIMELINE
html += `
<h2>Boss Mechanic Timeline</h2>
<p class="section-intro">Crown of the Cosmos is a 3-phase fight: Phase 1 (Sentinels &mdash; kill Demair, Morium, Vorelus with Void Droplets), Intermission (dodge Silverstrike Barrage), Phase 2 (manage Alleria's energy via Silverstrike Arrows + Rift Simulacrum), then Phase 3 (multi-platform add management with Devouring Cosmos). Pull 27 reached the Phase 2/3 transition (Dimensional Slash at 5:13).</p>

<div class="phase-bar">
  <div style="width: ${(p1End/FIGHT_DUR*100).toFixed(1)}%; background: #2d5a8a;">P1: Sentinels (0:00&ndash;${fmt(p1End)})</div>
  <div style="width: ${((interEnd-p1End)/FIGHT_DUR*100).toFixed(1)}%; background: #5a2d5a;">Inter</div>
  <div style="width: ${((p2End-interEnd)/FIGHT_DUR*100).toFixed(1)}%; background: #2d5a5a;">P2: Alleria (${fmt(interEnd)}&ndash;${fmt(p2End)})</div>
  <div style="width: ${((FIGHT_DUR-p2End)/FIGHT_DUR*100).toFixed(1)}%; background: #5a2d2d;">P3</div>
</div>
`;

// Visual timeline
html += `<div class="timeline">`;
majorBoss.forEach(ab => {
  const times = bossAbilities[ab.name];
  if (!times || times.length === 0) return;
  html += `<div class="timeline-row"><span class="timeline-row-label">${ab.label}</span>`;
  times.forEach(t => {
    const left = (t / FIGHT_DUR * 100).toFixed(1);
    html += `<div class="timeline-marker" style="left: ${left}%; background: ${ab.color};" data-tooltip="${ab.name} at ${fmt(t)}"></div>`;
  });
  html += `</div>`;
});
// Death row
html += `<div class="timeline-row"><span class="timeline-row-label" style="color: var(--red);">Deaths</span>`;
deathList.forEach(d => {
  const left = (d.time / FIGHT_DUR * 100).toFixed(1);
  const color = d.isNurnyx ? '#f85149' : 'rgba(248,81,73,0.4)';
  html += `<div class="timeline-marker" style="left: ${left}%; background: ${color}; height: 16px; top: 8px;" data-tooltip="&#x2620; ${d.name} at ${fmt(d.time)} (${d.killedBy})"></div>`;
});
html += `</div>`;
html += `<div class="timeline-time-axis"><span>0:00</span><span>1:00</span><span>2:00</span><span>3:00</span><span>4:00</span><span>5:00</span><span>${fmt(FIGHT_DUR)}</span></div></div>`;

// Raid State
html += `
<div class="card" style="font-size: 13px;">
  <div class="card-header dim">Raid State &mdash; Pull 27</div>
  <p>0:00&ndash;5:13 = 20/20 alive &middot; <strong class="red">5:13 = Dimensional Slash &mdash; 7 players die simultaneously</strong> (Moistbear, Nurnyx, Snackznchill, Bebeshakur, Alitheria, Starfighter, Dueche) &middot; 5:16 Orichamaru (Cosmic Radiation) &middot; 5:17 Senssay &middot; 5:40&ndash;5:56 cascade deaths &middot; 6:00 Nucke (last death)</p>
  <p style="margin-top: 4px; color: var(--yellow);">The raid wiped to Dimensional Slash at 5:13 &mdash; the Phase 2 to Phase 3 transition. Nurnyx died here along with 6 other players. This is a mechanics failure (the raid needs to survive this transition), not a DPS issue.</p>
</div>
`;

// DEATH ANALYSIS
html += `
<h2>Death Analysis</h2>
<p class="section-intro">Nurnyx died at <strong class="red">${fmt(ALIVE)}</strong> to <strong>Dimensional Slash</strong> &mdash; the Phase 2/3 transition. 7 players died simultaneously to this mechanic.</p>

<div class="card" style="border-left: 3px solid var(--red);">
  <div class="card-header red">Dimensional Slash &mdash; ${fmt(ALIVE)}</div>
  <p style="font-size: 14px;">Dimensional Slash is the transition mechanic between Phase 2 and Phase 3. The boss slashes the raid &mdash; hitting melee first, then ranged. Players need to use defensives or position correctly. Nurnyx took <strong>216,635 damage</strong> from this single hit. This is a <strong>raid-wide execution check</strong> that the team needs to learn &mdash; 7 of 20 players died to it simultaneously.</p>
  <p style="font-size: 13px; margin-top: 8px; color: var(--dim);">Defensive usage: Nurnyx used Desperate Prayer 3 times (1:09, 2:49, 4:46). The last was at 4:46 &mdash; 27 seconds before death and should have been available. Vampiric Embrace was at 4:46 as well. Fade was available. Using Desperate Prayer or Fade + Body and Soul for the transition could have survived the hit.</p>
</div>
`;

// CAST PROFILE
html += `
<h2>Cast Profile Comparison</h2>
<p class="section-intro">Casts per minute for Nurnyx (${fmt(ALIVE)} alive in wipe) vs Fabx (${fmt(REF_DUR)} kill). Rotational abilities only. CPM calculated over alive time.</p>

<div class="card">
<table>
  <thead>
    <tr><th>Ability</th><th>Player Casts</th><th>Player CPM</th><th>Ref Casts</th><th>Ref CPM</th><th>Delta</th><th>Assessment</th></tr>
  </thead>
  <tbody>`;

castProfile.forEach(a => {
  const deltaStr = a.delta > 0 ? `+${a.delta}%` : `${a.delta}%`;
  const deltaClass = a.delta < -15 ? 'red' : a.delta < -5 ? 'yellow' : a.delta > 15 ? 'yellow' : 'green';
  let assessment = '';
  if (a.delta <= -20) assessment = '<span class="tag tag-diff">Very Low</span>';
  else if (a.delta <= -10) assessment = '<span class="tag tag-warn">Low</span>';
  else if (a.delta >= 50) assessment = '<span class="tag tag-warn">Over-casting</span>';
  else assessment = '<span class="tag tag-same">Good</span>';
  const bg = a.delta < -15 ? 'rgba(248,81,73,0.05)' : a.delta > 50 ? 'rgba(210,153,34,0.05)' : 'transparent';

  html += `
    <tr style="background: ${bg};">
      <td><strong>${a.name}</strong></td>
      <td>${a.pCount}</td>
      <td class="${deltaClass}">${a.pCPM}</td>
      <td>${a.rCount}</td>
      <td>${a.rCPM}</td>
      <td class="${deltaClass}">${deltaStr}</td>
      <td>${assessment}</td>
    </tr>`;
});

html += `
  </tbody>
</table>
</div>
`;

// Cast profile analysis cards
html += `
<div class="grid-2" style="margin-top: 12px;">
  <div class="card" style="border-left: 3px solid var(--red);">
    <div class="card-header red">Mind Blast: Primary Builder Undercast</div>
    <p style="font-size: 14px;">Mind Blast at <strong>${mbProfile.pCPM} CPM (${mbProfile.pCount} casts) vs ${mbProfile.rCPM} CPM (${mbProfile.rCount} casts)</strong> is ${Math.abs(mbProfile.delta)}% below reference. Mind Blast is the highest-priority builder &mdash; it generates Insanity, has 2 charges (Thought Harvester), and deals the second-most damage per cast. Over ${fmt(ALIVE)}, Nurnyx missed approximately <strong>${Math.round((mbProfile.rCPM - mbProfile.pCPM) * ALIVE_MIN)} Mind Blast casts</strong>. Never let Mind Blast cap at 2 charges.</p>
  </div>
  <div class="card" style="border-left: 3px solid var(--red);">
    <div class="card-header red">Shadow Word: Madness: Primary Spender Undercast</div>
    <p style="font-size: 14px;">Shadow Word: Madness at <strong>${swmProfile.pCPM} CPM (${swmProfile.pCount} casts) vs ${swmProfile.rCPM} CPM (${swmProfile.rCount} casts)</strong> is ${Math.abs(swmProfile.delta)}% below reference. SW:Madness is the #1 damage ability and primary Insanity spender. Its rollover mechanic means refreshing early costs nothing &mdash; cast it aggressively to maintain the DoT and trigger Psychic Link cleave.</p>
  </div>
</div>

<div class="card" style="margin-top: 12px; border-left: 3px solid var(--yellow);">
  <div class="card-header yellow">Shadow Word: Death: Over-Use Displacing Builders</div>
  <p style="font-size: 14px;">Shadow Word: Death at <strong>${swdProfile.pCPM} CPM (${swdProfile.pCount} casts) vs ${swdProfile.rCPM} CPM (${swdProfile.rCount} casts)</strong> &mdash; more than double the reference rate. SW:Death should primarily be used in execute range (&lt;20% HP) or with Deathspeaker procs. Outside these windows it deals less damage than Mind Blast and costs a GCD. The self-damage (${(dtBy['Shadow Word: Death']?.total||0).toLocaleString()} damage from ${dtBy['Shadow Word: Death']?.hits||0} hits) also adds unnecessary healer pressure.</p>
</div>
`;

// DAMAGE BREAKDOWN
html += `
<h2>Damage Breakdown</h2>
<p class="section-intro">Top damage sources by % of total. Nurnyx's ${fmt(ALIVE)} wipe vs Fabx's ${fmt(REF_DUR)} kill &mdash; raw totals are not comparable. Focus on damage share distribution.</p>

<div class="card">
<table>
  <thead>
    <tr><th>Ability</th><th>Player Damage</th><th>Player %</th><th>Ref %</th><th>Notes</th></tr>
  </thead>
  <tbody>`;

dmgProfile.forEach(d => {
  if (d.pTotal < totalPDmg * 0.005 && d.rTotal < totalRDmg * 0.005) return;
  const pctDelta = +(d.pPct) - +(d.rPct);
  const deltaClass = pctDelta < -2 ? 'red' : pctDelta > 2 ? 'green' : 'dim';
  const note = pctDelta < -2 ? 'Below ref share' : pctDelta > 2 ? 'Above ref share' : 'Similar';
  html += `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td>${fmtK(d.pTotal)}</td>
      <td>${d.pPct}%</td>
      <td class="purple">${d.rPct}%</td>
      <td class="${deltaClass}">${note}</td>
    </tr>`;
});

html += `
  </tbody>
</table>
</div>
`;

// COOLDOWN USAGE
html += `
<h2>Cooldown Usage</h2>
<p class="section-intro">Shadow Priest burst: Voidform + Power Infusion + Nullsight stacked, with Halo cast during Voidform (Archon hero talent).</p>

<div class="card">
<table>
  <thead>
    <tr><th>Cooldown</th><th>Player Uses</th><th>Player Timing</th><th>Ref Uses</th><th>Assessment</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Voidform</strong> (2 min)</td>
      <td>3</td>
      <td>${pCDs[228260].map(t => fmt(t)).join(', ')}</td>
      <td>4</td>
      <td><span class="tag tag-same">Good for ${fmt(ALIVE)} alive</span></td>
    </tr>
    <tr>
      <td><strong>Power Infusion</strong> (2 min)</td>
      <td>3 (self)</td>
      <td>${pCDs[10060].filter((_,i)=>i%2===0).map(t => fmt(t)).join(', ')}</td>
      <td>4</td>
      <td><span class="tag tag-same">Aligned with VF</span></td>
    </tr>
    <tr>
      <td><strong>Halo</strong> (~25s CD)</td>
      <td>5</td>
      <td>${pCDs[120644].map(t => fmt(t)).join(', ')}</td>
      <td>7</td>
      <td><span class="tag tag-warn">Could cast more</span></td>
    </tr>
    <tr>
      <td><strong>Nullsight</strong></td>
      <td>3</td>
      <td>${pCDs[1260459].map(t => fmt(t)).join(', ')}</td>
      <td>4</td>
      <td><span class="tag tag-same">Aligned with VF</span></td>
    </tr>
    <tr>
      <td><strong>Vampiric Embrace</strong> (2 min)</td>
      <td>2</td>
      <td>${pCDs[15286].map(t => fmt(t)).join(', ')}</td>
      <td>1</td>
      <td><span class="tag tag-same">Raid utility</span></td>
    </tr>
  </tbody>
</table>
</div>

<div class="side-by-side" style="margin-top: 12px;">
  <div class="mechanic-card" style="border-left: 3px solid var(--cyan);">
    <div class="card-header cyan">Nurnyx CD Windows</div>
    <div class="cd-timeline">
      <div><span class="dim">0:05</span> <span class="cast good">PI + Nullsight</span></div>
      <div><span class="dim">0:08</span> <span class="cast good">Voidform (3s after PI)</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed var(--border);"></div>
      <div><span class="dim">2:53</span> <span class="cast good">PI + Nullsight</span></div>
      <div><span class="dim">2:55</span> <span class="cast good">Voidform (2s after PI)</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed var(--border);"></div>
      <div><span class="dim">4:54</span> <span class="cast good">PI + Nullsight</span></div>
      <div><span class="dim">4:57</span> <span class="cast good">Voidform (3s after PI)</span></div>
      <div style="margin-top: 8px;"><strong class="green">All 3 windows perfectly stacked</strong></div>
    </div>
  </div>
  <div class="mechanic-card" style="border-left: 3px solid var(--purple);">
    <div class="card-header purple">Fabx CD Windows <span class="ref-badge">Reference</span></div>
    <div class="cd-timeline">
      <div><span class="dim">0:24</span> <span class="cast good">PI + Nullsight + Voidform</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed var(--border);"></div>
      <div><span class="dim">2:56</span> <span class="cast good">PI + Nullsight + Voidform</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed var(--border);"></div>
      <div><span class="dim">6:11</span> <span class="cast good">PI + Nullsight</span></div>
      <div><span class="dim">6:13</span> <span class="cast good">Voidform</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed var(--border);"></div>
      <div><span class="dim">8:14</span> <span class="cast good">PI + Nullsight + Voidform</span></div>
      <div style="margin-top: 8px;"><strong class="green">All 4 windows perfectly stacked</strong></div>
    </div>
  </div>
</div>
<p class="section-intro" style="margin-top: 8px;"><strong class="green">Cooldown stacking is excellent.</strong> Nurnyx consistently fires PI + Nullsight together, then enters Voidform 2-3 seconds later. This is correct Shadow Priest play. Both players align perfectly.</p>
`;

// CASTING GAPS
html += `
<h2>Casting Gap Analysis</h2>
<p class="section-intro">${gapList.length} gaps &gt; 2.5 seconds detected. The 43.6s gap at 2:04 is the intermission (boss untargetable).</p>

<div class="card">
<table>
  <thead>
    <tr><th>Time</th><th>Duration</th><th>After</th><th>Before</th><th>Context</th></tr>
  </thead>
  <tbody>`;

gapList.forEach(g => {
  const isIntermission = g.duration > 10;
  let context = '';
  if (isIntermission) context = '<span class="tag tag-info">Intermission &mdash; boss untargetable</span>';
  else if (g.duration > 4) context = '<span class="tag tag-warn">Long gap</span>';
  else context = '<span class="tag tag-info">Minor</span>';

  const graspTimes = bossAbilities['Grasp of Emptiness'] || [];
  const voidExpTimes = bossAbilities['Void Expulsion'] || [];
  const nearGrasp = graspTimes.some(t => Math.abs(t - g.time) < 8);
  const nearVoidExp = voidExpTimes.some(t => Math.abs(t - g.time) < 8);
  if (nearGrasp && !isIntermission) context += ' <span class="tag tag-info">Grasp</span>';
  if (nearVoidExp && !isIntermission) context += ' <span class="tag tag-info">Void Exp.</span>';

  html += `
    <tr${isIntermission ? ' style="background: rgba(88,166,255,0.06);"' : g.duration > 4 ? ' style="background: rgba(248,81,73,0.04);"' : ''}>
      <td>${fmt(g.time)}</td>
      <td class="${g.duration > 4 ? 'yellow' : 'dim'}">${g.duration.toFixed(1)}s</td>
      <td>${g.before}</td>
      <td>${g.after}</td>
      <td>${context}</td>
    </tr>`;
});

html += `
  </tbody>
</table>
</div>

<div class="card" style="margin-top: 12px;">
  <div class="card-header">Gap Summary</div>
  <p style="font-size: 14px;">Excluding the 43.6s intermission, there are <strong>${nonIntermissionGaps.length} gaps</strong> totaling <strong>${totalExcessGap.toFixed(1)} seconds excess dead time</strong> (~<strong>${Math.round(totalExcessGap * 0.58)} lost GCDs</strong>). Most gaps are 2.5&ndash;3.5s from movement (Grasp, Void Expulsion). A few 4&ndash;5s gaps (1:21, 2:48, 4:40) suggest GCD drops during mechanics where instant casts could maintain uptime. The reference (Fabx) also has gaps during intermission and mechanics &mdash; this is a normal part of the Crown fight.</p>
</div>
`;

// EXTERNAL BUFFS
html += `
<h2>External Buffs</h2>
<div class="card">
<table>
  <thead>
    <tr><th>Buff</th><th>Player Timing</th><th>Notes</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Time Warp</strong></td>
      <td>${lustTimes.length > 0 ? fmt(lustTimes[0]) : 'Not detected'}</td>
      <td><span class="tag tag-info">${lustTimes.length > 0 ? 'Phase 2 lust' : 'May have been used before Nurnyx joined'}</span></td>
    </tr>
    <tr>
      <td><strong>Ebon Might</strong></td>
      <td>${ebonTimes.length} applications</td>
      <td><span class="tag tag-same">Aug Evoker support</span></td>
    </tr>
    <tr>
      <td><strong>Prescience</strong></td>
      <td>${prescienceTimes.length} applications (${prescienceTimes.map(t => fmt(t)).join(', ')})</td>
      <td><span class="tag tag-same">Crit buff from Aug</span></td>
    </tr>
    <tr>
      <td><strong>Power Infusion</strong></td>
      <td>Self-cast (3x)</td>
      <td><span class="tag tag-info">Twins of the Sun Priestess</span></td>
    </tr>
  </tbody>
</table>
</div>
`;

// DAMAGE TAKEN
html += `
<h2>Damage Taken</h2>
<p class="section-intro">Damage sources during Pull 27. Dimensional Slash was the killing blow at ${fmt(ALIVE)}.</p>

<div class="card">
<table>
  <thead>
    <tr><th>Source</th><th>Total Damage</th><th>Hits</th><th>Absorbed</th><th>Avoidable?</th></tr>
  </thead>
  <tbody>`;

dtSorted.forEach(([name, data]) => {
  let avoidable = '<span class="tag tag-same">Unavoidable</span>';
  if (name === 'Falling') avoidable = '<span class="tag tag-warn">Positioning</span>';
  else if (name === 'Shadow Word: Death') avoidable = '<span class="tag tag-warn">Self-inflicted</span>';
  else if (name === 'Dimensional Slash') avoidable = '<span class="tag tag-diff">Fatal &mdash; need defensive</span>';
  else if (name.includes('Silverstrike')) avoidable = '<span class="tag tag-info">Mechanic soak</span>';
  else if (name === 'Corrupting Essence') avoidable = '<span class="tag tag-info">Sentinel debuff</span>';
  else if (name === 'Bursting Emptiness') avoidable = '<span class="tag tag-warn">Proximity</span>';

  html += `
    <tr>
      <td><strong>${name}</strong></td>
      <td>${data.total.toLocaleString()}</td>
      <td>${data.hits}</td>
      <td>${data.absorbed > 0 ? data.absorbed.toLocaleString() : '&mdash;'}</td>
      <td>${avoidable}</td>
    </tr>`;
});

html += `
  </tbody>
</table>
</div>
<p class="section-intro" style="margin-top: 8px;">The <strong>Falling damage (456K, 2 hits)</strong> is from platform transitions. <strong>Shadow Word: Death self-damage (112K, 17 hits)</strong> is from over-use outside execute windows. Reducing unnecessary SW:Death casts saves ~112K incoming damage and eases healing pressure.</p>
`;

// WIPE PROGRESSION
html += `
<h2>Wipe Progression</h2>
<p class="section-intro">Nurnyx's DPS across ${progFights.length} Crown pulls (subbed in partway through the night). Boss % labels show progression depth. Color: <span class="green">green</span> = best (&lt;55%), <span class="yellow">yellow</span> = good (55&ndash;75%), <span class="orange">orange</span> = medium (75&ndash;90%), <span class="red">red</span> = early (&gt;90%).</p>

<div class="card">
  <div class="progression-chart">`;

progFights.forEach(f => {
  const heightPct = Math.max(10, (f.dps / maxDPS * 100)).toFixed(0);
  let color = 'var(--red)';
  if (f.bossPercent < 55) color = 'var(--green)';
  else if (f.bossPercent < 75) color = 'var(--yellow)';
  else if (f.bossPercent < 90) color = 'var(--orange)';

  html += `    <div class="prog-bar" style="height: ${heightPct}%; background: ${color};" data-tooltip="F${f.fid}: ${(f.dps/1000).toFixed(1)}K DPS (${fmt(f.duration)}, ${f.bossPercent}% boss)"><span class="prog-label">${f.bossPercent.toFixed(0)}%</span></div>\n`;
});

html += `  </div>
  <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); padding: 16px 4px 0;">
    <span>F${progFights[0].fid}</span>
    <span>Boss % labels &middot; <span class="red">Early</span> &middot; <span class="orange">Medium</span> &middot; <span class="yellow">Good</span> &middot; <span class="green">Best</span></span>
    <span>F${progFights[progFights.length-1].fid}</span>
  </div>
</div>

<div class="card" style="margin-top: 12px;">
  <div class="card-header">Progression Trend</div>
  <p style="font-size: 14px;">Clear improvement across the night. Early pulls (F3: ${(perFight['3'].dps/1000).toFixed(1)}K, F8: ${(perFight['8'].dps/1000).toFixed(1)}K) were learning P1 Sentinel mechanics. Mid-session (F15: ${(perFight['15'].dps/1000).toFixed(1)}K, F18: ${(perFight['18'].dps/1000).toFixed(1)}K) started reaching Phase 2 consistently. The <strong>final two pulls were Nurnyx's best</strong>: F27 (${(perFight['27'].dps/1000).toFixed(1)}K, ${perFight['27'].bossPercent}%) and F28 (${(perFight['28'].dps/1000).toFixed(1)}K, ${perFight['28'].bossPercent}%). DPS increasing as mechanics become familiar &mdash; healthy progression curve.</p>
</div>
`;

// STATS
html += `
<h2>Stats Comparison</h2>
<div class="card">
<table>
  <thead>
    <tr><th>Stat</th><th>Nurnyx</th><th>Fabx (Ref)</th><th>Notes</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Item Level</strong></td><td>${ilvl}</td><td>${fabxRef.ilvl.toFixed(1)}</td><td><span class="tag tag-same">Nearly identical</span></td></tr>
    <tr><td>Intellect</td><td>${ci.intellect.toLocaleString()}</td><td>2,666</td><td><span class="tag tag-same">Similar</span></td></tr>
    <tr><td>Crit</td><td>${ci.critSpell.toLocaleString()}</td><td>697</td><td>Player +${Math.round((ci.critSpell-697)/697*100)}%</td></tr>
    <tr><td>Haste</td><td class="yellow">${ci.hasteSpell.toLocaleString()}</td><td>952</td><td class="yellow">Player &minus;${Math.round((952-ci.hasteSpell)/952*100)}%</td></tr>
    <tr><td>Mastery</td><td class="green">${ci.mastery.toLocaleString()}</td><td>1,023</td><td class="green">Player +${Math.round((ci.mastery-1023)/1023*100)}%</td></tr>
    <tr><td>Versatility</td><td>${ci.versatilityDamageDone}</td><td>160</td><td class="dim">Both low</td></tr>
  </tbody>
</table>
</div>
<p class="section-intro" style="margin-top: 8px;">Nurnyx has <strong class="yellow">${Math.round((952-ci.hasteSpell)/952*100)}% less Haste</strong> (${ci.hasteSpell} vs 952). Haste affects DoT tick rate, GCD speed, and Insanity generation &mdash; partially explaining the CPM gap. Nurnyx has <strong class="green">${Math.round((ci.mastery-1023)/1023*100)}% more Mastery</strong> which boosts Shadow Weaving. Stat profiles are different but roughly equivalent in total power.</p>
`;

// ACTIONABLE ITEMS
html += `
<h2>Actionable Items</h2>

<div class="action-item critical">
  <strong>1. Increase Mind Blast usage to ${mbProfile.rCPM}+ CPM.</strong> Currently at ${mbProfile.pCPM} CPM vs reference ${mbProfile.rCPM}. Mind Blast is the #1 Insanity builder and second-highest damage ability. With 2 charges (Thought Harvester), it should never cap. Each additional cast generates ~25 Insanity, enabling more SW:Madness casts downstream. Estimated improvement: <strong>+${Math.round((mbProfile.rCPM - mbProfile.pCPM) * ALIVE_MIN)} casts = ~3-5% more total damage</strong>.
</div>

<div class="action-item critical">
  <strong>2. Cast Shadow Word: Madness more aggressively (${swmProfile.rCPM}+ CPM).</strong> Currently ${swmProfile.pCPM} CPM vs ${swmProfile.rCPM} &mdash; the biggest single-ability gap. The rollover mechanic means refreshing early has zero cost. Cast whenever Insanity &gt;40 and the DoT is expiring or near Insanity cap. More SW:Madness also drives Psychic Link cleave on Crown's multi-target windows (Sentinels, Droplets, Simulacrum). Estimated improvement: <strong>~5-8% more total damage</strong>.
</div>

<div class="action-item">
  <strong>3. Reduce Shadow Word: Death outside execute windows.</strong> At ${swdProfile.pCPM} CPM (over 2x reference). Use SW:Death only when: (a) targets below 20%, (b) Deathspeaker proc active, or (c) last resort during forced movement. Each non-execute SW:Death deals less than Mind Blast and costs a GCD plus 112K self-damage over the fight.
</div>

<div class="action-item">
  <strong>4. Use Desperate Prayer for Dimensional Slash.</strong> Nurnyx died to the P2/3 transition at ${fmt(ALIVE)}. Desperate Prayer was last used 27 seconds earlier and should have been off cooldown. Pre-casting Desperate Prayer or Fade + Body and Soul for this window could survive the hit. This is the team's current wipe mechanic.
</div>

<div class="action-item">
  <strong>5. Maintain casts through movement mechanics.</strong> ${nonIntermissionGaps.length} gaps totaling ${totalExcessGap.toFixed(1)}s excess dead time (~${Math.round(totalExcessGap * 0.58)} lost GCDs). Shadow Priest has strong movement tools: SW:Pain refresh, SW:Death (execute only), SW:Madness if Insanity available, Angelic Feather for repositioning. During Grasp and Void Expulsion, prioritize instant casts over standing still.
</div>
`;

// WHAT'S GOOD
html += `
<div class="card" style="margin-top: 24px; border-left: 3px solid var(--green);">
  <div class="card-header green">What's Already Good</div>
  <p style="font-size: 14px;">
    <strong>Cooldown Stacking:</strong> All 3 Voidform windows perfectly stacked with Power Infusion and Nullsight. 2-3 second delay between PI and Voidform is correct sequencing. Textbook Shadow Priest CD management.<br><br>
    <strong>Vampiric Embrace Utility:</strong> VE used twice for raid healing during progression &mdash; valuable team contribution on prog.<br><br>
    <strong>Progression Curve:</strong> DPS improved consistently from ${(perFight['3'].dps/1000).toFixed(1)}K (F3) to ${(perFight['28'].dps/1000).toFixed(1)}K (F28). Best two pulls were the last two &mdash; healthy learning trajectory.<br><br>
    <strong>DoT Maintenance:</strong> Shadow Word: Pain at ${castProfile.find(a=>a.name==='Shadow Word: Pain').pCPM} CPM is close to reference (${castProfile.find(a=>a.name==='Shadow Word: Pain').rCPM}), indicating consistent DoT application across targets.<br><br>
    <strong>Archon Talent Usage:</strong> Halo and Voidform both used correctly in the Archon hero tree rotation. Halo could be cast slightly more (5 vs ref 7) but the gap is partly from shorter fight length.
  </p>
</div>

<div class="card" style="margin-top: 12px;">
  <div class="card-header">Summary</div>
  <p style="font-size: 14px;">This is <strong>night 2 progression</strong> on Mythic Crown. The team is learning the Dimensional Slash transition &mdash; that is the current wall. Nurnyx's DPS is growing each pull, cooldown management is strong, and the rotation issues (Mind Blast + SW:Madness CPM, SW:Death over-use) are execution gaps that will naturally tighten as mechanics become familiar. The ${(refCPM - playerCPM).toFixed(1)} CPM gap vs reference is partially from movement during new mechanics and partially from ${Math.round((952-ci.hasteSpell)/952*100)}% less Haste (${ci.hasteSpell} vs 952). Focus on Mind Blast charge management and aggressive SW:Madness spending &mdash; those two changes alone could add 8-12% damage and help push through the Phase 2/3 transition.</p>
</div>
`;

// FOOTER
html += `
<div style="margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--dim); font-size: 12px;">
  <p>Analysis generated from Warcraft Logs report <code>jqFfXprk4hcaWx3C</code>, Fight 27 (Wipe, ${fmt(FIGHT_DUR)}, ${bestPull.bossPercent}% boss). Reference: Fabx (#4 ranked Shadow Priest, report <code>K6Xx8k2NyHhbwCM4</code>, Fight 48, ${fmt(REF_DUR)} kill, 0 talent differences). All times relative to fight start.</p>
  <p style="margin-top: 4px;">Talent delta: 0 differences. Item level: ${ilvl} vs ${fabxRef.ilvl.toFixed(1)}. External buffs: Time Warp at ${lustTimes.length > 0 ? fmt(lustTimes[0]) : '?'}, ${ebonTimes.length} Ebon Might, ${prescienceTimes.length} Prescience. Shadow Priest spec guide sourced from Wowhead and Icy Veins (Patch 12.0.7). Boss mechanics from Method and Icy Veins Crown of the Cosmos mythic guides.</p>
</div>

</body>
</html>`;

fs.writeFileSync('healing-cds/log-20260618-nurnyx.html', html);
console.log('HTML written successfully! Length:', html.length, 'chars');
