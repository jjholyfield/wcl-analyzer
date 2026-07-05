import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
const CLIENT_SECRET = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();

let cachedToken = null;
let tokenExpiry = 0;

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

async function gql(query) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchAllEvents(reportCode, fightId, sourceId, dataType) {
  let all = [];
  let nextPage = null;
  while (true) {
    const timeFilter = nextPage ? `startTime: ${nextPage},` : '';
    const data = await gql(`{
      reportData {
        report(code: "${reportCode}") {
          events(
            fightIDs: [${fightId}]
            dataType: ${dataType}
            sourceID: ${sourceId}
            ${timeFilter}
            limit: 10000
          ) { data nextPageTimestamp }
        }
      }
    }`);
    const result = data.reportData.report.events;
    if (result.data?.length > 0) all = all.concat(result.data);
    if (!result.nextPageTimestamp) break;
    nextPage = result.nextPageTimestamp;
  }
  return all;
}

const SOOTHING_MIST = 115175;
const VIVIFY = 116670;
const ENVELOPING_MIST = 124682;

const SPELL_NAMES = {
  115175: 'Soothing Mist',
  116670: 'Vivify',
  124682: 'Enveloping Mist',
  115151: 'Renewing Mist',
  191837: 'Essence Font',
  116680: 'Thunder Focus Tea',
  443028: 'Celestial Conduit',
  115310: 'Revival',
  388615: 'Restoral',
  322118: "Invoke Yu'lon",
  325197: 'Invoke Chi-Ji',
  116849: 'Life Cocoon',
  100780: 'Tiger Palm',
  100784: 'Blackout Kick',
  228649: 'Blackout Kick',
  107428: 'Rising Sun Kick',
  185099: 'Rising Sun Kick',
  101546: 'Spinning Crane Kick',
  388193: 'Jadefire Stomp',
  327104: 'Jadefire Stomp',
  123986: 'Chi Burst',
  325216: 'Bonedust Brew',
  1: 'Melee',
};

function spellName(id) { return SPELL_NAMES[id] || `spell-${id}`; }

// Players to analyze
const PLAYERS = [
  { label: '#1 Uroegmonk', report: 'TqBdyt79nLhZrXpP', fight: 22, name: 'Uroegmonk' },
  { label: '#2 Pandathunder', report: 'bL6gtW7MhV4JqP12', fight: 4, name: 'Pandathunder' },
  { label: '#3 Kelvsta', report: 'Mw3DyQnNzHCXaP8h', fight: 82, name: 'Kelvsta' },
  { label: '#5 珂雪', report: 'FQqNpWjdY9ArPL31', fight: 37, name: '珂雪' },
  { label: 'Senssay (YOU)', report: 'FgbKj64vPNc9HAVa', fight: 13, name: 'Senssay' },
];

async function analyzePlayer(p) {
  // Find sourceID
  const meta = await gql(`{
    reportData {
      report(code: "${p.report}") {
        playerDetails(fightIDs: [${p.fight}])
        fights(fightIDs: [${p.fight}]) { id startTime endTime }
      }
    }
  }`);

  const details = meta.reportData.report.playerDetails?.data?.playerDetails;
  const fight = meta.reportData.report.fights[0];
  let sourceId = null;

  for (const role of Object.values(details || {})) {
    if (!Array.isArray(role)) continue;
    for (const pl of role) {
      if (pl.name === p.name) { sourceId = pl.id; break; }
    }
    if (sourceId) break;
  }

  if (!sourceId) { console.log(`  ${p.label}: NOT FOUND`); return null; }

  // Pull ALL events (casts + begincast) to see Soothing Mist channels
  const casts = await fetchAllEvents(p.report, p.fight, sourceId, 'Casts');
  const fightStart = fight.startTime;
  const duration = (fight.endTime - fight.startTime) / 1000;

  // Look at cast events — Soothing Mist shows as begincast (channel start)
  // then Vivify/EM while channeling are instant (no begincast)
  const allEvents = casts.sort((a, b) => a.timestamp - b.timestamp);

  // Track Soothing Mist channel windows
  let soothingActive = false;
  let soothingStart = null;
  let soothingTarget = null;
  let soothingWindows = [];
  let castsInSoothing = [];
  let castsFreestanding = [];

  // Soothing Mist: begincast event starts it, any other cast ends it
  // Or it can be canceled. Let's track by looking at sequences.

  // Actually, let's just look at the raw sequence:
  // If Soothing Mist appears as a cast/begincast, and then Vivify/EM follows
  // within ~0.5s or at the same timestamp, it was cast during Soothing.

  // Better approach: look for Soothing Mist begincast events and track
  // whether Vivify/EM casts happen while soothing is active.

  // Simplest approach: look at pairs — if Soothing Mist cast is followed by
  // Vivify or EM, that's a SooM-weave pattern.

  let soothCount = 0;
  let vivAfterSooth = 0;
  let emAfterSooth = 0;
  let vivTotal = 0;
  let emTotal = 0;

  // Build timeline of all casts
  const timeline = allEvents
    .filter(e => e.type === 'cast' || e.type === 'begincast')
    .map(e => ({
      time: (e.timestamp - fightStart) / 1000,
      timestamp: e.timestamp,
      spell: e.abilityGameID,
      name: spellName(e.abilityGameID),
      type: e.type,
      target: e.targetID,
    }));

  // Count Soothing Mist channels
  const soothEvents = timeline.filter(e => e.spell === SOOTHING_MIST);
  soothCount = soothEvents.length;

  // For each Vivify/EM cast, check if a Soothing Mist was active
  // Soothing Mist lasts until canceled or another hardcast begins
  // If SooM begincast happened and next non-instant cast is Viv/EM, it's a weave

  // Track soothing windows
  let soothWindows = [];
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].spell === SOOTHING_MIST) {
      const start = timeline[i].timestamp;
      // Find when soothing ends: next cast that ISN'T Vivify/EM/Soothing tick
      // Actually soothing is a channel that auto-cancels when you cast Vivify/EM
      // But Vivify/EM during soothing are INSTANT
      // So the pattern is: SooM -> Viv (instant, doesn't cancel) -> Viv -> etc
      // SooM ends when you cast something else or move

      // For our purposes: everything after SooM until a non-Viv/EM cast is "in soothing"
      let end = start;
      for (let j = i + 1; j < timeline.length; j++) {
        if (timeline[j].spell === VIVIFY || timeline[j].spell === ENVELOPING_MIST) {
          end = timeline[j].timestamp;
        } else {
          break;
        }
      }
      soothWindows.push({ start, end, startTime: timeline[i].time });
    }
  }

  // For each Vivify/EM, check if it falls within a soothing window
  for (const e of timeline) {
    if (e.spell === VIVIFY) {
      vivTotal++;
      const inSooth = soothWindows.some(w => e.timestamp > w.start && e.timestamp <= w.end + 500);
      if (inSooth) vivAfterSooth++;
    }
    if (e.spell === ENVELOPING_MIST) {
      emTotal++;
      const inSooth = soothWindows.some(w => e.timestamp > w.start && e.timestamp <= w.end + 500);
      if (inSooth) emAfterSooth++;
    }
  }

  // Also check: consecutive cast patterns
  // Look for SooM -> Viv or SooM -> EM pairs (within 1.5s)
  let pairsSOV = 0; // Soothing -> Vivify
  let pairsSOE = 0; // Soothing -> EM
  let soothFollowedByCast = [];

  for (let i = 0; i < timeline.length - 1; i++) {
    if (timeline[i].spell === SOOTHING_MIST) {
      const next = timeline[i + 1];
      const gap = (next.timestamp - timeline[i].timestamp) / 1000;
      soothFollowedByCast.push({ time: timeline[i].time, nextSpell: next.name, gap: gap.toFixed(2) });
      if (next.spell === VIVIFY) pairsSOV++;
      if (next.spell === ENVELOPING_MIST) pairsSOE++;
    }
  }

  return {
    label: p.label,
    duration,
    soothCount,
    soothCPM: (soothCount / (duration / 60)).toFixed(1),
    vivTotal,
    vivAfterSooth,
    vivPctInSooth: vivTotal > 0 ? ((vivAfterSooth / vivTotal) * 100).toFixed(0) : '0',
    emTotal,
    emAfterSooth,
    emPctInSooth: emTotal > 0 ? ((emAfterSooth / emTotal) * 100).toFixed(0) : '0',
    pairsSOV,
    pairsSOE,
    soothFollowedByCast,
    soothWindows,
  };
}

async function main() {
  console.log('='.repeat(100));
  console.log('  SOOTHING MIST ANALYSIS: Is SooM being channeled before Vivify/EM?');
  console.log('='.repeat(100));
  console.log();

  for (const p of PLAYERS) {
    console.log(`  Analyzing ${p.label}...`);
    const result = await analyzePlayer(p);
    if (!result) continue;

    const isJosh = p.name === 'Senssay';
    const tag = isJosh ? ' <<<' : '';

    console.log(`  ${result.label} (${result.duration.toFixed(0)}s fight)${tag}`);
    console.log(`    Soothing Mist casts: ${result.soothCount} (${result.soothCPM}/min)`);
    console.log(`    Vivify: ${result.vivTotal} total, ${result.vivAfterSooth} during SooM (${result.vivPctInSooth}%)`);
    console.log(`    Enveloping Mist: ${result.emTotal} total, ${result.emAfterSooth} during SooM (${result.emPctInSooth}%)`);
    console.log(`    SooM→Vivify pairs: ${result.pairsSOV} | SooM→EM pairs: ${result.pairsSOE}`);
    console.log();

    if (result.soothFollowedByCast.length > 0) {
      console.log(`    Every SooM cast and what followed:`);
      for (const s of result.soothFollowedByCast) {
        console.log(`      ${s.time.toFixed(1)}s: SooM → ${s.nextSpell} (${s.gap}s gap)`);
      }
      console.log();
    }
  }

  console.log('='.repeat(100));
  console.log('  SUMMARY');
  console.log('='.repeat(100));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
