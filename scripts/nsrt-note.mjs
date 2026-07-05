/**
 * Generate distribution formats from a boss plan JSON:
 *   1. NSRT import string  — per-player TTS reminders in-game (paste via /ns > Shared Notes > Import)
 *   2. MRT display note    — classic {time:m:ss}{spell:id}Name block for the note frame
 *   3. Discord block       — human-readable plan
 *
 * Usage:
 *   node scripts/nsrt-note.mjs <plan.json> [rosterReportCode]
 *
 * The rosterReportCode arg is the roster preflight: every player tag in the plan is
 * exact-matched (accents included) against actor names in that log. A tag that does not
 * exact-match a log name means the reminder SILENTLY NEVER FIRES in game — run the
 * preflight against a recent report before shipping any note. The generator also
 * validates every (player, spell) chain against base cooldowns and flags zero-margin.
 *
 * CRITICAL DIALECT FACTS (verified against NSRT source, 2026-07-04):
 * - NSRT does NOT parse {time:m:ss} brace syntax. Its dialect is semicolon key:value,
 *   time in PLAIN SECONDS, and requires an "EncounterID:...;Name:...;Difficulty:..." header line.
 * - tag: is the per-player targeting — only matching players get the alert + TTS.
 *   Valid tags: character name (no realm), tank/healer/damager, groupN, melee/ranged, everyone.
 * - TTS speaks 5s early by default (TTSTimer). countdown:N adds a spoken countdown.
 * - We emit ph:1 pull-relative times. Phase-relative (ph:N) requires NSRT's per-boss module;
 *   our boss timelines are stable across pulls, so pull-relative is correct for prep notes.
 *
 * Plan JSON shape:
 * {
 *   "encounterID": 3181, "bossName": "Crown of the Cosmos", "difficulty": "Mythic",
 *   "sections": [{ "label": "P1 (0:00-2:14)", "from": 0, "to": 134 }],   // optional, Discord/MRT grouping
 *   "reminders": [
 *     { "time": "1:00", "players": ["Voidheart"], "spellId": 62618, "countdown": 3 },
 *     { "time": "0:55", "players": ["everyone"], "text": "Defensives", "tts": "Defensives" }
 *   ]
 * }
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { fmt, lcName, gql } from './wcl-lib.mjs';
import { SPELL_CDS, CD_ALIASES } from './spell-cooldowns.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [planPath, rosterReport] = process.argv.slice(2);
if (!planPath) {
  console.error('Usage: node scripts/nsrt-note.mjs <plan.json> [rosterReportCode]');
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

const ROLE_TAGS = new Set(['everyone', 'tank', 'healer', 'damager', 'melee', 'ranged']);

// Spell names for readable output (project root spell-names.json, 3469 entries)
let spellNames = {};
const snPath = join(__dirname, '..', 'spell-names.json');
if (existsSync(snPath)) spellNames = JSON.parse(readFileSync(snPath, 'utf8'));
const spellName = id => spellNames[id] || 'spell:' + id;

const toSec = t => {
  if (typeof t === 'number') return t;
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};

const reminders = plan.reminders
  .map(r => ({ ...r, sec: toSec(r.time) }))
  .sort((a, b) => a.sec - b.sec);

for (const r of reminders) {
  if (!r.players?.length) throw new Error('Reminder @ ' + fmt(r.sec) + ' has no players');
  if (!r.spellId && !r.text) throw new Error('Reminder @ ' + fmt(r.sec) + ' needs spellId or text');
}

// ── Roster preflight: every named tag must EXACT-match a log actor name ──
if (rosterReport) {
  const rd = await gql('{ reportData { report(code: "' + rosterReport + '") { masterData { actors(type: "Player") { name } } } } }');
  const logNames = rd.reportData.report.masterData.actors.map(a => a.name);
  const exact = new Set(logNames);
  const failures = [];
  const planned = [...new Set(reminders.flatMap(r => r.players))].filter(p => !ROLE_TAGS.has(p.toLowerCase()));
  for (const p of planned) {
    if (exact.has(p)) continue;
    const suggestion = logNames.find(n => lcName(n) === lcName(p));
    failures.push('  "' + p + '"' + (suggestion ? ' — log has "' + suggestion + '" (fix the plan to match EXACTLY, accents included)' : ' — no similar name in log (typo? bench? realm suffix?)'));
  }
  if (failures.length) {
    console.error('ROSTER PREFLIGHT FAILED — these tags will SILENTLY NEVER FIRE in game:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('Roster preflight vs ' + rosterReport + ': all ' + planned.length + ' player tags exact-match. OK.\n');
} else {
  console.log('⚠ No rosterReportCode given — player tags NOT validated against a log. Run with a recent report code before shipping.\n');
}

// ── Cooldown feasibility: no assignment may precede its CD; flag zero-margin chains ──
const cdAliasBase = id => Number(Object.keys(CD_ALIASES).find(k => CD_ALIASES[k].includes(id)) || id);
const chains = {};
for (const r of reminders) {
  if (!r.spellId) continue;
  for (const p of r.players) chains[p + '|' + cdAliasBase(r.spellId)] ||= [], chains[p + '|' + cdAliasBase(r.spellId)].push(r.sec);
}
const errors = [], zeroMargin = [];
for (const [key, times] of Object.entries(chains)) {
  const [player, sid] = key.split('|');
  const cd = SPELL_CDS[Number(sid)];
  if (!cd) { console.log('⚠ No base cooldown known for spell ' + sid + ' (' + player + ') — chain not validated'); continue; }
  const sorted = [...times].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    const label = player + ' ' + spellName(Number(sid)) + ' ' + fmt(sorted[i - 1]) + ' → ' + fmt(sorted[i]) + ' (gap ' + gap + 's, CD ' + cd + 's)';
    if (gap < cd) errors.push('  IMPOSSIBLE: ' + label);
    else if (gap - cd <= 5) zeroMargin.push('  ZERO-MARGIN: ' + label + ' — must be pressed ON the callout, no slack');
  }
}
if (errors.length) {
  console.error('COOLDOWN VALIDATION FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
if (zeroMargin.length) console.log('Zero-margin chains (valid but unforgiving):\n' + zeroMargin.join('\n') + '\n');

// ── 1. NSRT import string (one line per player — single-name tags are the verified path) ──
const nsrtLines = ['EncounterID:' + plan.encounterID + ';Name:' + plan.bossName + ';Difficulty:' + (plan.difficulty || 'Mythic')];
for (const r of reminders) {
  for (const p of r.players) {
    const parts = ['time:' + r.sec, 'ph:1', 'tag:' + p];
    if (r.spellId) parts.push('spellid:' + r.spellId);
    if (r.text) parts.push('text:' + r.text);
    if (r.tts) parts.push('TTS:' + r.tts);
    if (r.ttsTimer) parts.push('TTSTimer:' + r.ttsTimer);
    if (r.countdown) parts.push('countdown:' + r.countdown);
    if (r.dur) parts.push('dur:' + r.dur);
    nsrtLines.push(parts.join(';'));
  }
}
const nsrtBlock = nsrtLines.join('\n');

// ── 2. MRT display note (grouped by section, co-timed reminders merged per line) ──
const sections = plan.sections?.length ? plan.sections : [{ label: plan.bossName, from: 0, to: Infinity }];
const mrtLines = [];
for (const s of sections) {
  mrtLines.push('|cffffff00--- ' + s.label + ' ---|r');
  const inSection = reminders.filter(r => r.sec >= s.from && r.sec < s.to);
  const byTime = {};
  inSection.forEach(r => { (byTime[r.sec] ||= []).push(r); });
  for (const [sec, rs] of Object.entries(byTime).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const parts = rs.map(r => r.spellId
      ? '{spell:' + r.spellId + '}' + r.players.join(' ')
      : r.text + ' (' + r.players.join(' ') + ')');
    mrtLines.push('{time:' + fmt(Number(sec)) + '}' + parts.join(' '));
  }
}
const mrtBlock = mrtLines.join('\n');

// ── 3. Discord block ──
const discordLines = [];
for (const s of sections) {
  const inSection = reminders.filter(r => r.sec >= s.from && r.sec < s.to);
  if (!inSection.length) continue;
  discordLines.push('**' + s.label + '**', '```');
  const byTime = {};
  inSection.forEach(r => { (byTime[r.sec] ||= []).push(r); });
  for (const [sec, rs] of Object.entries(byTime).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const items = rs.map(r => (r.spellId ? spellName(r.spellId) : r.text) + ' (' + r.players.join(', ') + ')');
    discordLines.push(fmt(Number(sec)).padEnd(6) + items.join(' + '));
  }
  discordLines.push('```');
}
const discordBlock = discordLines.join('\n');

console.log('════════ NSRT IMPORT STRING (/ns > Shared Notes > Import) ════════\n');
console.log(nsrtBlock);
console.log('\n════════ MRT DISPLAY NOTE ════════\n');
console.log(mrtBlock);
console.log('\n════════ DISCORD ════════\n');
console.log(discordBlock);

const outPath = join(dirname(planPath), basename(planPath).replace(/\.json$/, '') + '.out.txt');
writeFileSync(outPath, '=== NSRT IMPORT ===\n' + nsrtBlock + '\n\n=== MRT NOTE ===\n' + mrtBlock + '\n\n=== DISCORD ===\n' + discordBlock + '\n');
console.log('\nSaved: ' + outPath);
