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

// Get all fights and players
const meta = await gql(`
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

const report = meta.reportData.report;
const fights = report.fights.filter(f => f.name && f.name !== 'Unknown');
const actors = report.masterData.actors.filter(a => a.type === 'Player');

console.log('=== ALL FIGHTS ===');
fights.forEach(f => {
  const dur = ((f.endTime - f.startTime) / 1000).toFixed(0);
  console.log(`  Fight ${f.id} - ${f.name} | Diff: ${f.difficulty} | Kill: ${f.kill} | Dur: ${dur}s | Players: ${(f.friendlyPlayers || []).join(',')}`);
});

const lastFight = fights[fights.length - 1];
console.log(`\nLast fight: ${lastFight.name} (Fight ID: ${lastFight.id})`);
console.log(`Players in last fight: ${(lastFight.friendlyPlayers || []).join(', ')}`);

// Find priests
console.log('\n=== ALL PRIESTS IN REPORT ===');
const priests = actors.filter(a => a.subType && (a.subType.includes('Priest') || a.subType === 'Shadow' || a.subType === 'Discipline' || a.subType === 'Holy'));
// Actually subType might just say the spec name
actors.forEach(a => {
  if (a.subType && ['Shadow', 'Discipline', 'Holy', 'Priest'].some(s => a.subType.includes(s))) {
    console.log(`  ${a.name}-${a.server} | ID:${a.id} | ${a.subType}`);
  }
});

// Show all players in the last fight
console.log('\n=== PLAYERS IN LAST FIGHT ===');
const lastPlayers = (lastFight.friendlyPlayers || []);
lastPlayers.forEach(pid => {
  const actor = actors.find(a => a.id === pid);
  if (actor) {
    console.log(`  ID:${actor.id} ${actor.name}-${actor.server || '?'} (${actor.subType})`);
  }
});

// Find the priest - check if any player in last fight has a priest-like subType
// Also check by name patterns Josh might use
const joshNames = ['Mcpounding', 'Senssay', 'Josh'];
console.log('\n=== LOOKING FOR JOSH ===');
lastPlayers.forEach(pid => {
  const actor = actors.find(a => a.id === pid);
  if (actor) {
    const isJosh = joshNames.some(n => actor.name.toLowerCase().includes(n.toLowerCase()));
    if (isJosh) console.log(`  JOSH: ${actor.name}-${actor.server} (${actor.subType}) ID:${actor.id}`);
  }
});

// Find any priest in the last fight
let priest = null;
lastPlayers.forEach(pid => {
  const actor = actors.find(a => a.id === pid);
  if (actor && ['Shadow', 'Discipline', 'Holy'].includes(actor.subType)) {
    // Could be a holy paladin too, but Priest class check...
    console.log(`  Potential priest: ${actor.name} (${actor.subType}) ID:${actor.id}`);
    priest = actor;
  }
});

// If no obvious priest found, just show everyone
if (!priest) {
  console.log('\nNo obvious priest spec found. All players in fight:');
  lastPlayers.forEach(pid => {
    const actor = actors.find(a => a.id === pid);
    if (actor) console.log(`  ${actor.name} (${actor.subType})`);
  });
}

// Pull data for the priest (or all players if we need to find Josh)
const fightID = lastFight.id;

const data = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        damageDone: table(dataType: DamageDone, fightIDs: [${fightID}])
        healing: table(dataType: Healing, fightIDs: [${fightID}])
        deaths: table(dataType: Deaths, fightIDs: [${fightID}])
      }
    }
  }
`, { code });

const r = data.reportData.report;

console.log('\n=== DAMAGE DONE (all players, fight ' + fightID + ') ===');
const dmgEntries = r.damageDone?.data?.entries || [];
const totalTime = r.damageDone?.data?.totalTime || 1;
dmgEntries.forEach(e => {
  const dps = (e.total / (totalTime / 1000)).toFixed(0);
  console.log(`  ${e.name} (${e.icon || e.type}): ${e.total.toLocaleString()} | ${dps} DPS`);
});

console.log('\n=== HEALING DONE (all players, fight ' + fightID + ') ===');
const healEntries = r.healing?.data?.entries || [];
healEntries.forEach(e => {
  const hps = (e.total / (totalTime / 1000)).toFixed(0);
  console.log(`  ${e.name} (${e.icon || e.type}): ${e.total.toLocaleString()} | ${hps} HPS`);
});

console.log('\n=== DEATHS ===');
(r.deaths?.data?.entries || []).forEach(e => console.log(`  ${e.name}`));
