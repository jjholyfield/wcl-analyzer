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

// ═══════════════════════════════════════════════════════════════════
// STEP 1: Get encounter IDs from Destval's report fights
// ═══════════════════════════════════════════════════════════════════

console.log('Step 1: Getting correct encounter IDs for current M+ season...\n');

const reportInfo = await gql(`
  query {
    reportData {
      report(code: "TykFpYhmKBZPWA1M") {
        fights {
          id
          encounterID
          name
          keystoneLevel
        }
      }
    }
  }
`);

const seatFight = reportInfo.reportData.report.fights.find(f => f.name?.includes('Seat'));
console.log(`  Seat of the Triumvirate encounter ID: ${seatFight.encounterID}`);

// Also check the longer session for encounter IDs
const sessionInfo = await gql(`
  query {
    reportData {
      report(code: "YVQ68WvjrH2dpKx9") {
        fights(killType: Encounters) {
          id
          encounterID
          name
          keystoneLevel
        }
      }
    }
  }
`);

const encounters = new Map();
for (const f of sessionInfo.reportData.report.fights) {
  if (f.encounterID && f.name) encounters.set(f.encounterID, f.name);
}
console.log('\n  Current season M+ encounter IDs:');
for (const [id, name] of encounters) {
  console.log(`    ${id}: ${name}`);
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2: Pull rankings for Disc Priest on Seat
// ═══════════════════════════════════════════════════════════════════

const SEAT_ENCOUNTER_ID = seatFight.encounterID;
console.log(`\n\nStep 2: Fetching Disc Priest rankings for Seat (encounter ${SEAT_ENCOUNTER_ID})...\n`);

const rankings = await gql(`
  query($encId: Int!) {
    worldData {
      encounter(id: $encId) {
        name
        characterRankings(
          className: "Priest"
          specName: "Discipline"
          metric: hps
        )
      }
    }
  }
`, { encId: SEAT_ENCOUNTER_ID });

const rankList = rankings.worldData.encounter.characterRankings?.rankings || [];
console.log(`  Found ${rankList.length} ranked Disc Priests on ${rankings.worldData.encounter.name}`);

if (rankList.length > 0) {
  console.log('\n  Top 5:');
  for (const r of rankList.slice(0, 5)) {
    const dur = (r.duration / 1000 / 60).toFixed(1);
    console.log(`    ${r.name}-${r.server.name} | +${r.hardModeLevel} | ${r.amount.toFixed(0)} HPS | ${dur}min | ${r.report.code}#${r.report.fightID}`);
  }

  // Pick one near +12 key level for fair comparison, or closest match
  const targetLevel = 12;
  let comparison = rankList.find(r => r.hardModeLevel === targetLevel);
  if (!comparison) {
    // Find closest to +12
    comparison = rankList.sort((a, b) => Math.abs(a.hardModeLevel - targetLevel) - Math.abs(b.hardModeLevel - targetLevel))[0];
  }

  console.log(`\n  Selected for comparison: ${comparison.name}-${comparison.server.name} (+${comparison.hardModeLevel}, ${comparison.amount.toFixed(0)} HPS)`);
  console.log(`  Report: ${comparison.report.code} fight ${comparison.report.fightID}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Pull the comparison player's data
  // ═══════════════════════════════════════════════════════════════════

  console.log(`\n\nStep 3: Pulling ${comparison.name}'s cast data...\n`);

  // Get actor ID from their report
  const compReport = await gql(`
    query($code: String!) {
      reportData {
        report(code: $code) {
          title
          fights {
            id
            encounterID
            name
            keystoneLevel
            startTime
            endTime
            kill
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
  `, { code: comparison.report.code });

  const compFight = compReport.reportData.report.fights.find(f => f.id === comparison.report.fightID);
  const compPlayer = compReport.reportData.report.masterData.actors.find(
    a => a.name.toLowerCase() === comparison.name.toLowerCase()
  );

  if (!compPlayer) {
    console.log('  Could not find player in report actors!');
    console.log('  Available:', compReport.reportData.report.masterData.actors.filter(a => a.subType === 'Priest').map(a => a.name));
    process.exit(1);
  }

  console.log(`  Found: ${compPlayer.name} (actor ${compPlayer.id}) in "${compReport.reportData.report.title}"`);
  const compFightDur = (compFight.endTime - compFight.startTime) / 1000;
  console.log(`  Fight: ${compFight.name} +${compFight.keystoneLevel} — ${compFightDur.toFixed(0)}s`);

  // Pull their casts
  console.log('\n  Fetching casts...');
  const compCasts = await fetchAllEvents(comparison.report.code, comparison.report.fightID,
    "type in ('cast','begincast')", compPlayer.id);
  console.log(`    ${compCasts.length} cast events`);

  // Pull their healing
  console.log('  Fetching healing...');
  const compHealing = await fetchAllEvents(comparison.report.code, comparison.report.fightID,
    "type = 'heal'", compPlayer.id);
  console.log(`    ${compHealing.length} healing events`);

  // Pull their damage
  console.log('  Fetching damage...');
  const compDamage = await fetchAllEvents(comparison.report.code, comparison.report.fightID,
    "type = 'damage'", compPlayer.id);
  console.log(`    ${compDamage.length} damage events`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Side-by-side comparison
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n\n' + '═'.repeat(70));
  console.log('  SIDE-BY-SIDE COMPARISON');
  console.log('═'.repeat(70));

  const destvalDur = 1411; // seconds

  // Helper to count casts per spell
  function countCasts(events) {
    const counts = {};
    for (const e of events) {
      if (e.type !== 'cast') continue;
      const name = spellName(e.abilityGameID);
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }

  function healBreakdown(events) {
    const bySpell = {};
    for (const e of events) {
      const name = spellName(e.abilityGameID);
      if (!bySpell[name]) bySpell[name] = { total: 0, overheal: 0, count: 0 };
      bySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
      bySpell[name].overheal += (e.overheal || 0);
      bySpell[name].count++;
    }
    return bySpell;
  }

  function dmgBreakdown(events) {
    const bySpell = {};
    for (const e of events) {
      const name = spellName(e.abilityGameID);
      if (!bySpell[name]) bySpell[name] = { total: 0, count: 0 };
      bySpell[name].total += (e.amount || 0) + (e.absorbed || 0);
      bySpell[name].count++;
    }
    return bySpell;
  }

  const destvalRaw = JSON.parse(readFileSync('data/destval-mplus/seat-12-raw.json', 'utf8'));
  const dCasts = countCasts(destvalRaw.casts);
  const cCasts = countCasts(compCasts);

  const dHeals = healBreakdown(destvalRaw.healing);
  const cHeals = healBreakdown(compHealing);

  const dDmg = dmgBreakdown(destvalRaw.damage);
  const cDmg = dmgBreakdown(compDamage);

  // Total healing/damage
  let dTotalHeal = 0, dTotalOH = 0, cTotalHeal = 0, cTotalOH = 0;
  for (const v of Object.values(dHeals)) { dTotalHeal += v.total; dTotalOH += v.overheal; }
  for (const v of Object.values(cHeals)) { cTotalHeal += v.total; cTotalOH += v.overheal; }

  let dTotalDmg = 0, cTotalDmg = 0;
  for (const v of Object.values(dDmg)) dTotalDmg += v.total;
  for (const v of Object.values(cDmg)) cTotalDmg += v.total;

  console.log(`\n  ${'METRIC'.padEnd(25)} | ${'DESTVAL (+12)'.padEnd(18)} | ${'TOP DISC (+' + comparison.hardModeLevel + ')'.padEnd(18)}`);
  console.log('  ' + '─'.repeat(65));
  console.log(`  ${'Key Level'.padEnd(25)} | ${'+12'.padEnd(18)} | ${('+' + comparison.hardModeLevel).padEnd(18)}`);
  console.log(`  ${'Duration'.padEnd(25)} | ${(destvalDur + 's').padEnd(18)} | ${(compFightDur.toFixed(0) + 's').padEnd(18)}`);
  console.log(`  ${'Total Healing'.padEnd(25)} | ${((dTotalHeal / 1e6).toFixed(1) + 'M').padEnd(18)} | ${((cTotalHeal / 1e6).toFixed(1) + 'M').padEnd(18)}`);
  console.log(`  ${'HPS'.padEnd(25)} | ${(dTotalHeal / destvalDur).toFixed(0).padEnd(18)} | ${(cTotalHeal / compFightDur).toFixed(0).padEnd(18)}`);
  console.log(`  ${'Overheal %'.padEnd(25)} | ${((dTotalOH / (dTotalHeal + dTotalOH)) * 100).toFixed(1).padEnd(18)} | ${((cTotalOH / (cTotalHeal + cTotalOH)) * 100).toFixed(1).padEnd(18)}`);
  console.log(`  ${'Total Damage'.padEnd(25)} | ${((dTotalDmg / 1e6).toFixed(1) + 'M').padEnd(18)} | ${((cTotalDmg / 1e6).toFixed(1) + 'M').padEnd(18)}`);
  console.log(`  ${'DPS'.padEnd(25)} | ${(dTotalDmg / destvalDur).toFixed(0).padEnd(18)} | ${(cTotalDmg / compFightDur).toFixed(0).padEnd(18)}`);

  // Key ability comparison
  const keyAbilities = [
    ['Smite', 'Smite'],
    ['Penance', 'Penance'],
    ['Mind Blast', 'Mind Blast'],
    ['Shadow Word: Death', 'Shadow Word: Death'],
    ['Shadow Word: Pain', 'Shadow Word: Pain'],
    ['Power Word: Shield', 'Power Word: Shield'],
    ['Power Word: Radiance', 'Power Word: Radiance'],
    ['Flash Heal', 'Flash Heal'],
    ['Evangelism', 'Evangelism'],
    ['Pain Suppression', 'Pain Suppression'],
    ['Ultimate Penitence', 'Ultimate Penitence'],
    ['Rapture', 'Rapture'],
    ['Power Infusion', 'Power Infusion'],
    ['Shadowfiend', 'Shadowfiend'],
    ['Mindbender', 'Mindbender'],
  ];

  console.log(`\n\n  ${'ABILITY'.padEnd(25)} | ${'DESTVAL (casts/min)'.padEnd(18)} | ${'TOP DISC (casts/min)'.padEnd(18)}`);
  console.log('  ' + '─'.repeat(65));

  for (const [name] of keyAbilities) {
    const dCount = dCasts[name] || 0;
    const cCount = cCasts[name] || 0;
    if (dCount === 0 && cCount === 0) continue;

    const dCpm = (dCount / (destvalDur / 60)).toFixed(1);
    const cCpm = (cCount / (compFightDur / 60)).toFixed(1);
    const dStr = `${dCount} (${dCpm})`;
    const cStr = `${cCount} (${cCpm})`;

    let flag = '';
    const dCpmNum = parseFloat(dCpm);
    const cCpmNum = parseFloat(cCpm);
    if (dCpmNum > 0 && cCpmNum > 0) {
      if (dCpmNum < cCpmNum * 0.7) flag = ' <<< LOW';
      else if (dCpmNum > cCpmNum * 1.5) flag = ' ** HIGH';
    } else if (dCount > 0 && cCount === 0) {
      flag = ' (they skip this)';
    } else if (dCount === 0 && cCount > 0) {
      flag = ' <<< MISSING';
    }

    console.log(`  ${name.padEnd(25)} | ${dStr.padEnd(18)} | ${cStr.padEnd(18)}${flag}`);
  }

  // Healing source comparison
  console.log(`\n\n  ${'HEALING SOURCE'.padEnd(25)} | ${'DESTVAL (% total)'.padEnd(18)} | ${'TOP DISC (% total)'.padEnd(18)}`);
  console.log('  ' + '─'.repeat(65));

  const healSources = ['Atonement', 'Penance', 'Power Word: Radiance', 'Flash Heal', 'Piety',
    'Prayer of Mending', 'Binding Heal', 'Leech', 'Desperate Prayer', 'Ultimate Penitence'];

  for (const name of healSources) {
    const dH = dHeals[name];
    const cH = cHeals[name];
    const dPct = dH ? ((dH.total / dTotalHeal) * 100).toFixed(1) + '%' : '—';
    const cPct = cH ? ((cH.total / cTotalHeal) * 100).toFixed(1) + '%' : '—';
    const dOH = dH ? ((dH.overheal / (dH.total + dH.overheal)) * 100).toFixed(0) + '% OH' : '';
    const cOH = cH ? ((cH.overheal / (cH.total + cH.overheal)) * 100).toFixed(0) + '% OH' : '';

    if (!dH && !cH) continue;
    console.log(`  ${name.padEnd(25)} | ${(dPct + ' ' + dOH).padEnd(18)} | ${(cPct + ' ' + cOH).padEnd(18)}`);
  }

  // Also dump what the top disc is casting that Destval isn't
  console.log('\n\n  SPELLS TOP DISC CASTS THAT DESTVAL DOESN\'T:');
  console.log('  ' + '─'.repeat(50));
  const cSorted = Object.entries(cCasts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of cSorted) {
    if (!dCasts[name] && count >= 3) {
      console.log(`    ${name}: ${count} (${(count / (compFightDur / 60)).toFixed(1)}/min)`);
    }
  }

  console.log('\n\n  SPELLS DESTVAL CASTS THAT TOP DISC DOESN\'T:');
  console.log('  ' + '─'.repeat(50));
  const dSorted = Object.entries(dCasts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of dSorted) {
    if (!cCasts[name] && count >= 3) {
      console.log(`    ${name}: ${count} (${(count / (destvalDur / 60)).toFixed(1)}/min)`);
    }
  }

} else {
  console.log('  No rankings found for this encounter. Trying alternative...');
}

// ═══════════════════════════════════════════════════════════════════
// STEP 5: Pull party-wide damage taken for Destval's run (all players)
// ═══════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('  PARTY DAMAGE TAKEN TIMELINE (Destval\'s +12 Seat)');
console.log('═'.repeat(70));

console.log('\n  Fetching all damage taken events in the dungeon...');
const allDmgTaken = await fetchAllEvents('TykFpYhmKBZPWA1M', 1,
  "type = 'damage' and target.type = 'Player'");
console.log(`  ${allDmgTaken.length} total damage events on players`);

// Break into 15-second windows and find the spikiest ones
const destvalRaw2 = JSON.parse(readFileSync('data/destval-mplus/seat-12-raw.json', 'utf8'));
const fightStart = Math.min(...destvalRaw2.casts.map(e => e.timestamp));

const WINDOW = 15000;
const dmgWindows = [];
for (let t = fightStart; t < fightStart + 1411000; t += WINDOW) {
  const windowEvents = allDmgTaken.filter(e => e.timestamp >= t && e.timestamp < t + WINDOW);
  const totalDmg = windowEvents.reduce((sum, e) => sum + (e.amount || 0) + (e.absorbed || 0), 0);

  // Destval's casts in this window
  const windowCasts = destvalRaw2.casts.filter(e => e.timestamp >= t && e.timestamp < t + WINDOW && e.type === 'cast');
  const flashCount = windowCasts.filter(e => e.abilityGameID === 2061).length;
  const radCount = windowCasts.filter(e => e.abilityGameID === 194509).length;
  const evangCount = windowCasts.filter(e => e.abilityGameID === 246287).length;
  const smiteCount = windowCasts.filter(e => e.abilityGameID === 585).length;
  const penCount = windowCasts.filter(e => e.abilityGameID === 47540 || e.abilityGameID === 47666).length;

  dmgWindows.push({
    time: ((t - fightStart) / 1000).toFixed(0),
    dmg: totalDmg,
    flash: flashCount,
    rad: radCount,
    evang: evangCount,
    smite: smiteCount,
    penance: penCount,
  });
}

// Show top 20 damage windows
dmgWindows.sort((a, b) => b.dmg - a.dmg);
console.log('\n  TOP 20 HEAVIEST DAMAGE WINDOWS (15s each) — What were you casting?');
console.log(`  ${'Time'.padStart(6)} | ${'Party Dmg'.padStart(10)} | Flash | Rad | Ev | Smite | Pen | Assessment`);
console.log('  ' + '─'.repeat(75));

for (const w of dmgWindows.slice(0, 20)) {
  const dmgStr = (w.dmg / 1000).toFixed(0) + 'K';
  let assessment = '';
  if (w.flash >= 2 && w.rad === 0) assessment = 'REACTIVE — flash spam, no atonement prep';
  else if (w.flash >= 2 && w.rad >= 1) assessment = 'ramped but still needed flash';
  else if (w.rad >= 1 && w.flash === 0) assessment = 'CLEAN — healed through atonement';
  else if (w.smite + w.penance >= 3 && w.flash === 0) assessment = 'CLEAN — DPS healing';
  else if (w.flash === 1) assessment = 'spot heal (ok)';

  console.log(`  ${w.time.padStart(6)}s | ${dmgStr.padStart(10)} | ${String(w.flash).padStart(5)} | ${String(w.rad).padStart(3)} | ${String(w.evang).padStart(2)} | ${String(w.smite).padStart(5)} | ${String(w.penance).padStart(3)} | ${assessment}`);
}

console.log('\n  SUMMARY:');
const highDmgWindows = dmgWindows.filter(w => w.dmg > 300000);
const reactiveWindows = highDmgWindows.filter(w => w.flash >= 2 && w.rad === 0);
const cleanWindows = highDmgWindows.filter(w => w.flash === 0);
console.log(`  High-damage windows (>300K): ${highDmgWindows.length}`);
console.log(`  Reactive (flash spam, no ramp): ${reactiveWindows.length}`);
console.log(`  Clean (healed through atonement/DPS): ${cleanWindows.length}`);
