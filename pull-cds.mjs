import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';

const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

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
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`GraphQL failed: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Boss abilities by encounter (for correlating CDs to damage events)
const BOSS_ABILITY_SETS = {
  salhadaar: {
    1285211: 'Dark Radiation', 1250991: 'Dark Radiation', 1285504: 'Dark Radiation',
    1246175: 'Entropic Unraveling', 1254018: 'Entropic Unraveling',
    1260030: 'Umbral Beams', 1250686: 'Twisting Obscurity',
    1245592: 'Torturous Extract', 1250828: 'Void Exposure',
    1253032: 'Shattering Twilight', 1250803: 'Shattering Twilight', 1262989: 'Shattering Twilight',
    1251213: 'Twilight Spikes', 1260823: 'Despotic Command', 1248697: 'Despotic Command',
    1254081: 'Fractured Projection', 1254092: 'Attuned to the Nether',
    1254088: 'Shadow Fracture', 1243453: 'Void Convergence', 1248709: 'Oppressive Darkness',
  },
  ve: {
    1285954: 'Nullzone Implosion', 1252157: 'Nullzone Implosion',
    1244413: 'Nullsnap', 1244672: 'Nullzone',
    1262623: 'Nullbeam', 1262651: 'Nullbeam', 1283856: 'Nullbeam', 1262688: 'Nullbeam',
    1245302: 'Void Howl', 1244917: 'Void Howl',
    1245175: 'Voidbolt',
    1245500: 'Gloom', 1245391: 'Gloom', 1283712: 'Gloomtouched', 1283711: 'Gloomtouched',
    1250071: 'Midnight Flames', 1249748: 'Midnight Flames',
    1259275: 'Midnight Manifestation', 1258744: 'Midnight Manifestation',
    1244221: 'Dread Breath', 1244225: 'Dread Breath', 1255979: 'Dread Breath',
    1270497: 'Shadowmark', 1270513: 'Shadowmark', 1270516: 'Shadowmark',
    1265131: 'Vaelwing', 1280434: 'Vaelwing', 1265143: 'Vaelwing', 1265139: 'Vaelwing',
    1245645: 'Rakfang', 1245647: 'Rakfang', 1245652: 'Rakfang',
    1263623: 'Cosmosis', 1263626: 'Cosmosis',
    1264467: 'Tail Lash', 1265152: 'Impale',
    1266570: 'Nullscatter',
  },
  averzian: {},
  vorasius: {},
  chimaerus: {},
  lbv: {},
  cosmos: {},
};

const TARGET_SETS = {
  salhadaar: [
    { code: 'kWtChn3w6r9LKcFZ', fightId: 2,  label: 'Gordunni (EU-RU) — 302s' },
    { code: 'dycaw2tk1FrPHG9v', fightId: 17, label: 'Archimonde (EU-FR) — 304s' },
    { code: 'JYky1AzQqVxdfrPg', fightId: 35, label: 'Area52 (NA) — 310s' },
    { code: 'vrFCKRW9VHfpnjMJ', fightId: 30, label: 'Sargeras (NA) — 321s' },
    { code: 'mCMvAhy4xVN68Zwf', fightId: 17, label: 'Frostmourne (OCE) — 350s' },
  ],
  averzian: [
    { code: 'L6zZcwdjCH3GqMQJ', fightId: 2,  label: 'Frostmane (EU) — 306s' },
    { code: 'Rjrpz7Xg2cdqHZTW', fightId: 13, label: '燃烧之刃 (CN) — 308s' },
    { code: '3dXQ1p9xNhtZYgJb', fightId: 42, label: '迅捷微风 (CN) — 310s' },
    { code: 'kFrgH3CDznmYZ6t2', fightId: 28, label: '罗宁 (CN) — 329s' },
    { code: 'yNgHh2Z1pGPLqbV8', fightId: 17, label: '金色平原 (CN) — 378s' },
  ],
  ve: [
    { code: 'mtJnrPkdGWjMzQ6y', fightId: 40, label: 'Hyjal (EU-FR) — 397s' },
    { code: 'kWtChn3w6r9LKcFZ', fightId: 7,  label: 'Gordunni (EU-RU) — 399s' },
    { code: 'b8hRNHAgPK3qca1M', fightId: 16, label: 'Blackhand (EU) — 402s' },
    { code: '1LG7Nrw3BZThAt9W', fightId: 33, label: 'Ysondre (EU-FR) — 406s' },
    { code: 'C42df6Ybj7gzVH8F', fightId: 32, label: 'Illidan (NA) — 427s' },
  ],
  vorasius: [
    { code: 'vrFCKRW9VHfpnjMJ', fightId: 25, label: 'Sargeras (US) — 293s' },
    { code: 'kFrgH3CDznmYZ6t2', fightId: 32, label: '罗宁 (CN) — 325s' },
    { code: 'V8MybCjvtkrnG79W', fightId: 12, label: 'Frostmane (EU) — 330s' },
    { code: '7FVMGmZayYAvLxct', fightId: 17, label: '迅捷微风 (CN) — 334s' },
    { code: 'PGVhzHYmcLCj2DAN', fightId: 39, label: 'Antonidas (EU) — 339s' },
  ],
  chimaerus: [
    { code: 'QNP3LAZBmaxMHCcT', fightId: 6,  label: 'Kazzak (EU) — 348s' },
    { code: 'L6zZcwdjCH3GqMQJ', fightId: 20, label: 'Frostmane (EU) — 355s' },
    { code: 'yD4azXngJVAYf6vq', fightId: 8,  label: 'Blackmoore (EU) — 357s' },
    { code: 'zZrxNkftXDnKPwQ3', fightId: 30, label: "Zul'jin (US) — 368s" },
    { code: '1fGqNC3mvLRjy2kP', fightId: 1,  label: '罗宁 (CN) — 384s' },
  ],
  lbv: [
    { code: 'RJtvkayqwQG7bY1K', fightId: 41, label: 'Area52 (US) — 397s' },
    { code: 'YDRC4QjfZqXKa9cV', fightId: 36, label: 'Area52 (US) #2 — 398s' },
    { code: 'Kf7XFZ3NAjdBTWPm', fightId: 30, label: 'Ravencrest (EU) — 402s' },
    { code: 'aBdf89HDpKy27n6M', fightId: 24, label: 'Illidan (US) — 408s' },
    { code: 'zRgJW2fFvpHQCtbr', fightId: 34, label: 'Blackmoore (EU) — 410s' },
  ],
  cosmos: [
    { code: 'GW2xnNP3Fzbm6LMp', fightId: 21, label: 'Team 1 (EU) — 518s' },
    { code: 'H6p73kJvh2xQzNyF', fightId: 70, label: 'Team 2 (EU) — 520s' },
    { code: 'Fj476pJw8PRv1Lmd', fightId: 58, label: 'Team 3 (CN) — 521s' },
    { code: 'Fj476pJw8PRv1Lmd', fightId: 16, label: 'Team 4 (CN) — 521s' },
    { code: 'm1pnRaNHvPGFXwYC', fightId: 22, label: 'Team 5 (CN) — 522s' },
  ],
};

const boss = process.argv[2] || 'salhadaar';
const BOSS_ABILITIES = BOSS_ABILITY_SETS[boss];
const TARGETS = TARGET_SETS[boss];
if (!BOSS_ABILITIES || !TARGETS) {
  console.error(`Unknown boss: ${boss}. Options: ${Object.keys(TARGET_SETS).join(', ')}`);
  process.exit(1);
}

const BOSS_IDS = Object.keys(BOSS_ABILITIES).map(Number);

// Max casts per fight to qualify as a CD (not rotational)
const CD_MAX_CASTS = 8;

async function fetchEvents(code, fightId, filterExpr, { sourceID, startTimestamp } = {}) {
  let allEvents = [];
  let nextPage = startTimestamp || null;
  while (true) {
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const sourceFilter = sourceID ? `sourceID: ${sourceID},` : '';
    const data = await gql(`
      query ($code: String!) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: [${fightId}]
              ${sourceFilter}
              filterExpression: "${filterExpr}"
              ${timeFilter}
              limit: 10000
            ) { data nextPageTimestamp }
          }
        }
      }
    `, { code });
    const result = data.reportData.report.events;
    if (result.data?.length > 0) allEvents = allEvents.concat(result.data);
    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }
  return allEvents;
}

function normalizeSpec(icon) {
  const map = {
    'Paladin-Holy': 'HPal', 'Shaman-Restoration': 'RSham', 'Monk-Mistweaver': 'MW',
    'Evoker-Preservation': 'PEvo', 'Evoker-Augmentation': 'Aug', 'Evoker-Devastation': 'Dev',
    'DeathKnight-Blood': 'BDK', 'DeathKnight-Frost': 'FDK', 'DeathKnight-Unholy': 'UDK',
    'DemonHunter-Havoc': 'HDH', 'DemonHunter-Vengeance': 'VDH',
    'Warrior-Arms': 'War', 'Warrior-Fury': 'War', 'Warrior-Protection': 'ProtWar',
    'Priest-Shadow': 'SPri', 'Priest-Discipline': 'Disc', 'Priest-Holy': 'HPri',
    'Paladin-Retribution': 'Ret', 'Paladin-Protection': 'ProtPal',
    'Druid-Restoration': 'RDru', 'Druid-Balance': 'Bal', 'Druid-Feral': 'Feral', 'Druid-Guardian': 'Bear',
    'Hunter-BeastMastery': 'BM', 'Hunter-Marksmanship': 'MM', 'Hunter-Survival': 'Surv',
    'Mage-Arcane': 'Arc', 'Mage-Fire': 'Fire', 'Mage-Frost': 'FMage',
    'Rogue-Assassination': 'Sin', 'Rogue-Outlaw': 'Outlaw', 'Rogue-Subtlety': 'Sub',
    'Warlock-Affliction': 'Aff', 'Warlock-Demonology': 'Demo', 'Warlock-Destruction': 'Destro',
    'Monk-Windwalker': 'WW', 'Monk-Brewmaster': 'BrM',
    'Shaman-Elemental': 'Ele', 'Shaman-Enhancement': 'Enh',
  };
  return map[icon] || icon;
}

function fmt(ms) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`;
}

async function analyzeReport(target) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEAM: ${target.label}`);
  console.log(`Report: ${target.code}  Fight: ${target.fightId}`);
  console.log(`${'='.repeat(80)}`);

  const reportInfo = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          title
          masterData { abilities { gameID name } }
          fights(fightIDs: [${target.fightId}]) {
            id name kill startTime endTime difficulty
          }
          playerDetails(fightIDs: [${target.fightId}])
        }
      }
    }
  `, { code: target.code });

  const report = reportInfo.reportData.report;
  const fight = report.fights[0];
  if (!fight) { console.log('Fight not found!'); return null; }

  // Build ability name map from masterData
  const abilityMap = {};
  for (const a of (report.masterData?.abilities || [])) {
    abilityMap[a.gameID] = a.name;
  }

  const fightDur = fight.endTime - fight.startTime;
  console.log(`Duration: ${(fightDur / 1000).toFixed(0)}s | Kill: ${fight.kill}`);

  let pd = report.playerDetails;
  if (typeof pd === 'string') pd = JSON.parse(pd);
  const inner = pd?.data?.playerDetails || pd?.playerDetails || pd;

  // Build map of ALL players
  const allPlayers = {};
  const healerIds = new Set();
  for (const role of ['healers', 'tanks', 'dps']) {
    for (const p of (inner?.[role] || [])) {
      const spec = normalizeSpec(p.icon);
      allPlayers[p.id] = { name: p.name, id: p.id, server: p.server, spec, role };
      if (role === 'healers') healerIds.add(p.id);
    }
  }

  const healers = Object.values(allPlayers).filter(p => healerIds.has(p.id));
  console.log(`Healers: ${healers.map(h => `${h.spec}:${h.name}`).join(' | ')}`);

  // ── STEP 1: Pull ALL casts per-player to ensure full fight coverage ──
  console.log(`\nPulling casts per player (${Object.keys(allPlayers).length} players)...`);
  let allHealerCasts = [];
  let allNonHealerCasts = [];
  for (const [id, player] of Object.entries(allPlayers)) {
    const casts = await fetchEvents(target.code, target.fightId,
      `type = 'cast'`, { sourceID: Number(id) });
    if (healerIds.has(Number(id))) {
      allHealerCasts = allHealerCasts.concat(casts);
    } else {
      allNonHealerCasts = allNonHealerCasts.concat(casts);
    }
  }
  console.log(`  Healers: ${allHealerCasts.length} | Non-healers: ${allNonHealerCasts.length}`);

  // ── STEP 3: Group by player + ability, count frequency ──
  function groupCasts(casts) {
    const groups = {};
    for (const evt of casts) {
      const player = allPlayers[evt.sourceID];
      if (!player) continue;
      const key = `${evt.sourceID}-${evt.abilityGameID}`;
      if (!groups[key]) {
        groups[key] = {
          player: player.name, spec: player.spec, role: player.role,
          abilityId: evt.abilityGameID,
          abilityName: abilityMap[evt.abilityGameID] || `Unknown(${evt.abilityGameID})`,
          casts: [],
        };
      }
      groups[key].casts.push(evt.timestamp - fight.startTime);
    }
    return groups;
  }

  const healerGroups = groupCasts(allHealerCasts);
  const nonHealerGroups = groupCasts(allNonHealerCasts);

  // ── STEP 4: Identify CDs (low frequency = CD, high frequency = rotational) ──
  function extractCDs(groups, maxCasts = CD_MAX_CASTS) {
    const cds = [];
    for (const g of Object.values(groups)) {
      if (g.casts.length <= maxCasts && g.casts.length >= 1) {
        cds.push(g);
      }
    }
    return cds.sort((a, b) => a.casts.length - b.casts.length);
  }

  const healerCDs = extractCDs(healerGroups);
  const nonHealerCDs = extractCDs(nonHealerGroups);

  // ── STEP 5: Print healer CD discoveries ──
  console.log(`\n── HEALER CDs DISCOVERED (≤${CD_MAX_CASTS} casts = likely a CD) ──`);
  for (const spec of [...new Set(healers.map(h => h.spec))]) {
    const specCDs = healerCDs.filter(c => c.spec === spec);
    if (specCDs.length === 0) continue;
    console.log(`\n  ${spec} (${specCDs[0].player}):`);
    for (const cd of specCDs.sort((a, b) => a.casts.length - b.casts.length)) {
      const timings = cd.casts.map(t => fmt(t)).join(', ');
      console.log(`    [${cd.casts.length}x] ${cd.abilityName} (${cd.abilityId}) — ${timings}`);
    }
  }

  // ── STEP 6: Print non-healer raid utility CD discoveries ──
  // Only show abilities cast ≤3 times (true CDs from non-healers, not rotational)
  // Skip known noise: movement, melee, trinkets, potions, interrupts, taunts
  const NOISE_IDS = new Set([
    1, // Melee
    69070, 58984, 20549, 20572, 28730, 33697, 68992, 255654, // Racials
    6262, 1234768, 1236648, 1260459, // Potions/healthstones/trinkets
    355, 56222, 6552, 47528, 183752, 15487, 57994, 91800, 106839, // Taunts/interrupts
    100, 52174, 126664, 2645, 358733, 109132, 781, 1953, 36554, 198793, 195072, // Movement
    48265, 190784, 192063, // Movement CDs
  ]);
  console.log(`\n── NON-HEALER RAID CDs (≤3 casts, noise filtered) ──`);
  const raidUtilityCDs = nonHealerCDs.filter(c =>
    c.casts.length <= 3 && !NOISE_IDS.has(c.abilityId));
  const bySpec = {};
  for (const cd of raidUtilityCDs) {
    if (!bySpec[cd.spec]) bySpec[cd.spec] = [];
    bySpec[cd.spec].push(cd);
  }
  for (const [spec, cds] of Object.entries(bySpec).sort()) {
    console.log(`\n  ${spec}:`);
    for (const cd of cds.sort((a, b) => a.casts.length - b.casts.length)) {
      const timings = cd.casts.map(t => fmt(t)).join(', ');
      console.log(`    [${cd.casts.length}x] ${cd.abilityName} (${cd.abilityId}) — ${timings} (${cd.player})`);
    }
  }

  // ── STEP 7: Pull boss events ──
  const bossIdList = BOSS_IDS.join(',');
  const bossEvents = await fetchEvents(target.code, target.fightId,
    `type IN ('cast','begincast','applydebuff') AND ability.id IN (${bossIdList})`, {});

  const bossTimeline = [];
  const seenBoss = new Set();
  for (const evt of bossEvents) {
    const timeKey = Math.round((evt.timestamp - fight.startTime) / 1000);
    const key = `${timeKey}-${evt.abilityGameID}`;
    if (seenBoss.has(key)) continue;
    seenBoss.add(key);
    bossTimeline.push({
      time: evt.timestamp - fight.startTime,
      ability: BOSS_ABILITIES[evt.abilityGameID],
      type: evt.type,
    });
  }
  bossTimeline.sort((a, b) => a.time - b.time);

  // Dedup helper
  const dedup = (events, windowMs = 2000) => {
    const times = [];
    for (const e of events) {
      if (times.length === 0 || e.time - times[times.length - 1] > windowMs) times.push(e.time);
    }
    return times;
  };

  // Phase detection
  let keyEvents = {};
  let transitionTimes = [];

  if (boss === 've') {
    keyEvents.nullzoneImplosion = dedup(bossTimeline.filter(e => e.ability === 'Nullzone Implosion'));
    keyEvents.voidHowl = dedup(bossTimeline.filter(e => e.ability === 'Void Howl' && e.type === 'cast'));
    keyEvents.gloom = dedup(bossTimeline.filter(e => e.ability === 'Gloom' && e.type === 'cast'));
    keyEvents.midnightFlames = dedup(bossTimeline.filter(e => e.ability === 'Midnight Flames'));
    keyEvents.nullbeam = dedup(bossTimeline.filter(e => e.ability === 'Nullbeam' && e.type === 'cast'));
    transitionTimes = keyEvents.midnightFlames;

    console.log(`\nBoss Events:`);
    console.log(`  Nullzone Implosion: ${keyEvents.nullzoneImplosion.map(fmt).join(', ')}`);
    console.log(`  Void Howl: ${keyEvents.voidHowl.map(fmt).join(', ')}`);
    console.log(`  Gloom: ${keyEvents.gloom.map(fmt).join(', ')}`);
    console.log(`  Midnight Flames: ${keyEvents.midnightFlames.map(fmt).join(', ')}`);
  } else {
    const darkRads = bossTimeline.filter(e => e.ability === 'Dark Radiation');
    const unravelings = bossTimeline.filter(e => e.ability === 'Entropic Unraveling' && e.type === 'begincast');
    const transEvents = unravelings.length > 0 ? unravelings :
      bossTimeline.filter(e => e.ability === 'Entropic Unraveling');
    for (const t of transEvents) {
      if (transitionTimes.length === 0 || t.time - transitionTimes[transitionTimes.length - 1] > 2000)
        transitionTimes.push(t.time);
    }
    const drTimes = [];
    for (const d of darkRads) {
      if (drTimes.length === 0 || d.time - drTimes[drTimes.length - 1] > 2000)
        drTimes.push(d.time);
    }
    console.log(`\nBoss Events:`);
    console.log(`  Dark Radiation: ${drTimes.map(fmt).join(', ')}`);
    console.log(`  Entropic Unraveling: ${transitionTimes.map(fmt).join(', ')}`);
  }

  // Build full CD timeline (healers + non-healers)
  const cdTimeline = [];
  for (const cd of healerCDs) {
    for (const time of cd.casts) {
      cdTimeline.push({
        time, player: cd.player, spec: cd.spec, ability: cd.abilityName,
        abilityId: cd.abilityId, category: 'healer', castCount: cd.casts.length,
      });
    }
  }
  for (const cd of raidUtilityCDs) {
    for (const time of cd.casts) {
      cdTimeline.push({
        time, player: cd.player, spec: cd.spec, ability: cd.abilityName,
        abilityId: cd.abilityId, category: 'raid', castCount: cd.casts.length,
      });
    }
  }
  cdTimeline.sort((a, b) => a.time - b.time);

  return {
    code: target.code, fightId: target.fightId, label: target.label,
    duration: fightDur, healers, allPlayers: Object.values(allPlayers),
    healerCDs, nonHealerCDs: raidUtilityCDs, cdTimeline,
    bossTimeline, keyEvents, transitionTimes,
  };
}

async function main() {
  const bossName = boss === 've' ? 'VAELGOR & EZZORAK' : boss.toUpperCase();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  MYTHIC ${bossName} — DATA-DRIVEN CD DISCOVERY`);
  console.log('║  Pulling ALL casts, discovering CDs from actual usage                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const results = [];
  for (const target of TARGETS) {
    try {
      const result = await analyzeReport(target);
      if (result) results.push(result);
    } catch (e) {
      console.error(`Error on ${target.code}: ${e.message}`);
    }
  }

  // ── Cross-team comparison: what CDs do healers actually have? ──
  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`#  CROSS-TEAM CD DISCOVERY — WHAT HEALERS ACTUALLY RUN`);
  console.log(`${'#'.repeat(80)}`);

  // Collect all healer abilities used across teams
  const healerSpecs = new Set();
  for (const r of results) for (const h of r.healers) healerSpecs.add(h.spec);

  for (const spec of [...healerSpecs].sort()) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${spec} — ABILITIES USED (≤${CD_MAX_CASTS} casts per fight)`);
    console.log(`${'─'.repeat(60)}`);

    // Get all unique abilities for this spec across teams
    const allAbilities = new Map();
    for (const r of results) {
      for (const cd of r.healerCDs.filter(c => c.spec === spec)) {
        if (!allAbilities.has(cd.abilityId)) {
          allAbilities.set(cd.abilityId, { name: cd.abilityName, id: cd.abilityId, teams: [] });
        }
        allAbilities.get(cd.abilityId).teams.push({
          team: r.label.split(' — ')[0],
          timings: cd.casts.map(t => fmt(t)),
          count: cd.casts.length,
        });
      }
    }

    // Sort: abilities used by more teams first
    const sorted = [...allAbilities.values()].sort((a, b) => b.teams.length - a.teams.length);
    for (const ability of sorted) {
      const teamCount = ability.teams.length;
      const marker = teamCount >= 4 ? '★' : teamCount >= 3 ? '◆' : teamCount >= 2 ? '●' : '○';
      console.log(`\n  ${marker} ${ability.name} (${ability.id}) — ${teamCount}/5 teams:`);
      for (const t of ability.teams) {
        console.log(`    ${t.team.padEnd(22)} [${t.count}x] ${t.timings.join(', ')}`);
      }
    }
  }

  // ── Cross-team comparison: raid utility CDs ──
  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`#  RAID UTILITY CDs — NON-HEALER DEFENSIVES`);
  console.log(`${'#'.repeat(80)}`);

  const raidAbilities = new Map();
  for (const r of results) {
    for (const cd of r.nonHealerCDs) {
      const key = cd.abilityId;
      if (!raidAbilities.has(key)) {
        raidAbilities.set(key, { name: cd.abilityName, id: cd.abilityId, specs: new Set(), teams: [] });
      }
      raidAbilities.get(key).specs.add(cd.spec);
      raidAbilities.get(key).teams.push({
        team: r.label.split(' — ')[0],
        player: cd.player, spec: cd.spec,
        timings: cd.casts.map(t => fmt(t)),
      });
    }
  }

  const raidSorted = [...raidAbilities.values()].sort((a, b) => b.teams.length - a.teams.length);
  for (const ability of raidSorted) {
    const teamCount = new Set(ability.teams.map(t => t.team)).size;
    if (teamCount < 2) continue; // skip abilities only one team uses
    console.log(`\n  ${ability.name} (${ability.id}) — ${[...ability.specs].join('/')} — ${teamCount}/5 teams:`);
    for (const t of ability.teams) {
      console.log(`    ${t.team.padEnd(22)} ${t.spec.padEnd(6)} ${t.player.padEnd(18)} ${t.timings.join(', ')}`);
    }
  }

  // ── Consensus timeline ──
  console.log(`\n\n${'*'.repeat(80)}`);
  console.log(`*  CONSENSUS CD TIMELINE — 30s windows`);
  console.log(`${'*'.repeat(80)}`);

  const windowSize = 30000;
  const maxTime = Math.max(...results.map(r => r.duration));
  const numWindows = Math.ceil(maxTime / windowSize);

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = start + windowSize;

    const windowCDs = [];
    for (const r of results) {
      for (const cd of r.cdTimeline) {
        if (cd.time >= start && cd.time < end) {
          windowCDs.push({ ...cd, team: r.label.split(' — ')[0] });
        }
      }
    }
    if (windowCDs.length === 0) continue;

    const abilityCounts = {};
    for (const cd of windowCDs) {
      const key = `${cd.spec} ${cd.ability}`;
      if (!abilityCounts[key]) abilityCounts[key] = { teams: new Set(), times: [], category: cd.category };
      abilityCounts[key].teams.add(cd.team);
      abilityCounts[key].times.push(cd.time);
    }

    console.log(`\n  ${fmt(start)} — ${fmt(end)}:`);
    for (const [key, data] of Object.entries(abilityCounts).sort((a, b) => b[1].teams.size - a[1].teams.size)) {
      const consensus = data.teams.size >= 3 ? '***' : data.teams.size >= 2 ? ' **' : '   ';
      const avgTime = fmt(data.times.reduce((a, b) => a + b, 0) / data.times.length);
      const tag = data.category === 'raid' ? ' [RAID]' : '';
      console.log(`    ${consensus} ${key} — ${data.teams.size}/5 teams (avg ${avgTime})${tag}`);
    }
  }

  console.log(`\n\nLegend: *** = 3+ teams agree, ** = 2 teams, ★ = 4+ teams, ◆ = 3 teams, ● = 2 teams, ○ = 1 team`);

  const outDir = join(__dirname, 'data', 'comp-search');
  mkdirSync(outDir, { recursive: true });
  const filename = `cd-analysis-${boss}.json`;
  writeFileSync(join(outDir, filename), JSON.stringify(results, null, 2));
  console.log(`\nSaved to data/comp-search/${filename}`);
}

main().catch(e => { console.error(e); process.exit(1); });
