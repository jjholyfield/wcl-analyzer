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
const fightID = 4;
const priestID = 231; // Sènnsei

const data = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        casts: table(dataType: Casts, fightIDs: [${fightID}], sourceID: ${priestID})
        buffs: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID})
        healByAbility: table(dataType: Healing, fightIDs: [${fightID}], sourceID: ${priestID})
        dmgByAbility: table(dataType: DamageDone, fightIDs: [${fightID}], sourceID: ${priestID})
        debuffs: table(dataType: Debuffs, fightIDs: [${fightID}], sourceID: ${priestID})
      }
    }
  }
`, { code });

const r = data.reportData.report;
const dur = 1615; // seconds
const durMin = (dur / 60).toFixed(1);

console.log(`=== SÈNNSEI (Disc Priest) — Seat of the Triumvirate +10 — ${durMin} min ===`);

console.log('\n=== CASTS ===');
const casts = r.casts?.data?.entries || [];
casts.sort((a, b) => b.total - a.total);
casts.forEach(e => {
  const cpm = (e.total / (dur / 60)).toFixed(1);
  console.log(`  ${e.name} (ID:${e.guid}): ${e.total} casts (${cpm}/min)`);
});

console.log('\n=== HEALING BY ABILITY ===');
const healEntries = r.healByAbility?.data?.entries || [];
if (healEntries.length > 0) {
  const total = healEntries[0].total;
  const abilities = healEntries[0].abilities || [];
  abilities.sort((a, b) => b.total - a.total);
  abilities.slice(0, 20).forEach(a => {
    const pct = (a.total / total * 100).toFixed(1);
    console.log(`  ${a.name}: ${a.total.toLocaleString()} (${pct}%)`);
  });
  console.log(`  TOTAL: ${total.toLocaleString()}`);
}

console.log('\n=== DAMAGE BY ABILITY ===');
const dmgEntries = r.dmgByAbility?.data?.entries || [];
if (dmgEntries.length > 0) {
  const total = dmgEntries[0].total;
  const abilities = dmgEntries[0].abilities || [];
  abilities.sort((a, b) => b.total - a.total);
  abilities.slice(0, 15).forEach(a => {
    const pct = (a.total / total * 100).toFixed(1);
    console.log(`  ${a.name}: ${a.total.toLocaleString()} (${pct}%)`);
  });
  console.log(`  TOTAL: ${total.toLocaleString()}`);
}

console.log('\n=== KEY BUFFS (self-applied) ===');
const buffAuras = r.buffs?.data?.auras || [];
const buffTime = r.buffs?.data?.totalTime || 1;
buffAuras.sort((a, b) => (b.totalUptime || 0) - (a.totalUptime || 0));
buffAuras.slice(0, 35).forEach(a => {
  const uptime = a.totalUptime ? (a.totalUptime / buffTime * 100).toFixed(1) + '%' : 'N/A';
  console.log(`  ${a.name} (ID:${a.guid}): uptime=${uptime} uses=${a.totalUses || 0}`);
});

console.log('\n=== DEBUFFS (on enemies) ===');
const debuffAuras = r.debuffs?.data?.auras || [];
const debuffTime = r.debuffs?.data?.totalTime || 1;
debuffAuras.forEach(a => {
  const uptime = a.totalUptime ? (a.totalUptime / debuffTime * 100).toFixed(1) + '%' : 'N/A';
  console.log(`  ${a.name} (ID:${a.guid}): uptime=${uptime} uses=${a.totalUses || 0}`);
});
