import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();
const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

const spellNames = JSON.parse(readFileSync(join(__dirname, 'spell-names.json'), 'utf8'));

// ── Spell categorization ───────────────────────────────────────
const GENERATORS = new Set([20473, 275773, 35395]); // Holy Shock, Judgment, Crusader Strike
const SPENDERS = new Set([85222, 156322, 415091]); // Light of Dawn, Eternal Flame, Shield of the Righteous
const MAJOR_CDS = new Set([375576, 31884, 498, 31821, 633]); // Divine Toll, AW, DP, AM, LoH
const HARDCASTS = new Set([19750, 82326]); // Flash of Light, Holy Light
const FILTER_OUT = new Set([415388]); // Reclamation (fake events)

const INFUSION_OF_LIGHT = 54149;
const AVENGING_WRATH = 31884;

// Boss mechanic spells for Averzian
const BOSS_MECHANICS = {
  1259903: 'Dark Upheaval (ticking)',
  1249251: 'Dark Upheaval (burst)',
  1249262: 'Umbral Collapse',
  1280075: 'Lingering Darkness',
  1260718: "Oblivion's Wrath",
  1253691: "Shadow's Advance",
  1274846: 'Dark Barrage',
  1255683: 'Gnashing Void',
};

function spellName(id) {
  return spellNames[id] || BOSS_MECHANICS[id] || `spell-${id}`;
}

function spellCategory(id) {
  if (GENERATORS.has(id)) return 'GEN';
  if (SPENDERS.has(id)) return 'SPEND';
  if (MAJOR_CDS.has(id)) return 'CD';
  if (HARDCASTS.has(id)) return 'HEAL';
  return null;
}

// ── API functions ──────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
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
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchRaidDamage(reportCode, fightId) {
  let allEvents = [];
  let startTime = null;
  while (true) {
    const timeFilter = startTime ? `startTime: ${startTime},` : '';
    const data = await gql(`
      query {
        reportData {
          report(code: "${reportCode}") {
            events(
              fightIDs: [${fightId}]
              filterExpression: "type = 'damage' AND target.disposition = 'friendly' AND source.disposition = 'enemy'"
              ${timeFilter}
              limit: 10000
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `);
    const result = data.reportData.report.events;
    if (result.data?.length > 0) allEvents = allEvents.concat(result.data);
    if (!result.nextPageTimestamp) break;
    startTime = result.nextPageTimestamp;
  }
  return allEvents;
}

// ── Load player data ───────────────────────────────────────────
const topFile = join(__dirname, 'data/X82vPTCZRyznNLcM/mythmaster-fight15.json');
const mcpFile = join(__dirname, 'data/Ty6WFH92YBmGZ4Dj/mcpounding-fight3.json');
const suppFile = join(__dirname, 'data/averzian-supplemental.json');

const topData = JSON.parse(readFileSync(topFile, 'utf8'));
const mcpData = JSON.parse(readFileSync(mcpFile, 'utf8'));
const supplemental = JSON.parse(readFileSync(suppFile, 'utf8'));

// Replace truncated buff data with targeted IoL/AW data
topData.events.iolAwBuffs = supplemental.mythmaster.iolAwBuffs;
mcpData.events.iolAwBuffs = supplemental.mcpounding.iolAwBuffs;

console.log('='.repeat(100));
console.log('  HOLY PALADIN ROTATION COMPARISON: IMPERATOR AVERZIAN (Mythic)');
console.log('='.repeat(100));
console.log();
console.log(`  #1 RANKED: ${topData.player.name}-${topData.player.server}`);
console.log(`    Report: X82vPTCZRyznNLcM | Fight: 15 | Duration: ${(topData.fight.duration / 1000).toFixed(0)}s`);
console.log(`    HPS: ${topData.summary.hps} | Total Healing: ${(topData.summary.totalHealing / 1e6).toFixed(1)}M`);
console.log(`    Overheal: ${topData.summary.overhealPercent}`);
console.log();
console.log(`  YOUR LOG: ${mcpData.player.name}-${mcpData.player.server}`);
console.log(`    Report: Ty6WFH92YBmGZ4Dj | Fight: 3 | Duration: ${(mcpData.fight.duration / 1000).toFixed(0)}s`);
console.log(`    HPS: ${mcpData.summary.hps} | Total Healing: ${(mcpData.summary.totalHealing / 1e6).toFixed(1)}M`);
console.log(`    Overheal: ${mcpData.summary.overhealPercent}`);
console.log();

// ── Build Infusion of Light tracking ───────────────────────────
function buildIoLWindows(buffs, fightStart) {
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

// ── Build Avenging Wrath tracking ──────────────────────────────
function buildAWWindows(buffs) {
  const windows = [];
  let awStart = null;
  for (const b of buffs) {
    // AW can be 31884 or 454351 or 1246385
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

// ── Process casts into timeline ────────────────────────────────
function processCasts(data, windowSizeSec = 10) {
  const fightStart = data.fight.startTime;
  const fightEnd = data.fight.endTime;
  const fightDuration = (fightEnd - fightStart) / 1000;
  // Use targeted IoL/AW buff data if available (not truncated at 10K)
  const buffSource = data.events.iolAwBuffs || data.events.buffs;
  const iolWindows = buildIoLWindows(buffSource, fightStart);
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

  // Group into windows
  const numWindows = Math.ceil(fightDuration / windowSizeSec);
  const windows = [];
  for (let i = 0; i < numWindows; i++) {
    const winStart = i * windowSizeSec;
    const winEnd = Math.min((i + 1) * windowSizeSec, fightDuration);
    const winCasts = casts.filter(c => c.time >= winStart && c.time < winEnd);
    windows.push({
      start: winStart,
      end: winEnd,
      casts: winCasts,
      generators: winCasts.filter(c => c.category === 'GEN').length,
      spenders: winCasts.filter(c => c.category === 'SPEND').length,
      cooldowns: winCasts.filter(c => c.category === 'CD'),
      hardcasts: winCasts.filter(c => c.category === 'HEAL'),
      inAW: winCasts.some(c => c.inAW),
    });
  }
  return { casts, windows, fightDuration, fightStart };
}

// ── Process raid damage into timeline windows ──────────────────
function processRaidDamage(events, fightStart, fightDuration, windowSizeSec = 10) {
  const numWindows = Math.ceil(fightDuration / windowSizeSec);
  const windows = [];

  for (let i = 0; i < numWindows; i++) {
    const winStart = i * windowSizeSec;
    const winEnd = Math.min((i + 1) * windowSizeSec, fightDuration);
    const winEvents = events.filter(e => {
      const t = (e.timestamp - fightStart) / 1000;
      return t >= winStart && t < winEnd;
    });

    const totalDmg = winEvents.reduce((s, e) => s + (e.amount || 0), 0);

    // Group by mechanic
    const mechanics = {};
    for (const e of winEvents) {
      const name = BOSS_MECHANICS[e.abilityGameID] || spellName(e.abilityGameID);
      if (!mechanics[name]) mechanics[name] = { hits: 0, total: 0 };
      mechanics[name].hits++;
      mechanics[name].total += (e.amount || 0);
    }

    windows.push({
      start: winStart,
      end: winEnd,
      totalDamage: totalDmg,
      mechanics,
      intensity: totalDmg > 2000000 ? 'HEAVY' : totalDmg > 500000 ? 'MODERATE' : totalDmg > 100000 ? 'LIGHT' : 'QUIET',
    });
  }
  return windows;
}

// ── Print comparison ───────────────────────────────────────────
function formatCastSeq(casts) {
  return casts.map(c => {
    let label = c.name;
    if (c.hadIoL === true) label += '(IoL)';
    if (c.hadIoL === false && (c.spellId === 19750 || c.spellId === 82326)) label += '(HARD)';
    if (c.category === 'CD') label = `**${label}**`;
    return label;
  }).join(', ');
}

function formatMechanics(mechanics) {
  const entries = Object.entries(mechanics)
    .filter(([_, v]) => v.total > 50000)
    .sort((a, b) => b[1].total - a[1].total);
  if (entries.length === 0) return '(no significant damage)';
  return entries.map(([name, v]) => `${name}: ${(v.total / 1000).toFixed(0)}k`).join(' | ');
}

// ── CAST COUNT COMPARISON ──────────────────────────────────────
function printCastComparison(topData, mcpData) {
  console.log('='.repeat(100));
  console.log('  CAST COUNT COMPARISON (per minute)');
  console.log('='.repeat(100));
  console.log();

  const topDur = topData.fight.duration / 1000 / 60;
  const mcpDur = mcpData.fight.duration / 1000 / 60;

  const topCounts = {};
  const mcpCounts = {};

  for (const c of topData.events.casts) {
    if (c.type !== 'cast' || FILTER_OUT.has(c.abilityGameID) || c.fake) continue;
    const name = spellName(c.abilityGameID);
    topCounts[name] = (topCounts[name] || 0) + 1;
  }
  for (const c of mcpData.events.casts) {
    if (c.type !== 'cast' || FILTER_OUT.has(c.abilityGameID) || c.fake) continue;
    const name = spellName(c.abilityGameID);
    mcpCounts[name] = (mcpCounts[name] || 0) + 1;
  }

  const allSpells = new Set([...Object.keys(topCounts), ...Object.keys(mcpCounts)]);
  const keySpells = [
    'Holy Shock', 'Light of Dawn', 'Flash of Light', 'Holy Light', 'Judgment',
    'Crusader Strike', 'Divine Toll', 'Avenging Wrath', 'Divine Protection',
    'Aura Mastery', 'Lay on Hands', 'Consecration', 'Eternal Flame',
    'Shield of the Righteous',
  ];

  const rows = [];
  for (const name of keySpells) {
    const tc = topCounts[name] || 0;
    const mc = mcpCounts[name] || 0;
    if (tc === 0 && mc === 0) continue;
    const tpm = (tc / topDur).toFixed(1);
    const mpm = (mc / mcpDur).toFixed(1);
    const diff = ((mc / mcpDur) - (tc / topDur)).toFixed(1);
    const diffStr = diff > 0 ? `+${diff}` : diff;
    rows.push({ name, tc, mc, tpm, mpm, diff: diffStr });
  }

  // Also add non-key spells that are significant
  for (const name of allSpells) {
    if (keySpells.includes(name)) continue;
    const tc = topCounts[name] || 0;
    const mc = mcpCounts[name] || 0;
    if (tc + mc < 5) continue;
    const tpm = (tc / topDur).toFixed(1);
    const mpm = (mc / mcpDur).toFixed(1);
    const diff = ((mc / mcpDur) - (tc / topDur)).toFixed(1);
    const diffStr = diff > 0 ? `+${diff}` : diff;
    rows.push({ name, tc, mc, tpm, mpm, diff: diffStr });
  }

  const nameW = 28;
  console.log(`  ${'Spell'.padEnd(nameW)} ${'Mythmaster'.padStart(12)} ${'CPM'.padStart(6)}    ${'McPounding'.padStart(12)} ${'CPM'.padStart(6)}    ${'Diff/min'.padStart(8)}`);
  console.log('  ' + '-'.repeat(nameW + 55));
  for (const r of rows) {
    const cat = GENERATORS.has([...Object.entries(spellNames)].find(([_, n]) => n === r.name)?.[0] * 1) ? ' [GEN]' :
                SPENDERS.has([...Object.entries(spellNames)].find(([_, n]) => n === r.name)?.[0] * 1) ? ' [SPD]' :
                MAJOR_CDS.has([...Object.entries(spellNames)].find(([_, n]) => n === r.name)?.[0] * 1) ? ' [CD]' :
                HARDCASTS.has([...Object.entries(spellNames)].find(([_, n]) => n === r.name)?.[0] * 1) ? ' [HC]' : '';
    console.log(`  ${(r.name + cat).padEnd(nameW)} ${String(r.tc).padStart(12)} ${r.tpm.padStart(6)}    ${String(r.mc).padStart(12)} ${r.mpm.padStart(6)}    ${r.diff.padStart(8)}`);
  }
  console.log();
}

// ── HEALING BREAKDOWN COMPARISON ───────────────────────────────
function printHealingComparison(topData, mcpData) {
  console.log('='.repeat(100));
  console.log('  HEALING BREAKDOWN COMPARISON');
  console.log('='.repeat(100));
  console.log();

  const topDur = topData.fight.duration / 1000;
  const mcpDur = mcpData.fight.duration / 1000;

  function buildBreakdown(events) {
    const bd = {};
    for (const h of events) {
      const name = spellName(h.abilityGameID);
      if (!bd[name]) bd[name] = { total: 0, overheal: 0, count: 0 };
      bd[name].total += (h.amount || 0);
      bd[name].overheal += (h.overheal || 0);
      bd[name].count++;
    }
    return bd;
  }

  const topHeal = buildBreakdown(topData.events.healing);
  const mcpHeal = buildBreakdown(mcpData.events.healing);

  const topTotal = Object.values(topHeal).reduce((s, v) => s + v.total, 0);
  const mcpTotal = Object.values(mcpHeal).reduce((s, v) => s + v.total, 0);

  const allSpells = new Set([...Object.keys(topHeal), ...Object.keys(mcpHeal)]);
  const rows = [];
  for (const name of allSpells) {
    const t = topHeal[name] || { total: 0, overheal: 0, count: 0 };
    const m = mcpHeal[name] || { total: 0, overheal: 0, count: 0 };
    if (t.total + m.total < 10000) continue;
    rows.push({
      name,
      tTotal: t.total,
      tPct: topTotal > 0 ? (t.total / topTotal * 100).toFixed(1) : '0.0',
      tOH: t.total + t.overheal > 0 ? (t.overheal / (t.total + t.overheal) * 100).toFixed(0) : '0',
      tHPS: (t.total / topDur).toFixed(0),
      mTotal: m.total,
      mPct: mcpTotal > 0 ? (m.total / mcpTotal * 100).toFixed(1) : '0.0',
      mOH: m.total + m.overheal > 0 ? (m.overheal / (m.total + m.overheal) * 100).toFixed(0) : '0',
      mHPS: (m.total / mcpDur).toFixed(0),
    });
  }

  rows.sort((a, b) => Math.max(b.tTotal, b.mTotal) - Math.max(a.tTotal, a.mTotal));

  const nameW = 28;
  console.log('  Mythmaster:');
  console.log(`  ${'Spell'.padEnd(nameW)} ${'Healing'.padStart(12)} ${'%'.padStart(6)} ${'OH%'.padStart(5)} ${'HPS'.padStart(8)}`);
  console.log('  ' + '-'.repeat(nameW + 35));
  for (const r of rows.filter(r => r.tTotal > 0)) {
    console.log(`  ${r.name.padEnd(nameW)} ${(r.tTotal / 1000).toFixed(0).padStart(11)}k ${r.tPct.padStart(5)}% ${(r.tOH + '%').padStart(5)} ${r.tHPS.padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(nameW)} ${(topTotal / 1000).toFixed(0).padStart(11)}k ${' '.repeat(6)} ${' '.repeat(5)} ${(topTotal / topDur).toFixed(0).padStart(8)}`);

  console.log();
  console.log('  McPounding:');
  console.log(`  ${'Spell'.padEnd(nameW)} ${'Healing'.padStart(12)} ${'%'.padStart(6)} ${'OH%'.padStart(5)} ${'HPS'.padStart(8)}`);
  console.log('  ' + '-'.repeat(nameW + 35));
  for (const r of rows.filter(r => r.mTotal > 0)) {
    console.log(`  ${r.name.padEnd(nameW)} ${(r.mTotal / 1000).toFixed(0).padStart(11)}k ${r.mPct.padStart(5)}% ${(r.mOH + '%').padStart(5)} ${r.mHPS.padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(nameW)} ${(mcpTotal / 1000).toFixed(0).padStart(11)}k ${' '.repeat(6)} ${' '.repeat(5)} ${(mcpTotal / mcpDur).toFixed(0).padStart(8)}`);
  console.log();
}

// ── TIMELINE COMPARISON ────────────────────────────────────────
function printTimeline(topProc, mcpProc, topRaidDmg, mcpRaidDmg) {
  console.log('='.repeat(100));
  console.log('  ROTATION TIMELINE (10-second windows)');
  console.log('  Legend: [GEN]=Generator [SPD]=Spender [CD]=Cooldown [HC]=Hardcast (IoL)=Infusion proc');
  console.log('  Damage intensity: HEAVY=2M+ MODERATE=500k+ LIGHT=100k+ QUIET=<100k');
  console.log('='.repeat(100));
  console.log();

  // Use the shorter fight's windows for comparison
  const maxTime = Math.min(topProc.fightDuration, mcpProc.fightDuration);
  const numWindows = Math.ceil(maxTime / 10);

  for (let i = 0; i < numWindows; i++) {
    const winStart = i * 10;
    const winEnd = Math.min((i + 1) * 10, maxTime);

    const topWin = topProc.windows[i];
    const mcpWin = mcpProc.windows[i];
    const topDmgWin = topRaidDmg[i];
    const mcpDmgWin = mcpRaidDmg[i];

    if (!topWin && !mcpWin) continue;

    console.log(`  ┌─── ${winStart}s - ${winEnd.toFixed(0)}s ${'─'.repeat(80)}`);

    // Boss damage line (use whichever fight's damage data)
    const dmgWin = topDmgWin || mcpDmgWin;
    if (dmgWin) {
      const intensity = dmgWin.intensity;
      const bar = intensity === 'HEAVY' ? '████████' : intensity === 'MODERATE' ? '█████' : intensity === 'LIGHT' ? '███' : '█';
      console.log(`  │ BOSS DMG: ${bar} ${intensity} (${(dmgWin.totalDamage / 1000).toFixed(0)}k)`);
      const mechStr = formatMechanics(dmgWin.mechanics);
      if (mechStr !== '(no significant damage)') {
        console.log(`  │          ${mechStr}`);
      }
    }

    // Mythmaster line
    if (topWin) {
      const awTag = topWin.inAW ? ' [AW ACTIVE]' : '';
      const gen = topWin.generators;
      const spd = topWin.spenders;
      const hc = topWin.hardcasts.length;
      console.log(`  │`);
      console.log(`  │ MYTHMASTER: ${gen}gen/${spd}spd/${hc}hc${awTag}`);
      if (topWin.cooldowns.length > 0) {
        console.log(`  │   CDs: ${topWin.cooldowns.map(c => c.name).join(', ')}`);
      }
      const castStr = formatCastSeq(topWin.casts);
      if (castStr) console.log(`  │   Seq: ${castStr}`);
    }

    // McPounding line
    if (mcpWin) {
      const awTag = mcpWin.inAW ? ' [AW ACTIVE]' : '';
      const gen = mcpWin.generators;
      const spd = mcpWin.spenders;
      const hc = mcpWin.hardcasts.length;
      console.log(`  │`);
      console.log(`  │ McPOUNDING: ${gen}gen/${spd}spd/${hc}hc${awTag}`);
      if (mcpWin.cooldowns.length > 0) {
        console.log(`  │   CDs: ${mcpWin.cooldowns.map(c => c.name).join(', ')}`);
      }
      const castStr = formatCastSeq(mcpWin.casts);
      if (castStr) console.log(`  │   Seq: ${castStr}`);
    }

    console.log(`  │`);
  }

  // If McPounding's fight is longer, show the extra windows
  if (mcpProc.fightDuration > topProc.fightDuration) {
    console.log();
    console.log(`  ─── McPounding fight continues (Mythmaster's fight ended at ${topProc.fightDuration.toFixed(0)}s) ───`);
    for (let i = numWindows; i < mcpProc.windows.length; i++) {
      const mcpWin = mcpProc.windows[i];
      if (!mcpWin || mcpWin.casts.length === 0) continue;
      const winStart = i * 10;
      const winEnd = Math.min((i + 1) * 10, mcpProc.fightDuration);
      const awTag = mcpWin.inAW ? ' [AW ACTIVE]' : '';
      const mcpDmgWin = mcpRaidDmg[i];

      console.log(`  ┌─── ${winStart}s - ${winEnd.toFixed(0)}s ${'─'.repeat(80)}`);
      if (mcpDmgWin) {
        console.log(`  │ BOSS DMG: ${mcpDmgWin.intensity} (${(mcpDmgWin.totalDamage / 1000).toFixed(0)}k)`);
      }
      console.log(`  │ McPOUNDING: ${mcpWin.generators}gen/${mcpWin.spenders}spd/${mcpWin.hardcasts.length}hc${awTag}`);
      if (mcpWin.cooldowns.length > 0) {
        console.log(`  │   CDs: ${mcpWin.cooldowns.map(c => c.name).join(', ')}`);
      }
      console.log(`  │   Seq: ${formatCastSeq(mcpWin.casts)}`);
      console.log(`  │`);
    }
  }
}

// ── CD TIMING ANALYSIS ─────────────────────────────────────────
function printCDAnalysis(topProc, mcpProc) {
  console.log();
  console.log('='.repeat(100));
  console.log('  COOLDOWN USAGE TIMING');
  console.log('='.repeat(100));
  console.log();

  const cdNames = ['Avenging Wrath', 'Divine Toll', 'Aura Mastery', 'Divine Protection', 'Lay on Hands'];

  for (const cdName of cdNames) {
    const topUses = topProc.casts.filter(c => c.name === cdName);
    const mcpUses = mcpProc.casts.filter(c => c.name === cdName);

    if (topUses.length === 0 && mcpUses.length === 0) continue;

    console.log(`  ${cdName}:`);
    console.log(`    Mythmaster (${topUses.length}x): ${topUses.map(c => c.time.toFixed(1) + 's').join(', ') || 'never used'}`);
    console.log(`    McPounding (${mcpUses.length}x): ${mcpUses.map(c => c.time.toFixed(1) + 's').join(', ') || 'never used'}`);
    console.log();
  }
}

// ── HOLY POWER ECONOMY ─────────────────────────────────────────
function printHolyPowerAnalysis(topProc, mcpProc) {
  console.log('='.repeat(100));
  console.log('  HOLY POWER ECONOMY');
  console.log('='.repeat(100));
  console.log();

  function analyze(proc, name) {
    const totalGen = proc.casts.filter(c => c.category === 'GEN').length;
    const totalSpend = proc.casts.filter(c => c.category === 'SPEND').length;
    const ratio = totalGen > 0 ? (totalSpend / totalGen).toFixed(2) : 'N/A';
    const genPerMin = (totalGen / (proc.fightDuration / 60)).toFixed(1);
    const spendPerMin = (totalSpend / (proc.fightDuration / 60)).toFixed(1);

    // Break down generators
    const hs = proc.casts.filter(c => c.spellId === 20473).length;
    const judg = proc.casts.filter(c => c.spellId === 275773).length;
    const cs = proc.casts.filter(c => c.spellId === 35395).length;

    // Break down spenders
    const lod = proc.casts.filter(c => c.spellId === 85222).length;
    const ef = proc.casts.filter(c => c.spellId === 156322).length;
    const sotr = proc.casts.filter(c => c.spellId === 415091).length;

    console.log(`  ${name}:`);
    console.log(`    Generators: ${totalGen} total (${genPerMin}/min)`);
    console.log(`      Holy Shock: ${hs} | Judgment: ${judg} | Crusader Strike: ${cs}`);
    console.log(`    Spenders: ${totalSpend} total (${spendPerMin}/min)`);
    console.log(`      Light of Dawn: ${lod} | Eternal Flame: ${ef} | Shield of Righteous: ${sotr}`);
    console.log(`    Spend/Gen Ratio: ${ratio}`);
    console.log();
  }

  analyze(topProc, 'Mythmaster');
  analyze(mcpProc, 'McPounding');
}

// ── HARDCAST ANALYSIS ──────────────────────────────────────────
function printHardcastAnalysis(topProc, mcpProc) {
  console.log('='.repeat(100));
  console.log('  FLASH OF LIGHT / HOLY LIGHT ANALYSIS');
  console.log('  IoL = Infusion of Light proc (instant/faster cast from Holy Shock crit)');
  console.log('  HARD = Full hardcast (no proc, standing still)');
  console.log('='.repeat(100));
  console.log();

  function analyze(proc, name) {
    const fol = proc.casts.filter(c => c.spellId === 19750);
    const hl = proc.casts.filter(c => c.spellId === 82326);

    const folIoL = fol.filter(c => c.hadIoL === true).length;
    const folHard = fol.filter(c => c.hadIoL === false).length;
    const hlIoL = hl.filter(c => c.hadIoL === true).length;
    const hlHard = hl.filter(c => c.hadIoL === false).length;

    console.log(`  ${name}:`);
    console.log(`    Flash of Light: ${fol.length} total (${folIoL} IoL proc'd, ${folHard} hardcast)`);
    console.log(`    Holy Light: ${hl.length} total (${hlIoL} IoL proc'd, ${hlHard} hardcast)`);
    if (fol.length + hl.length > 0) {
      const procPct = ((folIoL + hlIoL) / (fol.length + hl.length) * 100).toFixed(0);
      console.log(`    IoL utilization: ${procPct}% of FoL/HL casts were proc'd`);
    }
    console.log();
  }

  analyze(topProc, 'Mythmaster');
  analyze(mcpProc, 'McPounding');
}

// ── DAMAGE RESPONSE ANALYSIS ───────────────────────────────────
function printDamageResponseAnalysis(topProc, mcpProc, topRaidDmg, mcpRaidDmg) {
  console.log('='.repeat(100));
  console.log('  DAMAGE RESPONSE PATTERNS');
  console.log('  How each player reacts to HEAVY and MODERATE damage windows');
  console.log('='.repeat(100));
  console.log();

  function analyzeResponse(proc, raidDmg, name) {
    const heavyWindows = raidDmg.filter(w => w.intensity === 'HEAVY' || w.intensity === 'MODERATE');
    const quietWindows = raidDmg.filter(w => w.intensity === 'QUIET' || w.intensity === 'LIGHT');

    let dmgGenRate = 0, dmgSpendRate = 0, dmgCDs = 0, dmgHardcasts = 0;
    let quietGenRate = 0, quietSpendRate = 0, quietCDs = 0, quietHardcasts = 0;

    for (const dw of heavyWindows) {
      const idx = Math.floor(dw.start / 10);
      const pw = proc.windows[idx];
      if (!pw) continue;
      dmgGenRate += pw.generators;
      dmgSpendRate += pw.spenders;
      dmgCDs += pw.cooldowns.length;
      dmgHardcasts += pw.hardcasts.length;
    }

    for (const qw of quietWindows) {
      const idx = Math.floor(qw.start / 10);
      const pw = proc.windows[idx];
      if (!pw) continue;
      quietGenRate += pw.generators;
      quietSpendRate += pw.spenders;
      quietCDs += pw.cooldowns.length;
      quietHardcasts += pw.hardcasts.length;
    }

    const hCount = heavyWindows.length || 1;
    const qCount = quietWindows.length || 1;

    console.log(`  ${name}:`);
    console.log(`    During HEAVY/MODERATE damage (${heavyWindows.length} windows):`);
    console.log(`      Avg generators/window: ${(dmgGenRate / hCount).toFixed(1)}`);
    console.log(`      Avg spenders/window:   ${(dmgSpendRate / hCount).toFixed(1)}`);
    console.log(`      Total CDs popped:      ${dmgCDs}`);
    console.log(`      Total hardcasts:        ${dmgHardcasts}`);
    console.log(`    During QUIET/LIGHT damage (${quietWindows.length} windows):`);
    console.log(`      Avg generators/window: ${(quietGenRate / qCount).toFixed(1)}`);
    console.log(`      Avg spenders/window:   ${(quietSpendRate / qCount).toFixed(1)}`);
    console.log(`      Total CDs popped:      ${quietCDs}`);
    console.log(`      Total hardcasts:        ${quietHardcasts}`);
    console.log();
  }

  analyzeResponse(topProc, topRaidDmg, 'Mythmaster');
  analyzeResponse(mcpProc, mcpRaidDmg, 'McPounding');
}

// ── KEY INSIGHTS ───────────────────────────────────────────────
function printKeyInsights(topProc, mcpProc, topData, mcpData) {
  console.log('='.repeat(100));
  console.log('  KEY DIFFERENCES & ACTIONABLE INSIGHTS');
  console.log('='.repeat(100));
  console.log();

  const topDur = topProc.fightDuration / 60;
  const mcpDur = mcpProc.fightDuration / 60;

  // 1. The headline number
  const hpsDiff = (parseInt(topData.summary.hps) - parseInt(mcpData.summary.hps));
  console.log(`  1. THE GAP`);
  console.log(`     Mythmaster: ${topData.summary.hps} HPS in a ${(topDur).toFixed(1)}-min kill`);
  console.log(`     McPounding: ${mcpData.summary.hps} HPS in a ${(mcpDur).toFixed(1)}-min kill`);
  console.log(`     Difference: ${hpsDiff.toLocaleString()} HPS (${((hpsDiff / parseInt(topData.summary.hps)) * 100).toFixed(0)}% gap)`);
  console.log(`     Fight length matters: Mythmaster's raid killed it 79s faster. Shorter fights`);
  console.log(`     = less overheal, higher HPS. Part of the gap is raid DPS, not just healing skill.`);
  console.log();

  // 2. THE BIGGEST DIFFERENCE: Hardcasting
  const topFoL = topProc.casts.filter(c => c.spellId === 19750);
  const mcpFoL = mcpProc.casts.filter(c => c.spellId === 19750);
  const topHL = topProc.casts.filter(c => c.spellId === 82326);
  const mcpHL = mcpProc.casts.filter(c => c.spellId === 82326);
  const topFoLProc = topFoL.filter(c => c.hadIoL === true).length;
  const topFoLHard = topFoL.filter(c => c.hadIoL === false).length;
  const topHLProc = topHL.filter(c => c.hadIoL === true).length;
  const topHLHard = topHL.filter(c => c.hadIoL === false).length;
  const mcpFoLProc = mcpFoL.filter(c => c.hadIoL === true).length;
  const mcpFoLHard = mcpFoL.filter(c => c.hadIoL === false).length;
  const mcpHLProc = mcpHL.filter(c => c.hadIoL === true).length;
  const mcpHLHard = mcpHL.filter(c => c.hadIoL === false).length;

  const topTotalHardcasts = topFoLHard + topHLHard;
  const mcpTotalHardcasts = mcpFoLHard + mcpHLHard;

  console.log(`  2. THE BIGGEST DIFFERENCE: HARDCASTING (FoL + HL without IoL proc)`);
  console.log(`     This is where the #1 player separates from the pack.`);
  console.log();
  console.log(`     Mythmaster: ${topTotalHardcasts} total hardcasts (${(topTotalHardcasts / topDur).toFixed(1)}/min)`);
  console.log(`       Flash of Light: ${topFoLProc} IoL proc'd + ${topFoLHard} hardcast = ${topFoL.length} total`);
  console.log(`       Holy Light:     ${topHLProc} IoL proc'd + ${topHLHard} hardcast = ${topHL.length} total`);
  console.log();
  console.log(`     McPounding:  ${mcpTotalHardcasts} total hardcasts (${(mcpTotalHardcasts / mcpDur).toFixed(1)}/min)`);
  console.log(`       Flash of Light: ${mcpFoLProc} IoL proc'd + ${mcpFoLHard} hardcast = ${mcpFoL.length} total`);
  console.log(`       Holy Light:     ${mcpHLProc} IoL proc'd + ${mcpHLHard} hardcast = ${mcpHL.length} total`);
  console.log();
  console.log(`     >>> Mythmaster hardcasts ${(topTotalHardcasts / topDur).toFixed(1)} times/min vs your ${(mcpTotalHardcasts / mcpDur).toFixed(1)}/min.`);
  console.log(`         Mythmaster uses HL as a GCD filler between instant casts. When nothing else`);
  console.log(`         is available (HS on CD, no HP to spend, no IoL proc), they stand still and`);
  console.log(`         hardcast Holy Light rather than auto-attacking or doing nothing.`);
  console.log(`         Look at 120s-140s: Mythmaster hardcasts 11 HLs with Innervate from a druid.`);
  console.log(`         That's free, high-throughput healing when HS/LoD are on cooldown.`);
  console.log();

  // 3. Melee fillers vs HL fillers
  const topMelee = topProc.casts.filter(c => c.spellId === 1).length;
  const mcpMelee = mcpProc.casts.filter(c => c.spellId === 1).length;
  console.log(`  3. MELEE vs HOLY LIGHT: What you do between instant casts`);
  console.log(`     Mythmaster: ${(topMelee / topDur).toFixed(1)} melee/min + ${(topTotalHardcasts / topDur).toFixed(1)} hardcast heals/min`);
  console.log(`     McPounding: ${(mcpMelee / mcpDur).toFixed(1)} melee/min + ${(mcpTotalHardcasts / mcpDur).toFixed(1)} hardcast heals/min`);
  console.log();
  console.log(`     >>> You melee ${((mcpMelee / mcpDur) / (topMelee / topDur || 1) * 100 - 100).toFixed(0)}% more and hardcast ${((topTotalHardcasts / topDur) / (mcpTotalHardcasts / mcpDur || 1) * 100 - 100).toFixed(0)}% less.`);
  console.log(`         Every GCD spent on melee is a GCD NOT spent on Holy Light. Melee does ~2k DPS.`);
  console.log(`         Holy Light does ~5-8k HPS. When damage is going out, HL > Melee.`);
  console.log(`         During downtime when healing isn't needed, melee is fine for DPS contribution.`);
  console.log();

  // 4. Judgment usage difference
  const topJudg = topProc.casts.filter(c => c.spellId === 275773).length;
  const mcpJudg = mcpProc.casts.filter(c => c.spellId === 275773).length;
  console.log(`  4. JUDGMENT USAGE`);
  console.log(`     Mythmaster: ${(topJudg / topDur).toFixed(1)}/min (${topJudg} total)`);
  console.log(`     McPounding: ${(mcpJudg / mcpDur).toFixed(1)}/min (${mcpJudg} total)`);
  console.log();
  console.log(`     >>> You cast Judgment ${((mcpJudg / mcpDur) / (topJudg / topDur || 1)).toFixed(1)}x more often. This generates HP but at the cost of a GCD`);
  console.log(`         that could be a HL hardcast. Judgment is good for HP generation + debuff,`);
  console.log(`         but Mythmaster generates enough HP from HS + Divine Toll alone.`);
  console.log();

  // 5. Holy Power Economy
  const topGen = topProc.casts.filter(c => c.category === 'GEN').length;
  const topSpend = topProc.casts.filter(c => c.category === 'SPEND').length;
  const mcpGen = mcpProc.casts.filter(c => c.category === 'GEN').length;
  const mcpSpend = mcpProc.casts.filter(c => c.category === 'SPEND').length;
  console.log(`  5. HOLY POWER ECONOMY`);
  console.log(`     Mythmaster: ${topGen} gen / ${topSpend} spend = ${(topSpend / topGen).toFixed(2)} spend/gen ratio`);
  console.log(`     McPounding: ${mcpGen} gen / ${mcpSpend} spend = ${(mcpSpend / mcpGen).toFixed(2)} spend/gen ratio`);
  console.log();
  console.log(`     >>> Mythmaster has a ${(topSpend / topGen).toFixed(2)} ratio (>1.0 means Divine Toll HP gains are`);
  console.log(`         efficiently converted to LoD). Your ${(mcpSpend / mcpGen).toFixed(2)} ratio means you're generating`);
  console.log(`         more HP than you spend -- are you capping at 5 HP and wasting generators?`);
  console.log(`         Spend HP at 3 when possible; don't wait for 5.`);
  console.log();

  // 6. CD timing
  const topDT = topProc.casts.filter(c => c.spellId === 375576);
  const mcpDT = mcpProc.casts.filter(c => c.spellId === 375576);
  const topAW = topProc.casts.filter(c => c.spellId === 31884);
  const mcpAW = mcpProc.casts.filter(c => c.spellId === 31884);
  console.log(`  6. DIVINE TOLL TIMING (30s CD)`);
  console.log(`     Mythmaster: ${topDT.length} uses -- ${topDT.map(c => c.time.toFixed(0) + 's').join(', ')}`);
  console.log(`     McPounding: ${mcpDT.length} uses -- ${mcpDT.map(c => c.time.toFixed(0) + 's').join(', ')}`);
  const topDTgaps = [];
  for (let i = 1; i < topDT.length; i++) topDTgaps.push((topDT[i].time - topDT[i-1].time).toFixed(0));
  const mcpDTgaps = [];
  for (let i = 1; i < mcpDT.length; i++) mcpDTgaps.push((mcpDT[i].time - mcpDT[i-1].time).toFixed(0));
  console.log(`     Gaps between uses:`);
  console.log(`       Mythmaster: ${topDTgaps.join('s, ')}s (avg ${(topDTgaps.reduce((s, v) => s + parseInt(v), 0) / topDTgaps.length).toFixed(0)}s)`);
  console.log(`       McPounding: ${mcpDTgaps.join('s, ')}s (avg ${(mcpDTgaps.reduce((s, v) => s + parseInt(v), 0) / mcpDTgaps.length).toFixed(0)}s)`);
  console.log(`     >>> Both players use DT on cooldown (~30-35s gaps). Good.`);
  console.log();

  console.log(`  7. AVENGING WRATH ALIGNMENT`);
  console.log(`     Mythmaster: ${topAW.length} uses at ${topAW.map(c => c.time.toFixed(0) + 's').join(', ')}`);
  console.log(`     McPounding: ${mcpAW.length} uses at ${mcpAW.map(c => c.time.toFixed(0) + 's').join(', ')}`);
  console.log(`     Mythmaster uses AW at 37s (first big Umbral Collapse + Lingering Darkness) and`);
  console.log(`     192s (pre-positioning for final phase). McPounding pops it earlier at 29s.`);
  console.log(`     Both players align AW with DT for maximum HP generation.`);
  console.log();

  // 8. Lay on Hands
  const topLoH = topProc.casts.filter(c => c.spellId === 633);
  const mcpLoH = mcpProc.casts.filter(c => c.spellId === 633);
  console.log(`  8. LAY ON HANDS`);
  console.log(`     Mythmaster: ${topLoH.length} use(s) at ${topLoH.map(c => c.time.toFixed(0) + 's').join(', ') || 'never'}`);
  console.log(`     McPounding: ${mcpLoH.length} use(s) at ${mcpLoH.map(c => c.time.toFixed(0) + 's').join(', ') || 'never'}`);
  if (mcpLoH.length === 0 && topLoH.length > 0) {
    console.log(`     >>> Mythmaster used LoH at 91s during a heavy damage window. You never used it.`);
    console.log(`         LoH is your biggest single-target save. Use it on tanks or yourself during`);
    console.log(`         Oblivion's Wrath / Dark Barrage to prevent a death.`);
  }
  console.log();

  // 9. Innervate windows
  const topInnerv = topProc.casts.filter(c => c.name === 'Innervate');
  console.log(`  9. EXTERNAL COOLDOWNS (INNERVATE)`);
  console.log(`     Mythmaster got ${topInnerv.length} Innervate(s) at ${topInnerv.map(c => c.time.toFixed(0) + 's').join(', ') || 'N/A'}`);
  console.log(`     During these windows, Mythmaster spam-hardcasts Holy Light (see 120s-140s in timeline).`);
  console.log(`     This is 6+ consecutive HL hardcasts -- massive free throughput.`);
  console.log(`     >>> If you have a Resto Druid in your comp, coordinate Innervate timing with`);
  console.log(`         heavy damage phases. Use HL (not FoL) during Innervate for max efficiency.`);
  console.log();

  // 10. Summary
  console.log(`  10. TL;DR -- THREE THINGS TO IMPROVE`);
  console.log();
  console.log(`     A) HARDCAST MORE HOLY LIGHT`);
  console.log(`        You cast ${mcpHL.length} HL in ${(mcpDur).toFixed(1)} min. Mythmaster cast ${topHL.length} in ${(topDur).toFixed(1)} min.`);
  console.log(`        When HS is on CD, no IoL proc, and no HP to spend -- stand still and cast HL.`);
  console.log(`        Every melee swing you do instead of a HL is ~5k less HPS.`);
  console.log();
  console.log(`     B) USE LAY ON HANDS`);
  console.log(`        10-min CD. One fight = one use. It should be used every kill.`);
  console.log(`        Save it for the tank or a low-HP player during Oblivion's Wrath.`);
  console.log();
  console.log(`     C) SPEND HP AT 3, NOT 5`);
  console.log(`        Your spend/gen ratio (${(mcpSpend / mcpGen).toFixed(2)}) suggests you're sitting on HP.`);
  console.log(`        Every HS/Judg when you're at 5 HP = wasted generation. LoD at 3 HP`);
  console.log(`        keeps the cycle flowing: Generate -> Spend -> Generate -> Spend.`);
  console.log();
}


// ── MAIN ───────────────────────────────────────────────────────
async function main() {
  // Use pre-fetched supplemental raid damage data
  const topRaidDmgRaw = supplemental.mythmaster.raidDamage;
  const mcpRaidDmgRaw = supplemental.mcpounding.raidDamage;

  const topDmgCoverage = topRaidDmgRaw.length > 0
    ? ((topRaidDmgRaw[topRaidDmgRaw.length-1].timestamp - topData.fight.startTime) / 1000).toFixed(0)
    : '0';
  const mcpDmgCoverage = mcpRaidDmgRaw.length > 0
    ? ((mcpRaidDmgRaw[mcpRaidDmgRaw.length-1].timestamp - mcpData.fight.startTime) / 1000).toFixed(0)
    : '0';

  console.log(`  Raid damage data: Mythmaster ${topRaidDmgRaw.length} events (covers first ${topDmgCoverage}s)`);
  console.log(`  Raid damage data: McPounding ${mcpRaidDmgRaw.length} events (covers first ${mcpDmgCoverage}s)`);
  console.log(`  (Boss damage overlay shown for first ~${Math.min(parseInt(topDmgCoverage), parseInt(mcpDmgCoverage))}s; later windows show cast data only)`);
  console.log();

  // Process both players' cast data
  const topProc = processCasts(topData, 10);
  const mcpProc = processCasts(mcpData, 10);

  // Process raid damage into windows
  const topRaidDmg = processRaidDamage(topRaidDmgRaw, topData.fight.startTime, topProc.fightDuration, 10);
  const mcpRaidDmg = processRaidDamage(mcpRaidDmgRaw, mcpData.fight.startTime, mcpProc.fightDuration, 10);

  // Print all sections
  printCastComparison(topData, mcpData);
  printHealingComparison(topData, mcpData);
  printHolyPowerAnalysis(topProc, mcpProc);
  printHardcastAnalysis(topProc, mcpProc);
  printCDAnalysis(topProc, mcpProc);
  printTimeline(topProc, mcpProc, topRaidDmg, mcpRaidDmg);
  printDamageResponseAnalysis(topProc, mcpProc, topRaidDmg, mcpRaidDmg);
  printKeyInsights(topProc, mcpProc, topData, mcpData);
}

main().catch(e => { console.error(e); process.exit(1); });
