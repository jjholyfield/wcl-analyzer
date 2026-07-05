import { readFileSync, writeFileSync } from 'fs';

const DIR = 'C:/DRIVE/CODE/wcl-analyzer/data/log-20260617';
const OUT = 'C:/DRIVE/CODE/wcl-analyzer/healing-cds';
const REPORT = '1Mch2jqLWmAZ8r9a';
const DATE = 'June 17, 2026';
const SLUG = 'log-20260617';
const BOSS = 'Mythic Rotmire';

const fights = JSON.parse(readFileSync(DIR + '/fights.json', 'utf8'));
const perFight = JSON.parse(readFileSync(DIR + '/per-fight.json', 'utf8'));
const players = JSON.parse(readFileSync(DIR + '/players.json', 'utf8'));
const deathsByFight = JSON.parse(readFileSync(DIR + '/deaths.json', 'utf8'));
const consByFight = JSON.parse(readFileSync(DIR + '/consumables.json', 'utf8'));
const playerCasts = JSON.parse(readFileSync(DIR + '/player-casts.json', 'utf8'));
const rankings = JSON.parse(readFileSync(DIR + '/rankings.json', 'utf8'));
const topCasts = JSON.parse(readFileSync(DIR + '/top-casts.json', 'utf8'));

const WCL_COLORS = {
  DeathKnight: '#c41e3a', DemonHunter: '#a330c9', Druid: '#ff7c0a',
  Evoker: '#33937f', Hunter: '#aad372', Mage: '#3fc7eb',
  Monk: '#00ff98', Paladin: '#f48cba', Priest: '#fff', Rogue: '#fff468',
  Shaman: '#0070DD', Warlock: '#8788ee', Warrior: '#c69b6d',
};

// ── Build fight map ──
const fightMap = {};
for (const f of fights) fightMap[f.id] = f;
const fightIDs = fights.map(f => f.id);
const killFight = fights.find(f => f.kill);

// ── Compute per-player per-fight stats ──
function computePlayerStats() {
  const stats = {};
  for (const [pid, p] of Object.entries(players)) {
    const pStats = { ...p, pid: Number(pid), fights: [] };
    for (const fid of fightIDs) {
      const f = fightMap[fid];
      const pf = perFight[fid];
      if (!pf) continue;
      const dur = pf.totalTime / 1000;
      if (dur < 10) continue;
      const dmgEntry = pf.dmg.find(d => d.id === Number(pid));
      const healEntry = pf.heal.find(h => h.id === Number(pid));
      if (!dmgEntry && !healEntry) continue;
      const dmg = dmgEntry ? dmgEntry.total : 0;
      const heal = healEntry ? healEntry.total : 0;
      const deathEvts = (deathsByFight[fid] || []).filter(d => d.targetID === Number(pid));
      const died = deathEvts.length > 0 ? deathEvts[0] : null;
      const consEvts = (consByFight[fid] || []).filter(c => c.sourceID === Number(pid));
      const hasHS = consEvts.some(c => c.abilityID === 6262);
      const hasHP = consEvts.some(c => c.abilityID === 1234768);
      const hasMP = consEvts.some(c => c.abilityID === 1236648);
      const isKill = f.kill;
      pStats.fights.push({
        fid, dur, dmg, heal,
        dps: Math.round(dmg / dur),
        hps: Math.round(heal / dur),
        died, hasHS, hasHP, hasMP, isKill,
        pullNum: fightIDs.indexOf(fid) + 1,
      });
    }
    const validFights = pStats.fights.filter(f => f.dur >= 30);
    pStats.pullCount = pStats.fights.length;
    pStats.avgDPS = validFights.length ? Math.round(validFights.reduce((s, f) => s + f.dps, 0) / validFights.length) : 0;
    pStats.avgHPS = validFights.length ? Math.round(validFights.reduce((s, f) => s + f.hps, 0) / validFights.length) : 0;
    pStats.earlyDeaths = pStats.fights.filter(f => f.died && (f.dur - f.died.time) > 30).length;
    pStats.earlyDeathPct = pStats.pullCount ? Math.round(pStats.earlyDeaths / pStats.pullCount * 100) : 0;
    pStats.hsUsage = pStats.pullCount ? Math.round(pStats.fights.filter(f => f.hasHS).length / pStats.pullCount * 100) : 0;
    pStats.hpUsage = pStats.pullCount ? Math.round(pStats.fights.filter(f => f.hasHP).length / pStats.pullCount * 100) : 0;
    pStats.mpUsage = pStats.pullCount ? Math.round(pStats.fights.filter(f => f.hasMP).length / pStats.pullCount * 100) : 0;
    const casts = playerCasts[pid];
    if (casts) {
      pStats.totalCastTime = casts.totalTime;
      pStats.totalCasts = casts.abilities.reduce((s, a) => s + a.total, 0);
      pStats.cpm = pStats.totalCastTime > 0 ? (pStats.totalCasts / (pStats.totalCastTime / 60)).toFixed(1) : '0';
      pStats.abilities = casts.abilities;
    }
    stats[pid] = pStats;
  }
  return stats;
}

const allStats = computePlayerStats();

// ── Get top player comparison for a spec ──
function getTopComparison(type, spec, role) {
  const key = type + '-' + spec;
  const hpsKey = key + '_hps';
  if (role === 'healer' && topCasts[hpsKey]) {
    return { ...topCasts[hpsKey], ranking: rankings[hpsKey] };
  }
  if (topCasts[key]) {
    return { ...topCasts[key], ranking: rankings[key] };
  }
  return null;
}

// ── Rotation comparison ──
function buildRotationComparison(pStats, topComp) {
  if (!topComp || !pStats.abilities) return [];
  const topMin = topComp.totalTime / 60;
  const playerMin = pStats.totalCastTime / 60;
  const topMap = {};
  for (const a of topComp.abilities) {
    topMap[a.name] = { cpm: (a.total / topMin).toFixed(1), total: a.total };
  }
  const rows = [];
  const ignoreAbilities = new Set([
    'Melee', 'Auto Attack', 'Auto Shot', 'Light\'s Potential',
    'Silvermoon Health Potion', 'Healthstone', 'Lightfused Mana Potion',
    'Ethereal Augmentation',
  ]);
  for (const a of pStats.abilities.sort((x, y) => y.total - x.total)) {
    if (ignoreAbilities.has(a.name)) continue;
    const cpm = (a.total / playerMin).toFixed(1);
    const topEntry = topMap[a.name];
    const topCpm = topEntry ? topEntry.cpm : '0.0';
    let gap = '', verdict = 'ok';
    if (topEntry) {
      const pct = Math.round((parseFloat(cpm) / parseFloat(topCpm)) * 100);
      if (pct < 60) { gap = pct + '%'; verdict = 'bad'; }
      else if (pct < 80) { gap = pct + '%'; verdict = 'warn'; }
      else if (pct > 200 && parseFloat(topCpm) > 0.5) { gap = (parseFloat(cpm) / parseFloat(topCpm)).toFixed(1) + 'x over'; verdict = 'bad'; }
      else if (pct > 150 && parseFloat(topCpm) > 0.5) { gap = (parseFloat(cpm) / parseFloat(topCpm)).toFixed(1) + 'x over'; verdict = 'warn'; }
      else { gap = pct + '%'; verdict = 'ok'; }
    } else if (parseFloat(cpm) > 1.0) {
      gap = 'not cast by #1'; verdict = 'warn';
    } else {
      gap = '—'; verdict = 'ok';
    }
    rows.push({ name: a.name, cpm, topCpm, gap, verdict, total: a.total });
  }
  return rows.filter(r => parseFloat(r.cpm) >= 0.3 || parseFloat(r.topCpm) >= 0.3).slice(0, 15);
}

// ── Generate findings ──
function generateFindings(pStats, rotation, topComp) {
  const findings = [];
  const isHealer = pStats.role === 'healer';
  const metric = isHealer ? 'HPS' : 'DPS';
  const avg = isHealer ? pStats.avgHPS : pStats.avgDPS;
  if (topComp && topComp.ranking) {
    const topAmount = Math.round(topComp.ranking.amount);
    const pct = Math.round(avg / topAmount * 100);
    if (pct < 60) findings.push({ type: 'bad', text: `Average ${metric} is ${(avg/1000).toFixed(0)}K &mdash; ${pct}% of the #1 ${pStats.spec} (${(topAmount/1000).toFixed(0)}K). Significant gap to close.` });
    else if (pct < 80) findings.push({ type: 'warn', text: `Average ${metric} at ${(avg/1000).toFixed(0)}K is ${pct}% of the #1 ${pStats.spec} (${(topAmount/1000).toFixed(0)}K). Room to improve.` });
  }
  if (pStats.earlyDeathPct > 25) findings.push({ type: 'bad', text: `Dying early in ${pStats.earlyDeathPct}% of pulls (${pStats.earlyDeaths}/${pStats.pullCount}). Each death drops ${metric} significantly and removes a body for mechanics.` });
  else if (pStats.earlyDeathPct > 15) findings.push({ type: 'warn', text: `${pStats.earlyDeaths} early deaths across ${pStats.pullCount} pulls (${pStats.earlyDeathPct}%). Room to improve on survivability.` });
  if (pStats.hsUsage < 30) findings.push({ type: 'bad', text: `Healthstone usage at ${pStats.hsUsage}%. Free survivability being left on the table.` });
  else if (pStats.hsUsage < 50) findings.push({ type: 'warn', text: `Healthstone usage at ${pStats.hsUsage}% &mdash; should be higher on progression.` });
  if (pStats.hpUsage < 30) findings.push({ type: 'warn', text: `Health potion usage at ${pStats.hpUsage}%. Separate CD from DPS pots &mdash; should be used more.` });
  if (isHealer && pStats.mpUsage === 0 && pStats.pullCount > 5) {
    findings.push({ type: 'bad', text: `Zero mana pots across ${pStats.pullCount} pulls. ${pStats.spec === 'Restoration' && pStats.type === 'Shaman' ? 'RSham is mana-hungry &mdash; this is a real problem.' : 'Mana pots extend your throughput on longer pulls.'}` });
  }
  const badRotation = rotation.filter(r => r.verdict === 'bad' && parseFloat(r.cpm) >= 1.0);
  for (const r of badRotation.slice(0, 3)) {
    if (r.gap.includes('over')) {
      findings.push({ type: 'warn', text: `${r.name} at ${r.cpm}/m is ${r.gap} the #1's ${r.topCpm}/m. Consider whether those GCDs should go elsewhere.` });
    } else if (r.gap.includes('%')) {
      findings.push({ type: 'bad', text: `${r.name} at ${r.cpm}/m vs ${r.topCpm}/m (${r.gap}) &mdash; key ability being undercast.` });
    }
  }
  return findings;
}

// ── Generate action items ──
function generateActions(findings) {
  const actions = [];
  let num = 1;
  for (const f of findings.filter(f => f.type === 'bad').slice(0, 4)) {
    actions.push({ num: num++, text: f.text.replace(/&mdash;/g, '—').replace(/<[^>]+>/g, '') });
  }
  for (const f of findings.filter(f => f.type === 'warn').slice(0, 2)) {
    if (num > 4) break;
    actions.push({ num: num++, text: f.text.replace(/&mdash;/g, '—').replace(/<[^>]+>/g, '') });
  }
  return actions;
}

// ── HTML Templates ──
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 32px; max-width: 960px; margin: 0 auto; line-height: 1.6; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 18px; font-weight: 600; color: #c4a1ff; margin-top: 40px; margin-bottom: 16px; border-bottom: 1px solid #222; padding-bottom: 6px; }
  h3 { font-size: 15px; font-weight: 600; color: #fff; margin-top: 24px; margin-bottom: 10px; }
  .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .overview-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px; text-align: center; }
  .overview-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .overview-value { font-size: 28px; font-weight: 700; }
  .overview-sub { font-size: 12px; color: #555; margin-top: 4px; }
  .compare-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
  .compare-table th { text-align: left; padding: 8px 12px; background: #141414; color: #888; font-weight: 600; border-bottom: 1px solid #222; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .compare-table td { padding: 6px 12px; border-bottom: 1px solid #1a1a1a; color: #aaa; }
  .compare-table tr:hover { background: #161616; }
  .bad { color: #ff6b6b; font-weight: 600; }
  .warn { color: #ffa940; font-weight: 600; }
  .ok { color: #4caf50; font-weight: 600; }
  .finding { background: #141414; border-radius: 6px; padding: 16px 20px; margin-bottom: 12px; font-size: 14px; color: #bbb; line-height: 1.7; }
  .finding-bad { border-left: 3px solid #ff6b6b; background: #1a1212; }
  .finding-warn { border-left: 3px solid #ffa940; background: #1a1710; }
  .finding-good { border-left: 3px solid #4caf50; background: #121a14; }
  .finding strong { color: #fff; }
  .action { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 18px 22px; margin-bottom: 12px; }
  .action-num { font-size: 28px; font-weight: 700; color: #333; float: left; margin-right: 16px; font-family: 'Courier New', monospace; line-height: 1; }
  .action-title { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px; }
  .action-body { font-size: 13px; color: #999; line-height: 1.7; }
  details { margin-top: 36px; }
  summary { font-size: 14px; font-weight: 600; color: #666; cursor: pointer; padding: 8px 0; }
  summary:hover { color: #999; }
  .details-inner { background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 16px 20px; margin-top: 8px; font-size: 13px; color: #888; line-height: 1.7; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #444; text-align: center; }
  a { color: inherit; }
`;

const INDEX_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 32px; max-width: 960px; margin: 0 auto; line-height: 1.5; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 18px; font-weight: 600; color: #c4a1ff; margin-top: 36px; margin-bottom: 12px; border-bottom: 1px solid #222; padding-bottom: 6px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .summary-card { background: #0d0d0d; border-radius: 6px; padding: 14px; text-align: center; border: 1px solid #1a1a1a; }
  .summary-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .summary-value { font-size: 24px; font-weight: 700; color: #fff; }
  .summary-sub { font-size: 12px; color: #555; margin-top: 2px; }
  .player-card { display: block; background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 16px 20px; margin-bottom: 8px; text-decoration: none; transition: border-color 0.2s, background 0.2s; }
  .player-card:hover { border-color: #333; background: #151515; }
  .player-row { display: flex; align-items: center; gap: 14px; }
  .player-rank { font-size: 16px; font-weight: 700; color: #333; min-width: 28px; text-align: center; font-family: 'Courier New', monospace; }
  .player-card:hover .player-rank { color: #c4a1ff; }
  .player-info { flex: 1; }
  .player-name { font-size: 15px; font-weight: 600; color: #fff; }
  .player-spec { font-size: 12px; color: #666; }
  .player-stats { display: flex; gap: 20px; font-size: 12px; color: #888; }
  .player-stat-bad { color: #ff6b6b; }
  .player-stat-warn { color: #ffa940; }
  .player-stat-ok { color: #4caf50; }
  .player-arrow { font-size: 16px; color: #333; }
  .player-card:hover .player-arrow { color: #888; }
  .role-header { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #555; margin-top: 20px; margin-bottom: 10px; }
  .boss-tag { display: inline-block; background: #1a1212; border: 1px solid #332222; color: #ff6b6b; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 16px; }
  .trend-box { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px; }
  .trend-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .trend-value { font-size: 28px; font-weight: 700; }
  .trend-detail { font-size: 12px; color: #666; margin-top: 4px; }
  .finding { background: #141414; border-radius: 6px; padding: 14px 18px; margin-bottom: 12px; font-size: 13px; color: #bbb; line-height: 1.7; }
  .finding-bad { border-left: 3px solid #ff6b6b; }
  .finding-warn { border-left: 3px solid #ffa940; }
  .finding-good { border-left: 3px solid #4caf50; }
  .finding strong { color: #fff; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #444; text-align: center; }
  a { color: inherit; }
`;

function fmtDur(s) {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function colorForPct(pct) {
  if (pct >= 80) return '#4caf50';
  if (pct >= 50) return '#ffa940';
  return '#ff6b6b';
}

// ── Generate player page ──
function generatePlayerPage(pStats) {
  const isHealer = pStats.role === 'healer';
  const isTank = pStats.role === 'tank';
  const metric = isHealer ? 'HPS' : 'DPS';
  const avg = isHealer ? pStats.avgHPS : pStats.avgDPS;
  const specKey = pStats.type + '-' + pStats.spec;
  const hpsKey = specKey + '_hps';
  const topComp = getTopComparison(pStats.type, pStats.spec, pStats.role);
  const rotation = buildRotationComparison(pStats, topComp);
  const findings = generateFindings(pStats, rotation, topComp);
  const actions = generateActions(findings);
  const classColor = WCL_COLORS[pStats.type] || '#fff';
  const topName = topComp ? topComp.name : 'N/A';
  const topAmount = topComp && topComp.ranking ? Math.round(topComp.ranking.amount) : 0;
  const vsPct = topAmount > 0 ? Math.round(avg / topAmount * 100) : 0;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Player Audit &mdash; ${pStats.name} (${pStats.spec} ${pStats.type}) &mdash; ${BOSS} &mdash; ${DATE}</title>
<style>${CSS}</style>
</head>
<body>

<h1>Player Audit &mdash; <span style="color:${classColor}">${pStats.name}</span></h1>
<p class="subtitle">${pStats.spec} ${pStats.type} &mdash; ${BOSS} &mdash; ${DATE} &mdash; ${pStats.pullCount} pulls analyzed</p>

<div class="overview-grid">
  <div class="overview-card">
    <div class="overview-label">Avg ${metric}</div>
    <div class="overview-value" style="color:${colorForPct(vsPct)}">${(avg/1000).toFixed(0)}K</div>
    <div class="overview-sub">#1: ${(topAmount/1000).toFixed(0)}K (${vsPct}%)</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">Avg CPM</div>
    <div class="overview-value" style="color:#e0e0e0">${pStats.cpm || '?'}</div>
    <div class="overview-sub">${pStats.pullCount} pulls</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">Died Early</div>
    <div class="overview-value" style="color:${pStats.earlyDeathPct > 20 ? '#ff6b6b' : pStats.earlyDeathPct > 10 ? '#ffa940' : '#4caf50'}">${pStats.earlyDeaths}/${pStats.pullCount}</div>
    <div class="overview-sub">${pStats.earlyDeathPct}% of pulls</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">Healthstones</div>
    <div class="overview-value" style="color:${pStats.hsUsage >= 50 ? '#4caf50' : pStats.hsUsage >= 30 ? '#ffa940' : '#ff6b6b'}">${pStats.hsUsage}%</div>
    <div class="overview-sub">usage rate</div>
  </div>
</div>

<h2>Consumables &amp; Defensives</h2>
<table class="compare-table">
  <tr><th>Consumable</th><th>Usage</th><th>Verdict</th></tr>
  <tr>
    <td><strong>Healthstone</strong></td>
    <td class="${pStats.hsUsage >= 50 ? 'ok' : pStats.hsUsage >= 30 ? 'warn' : 'bad'}">${pStats.fights.filter(f => f.hasHS).length}/${pStats.pullCount} pulls (${pStats.hsUsage}%)</td>
    <td class="${pStats.hsUsage >= 50 ? 'ok' : pStats.hsUsage >= 30 ? 'warn' : 'bad'}">${pStats.hsUsage >= 50 ? 'Good' : pStats.hsUsage >= 30 ? 'Could be higher' : 'Free survivability unused'}</td>
  </tr>
  <tr>
    <td><strong>Health Potion</strong></td>
    <td class="${pStats.hpUsage >= 40 ? 'ok' : pStats.hpUsage >= 20 ? 'warn' : 'bad'}">${pStats.fights.filter(f => f.hasHP).length}/${pStats.pullCount} pulls (${pStats.hpUsage}%)</td>
    <td class="${pStats.hpUsage >= 40 ? 'ok' : pStats.hpUsage >= 20 ? 'warn' : 'bad'}">${pStats.hpUsage >= 40 ? 'Good' : 'Separate CD from DPS pots &mdash; should be used more'}</td>
  </tr>`;

  if (isHealer) {
    html += `
  <tr>
    <td><strong>Mana Potion</strong></td>
    <td class="${pStats.mpUsage > 0 ? 'ok' : 'bad'}">${pStats.fights.filter(f => f.hasMP).length}/${pStats.pullCount} pulls (${pStats.mpUsage}%)</td>
    <td class="${pStats.mpUsage > 0 ? 'ok' : 'bad'}">${pStats.mpUsage > 0 ? 'Good' : 'Healer mana pots extend throughput on long pulls'}</td>
  </tr>`;
  }

  html += `
</table>`;

  // Deaths section — only show deaths where player died >30s before fight end (not wipe deaths)
  const meaningfulDeaths = pStats.fights.filter(f => f.died && (f.dur - f.died.time) > 30);
  if (meaningfulDeaths.length > 0) {
    html += `
<h3>Died Early (${meaningfulDeaths.length}/${pStats.pullCount} pulls)</h3>
<table class="compare-table">
  <tr><th>Pull</th><th>Died At</th><th>Fight Duration</th><th>Time Left</th></tr>`;
    for (const f of meaningfulDeaths) {
      const timeLeft = f.dur - f.died.time;
      html += `
  <tr><td>#${f.pullNum}</td><td>${fmtDur(f.died.time)}</td><td>${fmtDur(f.dur)}</td><td>${fmtDur(timeLeft)} remaining</td></tr>`;
    }
    html += `
</table>`;
  }

  // Rotation comparison
  if (rotation.length > 0 && topComp) {
    html += `
<h2>Rotation vs #1 ${pStats.spec} (${topComp.name})</h2>
<table class="compare-table">
  <tr><th>Ability</th><th>${pStats.name} (per min)</th><th>${topComp.name} (per min)</th><th>Gap</th></tr>`;
    for (const r of rotation) {
      html += `
  <tr>
    <td><strong>${r.name}</strong></td>
    <td>${r.cpm}</td>
    <td>${r.topCpm}</td>
    <td class="${r.verdict}">${r.gap}</td>
  </tr>`;
    }
    html += `
</table>`;
  }

  // Findings
  if (findings.length > 0) {
    html += `
<h2>Key Findings</h2>`;
    for (const f of findings) {
      html += `
<div class="finding finding-${f.type}">
  <strong>${f.text}</strong>
</div>`;
    }
  }

  // Actions
  if (actions.length > 0) {
    html += `
<h2>What to Work On</h2>`;
    for (const a of actions) {
      html += `
<div class="action">
  <div class="action-num">${a.num}</div>
  <div class="action-body">${a.text}</div>
  <div style="clear:both"></div>
</div>`;
    }
  }

  // Pull-by-pull table
  html += `
<details>
  <summary>Full Pull-by-Pull Data</summary>
  <div class="details-inner">
    <table class="compare-table">
      <tr><th>Pull</th><th>Dur</th><th>${metric}</th><th>HS</th><th>HP</th><th>Note</th></tr>`;
  for (const f of pStats.fights) {
    const val = isHealer ? f.hps : f.dps;
    const note = f.died ? `<span class="bad">Died ${fmtDur(f.died.time)}</span>` : (f.isKill ? '<span class="ok">KILL</span>' : '');
    html += `
      <tr>
        <td>#${f.pullNum}</td>
        <td>${fmtDur(f.dur)}</td>
        <td>${(val/1000).toFixed(0)}K</td>
        <td>${f.hasHS ? '<span class="ok">&#10003;</span>' : '&mdash;'}</td>
        <td>${f.hasHP ? '<span class="ok">&#10003;</span>' : '&mdash;'}</td>
        <td>${note}</td>
      </tr>`;
  }
  html += `
    </table>
  </div>
</details>

<div class="footer">
  <a href="${SLUG}" style="color:#555; text-decoration:none;">&larr; Back to Raid Night Overview</a>
</div>

</body>
</html>`;

  return html;
}

// ── Generate index page ──
function generateIndexPage() {
  const dpsPlayers = Object.values(allStats).filter(p => p.role === 'dps').sort((a, b) => b.avgDPS - a.avgDPS);
  const healerPlayers = Object.values(allStats).filter(p => p.role === 'healer').sort((a, b) => b.avgHPS - a.avgHPS);
  const tankPlayers = Object.values(allStats).filter(p => p.role === 'tank').sort((a, b) => b.avgDPS - a.avgDPS);
  const allPlayersSorted = [...dpsPlayers, ...healerPlayers, ...tankPlayers];

  const totalPulls = fightIDs.length;
  const bestWipe = fights.filter(f => !f.kill && f.fightPercentage).sort((a, b) => a.fightPercentage - b.fightPercentage)[0];
  const bestWipePct = bestWipe ? (bestWipe.fightPercentage / 100).toFixed(1) + '%' : 'N/A';
  const bestWipeDur = bestWipe ? fmtDur((bestWipe.endTime - bestWipe.startTime) / 1000) : '';
  const bestWipePull = bestWipe ? fightIDs.indexOf(bestWipe.id) + 1 : '';
  const killDur = killFight ? fmtDur((killFight.endTime - killFight.startTime) / 1000) : '';

  // Team trends
  const avgHS = Math.round(allPlayersSorted.reduce((s, p) => s + p.hsUsage, 0) / allPlayersSorted.length);
  const avgHP = Math.round(allPlayersSorted.reduce((s, p) => s + p.hpUsage, 0) / allPlayersSorted.length);
  const avgDeathRate = Math.round(allPlayersSorted.reduce((s, p) => s + p.earlyDeathPct, 0) / allPlayersSorted.length);
  const bestHS = allPlayersSorted.reduce((best, p) => p.hsUsage > best.hsUsage ? p : best);
  const worstHS = allPlayersSorted.reduce((worst, p) => p.hsUsage < worst.hsUsage ? p : worst);
  const worstDeath = allPlayersSorted.reduce((worst, p) => p.earlyDeathPct > worst.earlyDeathPct ? p : worst);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Log Analysis &mdash; ${DATE} &mdash; ${BOSS}</title>
<style>${INDEX_CSS}</style>
</head>
<body>

<h1>Log Analysis &mdash; ${DATE}</h1>
<p class="subtitle">${BOSS} Prog &mdash; ${totalPulls} pulls (${totalPulls - 1} wipes + kill) &mdash; <a href="https://www.warcraftlogs.com/reports/${REPORT}" target="_blank" style="color:#7cacf8;">WCL Report</a></p>

<div class="summary-grid">
  <div class="summary-card">
    <div class="summary-label">Pulls</div>
    <div class="summary-value">${totalPulls}</div>
    <div class="summary-sub">${killFight ? 'KILL on pull ' + (fightIDs.indexOf(killFight.id) + 1) : 'all wipes'}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">${killFight ? 'Kill Time' : 'Best Pull'}</div>
    <div class="summary-value">${killFight ? killDur : bestWipeDur}</div>
    <div class="summary-sub">${killFight ? 'boss dead' : 'pull #' + bestWipePull + ' (' + bestWipePct + ')'}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Boss</div>
    <div class="summary-value" style="font-size:18px;">M Rotmire</div>
    <div class="summary-sub">Encounter 3159</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Players</div>
    <div class="summary-value">${allPlayersSorted.length}</div>
    <div class="summary-sub">${dpsPlayers.length} DPS / ${healerPlayers.length} heal / ${tankPlayers.length} tank</div>
  </div>
</div>

<span class="boss-tag">MYTHIC ROTMIRE &mdash; ${killFight ? 'KILLED' : 'PROG'}</span>

<h2>Team Trends</h2>

<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px;">
  <div class="trend-box">
    <div class="trend-label">Healthstone Usage</div>
    <div class="trend-value" style="color:${avgHS >= 50 ? '#4caf50' : avgHS >= 30 ? '#ffa940' : '#ff6b6b'}">${avgHS}%</div>
    <div class="trend-detail">Team avg across ${totalPulls} pulls. ${worstHS.name} lowest at ${worstHS.hsUsage}%. ${bestHS.name} highest at ${bestHS.hsUsage}%.</div>
  </div>
  <div class="trend-box">
    <div class="trend-label">Health Potion Usage</div>
    <div class="trend-value" style="color:${avgHP >= 40 ? '#4caf50' : avgHP >= 20 ? '#ffa940' : '#ff6b6b'}">${avgHP}%</div>
    <div class="trend-detail">Separate CD from DPS pots. Should be higher on prog.</div>
  </div>
  <div class="trend-box">
    <div class="trend-label">Early Death Rate</div>
    <div class="trend-value" style="color:${avgDeathRate <= 10 ? '#4caf50' : avgDeathRate <= 20 ? '#ffa940' : '#ff6b6b'}">${avgDeathRate}%</div>
    <div class="trend-detail">${worstDeath.name} worst at ${worstDeath.earlyDeathPct}%.</div>
  </div>
  <div class="trend-box">
    <div class="trend-label">Prog Trajectory</div>
    <div class="trend-value" style="color:#4caf50;font-size:18px;">${killFight ? 'KILLED' : bestWipePct}</div>
    <div class="trend-detail">${killFight ? 'Kill on pull ' + (fightIDs.indexOf(killFight.id) + 1) + ' at ' + killDur : 'Best wipe pull #' + bestWipePull}</div>
  </div>
</div>`;

  // DPS section
  html += `
<h2>DPS</h2>
<p style="font-size:13px;color:#888;margin-bottom:16px;">Each player compared against top ranked players of their spec on this boss. Click for full audit.</p>`;

  let rank = 1;
  for (const p of dpsPlayers) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const topComp = getTopComparison(p.type, p.spec, p.role);
    const rotation = buildRotationComparison(p, topComp);
    const biggestGap = rotation.filter(r => r.verdict === 'bad').sort((a, b) => parseFloat(b.cpm) - parseFloat(a.cpm))[0];
    const classColor = WCL_COLORS[p.type] || '#fff';

    const stats = [];
    stats.push(`${(p.avgDPS/1000).toFixed(0)}K avg`);
    if (p.earlyDeathPct > 15) stats.push(`<span class="player-stat-bad">${p.earlyDeaths}/${p.pullCount} early deaths (${p.earlyDeathPct}%)</span>`);
    else if (p.earlyDeathPct > 5) stats.push(`<span class="player-stat-warn">${p.earlyDeaths} early deaths</span>`);
    if (biggestGap) stats.push(`<span class="player-stat-${biggestGap.verdict}">${biggestGap.name} ${biggestGap.gap}</span>`);
    else if (p.hsUsage < 30) stats.push(`<span class="player-stat-bad">${p.hsUsage}% healthstones</span>`);

    html += `
<a href="/raid/${SLUG}-${slug}" class="player-card">
  <div class="player-row">
    <span class="player-rank">${rank++}</span>
    <div class="player-info">
      <div class="player-name" style="color:${classColor};">${p.name}</div>
      <div class="player-spec">${p.spec} ${p.type}</div>
    </div>
    <div class="player-stats">${stats.join('<span style="color:#333;margin:0 4px;">|</span>')}</div>
    <span class="player-arrow">&rarr;</span>
  </div>
</a>`;
  }

  // Healers
  html += `
<h2>Healers</h2>`;
  rank = 1;
  for (const p of healerPlayers) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const classColor = WCL_COLORS[p.type] || '#fff';
    const topComp = getTopComparison(p.type, p.spec, p.role);
    const vsPct = topComp && topComp.ranking ? Math.round(p.avgHPS / topComp.ranking.amount * 100) : 0;

    const stats = [];
    stats.push(`${(p.avgHPS/1000).toFixed(0)}K avg HPS`);
    if (vsPct > 0) stats.push(`<span class="player-stat-${vsPct >= 80 ? 'ok' : vsPct >= 60 ? 'warn' : 'bad'}">${vsPct}% of #1</span>`);
    if (p.mpUsage === 0 && p.pullCount > 5) stats.push(`<span class="player-stat-bad">0 mana pots</span>`);

    html += `
<a href="/raid/${SLUG}-${slug}" class="player-card">
  <div class="player-row">
    <span class="player-rank">${rank++}</span>
    <div class="player-info">
      <div class="player-name" style="color:${classColor};">${p.name}</div>
      <div class="player-spec">${p.spec} ${p.type === 'Priest' ? 'Priest' : p.type}</div>
    </div>
    <div class="player-stats">${stats.join('<span style="color:#333;margin:0 4px;">|</span>')}</div>
    <span class="player-arrow">&rarr;</span>
  </div>
</a>`;
  }

  // Tanks
  html += `
<h2>Tanks</h2>`;
  rank = 1;
  for (const p of tankPlayers) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const classColor = WCL_COLORS[p.type] || '#fff';

    const stats = [];
    stats.push(`${(p.avgDPS/1000).toFixed(0)}K avg DPS`);
    if (p.earlyDeathPct > 10) stats.push(`<span class="player-stat-bad">${p.earlyDeaths} early deaths</span>`);

    html += `
<a href="/raid/${SLUG}-${slug}" class="player-card">
  <div class="player-row">
    <span class="player-rank">${rank++}</span>
    <div class="player-info">
      <div class="player-name" style="color:${classColor};">${p.name}</div>
      <div class="player-spec">${p.spec} ${p.type === 'DemonHunter' ? 'Demon Hunter' : p.type === 'DeathKnight' ? 'Death Knight' : p.type}</div>
    </div>
    <div class="player-stats">${stats.join('<span style="color:#333;margin:0 4px;">|</span>')}</div>
    <span class="player-arrow">&rarr;</span>
  </div>
</a>`;
  }

  html += `
<div class="footer">
  Generated from <a href="https://www.warcraftlogs.com/reports/${REPORT}" style="color:#555;">${REPORT}</a>
</div>

</body>
</html>`;

  return html;
}

// ── Main ──
console.log('Generating index page...');
writeFileSync(OUT + '/' + SLUG + '.html', generateIndexPage());

let count = 0;
for (const [pid, pStats] of Object.entries(allStats)) {
  const slug = pStats.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${SLUG}-${slug}.html`;
  writeFileSync(OUT + '/' + filename, generatePlayerPage(pStats));
  count++;
  console.log(`  ${pStats.name} (${pStats.spec} ${pStats.type}) -> ${filename}`);
}

console.log(`\nDone! Generated ${count + 1} HTML files.`);
console.log(`Index: /raid/${SLUG}`);
console.log(`Players: /raid/${SLUG}-{name}`);
