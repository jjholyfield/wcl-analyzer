import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const DIR = 'data/dps-audit';

const SPELL_NAMES = {
  116: 'Frostbolt', 468082: 'Frostfire Bolt', 30455: 'Ice Lance',
  44614: 'Flurry', 199786: 'Glacial Spike',
  12472: 'Icy Veins', 84714: 'Frozen Orb', 205021: 'Ray of Frost',
  153595: 'Comet Storm', 382440: 'Shifting Power', 55342: 'Mirror Image',
  190356: 'Blizzard', 120: 'Cone of Cold', 157997: 'Ice Nova',
  122: 'Frost Nova', 1953: 'Blink', 212653: 'Shimmer',
  45438: 'Ice Block', 80353: 'Time Warp', 2139: 'Counterspell',
  30449: 'Spellsteal', 108839: 'Ice Floes',
  44544: 'Fingers of Frost', 190446: 'Brain Freeze', 228358: "Winter's Chill",
  274738: 'Ancestral Call', 20572: 'Blood Fury',
};

const CORE_SPELLS = [116, 468082, 30455, 44614, 199786];
const CD_SPELLS = [12472, 84714, 205021, 153595, 382440, 55342];
const CD_TIMERS = { 12472: 120, 84714: 60, 205021: 60, 153595: 30, 382440: 60, 55342: 120 };

function load(file) {
  return JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
}

function analyzeFight(data) {
  const start = data.fight.startTime;
  const end = data.fight.endTime;
  const dur = (end - start) / 1000;
  const casts = data.events.casts.filter(e => e.type === 'cast');
  const buffs = data.events.buffs || [];

  const counts = {};
  const timestamps = {};
  for (const c of casts) {
    const id = c.abilityGameID;
    counts[id] = (counts[id] || 0) + 1;
    if (!timestamps[id]) timestamps[id] = [];
    timestamps[id].push((c.timestamp - start) / 1000);
  }

  // Icy Veins uptime
  const ivEvents = buffs.filter(e => e.abilityGameID === 12472);
  let ivUptime = 0, ivStart = null;
  for (const e of ivEvents) {
    if (e.type === 'applybuff' || e.type === 'refreshbuff') ivStart = e.timestamp;
    else if (e.type === 'removebuff' && ivStart) { ivUptime += e.timestamp - ivStart; ivStart = null; }
  }
  if (ivStart) ivUptime += end - ivStart;

  // Fingers of Frost procs
  const fofEvents = buffs.filter(e => e.abilityGameID === 44544);
  const fofGained = fofEvents.filter(e => e.type === 'applybuff' || e.type === 'applybuffstack').length;
  const fofConsumed = fofEvents.filter(e => e.type === 'removebuffstack' || e.type === 'removebuff').length;

  // Brain Freeze procs
  const bfEvents = buffs.filter(e => e.abilityGameID === 190446);
  const bfGained = bfEvents.filter(e => e.type === 'applybuff').length;
  const bfConsumed = bfEvents.filter(e => e.type === 'removebuff').length;

  // GCD analysis
  const sorted = [...casts].sort((a, b) => a.timestamp - b.timestamp);
  const gaps = [];
  const bigGaps = [];
  let totalDeadTime = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].timestamp - sorted[i - 1].timestamp) / 1000;
    if (gap > 0.3 && gap < 10) gaps.push(gap);
    if (gap > 3) totalDeadTime += gap - 1.5;
    if (gap > 4) {
      bigGaps.push({
        at: (sorted[i - 1].timestamp - start) / 1000,
        gap,
        before: sorted[i - 1].abilityGameID,
        after: sorted[i].abilityGameID,
      });
    }
  }
  const avgGcd = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const gapsOver2 = gaps.filter(g => g > 2).length;
  const gapsOver3 = gaps.filter(g => g > 3).length;
  const sub15Pct = gaps.length ? ((gaps.filter(g => g < 1.5).length / gaps.length) * 100) : 0;

  return {
    dur, totalCasts: casts.length, cpm: (casts.length / dur) * 60,
    counts, timestamps,
    ivUptime: { sec: (ivUptime / 1000), pct: (ivUptime / (end - start)) * 100 },
    fof: { gained: fofGained, consumed: fofConsumed },
    bf: { gained: bfGained, consumed: bfConsumed },
    gcd: { avgGcd, gapsOver2, gapsOver3, totalDeadTime, sub15Pct, bigGaps },
  };
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function cpmVal(count, dur) {
  return dur > 0 ? (count / (dur / 60)).toFixed(2) : '0.00';
}

function avgGap(timestamps) {
  if (!timestamps || timestamps.length < 2) return null;
  let total = 0;
  for (let i = 1; i < timestamps.length; i++) total += timestamps[i] - timestamps[i - 1];
  return (total / (timestamps.length - 1)).toFixed(1);
}

function cdEfficiency(timestamps, cdSeconds) {
  if (!timestamps || timestamps.length < 2) return { totalDelay: '0', delayedUses: 0 };
  let totalDelay = 0, count = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    const delay = gap - cdSeconds;
    if (delay > 2) { totalDelay += delay; count++; }
  }
  return { totalDelay: totalDelay.toFixed(1), delayedUses: count };
}

// ═══════════════════════════════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════════════════════════════

const baoAverData = load('baodabao-averzian-Ty6WFH92YBmGZ4Dj-f3.json');
const baoSalData  = load('baodabao-ZFB8LVN621dMXHQW-f37.json');
const baoVorData  = load('baodabao-vorasius-XzJtFAw6n7Hhg1DP-f5.json');
const baoChimData = load('baodabao-chimaerus-TtMaG8bXL4vBgDpc-f10.json');

const topAverData = load('pnz-averzian-bHBvRYmnALP76T9h-f9.json');
const topSalData  = load('lonelyseason-kK6nFf1QdM4Djcbg-f17.json');
const topVorData  = load('qingxingood-vorasius-83fnCXxrgjcbZT2p-f41.json');

const baoAver = analyzeFight(baoAverData);
const baoSal  = analyzeFight(baoSalData);
const baoVor  = analyzeFight(baoVorData);
const baoChim = analyzeFight(baoChimData);

const topAver = analyzeFight(topAverData);
const topSal  = analyzeFight(topSalData);
const topVor  = analyzeFight(topVorData);

const bosses = [
  {
    name: 'Averzian', difficulty: 'Mythic',
    bao: baoAver, baoData: baoAverData,
    top: topAver, topData: topAverData, topName: 'Pnz (#1)',
  },
  {
    name: 'Vorasius', difficulty: 'Mythic',
    bao: baoVor, baoData: baoVorData,
    top: topVor, topData: topVorData, topName: 'Qingxingood (#1)',
  },
  {
    name: 'Salhadaar', difficulty: 'Mythic',
    bao: baoSal, baoData: baoSalData,
    top: topSal, topData: topSalData, topName: 'Lonelyseason (#2)',
  },
  {
    name: 'Chimaerus', difficulty: 'Heroic',
    bao: baoChim, baoData: baoChimData,
    top: null, topData: null, topName: null,
  },
];

// ═══════════════════════════════════════════════════════════════
// HTML BUILD HELPERS
// ═══════════════════════════════════════════════════════════════

function buildSpellRow(spellId, bao, top, baoDur, topDur) {
  const name = SPELL_NAMES[spellId] || `Spell ${spellId}`;
  const baoCount = bao.counts[spellId] || 0;
  const baoCpm = cpmVal(baoCount, baoDur);
  const topCount = top ? (top.counts[spellId] || 0) : null;
  const topCpm = top ? cpmVal(topCount, topDur) : null;
  const diff = topCpm ? (parseFloat(baoCpm) - parseFloat(topCpm)).toFixed(2) : null;
  const diffColor = diff !== null ? (parseFloat(diff) >= 0 ? '#4caf50' : '#ff6b6b') : '#888';
  const diffStr = diff !== null ? (parseFloat(diff) >= 0 ? `+${diff}` : diff) : '—';

  return `<tr>
    <td style="color:#ddd">${name}</td>
    <td>${baoCount}</td>
    <td>${baoCpm}</td>
    ${top ? `<td>${topCount}</td><td>${topCpm}</td><td style="color:${diffColor};font-weight:600">${diffStr}</td>` : ''}
  </tr>`;
}

function buildCDTimeline(analysis) {
  let rows = '';
  for (const id of CD_SPELLS) {
    const ts = analysis.timestamps[id];
    if (!ts || !ts.length) continue;
    const name = SPELL_NAMES[id];
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
    const expected = Math.floor(analysis.dur / (cdSec || 120)) + 1;
    const effPct = expected > 0 ? Math.round((ts.length / expected) * 100) : 0;
    const effColor = effPct >= 90 ? '#4caf50' : effPct >= 70 ? '#ffa940' : '#ff6b6b';
    rows += `<tr>
      <td style="color:#ddd">${name}</td>
      <td>${ts.length}/${expected}</td>
      <td style="color:${effColor};font-weight:600">${effPct}%</td>
      <td>${gap ? gap + 's' : '—'}</td>
      <td style="font-size:12px">${times}${effStr}</td>
    </tr>`;
  }
  return rows;
}

function buildBossSection(boss) {
  const { bao, baoData, top, topData, topName } = boss;
  const hasTop = !!top;
  const baoIlvl = baoData.playerDetail?.minItemLevel || '?';
  const topIlvl = topData?.playerDetail?.minItemLevel || '?';
  const isKill = baoData.fight.kill;

  const resultBadge = isKill
    ? '<span style="background:#113311;color:#44cc44;font-size:12px;font-weight:600;padding:2px 8px;border-radius:3px">KILL</span>'
    : '<span style="background:#331111;color:#cc4444;font-size:12px;font-weight:600;padding:2px 8px;border-radius:3px">WIPE</span>';

  let compareCards = '';
  if (hasTop) {
    compareCards = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Baodabao</div>
        <div class="stat-value">${bao.cpm.toFixed(1)} <span style="font-size:14px;color:#888">CPM</span></div>
        <div class="stat-sub">iLvl ${baoIlvl} / ${formatTime(bao.dur)} ${isKill ? 'kill' : 'wipe'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${topName}</div>
        <div class="stat-value" style="color:#4caf50">${top.cpm.toFixed(1)} <span style="font-size:14px;color:#888">CPM</span></div>
        <div class="stat-sub">iLvl ${topIlvl} / ${formatTime(top.dur)} kill</div>
      </div>
    </div>`;
  } else {
    compareCards = `<div style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:16px;max-width:300px">
      <div class="stat-card">
        <div class="stat-label">Baodabao</div>
        <div class="stat-value">${bao.cpm.toFixed(1)} <span style="font-size:14px;color:#888">CPM</span></div>
        <div class="stat-sub">iLvl ${baoIlvl} / ${formatTime(bao.dur)} ${isKill ? 'kill' : 'wipe'}</div>
      </div>
    </div>`;
  }

  // Proc usage
  const fofWaste = bao.fof.gained > 0 ? Math.max(0, bao.fof.gained - bao.fof.consumed) : 0;
  const bfWaste = bao.bf.gained > 0 ? Math.max(0, bao.bf.gained - bao.bf.consumed) : 0;
  const fofColor = fofWaste > 3 ? '#ff6b6b' : fofWaste > 1 ? '#ffa940' : '#4caf50';
  const bfColor = bfWaste > 2 ? '#ff6b6b' : bfWaste > 0 ? '#ffa940' : '#4caf50';

  let topProcCompare = '';
  if (hasTop) {
    const topFofWaste = Math.max(0, top.fof.gained - top.fof.consumed);
    const topBfWaste = Math.max(0, top.bf.gained - top.bf.consumed);
    topProcCompare = `
      <tr>
        <td colspan="4" style="border-top:1px solid #222;padding-top:8px;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px">${topName}</td>
      </tr>
      <tr>
        <td style="color:#ddd">Fingers of Frost</td>
        <td>${top.fof.gained}</td>
        <td>${top.fof.consumed}</td>
        <td style="color:${topFofWaste > 3 ? '#ff6b6b' : '#4caf50'};font-weight:600">${topFofWaste}</td>
      </tr>
      <tr>
        <td style="color:#ddd">Brain Freeze</td>
        <td>${top.bf.gained}</td>
        <td>${top.bf.consumed}</td>
        <td style="color:${topBfWaste > 2 ? '#ff6b6b' : '#4caf50'};font-weight:600">${topBfWaste}</td>
      </tr>`;
  }

  return `
  <h2>${boss.difficulty} ${boss.name} ${resultBadge}</h2>

  ${compareCards}

  <h3>Core Rotation — Casts Per Minute</h3>
  <table class="audit-table">
    <thead><tr>
      <th>Ability</th>
      <th>Casts</th>
      <th>CPM</th>
      ${hasTop ? `<th>${topName} Casts</th><th>${topName} CPM</th><th>Diff</th>` : ''}
    </tr></thead>
    <tbody>
      ${CORE_SPELLS.map(id => buildSpellRow(id, bao, top, bao.dur, top?.dur)).join('\n')}
    </tbody>
  </table>

  <h3>Proc Usage</h3>
  <table class="audit-table">
    <thead><tr>
      <th>Proc</th>
      <th>Gained</th>
      <th>Consumed</th>
      <th>Wasted</th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="color:#ddd">Fingers of Frost</td>
        <td>${bao.fof.gained}</td>
        <td>${bao.fof.consumed}</td>
        <td style="color:${fofColor};font-weight:600">${fofWaste}</td>
      </tr>
      <tr>
        <td style="color:#ddd">Brain Freeze</td>
        <td>${bao.bf.gained}</td>
        <td>${bao.bf.consumed}</td>
        <td style="color:${bfColor};font-weight:600">${bfWaste}</td>
      </tr>
      ${topProcCompare}
    </tbody>
  </table>

  <h3>Icy Veins Uptime</h3>
  <div class="finding ${bao.ivUptime.pct > 25 ? 'finding-good' : bao.ivUptime.pct > 18 ? 'finding-warn' : 'finding-bad'}">
    <span class="finding-count">${bao.ivUptime.pct.toFixed(1)}%</span>
    <span class="finding-text">${bao.ivUptime.sec.toFixed(0)}s of Icy Veins uptime across a ${formatTime(bao.dur)} fight.${hasTop ? ` ${topName}: ${top.ivUptime.pct.toFixed(1)}% (${top.ivUptime.sec.toFixed(0)}s).` : ''}</span>
  </div>

  <h3>Cooldown Usage</h3>
  <table class="audit-table">
    <thead><tr>
      <th>Cooldown</th>
      <th>Uses/Expected</th>
      <th>Efficiency</th>
      <th>Avg Gap</th>
      <th>Cast Times</th>
    </tr></thead>
    <tbody>
      ${buildCDTimeline(bao)}
    </tbody>
  </table>

  <h3>GCD Efficiency</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:8px">
    <div class="stat-card">
      <div class="stat-label">Avg GCD</div>
      <div class="stat-value" style="font-size:20px">${bao.gcd.avgGcd.toFixed(2)}s</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sub-1.5s GCDs</div>
      <div class="stat-value" style="font-size:20px">${bao.gcd.sub15Pct.toFixed(1)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Gaps >3s</div>
      <div class="stat-value" style="font-size:20px;color:${bao.gcd.gapsOver3 > 5 ? '#ff6b6b' : bao.gcd.gapsOver3 > 2 ? '#ffa940' : '#4caf50'}">${bao.gcd.gapsOver3}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Dead Time</div>
      <div class="stat-value" style="font-size:20px;color:${bao.gcd.totalDeadTime > 30 ? '#ff6b6b' : bao.gcd.totalDeadTime > 15 ? '#ffa940' : '#4caf50'}">~${bao.gcd.totalDeadTime.toFixed(0)}s</div>
    </div>
  </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// CROSS-BOSS SECTION
// ═══════════════════════════════════════════════════════════════

function buildCrossBossSection() {
  const allBao = [
    { name: 'M Averzian', a: baoAver },
    { name: 'M Vorasius', a: baoVor },
    { name: 'M Salhadaar', a: baoSal },
    { name: 'H Chimaerus', a: baoChim },
  ];

  let cpmRows = '';
  for (const b of allBao) {
    const cpmPctColor = b.a.cpm > 45 ? '#4caf50' : b.a.cpm > 35 ? '#ffa940' : '#ff6b6b';
    cpmRows += `<tr>
      <td>${b.name}</td>
      <td style="color:${cpmPctColor};font-weight:600">${b.a.cpm.toFixed(1)}</td>
      <td>${b.a.totalCasts}</td>
      <td>${formatTime(b.a.dur)}</td>
      <td>~${b.a.gcd.totalDeadTime.toFixed(0)}s</td>
      <td>${b.a.ivUptime.pct.toFixed(1)}%</td>
    </tr>`;
  }

  let coreRows = '';
  for (const id of CORE_SPELLS) {
    const name = SPELL_NAMES[id];
    let cells = `<td style="color:#ddd">${name}</td>`;
    for (const b of allBao) {
      const count = b.a.counts[id] || 0;
      cells += `<td>${cpmVal(count, b.a.dur)}</td>`;
    }
    coreRows += `<tr>${cells}</tr>`;
  }

  const salCpm = baoSal.cpm;
  const otherAvgCpm = (baoAver.cpm + baoVor.cpm + baoChim.cpm) / 3;
  const salDropPct = ((1 - salCpm / otherAvgCpm) * 100).toFixed(0);

  return `
  <h2>Cross-Boss Patterns</h2>

  <h3>Overview — All Fights</h3>
  <table class="audit-table">
    <thead><tr><th>Boss</th><th>CPM</th><th>Casts</th><th>Duration</th><th>Dead Time</th><th>IV Uptime</th></tr></thead>
    <tbody>${cpmRows}</tbody>
  </table>

  <h3>Core Ability CPM — Cross-Boss</h3>
  <table class="audit-table">
    <thead><tr><th>Ability</th>${allBao.map(b => `<th>${b.name}</th>`).join('')}</tr></thead>
    <tbody>${coreRows}</tbody>
  </table>

  ${salCpm < otherAvgCpm * 0.8 ? `<div class="finding finding-bad" style="margin-top:16px">
    <span class="finding-text"><strong>Salhadaar CPM drops ${salDropPct}% vs. other bosses.</strong> CPM on Averzian, Vorasius, and Chimaerus is ${otherAvgCpm.toFixed(1)} avg — on Salhadaar it collapses to ${salCpm.toFixed(1)}. This is the clearest sign of mechanical uncertainty: on progression fights where positioning isn't learned yet, cast rate craters.</span>
  </div>` : ''}
  `;
}

// ═══════════════════════════════════════════════════════════════
// ACTION ITEMS
// ═══════════════════════════════════════════════════════════════

function buildActionItems() {
  const avgCpm = (baoAver.cpm + baoVor.cpm + baoSal.cpm + baoChim.cpm) / 4;
  const topAvgCpm = (topAver.cpm + topVor.cpm + topSal.cpm) / 3;
  const cpmPct = ((avgCpm / topAvgCpm) * 100).toFixed(0);
  const avgDeadTime = (baoAver.gcd.totalDeadTime + baoVor.gcd.totalDeadTime + baoSal.gcd.totalDeadTime + baoChim.gcd.totalDeadTime) / 4;

  return `
  <h2>Priority Action Items</h2>
  <div class="actions">
    <div class="action action-high">
      <div class="action-priority">HIGH</div>
      <div class="action-body">
        <strong>Always Be Casting — close the CPM gap.</strong> Baodabao averages ${avgCpm.toFixed(1)} CPM. Top Frost Mages on the same bosses average ${topAvgCpm.toFixed(1)} CPM. That's ${cpmPct}% of top player cast rate — roughly ${(topAvgCpm - avgCpm).toFixed(0)} casts per minute left on the table. On a 6-minute fight, that's ~${((topAvgCpm - avgCpm) * 6).toFixed(0)} additional casts. This is the single biggest DPS lever.
      </div>
    </div>
    <div class="action action-high">
      <div class="action-priority">HIGH</div>
      <div class="action-body">
        <strong>Eliminate dead time during movement.</strong> Averaging ~${avgDeadTime.toFixed(0)}s of dead time per fight (gaps >3s between casts). Bank instant-cast procs — Ice Lance with Fingers of Frost, Flurry with Brain Freeze — for movement windows. Shimmer <em>during</em> a cast, not as a replacement for one. Pre-position before mechanics.
      </div>
    </div>
    <div class="action action-high">
      <div class="action-priority">HIGH</div>
      <div class="action-body">
        <strong>Salhadaar: learn the fight's rhythm.</strong> CPM drops from ~${((baoAver.cpm + baoVor.cpm + baoChim.cpm) / 3).toFixed(0)} on other bosses to ${baoSal.cpm.toFixed(0)} on Salhadaar — a ${(((1 - baoSal.cpm / ((baoAver.cpm + baoVor.cpm + baoChim.cpm) / 3)) * 100)).toFixed(0)}% collapse. This isn't a rotation problem, it's mechanical uncertainty. Know the timings: orbs, beams, transitions. When you know what's coming, you can pre-position and keep casting.
      </div>
    </div>
    <div class="action action-med">
      <div class="action-priority">MEDIUM</div>
      <div class="action-body">
        <strong>Tighten opener — Frozen Orb earlier.</strong> First Frozen Orb consistently lands at 5-8 seconds. Top players drop it at 1-5 seconds. Those extra seconds matter because Orb stacks with Time Warp + Icy Veins for maximum burst. Get it rolling immediately.
      </div>
    </div>
    <div class="action action-med">
      <div class="action-priority">MEDIUM</div>
      <div class="action-body">
        <strong>Use CDs on cooldown — don't hold.</strong> Cooldown efficiency varies — some fights show good usage, others have delayed uses. Every second a CD sits off-cooldown is free DPS lost. Icy Veins and Frozen Orb should come off CD and go right back out.
      </div>
    </div>
    <div class="action action-low">
      <div class="action-priority">LOW</div>
      <div class="action-body">
        <strong>Proc management is decent — keep it up.</strong> Fingers of Frost and Brain Freeze consumption is reasonable across most fights. Focus on never letting procs expire — they're free instant casts you can bank for movement.
      </div>
    </div>
  </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

const avgCpm = (baoAver.cpm + baoVor.cpm + baoSal.cpm + baoChim.cpm) / 4;
const topAvgCpm = (topAver.cpm + topVor.cpm + topSal.cpm) / 3;
const cpmPct = ((avgCpm / topAvgCpm) * 100).toFixed(0);
const avgDeadTime = (baoAver.gcd.totalDeadTime + baoVor.gcd.totalDeadTime + baoSal.gcd.totalDeadTime + baoChim.gcd.totalDeadTime) / 4;

// ═══════════════════════════════════════════════════════════════
// HTML
// ═══════════════════════════════════════════════════════════════

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DPS Audit — Baodabao (Frost Mage)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 32px; max-width: 960px; margin: 0 auto; line-height: 1.5; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 18px; font-weight: 600; color: #3fc7eb; margin-top: 40px; margin-bottom: 12px; border-bottom: 1px solid #222; padding-bottom: 6px; }
  h3 { font-size: 15px; font-weight: 600; color: #999; margin-top: 24px; margin-bottom: 10px; }
  .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .overview-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px; text-align: center; }
  .overview-label { font-size: 12px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .overview-value { font-size: 28px; font-weight: 700; }
  .overview-sub { font-size: 12px; color: #666; margin-top: 4px; }
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

<h1>DPS Audit &mdash; <span style="color:#3fc7eb">Baodabao</span></h1>
<p class="subtitle">Frost Mage &mdash; Thunderlord US &mdash; Four Dads One Pizza &mdash; Liberation of Undermine</p>

<div class="summary-box">
  <p><strong>TL;DR:</strong> Baodabao averages <strong>${avgCpm.toFixed(1)} CPM</strong> across 4 fights. Top-ranked Frost Mages on the same bosses average <strong>${topAvgCpm.toFixed(1)} CPM</strong> &mdash; that's <strong>${cpmPct}%</strong> of top player cast rate. The gap widens dramatically on Salhadaar prog where CPM collapses to ${baoSal.cpm.toFixed(1)}. Dead time averages ~${avgDeadTime.toFixed(0)}s per fight (gaps &gt;3s). Cooldown usage and proc management are decent &mdash; the main lever is casting more and moving less.</p>
</div>

<div class="overview-grid">
  <div class="overview-card">
    <div class="overview-label">Avg CPM</div>
    <div class="overview-value" style="color:${avgCpm < 40 ? '#ff6b6b' : '#ffa940'}">${avgCpm.toFixed(1)}</div>
    <div class="overview-sub">Top avg: ${topAvgCpm.toFixed(1)}</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">CPM % of Top</div>
    <div class="overview-value" style="color:${parseInt(cpmPct) < 80 ? '#ff6b6b' : '#ffa940'}">${cpmPct}%</div>
    <div class="overview-sub">Target: &gt;90%</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">Avg Dead Time</div>
    <div class="overview-value" style="color:${avgDeadTime > 25 ? '#ff6b6b' : '#ffa940'}">~${avgDeadTime.toFixed(0)}s</div>
    <div class="overview-sub">Per fight</div>
  </div>
  <div class="overview-card">
    <div class="overview-label">Fights Analyzed</div>
    <div class="overview-value">4</div>
    <div class="overview-sub">3 mythic, 1 heroic</div>
  </div>
</div>

${bosses.map(b => buildBossSection(b)).join('\n')}

${buildCrossBossSection()}

${buildActionItems()}

<details>
  <summary>Methodology &amp; Data Sources</summary>
  <div class="details-inner">
    <strong>Data pulled from Warcraft Logs v2 API</strong><br><br>

    <strong>Baodabao fights analyzed:</strong><br>
    &bull; M Averzian &mdash; ${baoAver.totalCasts} casts over ${formatTime(baoAver.dur)} (iLvl ${baoAverData.playerDetail?.minItemLevel})<br>
    &bull; M Vorasius &mdash; ${baoVor.totalCasts} casts over ${formatTime(baoVor.dur)} (iLvl ${baoVorData.playerDetail?.minItemLevel}) &mdash; wipe<br>
    &bull; M Salhadaar &mdash; ${baoSal.totalCasts} casts over ${formatTime(baoSal.dur)} (iLvl ${baoSalData.playerDetail?.minItemLevel})<br>
    &bull; H Chimaerus &mdash; ${baoChim.totalCasts} casts over ${formatTime(baoChim.dur)} (iLvl ${baoChimData.playerDetail?.minItemLevel})<br><br>

    <strong>Top player comparisons:</strong><br>
    &bull; M Averzian #1: Pnz (iLvl ${topAverData.playerDetail?.minItemLevel}) &mdash; ${topAver.cpm.toFixed(1)} CPM, ${formatTime(topAver.dur)} kill<br>
    &bull; M Vorasius #1: Qingxingood (iLvl ${topVorData.playerDetail?.minItemLevel}) &mdash; ${topVor.cpm.toFixed(1)} CPM, ${formatTime(topVor.dur)} kill<br>
    &bull; M Salhadaar #2: Lonelyseason (iLvl ${topSalData.playerDetail?.minItemLevel}) &mdash; ${topSal.cpm.toFixed(1)} CPM, ${formatTime(topSal.dur)} kill<br><br>

    <strong>Metrics:</strong><br>
    &bull; <strong>CPM</strong> = Casts Per Minute &mdash; higher is better<br>
    &bull; <strong>CD Efficiency</strong> = actual uses / expected uses based on fight duration and CD timer<br>
    &bull; <strong>Dead Time</strong> = sum of gaps &gt;3s between casts, minus 1.5s GCD each<br>
    &bull; <strong>Proc waste</strong> = procs gained minus procs consumed (expired without being used)<br><br>

    <a href="https://www.warcraftlogs.com/character/us/thunderlord/baodabao" target="_blank">Baodabao on Warcraft Logs</a>
  </div>
</details>

<div class="footer">
  Generated by WCL Analyzer &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
</div>

</body>
</html>`;

writeFileSync('healing-cds/audit-baodabao.html', html);
console.log('Written: healing-cds/audit-baodabao.html');
console.log(`\nFight summary:`);
for (const b of bosses) {
  const topInfo = b.top ? ` | Top: ${b.topName} ${b.top.cpm.toFixed(1)} CPM` : '';
  console.log(`  ${b.difficulty} ${b.name}: ${b.bao.cpm.toFixed(1)} CPM, ${b.bao.totalCasts} casts, ${formatTime(b.bao.dur)}${topInfo}`);
}
console.log(`\nAvg CPM: ${avgCpm.toFixed(1)} (${cpmPct}% of top ${topAvgCpm.toFixed(1)})`);
console.log(`Avg dead time: ~${avgDeadTime.toFixed(0)}s`);
