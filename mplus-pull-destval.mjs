import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function fetchAllEvents(code, fightID, sourceID, filterExpression, useTarget = false) {
  let allEvents = [];
  let nextPageTimestamp = null;

  while (true) {
    const startArg = nextPageTimestamp ? `, startTime: ${nextPageTimestamp}` : '';
    const sourceField = useTarget ? 'targetID' : 'sourceID';
    const data = await gql(`
      query($code: String!) {
        reportData {
          report(code: $code) {
            events(fightIDs: [${fightID}], ${sourceField}: ${sourceID}, filterExpression: "${filterExpression}"${startArg}) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `, { code });

    const events = data.reportData.report.events;
    allEvents = allEvents.concat(events.data);
    if (!events.nextPageTimestamp) break;
    nextPageTimestamp = events.nextPageTimestamp;
  }

  return allEvents;
}

const REPORT_CODE = 'TykFpYhmKBZPWA1M';
const FIGHT_ID = 1;
const PLAYER_ID = 4; // Destval

console.log('Pulling Destval cast data from +12 Seat of the Triumvirate...\n');

// Pull casts
console.log('Fetching casts...');
const casts = await fetchAllEvents(REPORT_CODE, FIGHT_ID, PLAYER_ID, "type in ('cast','begincast')");
console.log(`  ${casts.length} cast events`);

// Pull healing done
console.log('Fetching healing...');
const healing = await fetchAllEvents(REPORT_CODE, FIGHT_ID, PLAYER_ID, "type = 'heal'");
console.log(`  ${healing.length} healing events`);

// Pull damage done
console.log('Fetching damage done...');
const damage = await fetchAllEvents(REPORT_CODE, FIGHT_ID, PLAYER_ID, "type = 'damage'");
console.log(`  ${damage.length} damage events`);

// Pull buffs applied (atonements, rapture, etc)
console.log('Fetching buffs applied...');
const buffs = await fetchAllEvents(REPORT_CODE, FIGHT_ID, PLAYER_ID, "type in ('applybuff','removebuff','refreshbuff')");
console.log(`  ${buffs.length} buff events`);

// Pull damage taken (to see incoming damage patterns)
console.log('Fetching damage taken by party...');
const dmgTaken = await fetchAllEvents(REPORT_CODE, FIGHT_ID, PLAYER_ID, "type = 'damage'", true);
console.log(`  ${dmgTaken.length} damage taken events`);

// Save all data
const outDir = 'data/destval-mplus';
mkdirSync(outDir, { recursive: true });

const allData = { casts, healing, damage, buffs, dmgTaken };
writeFileSync(join(outDir, 'seat-12-raw.json'), JSON.stringify(allData, null, 2));
console.log(`\nSaved to ${outDir}/seat-12-raw.json`);

// ── ANALYSIS ──────────────────────────────────────────────────────

// Load spell names
const spellNames = JSON.parse(readFileSync('spell-names.json', 'utf8'));

function spellName(id) {
  return spellNames[String(id)] || `Unknown(${id})`;
}

const fightDuration = 1411; // seconds from fight data

console.log('\n' + '═'.repeat(70));
console.log('  DISC PRIEST M+ ANALYSIS — Destval — Seat +12');
console.log('═'.repeat(70));

// 1. Cast breakdown
console.log('\n── CAST COUNTS ──');
const castCounts = {};
for (const e of casts) {
  if (e.type !== 'cast') continue;
  const name = spellName(e.abilityGameID);
  castCounts[name] = (castCounts[name] || 0) + 1;
}
const sortedCasts = Object.entries(castCounts).sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedCasts) {
  const cpm = (count / (fightDuration / 60)).toFixed(1);
  console.log(`  ${name}: ${count} (${cpm}/min)`);
}

// 2. Healing breakdown
console.log('\n── HEALING BY SPELL ──');
const healBySpell = {};
for (const e of healing) {
  const name = spellName(e.abilityGameID);
  if (!healBySpell[name]) healBySpell[name] = { total: 0, overheal: 0, count: 0 };
  healBySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
  healBySpell[name].overheal += (e.overheal || 0);
  healBySpell[name].count++;
}
const sortedHeals = Object.entries(healBySpell).sort((a, b) => b[1].total - a[1].total);
let totalHealing = 0;
let totalOverheal = 0;
for (const [, v] of sortedHeals) {
  totalHealing += v.total;
  totalOverheal += v.overheal;
}

console.log(`  TOTAL: ${(totalHealing / 1e6).toFixed(2)}M healing, ${((totalOverheal / (totalHealing + totalOverheal)) * 100).toFixed(1)}% overheal`);
console.log(`  HPS: ${(totalHealing / fightDuration).toFixed(0)}`);
console.log('');

for (const [name, v] of sortedHeals.slice(0, 15)) {
  const pct = ((v.total / totalHealing) * 100).toFixed(1);
  const oh = ((v.overheal / (v.total + v.overheal)) * 100).toFixed(1);
  console.log(`  ${name}: ${(v.total / 1e6).toFixed(2)}M (${pct}%) — ${oh}% OH — ${v.count} hits`);
}

// 3. Damage done
console.log('\n── DAMAGE BY SPELL ──');
const dmgBySpell = {};
for (const e of damage) {
  const name = spellName(e.abilityGameID);
  if (!dmgBySpell[name]) dmgBySpell[name] = { total: 0, count: 0 };
  dmgBySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
  dmgBySpell[name].count++;
}
const sortedDmg = Object.entries(dmgBySpell).sort((a, b) => b[1].total - a[1].total);
let totalDmg = 0;
for (const [, v] of sortedDmg) totalDmg += v.total;

console.log(`  TOTAL: ${(totalDmg / 1e6).toFixed(2)}M damage`);
console.log(`  DPS: ${(totalDmg / fightDuration).toFixed(0)}`);
console.log('');

for (const [name, v] of sortedDmg.slice(0, 12)) {
  const pct = ((v.total / totalDmg) * 100).toFixed(1);
  console.log(`  ${name}: ${(v.total / 1e6).toFixed(2)}M (${pct}%) — ${v.count} hits`);
}

// 4. Major CD usage
console.log('\n── MAJOR COOLDOWN USAGE ──');
const majorCDs = {
  'Power Word: Barrier': { spellId: 62618, cd: 180 },
  'Evangelism': { spellId: 246287, cd: 90 },
  'Rapture': { spellId: 47536, cd: 90 },
  'Pain Suppression': { spellId: 33206, cd: 180 },
  'Power Word: Radiance': { spellId: 194509, cd: 20 },
  'Shadowfiend': { spellId: 34433, cd: 180 },
  'Mindbender': { spellId: 123040, cd: 60 },
  'Power Infusion': { spellId: 10060, cd: 120 },
  'Desperate Prayer': { spellId: 19236, cd: 90 },
};

for (const [cdName, info] of Object.entries(majorCDs)) {
  const cdCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === info.spellId);
  if (cdCasts.length > 0) {
    const maxPossible = Math.floor(fightDuration / info.cd) + 1;
    const times = cdCasts.map(e => (e.timestamp / 1000).toFixed(0) + 's');
    console.log(`  ${cdName}: ${cdCasts.length}x (max possible: ~${maxPossible}) — at ${times.join(', ')}`);
  }
}

// 5. Atonement tracking
console.log('\n── ATONEMENT ANALYSIS ──');
const atonementApply = buffs.filter(e => e.abilityGameID === 194384 && e.type === 'applybuff');
const atonementRemove = buffs.filter(e => e.abilityGameID === 194384 && e.type === 'removebuff');
console.log(`  Atonement applications: ${atonementApply.length}`);
console.log(`  Atonement removals: ${atonementRemove.length}`);

// Check PW:Shield casts (main atonement applicator in M+)
const pwsCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 17);
const pwrCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 194509);
const renewCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 139);
console.log(`  PW:Shield casts: ${pwsCasts.length} (${(pwsCasts.length / (fightDuration / 60)).toFixed(1)}/min)`);
console.log(`  PW:Radiance casts: ${pwrCasts.length} (${(pwrCasts.length / (fightDuration / 60)).toFixed(1)}/min)`);
console.log(`  Renew casts: ${renewCasts.length}`);

// 6. Smite uptime (damage filler)
console.log('\n── DPS ROTATION ──');
const smiteCasts = casts.filter(e => e.type === 'cast' && e.abilityGameID === 585);
const penance = casts.filter(e => e.type === 'cast' && (e.abilityGameID === 47540 || e.abilityGameID === 47666));
const swp = casts.filter(e => e.type === 'cast' && e.abilityGameID === 589);
const mindBlast = casts.filter(e => e.type === 'cast' && e.abilityGameID === 8092);
const swDeath = casts.filter(e => e.type === 'cast' && e.abilityGameID === 32379);
const halo = casts.filter(e => e.type === 'cast' && e.abilityGameID === 120517);
const divStar = casts.filter(e => e.type === 'cast' && e.abilityGameID === 110744);

console.log(`  Smite: ${smiteCasts.length} (${(smiteCasts.length / (fightDuration / 60)).toFixed(1)}/min)`);
console.log(`  Penance: ${penance.length} (${(penance.length / (fightDuration / 60)).toFixed(1)}/min)`);
console.log(`  Shadow Word: Pain: ${swp.length}`);
console.log(`  Mind Blast: ${mindBlast.length} (${(mindBlast.length / (fightDuration / 60)).toFixed(1)}/min)`);
console.log(`  Shadow Word: Death: ${swDeath.length}`);
console.log(`  Halo: ${halo.length}`);
console.log(`  Divine Star: ${divStar.length}`);

console.log('\n' + '═'.repeat(70));
console.log('  Analysis complete. Raw data saved to data/destval-mplus/seat-12-raw.json');
console.log('═'.repeat(70));
