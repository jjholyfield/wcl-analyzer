import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';

const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';
const DATA_DIR = join(__dirname, 'data');

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  }
  return json.data;
}

function extractReportCode(input) {
  const match = input.match(/reports\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  return input.replace(/[^A-Za-z0-9]/g, '');
}

// ── Command: report ─────────────────────────────────────────────
async function cmdReport(code) {
  console.log(`Fetching report ${code}...\n`);

  const data = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          code
          title
          startTime
          endTime
          fights(killType: Encounters) {
            id
            encounterID
            name
            kill
            bossPercentage
            startTime
            endTime
            difficulty
            size
          }
          masterData(translate: true) {
            actors(type: "Player") {
              id
              gameID
              name
              server
              subType
            }
          }
        }
      }
    }
  `, { code });

  const report = data.reportData.report;
  const duration = ((report.endTime - report.startTime) / 1000 / 60).toFixed(1);

  console.log(`── ${report.title} (${duration} min) ──\n`);

  console.log('FIGHTS:');
  console.log('─'.repeat(70));
  for (const f of report.fights) {
    const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
    const status = f.kill ? 'KILL' : `${(f.bossPercentage / 100).toFixed(1)}%`;
    console.log(`  [${f.id}] ${f.name} — ${status} (${dur}s)`);
  }

  console.log('\nPLAYERS:');
  console.log('─'.repeat(70));
  const bySpec = {};
  for (const p of report.masterData.actors) {
    const spec = p.subType || 'Unknown';
    if (!bySpec[spec]) bySpec[spec] = [];
    bySpec[spec].push(p);
  }
  for (const [spec, players] of Object.entries(bySpec).sort()) {
    for (const p of players) {
      console.log(`  [${p.id}] ${p.name}-${p.server} (${spec})`);
    }
  }

  const outDir = join(DATA_DIR, code);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport saved to data/${code}/report.json`);
}

// ── Command: pull ───────────────────────────────────────────────
async function cmdPull(code, playerName, fightArg) {
  console.log(`Fetching report ${code}...\n`);

  const reportData = await gql(`
    query ($code: String!) {
      reportData {
        report(code: $code) {
          title
          startTime
          fights(killType: Encounters) {
            id
            encounterID
            name
            kill
            bossPercentage
            startTime
            endTime
          }
          masterData(translate: true) {
            actors(type: "Player") {
              id
              name
              server
              subType
            }
          }
        }
      }
    }
  `, { code });

  const report = reportData.reportData.report;
  const player = report.masterData.actors.find(
    a => a.name.toLowerCase() === playerName.toLowerCase()
  );

  if (!player) {
    console.error(`Player "${playerName}" not found. Available:`);
    for (const a of report.masterData.actors) {
      console.error(`  ${a.name}-${a.server} (${a.subType})`);
    }
    process.exit(1);
  }

  console.log(`Found: ${player.name}-${player.server} (${player.subType}), actor ID ${player.id}\n`);

  let fights;
  if (fightArg === 'all') {
    fights = report.fights;
  } else if (fightArg === 'kills') {
    fights = report.fights.filter(f => f.kill);
  } else {
    const fightId = parseInt(fightArg);
    fights = report.fights.filter(f => f.id === fightId);
    if (fights.length === 0) {
      console.error(`Fight ID ${fightId} not found.`);
      process.exit(1);
    }
  }

  const outDir = join(DATA_DIR, code);
  mkdirSync(outDir, { recursive: true });

  for (const fight of fights) {
    const fightDur = ((fight.endTime - fight.startTime) / 1000).toFixed(0);
    const status = fight.kill ? 'KILL' : `${(fight.bossPercentage / 100).toFixed(1)}%`;
    console.log(`Pulling: ${fight.name} [${fight.id}] — ${status} (${fightDur}s)`);

    const casts = await fetchAllEvents(code, fight.id, player.id,
      "type in ('cast','begincast')"
    );
    console.log(`  Casts: ${casts.length} events`);

    const buffs = await fetchAllEvents(code, fight.id, player.id,
      "type in ('applybuff','removebuff','refreshbuff','applybuffstack','removebuffstack')",
      'target'
    );
    console.log(`  Buffs: ${buffs.length} events`);

    const healing = await fetchAllEvents(code, fight.id, player.id,
      "type = 'heal'"
    );
    console.log(`  Healing: ${healing.length} events`);

    const damage = await fetchAllEvents(code, fight.id, player.id,
      "type = 'damage'"
    );
    console.log(`  Damage: ${damage.length} events`);

    const resources = await fetchAllEvents(code, fight.id, player.id,
      "type in ('resourcechange','drain')",
      'target'
    );
    console.log(`  Resources: ${resources.length} events`);

    const result = {
      report: { code, title: report.title },
      player: { id: player.id, name: player.name, server: player.server, spec: player.subType },
      fight: {
        id: fight.id,
        name: fight.name,
        kill: fight.kill,
        bossPercentage: fight.bossPercentage,
        duration: fight.endTime - fight.startTime,
        startTime: fight.startTime,
        endTime: fight.endTime,
      },
      events: { casts, buffs, healing, damage, resources },
      summary: buildSummary(casts, buffs, healing, damage, fight),
    };

    const filename = `${player.name.toLowerCase()}-fight${fight.id}.json`;
    writeFileSync(join(outDir, filename), JSON.stringify(result, null, 2));
    console.log(`  Saved: data/${code}/${filename}\n`);
  }

  console.log('Done. Ask Claude to read the JSON files for analysis.');
}

async function fetchAllEvents(code, fightId, actorId, filterExpr, actorRole = 'source') {
  let allEvents = [];
  let startTime = null;

  while (true) {
    const params = { code, fightId };
    const timeFilter = startTime ? `startTime: ${startTime},` : '';
    const actorFilter = actorRole === 'source'
      ? `sourceID: ${actorId}`
      : `targetID: ${actorId}`;

    const data = await gql(`
      query ($code: String!, $fightId: Int!) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: [$fightId]
              ${actorFilter}
              filterExpression: "${filterExpr}"
              ${timeFilter}
              limit: 10000
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `, params);

    const result = data.reportData.report.events;
    if (result.data && result.data.length > 0) {
      allEvents = allEvents.concat(result.data);
    }

    if (!result.nextPageTimestamp) break;
    startTime = result.nextPageTimestamp;
  }

  return allEvents;
}

function buildSummary(casts, buffs, healing, damage, fight) {
  const duration = (fight.endTime - fight.startTime) / 1000;

  const castCounts = {};
  for (const c of casts) {
    if (c.type !== 'cast') continue;
    const name = c.ability?.name || `spell-${c.abilityGameID}`;
    castCounts[name] = (castCounts[name] || 0) + 1;
  }

  const totalHealing = healing.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalOverheal = healing.reduce((sum, e) => sum + (e.overheal || 0), 0);
  const totalDamage = damage.reduce((sum, e) => sum + (e.amount || 0), 0);

  const healBreakdown = {};
  for (const h of healing) {
    const name = h.ability?.name || `spell-${h.abilityGameID}`;
    if (!healBreakdown[name]) healBreakdown[name] = { total: 0, overheal: 0, count: 0 };
    healBreakdown[name].total += (h.amount || 0);
    healBreakdown[name].overheal += (h.overheal || 0);
    healBreakdown[name].count++;
  }

  const buffUptimes = {};
  const buffStarts = {};
  for (const b of buffs) {
    const name = b.ability?.name || `spell-${b.abilityGameID}`;
    if (b.type === 'applybuff') {
      buffStarts[name] = b.timestamp;
    } else if (b.type === 'removebuff' && buffStarts[name]) {
      if (!buffUptimes[name]) buffUptimes[name] = 0;
      buffUptimes[name] += b.timestamp - buffStarts[name];
      delete buffStarts[name];
    }
  }
  for (const [name, start] of Object.entries(buffStarts)) {
    if (!buffUptimes[name]) buffUptimes[name] = 0;
    buffUptimes[name] += fight.endTime - start;
  }

  const uptimePercents = {};
  for (const [name, ms] of Object.entries(buffUptimes)) {
    uptimePercents[name] = ((ms / (fight.endTime - fight.startTime)) * 100).toFixed(1) + '%';
  }

  return {
    durationSeconds: duration,
    hps: (totalHealing / duration).toFixed(0),
    dps: (totalDamage / duration).toFixed(0),
    totalHealing,
    totalOverheal,
    overhealPercent: totalHealing > 0
      ? ((totalOverheal / (totalHealing + totalOverheal)) * 100).toFixed(1) + '%'
      : '0%',
    totalDamage,
    castCounts: Object.fromEntries(
      Object.entries(castCounts).sort((a, b) => b[1] - a[1])
    ),
    healBreakdown: Object.fromEntries(
      Object.entries(healBreakdown)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, v]) => [name, {
          total: v.total,
          overheal: v.overheal,
          overhealPct: v.total > 0 ? ((v.overheal / (v.total + v.overheal)) * 100).toFixed(1) + '%' : '0%',
          count: v.count,
        }])
    ),
    buffUptimes: uptimePercents,
  };
}

// ── Command: lookup ──────────────────────────────────────────────
async function cmdLookup(name, serverSlug, region) {
  console.log(`Looking up ${name}-${serverSlug} (${region.toUpperCase()})...\n`);

  const data = await gql(`
    query ($name: String!, $server: String!, $region: String!) {
      characterData {
        character(name: $name, serverSlug: $server, serverRegion: $region) {
          name
          classID
          zoneRankings(zoneID: 46)
          recentReports(limit: 10, page: 1) {
            data {
              code
              title
              startTime
              endTime
              zone {
                id
                name
              }
            }
          }
        }
      }
    }
  `, { name, server: serverSlug, region });

  const char = data.characterData.character;
  if (!char) {
    console.error(`Character "${name}" not found on ${serverSlug}-${region.toUpperCase()}.`);
    process.exit(1);
  }

  console.log(`── ${char.name} (Class ID: ${char.classID}) ──\n`);

  if (char.zoneRankings) {
    console.log('CURRENT RAID RANKINGS:');
    console.log('─'.repeat(70));
    const zr = typeof char.zoneRankings === 'string' ? JSON.parse(char.zoneRankings) : char.zoneRankings;
    if (zr.rankings) {
      for (const r of zr.rankings) {
        const best = r.rankPercent != null ? `${r.rankPercent.toFixed(1)}%` : 'N/A';
        const median = r.medianPercent != null ? `${r.medianPercent.toFixed(1)}%` : 'N/A';
        const kills = r.totalKills || 0;
        console.log(`  ${r.encounter?.name || 'Unknown'} — Best: ${best} | Median: ${median} | Kills: ${kills}`);
      }
      if (zr.bestPerformanceAverage != null) {
        console.log(`\n  Overall Best Perf Avg: ${zr.bestPerformanceAverage.toFixed(1)}`);
      }
      if (zr.medianPerformanceAverage != null) {
        console.log(`  Overall Median Perf Avg: ${zr.medianPerformanceAverage.toFixed(1)}`);
      }
    } else {
      console.log(JSON.stringify(zr, null, 2));
    }
  }

  if (char.recentReports?.data?.length) {
    console.log('\nRECENT REPORTS:');
    console.log('─'.repeat(70));
    for (const r of char.recentReports.data) {
      const date = new Date(r.startTime).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      const zone = r.zone?.name || 'Unknown';
      console.log(`  [${r.code}] ${date} — ${zone} — ${r.title || '(untitled)'}`);
    }
    console.log(`\nTo pull data: node wcl.mjs pull <code> ${char.name} kills`);
  }

  const outDir = join(DATA_DIR, 'characters');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${name.toLowerCase()}-${serverSlug}.json`),
    JSON.stringify(char, null, 2)
  );
  console.log(`\nSaved to data/characters/${name.toLowerCase()}-${serverSlug}.json`);
}

function parseCharInput(input) {
  const parts = input.split('-');
  if (parts.length >= 2) {
    return { name: parts[0], server: parts.slice(1).join('-').toLowerCase() };
  }
  return { name: input, server: null };
}

// ── CLI ─────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

if (cmd === 'report' && args[0]) {
  const code = extractReportCode(args[0]);
  cmdReport(code).catch(e => { console.error(e.message); process.exit(1); });

} else if (cmd === 'pull' && args[0] && args[1]) {
  const code = extractReportCode(args[0]);
  const playerName = args[1];
  const fightArg = args[2] || 'kills';
  cmdPull(code, playerName, fightArg).catch(e => { console.error(e.message); process.exit(1); });

} else if (cmd === 'lookup' && args[0]) {
  const { name, server } = parseCharInput(args[0]);
  const serverSlug = server || args[1]?.toLowerCase();
  const region = (server ? args[1] : args[2]) || 'us';
  if (!serverSlug) {
    console.error('Usage: node wcl.mjs lookup <Name-Server> [region]\n       node wcl.mjs lookup <Name> <Server> [region]');
    process.exit(1);
  }
  cmdLookup(name, serverSlug, region).catch(e => { console.error(e.message); process.exit(1); });

} else {
  console.log(`
Warcraft Logs Analyzer
──────────────────────

Usage:
  node wcl.mjs lookup <Name-Server> [region]
    Look up a character's rankings and recent reports.

  node wcl.mjs report <report-url-or-code>
    List all fights and players in a report.

  node wcl.mjs pull <report-url-or-code> <player-name> [fight-id|kills|all]
    Pull full event data for a player. Defaults to kill fights only.

Examples:
  node wcl.mjs lookup McPounding-Proudmoore us
  node wcl.mjs report https://www.warcraftlogs.com/reports/ABC123
  node wcl.mjs pull ABC123 McPounding kills
  node wcl.mjs pull ABC123 McPounding all
  `);
}
