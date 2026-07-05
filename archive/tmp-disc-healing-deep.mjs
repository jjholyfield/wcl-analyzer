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
const priestID = 231;

// Pull healing by target, Atonement uptime per target, damage taken by each player
const data = await gql(`
  query ($code: String!) {
    reportData {
      report(code: $code) {
        healByTarget: table(dataType: Healing, fightIDs: [${fightID}], sourceID: ${priestID}, viewBy: Target)
        healByAbility: table(dataType: Healing, fightIDs: [${fightID}], sourceID: ${priestID}, viewBy: Ability)
        dmgTaken: table(dataType: DamageTaken, fightIDs: [${fightID}])
        atonementOnTank: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID}, targetID: 127, abilityID: 194384)
        atonementOnDK: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID}, targetID: 6, abilityID: 194384)
        atonementOnEvoker: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID}, targetID: 7, abilityID: 194384)
        atonementOnHunter: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID}, targetID: 129, abilityID: 194384)
        atonementOnSelf: table(dataType: Buffs, fightIDs: [${fightID}], sourceID: ${priestID}, targetID: ${priestID}, abilityID: 194384)
      }
    }
  }
`, { code });

const r = data.reportData.report;

function getUptime(table) {
  const auras = table?.data?.auras || [];
  const totalTime = table?.data?.totalTime || 1;
  if (auras.length === 0) return { uptime: '0.0%', uses: 0 };
  const a = auras[0];
  return { uptime: (a.totalUptime / totalTime * 100).toFixed(1) + '%', uses: a.totalUses || 0 };
}

console.log('=== ATONEMENT UPTIME PER TARGET ===');
console.log(`  Sènnsei (Self):          ${JSON.stringify(getUptime(r.atonementOnSelf))}`);
console.log(`  Iconfront (Prot Warrior): ${JSON.stringify(getUptime(r.atonementOnTank))}`);
console.log(`  Cybrosaen (UH DK):        ${JSON.stringify(getUptime(r.atonementOnDK))}`);
console.log(`  Drakzeezal (Aug Evoker):   ${JSON.stringify(getUptime(r.atonementOnEvoker))}`);
console.log(`  Narìx (BM Hunter):         ${JSON.stringify(getUptime(r.atonementOnHunter))}`);

console.log('\n=== HEALING BY TARGET ===');
const healTargets = r.healByTarget?.data?.entries || [];
healTargets.sort((a, b) => b.total - a.total);
const totalHeal = healTargets.reduce((s, e) => s + e.total, 0);
healTargets.forEach(e => {
  const pct = (e.total / totalHeal * 100).toFixed(1);
  console.log(`  ${e.name}: ${e.total.toLocaleString()} (${pct}%)`);
});
console.log(`  TOTAL: ${totalHeal.toLocaleString()}`);

console.log('\n=== HEALING BY ABILITY ===');
const healAbilities = r.healByAbility?.data?.entries || [];
healAbilities.sort((a, b) => b.total - a.total);
healAbilities.forEach(e => {
  const pct = (e.total / totalHeal * 100).toFixed(1);
  console.log(`  ${e.name}: ${e.total.toLocaleString()} (${pct}%)`);
});

console.log('\n=== DAMAGE TAKEN BY PLAYER ===');
const dtEntries = r.dmgTaken?.data?.entries || [];
dtEntries.sort((a, b) => b.total - a.total);
const totalDT = dtEntries.reduce((s, e) => s + e.total, 0);
dtEntries.forEach(e => {
  const pct = (e.total / totalDT * 100).toFixed(1);
  console.log(`  ${e.name} (${e.icon || e.type}): ${e.total.toLocaleString()} (${pct}%)`);
});

// Calculate healing deficit
console.log('\n=== HEALING vs DAMAGE TAKEN (per player) ===');
const healMap = {};
healTargets.forEach(e => { healMap[e.name] = e.total; });
dtEntries.forEach(e => {
  const healed = healMap[e.name] || 0;
  const deficit = e.total - healed;
  console.log(`  ${e.name}: took ${e.total.toLocaleString()} | healed ${healed.toLocaleString()} | ${deficit > 0 ? 'DEFICIT ' + deficit.toLocaleString() : 'surplus ' + Math.abs(deficit).toLocaleString()}`);
});
