import { readFileSync } from 'fs';
import { join } from 'path';

const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

async function getToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const code = 'xZ3q7TGWBKcH1L92';
const fightID = 2;

// Get fight info first
const fightData = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        fights {
          id
          name
          difficulty
          kill
          startTime
          endTime
          fightPercentage
          friendlyPlayers
        }
        masterData {
          actors {
            id
            name
            server
            type
            subType
          }
        }
      }
    }
  }
`, { code });

const report = fightData.reportData.report;
const fight = report.fights.find(f => f.id === fightID);
const actors = report.masterData.actors.filter(a => a.type === 'Player');
const duration = ((fight.endTime - fight.startTime) / 1000).toFixed(1);

console.log('=== FIGHT INFO ===');
console.log(`${fight.name} | Difficulty: ${fight.difficulty} | Kill: ${fight.kill} | Duration: ${duration}s (${(duration / 60).toFixed(1)} min)`);
if (!fight.kill) console.log(`Wipe at: ${fight.fightPercentage}%`);

console.log('\nPlayers:');
actors.forEach(a => console.log(`  ID:${a.id} ${a.name}-${a.server || '?'} (${a.subType})`));

// Find the evoker
const evoker = actors.find(a => a.subType === 'Evoker' || a.subType === 'Augmentation');
if (!evoker) { console.log('No evoker found!'); process.exit(0); }
console.log(`\nEvoker: ${evoker.name} (ID: ${evoker.id})`);

// Pull all data in one query
const data = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        damageDone: table(dataType: DamageDone, fightIDs: [2])
        casts: table(dataType: Casts, fightIDs: [2], sourceID: ${evoker.id})
        buffs: table(dataType: Buffs, fightIDs: [2], sourceID: ${evoker.id})
        deaths: table(dataType: Deaths, fightIDs: [2])
      }
    }
  }
`, { code });

const r = data.reportData.report;

console.log('\n=== DAMAGE DONE (all players) ===');
const dmgEntries = r.damageDone?.data?.entries || [];
const totalTime = r.damageDone?.data?.totalTime || 1;
dmgEntries.forEach(e => {
  const dps = (e.total / (totalTime / 1000)).toFixed(0);
  console.log(`  ${e.name} (${e.icon || e.type}): ${e.total.toLocaleString()} total | ${dps} DPS`);
});

console.log(`\n=== ${evoker.name} CASTS ===`);
const castEntries = r.casts?.data?.entries || [];
castEntries.forEach(e => {
  console.log(`  ${e.name} (ID:${e.guid}): ${e.total} casts`);
});

console.log(`\n=== ${evoker.name} KEY BUFFS ===`);
const buffAuras = r.buffs?.data?.auras || [];
const buffTime = r.buffs?.data?.totalTime || 1;
const keyBuffs = ['Ebon Might', 'Prescience', 'Blistering Scales', 'Inferno', 'Breath of Eons',
  'Fury of the Aspects', 'Spatial Paradox', 'Zephyr', 'Obsidian Scales', 'Tip the Scales',
  'Burnout', 'Essence Burst', 'Mass Eruption', 'Leaping Flames'];
buffAuras.forEach(a => {
  const uptime = a.totalUptime ? (a.totalUptime / buffTime * 100).toFixed(1) + '%' : 'N/A';
  if (keyBuffs.some(k => a.name.includes(k)) || a.totalUptime / buffTime > 0.15) {
    console.log(`  ${a.name} (ID:${a.guid}): uptime=${uptime} uses=${a.totalUses || 0}`);
  }
});

console.log('\n=== DEATHS ===');
const deathEntries = r.deaths?.data?.entries || [];
deathEntries.forEach(e => console.log(`  ${e.name}`));
const evokerDeaths = deathEntries.filter(e => e.name === evoker.name).length;
console.log(`${evoker.name} deaths: ${evokerDeaths}`);

// Now pull prescience per target
const otherPlayers = actors.filter(a => a.id !== evoker.id);
let presQuery = `query ($code: String!) { reportData { report(code: $code) {`;
for (const p of otherPlayers) {
  presQuery += `\n  pres_${p.id}: table(dataType: Buffs, fightIDs: [2], sourceID: ${evoker.id}, targetID: ${p.id}, abilityID: 410089)`;
}
presQuery += `\n} } }`;

const presData = await gql(presQuery, { code });
const presReport = presData.reportData.report;

console.log('\n=== PRESCIENCE PER TARGET ===');
for (const p of otherPlayers) {
  const table = presReport[`pres_${p.id}`];
  const auras = table?.data?.auras || [];
  const tTime = table?.data?.totalTime || 1;
  if (auras.length > 0) {
    const a = auras[0];
    const uptime = (a.totalUptime / tTime * 100).toFixed(1);
    console.log(`  ${p.name} (${p.subType}): ${uptime}% uptime, ${a.totalUses || 0} uses`);
  } else {
    console.log(`  ${p.name} (${p.subType}): 0.0% uptime, 0 uses`);
  }
}

// Compare key metrics with fight 1
console.log('\n=== COMPARISON: FIGHT 1 vs FIGHT 2 ===');
console.log('Metric                  | Key 1 (MT)     | Key 2');
console.log('------------------------|----------------|--------');

// Ebon Might
const ebonBuff = buffAuras.find(a => a.name === 'Ebon Might' && a.guid === 395296);
const ebonUptime = ebonBuff ? (ebonBuff.totalUptime / buffTime * 100).toFixed(1) : '?';
console.log(`Ebon Might uptime       | 62.3%          | ${ebonUptime}%`);

// Deaths
console.log(`Deaths                  | 3              | ${evokerDeaths}`);

// Key casts
const getCasts = name => {
  const e = castEntries.find(c => c.name === name);
  return e ? e.total : 0;
};
console.log(`Eruption casts          | 265            | ${getCasts('Eruption')}`);
console.log(`Living Flame casts      | 161            | ${getCasts('Living Flame')}`);
console.log(`Emerald Blossom casts   | 21             | ${getCasts('Emerald Blossom')}`);
console.log(`Blistering Scales casts | 2              | ${getCasts('Blistering Scales')}`);
console.log(`Zephyr casts            | 1              | ${getCasts('Zephyr')}`);
console.log(`Fury of Aspects casts   | 2              | ${getCasts('Fury of the Aspects')}`);
console.log(`Fire Breath casts       | 87             | ${getCasts('Fire Breath')}`);
console.log(`Upheaval casts          | 85             | ${getCasts('Upheaval')}`);
console.log(`Breath of Eons casts    | 22             | ${getCasts('Breath of Eons')}`);
console.log(`Quell (interrupts)      | 4              | ${getCasts('Quell')}`);
