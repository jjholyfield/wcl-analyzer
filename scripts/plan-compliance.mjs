/**
 * Plan vs Actual — review a raid night against the boss plan JSON.
 *
 * Usage:
 *   node scripts/plan-compliance.mjs <plan.json> <reportCode> [tolSeconds]
 *   node scripts/plan-compliance.mjs healing-cds/plans/crown-mythic.json qDfTzvAyV3pRb6rG
 *
 * For every timed assignment in the plan, across every pull that lasted long enough:
 *   ON TIME  — cast within ±tol (default 20s) of the assigned time
 *   DRIFT    — nearest cast within ±60s but outside tol
 *   MISSED   — no cast within ±60s despite the pull reaching the window
 * Plus OFF-PLAN uses: casts of a planned (player, spell) pair not near any of its assignments.
 * Text reminders (no spellId) are not scored.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { gql, gqlPaged, fmt, lcName } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [planPath, reportCode, tolArg] = process.argv.slice(2);
if (!planPath || !reportCode) {
  console.error('Usage: node scripts/plan-compliance.mjs <plan.json> <reportCode> [tolSeconds]');
  process.exit(1);
}
const TOL = Number(tolArg) || 20;
const DRIFT_MAX = 60;
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

// Spells that log under multiple IDs — match any alias of the planned ID
const SPELL_ALIASES = {
  115310: [115310, 388615],  // Revival
  322118: [322118, 325197],  // Yu'lon / Chi-Ji
  31884: [31884, 216331],    // Avenging Wrath
  33891: [33891, 117679],    // Incarnation
};
const aliasesOf = id => SPELL_ALIASES[id] || [id];

const toSec = t => {
  if (typeof t === 'number') return t;
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};

// One scored assignment per (time, player, spell)
const assignments = [];
for (const r of plan.reminders) {
  if (!r.spellId) continue;
  for (const p of r.players) {
    if (['everyone', 'tank', 'healer', 'damager', 'melee', 'ranged'].includes(p.toLowerCase())) continue;
    assignments.push({ sec: toSec(r.time), player: p, lcPlayer: lcName(p), spellId: r.spellId });
  }
}

let spellNames = {};
try { spellNames = JSON.parse(readFileSync(join(__dirname, '..', 'spell-names.json'), 'utf8')); } catch {}
const spellName = id => spellNames[id] || 'spell:' + id;

const DIFFICULTY_IDS = { mythic: 5, heroic: 4, normal: 3 };

async function main() {
  const fd = await gql('{ reportData { report(code: "' + reportCode + '") { startTime fights(encounterID: ' + plan.encounterID + ') { id startTime endTime kill difficulty } masterData { actors(type: "Player") { id name } } } } }');
  const reportDate = new Date(fd.reportData.report.startTime).toISOString().slice(0, 10);
  const wantDiff = DIFFICULTY_IDS[(plan.difficulty || 'Mythic').toLowerCase()] || 5;
  const allFights = fd.reportData.report.fights.sort((a, b) => a.id - b.id);
  const fights = allFights.filter(f => f.difficulty === wantDiff);
  if (allFights.length !== fights.length) console.log('⚠ Dropped ' + (allFights.length - fights.length) + ' non-' + (plan.difficulty || 'Mythic') + ' pulls of the same boss (would pollute compliance)\n');
  if (!fights.length) throw new Error('No ' + (plan.difficulty || 'Mythic') + ' fights for encounter ' + plan.encounterID + ' in ' + reportCode);
  const actors = {};
  fd.reportData.report.masterData.actors.forEach(a => { actors[a.id] = a.name; });

  const allIds = [...new Set(assignments.flatMap(a => aliasesOf(a.spellId)))];
  const spellFilter = allIds.map(id => 'ability.id=' + id).join(' OR ');
  const fids = fights.map(f => f.id);
  let casts = [];
  for (let i = 0; i < fids.length; i += 10) {
    const batch = fids.slice(i, i + 10);
    casts = casts.concat(await gqlPaged(np =>
      '{ reportData { report(code: "' + reportCode + '") { events(fightIDs: [' + batch + '], dataType: Casts, hostilityType: Friendlies, filterExpression: "' + spellFilter + '"' + (np ? ', startTime: ' + np : '') + ', limit: 10000) { data nextPageTimestamp } } } }'));
  }

  console.log(plan.bossName + ' — plan vs actual | ' + reportCode + ' | ' + fights.length + ' pulls | tolerance ±' + TOL + 's\n');

  // Roster check: every planned player must exist in the log
  const logPlayers = new Set(Object.values(actors).map(lcName));
  const missingPlayers = [...new Set(assignments.filter(a => !logPlayers.has(a.lcPlayer)).map(a => a.player))];
  if (missingPlayers.length) console.log('⚠ Planned players not in this log (assignments skipped): ' + missingPlayers.join(', ') + '\n');

  const results = [];
  for (const a of assignments) {
    if (missingPlayers.includes(a.player)) continue;
    const res = { ...a, spell: spellName(a.spellId), evaluable: 0, onTime: 0, drift: 0, missed: 0, drifts: [] };
    for (const fight of fights) {
      const dur = (fight.endTime - fight.startTime) / 1000;
      if (dur < a.sec + 5) continue; // pull never reached this window
      res.evaluable++;
      const times = casts
        .filter(c => aliasesOf(a.spellId).includes(c.abilityGameID)
          && lcName(actors[c.sourceID] || '') === a.lcPlayer
          && c.timestamp >= fight.startTime && c.timestamp <= fight.endTime)
        .map(c => (c.timestamp - fight.startTime) / 1000);
      if (!times.length) { res.missed++; continue; }
      const nearest = times.reduce((best, t) => Math.abs(t - a.sec) < Math.abs(best - a.sec) ? t : best);
      const delta = nearest - a.sec;
      if (Math.abs(delta) <= TOL) { res.onTime++; res.drifts.push(delta); }
      else if (Math.abs(delta) <= DRIFT_MAX) { res.drift++; res.drifts.push(delta); }
      else res.missed++;
    }
    results.push(res);
  }

  console.log('══════ ASSIGNMENT COMPLIANCE ══════');
  console.log('Time   Player          Spell                  Eval  OnTime  Drift  Missed  Avg Δ');
  for (const r of results.sort((x, y) => x.sec - y.sec)) {
    if (!r.evaluable) { console.log(fmt(r.sec).padEnd(7) + r.player.padEnd(16) + r.spell.padEnd(23) + '0     (no pull reached this window)'); continue; }
    const avgD = r.drifts.length ? Math.round(r.drifts.reduce((s, d) => s + d, 0) / r.drifts.length) : null;
    const pct = Math.round(r.onTime / r.evaluable * 100);
    console.log(
      fmt(r.sec).padEnd(7) + r.player.padEnd(16) + r.spell.slice(0, 21).padEnd(23) +
      String(r.evaluable).padEnd(6) + (r.onTime + ' (' + pct + '%)').padEnd(11) +
      String(r.drift).padEnd(7) + String(r.missed).padEnd(8) +
      (avgD === null ? '-' : (avgD > 0 ? '+' : '') + avgD + 's')
    );
  }

  // Per-player rollup
  console.log('\n══════ PER-PLAYER ══════');
  const byPlayer = {};
  results.forEach(r => {
    const p = (byPlayer[r.player] ||= { evaluable: 0, onTime: 0, drift: 0, missed: 0 });
    p.evaluable += r.evaluable; p.onTime += r.onTime; p.drift += r.drift; p.missed += r.missed;
  });
  for (const [player, s] of Object.entries(byPlayer).sort((a, b) => (b[1].onTime / (b[1].evaluable || 1)) - (a[1].onTime / (a[1].evaluable || 1)))) {
    if (!s.evaluable) continue;
    console.log('  ' + player.padEnd(16) + Math.round(s.onTime / s.evaluable * 100) + '% on time  (' + s.onTime + '/' + s.evaluable + ', ' + s.drift + ' drifted, ' + s.missed + ' missed)');
  }

  // Off-plan uses: casts of planned pairs not near any of that pair's assignments
  console.log('\n══════ OFF-PLAN USES (cast, but not near any assigned time) ══════');
  const pairAssignments = {};
  assignments.forEach(a => { (pairAssignments[a.lcPlayer + '|' + a.spellId] ||= []).push(a.sec); });
  const offPlan = {};
  for (const c of casts) {
    const who = lcName(actors[c.sourceID] || '');
    const fight = fights.find(f => c.timestamp >= f.startTime && c.timestamp <= f.endTime);
    if (!fight) continue;
    const t = (c.timestamp - fight.startTime) / 1000;
    for (const [plannedId, secs] of Object.entries(pairAssignments)) {
      const [lcP, sid] = plannedId.split('|');
      if (who !== lcP || !aliasesOf(Number(sid)).includes(c.abilityGameID)) continue;
      if (!secs.some(s => Math.abs(t - s) <= DRIFT_MAX)) {
        const key = actors[c.sourceID] + '|' + spellName(Number(sid));
        (offPlan[key] ||= []).push('P' + fight.id + '@' + fmt(t));
      }
    }
  }
  const opEntries = Object.entries(offPlan).sort((a, b) => b[1].length - a[1].length);
  if (!opEntries.length) console.log('  none');
  for (const [key, uses] of opEntries) {
    const [player, spell] = key.split('|');
    console.log('  ' + player.padEnd(16) + spell.padEnd(23) + uses.length + 'x: ' + uses.slice(0, 8).join(', ') + (uses.length > 8 ? ' …' : ''));
  }

  // Week-over-week: compare per-player on-time % vs the most recent prior run of this plan
  const outDir = join(__dirname, '..', 'data', 'boss-prep');
  mkdirSync(outDir, { recursive: true });
  const planBase = basename(planPath).replace(/\.json$/, '');
  const priorFiles = readdirSync(outDir)
    .filter(f => f.startsWith('compliance-' + planBase + '-') && f.endsWith('.json') && !f.includes(reportCode))
    .map(f => { try { return { f, j: JSON.parse(readFileSync(join(outDir, f), 'utf8')) }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.j.reportDate || '').localeCompare(a.j.reportDate || ''));
  if (priorFiles.length && priorFiles[0].j.results) {
    const prior = priorFiles[0].j;
    console.log('\n══════ WEEK-OVER-WEEK (vs ' + prior.reportCode + (prior.reportDate ? ', ' + prior.reportDate : '') + ') ══════');
    const priorByPlayer = {};
    prior.results.forEach(r => {
      const p = (priorByPlayer[r.player] ||= { evaluable: 0, onTime: 0 });
      p.evaluable += r.evaluable; p.onTime += r.onTime;
    });
    for (const [player, s] of Object.entries(byPlayer)) {
      if (!s.evaluable) continue;
      const now = Math.round(s.onTime / s.evaluable * 100);
      const prev = priorByPlayer[player];
      if (!prev || !prev.evaluable) { console.log('  ' + player.padEnd(16) + now + '%  (no prior data)'); continue; }
      const then = Math.round(prev.onTime / prev.evaluable * 100);
      const delta = now - then;
      console.log('  ' + player.padEnd(16) + then + '% → ' + now + '%  (' + (delta >= 0 ? '+' : '') + delta + ')');
    }
  }

  const outFile = join(outDir, 'compliance-' + planBase + '-' + reportCode + '.json');
  writeFileSync(outFile, JSON.stringify({ plan: basename(planPath), reportCode, reportDate, difficulty: plan.difficulty || 'Mythic', tol: TOL, pulls: fights.length, results: results.map(({ drifts, lcPlayer, ...r }) => r), offPlan }, null, 2));
  console.log('\nSaved: ' + outFile);
}

main().catch(e => { console.error(e); process.exit(1); });
