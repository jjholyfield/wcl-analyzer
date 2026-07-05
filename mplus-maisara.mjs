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
const FIGHT_ID = 5; // Maisara Caverns +12
const PLAYER_ID = 4; // Destval
const FIGHT_DURATION = 28.4 * 60; // ~1704 seconds

console.log("Pulling Destval's Maisara Caverns +12 data...\n");

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

mkdirSync('data/destval-mplus', { recursive: true });
writeFileSync('data/destval-mplus/maisara-12-raw.json', JSON.stringify({ casts, healing, damage, dmgTaken }, null, 2));

// ═══════════════════════════════════════════════════════════════════

// Load previous runs for 3-key comparison
const seatData = JSON.parse(readFileSync('data/destval-mplus/seat-12-raw.json', 'utf8'));
const algData = JSON.parse(readFileSync('data/destval-mplus/algethar-12-raw.json', 'utf8'));

function analyze(data, duration, label) {
  const castCounts = {};
  for (const e of data.casts) {
    if (e.type !== 'cast') continue;
    castCounts[spellName(e.abilityGameID)] = (castCounts[spellName(e.abilityGameID)] || 0) + 1;
  }

  let totalHeal = 0, totalOH = 0, totalDmg = 0;
  const healBySpell = {};
  for (const e of data.healing) {
    const name = spellName(e.abilityGameID);
    if (!healBySpell[name]) healBySpell[name] = { total: 0, overheal: 0, count: 0 };
    healBySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
    healBySpell[name].overheal += (e.overheal || 0);
    healBySpell[name].count++;
    totalHeal += (e.amount || 0) + (e.absorbed || 0);
    totalOH += (e.overheal || 0);
  }
  for (const e of data.damage) totalDmg += (e.amount || 0) + (e.absorbed || 0);

  return { castCounts, healBySpell, totalHeal, totalOH, totalDmg, duration, label };
}

const SEAT_DUR = 1411;
const ALG_DUR = 1326;

const seat = analyze(seatData, SEAT_DUR, 'Seat (raid spec)');
const alg = analyze(algData, ALG_DUR, "Algeth'ar");
const mais = analyze({ casts, healing, damage, dmgTaken }, FIGHT_DURATION, 'Maisara');

console.log('\n' + '═'.repeat(85));
console.log('  3-KEY PROGRESSION — Destval Disc Priest');
console.log('═'.repeat(85));

// Summary metrics
console.log(`\n  ${'METRIC'.padEnd(22)} | ${'SEAT +12 (raid)'.padEnd(18)} | ${"ALGETH'AR +12".padEnd(18)} | ${'MAISARA +12'.padEnd(18)} | TOP REF`);
console.log('  ' + '─'.repeat(83));

const runs = [seat, alg, mais];
const topRef = { hps: 76876, dps: 55038, oh: 44.9 };

console.log(`  ${'Duration'.padEnd(22)} | ${(SEAT_DUR + 's').padEnd(18)} | ${(ALG_DUR + 's').padEnd(18)} | ${(FIGHT_DURATION.toFixed(0) + 's').padEnd(18)} |`);
console.log(`  ${'HPS'.padEnd(22)} | ${(seat.totalHeal/SEAT_DUR).toFixed(0).padEnd(18)} | ${(alg.totalHeal/ALG_DUR).toFixed(0).padEnd(18)} | ${(mais.totalHeal/FIGHT_DURATION).toFixed(0).padEnd(18)} | ${topRef.hps} (+19)`);
console.log(`  ${'DPS'.padEnd(22)} | ${(seat.totalDmg/SEAT_DUR).toFixed(0).padEnd(18)} | ${(alg.totalDmg/ALG_DUR).toFixed(0).padEnd(18)} | ${(mais.totalDmg/FIGHT_DURATION).toFixed(0).padEnd(18)} | ${topRef.dps} (+19)`);
console.log(`  ${'Overheal %'.padEnd(22)} | ${((seat.totalOH/(seat.totalHeal+seat.totalOH))*100).toFixed(1).padEnd(18)} | ${((alg.totalOH/(alg.totalHeal+alg.totalOH))*100).toFixed(1).padEnd(18)} | ${((mais.totalOH/(mais.totalHeal+mais.totalOH))*100).toFixed(1).padEnd(18)} | ${topRef.oh}`);
console.log(`  ${'Total Healing'.padEnd(22)} | ${((seat.totalHeal/1e6).toFixed(1)+'M').padEnd(18)} | ${((alg.totalHeal/1e6).toFixed(1)+'M').padEnd(18)} | ${((mais.totalHeal/1e6).toFixed(1)+'M').padEnd(18)} |`);
console.log(`  ${'Total Damage'.padEnd(22)} | ${((seat.totalDmg/1e6).toFixed(1)+'M').padEnd(18)} | ${((alg.totalDmg/1e6).toFixed(1)+'M').padEnd(18)} | ${((mais.totalDmg/1e6).toFixed(1)+'M').padEnd(18)} |`);

// Key abilities CPM comparison
const keyAbilities = [
  'Smite', 'Penance', 'Mind Blast', 'Shadow Word: Death', 'Shadow Word: Pain',
  'Power Word: Shield', 'Power Word: Radiance', 'Flash Heal', 'Shadow Mend',
  'Evangelism', 'Pain Suppression', 'Ultimate Penitence', 'Power Infusion',
  'Void Shield', 'Desperate Prayer',
];

const topCpm = {
  'Smite': 9.8, 'Penance': 8.7, 'Mind Blast': 1.2, 'Shadow Word: Death': 1.1,
  'Shadow Word: Pain': 1.8, 'Power Word: Shield': 4.5, 'Power Word: Radiance': 1.6,
  'Flash Heal': 3.9, 'Shadow Mend': 3.9, 'Evangelism': 0.5, 'Pain Suppression': 0.3,
  'Power Infusion': 0.9,
};

console.log(`\n  ${'ABILITY'.padEnd(22)} | ${'SEAT (cpm)'.padEnd(18)} | ${"ALGETH'AR (cpm)".padEnd(18)} | ${'MAISARA (cpm)'.padEnd(18)} | TOP`);
console.log('  ' + '─'.repeat(83));

for (const name of keyAbilities) {
  const sC = seat.castCounts[name] || 0;
  const aC = alg.castCounts[name] || 0;
  const mC = mais.castCounts[name] || 0;
  if (sC === 0 && aC === 0 && mC === 0) continue;

  const sCpm = (sC / (SEAT_DUR / 60)).toFixed(1);
  const aCpm = (aC / (ALG_DUR / 60)).toFixed(1);
  const mCpm = (mC / (FIGHT_DURATION / 60)).toFixed(1);

  const topVal = topCpm[name] ? topCpm[name].toFixed(1) : '';

  // Trend arrow
  let trend = '';
  const mNum = parseFloat(mCpm);
  const sNum = parseFloat(sCpm);
  if (topCpm[name]) {
    const topTarget = topCpm[name];
    const sGap = Math.abs(sNum - topTarget);
    const mGap = Math.abs(mNum - topTarget);
    if (mGap < sGap - 0.3) trend = ' improving';
    else if (mGap > sGap + 0.5) trend = ' regressing';
  }

  console.log(`  ${name.padEnd(22)} | ${(sC + ' (' + sCpm + ')').padEnd(18)} | ${(aC + ' (' + aCpm + ')').padEnd(18)} | ${(mC + ' (' + mCpm + ')').padEnd(18)} | ${topVal}${trend}`);
}

// Healing source comparison for Maisara
console.log(`\n\n  MAISARA HEALING BREAKDOWN:`);
console.log(`  ${'Source'.padEnd(25)} | ${'% heal'.padEnd(10)} | ${'Overheal'.padEnd(10)} | Hits`);
console.log('  ' + '─'.repeat(60));
const sortedHeals = Object.entries(mais.healBySpell).sort((a, b) => b[1].total - a[1].total);
for (const [name, v] of sortedHeals.slice(0, 12)) {
  const pct = ((v.total / mais.totalHeal) * 100).toFixed(1);
  const oh = ((v.overheal / (v.total + v.overheal)) * 100).toFixed(1);
  console.log(`  ${name.padEnd(25)} | ${(pct + '%').padEnd(10)} | ${(oh + '%').padEnd(10)} | ${v.count}`);
}

// Damage timeline
console.log('\n\n  TOP 15 DAMAGE WINDOWS:');
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
  if (w.flash >= 2 && w.rad === 0 && w.shield === 0 && w.shadowMend === 0) assessment = 'REACTIVE';
  else if ((w.shield >= 1 || w.rad >= 1) && w.flash === 0 && w.shadowMend === 0) assessment = 'CLEAN';
  else if ((w.smite + w.penance) >= 3 && w.flash === 0) assessment = 'CLEAN (DPS heal)';
  else if (w.shadowMend >= 1 && w.flash === 0) assessment = 'SM spot heal';
  else if (w.flash >= 2 && (w.rad >= 1 || w.shield >= 1)) assessment = 'ramped + flash';
  else assessment = 'mixed';
  console.log(`  ${w.time.padStart(6)}s | ${dmgStr.padStart(8)} | ${String(w.flash).padStart(2)} | ${String(w.shadowMend).padStart(2)} | ${String(w.rad).padStart(3)} | ${String(w.shield).padStart(2)} | ${String(w.evang).padStart(2)} | ${String(w.smite).padStart(3)} | ${String(w.penance).padStart(3)} | ${assessment}`);
}

const highDmgWindows = windows.filter(w => w.dmg > 300000);
const reactive = highDmgWindows.filter(w => w.flash >= 2 && w.rad === 0 && w.shield === 0 && w.shadowMend === 0);
const clean = highDmgWindows.filter(w => w.flash === 0);

console.log(`\n  High-damage windows: ${highDmgWindows.length}`);
console.log(`  Reactive (flash spam): ${reactive.length}`);
console.log(`  Clean (atonement/DPS): ${clean.length}`);
console.log(`  Clean rate: ${((clean.length / highDmgWindows.length) * 100).toFixed(0)}%`);

// Session progression summary
console.log('\n\n' + '═'.repeat(85));
console.log('  SESSION PROGRESSION SUMMARY');
console.log('═'.repeat(85));
console.log(`
  Key 1: Seat +12 (raid spec) — 11 reactive windows, 36% clean rate
  Key 2: Algeth'ar +12 (M+ spec) — 1 reactive window, 82% clean rate
  Key 3: Maisara +12 (M+ spec) — ${reactive.length} reactive window(s), ${((clean.length / highDmgWindows.length) * 100).toFixed(0)}% clean rate
`);

console.log('═'.repeat(85));
