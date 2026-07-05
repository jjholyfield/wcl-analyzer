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

// Check the reference kill for debuff/damage events that might be Execution Sentence
const code = 'TqBdyt79nLhZrXpP';
const fightID = 22;

const meta = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        fights { id startTime endTime }
        masterData { abilities { gameID name } }
      }
    }
  }
`, { code });

const fight = meta.reportData.report.fights.find(f => f.id === fightID);
const abilityMap = {};
meta.reportData.report.masterData.abilities.forEach(a => { abilityMap[a.gameID] = a.name; });

// Search all ability names for anything with "execut", "sentence", "condemn", "judgment"
console.log('=== SEARCHING ABILITY MAP FOR EXECUTION-LIKE ABILITIES ===');
for (const [id, name] of Object.entries(abilityMap)) {
  const lower = name.toLowerCase();
  if (lower.includes('execut') || lower.includes('sentence') || lower.includes('condemn') ||
      lower.includes('reckoning') || lower.includes('censure')) {
    console.log(`  ${name} (ID: ${id})`);
  }
}

// Pull debuff events on friendly targets from enemies
console.log('\n=== DEBUFF EVENTS (enemy → friendly) ===');
const debuffData = await gql(`
  query ($code: String!, $start: Float, $end: Float) {
    reportData {
      report(code: $code) {
        events(dataType: Debuffs, startTime: $start, endTime: $end, hostilityType: Friendlies, limit: 2000) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`, { code, start: fight.startTime, end: fight.endTime });

const debuffEvents = debuffData.reportData.report.events.data;
console.log(`Total debuff events: ${debuffEvents.length}`);

// Group debuffs by ability name
const debuffsByName = {};
debuffEvents.forEach(e => {
  const gid = e.abilityGameID || 0;
  const name = abilityMap[gid] || `Unk_${gid}`;
  if (!debuffsByName[name]) debuffsByName[name] = { id: gid, events: [] };
  debuffsByName[name].events.push({
    time: (e.timestamp - fight.startTime) / 1000,
    type: e.type,
    targetID: e.targetID,
    sourceID: e.sourceID
  });
});

// Print all unique debuffs
console.log('\nAll debuff abilities applied:');
for (const [name, data] of Object.entries(debuffsByName).sort((a, b) => a[0].localeCompare(b[0]))) {
  const times = data.events.slice(0, 8).map(e => fmt(e.time)).join(', ');
  console.log(`  ${name} (ID:${data.id}) [${data.events.length}x]: ${times}${data.events.length > 8 ? '...' : ''}`);
}

// Specifically search for execution-like debuffs
console.log('\n=== EXECUTION SENTENCE SEARCH IN DEBUFFS ===');
let found = false;
for (const [name, data] of Object.entries(debuffsByName)) {
  const lower = name.toLowerCase();
  if (lower.includes('execut') || lower.includes('sentence') || lower.includes('reckoning') ||
      lower.includes('condemn') || lower.includes('censure') || lower.includes('split') ||
      lower.includes('soak')) {
    console.log(`FOUND: ${name} (ID:${data.id}) [${data.events.length}x]`);
    data.events.slice(0, 10).forEach(e => {
      console.log(`  ${fmt(e.time)} type:${e.type} target:${e.targetID} source:${e.sourceID}`);
    });
    found = true;
  }
}
if (!found) console.log('NOT FOUND in debuff events either');

// Also check damage events for anything execution-like
console.log('\n=== CHECKING DAMAGE EVENTS FOR EXECUTION ===');
const dmgData = await gql(`
  query ($code: String!, $start: Float, $end: Float) {
    reportData {
      report(code: $code) {
        events(dataType: DamageDone, startTime: $start, endTime: $end, hostilityType: Enemies, limit: 2000) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`, { code, start: fight.startTime, end: fight.endTime });

const dmgEvents = dmgData.reportData.report.events.data;
const dmgByName = {};
dmgEvents.forEach(e => {
  const gid = e.abilityGameID || 0;
  const name = abilityMap[gid] || `Unk_${gid}`;
  if (!dmgByName[name]) dmgByName[name] = 0;
  dmgByName[name]++;
});

for (const [name, count] of Object.entries(dmgByName)) {
  const lower = name.toLowerCase();
  if (lower.includes('execut') || lower.includes('sentence') || lower.includes('reckoning')) {
    console.log(`FOUND IN DAMAGE: ${name} [${count}x]`);
  }
}

// Print all damage ability names for manual inspection
console.log('\nAll damage abilities from enemies:');
for (const [name, count] of Object.entries(dmgByName).sort((a, b) => a.localeCompare(b))) {
  console.log(`  ${name} [${count}x]`);
}
