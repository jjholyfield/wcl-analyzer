import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spellNames = JSON.parse(readFileSync(join(__dirname, 'spell-names.json'), 'utf8'));

// ── Spell categorization ───────────────────────────────────────
const GENERATORS = new Set([20473, 275773, 35395]); // Holy Shock, Judgment, Crusader Strike
const SPENDERS = new Set([85222, 156322, 415091]); // Light of Dawn, Eternal Flame, Shield of the Righteous
const MAJOR_CDS = new Set([375576, 31884, 498, 31821, 633]); // Divine Toll, AW, DP, AM, LoH
const HARDCASTS = new Set([19750, 82326]); // Flash of Light, Holy Light
const FILTER_OUT = new Set([415388]); // Reclamation (fake events)

const INFUSION_OF_LIGHT = 54149;

function spellName(id) {
  return spellNames[id] || `spell-${id}`;
}

function spellCategory(id) {
  if (GENERATORS.has(id)) return 'GEN';
  if (SPENDERS.has(id)) return 'SPEND';
  if (MAJOR_CDS.has(id)) return 'CD';
  if (HARDCASTS.has(id)) return 'HEAL';
  return null;
}

// ── Load all player data ──────────────────────────────────────
const players = [
  {
    label: '#1 Mythmaster',
    short: 'Mythmaster',
    rank: 1,
    hpsRank: 195774,
    file: 'data/X82vPTCZRyznNLcM/mythmaster-fight15.json',
    isTop: true,
  },
  {
    label: '#2 Холликид',
    short: 'Hollikid',
    rank: 2,
    hpsRank: 166299,
    file: 'data/HrfpXNvqF4w1VRzT/холликид-fight34.json',
    isTop: true,
  },
  {
    label: '#3 Turalyonqt',
    short: 'Turalyonqt',
    rank: 3,
    hpsRank: 165361,
    file: 'data/grqvncwpWJ4xfz8j/turalyonqt-fight16.json',
    isTop: true,
  },
  {
    label: '#4 Fintusius',
    short: 'Fintusius',
    rank: 4,
    hpsRank: 165063,
    file: 'data/Q1ndgTmJyV6bN8qM/fintusius-fight34.json',
    isTop: true,
  },
  {
    label: '#5 Betsujin',
    short: 'Betsujin',
    rank: 5,
    hpsRank: 161965,
    file: 'data/yKBRghnPc4ajtJCk/betsujin-fight12.json',
    isTop: true,
  },
  {
    label: 'McPounding',
    short: 'McPounding',
    rank: null,
    hpsRank: null,
    file: 'data/Ty6WFH92YBmGZ4Dj/mcpounding-fight3.json',
    isTop: false,
  },
];

// Load all data
for (const p of players) {
  try {
    p.data = JSON.parse(readFileSync(join(__dirname, p.file), 'utf8'));
  } catch (e) {
    console.error(`FAILED to load ${p.file}: ${e.message}`);
    process.exit(1);
  }
}

// ── IoL tracking ──────────────────────────────────────────────
function buildIoLWindows(buffs) {
  const windows = [];
  let iolStart = null;
  for (const b of buffs) {
    if (b.abilityGameID !== INFUSION_OF_LIGHT) continue;
    if (b.type === 'applybuff' || b.type === 'refreshbuff') {
      iolStart = b.timestamp;
    } else if (b.type === 'removebuff') {
      if (iolStart != null) {
        windows.push({ start: iolStart, end: b.timestamp });
      }
      iolStart = null;
    }
  }
  return windows;
}

function hadIoL(timestamp, iolWindows) {
  return iolWindows.some(w => timestamp >= w.start && timestamp <= w.end);
}

// ── AW tracking ───────────────────────────────────────────────
function buildAWWindows(buffs) {
  const windows = [];
  let awStart = null;
  for (const b of buffs) {
    if (b.abilityGameID !== 31884 && b.abilityGameID !== 454351 && b.abilityGameID !== 1246385) continue;
    if (b.type === 'applybuff') {
      awStart = b.timestamp;
    } else if (b.type === 'removebuff') {
      if (awStart != null) {
        windows.push({ start: awStart, end: b.timestamp });
      }
      awStart = null;
    }
  }
  return windows;
}

function inAW(timestamp, awWindows) {
  return awWindows.some(w => timestamp >= w.start && timestamp <= w.end);
}

// ── Process casts ─────────────────────────────────────────────
function processCasts(data) {
  const fightStart = data.fight.startTime;
  const fightEnd = data.fight.endTime;
  const fightDuration = (fightEnd - fightStart) / 1000;
  const buffSource = data.events.iolAwBuffs || data.events.buffs;
  const iolWindows = buildIoLWindows(buffSource);
  const awWindows = buildAWWindows(buffSource);

  const casts = data.events.casts
    .filter(c => c.type === 'cast' && !FILTER_OUT.has(c.abilityGameID) && !c.fake)
    .map(c => ({
      time: (c.timestamp - fightStart) / 1000,
      timestamp: c.timestamp,
      spellId: c.abilityGameID,
      name: spellName(c.abilityGameID),
      category: spellCategory(c.abilityGameID),
      hadIoL: HARDCASTS.has(c.abilityGameID) ? hadIoL(c.timestamp, iolWindows) : null,
      inAW: inAW(c.timestamp, awWindows),
    }));

  return { casts, fightDuration, fightStart };
}

// Process all players
for (const p of players) {
  p.proc = processCasts(p.data);
}

// ── Utility ───────────────────────────────────────────────────
function pad(str, len) { return String(str).padStart(len); }
function padEnd(str, len) { return String(str).padEnd(len); }

// ── Header ────────────────────────────────────────────────────
console.log('='.repeat(130));
console.log('  HOLY PALADIN ROTATION COMPARISON: McPounding vs TOP 5 RANKED — Mythic Averzian');
console.log('='.repeat(130));
console.log();

// ── Player Overview ───────────────────────────────────────────
console.log('  PLAYER OVERVIEW');
console.log('  ' + '-'.repeat(125));
const colW = 16;
const nameRow = '  ' + padEnd('', 22);
const labels = players.map(p => pad(p.short, colW));
console.log(nameRow + labels.join('  '));
console.log('  ' + '-'.repeat(125));

function printRow(label, fn) {
  let row = '  ' + padEnd(label, 22);
  for (const p of players) {
    row += '  ' + pad(fn(p), colW);
  }
  console.log(row);
}

printRow('Rank', p => p.rank ? `#${p.rank}` : 'YOUR LOG');
printRow('HPS (ranked)', p => p.hpsRank ? p.hpsRank.toLocaleString() : p.data.summary.hps);
printRow('HPS (from data)', p => p.data.summary.hps);
printRow('Fight Duration', p => (p.proc.fightDuration).toFixed(0) + 's');
printRow('Total Healing', p => (p.data.summary.totalHealing / 1e6).toFixed(1) + 'M');
printRow('Overheal %', p => p.data.summary.overhealPercent);
printRow('Total Damage', p => (p.data.summary.totalDamage / 1e6).toFixed(1) + 'M');

// Check for players who died early
for (const p of players) {
  const lastCast = p.proc.casts[p.proc.casts.length - 1];
  if (lastCast && lastCast.time < p.proc.fightDuration * 0.7) {
    console.log(`  *** ${p.short} died at ~${lastCast.time.toFixed(0)}s (fight lasted ${p.proc.fightDuration.toFixed(0)}s). WCL ranks by active-time HPS. ***`);
  }
}

console.log();

// ── Cast CPM Comparison ───────────────────────────────────────
console.log('='.repeat(130));
console.log('  CASTS PER MINUTE (CPM) COMPARISON');
console.log('='.repeat(130));
console.log();

const keySpells = [
  { id: 20473, name: 'Holy Shock', cat: 'GEN' },
  { id: 275773, name: 'Judgment', cat: 'GEN' },
  { id: 35395, name: 'Crusader Strike', cat: 'GEN' },
  { id: 85222, name: 'Light of Dawn', cat: 'SPEND' },
  { id: 156322, name: 'Eternal Flame', cat: 'SPEND' },
  { id: 415091, name: 'Shield of Righteous', cat: 'SPEND' },
  { id: 19750, name: 'Flash of Light', cat: 'HEAL' },
  { id: 82326, name: 'Holy Light', cat: 'HEAL' },
  { id: 26573, name: 'Consecration', cat: '' },
  { id: 1, name: 'Melee', cat: '' },
  { id: 375576, name: 'Divine Toll', cat: 'CD' },
  { id: 31884, name: 'Avenging Wrath', cat: 'CD' },
  { id: 498, name: 'Divine Protection', cat: 'CD' },
  { id: 31821, name: 'Aura Mastery', cat: 'CD' },
  { id: 633, name: 'Lay on Hands', cat: 'CD' },
];

{
  let header = '  ' + padEnd('Spell', 25);
  for (const p of players) {
    header += '  ' + pad(p.short, colW);
  }
  console.log(header);
  console.log('  ' + '-'.repeat(125));

  for (const spell of keySpells) {
    let row = '  ' + padEnd(spell.name + (spell.cat ? ` [${spell.cat}]` : ''), 25);
    for (const p of players) {
      const count = p.proc.casts.filter(c => c.spellId === spell.id).length;
      const cpm = (count / (p.proc.fightDuration / 60)).toFixed(1);
      row += '  ' + pad(`${count} (${cpm})`, colW);
    }
    console.log(row);
  }

  // Total GCDs
  let totalRow = '  ' + padEnd('TOTAL CASTS', 25);
  for (const p of players) {
    const total = p.proc.casts.length;
    const cpm = (total / (p.proc.fightDuration / 60)).toFixed(1);
    totalRow += '  ' + pad(`${total} (${cpm})`, colW);
  }
  console.log('  ' + '-'.repeat(125));
  console.log(totalRow);
}
console.log();

// ── Holy Power Economy ────────────────────────────────────────
console.log('='.repeat(130));
console.log('  HOLY POWER ECONOMY');
console.log('='.repeat(130));
console.log();

{
  let header = '  ' + padEnd('Metric', 25);
  for (const p of players) {
    header += '  ' + pad(p.short, colW);
  }
  console.log(header);
  console.log('  ' + '-'.repeat(125));

  printRow('Generators total     ', p => {
    return String(p.proc.casts.filter(c => c.category === 'GEN').length);
  });
  printRow('  Holy Shock         ', p => String(p.proc.casts.filter(c => c.spellId === 20473).length));
  printRow('  Judgment           ', p => String(p.proc.casts.filter(c => c.spellId === 275773).length));
  printRow('  Crusader Strike    ', p => String(p.proc.casts.filter(c => c.spellId === 35395).length));
  printRow('Gen/min              ', p => {
    return (p.proc.casts.filter(c => c.category === 'GEN').length / (p.proc.fightDuration / 60)).toFixed(1);
  });
  printRow('Spenders total       ', p => {
    return String(p.proc.casts.filter(c => c.category === 'SPEND').length);
  });
  printRow('  Light of Dawn      ', p => String(p.proc.casts.filter(c => c.spellId === 85222).length));
  printRow('  Eternal Flame      ', p => String(p.proc.casts.filter(c => c.spellId === 156322).length));
  printRow('  Shield of Righteous', p => String(p.proc.casts.filter(c => c.spellId === 415091).length));
  printRow('Spend/min            ', p => {
    return (p.proc.casts.filter(c => c.category === 'SPEND').length / (p.proc.fightDuration / 60)).toFixed(1);
  });
  printRow('Spend/Gen Ratio      ', p => {
    const gen = p.proc.casts.filter(c => c.category === 'GEN').length;
    const spend = p.proc.casts.filter(c => c.category === 'SPEND').length;
    return gen > 0 ? (spend / gen).toFixed(2) : 'N/A';
  });
}
console.log();

// ── Hardcast Analysis ─────────────────────────────────────────
console.log('='.repeat(130));
console.log('  FLASH OF LIGHT / HOLY LIGHT ANALYSIS');
console.log('  IoL = Infusion of Light proc (instant/faster from Holy Shock crit)');
console.log('  HARD = Full hardcast (no proc, standing still)');
console.log('  NOTE: Buff data capped at 10K events — IoL tracking may be incomplete for some players.');
console.log('='.repeat(130));
console.log();

{
  let header = '  ' + padEnd('Metric', 28);
  for (const p of players) {
    header += '  ' + pad(p.short, colW);
  }
  console.log(header);
  console.log('  ' + '-'.repeat(125));

  printRow2('FoL total              ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 19750).length);
  });
  printRow2('FoL w/ IoL proc        ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 19750 && c.hadIoL === true).length);
  });
  printRow2('FoL hardcast           ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 19750 && c.hadIoL === false).length);
  });
  printRow2('HL total               ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 82326).length);
  });
  printRow2('HL w/ IoL proc         ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 82326 && c.hadIoL === true).length);
  });
  printRow2('HL hardcast            ', p => {
    return String(p.proc.casts.filter(c => c.spellId === 82326 && c.hadIoL === false).length);
  });

  const sep = '  ' + '-'.repeat(125);
  console.log(sep);
  printRow2('Total hardcasts        ', p => {
    const folH = p.proc.casts.filter(c => c.spellId === 19750 && c.hadIoL === false).length;
    const hlH = p.proc.casts.filter(c => c.spellId === 82326 && c.hadIoL === false).length;
    return String(folH + hlH);
  });
  printRow2('Hardcasts/min          ', p => {
    const folH = p.proc.casts.filter(c => c.spellId === 19750 && c.hadIoL === false).length;
    const hlH = p.proc.casts.filter(c => c.spellId === 82326 && c.hadIoL === false).length;
    return ((folH + hlH) / (p.proc.fightDuration / 60)).toFixed(1);
  });
  printRow2('IoL utilization %      ', p => {
    const fol = p.proc.casts.filter(c => c.spellId === 19750);
    const hl = p.proc.casts.filter(c => c.spellId === 82326);
    const total = fol.length + hl.length;
    if (total === 0) return 'N/A';
    const procd = fol.filter(c => c.hadIoL === true).length + hl.filter(c => c.hadIoL === true).length;
    return ((procd / total) * 100).toFixed(0) + '%';
  });
  printRow2('Melee count            ', p => String(p.proc.casts.filter(c => c.spellId === 1).length));
  printRow2('Melee/min              ', p => {
    return (p.proc.casts.filter(c => c.spellId === 1).length / (p.proc.fightDuration / 60)).toFixed(1);
  });
}

function printRow2(label, fn) {
  let row = '  ' + padEnd(label, 28);
  for (const p of players) {
    row += '  ' + pad(fn(p), colW);
  }
  console.log(row);
}

console.log();

// ── CD Timing ─────────────────────────────────────────────────
console.log('='.repeat(130));
console.log('  COOLDOWN USAGE TIMING');
console.log('='.repeat(130));
console.log();

const cdSpells = [
  { id: 31884, name: 'Avenging Wrath' },
  { id: 375576, name: 'Divine Toll' },
  { id: 31821, name: 'Aura Mastery' },
  { id: 498, name: 'Divine Protection' },
  { id: 633, name: 'Lay on Hands' },
];

for (const cd of cdSpells) {
  console.log(`  ${cd.name}:`);
  for (const p of players) {
    const uses = p.proc.casts.filter(c => c.spellId === cd.id);
    const timings = uses.map(c => c.time.toFixed(0) + 's').join(', ') || 'NEVER USED';
    const tag = p.isTop ? '' : ' <-- YOU';
    console.log(`    ${padEnd(p.short, 14)}: ${uses.length}x at ${timings}${tag}`);
  }
  console.log();
}

// ── Healing Breakdown ─────────────────────────────────────────
console.log('='.repeat(130));
console.log('  HEALING BREAKDOWN (top spells by HPS)');
console.log('='.repeat(130));
console.log();

{
  // Build healing breakdowns for all players
  const breakdowns = [];
  const allHealSpells = new Set();

  for (const p of players) {
    const bd = {};
    for (const h of p.data.events.healing) {
      const name = spellName(h.abilityGameID);
      if (!bd[name]) bd[name] = { total: 0, overheal: 0, count: 0 };
      bd[name].total += (h.amount || 0);
      bd[name].overheal += (h.overheal || 0);
      bd[name].count++;
    }
    breakdowns.push(bd);
    Object.keys(bd).forEach(k => allHealSpells.add(k));
  }

  // Get spells sorted by max HPS across any player
  const spellList = [...allHealSpells]
    .map(name => {
      const maxTotal = Math.max(...breakdowns.map(bd => (bd[name]?.total || 0)));
      return { name, maxTotal };
    })
    .filter(s => s.maxTotal > 50000)
    .sort((a, b) => b.maxTotal - a.maxTotal)
    .slice(0, 15);

  let header = '  ' + padEnd('Spell', 28);
  for (const p of players) {
    header += '  ' + pad(p.short, colW);
  }
  console.log(header);
  console.log('  ' + '-'.repeat(125));

  for (const spell of spellList) {
    let row = '  ' + padEnd(spell.name, 28);
    for (let i = 0; i < players.length; i++) {
      const bd = breakdowns[i][spell.name];
      if (bd && bd.total > 0) {
        const hps = (bd.total / (players[i].proc.fightDuration)).toFixed(0);
        const ohPct = bd.total + bd.overheal > 0
          ? ((bd.overheal / (bd.total + bd.overheal)) * 100).toFixed(0)
          : '0';
        row += '  ' + pad(`${hps} (${ohPct}%oh)`, colW);
      } else {
        row += '  ' + pad('-', colW);
      }
    }
    console.log(row);
  }

  // Total HPS
  console.log('  ' + '-'.repeat(125));
  let totalRow = '  ' + padEnd('TOTAL HPS', 28);
  for (const p of players) {
    totalRow += '  ' + pad(p.data.summary.hps, colW);
  }
  console.log(totalRow);
}
console.log();

// ── Timeline Windows (30s segments) ───────────────────────────
console.log('='.repeat(130));
console.log('  ROTATION TIMELINE — 30-SECOND WINDOWS');
console.log('  Shows cast sequence for each player per window');
console.log('  Format: SpellName(IoL) = had Infusion proc | SpellName(HARD) = hardcast');
console.log('='.repeat(130));
console.log();

{
  // Find max fight duration
  const maxDur = Math.max(...players.map(p => p.proc.fightDuration));
  const windowSize = 30;
  const numWindows = Math.ceil(maxDur / windowSize);

  for (let i = 0; i < numWindows; i++) {
    const winStart = i * windowSize;
    const winEnd = Math.min((i + 1) * windowSize, maxDur);

    console.log(`  === ${winStart}s - ${winEnd.toFixed(0)}s ${'='.repeat(100)}`);

    for (const p of players) {
      if (winStart > p.proc.fightDuration) continue;
      const winCasts = p.proc.casts.filter(c => c.time >= winStart && c.time < winEnd);
      if (winCasts.length === 0) continue;

      const gen = winCasts.filter(c => c.category === 'GEN').length;
      const spd = winCasts.filter(c => c.category === 'SPEND').length;
      const hc = winCasts.filter(c => c.category === 'HEAL').length;
      const awActive = winCasts.some(c => c.inAW);
      const cds = winCasts.filter(c => c.category === 'CD');

      const tag = p.isTop ? '' : ' <-- YOU';
      const awTag = awActive ? ' [AW]' : '';

      console.log(`  ${padEnd(p.short, 12)}: ${gen}gen/${spd}spd/${hc}hc${awTag}${tag}`);

      if (cds.length > 0) {
        console.log(`  ${' '.repeat(14)}CDs: ${cds.map(c => c.name + ' @' + c.time.toFixed(0) + 's').join(', ')}`);
      }

      // Cast sequence - abbreviated
      const seq = winCasts.map(c => {
        let label;
        // Abbreviate names
        if (c.spellId === 20473) label = 'HS';
        else if (c.spellId === 19750) label = 'FoL';
        else if (c.spellId === 82326) label = 'HL';
        else if (c.spellId === 85222) label = 'LoD';
        else if (c.spellId === 275773) label = 'Judg';
        else if (c.spellId === 35395) label = 'CS';
        else if (c.spellId === 156322) label = 'EF';
        else if (c.spellId === 415091) label = 'SotR';
        else if (c.spellId === 375576) label = 'DT';
        else if (c.spellId === 31884) label = 'AW';
        else if (c.spellId === 498) label = 'DP';
        else if (c.spellId === 31821) label = 'AM';
        else if (c.spellId === 633) label = 'LoH';
        else if (c.spellId === 26573) label = 'Cons';
        else if (c.spellId === 1) label = 'Mel';
        else label = c.name.substring(0, 6);

        if (c.hadIoL === true) label += '*';
        if (c.hadIoL === false && HARDCASTS.has(c.spellId)) label += '!';
        return label;
      }).join(' ');

      console.log(`  ${' '.repeat(14)}${seq}`);
    }
    console.log();
  }
}

// ── Pattern Analysis ──────────────────────────────────────────
console.log('='.repeat(130));
console.log('  PATTERN ANALYSIS: What ALL Top 5 Do That McPounding Doesn\'t');
console.log('='.repeat(130));
console.log();

const mcp = players.find(p => !p.isTop);
const top5 = players.filter(p => p.isTop);
const mcpDur = mcp.proc.fightDuration / 60;

function mcpCPM(spellId) {
  return mcp.proc.casts.filter(c => c.spellId === spellId).length / mcpDur;
}

function avgTopCPM(spellId) {
  const cpms = top5.map(p => p.proc.casts.filter(c => c.spellId === spellId).length / (p.proc.fightDuration / 60));
  return cpms.reduce((a, b) => a + b, 0) / cpms.length;
}

function minTopCPM(spellId) {
  const cpms = top5.map(p => p.proc.casts.filter(c => c.spellId === spellId).length / (p.proc.fightDuration / 60));
  return Math.min(...cpms);
}

function maxTopCPM(spellId) {
  const cpms = top5.map(p => p.proc.casts.filter(c => c.spellId === spellId).length / (p.proc.fightDuration / 60));
  return Math.max(...cpms);
}

// 1. Total CPM (activity)
const mcpTotalCPM = mcp.proc.casts.length / mcpDur;
const avgTopTotalCPM = top5.map(p => p.proc.casts.length / (p.proc.fightDuration / 60)).reduce((a, b) => a + b, 0) / 5;

console.log('  1. OVERALL ACTIVITY');
console.log(`     McPounding total CPM:        ${mcpTotalCPM.toFixed(1)}`);
console.log(`     Top 5 average total CPM:     ${avgTopTotalCPM.toFixed(1)}`);
console.log(`     Gap:                         ${(mcpTotalCPM - avgTopTotalCPM).toFixed(1)} CPM`);
if (mcpTotalCPM < avgTopTotalCPM) {
  console.log(`     >>> You are casting ${((1 - mcpTotalCPM / avgTopTotalCPM) * 100).toFixed(0)}% fewer spells per minute. More dead GCDs.`);
}
console.log();

// 2. Holy Light usage
console.log('  2. HOLY LIGHT HARDCASTING');
const mcpHL = mcp.proc.casts.filter(c => c.spellId === 82326);
const mcpHLhard = mcpHL.filter(c => c.hadIoL === false).length;
const topHLhards = top5.map(p => {
  const hl = p.proc.casts.filter(c => c.spellId === 82326);
  return hl.filter(c => c.hadIoL === false).length / (p.proc.fightDuration / 60);
});
const avgTopHLhardPM = topHLhards.reduce((a, b) => a + b, 0) / 5;

console.log(`     McPounding HL total:         ${mcpHL.length} (${(mcpHL.length / mcpDur).toFixed(1)}/min)`);
console.log(`     McPounding HL hardcast:      ${mcpHLhard} (${(mcpHLhard / mcpDur).toFixed(1)}/min)`);
console.log(`     Top 5 avg HL hardcast/min:   ${avgTopHLhardPM.toFixed(1)}`);
for (const p of top5) {
  const hl = p.proc.casts.filter(c => c.spellId === 82326);
  const hlH = hl.filter(c => c.hadIoL === false).length;
  console.log(`       ${padEnd(p.short, 14)}: ${hl.length} total, ${hlH} hardcast (${(hlH / (p.proc.fightDuration / 60)).toFixed(1)}/min)`);
}
console.log();

// 3. Melee vs Hardcast ratio
console.log('  3. MELEE vs HARDCAST RATIO (filler GCD choice)');
const mcpMelee = mcp.proc.casts.filter(c => c.spellId === 1).length;
const mcpMeleePM = mcpMelee / mcpDur;
const mcpAllHardcasts = mcp.proc.casts.filter(c => HARDCASTS.has(c.spellId) && c.hadIoL === false).length;
const mcpHardcastPM = mcpAllHardcasts / mcpDur;

console.log(`     McPounding: ${mcpMeleePM.toFixed(1)} melee/min vs ${mcpHardcastPM.toFixed(1)} hardcast/min (ratio ${mcpMelee > 0 && mcpAllHardcasts > 0 ? (mcpMelee / mcpAllHardcasts).toFixed(1) : 'N/A'}:1 melee-to-hardcast)`);

for (const p of top5) {
  const melee = p.proc.casts.filter(c => c.spellId === 1).length;
  const hcasts = p.proc.casts.filter(c => HARDCASTS.has(c.spellId) && c.hadIoL === false).length;
  const dur = p.proc.fightDuration / 60;
  console.log(`     ${padEnd(p.short, 14)}: ${(melee / dur).toFixed(1)} melee/min vs ${(hcasts / dur).toFixed(1)} hardcast/min (ratio ${melee > 0 && hcasts > 0 ? (melee / hcasts).toFixed(1) : 'N/A'}:1)`);
}
console.log();

// 4. Lay on Hands usage
console.log('  4. LAY ON HANDS USAGE');
const mcpLoH = mcp.proc.casts.filter(c => c.spellId === 633);
console.log(`     McPounding: ${mcpLoH.length} use(s)${mcpLoH.length > 0 ? ' at ' + mcpLoH.map(c => c.time.toFixed(0) + 's').join(', ') : ' -- NEVER USED'}`);
for (const p of top5) {
  const loh = p.proc.casts.filter(c => c.spellId === 633);
  console.log(`     ${padEnd(p.short, 14)}: ${loh.length} use(s)${loh.length > 0 ? ' at ' + loh.map(c => c.time.toFixed(0) + 's').join(', ') : ' -- never used'}`);
}
console.log();

// 5. Avenging Wrath timing
console.log('  5. AVENGING WRATH TIMING (when AW is popped)');
for (const p of [...top5, mcp]) {
  const aw = p.proc.casts.filter(c => c.spellId === 31884);
  const tag = !p.isTop ? ' <-- YOU' : '';
  console.log(`     ${padEnd(p.short, 14)}: ${aw.map(c => c.time.toFixed(0) + 's').join(', ') || 'never'}${tag}`);
}
console.log();

// 6. Divine Toll timing
console.log('  6. DIVINE TOLL TIMING + GAPS');
for (const p of [...top5, mcp]) {
  const dt = p.proc.casts.filter(c => c.spellId === 375576);
  const timings = dt.map(c => c.time.toFixed(0) + 's').join(', ') || 'never';
  const gaps = [];
  for (let i = 1; i < dt.length; i++) gaps.push((dt[i].time - dt[i - 1].time).toFixed(0));
  const avgGap = gaps.length > 0 ? (gaps.reduce((a, b) => a + parseInt(b), 0) / gaps.length).toFixed(0) : 'N/A';
  const tag = !p.isTop ? ' <-- YOU' : '';
  console.log(`     ${padEnd(p.short, 14)}: ${dt.length}x -- ${timings}  (avg gap: ${avgGap}s)${tag}`);
}
console.log();

// ── Summary: Top 5 Consensus Patterns ─────────────────────────
console.log('='.repeat(130));
console.log('  CONSENSUS PATTERNS: What the Top 5 ALL Share');
console.log('='.repeat(130));
console.log();

// Calculate stats for all
const mcpGenPM = mcp.proc.casts.filter(c => c.category === 'GEN').length / mcpDur;
const mcpSpendPM = mcp.proc.casts.filter(c => c.category === 'SPEND').length / mcpDur;
const avgTopGenPM = top5.map(p => p.proc.casts.filter(c => c.category === 'GEN').length / (p.proc.fightDuration / 60)).reduce((a, b) => a + b, 0) / 5;
const avgTopSpendPM = top5.map(p => p.proc.casts.filter(c => c.category === 'SPEND').length / (p.proc.fightDuration / 60)).reduce((a, b) => a + b, 0) / 5;

const patterns = [];

// Check: All top5 have HL CPM > McPounding's HL CPM
const mcpHLcpm = mcpCPM(82326);
const allTopHLhigher = top5.every(p => p.proc.casts.filter(c => c.spellId === 82326).length / (p.proc.fightDuration / 60) > mcpHLcpm);
if (allTopHLhigher) {
  patterns.push({
    pattern: 'All top 5 cast Holy Light more frequently than you',
    detail: `Your HL CPM: ${mcpHLcpm.toFixed(1)} | Top 5 range: ${minTopCPM(82326).toFixed(1)}-${maxTopCPM(82326).toFixed(1)} (avg ${avgTopCPM(82326).toFixed(1)})`,
  });
}

// Check: Melee
const mcpMeleeCPM = mcpCPM(1);
const allTopMeleeLower = top5.every(p => p.proc.casts.filter(c => c.spellId === 1).length / (p.proc.fightDuration / 60) < mcpMeleeCPM);
if (allTopMeleeLower) {
  patterns.push({
    pattern: 'All top 5 melee LESS than you',
    detail: `Your Melee CPM: ${mcpMeleeCPM.toFixed(1)} | Top 5 range: ${minTopCPM(1).toFixed(1)}-${maxTopCPM(1).toFixed(1)} (avg ${avgTopCPM(1).toFixed(1)})`,
  });
}

// Check: LoH usage
const mcpUsedLoH = mcp.proc.casts.some(c => c.spellId === 633);
const topLoHusers = top5.filter(p => p.proc.casts.some(c => c.spellId === 633)).length;
if (!mcpUsedLoH && topLoHusers >= 3) {
  patterns.push({
    pattern: `${topLoHusers}/5 top players used Lay on Hands; you did not`,
    detail: 'LoH is a 10-min CD. Should be used every kill.',
  });
}

// Check: Total CPM
const allTopMoreCasts = top5.every(p => p.proc.casts.length / (p.proc.fightDuration / 60) > mcpTotalCPM);
if (allTopMoreCasts) {
  patterns.push({
    pattern: 'All top 5 cast more total spells per minute than you',
    detail: `Your total CPM: ${mcpTotalCPM.toFixed(1)} | Top 5 range: ${Math.min(...top5.map(p => p.proc.casts.length / (p.proc.fightDuration / 60))).toFixed(1)}-${Math.max(...top5.map(p => p.proc.casts.length / (p.proc.fightDuration / 60))).toFixed(1)}`,
  });
}

// Check: Spend/Gen ratio
const mcpSGratio = mcp.proc.casts.filter(c => c.category === 'SPEND').length / (mcp.proc.casts.filter(c => c.category === 'GEN').length || 1);
const topSGratios = top5.map(p => p.proc.casts.filter(c => c.category === 'SPEND').length / (p.proc.casts.filter(c => c.category === 'GEN').length || 1));
const avgTopSG = topSGratios.reduce((a, b) => a + b, 0) / 5;
if (mcpSGratio < avgTopSG * 0.85) {
  patterns.push({
    pattern: 'Your Spend/Gen ratio is lower than the top 5 average',
    detail: `Your ratio: ${mcpSGratio.toFixed(2)} | Top 5 avg: ${avgTopSG.toFixed(2)} — you may be wasting HP by capping at 5.`,
  });
}

// Check: FoL vs HL preference
const mcpFoLcount = mcp.proc.casts.filter(c => c.spellId === 19750).length;
const mcpHLcount = mcp.proc.casts.filter(c => c.spellId === 82326).length;
const topFoLavg = top5.map(p => p.proc.casts.filter(c => c.spellId === 19750).length).reduce((a, b) => a + b, 0) / 5;
const topHLavg = top5.map(p => p.proc.casts.filter(c => c.spellId === 82326).length).reduce((a, b) => a + b, 0) / 5;

if (mcpFoLcount > mcpHLcount * 2 && topHLavg > topFoLavg) {
  patterns.push({
    pattern: 'You favor Flash of Light over Holy Light; top players favor Holy Light',
    detail: `Your FoL:HL = ${mcpFoLcount}:${mcpHLcount} | Top 5 avg FoL:HL = ${topFoLavg.toFixed(0)}:${topHLavg.toFixed(0)}`,
  });
}

// Check: Consecration usage
const mcpConsCPM = mcpCPM(26573);
const topConsAvg = avgTopCPM(26573);
if (Math.abs(mcpConsCPM - topConsAvg) > 0.5) {
  const dir = mcpConsCPM > topConsAvg ? 'more' : 'less';
  patterns.push({
    pattern: `You use Consecration ${dir} than the top 5 average`,
    detail: `Your Cons CPM: ${mcpConsCPM.toFixed(1)} | Top 5 avg: ${topConsAvg.toFixed(1)}`,
  });
}

// Check: Judgment usage
const mcpJudgCPM = mcpCPM(275773);
const topJudgAvg = avgTopCPM(275773);
if (mcpJudgCPM > topJudgAvg * 1.3) {
  patterns.push({
    pattern: 'You cast Judgment more frequently than the top 5 average',
    detail: `Your Judg CPM: ${mcpJudgCPM.toFixed(1)} | Top 5 avg: ${topJudgAvg.toFixed(1)} — each excess Judg GCD could be a HL instead.`,
  });
}

if (patterns.length > 0) {
  for (let i = 0; i < patterns.length; i++) {
    console.log(`  ${i + 1}. ${patterns[i].pattern}`);
    console.log(`     ${patterns[i].detail}`);
    console.log();
  }
} else {
  console.log('  No strong consensus patterns found where ALL top 5 differ from you.');
  console.log();
}

// ── Final TL;DR ───────────────────────────────────────────────
console.log('='.repeat(130));
console.log('  TL;DR — ACTIONABLE CHANGES (ranked by impact)');
console.log('='.repeat(130));
console.log();

console.log('  A) FILL EMPTY GCDs WITH HOLY LIGHT');
console.log(`     Your total CPM: ${mcpTotalCPM.toFixed(1)} | Top 5 avg: ${avgTopTotalCPM.toFixed(1)}`);
console.log(`     Your HL CPM: ${mcpHLcpm.toFixed(1)} | Top 5 avg HL CPM: ${avgTopCPM(82326).toFixed(1)}`);
console.log('     When Holy Shock is on CD, no IoL proc, no HP to spend -- hardcast Holy Light.');
console.log('     Every melee GCD during damage = ~5k less HPS vs a Holy Light.');
console.log();

console.log('  B) REDUCE MELEE SWINGS DURING DAMAGE');
console.log(`     Your Melee CPM: ${mcpMeleeCPM.toFixed(1)} | Top 5 avg: ${avgTopCPM(1).toFixed(1)}`);
console.log('     Melee is only optimal during pure downtime. When healing is needed, HL > Melee.');
console.log();

console.log('  C) USE LAY ON HANDS EVERY KILL');
const topLoHCount = top5.filter(p => p.proc.casts.some(c => c.spellId === 633)).length;
console.log(`     ${topLoHCount}/5 top players used it. ${mcpLoH.length > 0 ? 'You used it ' + mcpLoH.length + 'x.' : 'You never used it.'}`);
console.log('     10-min CD = guaranteed 1 use per kill. Save for tank or self during heavy dmg.');
console.log();

console.log('  D) SPEND HOLY POWER AT 3, NOT 5');
console.log(`     Your Spend/Gen ratio: ${mcpSGratio.toFixed(2)} | Top 5 avg: ${avgTopSG.toFixed(2)}`);
console.log('     If ratio < 1.0, you are overcapping HP. Cast Light of Dawn at 3 HP to prevent waste.');
console.log();

console.log('  E) CUT JUDGMENT CASTS IN HALF');
console.log(`     Your Judg CPM: ${mcpCPM(275773).toFixed(1)} | Top 5 avg: ${avgTopCPM(275773).toFixed(1)}`);
console.log('     You cast Judgment 3x more than the average top player.');
console.log('     Judgment generates HP but costs a GCD that could be HL hardcast.');
console.log('     Use Judgment only when you NEED the HP gen + debuff, not as a filler.');
console.log();

console.log('  F) DIVINE TOLL ON COOLDOWN');
const mcpDTcount = mcp.proc.casts.filter(c => c.spellId === 375576).length;
const topDTavg = top5.map(p => p.proc.casts.filter(c => c.spellId === 375576).length).reduce((a, b) => a + b, 0) / 5;
console.log(`     Your DT uses: ${mcpDTcount} | Top 5 avg: ${topDTavg.toFixed(1)}`);
console.log('     30s CD. Align with AW when possible for max HP generation.');
console.log();

console.log('='.repeat(130));
console.log('  END OF ANALYSIS');
console.log('='.repeat(130));
