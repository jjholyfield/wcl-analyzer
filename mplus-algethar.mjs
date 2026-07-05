import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

let cachedToken = null, tokenExpiry = 0;
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
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
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function fetchAllEvents(code, fightID, filterExpression, sourceID = null) {
  let allEvents = [];
  let nextPageTimestamp = null;
  while (true) {
    const startArg = nextPageTimestamp ? `, startTime: ${nextPageTimestamp}` : '';
    const sourceArg = sourceID ? `, sourceID: ${sourceID}` : '';
    const data = await gql(`
      query($code: String!) {
        reportData {
          report(code: $code) {
            events(fightIDs: [${fightID}]${sourceArg}, filterExpression: "${filterExpression}"${startArg}) {
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

const spellNames = JSON.parse(readFileSync('spell-names.json', 'utf8'));
function spellName(id) { return spellNames[String(id)] || `Unknown(${id})`; }

const REPORT_CODE = 'TykFpYhmKBZPWA1M';
const FIGHT_ID = 4; // Algeth'ar Academy +12
const PLAYER_ID = 4; // Destval
const FIGHT_DURATION = 22.1 * 60; // ~1326 seconds

console.log("Pulling Destval's Algeth'ar Academy +12 data...\n");

console.log('Fetching casts...');
const casts = await fetchAllEvents(REPORT_CODE, FIGHT_ID, "type in ('cast','begincast')", PLAYER_ID);
console.log(`  ${casts.length} cast events`);

console.log('Fetching healing...');
const healing = await fetchAllEvents(REPORT_CODE, FIGHT_ID, "type = 'heal'", PLAYER_ID);
console.log(`  ${healing.length} healing events`);

console.log('Fetching damage...');
const damage = await fetchAllEvents(REPORT_CODE, FIGHT_ID, "type = 'damage'", PLAYER_ID);
console.log(`  ${damage.length} damage events`);

console.log('Fetching party damage taken...');
const dmgTaken = await fetchAllEvents(REPORT_CODE, FIGHT_ID, "type = 'damage' and target.type = 'Player'");
console.log(`  ${dmgTaken.length} events`);

// Save raw
mkdirSync('data/destval-mplus', { recursive: true });
writeFileSync('data/destval-mplus/algethar-12-raw.json', JSON.stringify({ casts, healing, damage, dmgTaken }, null, 2));

// ═══════════════════════════════════════════════════════════════════
// ANALYSIS
// ══════════════════════��═════════════════════════════════════��══════

console.log('\n' + '═'.repeat(70));
console.log("  DISC PRIEST M+ ANALYSIS — Destval — Algeth'ar Academy +12");
console.log('═'.repeat(70));

// Cast counts
const castCounts = {};
for (const e of casts) {
  if (e.type !== 'cast') continue;
  castCounts[spellName(e.abilityGameID)] = (castCounts[spellName(e.abilityGameID)] || 0) + 1;
}

// Healing breakdown
const healBySpell = {};
for (const e of healing) {
  const name = spellName(e.abilityGameID);
  if (!healBySpell[name]) healBySpell[name] = { total: 0, overheal: 0, count: 0 };
  healBySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
  healBySpell[name].overheal += (e.overheal || 0);
  healBySpell[name].count++;
}

// Damage breakdown
const dmgBySpell = {};
for (const e of damage) {
  const name = spellName(e.abilityGameID);
  if (!dmgBySpell[name]) dmgBySpell[name] = { total: 0, count: 0 };
  dmgBySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
  dmgBySpell[name].count++;
}

let totalHeal = 0, totalOH = 0, totalDmg = 0;
for (const v of Object.values(healBySpell)) { totalHeal += v.total; totalOH += v.overheal; }
for (const v of Object.values(dmgBySpell)) totalDmg += v.total;

// ── COMPARISON TABLE: Seat vs Algeth'ar ──
// Load Seat data for comparison
const seatData = JSON.parse(readFileSync('data/destval-mplus/seat-12-raw.json', 'utf8'));
const seatCasts = {};
for (const e of seatData.casts) {
  if (e.type !== 'cast') continue;
  seatCasts[spellName(e.abilityGameID)] = (seatCasts[spellName(e.abilityGameID)] || 0) + 1;
}
let seatTotalHeal = 0, seatTotalOH = 0, seatTotalDmg = 0;
for (const e of seatData.healing) {
  seatTotalHeal += (e.amount || 0) + (e.absorbed || 0);
  seatTotalOH += (e.overheal || 0);
}
for (const e of seatData.damage) seatTotalDmg += (e.amount || 0) + (e.absorbed || 0);
const SEAT_DUR = 1411;

console.log(`\n  ${'METRIC'.padEnd(25)} | ${'SEAT +12 (raid spec)'.padEnd(22)} | ${"ALGETH'AR +12 (new)".padEnd(22)}`);
console.log('  ' + '─'.repeat(73));
console.log(`  ${'Duration'.padEnd(25)} | ${(SEAT_DUR + 's').padEnd(22)} | ${(FIGHT_DURATION.toFixed(0) + 's').padEnd(22)}`);
console.log(`  ${'Total Healing'.padEnd(25)} | ${((seatTotalHeal/1e6).toFixed(1) + 'M').padEnd(22)} | ${((totalHeal/1e6).toFixed(1) + 'M').padEnd(22)}`);
console.log(`  ${'HPS'.padEnd(25)} | ${(seatTotalHeal/SEAT_DUR).toFixed(0).padEnd(22)} | ${(totalHeal/FIGHT_DURATION).toFixed(0).padEnd(22)}`);
console.log(`  ${'Overheal %'.padEnd(25)} | ${((seatTotalOH/(seatTotalHeal+seatTotalOH))*100).toFixed(1).padEnd(22)} | ${((totalOH/(totalHeal+totalOH))*100).toFixed(1).padEnd(22)}`);
console.log(`  ${'Total Damage'.padEnd(25)} | ${((seatTotalDmg/1e6).toFixed(1) + 'M').padEnd(22)} | ${((totalDmg/1e6).toFixed(1) + 'M').padEnd(22)}`);
console.log(`  ${'DPS'.padEnd(25)} | ${(seatTotalDmg/SEAT_DUR).toFixed(0).padEnd(22)} | ${(totalDmg/FIGHT_DURATION).toFixed(0).padEnd(22)}`);

// Key abilities comparison
const keyAbilities = [
  'Smite', 'Penance', 'Mind Blast', 'Shadow Word: Death', 'Shadow Word: Pain',
  'Power Word: Shield', 'Power Word: Radiance', 'Flash Heal', 'Shadow Mend',
  'Evangelism', 'Pain Suppression', 'Ultimate Penitence', 'Power Infusion',
  'Void Shield', 'Binding Heal', 'Desperate Prayer', 'Purify',
];

console.log(`\n  ${'ABILITY'.padEnd(25)} | ${'SEAT (casts/min)'.padEnd(22)} | ${"ALGETH'AR (casts/min)".padEnd(22)} | vs TOP (+19)`);
console.log('  ' + '─'.repeat(90));

// Top disc reference numbers (from previous analysis: Injekce +19)
const topRef = {
  'Smite': 9.8, 'Penance': 8.7, 'Mind Blast': 1.2, 'Shadow Word: Death': 1.1,
  'Shadow Word: Pain': 1.8, 'Power Word: Shield': 4.5, 'Power Word: Radiance': 1.6,
  'Flash Heal': 3.9, 'Shadow Mend': 3.9, 'Evangelism': 0.5, 'Pain Suppression': 0.3,
  'Power Infusion': 0.9,
};

for (const name of keyAbilities) {
  const sCount = seatCasts[name] || 0;
  const aCount = castCounts[name] || 0;
  if (sCount === 0 && aCount === 0) continue;

  const sCpm = (sCount / (SEAT_DUR / 60)).toFixed(1);
  const aCpm = (aCount / (FIGHT_DURATION / 60)).toFixed(1);
  const sStr = `${sCount} (${sCpm})`;
  const aStr = `${aCount} (${aCpm})`;

  let ref = '';
  if (topRef[name]) {
    const diff = parseFloat(aCpm) - topRef[name];
    if (Math.abs(diff) < 0.5) ref = 'GOOD';
    else if (diff > 0) ref = `+${diff.toFixed(1)} high`;
    else ref = `${diff.toFixed(1)} low`;
  }

  console.log(`  ${name.padEnd(25)} | ${sStr.padEnd(22)} | ${aStr.padEnd(22)} | ${ref}`);
}

// Healing source breakdown
console.log(`\n\n  ${'HEALING SOURCE'.padEnd(25)} | ${'% of total heal'.padEnd(15)} | ${'Overheal %'.padEnd(12)} | ${'Hits'.padEnd(8)}`);
console.log('  ' + '─'.repeat(65));

const sortedHeals = Object.entries(healBySpell).sort((a, b) => b[1].total - a[1].total);
for (const [name, v] of sortedHeals.slice(0, 15)) {
  const pct = ((v.total / totalHeal) * 100).toFixed(1);
  const oh = ((v.overheal / (v.total + v.overheal)) * 100).toFixed(1);
  console.log(`  ${name.padEnd(25)} | ${(pct + '%').padEnd(15)} | ${(oh + '%').padEnd(12)} | ${v.count}`);
}

// Damage sources
console.log(`\n\n  ${'DAMAGE SOURCE'.padEnd(25)} | ${'% of total dmg'.padEnd(15)} | ${'Hits'.padEnd(8)}`);
console.log('  ' + '─'.repeat(52));
const sortedDmg = Object.entries(dmgBySpell).sort((a, b) => b[1].total - a[1].total);
for (const [name, v] of sortedDmg.slice(0, 12)) {
  const pct = ((v.total / totalDmg) * 100).toFixed(1);
  console.log(`  ${name.padEnd(25)} | ${(pct + '%').padEnd(15)} | ${v.count}`);
}

// Party damage timeline + Flash Heal assessment
console.log('\n\n  TOP 15 DAMAGE WINDOWS — What were you casting?');
const fightStart = Math.min(...casts.map(e => e.timestamp));
const WINDOW = 15000;
const windows = [];
for (let t = fightStart; t < fightStart + FIGHT_DURATION * 1000; t += WINDOW) {
  const wDmg = dmgTaken.filter(e => e.timestamp >= t && e.timestamp < t + WINDOW);
  const total = wDmg.reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
  const wCasts = casts.filter(e => e.timestamp >= t && e.timestamp < t + WINDOW && e.type === 'cast');
  windows.push({
    time: ((t - fightStart) / 1000).toFixed(0),
    dmg: total,
    flash: wCasts.filter(e => e.abilityGameID === 2061).length,
    shadowMend: wCasts.filter(e => e.abilityGameID === 186263).length,
    rad: wCasts.filter(e => e.abilityGameID === 194509).length,
    shield: wCasts.filter(e => e.abilityGameID === 17).length,
    evang: wCasts.filter(e => e.abilityGameID === 246287).length,
    smite: wCasts.filter(e => e.abilityGameID === 585).length,
    penance: wCasts.filter(e => e.abilityGameID === 47540 || e.abilityGameID === 47666).length,
  });
}

windows.sort((a, b) => b.dmg - a.dmg);
console.log(`  ${'Time'.padStart(6)} | ${'Dmg'.padStart(8)} | Fl | SM | Rad | Sh | Ev | Smi | Pen | Assessment`);
console.log('  ' + '─'.repeat(80));

for (const w of windows.slice(0, 15)) {
  const dmgStr = (w.dmg / 1000).toFixed(0) + 'K';
  let assessment = '';
  if (w.flash >= 2 && w.rad === 0 && w.shield === 0) assessment = 'REACTIVE';
  else if (w.shield >= 1 && w.flash === 0) assessment = 'CLEAN';
  else if (w.rad >= 1 && w.flash === 0) assessment = 'CLEAN (ramp)';
  else if ((w.smite + w.penance) >= 3 && w.flash === 0) assessment = 'CLEAN (DPS heal)';
  else if (w.flash >= 2 && (w.rad >= 1 || w.shield >= 1)) assessment = 'ramped + flash';
  else if (w.shadowMend >= 1) assessment = 'Shadow Mend usage!';
  else assessment = 'mixed';

  console.log(`  ${w.time.padStart(6)}s | ${dmgStr.padStart(8)} | ${String(w.flash).padStart(2)} | ${String(w.shadowMend).padStart(2)} | ${String(w.rad).padStart(3)} | ${String(w.shield).padStart(2)} | ${String(w.evang).padStart(2)} | ${String(w.smite).padStart(3)} | ${String(w.penance).padStart(3)} | ${assessment}`);
}

const highDmgWindows = windows.filter(w => w.dmg > 300000);
const reactive = highDmgWindows.filter(w => w.flash >= 2 && w.rad === 0 && w.shield === 0);
const clean = highDmgWindows.filter(w => w.flash === 0);
console.log(`\n  High-damage windows: ${highDmgWindows.length}`);
console.log(`  Reactive (flash spam): ${reactive.length}`);
console.log(`  Clean (atonement/DPS): ${clean.length}`);

console.log('\n' + '═'.repeat(70));
