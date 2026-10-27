/**
 * Retribution Paladin (Herald of the Sun) Mythic+ rotational audit, Midnight Season 2.
 * Grades every key in a report against guides/ret-s2-rules.md from the data pulled by
 * ww-conduit-pull.mjs with --dir ret (the pull is class-agnostic).
 *
 * Usage:
 *   node scripts/ww-conduit-pull.mjs <reportCode> <player> --dir ret          (first)
 *   node scripts/ret-audit.mjs <reportCode> <player> [--quiet]
 *   node scripts/ret-audit.mjs --compare <report>:<player> <report>:<player> ...
 *
 * Writes data/<report>/ret/<player>/audit.json, fight<N>-sequence.txt (every press with the Holy Power
 * before it, the windows active, and the call) and fight<N>-presses.json.
 *
 * Measured facts this leans on (verified in report VCT4BDbd7XknFKPG): Holy Power is resource type 9, max 5;
 * a spender's cast event carries the Holy Power BEFORE the cast and cost 3; a Divine Purpose spender carries
 * no resource block (it is free); resourcechange events carry the gained amount and the wasted amount;
 * Divine Toll's Judgments log their Holy Power under "Hammer of Wrath"; the Dawnlight self-buff (431522)
 * starts at 2 stacks after Wake of Ashes and loses one per spender; Divine Arbiter (4pc) is applied when
 * Divine Purpose is consumed and removed when the next spender fires it.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fmt, lcName } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');

const S = {
  CS: 408385, DS: 53385, DS_TEMPEST: 224239, FV: 383328, BOJ: 184575, BOJ_LIGHT: 404358, JUDG: 20271, JUDG_DEBUFF: 197277,
  HOW: 24275, WAKE: 255937, AW: 31884, CRUSADE: 231895, ES: 343527, ES_BUFF: 1234189, ES_DMG: 387113, FINAL_RECKONING: 343721,
  DT: 375576, EF: 156322, WOG: 85673, DIVPROT: 403876, SOV: 184662, DSHIELD: 642, LOH: 633, BOSAC: 6940, BOP: 1022, BOF: 1044,
  REBUKE: 96231, BLIND: 115750, HOJ: 853, STEED: 190784, INTERCESSION: 391054, POTION: 1236994, HPOT: 0, TRINKET: 1297761,
  DIVINE_PURPOSE: 408458, ART_OF_WAR: 406086, ARBITER_A: 1306161, ARBITER_B: 1306162, DIVINE_POWER: 1305230,
  DAWNLIGHT_SELF: 431522, DAWNLIGHT_DEBUFF: 431380, SUNS_AVATAR: 431907, ANSHE: 445206, WILL_DAWN: 431752, BORN_SUNLIGHT: 1264050,
  EMPYREAN_LEGACY: 387178, HOW_PROC: 1241410, RUSH_OF_LIGHT: 407065, DIVINE_RESONANCE: 1266308, EXPURGATION: 383346, SUN_SEAR: 431414,
  HIGHLORD: 383921, LIGHT_WITHIN: 1261160, ARBITER_DMG: 1306923, HOLY_POWER: 9,
};
const SPENDERS = new Set([S.DS, S.FV, S.EF, S.WOG]);
const GENERATORS = new Set([S.BOJ, S.JUDG, S.HOW, S.WAKE, S.DT]);
const GEN_GAIN = { [S.BOJ]: 2, [S.JUDG]: 1, [S.HOW]: 1, [S.WAKE]: 3 };
const OFF_GCD = new Set([S.DIVPROT, S.LOH, S.BOSAC, S.BOP, S.BOF, S.STEED, S.POTION, S.TRINKET, S.CS, S.REBUKE]);
const NON_GCD_PRESS = new Set([S.CS]);
const LUST_IDS = new Set([2825, 32182, 80353, 390386, 264667, 466904]);
const CD = { POTION: 300, TRINKET: 90, DIVPROT: 60, DSHIELD: 300, LOH: 600, BOP: 300, AW: 60, ES: 60, DT: 60, WAKE: 30 };

const r2 = (x) => x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 100) / 100;
const r1 = (x) => x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10) / 10;
const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
const avg = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;

function intervalsOf(events, id, fightEnd, kind = 'buff') {
  const apply = 'apply' + kind, remove = 'remove' + kind, stackOn = 'apply' + kind + 'stack', stackOff = 'remove' + kind + 'stack', refresh = 'refresh' + kind;
  const out = [];
  let open = null;
  for (const b of events) {
    if (b.abilityGameID !== id) continue;
    if (b.type === apply) { if (open) { open.end = b.timestamp; out.push(open); } open = { start: b.timestamp, end: null, stacks: 1, maxStacks: 1, refreshes: 0, target: b.targetID + ':' + (b.targetInstance || 0) }; }
    else if (b.type === stackOn) { if (open) { open.stacks = b.stack || open.stacks + 1; open.maxStacks = Math.max(open.maxStacks, open.stacks); } }
    else if (b.type === stackOff) { if (open) open.stacks = b.stack || Math.max(1, open.stacks - 1); }
    else if (b.type === refresh) { if (open) open.refreshes++; }
    else if (b.type === remove) { if (open) { open.end = b.timestamp; out.push(open); open = null; } }
  }
  if (open) { open.end = fightEnd; out.push(open); }
  return out;
}
// per-target debuff intervals
function debuffIntervalsByTarget(events, id, fightEnd) {
  const byT = {};
  for (const e of events) { if (e.abilityGameID !== id) continue; const k = e.targetID + ':' + (e.targetInstance || 0); (byT[k] ||= []).push(e); }
  const out = {};
  for (const [k, evs] of Object.entries(byT)) out[k] = intervalsOf(evs, id, fightEnd, 'debuff');
  return out;
}
const activeAt = (ivs, t) => (ivs || []).find(iv => iv.start <= t && iv.end > t) || null;

function auditPlayer(code, playerName) {
  const D = join(__dirname, '..', 'data', code, 'ret', lcName(playerName));
  if (!existsSync(join(D, 'meta.json'))) throw new Error('No pulled data at ' + D + '. Run ww-conduit-pull.mjs <report> <player> --dir ret first.');
  const J = (f) => JSON.parse(readFileSync(join(D, f), 'utf8'));
  const meta = J('meta.json');
  const NAME = (id) => meta.abilityNames[id] || ('#' + id);
  const P = meta.player.id;
  const audit = { report: meta.report, player: meta.player, spec: 'Retribution', generatedAt: new Date().toISOString(), fights: [] };

  for (const f of meta.fights) {
    const tag = `fight${f.id}`;
    const t0 = f.startTime, dur = (f.endTime - f.startTime) / 1000;
    const rel = (ts) => (ts - t0) / 1000;
    const at = (ts) => fmt(rel(ts)) + '.' + String(Math.floor((rel(ts) % 1) * 10));
    const castsAll = J(`${tag}-casts.json`);
    const buffs = J(`${tag}-buffs.json`).sort((a, b) => a.timestamp - b.timestamp);
    const debuffs = existsSync(join(D, `${tag}-debuffs.json`)) ? J(`${tag}-debuffs.json`).filter(e => e.sourceID === P).sort((a, b) => a.timestamp - b.timestamp) : [];
    const dmg = J(`${tag}-dmgdone.json`).filter(e => e.type === 'damage');
    const taken = J(`${tag}-dmgtaken.json`).filter(e => e.type === 'damage');
    const resources = J(`${tag}-resources.json`).filter(r => r.resourceChangeType === S.HOLY_POWER).sort((a, b) => a.timestamp - b.timestamp);
    const deaths = J(`${tag}-deaths.json`);
    const interrupts = J(`${tag}-interrupts.json`);
    const comb = J(`${tag}-combatant.json`);
    const pulls = (f.dungeonPulls || []).map(p => ({ ...p, isBoss: !!p.encounterID }));
    const pullAt = (ts) => pulls.find(p => p.startTime <= ts && p.endTime >= ts) || null;
    const pullName = (ts) => { const p = pullAt(ts); return p ? `${p.isBoss ? 'BOSS ' : ''}${p.name}` : 'between pulls'; };
    const dead = (a, b) => deaths.some(d => d.targetID === P && d.timestamp >= a && d.timestamp <= b);

    const casts = castsAll.filter(c => c.type === 'cast').sort((a, b) => a.timestamp - b.timestamp).map(c => {
      const hp = (c.classResources || []).find(x => x.type === S.HOLY_POWER);
      return { t: c.timestamp, id: c.abilityGameID, name: NAME(c.abilityGameID), hpLogged: hp ? hp.amount : null, costLogged: hp ? hp.cost : null, target: c.targetID, targetInstance: c.targetInstance || 0 };
    });
    const castsOf = (id) => casts.filter(c => c.id === id);
    const times = (id) => castsOf(id).map(c => c.t);
    const press = casts.filter(c => !NON_GCD_PRESS.has(c.id)); // everything the player actually pressed (Crusading Strikes is an auto)

    // ── buff intervals ──
    const iv = {};
    for (const [k, id] of Object.entries({ aw: S.AW, crusade: S.CRUSADE, es: S.ES_BUFF, dp: S.DIVINE_PURPOSE, aow: S.ART_OF_WAR, arbA: S.ARBITER_A, arbB: S.ARBITER_B, dpower: S.DIVINE_POWER, dawn: S.DAWNLIGHT_SELF,
      avatar: S.SUNS_AVATAR, anshe: S.ANSHE, legacy: S.EMPYREAN_LEGACY, howProc: S.HOW_PROC, resonance: S.DIVINE_RESONANCE, sov: S.SOV, divprot: S.DIVPROT, dshield: S.DSHIELD, potion: S.POTION, trinket: S.TRINKET })) iv[k] = intervalsOf(buffs, id, f.endTime);
    iv.lust = [...LUST_IDS].flatMap(id => intervalsOf(buffs, id, f.endTime));
    iv.wings = [...iv.aw, ...iv.crusade].sort((a, b) => a.start - b.start);
    const inWings = (t) => !!activeAt(iv.wings, t);
    const dpActive = (t) => !!activeAt(iv.dp, t) || buffs.some(b => b.abilityGameID === S.DIVINE_PURPOSE && b.type === 'removebuff' && Math.abs(b.timestamp - t) <= 60);
    const arbiterActive = (t) => !!activeAt(iv.arbA, t) || !!activeAt(iv.arbB, t) || buffs.some(b => (b.abilityGameID === S.ARBITER_A || b.abilityGameID === S.ARBITER_B) && b.type === 'removebuff' && Math.abs(b.timestamp - t) <= 60);
    const stacksAt = (ivs, t) => { const x = activeAt(ivs, t); return x ? x.stacks : 0; };
    const judgOn = debuffIntervalsByTarget(debuffs, S.JUDG_DEBUFF, f.endTime);
    const expOn = debuffIntervalsByTarget(debuffs, S.EXPURGATION, f.endTime);
    const dawnOn = debuffIntervalsByTarget(debuffs, S.DAWNLIGHT_DEBUFF, f.endTime);
    const judgActiveOn = (tgtKey, t) => !!activeAt(judgOn[tgtKey], t);

    // ── damage ──
    const dmgBy = {};
    let total = 0;
    for (const e of dmg) { const a = (e.amount || 0) + (e.absorbed || 0); total += a; (dmgBy[e.abilityGameID] ||= { name: NAME(e.abilityGameID), amount: 0, hits: 0, crits: 0 }); dmgBy[e.abilityGameID].amount += a; dmgBy[e.abilityGameID].hits++; if (e.hitType === 2) dmgBy[e.abilityGameID].crits++; }
    const damageTop = Object.values(dmgBy).sort((a, b) => b.amount - a.amount).slice(0, 20).map(x => ({ ...x, share: pct(x.amount, total), critPct: pct(x.crits, x.hits) }));
    const dmgIn = (a, b) => dmg.filter(e => e.timestamp >= a && e.timestamp <= b).reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
    const bossDps = pulls.filter(p => p.isBoss).map(p => ({ boss: p.name, start: fmt(rel(p.startTime)), seconds: r1((p.endTime - p.startTime) / 1000), dps: Math.round(dmgIn(p.startTime, p.endTime) / ((p.endTime - p.startTime) / 1000)) }));
    // Targets in melee range at time t: the hit count of the nearest Divine Storm within 4s, else the targets a
    // Consecration tick touched within 1.5s, else 1. (Any-damage counting over-reads: Dawnlight, Sun Sear and
    // Expurgation keep ticking on mobs that are nowhere near the paladin.)
    const dsHits = (t) => new Set(dmg.filter(e => e.abilityGameID === S.DS && e.timestamp >= t - 20 && e.timestamp <= t + 1500).map(e => e.targetID + ':' + (e.targetInstance || 0))).size;
    const dsCastTimes = casts.filter(c => c.id === S.DS).map(c => c.t);
    const consecTargets = (t) => new Set(dmg.filter(e => e.abilityGameID === 81297 && Math.abs(e.timestamp - t) <= 1500).map(e => e.targetID + ':' + (e.targetInstance || 0))).size;
    const targetsNear = (t) => { const near = dsCastTimes.filter(x => Math.abs(x - t) <= 4000).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0]; const ds = near !== undefined ? dsHits(near) : 0; return Math.max(ds, consecTargets(t), 1); };
    const wingsSecs = iv.wings.reduce((s, x) => s + (x.end - x.start), 0) / 1000;
    const wingsDmg = dmg.filter(e => inWings(e.timestamp)).reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);

    // ── Holy Power model ──
    // walk casts and resource events in time order; a spender's logged amount is ground truth, resource events add gains
    const timeline = [...casts.map(c => ({ kind: 'cast', t: c.t, c })), ...resources.map(r => ({ kind: 'res', t: r.timestamp, r }))].sort((a, b) => a.t - b.t || (a.kind === 'cast' ? -1 : 1));
    let hp = 0;
    const hpBefore = new Map(); // cast t -> hp before the press
    const hpTrace = []; // {t, hp} after each change, for time-at-5
    for (const ev of timeline) {
      if (ev.kind === 'cast') {
        const c = ev.c;
        if (SPENDERS.has(c.id)) {
          if (c.hpLogged !== null) hp = c.hpLogged;
          hpBefore.set(c.t + ':' + c.id, hp);
          const free = c.hpLogged === null || c.costLogged === 0 || dpActive(c.t) && c.hpLogged === null;
          hp = Math.max(0, hp - (free ? 0 : (c.costLogged ?? 3)));
          hpTrace.push({ t: c.t, hp });
        } else hpBefore.set(c.t + ':' + c.id, hp);
      } else {
        hp = Math.min(5, Math.max(0, hp + (ev.r.resourceChange || 0)));
        hpTrace.push({ t: ev.t, hp });
      }
    }
    const hpAt = (c) => hpBefore.get(c.t + ':' + c.id);
    // time at 5 Holy Power inside pulls while alive
    let atCapMs = 0;
    for (let i = 1; i < hpTrace.length; i++) { const a = hpTrace[i - 1], b = hpTrace[i]; if (a.hp >= 5 && pullAt(a.t) && pullAt(b.t) === pullAt(a.t) && !dead(a.t, b.t)) atCapMs += Math.min(b.t - a.t, 10000); }
    const pullSecs = pulls.reduce((s, p) => s + (p.endTime - p.startTime), 0) / 1000;

    // ── Holy Power waste, attributed to the press that caused it ──
    const wasteEvents = resources.filter(r => r.waste > 0);
    const wasteBy = {};
    let wasteTotal = 0, generated = 0;
    for (const r of resources) generated += (r.resourceChange || 0) + (r.waste || 0);
    const wasteList = [];
    for (const r of wasteEvents) {
      wasteTotal += r.waste;
      const p = press.filter(c => c.t >= r.timestamp - 150 && c.t <= r.timestamp + 50 && (GENERATORS.has(c.id)));
      const by = p.length ? p[p.length - 1].name : (NAME(r.abilityGameID) === 'Crusading Strikes' ? 'Crusading Strikes (auto at 5)' : 'passive echo (' + NAME(r.abilityGameID) + ')');
      wasteBy[by] = (wasteBy[by] || 0) + r.waste;
      wasteList.push({ at: at(r.timestamp), pull: pullName(r.timestamp), waste: r.waste, by, source: NAME(r.abilityGameID) });
    }
    const genAtCap = press.filter(c => GENERATORS.has(c.id) && hpAt(c) !== undefined && hpAt(c) + (GEN_GAIN[c.id] || 1) > 5).map(c => ({ at: at(c.t), pull: pullName(c.t), name: c.name, hp: hpAt(c), overBy: hpAt(c) + (GEN_GAIN[c.id] || 1) - 5 }));
    const wakeHigh = castsOf(S.WAKE).filter(c => hpAt(c) >= 3).map(c => ({ at: at(c.t), pull: pullName(c.t), hp: hpAt(c) }));
    const dtCasts = castsOf(S.DT).map(c => { const w = resources.filter(r => r.timestamp >= c.t && r.timestamp <= c.t + 1200).reduce((s, r) => s + (r.waste || 0), 0); return { at: at(c.t), pull: pullName(c.t), hp: hpAt(c), targets: targetsNear(c.t), waste: w, inWings: inWings(c.t) }; });
    const spenderCasts = casts.filter(c => SPENDERS.has(c.id)).map(c => ({ ...c, hp: hpAt(c), free: c.hpLogged === null, ds: c.id === S.DS, targets: c.id === S.DS ? dsHits(c.t) : targetsNear(c.t), arbiter: arbiterActive(c.t), judged: judgActiveOn(c.target + ':' + c.targetInstance, c.t) || (c.id === S.DS && Object.entries(judgOn).some(([k, ivs]) => activeAt(ivs, c.t))) }));
    const spenderHp = spenderCasts.reduce((m, c) => { const k = c.free ? 'free (Divine Purpose)' : String(c.hp); m[k] = (m[k] || 0) + 1; return m; }, {});
    const holyPower = {
      generated, wasted: wasteTotal, wastedPct: pct(wasteTotal, generated), wastedBy: Object.fromEntries(Object.entries(wasteBy).sort((a, b) => b[1] - a[1])),
      generatorPressedIntoCap: genAtCap.length, generatorPressedIntoCapBy: genAtCap.reduce((m, g) => (m[g.name] = (m[g.name] || 0) + 1, m), {}), generatorPressedIntoCapList: genAtCap,
      wakeAt3Plus: wakeHigh.length, wakeAt3PlusList: wakeHigh, wakeCasts: times(S.WAKE).length,
      divineTollCasts: dtCasts.length, divineTollWasted: dtCasts.reduce((s, d) => s + d.waste, 0), divineTollWithWaste: dtCasts.filter(d => d.waste > 0).length, divineTollList: dtCasts,
      secondsAtFiveInPulls: r1(atCapMs / 1000), pctOfPullTimeAtFive: pct(atCapMs / 1000, pullSecs), spenderHolyPower: spenderHp, spenders: spenderCasts.length,
    };

    // ── procs ──
    const dpRemoves = buffs.filter(b => b.abilityGameID === S.DIVINE_PURPOSE && b.type === 'removebuff');
    const dpConsumed = dpRemoves.filter(b => spenderCasts.some(c => Math.abs(c.t - b.timestamp) <= 60)).length;
    const aowRefreshAt2 = buffs.filter(b => b.abilityGameID === S.ART_OF_WAR && b.type === 'refreshbuff').length;
    const aowProcs = buffs.filter(b => b.abilityGameID === S.ART_OF_WAR && ['applybuff', 'applybuffstack', 'refreshbuff'].includes(b.type)).length;
    const bojWithAow = castsOf(S.BOJ).filter(c => activeAt(iv.aow, c.t) || buffs.some(b => b.abilityGameID === S.ART_OF_WAR && (b.type === 'removebuff' || b.type === 'removebuffstack') && Math.abs(b.timestamp - c.t) <= 60)).length;
    const legacyRemoves = buffs.filter(b => b.abilityGameID === S.EMPYREAN_LEGACY && b.type === 'removebuff');
    const legacyConsumed = legacyRemoves.filter(b => spenderCasts.some(c => Math.abs(c.t - b.timestamp) <= 60)).length;
    const dawnWindows = iv.dawn.map(d => { const sp = spenderCasts.filter(c => c.t >= d.start && c.t <= d.end + 60).length; return { at: at(d.start), spendersInside: sp, expiredWithStacks: sp < 2, seconds: r2((d.end - d.start) / 1000) }; });
    const arbRemoves = buffs.filter(b => (b.abilityGameID === S.ARBITER_A || b.abilityGameID === S.ARBITER_B) && b.type === 'removebuff');
    const procs = {
      divinePurpose: { procs: dpRemoves.length, consumed: dpConsumed, expired: dpRemoves.length - dpConsumed },
      artOfWar: { procs: aowProcs, wastedAtTwoStacks: aowRefreshAt2, bladeWithArtOfWar: bojWithAow, bladeCasts: times(S.BOJ).length },
      empyreanLegacy: { procs: legacyRemoves.length, consumed: legacyConsumed, expired: legacyRemoves.length - legacyConsumed },
      dawnlight: { wakes: iv.dawn.length, windowsWithTwoSpenders: dawnWindows.filter(w => !w.expiredWithStacks).length, expiredWithStacksLeft: dawnWindows.filter(w => w.expiredWithStacks).length, debuffApplications: debuffs.filter(e => e.abilityGameID === S.DAWNLIGHT_DEBUFF && e.type === 'applydebuff').length, list: dawnWindows.filter(w => w.expiredWithStacks) },
      divineArbiter: { applications: buffs.filter(b => (b.abilityGameID === S.ARBITER_A || b.abilityGameID === S.ARBITER_B) && b.type === 'applybuff').length, removals: arbRemoves.length },
      hammerOfWrathCasts: times(S.HOW).length, judgmentCasts: times(S.JUDG).length,
    };

    // ── spender choice ──
    const sp2 = spenderCasts.filter(c => c.id === S.DS || c.id === S.FV);
    const fvMulti = sp2.filter(c => c.id === S.FV && c.targets >= 2 && !c.arbiter);
    const dsSingle = sp2.filter(c => c.id === S.DS && c.targets <= 1 && !c.arbiter);
    const arbRight = sp2.filter(c => c.arbiter && ((c.targets >= 2 && c.id === S.FV) || (c.targets <= 1 && c.id === S.DS))).length;
    const arbWrong = sp2.filter(c => c.arbiter && ((c.targets >= 2 && c.id === S.DS) || (c.targets <= 1 && c.id === S.FV)));
    const efCasts = castsOf(S.EF).map(c => ({ at: at(c.t), pull: pullName(c.t), hp: hpAt(c), free: c.hpLogged === null }));
    const spenderChoice = {
      divineStorm: times(S.DS).length, finalVerdict: times(S.FV).length, eternalFlame: efCasts.length, eternalFlamePaid: efCasts.filter(e => !e.free).length,
      finalVerdictAt2PlusWithoutArbiter: fvMulti.length, divineStormAt1WithoutArbiter: dsSingle.length, arbiterSpenderRight: arbRight, arbiterSpenderWrong: arbWrong.length,
      judgedSpendersPct: pct(sp2.filter(c => c.judged).length, sp2.length), judgedSpenders: sp2.filter(c => c.judged).length,
      dsTargetDistribution: castsOf(S.DS).reduce((m, c) => { const k = Math.min(dsHits(c.t), 8); m[k] = (m[k] || 0) + 1; return m; }, {}),
      lists: { finalVerdictAt2Plus: fvMulti.slice(0, 40).map(c => ({ at: at(c.t), pull: pullName(c.t), targets: c.targets, hp: c.hp })), divineStormAt1: dsSingle.slice(0, 40).map(c => ({ at: at(c.t), pull: pullName(c.t), hp: c.hp })), arbiterWrong: arbWrong.slice(0, 20).map(c => ({ at: at(c.t), pull: pullName(c.t), pressed: c.name, targets: c.targets })), eternalFlame: efCasts },
    };

    // ── cooldowns ──
    const gaps = (ts) => ts.slice(1).map((t, i) => r1((t - ts[i]) / 1000));
    const awTimes = [...times(S.AW), ...times(S.CRUSADE)].sort((a, b) => a - b), esTimes = times(S.ES), wakeTimes = times(S.WAKE), dtTimes = times(S.DT), potionTimes = times(S.POTION);
    const minGap = (ts) => ts.length > 1 ? Math.min(...gaps(ts)) : null;
    const esNearAw = esTimes.filter(t => awTimes.some(a => Math.abs(a - t) <= 6000)).length;
    const awWithoutEs = awTimes.filter(a => !esTimes.some(t => Math.abs(a - t) <= 6000));
    const cooldowns = {
      wings: { casts: awTimes.length, name: times(S.CRUSADE).length ? 'Crusade' : 'Avenging Wrath', times: awTimes.map(t => fmt(rel(t))), minGap: minGap(awTimes), buffAvgSeconds: r2(avg(iv.wings.map(x => (x.end - x.start) / 1000))) },
      executionSentence: { casts: esTimes.length, minGap: minGap(esTimes), pairedWithWings: esNearAw, wingsWithoutES: awWithoutEs.map(t => fmt(rel(t))) },
      wakeOfAshes: { casts: wakeTimes.length, minGap: minGap(wakeTimes), avgGap: r1(avg(gaps(wakeTimes))) },
      divineToll: { casts: dtTimes.length, minGap: minGap(dtTimes), avgGap: r1(avg(gaps(dtTimes))) },
      potion: { casts: potionTimes.length, times: potionTimes.map(t => fmt(rel(t))), possible: Math.floor(dur / CD.POTION) + 1, inWings: potionTimes.filter(t => inWings(t + 1500)).length },
      trinket: { casts: times(S.TRINKET).length },
      divineProtection: { casts: times(S.DIVPROT).length }, divineShield: { casts: times(S.DSHIELD).length }, layOnHands: { casts: times(S.LOH).length }, blessingOfSacrifice: { casts: times(S.BOSAC).length }, blessingOfProtection: { casts: times(S.BOP).length },
      eternalFlame: { casts: times(S.EF).length }, rebuke: { casts: times(S.REBUKE).length, landed: interrupts.filter(i => i.abilityGameID === S.REBUKE).length }, blindingLight: { casts: times(S.BLIND).length }, hammerOfJustice: { casts: times(S.HOJ).length }, divineSteed: { casts: times(S.STEED).length }, intercession: { casts: times(S.INTERCESSION).length },
    };

    // ── Wings windows ──
    const wingsWindows = awTimes.map((X, i) => {
      const wb = iv.wings.find(w => Math.abs(w.start - X) < 1500);
      const end = wb ? wb.end : X + 20000;
      const first = (id, from, to) => { const c = casts.find(c => c.id === id && c.t >= from && c.t <= to); return c ? r1((c.t - X) / 1000) : null; };
      const seq = press.filter(c => c.t >= X - 3000 && c.t <= end).map(c => `${c.name}@${r1((c.t - X) / 1000)}`);
      const spIn = spenderCasts.filter(c => c.t >= X && c.t <= end);
      const wasteIn = wasteEvents.filter(r => r.timestamp >= X && r.timestamp <= end).reduce((s, r) => s + r.waste, 0);
      const potionAvailable = !potionTimes.some(p => p < X && X - p < CD.POTION * 1000);
      const issues = [];
      const esAt = first(S.ES, X - 6000, X + 6000); if (esAt === null) issues.push('no Execution Sentence with Wings');
      const wakeAt = first(S.WAKE, X - 3000, end); if (wakeAt === null) issues.push('no Wake of Ashes in the window'); else if (wakeAt > 6) issues.push(`Wake late (${wakeAt}s)`);
      const dtAt = first(S.DT, X - 3000, end); if (dtAt === null) issues.push('no Divine Toll in the window');
      const potionAt = first(S.POTION, X - 5000, end); if (potionAt === null && potionAvailable) issues.push('potion was available and not used');
      const trinketAt = first(S.TRINKET, X - 5000, end); if (trinketAt === null) issues.push('no trinket');
      if (wasteIn >= 3) issues.push(`${wasteIn} Holy Power wasted inside Wings`);
      const hpAtAw = hpBefore.get(X + ':' + S.AW) ?? hpBefore.get(X + ':' + S.CRUSADE);
      return { n: i + 1, at: at(X), pull: pullName(X), seconds: wb ? r2((wb.end - wb.start) / 1000) : null, sequence: seq.slice(0, 22), esAt, wakeAt, dtAt, potionAt, trinketAt, holyPowerAtWings: hpAtAw, spenders: spIn.length, freeSpenders: spIn.filter(c => c.free).length, wasted: wasteIn, damageM: r2(dmgIn(X, end) / 1e6), issues, ok: issues.length === 0 };
    });

    // ── Expurgation uptime on bosses ──
    const bossUptime = pulls.filter(p => p.isBoss).map(p => {
      const bossTargets = {};
      for (const e of dmg) if (e.timestamp >= p.startTime && e.timestamp <= p.endTime) { const k = e.targetID + ':' + (e.targetInstance || 0); bossTargets[k] = (bossTargets[k] || 0) + ((e.amount || 0) + (e.absorbed || 0)); }
      const boss = Object.entries(bossTargets).sort((a, b) => b[1] - a[1])[0];
      if (!boss) return { boss: p.name, expurgationUptimePct: null, judgmentUptimePct: null };
      const up = (ivs) => (ivs || []).reduce((s, x) => s + Math.max(0, Math.min(x.end, p.endTime) - Math.max(x.start, p.startTime)), 0) / (p.endTime - p.startTime);
      return { boss: p.name, expurgationUptimePct: pct(up(expOn[boss[0]]), 1), judgmentUptimePct: pct(up(judgOn[boss[0]]), 1), dawnlightUptimePct: pct(up(dawnOn[boss[0]]), 1) };
    });

    // ── activity ──
    const gcd = press.filter(c => !OFF_GCD.has(c.id));
    const idle = [];
    for (let i = 1; i < gcd.length; i++) { const g = (gcd[i].t - gcd[i - 1].t) / 1000; const p = pullAt(gcd[i - 1].t); if (p && g > 3 && pullAt(gcd[i].t) === p && !dead(gcd[i - 1].t, gcd[i].t)) idle.push({ at: at(gcd[i - 1].t), seconds: r1(g), after: gcd[i - 1].name, before: gcd[i].name, pull: p.name }); }
    const gapsInPulls = [];
    for (let i = 1; i < gcd.length; i++) { const p = pullAt(gcd[i - 1].t); if (p && pullAt(gcd[i].t) === p && !dead(gcd[i - 1].t, gcd[i].t)) gapsInPulls.push((gcd[i].t - gcd[i - 1].t) / 1000); }
    const sortedGaps = [...gapsInPulls].sort((a, b) => a - b);
    const activity = { pullSeconds: r1(pullSecs), gcdPressesPerMinuteInPulls: pullSecs ? r1(gcd.filter(c => pullAt(c.t)).length / (pullSecs / 60)) : null, medianGapSeconds: r2(sortedGaps[Math.floor(sortedGaps.length / 2)]), gaps1_6to3s: gapsInPulls.filter(g => g > 1.6 && g <= 3).length, secondsInGaps1_6to3s: r1(gapsInPulls.filter(g => g > 1.6 && g <= 3).reduce((s, g) => s + g - 1.1, 0)), idleGapsOver3s: idle.length, idleSecondsOver3s: r1(idle.reduce((s, g) => s + g.seconds, 0)), idlePctOfPulls: pct(idle.reduce((s, g) => s + g.seconds, 0), pullSecs), idleGapsTop: idle.sort((a, b) => b.seconds - a.seconds).slice(0, 10) };

    // ── deaths ──
    const lastBefore = (id, t) => { const x = times(id).filter(u => u < t).pop(); return x === undefined ? null : (t - x) / 1000; };
    const myDeaths = deaths.filter(d => d.targetID === P).map(d => {
      const before = taken.filter(e => e.timestamp <= d.timestamp && e.timestamp >= d.timestamp - 6000);
      const dpS = lastBefore(S.DIVPROT, d.timestamp), dsS = lastBefore(S.DSHIELD, d.timestamp), lohS = lastBefore(S.LOH, d.timestamp), efS = lastBefore(S.EF, d.timestamp), bopS = lastBefore(S.BOP, d.timestamp);
      return { at: at(d.timestamp), pull: pullName(d.timestamp), killingAbility: NAME(d.killingAbilityGameID), damageLast6sK: Math.round(before.reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0) / 1000), hitsLast6s: before.slice(-5).map(e => ({ ability: NAME(e.abilityGameID), amount: (e.amount || 0) + (e.absorbed || 0), secondsBefore: r2((d.timestamp - e.timestamp) / 1000) })),
        divineProtection: dpS === null || dpS >= CD.DIVPROT ? 'available' : r1(dpS) + 's before', divineShield: dsS === null || dsS >= CD.DSHIELD ? 'available' : r1(dsS) + 's before', layOnHands: lohS === null || lohS >= CD.LOH ? 'available' : r1(lohS) + 's before', blessingOfProtection: bopS === null || bopS >= CD.BOP ? 'available' : r1(bopS) + 's before', eternalFlameSecondsBefore: r1(efS), holyPowerAtDeath: hpTrace.filter(x => x.t <= d.timestamp).pop()?.hp ?? null };
    });
    const partyDeaths = deaths.filter(d => d.targetID !== P).map(d => ({ who: (meta.actors.find(a => a.id === d.targetID) || {}).name || d.targetID, at: fmt(rel(d.timestamp)), pull: pullName(d.timestamp), ability: NAME(d.killingAbilityGameID) }));
    const takenTotal = taken.reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
    const takenBy = Object.values(taken.reduce((m, e) => { (m[e.abilityGameID] ||= { name: NAME(e.abilityGameID), amount: 0, hits: 0 }); m[e.abilityGameID].amount += (e.amount || 0) + (e.absorbed || 0); m[e.abilityGameID].hits++; return m; }, {})).sort((a, b) => b.amount - a.amount).slice(0, 8);

    // ── gear ──
    const ci = comb.combatantInfo[0] || {};
    const SLOTS = ['head', 'neck', 'shoulder', 'shirt', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands', 'ring1', 'ring2', 'trinket1', 'trinket2', 'back', 'mainhand', 'offhand', 'tabard'];
    const ENCHANTABLE = new Set(['head', 'shoulder', 'chest', 'legs', 'feet', 'ring1', 'ring2', 'mainhand', 'back', 'wrist']);
    const gear = (ci.gear || []).map((g, i) => ({ slot: SLOTS[i], id: g.id, ilvl: g.itemLevel, quality: g.quality, setID: g.setID || null, enchant: g.permanentEnchant || null, oil: g.temporaryEnchant || null, gems: (g.gems || []).map(x => x.id), icon: (g.icon || '').replace('.jpg', '') })).filter(g => g.id && g.ilvl > 1);
    const tierSetId = (() => { const c = {}; for (const g of gear) if (g.setID) c[g.setID] = (c[g.setID] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; })();
    const auras = (ci.auras || []).map(a => ({ id: a.ability, name: a.name || NAME(a.ability) }));
    const secondaries = { crit: ci.critMelee, haste: ci.hasteMelee, mastery: ci.mastery, versatility: ci.versatilityDamageDone };
    const secondaryOrder = Object.entries(secondaries).sort((a, b) => b[1] - a[1]);
    const gearSummary = {
      avgIlvl: r1(avg(gear.filter(g => g.slot !== 'shirt' && g.slot !== 'tabard').map(g => g.ilvl))), tierPieces: gear.filter(g => String(g.setID) === String(tierSetId) && /paladin/.test(g.icon)).length, tierSlots: gear.filter(g => String(g.setID) === String(tierSetId) && /paladin/.test(g.icon)).map(g => g.slot),
      missingEnchants: gear.filter(g => ENCHANTABLE.has(g.slot) && !g.enchant).map(g => g.slot), gemsTotal: gear.reduce((s, g) => s + g.gems.length, 0), weapon: gear.filter(g => g.slot === 'mainhand').map(g => `${g.icon} ilvl ${g.ilvl} enchant ${g.enchant} oil ${g.oil}`)[0] || null,
      trinkets: gear.filter(g => /trinket/.test(g.slot)).map(g => `${g.icon} ilvl ${g.ilvl}${g.setID ? ' set ' + g.setID : ''}`), stats: { strength: ci.strength, stamina: ci.stamina, ...secondaries, avoidance: ci.avoidance, leech: ci.leech },
      secondaryOrder: secondaryOrder.map(([k, v]) => `${k} ${v}`), potionStatAtThisRating: secondaryOrder[0][0], aurasAtStart: auras.map(a => a.name), hasFood: auras.some(a => /well fed|feast|celebration|food/i.test(a.name)), hasFlask: auras.some(a => /flask/i.test(a.name)), hasAugmentRune: auras.some(a => /rune|void-touched/i.test(a.name)), talentImportCode: comb.talentImportCode, gear,
    };
    const talentsSeen = { heroTalent: iv.dawn.length || dmg.some(e => e.abilityGameID === S.DAWNLIGHT_DEBUFF) ? 'Herald of the Sun' : (buffs.some(b => NAME(b.abilityGameID) === 'Hammer of Light') ? 'Templar' : 'unknown'), wings: cooldowns.wings.name, executionSentence: esTimes.length > 0, finalReckoning: times(S.FINAL_RECKONING).length > 0, divineToll: dtTimes.length > 0, crusadingStrikes: times(S.CS).length > 0, lightWithin: dmg.some(e => e.abilityGameID === S.LIGHT_WITHIN), tempestOfTheLightbringer: dmg.some(e => e.abilityGameID === S.DS_TEMPEST), divinePurpose: iv.dp.length > 0, empyreanLegacy: iv.legacy.length > 0, blessingOfAnshe: iv.anshe.length > 0, walkIntoLight: resources.some(r => NAME(r.abilityGameID) === 'Walk Into Light'), eternalFlame: times(S.EF).length > 0, divineResonance: iv.resonance.length > 0, hammerOfWrath: times(S.HOW).length > 0 };

    const kpi = {
      dps: Math.round(total / dur), keyLevel: f.keystoneLevel, timed: f.kill, minutes: r1(dur / 60),
      holyPowerWastedPct: holyPower.wastedPct, holyPowerWasted: wasteTotal, generatorsIntoCap: genAtCap.length, pctOfPullTimeAtFive: holyPower.pctOfPullTimeAtFive,
      wakeAt3Plus: wakeHigh.length, wakeCasts: wakeTimes.length, divineTollWithWaste: holyPower.divineTollWithWaste, divineTollCasts: dtTimes.length,
      divinePurposeExpired: procs.divinePurpose.expired, divinePurposeProcs: procs.divinePurpose.procs, artOfWarWasted: aowRefreshAt2, bladeWithArtOfWarPct: pct(bojWithAow, times(S.BOJ).length),
      dawnlightWindowsShort: procs.dawnlight.expiredWithStacksLeft, legacyExpired: procs.empyreanLegacy.expired,
      fvAt2PlusNoArbiter: fvMulti.length, dsAt1NoArbiter: dsSingle.length, arbiterSpenderWrong: arbWrong.length, judgedSpendersPct: spenderChoice.judgedSpendersPct, eternalFlamePaid: spenderChoice.eternalFlamePaid,
      wingsCasts: awTimes.length, esPairedWithWings: `${esNearAw}/${esTimes.length}`, wingsWithoutES: awWithoutEs.length, wingsClean: wingsWindows.filter(w => w.ok).length, wingsWindows: wingsWindows.length,
      potions: `${potionTimes.length}/${cooldowns.potion.possible}`, trinketCasts: times(S.TRINKET).length, expurgationUptimeBossesPct: r1(avg(bossUptime.map(b => b.expurgationUptimePct).filter(x => x !== null))), judgmentUptimeBossesPct: r1(avg(bossUptime.map(b => b.judgmentUptimePct).filter(x => x !== null))),
      gcdPerMinute: activity.gcdPressesPerMinuteInPulls, medianGap: activity.medianGapSeconds, shortGaps1_6to3s: activity.gaps1_6to3s, idlePct: activity.idlePctOfPulls, wingsDamagePct: pct(wingsDmg, total), wingsUptimePct: pct(wingsSecs, dur), deaths: myDeaths.length, ilvl: gearSummary.avgIlvl, secondaries: gearSummary.secondaryOrder.join(' > '), potionStat: gearSummary.potionStatAtThisRating, food: gearSummary.hasFood, tier: gearSummary.tierPieces, hero: talentsSeen.heroTalent,
    };

    // ── sequence and presses ──
    const lines = [`${meta.player.name} | [${f.id}] ${f.name} +${f.keystoneLevel} ${f.kill ? 'TIMED' : 'NOT TIMED'} ${fmt(dur)} | ${Math.round(total / dur).toLocaleString()} DPS`,
      'Columns: time | press | Holy Power before the press (modelled from resource events, anchored on spender casts) | windows: Wings, ES (Execution Sentence), DP (Divine Purpose), AoW:n (Art of War stacks), Arb (Divine Arbiter), Dawn:n (Dawnlight charges), HoW (Hammer of Wrath proc) | targets near | note'];
    const presses = [];
    let lastPull = null, prevGcd = null;
    const BAD = /wasted|into a full bar|was the call|without|late|expired|idle|Wings with|no potion|at \d Holy Power: /;
    for (const c of press) {
      const p = pullAt(c.t);
      const pn = pullName(c.t);
      if (pn !== lastPull) { lines.push(`\n──── ${pn} ${p ? '(' + fmt(rel(p.startTime)) + ' to ' + fmt(rel(p.endTime)) + ')' : ''} ────`); lastPull = pn; }
      const notes = [];
      const h = hpAt(c);
      if (prevGcd && p && pullAt(prevGcd.t) === p && !OFF_GCD.has(c.id)) { const g = (c.t - prevGcd.t) / 1000; if (g > 2.5 && !dead(prevGcd.t, c.t)) notes.push(`idle ${r1(g)}s before this`); }
      if (GENERATORS.has(c.id) && h !== undefined) {
        const gain = c.id === S.DT ? null : (GEN_GAIN[c.id] || 1);
        if (gain !== null && h + gain > 5) notes.push(`${c.name} at ${h} Holy Power: ${h + gain - 5} wasted, spend first`);
        if (c.id === S.WAKE && h >= 3) notes.push(`Wake of Ashes at ${h} Holy Power: ${h - 2} wasted, Wake wants 2 or less`);
        if (c.id === S.DT) { const d = dtCasts.find(x => x.at === at(c.t)); if (d && d.waste > 0) notes.push(`Divine Toll at ${h} Holy Power on ${d.targets} targets: ${d.waste} wasted`); }
        if (c.id === S.BOJ) { const s = stacksAt(iv.aow, c.t); if (s) notes.push(`Art of War x${s}`); }
      }
      if (SPENDERS.has(c.id)) {
        const sc = spenderCasts.find(x => x.t === c.t && x.id === c.id);
        if (sc) {
          if (sc.free) notes.push('free (Divine Purpose)');
          if (c.id === S.FV && sc.targets >= 2 && !sc.arbiter) notes.push(`Final Verdict on ${sc.targets} targets: Divine Storm was the call`);
          if (c.id === S.DS && sc.targets <= 1 && !sc.arbiter) notes.push('Divine Storm on 1 target: Final Verdict was the call');
          if (sc.arbiter) notes.push(((sc.targets >= 2 && c.id === S.FV) || (sc.targets <= 1 && c.id === S.DS)) ? 'Divine Arbiter, right spender' : `Divine Arbiter up: ${sc.targets >= 2 ? 'Final Verdict' : 'Divine Storm'} was the call`);
          if (c.id === S.EF) notes.push(sc.free ? 'Eternal Flame (free)' : 'Eternal Flame: 3 Holy Power to healing');
          if ((c.id === S.FV || c.id === S.DS) && Object.keys(judgOn).length && !sc.judged) notes.push('no Judgment debuff on the target');
        }
      }
      if (c.id === S.AW || c.id === S.CRUSADE) { const w = wingsWindows.find(w => w.at === at(c.t)); if (w) notes.push(`WINGS #${w.n}: ${w.issues.length ? 'ISSUES: ' + w.issues.join('; ') : 'clean'}`); }
      if (c.id === S.ES && !awTimes.some(a => Math.abs(a - c.t) <= 6000)) notes.push('Execution Sentence without Wings');
      const win = [inWings(c.t) && 'Wings', activeAt(iv.es, c.t) && 'ES', activeAt(iv.dp, c.t) && 'DP', stacksAt(iv.aow, c.t) ? 'AoW:' + stacksAt(iv.aow, c.t) : null, arbiterActive(c.t) && 'Arb', stacksAt(iv.dawn, c.t) ? 'Dawn:' + stacksAt(iv.dawn, c.t) : null, activeAt(iv.howProc, c.t) && 'HoW'].filter(Boolean).join(' ');
      const tg = SPENDERS.has(c.id) || GENERATORS.has(c.id) ? targetsNear(c.t) : null;
      lines.push(`${at(c.t).padStart(7)}  ${c.name.padEnd(26)} HP ${h === undefined ? '?' : h}  ${win.padEnd(28)} ${tg !== null ? ('tgt ' + tg).padEnd(7) : '       '}${notes.length ? ' | ' + notes.join('; ') : ''}`);
      presses.push({ t: at(c.t), s: r2(rel(c.t)), name: c.name, id: c.id, hp: h ?? null, windows: win, targets: tg, pull: pn, boss: !!(p && p.isBoss), wings: wingsWindows.findIndex(w => { const X = awTimes[w.n - 1]; const wb = iv.wings.find(v => Math.abs(v.start - X) < 1500); return c.t >= X - 3000 && c.t <= (wb ? wb.end : X + 20000); }) + 1 || null, note: notes.join('; '), bad: notes.some(n => BAD.test(n)) });
      if (!OFF_GCD.has(c.id)) prevGcd = c;
    }
    writeFileSync(join(D, `${tag}-sequence.txt`), lines.join('\n'));
    writeFileSync(join(D, `${tag}-presses.json`), JSON.stringify(presses));

    audit.fights.push({ id: f.id, name: f.name, key: f.keystoneLevel, timed: f.kill, seconds: r1(dur), dps: Math.round(total / dur), totalDamageM: r2(total / 1e6), damageTop, bossDps, bossUptime,
      wingsShare: { seconds: r1(wingsSecs), damagePct: pct(wingsDmg, total) }, kpi, holyPower, procs, spenderChoice, cooldowns, wingsWindows, activity,
      deaths: { mine: myDeaths, party: partyDeaths, damageTakenTotalM: r2(takenTotal / 1e6), damageTakenTop: takenBy }, gear: gearSummary, talentsSeen,
      pulls: pulls.map(p => ({ name: p.name, boss: p.isBoss, start: fmt(rel(p.startTime)), seconds: r1((p.endTime - p.startTime) / 1000) })) });
  }
  writeFileSync(join(D, 'audit.json'), JSON.stringify(audit, null, 1));
  return { audit, dir: D };
}

function printFight(f) {
  console.log(`\n${'═'.repeat(100)}\n  [${f.id}] ${f.name} +${f.key}  ${f.timed ? 'TIMED' : 'NOT TIMED'}  ${fmt(f.seconds)}  ${f.dps.toLocaleString()} DPS  (${f.totalDamageM}M)  ${f.talentsSeen.heroTalent}\n${'═'.repeat(100)}`);
  console.log('Bosses: ' + f.bossDps.map(b => `${b.boss} ${b.dps.toLocaleString()} (${fmt(b.seconds)})`).join(' | '));
  console.log('Wings uptime ' + f.wingsShare.seconds + 's, ' + f.wingsShare.damagePct + '% of damage | top: ' + f.damageTop.slice(0, 7).map(d => `${d.name} ${d.share}%`).join(', '));
  const h = f.holyPower;
  console.log(`\nHOLY POWER generated ${h.generated}, wasted ${h.wasted} (${h.wastedPct}%) by ${JSON.stringify(h.wastedBy)} | generators pressed into a full bar ${h.generatorPressedIntoCap} ${JSON.stringify(h.generatorPressedIntoCapBy)} | Wake at 3+ ${h.wakeAt3Plus}/${h.wakeCasts} | Divine Toll with waste ${h.divineTollWithWaste}/${h.divineTollCasts} (${h.divineTollWasted} HP) | at 5 Holy Power ${h.pctOfPullTimeAtFive}% of pull time | spender Holy Power ${JSON.stringify(h.spenderHolyPower)}`);
  const p = f.procs;
  console.log(`PROCS Divine Purpose ${p.divinePurpose.procs} (expired ${p.divinePurpose.expired}) | Art of War ${p.artOfWar.procs}, wasted at 2 stacks ${p.artOfWar.wastedAtTwoStacks}, Blade with AoW ${p.artOfWar.bladeWithArtOfWar}/${p.artOfWar.bladeCasts} | Empyrean Legacy ${p.empyreanLegacy.procs} (expired ${p.empyreanLegacy.expired}) | Dawnlight windows ${p.dawnlight.wakes}, short ${p.dawnlight.expiredWithStacksLeft} | Divine Arbiter ${p.divineArbiter.applications}`);
  const s = f.spenderChoice;
  console.log(`SPENDERS DS ${s.divineStorm} FV ${s.finalVerdict} EF ${s.eternalFlame} (paid ${s.eternalFlamePaid}) | FV at 2+ targets without Arbiter ${s.finalVerdictAt2PlusWithoutArbiter} | DS at 1 target without Arbiter ${s.divineStormAt1WithoutArbiter} | Arbiter spender right ${s.arbiterSpenderRight} wrong ${s.arbiterSpenderWrong} | spenders with Judgment on the target ${s.judgedSpendersPct}% | DS targets ${JSON.stringify(s.dsTargetDistribution)}`);
  const c = f.cooldowns;
  console.log(`COOLDOWNS ${c.wings.name} ${c.wings.casts} (min gap ${c.wings.minGap}s, ${c.wings.buffAvgSeconds}s) | ES ${c.executionSentence.casts}, paired ${c.executionSentence.pairedWithWings}, Wings without ES ${c.executionSentence.wingsWithoutES.length} | Wake ${c.wakeOfAshes.casts} (avg gap ${c.wakeOfAshes.avgGap}s) | DT ${c.divineToll.casts} (avg gap ${c.divineToll.avgGap}s) | potion ${c.potion.casts}/${c.potion.possible} (in Wings ${c.potion.inWings}) | trinket ${c.trinket.casts}`);
  console.log(`DEFENSIVE Divine Protection ${c.divineProtection.casts} | Divine Shield ${c.divineShield.casts} | LoH ${c.layOnHands.casts} | BoSac ${c.blessingOfSacrifice.casts} | BoP ${c.blessingOfProtection.casts} | Eternal Flame ${c.eternalFlame.casts} | Rebuke ${c.rebuke.casts}/${c.rebuke.landed} | Blinding Light ${c.blindingLight.casts} | HoJ ${c.hammerOfJustice.casts} | Intercession ${c.intercession.casts}`);
  console.log(`BOSS UPTIME ` + f.bossUptime.map(b => `${b.boss}: Expurgation ${b.expurgationUptimePct}% Judgment ${b.judgmentUptimePct}% Dawnlight ${b.dawnlightUptimePct}%`).join(' | '));
  console.log(`ACTIVITY ${f.activity.gcdPressesPerMinuteInPulls} GCD presses/min in pulls, idle >3s ${f.activity.idleGapsOver3s} gaps ${f.activity.idleSecondsOver3s}s (${f.activity.idlePctOfPulls}%): ` + f.activity.idleGapsTop.slice(0, 5).map(g => `${g.at} ${g.seconds}s ${g.after}>${g.before} (${g.pull})`).join('; '));
  console.log(`DEATHS ${f.deaths.mine.length}: ` + f.deaths.mine.map(d => `${d.at} ${d.pull} ${d.killingAbility} ${d.damageLast6sK}K/6s, DivProt ${d.divineProtection}, Shield ${d.divineShield}, LoH ${d.layOnHands}, HP at death ${d.holyPowerAtDeath}`).join(' | ') + ` | party ${f.deaths.party.length}`);
  const g = f.gear;
  console.log(`GEAR ilvl ${g.avgIlvl}, tier ${g.tierPieces} (${g.tierSlots.join(',')}), missing enchants [${g.missingEnchants.join(', ')}], gems ${g.gemsTotal} | ${g.weapon} | trinkets ${g.trinkets.join(' | ')}`);
  console.log(`     stats ${g.secondaryOrder.join(' > ')} => potion stat ${g.potionStatAtThisRating} | food ${g.hasFood} flask ${g.hasFlask} rune ${g.hasAugmentRune} | talents ${JSON.stringify(f.talentsSeen)}`);
  console.log(`\nWINGS WINDOWS:`);
  for (const w of f.wingsWindows) { console.log(`   #${w.n} ${w.at} ${w.pull} ${w.seconds}s ${w.damageM}M HP at Wings ${w.holyPowerAtWings}: ${w.sequence.slice(0, 16).join(' > ')}`); console.log(`       ES ${w.esAt}s Wake ${w.wakeAt}s DT ${w.dtAt}s potion ${w.potionAt}s trinket ${w.trinketAt}s | spenders ${w.spenders} (free ${w.freeSpenders}) wasted ${w.wasted} | ${w.ok ? 'CLEAN' : 'ISSUES: ' + w.issues.join('; ')}`); }
}

function compare(specs) {
  const rows = [];
  for (const spec of specs) { const [code, name] = spec.split(':'); const p = join(__dirname, '..', 'data', code, 'ret', lcName(name), 'audit.json'); if (!existsSync(p)) { console.error('missing audit for ' + spec); continue; } const a = JSON.parse(readFileSync(p, 'utf8')); for (const f of a.fights) rows.push({ who: `${a.player.name} ${f.name} +${f.key}`, ...f.kpi }); }
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => k !== 'who');
  console.log('metric'.padEnd(28) + rows.map(r => r.who.slice(0, 30).padEnd(32)).join(''));
  for (const k of keys) console.log(k.padEnd(28) + rows.map(r => String(r[k] ?? '').slice(0, 30).padEnd(32)).join(''));
}

if (argv[0] === '--compare') compare(argv.slice(1));
else {
  const [code, nameArg] = argv.filter(a => !a.startsWith('--'));
  if (!code || !nameArg) { console.error('Usage: node scripts/ret-audit.mjs <reportCode> <playerName> [--quiet] | --compare <report>:<player> ...'); process.exit(1); }
  const { audit, dir } = auditPlayer(code, nameArg);
  if (!QUIET) for (const f of audit.fights) printFight(f);
  console.log(`\nSaved ${join(dir, 'audit.json')} and ${audit.fights.map(f => 'fight' + f.id + '-sequence.txt').join(', ')}`);
}
