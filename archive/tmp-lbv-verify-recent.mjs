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

const fmt = t => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Get a recent top-speed Mythic LBV kill
const rankings = await gql(`{
  worldData {
    encounter(id: 3180) {
      name
      fightRankings(difficulty: 5, page: 1, metric: speed)
    }
  }
}`);

const kills = rankings.worldData.encounter.fightRankings.rankings || [];
console.log('Encounter:', rankings.worldData.encounter.name);
console.log('Kills found:', kills.length);

if (kills.length === 0) { console.log('No kills found'); process.exit(0); }

const recent = kills[0];
const code = recent.report.code;
const fightID = recent.report.fightID;
console.log(`Top speed kill: report ${code} fight ${fightID} dur: ${(recent.duration / 1000).toFixed(0)}s`);

// Get fight metadata and ability names
const meta = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        fights { id startTime endTime kill }
        masterData { abilities { gameID name } }
      }
    }
  }
`, { code });

const fight = meta.reportData.report.fights.find(f => f.id === fightID);
if (!fight) { console.log('Fight not found'); process.exit(0); }

const abilityMap = {};
meta.reportData.report.masterData.abilities.forEach(a => { abilityMap[a.gameID] = a.name; });

// Pull enemy casts
const castData = await gql(`
  query ($code: String!, $start: Float, $end: Float) {
    reportData {
      report(code: $code) {
        events(dataType: Casts, startTime: $start, endTime: $end, hostilityType: Enemies, limit: 800) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`, { code, start: fight.startTime, end: fight.endTime });

const events = castData.reportData.report.events.data;
const dur = ((fight.endTime - fight.startTime) / 1000).toFixed(0);
console.log(`Duration: ${dur}s | Events: ${events.length}`);

// Group by ability name
const byName = {};
events.forEach(e => {
  const gid = e.abilityGameID || 0;
  const name = abilityMap[gid] || `Unk_${gid}`;
  if (!byName[name]) byName[name] = { id: gid, times: [] };
  byName[name].times.push((e.timestamp - fight.startTime) / 1000);
});

// Key abilities to verify
const important = [
  'Searing Radiance', 'Sacred Toll', 'Aura of Devotion', 'Aura of Wrath', 'Aura of Peace',
  'Tyr', 'Divine Storm', 'Divine Toll', 'Light Infused', 'Mass', 'Execution',
  'Avenger', 'Retribution', 'Elekk', 'Sacred Shield', 'Blinding Light'
];

console.log(`\n=== KEY ABILITIES (recent kill, ${dur}s) ===`);
const sorted = Object.entries(byName).sort((a, b) => a[1].times[0] - b[1].times[0]);
for (const [name, data] of sorted) {
  if (important.some(k => name.includes(k))) {
    const ts = data.times.filter(t => t >= 0).slice(0, 15).map(fmt).join(', ');
    console.log(`\n${name} (ID:${data.id}) [${data.times.length}x]:`);
    console.log(`  ${ts}${data.times.length > 15 ? '...' : ''}`);
  }
}

// Search for Execution Sentence specifically
console.log('\n=== EXECUTION SENTENCE SEARCH ===');
let foundExec = false;
for (const [name, data] of Object.entries(byName)) {
  if (name.toLowerCase().includes('execut')) {
    console.log(`Found: ${name} (ID:${data.id}) [${data.times.length}x]`);
    foundExec = true;
  }
}
if (!foundExec) console.log('NOT FOUND in enemy cast events');

// Full ability list
console.log('\n=== ALL ENEMY ABILITIES ===');
for (const [name, data] of Object.entries(byName).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${name} [${data.times.length}x] (ID:${data.id})`);
}
