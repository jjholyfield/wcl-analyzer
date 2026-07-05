import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();
const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

const spellNames = JSON.parse(readFileSync(join(__dirname, 'spell-names.json'), 'utf8'));

// ── Auth ──────────────────────────────────────────────────────
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

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
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

function spellName(id) {
  return spellNames[id] || `spell-${id}`;
}

// ── MW Monk spell categories ──────────────────────────────────
const MW_SPELLS = {
  // Core rotational
  116670: { name: 'Vivify', cat: 'HEAL' },
  124682: { name: 'Enveloping Mist', cat: 'HEAL' },
  115151: { name: 'Renewing Mist', cat: 'HOT' },
  191837: { name: 'Essence Font', cat: 'HEAL' },

  // Damage / Ancient Teachings
  100780: { name: 'Tiger Palm', cat: 'DPS' },
  100784: { name: 'Blackout Kick', cat: 'DPS' },
  228649: { name: 'Blackout Kick', cat: 'DPS' },
  107428: { name: 'Rising Sun Kick', cat: 'DPS' },
  185099: { name: 'Rising Sun Kick', cat: 'DPS' },
  101546: { name: 'Spinning Crane Kick', cat: 'DPS' },
  205523: { name: 'Blackout Kick (proc)', cat: 'DPS' },

  // Talents
  388193: { name: 'Jadefire Stomp', cat: 'TALENT' },
  327104: { name: 'Jadefire Stomp', cat: 'TALENT' },
  123986: { name: 'Chi Burst', cat: 'TALENT' },
  325216: { name: 'Bonedust Brew', cat: 'TALENT' },
  443028: { name: 'Celestial Conduit', cat: 'CD' },

  // Utility
  116680: { name: 'Thunder Focus Tea', cat: 'UTIL' },
  115546: { name: 'Provoke', cat: 'UTIL' },
  109132: { name: 'Roll', cat: 'MOVE' },
  115008: { name: "Chi Torpedo", cat: 'MOVE' },
  119381: { name: 'Leg Sweep', cat: 'UTIL' },
  116841: { name: "Tiger's Lust", cat: 'UTIL' },
  115078: { name: 'Paralysis', cat: 'UTIL' },

  // Major CDs
  115310: { name: 'Revival', cat: 'CD' },
  388615: { name: 'Restoral', cat: 'CD' },
  322118: { name: 'Invoke Yu\'lon', cat: 'CD' },
  325197: { name: 'Invoke Chi-Ji', cat: 'CD' },
  116849: { name: 'Life Cocoon', cat: 'CD' },

  // Melee
  1: { name: 'Melee', cat: 'AUTO' },
};

// Key spells for CPM comparison
const KEY_SPELLS = [
  // Core healing
  { ids: [116670], name: 'Vivify', cat: 'HEAL' },
  { ids: [124682], name: 'Enveloping Mist', cat: 'HEAL' },
  { ids: [115151], name: 'Renewing Mist', cat: 'HOT' },
  { ids: [191837], name: 'Essence Font', cat: 'HEAL' },
  // Damage
  { ids: [100780], name: 'Tiger Palm', cat: 'DPS' },
  { ids: [100784, 228649, 205523], name: 'Blackout Kick', cat: 'DPS' },
  { ids: [107428, 185099], name: 'Rising Sun Kick', cat: 'DPS' },
  { ids: [101546], name: 'Spinning Crane Kick', cat: 'DPS' },
  // Talents
  { ids: [388193, 327104], name: 'Jadefire Stomp', cat: 'TALENT' },
  { ids: [123986], name: 'Chi Burst', cat: 'TALENT' },
  { ids: [325216], name: 'Bonedust Brew', cat: 'TALENT' },
  { ids: [443028], name: 'Celestial Conduit', cat: 'CD' },
  // Utility
  { ids: [116680], name: 'Thunder Focus Tea', cat: 'UTIL' },
  // Major CDs
  { ids: [115310, 388615], name: 'Revival/Restoral', cat: 'CD' },
  { ids: [322118], name: 'Invoke Yu\'lon', cat: 'CD' },
  { ids: [325197], name: 'Invoke Chi-Ji', cat: 'CD' },
  { ids: [116849], name: 'Life Cocoon', cat: 'CD' },
];

// ── Step 1: Get Josh's sourceID from tonight's report ─────────
const REPORT_CODE = 'FgbKj64vPNc9HAVa';
const FIGHT_ID = 13; // best pull (324s)

async function getPlayerSourceID(reportCode, fightId, playerName) {
  const data = await gql(`{
    reportData {
      report(code: "${reportCode}") {
        masterData { actors(type: "Player") { id name server type subType } }
        playerDetails(fightIDs: [${fightId}])
        fights(fightIDs: [${fightId}]) { id startTime endTime friendlyPlayers }
      }
    }
  }`);

  const actors = data.reportData.report.masterData.actors;
  const fight = data.reportData.report.fights[0];

  // Find the player
  const player = actors.find(a => a.name.toLowerCase() === playerName.toLowerCase());
  if (!player) {
    console.log('Available players:', actors.filter(a => fight.friendlyPlayers?.includes(a.id)).map(a => `${a.name} (${a.subType})`).join(', '));
    throw new Error(`Player "${playerName}" not found`);
  }

  return { player, fight, actors };
}

// ── Step 2: Pull cast + healing data for a player ──────────────
async function pullPlayerData(reportCode, fightId, sourceID, playerName) {
  console.log(`  Pulling data for ${playerName} (sourceID ${sourceID}) from ${reportCode} fight ${fightId}...`);

  const [casts, healing, buffs] = await Promise.all([
    fetchAllEvents(reportCode, fightId, sourceID, 'Casts'),
    fetchAllEvents(reportCode, fightId, sourceID, 'Healing'),
    fetchAllEvents(reportCode, fightId, sourceID, 'Buffs'),
  ]);

  return { casts, healing, buffs };
}

// ── Step 3: Find top MW kills on LBV ──────────────────────────
async function findTopMWKills() {
  const data = await gql(`{
    worldData {
      encounter(id: 3180) {
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

  const rankings = data.worldData.encounter.characterRankings;
  return rankings.rankings.slice(0, 5).map(r => ({
    name: r.name,
    server: r.server?.name || r.server,
    reportCode: r.report?.code,
    fightId: r.report?.fightID,
    hps: Math.round(r.amount),
    duration: r.duration,
    rank: r.rank,
  }));
}

// ── Step 4: Pull top player data ──────────────────────────────
async function pullTopPlayerData(topPlayer) {
  const { reportCode, fightId, name } = topPlayer;

  // Get sourceID via playerDetails (more reliable)
  const data = await gql(`{
    reportData {
      report(code: "${reportCode}") {
        playerDetails(fightIDs: [${fightId}])
        fights(fightIDs: [${fightId}]) { id startTime endTime }
      }
    }
  }`);

  const details = data.reportData.report.playerDetails?.data?.playerDetails;
  const fight = data.reportData.report.fights[0];

  // Search across all roles for this player
  let sourceId = null;
  if (details) {
    for (const role of Object.values(details)) {
      if (!Array.isArray(role)) continue;
      for (const p of role) {
        if (p.name === name) { sourceId = p.id; break; }
      }
      if (sourceId) break;
    }
  }

  if (!sourceId) throw new Error(`Player ${name} not found in ${reportCode}`);

  const events = await pullPlayerData(reportCode, fightId, sourceId, name);

  return {
    ...topPlayer,
    sourceID: sourceId,
    fight: { startTime: fight.startTime, endTime: fight.endTime, duration: fight.endTime - fight.startTime },
    events,
  };
}

// ── Analysis functions ────────────────────────────────────────
function processCasts(events, fightStart, fightEnd) {
  const duration = (fightEnd - fightStart) / 1000;

  const casts = events.casts
    .filter(c => c.type === 'cast')
    .map(c => ({
      time: (c.timestamp - fightStart) / 1000,
      timestamp: c.timestamp,
      spellId: c.abilityGameID,
      name: MW_SPELLS[c.abilityGameID]?.name || spellName(c.abilityGameID),
      cat: MW_SPELLS[c.abilityGameID]?.cat || 'OTHER',
    }));

  return { casts, duration };
}

function buildHealingBreakdown(events, fightStart, fightEnd) {
  const duration = (fightEnd - fightStart) / 1000;
  const bd = {};
  for (const h of events.healing) {
    const name = MW_SPELLS[h.abilityGameID]?.name || spellName(h.abilityGameID);
    if (!bd[name]) bd[name] = { total: 0, overheal: 0, count: 0 };
    bd[name].total += (h.amount || 0);
    bd[name].overheal += (h.overheal || 0);
    bd[name].count++;
  }
  return { breakdown: bd, duration };
}

function pad(s, n) { return String(s).padStart(n); }
function padEnd(s, n) { return String(s).padEnd(n); }

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(120));
  console.log('  MW MONK ROTATION AUDIT: Senssay vs Top 5 Ranked — Mythic Lightblinded Vanguard');
  console.log('='.repeat(120));
  console.log();

  // Step 1: Get Josh's data from tonight
  console.log('  [1/4] Finding Senssay in tonight\'s report...');

  const reportData = await gql(`{
    reportData {
      report(code: "${REPORT_CODE}") {
        playerDetails(fightIDs: [${FIGHT_ID}])
        fights(fightIDs: [${FIGHT_ID}]) { id startTime endTime }
      }
    }
  }`);

  const details = reportData.reportData.report.playerDetails?.data?.playerDetails;
  const joshFight = reportData.reportData.report.fights[0];

  // Find Josh across all roles
  let joshPlayer = null;
  const JOSH_NAMES = ['senssay', 'mackspal'];
  if (details) {
    for (const role of Object.values(details)) {
      if (!Array.isArray(role)) continue;
      for (const p of role) {
        if (JOSH_NAMES.includes(p.name.toLowerCase())) {
          joshPlayer = p;
          break;
        }
      }
      if (joshPlayer) break;
    }
  }

  if (!joshPlayer) {
    // List everyone
    console.log('  Could not find Senssay/Mackspal. All players in fight:');
    for (const [role, players] of Object.entries(details || {})) {
      if (!Array.isArray(players)) continue;
      for (const p of players) {
        console.log(`    ${p.name} (${role}, ID:${p.id}, ${p.icon || p.type})`);
      }
    }
    throw new Error('Josh not found in fight');
  }

  console.log(`  Found: ${joshPlayer.name} (${joshPlayer.icon || joshPlayer.type}, sourceID ${joshPlayer.id})`);
  console.log(`  Fight #${FIGHT_ID}: ${((joshFight.endTime - joshFight.startTime) / 1000).toFixed(0)}s`);
  console.log();

  // Step 2: Pull Josh's cast data
  console.log('  [2/4] Pulling Senssay cast + healing data...');
  const joshEvents = await pullPlayerData(REPORT_CODE, FIGHT_ID, joshPlayer.id, joshPlayer.name);
  const joshProc = processCasts(joshEvents, joshFight.startTime, joshFight.endTime);
  const joshHealing = buildHealingBreakdown(joshEvents, joshFight.startTime, joshFight.endTime);
  console.log(`  Got ${joshEvents.casts.length} casts, ${joshEvents.healing.length} healing events`);
  console.log();

  // Step 3: Find top 5 MW kills
  console.log('  [3/4] Finding top 5 ranked MW Monk kills on Mythic LBV...');
  const topPlayers = await findTopMWKills();
  for (const tp of topPlayers) {
    console.log(`    #${tp.rank} ${tp.name}-${tp.server}: ${tp.hps} HPS (${(tp.duration / 1000).toFixed(0)}s)`);
  }
  console.log();

  // Step 4: Pull top player data
  console.log('  [4/4] Pulling cast data for top 5...');
  const topData = [];
  for (const tp of topPlayers) {
    try {
      const data = await pullTopPlayerData(tp);
      topData.push(data);
      console.log(`    ${tp.name}: ${data.events.casts.length} casts, ${data.events.healing.length} healing`);
    } catch (e) {
      console.log(`    ${tp.name}: FAILED - ${e.message}`);
    }
  }
  console.log();

  // Process top player data
  const topProcs = topData.map(td => ({
    ...td,
    proc: processCasts(td.events, td.fight.startTime, td.fight.endTime),
    healBd: buildHealingBreakdown(td.events, td.fight.startTime, td.fight.endTime),
  }));

  // ── PLAYER OVERVIEW ─────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  PLAYER OVERVIEW');
  console.log('='.repeat(120));
  console.log();

  const colW = 16;
  const allPlayers = [...topProcs, { name: joshPlayer.name, hps: '??', proc: joshProc, healBd: joshHealing, isJosh: true }];

  let header = '  ' + padEnd('', 22);
  for (const p of allPlayers) header += '  ' + pad(p.name, colW);
  console.log(header);
  console.log('  ' + '-'.repeat(22 + allPlayers.length * (colW + 2)));

  // HPS row
  {
    let row = '  ' + padEnd('HPS (ranked)', 22);
    for (const p of allPlayers) {
      if (p.isJosh) {
        const totalHealing = Object.values(p.healBd.breakdown).reduce((s, v) => s + v.total, 0);
        row += '  ' + pad(Math.round(totalHealing / p.healBd.duration), colW);
      } else {
        row += '  ' + pad(p.hps, colW);
      }
    }
    console.log(row);
  }

  // Duration row
  {
    let row = '  ' + padEnd('Fight Duration', 22);
    for (const p of allPlayers) {
      row += '  ' + pad(p.proc.duration.toFixed(0) + 's', colW);
    }
    console.log(row);
  }

  // Total casts row
  {
    let row = '  ' + padEnd('Total Casts', 22);
    for (const p of allPlayers) {
      row += '  ' + pad(p.proc.casts.length, colW);
    }
    console.log(row);
  }

  // CPM row
  {
    let row = '  ' + padEnd('Total CPM', 22);
    for (const p of allPlayers) {
      row += '  ' + pad((p.proc.casts.length / (p.proc.duration / 60)).toFixed(1), colW);
    }
    console.log(row);
  }

  // Total healing row
  {
    let row = '  ' + padEnd('Total Healing', 22);
    for (const p of allPlayers) {
      const total = Object.values(p.healBd.breakdown).reduce((s, v) => s + v.total, 0);
      row += '  ' + pad((total / 1e6).toFixed(1) + 'M', colW);
    }
    console.log(row);
  }

  // Overheal % row
  {
    let row = '  ' + padEnd('Overheal %', 22);
    for (const p of allPlayers) {
      const total = Object.values(p.healBd.breakdown).reduce((s, v) => s + v.total, 0);
      const oh = Object.values(p.healBd.breakdown).reduce((s, v) => s + v.overheal, 0);
      const pct = total + oh > 0 ? ((oh / (total + oh)) * 100).toFixed(1) : '0.0';
      row += '  ' + pad(pct + '%', colW);
    }
    console.log(row);
  }

  // Check for early deaths
  for (const p of allPlayers) {
    const lastCast = p.proc.casts[p.proc.casts.length - 1];
    if (lastCast && lastCast.time < p.proc.duration * 0.7) {
      const tag = p.isJosh ? ' <-- YOU' : '';
      console.log(`  *** ${p.name} stopped casting at ~${lastCast.time.toFixed(0)}s (fight lasted ${p.proc.duration.toFixed(0)}s) — likely died${tag}`);
    }
  }

  console.log();

  // ── CPM COMPARISON ──────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  CASTS PER MINUTE (CPM) COMPARISON');
  console.log('='.repeat(120));
  console.log();

  {
    let header = '  ' + padEnd('Spell', 25);
    for (const p of allPlayers) header += '  ' + pad(p.name, colW);
    console.log(header);
    console.log('  ' + '-'.repeat(25 + allPlayers.length * (colW + 2)));

    for (const spell of KEY_SPELLS) {
      let row = '  ' + padEnd(`${spell.name} [${spell.cat}]`, 25);
      let anyNonZero = false;
      for (const p of allPlayers) {
        const count = p.proc.casts.filter(c => spell.ids.includes(c.spellId)).length;
        if (count > 0) anyNonZero = true;
        const cpm = (count / (p.proc.duration / 60)).toFixed(1);
        row += '  ' + pad(`${count} (${cpm})`, colW);
      }
      if (anyNonZero) console.log(row);
    }

    // Total
    console.log('  ' + '-'.repeat(25 + allPlayers.length * (colW + 2)));
    let totalRow = '  ' + padEnd('TOTAL CASTS', 25);
    for (const p of allPlayers) {
      const total = p.proc.casts.length;
      const cpm = (total / (p.proc.duration / 60)).toFixed(1);
      totalRow += '  ' + pad(`${total} (${cpm})`, colW);
    }
    console.log(totalRow);

    // Melee
    let meleeRow = '  ' + padEnd('Melee (auto)', 25);
    for (const p of allPlayers) {
      const count = p.proc.casts.filter(c => c.spellId === 1).length;
      const cpm = (count / (p.proc.duration / 60)).toFixed(1);
      meleeRow += '  ' + pad(`${count} (${cpm})`, colW);
    }
    console.log(meleeRow);
  }
  console.log();

  // ── HEALING BREAKDOWN ───────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  HEALING BREAKDOWN (top spells by HPS)');
  console.log('='.repeat(120));
  console.log();

  {
    // Collect all healing spell names
    const allHealSpells = new Set();
    for (const p of allPlayers) {
      Object.keys(p.healBd.breakdown).forEach(k => allHealSpells.add(k));
    }

    const spellList = [...allHealSpells]
      .map(name => ({
        name,
        maxTotal: Math.max(...allPlayers.map(p => p.healBd.breakdown[name]?.total || 0)),
      }))
      .filter(s => s.maxTotal > 50000)
      .sort((a, b) => b.maxTotal - a.maxTotal)
      .slice(0, 20);

    let header = '  ' + padEnd('Spell', 30);
    for (const p of allPlayers) header += '  ' + pad(p.name, colW);
    console.log(header);
    console.log('  ' + '-'.repeat(30 + allPlayers.length * (colW + 2)));

    for (const spell of spellList) {
      let row = '  ' + padEnd(spell.name, 30);
      for (const p of allPlayers) {
        const bd = p.healBd.breakdown[spell.name];
        if (bd && bd.total > 0) {
          const hps = (bd.total / p.healBd.duration).toFixed(0);
          const ohPct = bd.total + bd.overheal > 0
            ? ((bd.overheal / (bd.total + bd.overheal)) * 100).toFixed(0) : '0';
          row += '  ' + pad(`${hps} (${ohPct}%oh)`, colW);
        } else {
          row += '  ' + pad('-', colW);
        }
      }
      console.log(row);
    }

    // Total HPS
    console.log('  ' + '-'.repeat(30 + allPlayers.length * (colW + 2)));
    let totalRow = '  ' + padEnd('TOTAL HPS', 30);
    for (const p of allPlayers) {
      const total = Object.values(p.healBd.breakdown).reduce((s, v) => s + v.total, 0);
      totalRow += '  ' + pad(Math.round(total / p.healBd.duration), colW);
    }
    console.log(totalRow);
  }
  console.log();

  // ── CD TIMING ───────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  COOLDOWN USAGE TIMING');
  console.log('='.repeat(120));
  console.log();

  const cdSpellGroups = [
    { ids: [115310, 388615], name: 'Revival/Restoral (3min)' },
    { ids: [322118], name: 'Invoke Yu\'lon (2min)' },
    { ids: [325197], name: 'Invoke Chi-Ji (2min)' },
    { ids: [443028], name: 'Celestial Conduit (90s)' },
    { ids: [116849], name: 'Life Cocoon (2min)' },
    { ids: [325216], name: 'Bonedust Brew' },
    { ids: [116680], name: 'Thunder Focus Tea' },
  ];

  for (const cd of cdSpellGroups) {
    let anyUsed = false;
    for (const p of allPlayers) {
      if (p.proc.casts.some(c => cd.ids.includes(c.spellId))) { anyUsed = true; break; }
    }
    if (!anyUsed) continue;

    console.log(`  ${cd.name}:`);
    for (const p of allPlayers) {
      const uses = p.proc.casts.filter(c => cd.ids.includes(c.spellId));
      const timings = uses.map(c => c.time.toFixed(0) + 's').join(', ') || 'NEVER';
      const gaps = [];
      for (let i = 1; i < uses.length; i++) gaps.push((uses[i].time - uses[i-1].time).toFixed(0));
      const gapStr = gaps.length > 0 ? ` (gaps: ${gaps.join('s, ')}s)` : '';
      const tag = p.isJosh ? ' <-- YOU' : '';
      console.log(`    ${padEnd(p.name, 16)}: ${uses.length}x at ${timings}${gapStr}${tag}`);
    }
    console.log();
  }

  // ── DEAD TIME ANALYSIS ──────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  DEAD TIME ANALYSIS (gaps between casts > 2.5s)');
  console.log('='.repeat(120));
  console.log();

  for (const p of allPlayers) {
    const casts = p.proc.casts.filter(c => c.cat !== 'AUTO' && c.cat !== 'MOVE');
    let deadGaps = [];
    let totalDeadTime = 0;

    for (let i = 1; i < casts.length; i++) {
      const gap = casts[i].time - casts[i-1].time;
      if (gap > 2.5) {
        deadGaps.push({ start: casts[i-1].time, end: casts[i].time, gap, before: casts[i-1].name, after: casts[i].name });
        totalDeadTime += gap - 1.5; // subtract 1 GCD
      }
    }

    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${p.name}${tag}:`);
    console.log(`    Total dead time: ${totalDeadTime.toFixed(1)}s (${(totalDeadTime / p.proc.duration * 100).toFixed(1)}% of fight)`);
    console.log(`    Dead gaps (>2.5s): ${deadGaps.length}`);

    // Show worst gaps
    const worstGaps = deadGaps.sort((a, b) => b.gap - a.gap).slice(0, 5);
    for (const g of worstGaps) {
      console.log(`      ${g.start.toFixed(0)}s-${g.end.toFixed(0)}s (${g.gap.toFixed(1)}s gap) — after ${g.before}, before ${g.after}`);
    }
    console.log();
  }

  // ── RENEWING MIST UPTIME ────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  RENEWING MIST MANAGEMENT');
  console.log('  ReM is MW\'s most important spell — it enables Vivify cleave and feeds mastery');
  console.log('='.repeat(120));
  console.log();

  for (const p of allPlayers) {
    const remCasts = p.proc.casts.filter(c => c.spellId === 115151);
    const cpm = (remCasts.length / (p.proc.duration / 60)).toFixed(1);
    const gaps = [];
    for (let i = 1; i < remCasts.length; i++) gaps.push(remCasts[i].time - remCasts[i-1].time);
    const avgGap = gaps.length > 0 ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : 'N/A';
    const maxGap = gaps.length > 0 ? Math.max(...gaps).toFixed(1) : 'N/A';

    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.name, 16)}${tag}: ${remCasts.length} casts (${cpm}/min), avg gap ${avgGap}s, max gap ${maxGap}s`);
  }
  console.log();

  // ── VIVIFY EFFICIENCY ───────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  VIVIFY USAGE');
  console.log('  Vivify cleaves to targets with Renewing Mist — more ReM = more Vivify value');
  console.log('='.repeat(120));
  console.log();

  for (const p of allPlayers) {
    const vivCasts = p.proc.casts.filter(c => c.spellId === 116670);
    const cpm = (vivCasts.length / (p.proc.duration / 60)).toFixed(1);
    const vivHealing = p.healBd.breakdown['Vivify'];
    const hps = vivHealing ? (vivHealing.total / p.healBd.duration).toFixed(0) : '0';
    const ohPct = vivHealing && (vivHealing.total + vivHealing.overheal > 0)
      ? ((vivHealing.overheal / (vivHealing.total + vivHealing.overheal)) * 100).toFixed(0) : '0';

    const tag = p.isJosh ? ' <-- YOU' : '';
    console.log(`  ${padEnd(p.name, 16)}${tag}: ${vivCasts.length} casts (${cpm}/min), ${hps} HPS, ${ohPct}% overheal`);
  }
  console.log();

  // ── ROTATION PATTERN (30s windows) ──────────────────────────
  console.log('='.repeat(120));
  console.log('  ROTATION TIMELINE — 30-SECOND WINDOWS (Josh vs #1 ranked)');
  console.log('='.repeat(120));
  console.log();

  const josh = allPlayers.find(p => p.isJosh);
  const top1 = topProcs[0];

  if (top1) {
    const maxTime = Math.max(josh.proc.duration, top1.proc.duration);
    const windowSize = 30;
    const numWindows = Math.ceil(maxTime / windowSize);

    for (let i = 0; i < numWindows; i++) {
      const winStart = i * windowSize;
      const winEnd = Math.min((i + 1) * windowSize, maxTime);

      console.log(`  === ${winStart}s - ${winEnd.toFixed(0)}s ${'='.repeat(90)}`);

      for (const p of [top1, josh]) {
        if (winStart > p.proc.duration) continue;
        const winCasts = p.proc.casts.filter(c => c.time >= winStart && c.time < winEnd);
        if (winCasts.length === 0) continue;

        const heals = winCasts.filter(c => c.cat === 'HEAL' || c.cat === 'HOT').length;
        const dps = winCasts.filter(c => c.cat === 'DPS').length;
        const cds = winCasts.filter(c => c.cat === 'CD');
        const tag = p.isJosh ? ' <-- YOU' : '';

        console.log(`  ${padEnd(p.name, 14)}: ${heals}heal/${dps}dps/${cds.length}cd${tag}`);

        if (cds.length > 0) {
          console.log(`  ${' '.repeat(16)}CDs: ${cds.map(c => c.name + ' @' + c.time.toFixed(0) + 's').join(', ')}`);
        }

        // Abbreviated cast sequence
        const seq = winCasts.map(c => {
          if (c.spellId === 116670) return 'Viv';
          if (c.spellId === 124682) return 'EM';
          if (c.spellId === 115151) return 'ReM';
          if (c.spellId === 191837) return 'EF';
          if (c.spellId === 100780) return 'TP';
          if ([100784, 228649, 205523].includes(c.spellId)) return 'BOK';
          if ([107428, 185099].includes(c.spellId)) return 'RSK';
          if (c.spellId === 101546) return 'SCK';
          if ([388193, 327104].includes(c.spellId)) return 'JFS';
          if (c.spellId === 123986) return 'CB';
          if (c.spellId === 116680) return 'TFT';
          if (c.spellId === 443028) return 'CC';
          if ([115310, 388615].includes(c.spellId)) return 'REV';
          if (c.spellId === 322118) return 'YUL';
          if (c.spellId === 325197) return 'CHJ';
          if (c.spellId === 116849) return 'LC';
          if (c.spellId === 325216) return 'BDB';
          if (c.spellId === 1) return 'mel';
          return c.name.substring(0, 4);
        }).join(' ');

        console.log(`  ${' '.repeat(16)}${seq}`);
      }
      console.log();
    }
  }

  // ── PATTERN ANALYSIS ────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  PATTERN ANALYSIS: What Top 5 Do That You Don\'t');
  console.log('='.repeat(120));
  console.log();

  const joshDur = josh.proc.duration / 60;

  function joshCPM(ids) {
    return josh.proc.casts.filter(c => ids.includes(c.spellId)).length / joshDur;
  }

  function topAvgCPM(ids) {
    return topProcs.map(p => p.proc.casts.filter(c => ids.includes(c.spellId)).length / (p.proc.duration / 60))
      .reduce((a, b) => a + b, 0) / topProcs.length;
  }

  const patterns = [];

  // Total CPM
  const joshTotalCPM = josh.proc.casts.length / joshDur;
  const topAvgTotalCPM = topProcs.map(p => p.proc.casts.length / (p.proc.duration / 60)).reduce((a, b) => a + b, 0) / topProcs.length;
  if (joshTotalCPM < topAvgTotalCPM * 0.9) {
    patterns.push({
      title: 'LOWER OVERALL ACTIVITY',
      detail: `Your CPM: ${joshTotalCPM.toFixed(1)} | Top 5 avg: ${topAvgTotalCPM.toFixed(1)} — ${((1 - joshTotalCPM / topAvgTotalCPM) * 100).toFixed(0)}% fewer casts/min`,
    });
  }

  // Renewing Mist
  const joshRemCPM = joshCPM([115151]);
  const topRemCPM = topAvgCPM([115151]);
  if (joshRemCPM < topRemCPM * 0.8) {
    patterns.push({
      title: 'NOT ENOUGH RENEWING MIST',
      detail: `Your ReM CPM: ${joshRemCPM.toFixed(1)} | Top 5 avg: ${topRemCPM.toFixed(1)} — ReM enables Vivify cleave + feeds mastery. Keep it rolling.`,
    });
  }

  // Vivify
  const joshVivCPM = joshCPM([116670]);
  const topVivCPM = topAvgCPM([116670]);
  if (joshVivCPM < topVivCPM * 0.7) {
    patterns.push({
      title: 'LOW VIVIFY USAGE',
      detail: `Your Vivify CPM: ${joshVivCPM.toFixed(1)} | Top 5 avg: ${topVivCPM.toFixed(1)} — Vivify is your bread-and-butter heal`,
    });
  }

  // RSK
  const joshRskCPM = joshCPM([107428, 185099]);
  const topRskCPM = topAvgCPM([107428, 185099]);
  if (joshRskCPM < topRskCPM * 0.7) {
    patterns.push({
      title: 'LOW RISING SUN KICK USAGE',
      detail: `Your RSK CPM: ${joshRskCPM.toFixed(1)} | Top 5 avg: ${topRskCPM.toFixed(1)} — RSK heals through Ancient Teachings + resets TFT`,
    });
  }

  // BOK
  const joshBokCPM = joshCPM([100784, 228649, 205523]);
  const topBokCPM = topAvgCPM([100784, 228649, 205523]);
  if (joshBokCPM < topBokCPM * 0.7) {
    patterns.push({
      title: 'LOW BLACKOUT KICK USAGE',
      detail: `Your BOK CPM: ${joshBokCPM.toFixed(1)} | Top 5 avg: ${topBokCPM.toFixed(1)} — BOK heals through Ancient Teachings`,
    });
  }

  // Tiger Palm
  const joshTpCPM = joshCPM([100780]);
  const topTpCPM = topAvgCPM([100780]);
  if (joshTpCPM > topTpCPM * 1.5 && topTpCPM > 0) {
    patterns.push({
      title: 'TOO MANY TIGER PALMS',
      detail: `Your TP CPM: ${joshTpCPM.toFixed(1)} | Top 5 avg: ${topTpCPM.toFixed(1)} — TP is lowest priority filler. Each TP could be a Vivify/RSK/BOK.`,
    });
  }

  // Thunder Focus Tea
  const joshTftCPM = joshCPM([116680]);
  const topTftCPM = topAvgCPM([116680]);
  if (joshTftCPM < topTftCPM * 0.7) {
    patterns.push({
      title: 'UNDERUSING THUNDER FOCUS TEA',
      detail: `Your TFT CPM: ${joshTftCPM.toFixed(1)} | Top 5 avg: ${topTftCPM.toFixed(1)} — TFT is a 30s CD. Use on CD for free ReM/Vivify.`,
    });
  }

  // Celestial Conduit
  const joshCcCount = josh.proc.casts.filter(c => c.spellId === 443028).length;
  const topCcAvg = topProcs.map(p => p.proc.casts.filter(c => c.spellId === 443028).length).reduce((a, b) => a + b, 0) / topProcs.length;
  if (joshCcCount < topCcAvg * 0.7 && topCcAvg > 0) {
    patterns.push({
      title: 'UNDERUSING CELESTIAL CONDUIT',
      detail: `Your CC uses: ${joshCcCount} | Top 5 avg: ${topCcAvg.toFixed(1)} — 90s CD, should get ${Math.floor(josh.proc.duration / 90)} uses in a ${josh.proc.duration.toFixed(0)}s fight`,
    });
  }

  // Yu'lon / Chi-Ji
  const joshYulCount = josh.proc.casts.filter(c => [322118, 325197].includes(c.spellId)).length;
  const topYulAvg = topProcs.map(p => p.proc.casts.filter(c => [322118, 325197].includes(c.spellId)).length).reduce((a, b) => a + b, 0) / topProcs.length;
  if (joshYulCount < topYulAvg * 0.7 && topYulAvg > 0) {
    patterns.push({
      title: 'UNDERUSING YU\'LON / CHI-JI',
      detail: `Your Celestial uses: ${joshYulCount} | Top 5 avg: ${topYulAvg.toFixed(1)} — 2min CD, align with damage windows`,
    });
  }

  if (patterns.length > 0) {
    for (let i = 0; i < patterns.length; i++) {
      console.log(`  ${i + 1}. ${patterns[i].title}`);
      console.log(`     ${patterns[i].detail}`);
      console.log();
    }
  } else {
    console.log('  No major pattern differences found — rotation may be solid, issue could be fight-specific.');
  }

  // ── TL;DR ───────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('  TL;DR — ACTIONABLE CHANGES (ranked by likely impact)');
  console.log('='.repeat(120));
  console.log();

  // Sort patterns by impact
  for (let i = 0; i < Math.min(patterns.length, 6); i++) {
    const letters = 'ABCDEF';
    console.log(`  ${letters[i]}) ${patterns[i].title}`);
    console.log(`     ${patterns[i].detail}`);
    console.log();
  }

  console.log('='.repeat(120));
  console.log('  END OF MW MONK ROTATION AUDIT');
  console.log('='.repeat(120));

  // Save output data for reference
  const outDir = join(__dirname, 'data', REPORT_CODE);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `mw-audit-fight${FIGHT_ID}.json`), JSON.stringify({
    report: REPORT_CODE,
    fight: FIGHT_ID,
    player: joshPlayer,
    fightTimes: joshFight,
    castCount: joshEvents.casts.length,
    healingCount: joshEvents.healing.length,
    topPlayers: topPlayers.map(tp => ({ name: tp.name, server: tp.server, hps: tp.hps, rank: tp.rank })),
  }, null, 2));
  console.log(`\n  Data saved to ${outDir}/mw-audit-fight${FIGHT_ID}.json`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
