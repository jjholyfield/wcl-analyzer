/**
 * Windwalker (Conduit of the Celestials) Mythic+ rotational audit.
 * Reads the rotation cast by cast and grades every key in a report against the Season 2
 * Conduit rules in guides/ww-conduit-s2-rules.md, from the data pulled by ww-conduit-pull.mjs.
 *
 * Usage:
 *   node scripts/ww-conduit-pull.mjs <reportCode> [playerName]            (first)
 *   node scripts/ww-conduit-audit.mjs <reportCode> <playerName> [--quiet]
 *   node scripts/ww-conduit-audit.mjs --compare <report>:<player> <report>:<player> ...
 *
 * Writes, per player:
 *   data/<report>/ww/<player>/audit.json              every number below, per fight
 *   data/<report>/ww/<player>/fight<id>-sequence.txt  the rotation as a timeline: every cast with
 *                                                     energy/chi, active HotJS sources, Zenith/Xuen,
 *                                                     4pc stacks, proc stacks, FoF ticks, Conduit channel
 * Every number is computed from events. The only assumptions are the spell IDs below (verified
 * against this report's masterData) and these measured facts: a Zenith press grants 3 Zenith Stomp
 * charges and spends 1 on its free stomp; a full Fists of Fury is 5 tick clusters (the 2pc tick
 * shares the first cluster); Celestial Conduit's channel ends at the removal of its own aura.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fmt, lcName } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');

// ── Spell IDs (Midnight 12.1 Windwalker, verified in report z38dgtbNhaKLQP6k masterData) ──
const S = {
  TP: 100780, BOK: 100784, RSK: 107428, RSK_DMG: 185099, FOF: 113656, FOF_DMG: 117418, SCK: 101546, SCK_DMG: 107270,
  WDP: 152175, WDP_DMG: 158221, RWK: 467307, RWK_DMG: 468179, ZENITH: 1249625, ZSTOMP: 1272696,
  ZSTOMP_CHARGES: 1291484, XUEN: 123904, CONDUIT: 443028, CONDUIT_DMG: 443038, UNITY_CAST: 443591,
  UNITY_BUFF: 443592, HOTJS_WDP: 443421, HOTJS_ZENITH: 1238904, HOTJS_UNITY: 443616,
  TOD: 322109, KARMA: 122470, FORT: 115203, FORT_BUFF: 120954, POTION: 1236994, TRINKET: 1297761,
  SHS: 116705, LEGSWEEP: 119381, ROP: 116844, PARALYSIS: 115078, LUST: 116841, ROLL: 109132,
  FSK: 101545, VIVIFY: 116670, DETOX: 218164, CJL: 117952, CHI_EXPLOSION: 393056,
  COMBO_BREAKER: 116768, DCJ: 325202, HIT_COMBO: 196741, TIER4: 1297033, MOMENTUM: 451297,
  TIGEREYE: 1261724, DIFFUSE: 122783, DAMPEN: 122278, EXPEL: 322101, TRANSCENDENCE: 101643,
  TRANSFER: 119996, SOTW: 392983, SLICING: 1217413,
};
const COMBO_MARK = { 1249756: 'Tiger Palm', 1249753: 'Rising Sun Kick', 1249754: 'Spinning Crane Kick', 1249758: 'Fists of Fury',
  1249757: 'Blackout Kick', 1249765: 'Whirling Dragon Punch', 1250987: 'Rushing Wind Kick', 1249763: 'Zenith Stomp',
  1249791: 'Touch of Death', 1249790: 'Celestial Conduit' };
const MASTERY_ABILITIES = new Set([S.TP, S.BOK, S.RSK, S.FOF, S.SCK, S.WDP, S.RWK, S.ZSTOMP, S.TOD, S.CONDUIT]);
const LUST_IDS = new Set([2825, 32182, 80353, 390386, 264667, 466904]);
const CONSUMERS = new Set([S.RSK, S.SCK, S.RWK]);
// casts that never interrupt a channel (off the GCD) and the automatic Chi Explosion companion of SCK
const NON_BREAKING = new Set([S.SHS, S.KARMA, S.FORT, S.POTION, S.TRINKET, S.DIFFUSE, S.DAMPEN, S.CHI_EXPLOSION, S.UNITY_CAST]);
const POTION_CD = 300, TRINKET_CD = 90, KARMA_CD = 90, FORT_CD = 360, XUEN_BASE = 90;

const r2 = (x) => x === null || x === undefined ? null : Math.round(x * 100) / 100;
const r1 = (x) => x === null || x === undefined ? null : Math.round(x * 10) / 10;
const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
const avg = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function intervalsOf(buffs, id, fightEnd) {
  const out = [];
  let open = null;
  for (const b of buffs) {
    if (b.abilityGameID !== id) continue;
    if (b.type === 'applybuff') { if (open) { open.end = b.timestamp; out.push(open); } open = { start: b.timestamp, end: null, stacks: 1, maxStacks: 1, refreshes: 0 }; }
    else if (b.type === 'applybuffstack') { if (open) { open.stacks = b.stack || open.stacks + 1; open.maxStacks = Math.max(open.maxStacks, open.stacks); } }
    else if (b.type === 'removebuffstack') { if (open) open.stacks = b.stack || Math.max(1, open.stacks - 1); }
    else if (b.type === 'refreshbuff') { if (open) open.refreshes++; }
    else if (b.type === 'removebuff') { if (open) { open.end = b.timestamp; out.push(open); open = null; } }
  }
  if (open) { open.end = fightEnd; out.push(open); }
  return out;
}
const activeAt = (ivs, t) => ivs.find(iv => iv.start <= t && iv.end > t) || null;

function auditPlayer(code, playerName) {
  const D = join(__dirname, '..', 'data', code, 'ww', lcName(playerName));
  if (!existsSync(join(D, 'meta.json'))) throw new Error('No pulled data at ' + D + '. Run ww-conduit-pull.mjs first.');
  const J = (f) => JSON.parse(readFileSync(join(D, f), 'utf8'));
  const meta = J('meta.json');
  const NAME = (id) => meta.abilityNames[id] || ('#' + id);
  const P = meta.player.id;
  const audit = { report: meta.report, player: meta.player, generatedAt: new Date().toISOString(), fights: [] };

  for (const f of meta.fights) {
    const tag = `fight${f.id}`;
    const t0 = f.startTime, dur = (f.endTime - f.startTime) / 1000;
    const rel = (ts) => (ts - t0) / 1000;
    const at = (ts) => fmt(rel(ts)) + '.' + String(Math.floor((rel(ts) % 1) * 10));
    const castsAll = J(`${tag}-casts.json`);
    const buffs = J(`${tag}-buffs.json`).sort((a, b) => a.timestamp - b.timestamp);
    const dmg = J(`${tag}-dmgdone.json`).filter(e => e.type === 'damage');
    const taken = J(`${tag}-dmgtaken.json`).filter(e => e.type === 'damage');
    const resources = J(`${tag}-resources.json`);
    const deaths = J(`${tag}-deaths.json`);
    const interrupts = J(`${tag}-interrupts.json`);
    const comb = J(`${tag}-combatant.json`);
    const pulls = (f.dungeonPulls || []).map(p => ({ ...p, isBoss: !!p.encounterID }));
    const pullAt = (ts) => pulls.find(p => p.startTime <= ts && p.endTime >= ts) || null;
    const pullName = (ts) => { const p = pullAt(ts); return p ? `${p.isBoss ? 'BOSS ' : ''}${p.name}` : 'between pulls'; };

    const casts = castsAll.filter(c => c.type === 'cast').sort((a, b) => a.timestamp - b.timestamp).map(c => {
      const en = (c.classResources || []).find(x => x.type === 3);
      const chi = (c.classResources || []).find(x => x.type === 12);
      return { t: c.timestamp, id: c.abilityGameID, name: NAME(c.abilityGameID), energy: en ? en.amount : null, energyMax: en ? en.max : null,
        chi: chi ? chi.amount : null, chiMax: chi ? chi.max : null, hp: c.hitPoints, maxHp: c.maxHitPoints, target: c.targetID };
    });
    const castsOf = (id) => casts.filter(c => c.id === id);
    const times = (id) => castsOf(id).map(c => c.t);
    const breaking = casts.filter(c => !NON_BREAKING.has(c.id));
    const nextBreaking = (t) => breaking.find(x => x.t > t + 30);

    // ── Buff intervals ──
    const iv = {};
    for (const [k, id] of Object.entries({ xuen: S.XUEN, zenith: S.ZENITH, hotWDP: S.HOTJS_WDP, hotZen: S.HOTJS_ZENITH, hotUnity: S.HOTJS_UNITY, unity: S.UNITY_BUFF, conduitAura: S.CONDUIT,
      tier4: S.TIER4, potion: S.POTION, trinket: S.TRINKET, fort: S.FORT_BUFF, karma: S.KARMA, stompCharges: S.ZSTOMP_CHARGES, comboBreaker: S.COMBO_BREAKER, dcj: S.DCJ, hitCombo: S.HIT_COMBO })) iv[k] = intervalsOf(buffs, id, f.endTime);
    iv.lust = [...LUST_IDS].flatMap(id => intervalsOf(buffs, id, f.endTime));
    const hotSources = (t) => [activeAt(iv.hotZen, t) && 'Z', activeAt(iv.hotWDP, t) && 'W', activeAt(iv.hotUnity, t) && 'U'].filter(Boolean);
    const inXuen = (t) => !!activeAt(iv.xuen, t);
    const inZenith = (t) => !!activeAt(iv.zenith, t);
    const inLust = (t) => !!activeAt(iv.lust, t);
    const avgDur = (ivs) => ivs.length ? r2(avg(ivs.map(x => (x.end - x.start) / 1000))) : null;
    const buffDataEnd = buffs.length ? buffs[buffs.length - 1].timestamp : t0;
    const buffCoveragePct = pct(buffDataEnd - t0, f.endTime - t0);

    // ── Damage ──
    const dmgBy = {};
    let total = 0;
    for (const e of dmg) { const a = (e.amount || 0) + (e.absorbed || 0); total += a; (dmgBy[e.abilityGameID] ||= { name: NAME(e.abilityGameID), amount: 0, hits: 0, crits: 0 }); dmgBy[e.abilityGameID].amount += a; dmgBy[e.abilityGameID].hits++; if (e.hitType === 2) dmgBy[e.abilityGameID].crits++; }
    const damageTop = Object.values(dmgBy).sort((a, b) => b.amount - a.amount).slice(0, 20).map(x => ({ ...x, share: pct(x.amount, total), critPct: pct(x.crits, x.hits) }));
    const dmgIn = (a, b) => dmg.filter(e => e.timestamp >= a && e.timestamp <= b).reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
    const bossDps = pulls.filter(p => p.isBoss).map(p => ({ boss: p.name, start: fmt(rel(p.startTime)), seconds: r1((p.endTime - p.startTime) / 1000), dps: Math.round(dmgIn(p.startTime, p.endTime) / ((p.endTime - p.startTime) / 1000)) }));
    const xuenSecs = iv.xuen.reduce((s, x) => s + (x.end - x.start), 0) / 1000;
    const xuenDmg = dmg.filter(e => inXuen(e.timestamp)).reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
    const castDmg = (dmgId, t, windowMs) => dmg.filter(e => e.abilityGameID === dmgId && e.timestamp >= t - 20 && e.timestamp <= t + windowMs).reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);

    // ── Cooldowns ──
    const gaps = (ts) => ts.slice(1).map((t, i) => r1((t - ts[i]) / 1000));
    const xuenTimes = times(S.XUEN), conduitTimes = times(S.CONDUIT), zenithTimes = times(S.ZENITH), potionTimes = times(S.POTION);
    const xuenCD = xuenTimes.length > 1 ? Math.min(...gaps(xuenTimes)) : null;
    const cooldowns = {
      xuen: { casts: xuenTimes.length, times: xuenTimes.map(t => fmt(rel(t))), gapsSeconds: gaps(xuenTimes), minGap: xuenCD, inferredCD: xuenCD && xuenCD > 105 ? 120 : 90, buffAvgSeconds: avgDur(iv.xuen) },
      conduit: { casts: conduitTimes.length, times: conduitTimes.map(t => fmt(rel(t))), gapsSeconds: gaps(conduitTimes), minGap: conduitTimes.length > 1 ? Math.min(...gaps(conduitTimes)) : null },
      zenith: { casts: zenithTimes.length, times: zenithTimes.map(t => fmt(rel(t))), gapsSeconds: gaps(zenithTimes), buffApplications: iv.zenith.length, buffAvgSeconds: avgDur(iv.zenith) },
      touchOfDeath: { casts: times(S.TOD).length, times: times(S.TOD).map(t => fmt(rel(t))) },
      potion: { casts: potionTimes.length, times: potionTimes.map(t => fmt(rel(t))), gapsSeconds: gaps(potionTimes), possible: Math.floor(dur / POTION_CD) + 1 },
      trinket: { casts: times(S.TRINKET).length },
      touchOfKarma: { casts: times(S.KARMA).length, times: times(S.KARMA).map(t => fmt(rel(t))) },
      fortifyingBrew: { casts: times(S.FORT).length, times: times(S.FORT).map(t => fmt(rel(t))) },
      diffuseMagic: { casts: times(S.DIFFUSE).length }, dampenHarm: { casts: times(S.DAMPEN).length },
      vivify: { casts: times(S.VIVIFY).length }, expelHarm: { casts: times(S.EXPEL).length }, detox: { casts: times(S.DETOX).length },
      spearHandStrike: { casts: times(S.SHS).length, interruptsLanded: interrupts.filter(i => i.abilityGameID === S.SHS).length },
      legSweep: { casts: times(S.LEGSWEEP).length }, ringOfPeace: { casts: times(S.ROP).length }, paralysis: { casts: times(S.PARALYSIS).length },
      tigersLust: { casts: times(S.LUST).length }, roll: { casts: times(S.ROLL).length }, flyingSerpentKick: { casts: times(S.FSK).length },
      transcendence: { casts: times(S.TRANSCENDENCE).length, transfers: times(S.TRANSFER).length },
    };

    // ── Fists of Fury: clusters, channel, clipping, loss ──
    const fofDmgEv = dmg.filter(e => e.abilityGameID === S.FOF_DMG);
    const fofCastsRaw = castsOf(S.FOF);
    const fofCasts = fofCastsRaw.map((c, i) => {
      const next = fofCastsRaw[i + 1];
      const ev = fofDmgEv.filter(e => e.timestamp >= c.t - 20 && e.timestamp <= c.t + 6000 && (!next || e.timestamp < next.t));
      const clusters = [];
      for (const e of ev.sort((a, b) => a.timestamp - b.timestamp)) {
        const last = clusters[clusters.length - 1];
        if (last && e.timestamp - last.t <= 50) { last.dmg += (e.amount || 0) + (e.absorbed || 0); last.targets.add(e.targetID + ':' + (e.targetInstance || 0)); }
        else clusters.push({ t: e.timestamp, dmg: (e.amount || 0) + (e.absorbed || 0), targets: new Set([e.targetID + ':' + (e.targetInstance || 0)]) });
      }
      const hot = hotSources(c.t);
      const interval = clusters.length >= 2 ? (clusters[1].t - clusters[0].t) / 1000 : (hot.length >= 2 ? 0.22 : hot.length === 1 ? 0.33 : 0.73);
      const expectedEnd = c.t + 4 * interval * 1000;
      const nb = nextBreaking(c.t);
      const clipped = clusters.length < 5;
      const byPlayer = clipped && nb && nb.t < expectedEnd - 80;
      const chan = clusters.length ? (clusters[clusters.length - 1].t - c.t) / 1000 : 0;
      return { t: c.t, at: at(c.t), pull: pullName(c.t), hot, inHot: hot.length > 0, clusters: clusters.length, clusterDmg: clusters.map(x => x.dmg), channelSeconds: r2(chan), tickInterval: r2(interval),
        maxTargets: clusters.length ? Math.max(...clusters.map(x => x.targets.size)) : 0, totalDmg: clusters.reduce((s, x) => s + x.dmg, 0),
        clipped, clippedBy: byPlayer ? nb.name : (clipped ? (nb ? 'targets gone (next cast after channel end)' : 'end of data') : null), clipGapSeconds: nb ? r2((nb.t - c.t) / 1000) : null,
        chiBefore: c.chi, inXuen: inXuen(c.t), inZenith: inZenith(c.t) };
    });
    // tick-position ratios from full channels: ratio_i = cluster_i / cluster_1
    const fullFof = fofCasts.filter(x => x.clusters === 5 && x.clusterDmg[0] > 0);
    const ratio = [1, 2, 3, 4].map(i => fullFof.length ? avg(fullFof.map(x => x.clusterDmg[i] / x.clusterDmg[0])) : [1, 1.5, 2, 2.5][i - 1]);
    let fofLost = 0;
    for (const x of fofCasts) if (x.clipped && x.clippedBy && !x.clippedBy.startsWith('targets') && x.clippedBy !== 'end of data' && x.clusters >= 1) {
      for (let i = x.clusters; i < 5; i++) fofLost += x.clusterDmg[0] * (i === 0 ? 1 : ratio[i - 1]);
    }
    const fofIn = fofCasts.filter(x => x.inHot), fofOut = fofCasts.filter(x => !x.inHot);
    const fof = {
      casts: fofCasts.length, insideHotjs: fofIn.length, outsideHotjs: fofOut.length, insidePct: pct(fofIn.length, fofCasts.length),
      fullChannels: fullFof.length, fullPct: pct(fullFof.length, fofCasts.length),
      clippedByPlayer: fofCasts.filter(x => x.clippedBy && !x.clippedBy.startsWith('targets') && x.clippedBy !== 'end of data').length,
      clippedTargetsGone: fofCasts.filter(x => x.clippedBy && x.clippedBy.startsWith('targets')).length,
      clippedByAbility: fofCasts.filter(x => x.clippedBy && !x.clippedBy.startsWith('targets') && x.clippedBy !== 'end of data').reduce((m, x) => (m[x.clippedBy] = (m[x.clippedBy] || 0) + 1, m), {}),
      clippedByPlayerInside: fofIn.filter(x => x.clippedBy && !x.clippedBy.startsWith('targets') && x.clippedBy !== 'end of data').length,
      clippedByPlayerOutside: fofOut.filter(x => x.clippedBy && !x.clippedBy.startsWith('targets') && x.clippedBy !== 'end of data').length,
      clustersAvgInside: r2(avg(fofIn.map(x => x.clusters))), clustersAvgOutside: r2(avg(fofOut.map(x => x.clusters))),
      fullChannelSecondsInside: r2(avg(fullFof.filter(x => x.inHot).map(x => x.channelSeconds))), fullChannelSecondsOutside: r2(avg(fullFof.filter(x => !x.inHot).map(x => x.channelSeconds))),
      tickRatios: ratio.map(r2), lastTickSharePct: pct(ratio[3], 1 + ratio[0] + ratio[1] + ratio[2] + ratio[3]),
      estimatedDamageLostM: r2(fofLost / 1e6), estimatedDamageLostPct: pct(fofLost, total),
      clippedList: fofCasts.filter(x => x.clipped).map(x => ({ at: x.at, pull: x.pull, clusters: x.clusters, hot: x.hot.join(''), channel: x.channelSeconds, by: x.clippedBy, gap: x.clipGapSeconds })),
    };

    // ── HotJS windows ──
    const hotjsWindowsAll = [...iv.hotWDP.map(h => ({ ...h, src: 'WDP' })), ...iv.hotZen.map(h => ({ ...h, src: 'Zenith' })), ...iv.hotUnity.map(h => ({ ...h, src: 'Unity' }))].sort((a, b) => a.start - b.start)
      .map(h => ({ src: h.src, at: at(h.start), seconds: r2((h.end - h.start) / 1000), fof: fofCastsRaw.filter(c => c.t >= h.start && c.t <= h.end).length, pull: pullName(h.start), inXuen: inXuen(h.start) }));
    // overlaps WDP<->Unity (they do not stack). Measure at the start of the later one: the remaining time of the earlier.
    const overlaps = [];
    for (const u of iv.hotUnity) { const w = activeAt(iv.hotWDP, u.start); if (w) overlaps.push({ at: at(u.start), pull: pullName(u.start), later: 'Unity (Conduit cancelled)', earlierRemaining: r2((w.end - u.start) / 1000) }); }
    for (const w of iv.hotWDP) { const u = activeAt(iv.hotUnity, w.start); if (u) overlaps.push({ at: at(w.start), pull: pullName(w.start), later: 'WDP', earlierRemaining: r2((u.end - w.start) / 1000) }); }
    const hotjs = {
      windows: { WDP: iv.hotWDP.length, Zenith: iv.hotZen.length, Unity: iv.hotUnity.length },
      avgSeconds: { WDP: avgDur(iv.hotWDP), Zenith: avgDur(iv.hotZen), Unity: avgDur(iv.hotUnity) },
      avgFofPerWindow: { WDP: r2(avg(hotjsWindowsAll.filter(w => w.src === 'WDP').map(w => w.fof))), Zenith: r2(avg(hotjsWindowsAll.filter(w => w.src === 'Zenith').map(w => w.fof))), Unity: r2(avg(hotjsWindowsAll.filter(w => w.src === 'Unity').map(w => w.fof))) },
      wdpWindowsWithZeroFof: hotjsWindowsAll.filter(w => w.src === 'WDP' && w.fof === 0).length, unityWindowsWithZeroFof: hotjsWindowsAll.filter(w => w.src === 'Unity' && w.fof === 0).length,
      wdpUnityOverlaps: overlaps.length, wdpUnityOverlapSeconds: r2(overlaps.reduce((s, o) => s + o.earlierRemaining, 0)), overlapsList: overlaps,
      windowsList: hotjsWindowsAll,
    };

    // ── Celestial Conduit ──
    const conduits = castsOf(S.CONDUIT).map((c, i) => {
      const aura = iv.conduitAura.find(a => Math.abs(a.start - c.t) < 100) || activeAt(iv.conduitAura, c.t + 10);
      const endT = aura ? aura.end : null;
      const unityHot = iv.hotUnity.find(h => h.start >= c.t && h.start <= c.t + 8000);
      const channelSec = endT ? (endT - c.t) / 1000 : null;
      const cancelCast = endT ? casts.find(x => Math.abs(x.t - endT) <= 80 && x.id !== S.CONDUIT) : null;
      const cancelledWith = cancelCast ? (cancelCast.id === S.UNITY_CAST ? 'Unity Within recast' : cancelCast.name) : (channelSec !== null && channelSec >= 2.7 ? 'ran the full channel' : (endT ? 'movement or unknown' : 'no aura data'));
      const ticks = new Set(dmg.filter(e => e.abilityGameID === S.CONDUIT_DMG && e.timestamp >= c.t && e.timestamp <= (endT || c.t + 5000) + 50).map(e => e.timestamp)).size;
      const wdpHot = activeAt(iv.hotWDP, c.t);
      const lastWdpHot = iv.hotWDP.filter(h => h.end <= c.t).sort((a, b) => b.end - a.end)[0];
      const fofBefore = endT ? fofCastsRaw.filter(x => x.t >= c.t && x.t < endT - 30) : [];
      const fofCancel = cancelCast && cancelCast.id === S.FOF ? fofCasts.find(x => x.t === cancelCast.t) : null;
      const fofInUnity = unityHot ? fofCastsRaw.filter(x => x.t >= unityHot.start && x.t <= unityHot.end).length : 0;
      const lastXuen = xuenTimes.filter(t => t <= c.t).pop();
      const xb = lastXuen !== undefined ? iv.xuen.find(x => Math.abs(x.start - lastXuen) < 1500) : null;
      const wdpInWindowBefore = lastXuen !== undefined ? castsOf(S.WDP).some(w => w.t >= lastXuen && w.t < c.t) : false;
      const wdpAfter = castsOf(S.WDP).find(x => x.t > c.t && x.t <= c.t + 25000);
      return {
        n: i + 1, at: at(c.t), pull: pullName(c.t), inXuen: inXuen(c.t), inZenith: inZenith(c.t), secondsAfterXuen: lastXuen !== undefined ? r1((c.t - lastXuen) / 1000) : null,
        insideXuenWindow: xb ? c.t <= xb.end : false, wdpAlreadyUsedThisWindow: wdpInWindowBefore,
        channelSeconds: r2(channelSec), ticks, cancelledWith, wdpHotjsActiveAtCast: !!wdpHot, wdpHotjsRemainingSeconds: wdpHot ? r2((wdpHot.end - c.t) / 1000) : null,
        secondsSinceWdpHotjsEnded: lastWdpHot ? r2((c.t - lastWdpHot.end) / 1000) : null,
        unityHotjsSeconds: unityHot ? r2((unityHot.end - unityHot.start) / 1000) : null, fofInsideUnityHotjs: fofInUnity,
        fofBeforeChannelEnd: fofBefore.map(x => r2((x.t - c.t) / 1000)), fofAsCancelTickInterval: fofCancel ? fofCancel.tickInterval : null,
        fofAsCancelBuffed: fofCancel ? fofCancel.tickInterval < 0.5 : null, nextWdpSecondsAfter: wdpAfter ? r2((wdpAfter.t - c.t) / 1000) : null,
      };
    });
    const withChan = conduits.filter(c => c.channelSeconds !== null);
    const conduitSummary = {
      casts: conduits.length, avgChannelSeconds: r2(avg(withChan.map(c => c.channelSeconds))), channelsOver1_5s: withChan.filter(c => c.channelSeconds > 1.5).length, channelsOver2_5s: withChan.filter(c => c.channelSeconds > 2.5).length,
      ranFull: conduits.filter(c => c.cancelledWith === 'ran the full channel').length, cancelledByUnityRecast: conduits.filter(c => c.cancelledWith === 'Unity Within recast').length,
      cancelledWith: conduits.reduce((m, c) => (m[c.cancelledWith] = (m[c.cancelledWith] || 0) + 1, m), {}),
      castWithWdpHotjsActive: conduits.filter(c => c.wdpHotjsActiveAtCast).length, insideXuenWindow: conduits.filter(c => c.insideXuenWindow).length, outsideXuenWindow: conduits.filter(c => !c.insideXuenWindow).length,
      avgSecondsAfterXuen: r1(avg(conduits.filter(c => c.secondsAfterXuen !== null && c.secondsAfterXuen < 60).map(c => c.secondsAfterXuen))),
      beforeFirstWdpOfWindow: conduits.filter(c => c.secondsAfterXuen !== null && c.secondsAfterXuen < 30 && !c.wdpAlreadyUsedThisWindow).length,
      unbuffedFofBeforeChannelEnd: conduits.filter(c => c.fofBeforeChannelEnd.length).length, fofUsedAsCancel: conduits.filter(c => c.fofAsCancelBuffed !== null).length, fofUsedAsCancelUnbuffed: conduits.filter(c => c.fofAsCancelBuffed === false).length,
      avgFofInsideUnityHotjs: r2(avg(conduits.map(c => c.fofInsideUnityHotjs))),
    };

    // ── Burst windows (one per Xuen) ──
    const potionAvailableAt = (t) => !potionTimes.some(p => p < t && t - p < POTION_CD * 1000);
    const SKIP_FIRST = new Set([S.XUEN, S.POTION, S.TRINKET, S.SHS, S.ROLL, S.LUST, S.FSK, S.KARMA, S.FORT, S.CHI_EXPLOSION]);
    const burstWindows = xuenTimes.map((X, i) => {
      const xb = iv.xuen.find(x => Math.abs(x.start - X) < 1500);
      const end = xb ? xb.end : X + 20000;
      const first = (id, from, to) => { const c = casts.find(c => c.id === id && c.t >= from && c.t <= to); return c ? r1((c.t - X) / 1000) : null; };
      const before = casts.filter(c => c.t < X && c.t >= X - 3000).map(c => c.name);
      const seq = casts.filter(c => c.t >= X - 1500 && c.t <= end + 6000 && c.id !== S.CHI_EXPLOSION).map(c => `${c.name}@${r1((c.t - X) / 1000)}`);
      const hotStarts = hotjsWindowsAll.filter(h => h.pull !== undefined).filter(h => { const hs = t0 + 0; return true; });
      const hots = [...iv.hotZen.map(h => ({ src: 'Z', s: h.start, e: h.end })), ...iv.hotWDP.map(h => ({ src: 'W', s: h.start, e: h.end })), ...iv.hotUnity.map(h => ({ src: 'U', s: h.start, e: h.end }))]
        .filter(h => h.s >= X - 1500 && h.s <= end + 4000).sort((a, b) => a.s - b.s).map(h => `${h.src}@${r1((h.s - X) / 1000)}(${r1((h.e - h.s) / 1000)}s)`);
      const zenithIn = zenithTimes.filter(t => t >= X - 2500 && t <= end).map(t => r1((t - X) / 1000));
      const zenithAt = zenithIn[0] ?? null;
      const afterZenith = zenithAt !== null ? casts.find(c => c.t > X + zenithAt * 1000 && !SKIP_FIRST.has(c.id) && c.id !== S.ZENITH) : null;
      const fofAt = first(S.FOF, X, end + 10000), wdpTimes = castsOf(S.WDP).filter(c => c.t >= X && c.t <= end + 8000).map(c => r1((c.t - X) / 1000));
      const conduitTimesW = conduitTimes.filter(t => t >= X && t <= end + 12000).map(t => r1((t - X) / 1000));
      const firstChiSpender = casts.find(c => c.t >= X && [S.FOF, S.RSK, S.SCK].includes(c.id));
      const potionAt = first(S.POTION, X - 5000, end), trinketAt = first(S.TRINKET, X - 5000, end);
      const wdpBefore = castsOf(S.WDP).filter(c => c.t < X && c.t >= X - 10000).map(c => r1((X - c.t) / 1000));
      const issues = [];
      if (zenithAt === null) issues.push('no Zenith for this Xuen');
      else if (afterZenith && afterZenith.id === S.ZSTOMP) issues.push('Zenith straight into Zenith Stomp (mastery break)');
      else if (afterZenith && afterZenith.id !== S.FOF) issues.push(`first strike after Zenith was ${afterZenith.name}, not Fists of Fury`);
      if (potionAt === null && potionAvailableAt(X)) issues.push('potion was available and not used');
      if (trinketAt === null) issues.push('no trinket');
      if (fofAt === null) issues.push('no Fists of Fury in the window'); else if (fofAt > 2.5) issues.push(`first Fists of Fury ${fofAt}s after Xuen${firstChiSpender && firstChiSpender.chi !== null && firstChiSpender.chi < 3 ? ' (chi starved)' : ''}`);
      if (!wdpTimes.length) issues.push('no WDP in the window'); else if (wdpTimes[0] > 7) issues.push(`first WDP late (${wdpTimes[0]}s)`);
      if (!conduitTimesW.length) issues.push('no Conduit in the window'); else { if (wdpTimes.length && conduitTimesW[0] < wdpTimes[0]) issues.push(`Conduit (${conduitTimesW[0]}s) before the first WDP (${wdpTimes[0]}s)`); if (conduitTimesW[0] > 16) issues.push(`Conduit late (${conduitTimesW[0]}s, Xuen window is ${r1((end - X) / 1000)}s)`); }
      if (hots.length < 4) issues.push(`${hots.length} HotJS windows (target 4)`);
      if (wdpBefore.length) issues.push(`WDP ${wdpBefore.join('/')}s before Xuen (10-second rule)`);
      return { n: i + 1, at: at(X), pull: pullName(X), inLust: inLust(X + 2000), xuenBuffSeconds: xb ? r2((xb.end - xb.start) / 1000) : null, before, sequence: seq, hotjs: hots, hotjsCount: hots.length,
        potionAt, trinketAt, zenithAt, zenithCasts: zenithIn, stomps: castsOf(S.ZSTOMP).filter(c => c.t >= X && c.t <= end).length, firstStrikeAfterZenith: afterZenith ? afterZenith.name : null,
        fofAt, wdpTimes, conduitTimes: conduitTimesW, fofCasts: fofCastsRaw.filter(c => c.t >= X && c.t <= end + 6000).length, sckCasts: castsOf(S.SCK).filter(c => c.t >= X && c.t <= end + 6000).length,
        chiAtFirstSpender: firstChiSpender ? firstChiSpender.chi : null, windowDamageM: r2(dmgIn(X, end) / 1e6), issues, ok: issues.length === 0 };
    });
    const wdpRule = xuenTimes.map(X => { const w = castsOf(S.WDP).filter(c => c.t < X && c.t >= X - 10000); return w.length ? { xuenAt: at(X), pull: pullName(X), wdpSecondsBefore: w.map(c => r1((X - c.t) / 1000)) } : null; }).filter(Boolean);

    // ── Tier 4pc consumer ──
    const sckCastDmg = (c) => castDmg(S.SCK_DMG, c.t, 1600);
    const sckUnbuffed = castsOf(S.SCK).filter(c => !activeAt(iv.tier4, c.t)).map(c => ({ t: c.t, pull: pullAt(c.t), dmg: sckCastDmg(c), targets: new Set(dmg.filter(e => e.abilityGameID === S.SCK_DMG && e.timestamp >= c.t - 20 && e.timestamp <= c.t + 1600).map(e => e.targetID + ':' + (e.targetInstance || 0))).size }));
    const sckBaseNear = (t, p, aoe) => {
      const same = sckUnbuffed.filter(x => x.pull && p && x.pull.id === p.id && Math.abs(x.t - t) < 40000 && (aoe ? x.targets >= 2 : x.targets <= 1));
      if (same.length >= 2) return median(same.map(x => x.dmg));
      const bucket = sckUnbuffed.filter(x => aoe ? x.targets >= 3 : x.targets <= 1);
      return median(bucket.map(x => x.dmg)) || median(sckUnbuffed.map(x => x.dmg)) || 0;
    };
    const tierUse = fofCasts.map(fc => {
      const tiv = iv.tier4.find(t => t.start >= fc.t - 50 && t.start <= fc.t + 400) || activeAt(iv.tier4, fc.t + 400);
      if (!tiv) return { at: fc.at, pull: fc.pull, targets: fc.maxTargets, stacks: 0, consumer: null, verdict: 'no 4pc buff seen', lossM: 0 };
      const consumerCast = casts.find(x => x.t > fc.t && x.t <= tiv.end + 60 && CONSUMERS.has(x.id));
      const consumedAtEnd = consumerCast && Math.abs(consumerCast.t - tiv.end) <= 60;
      const nextFof = fofCastsRaw.find(x => x.t > fc.t);
      const overwritten = nextFof && nextFof.t <= tiv.end && (!consumerCast || consumerCast.t > nextFof.t);
      const stacks = tiv.maxStacks, tg = fc.maxTargets;
      const bucket = tg >= 3 ? 'aoe3' : (tg === 2 ? 'two' : 'st');
      let verdict, lossM = 0;
      if (!consumerCast || !consumedAtEnd) {
        verdict = overwritten ? 'wasted: next FoF before a consumer' : 'wasted: expired unconsumed';
        lossM = (bucket === 'st' ? 0.1 : 0.2) * stacks * sckBaseNear(fc.t, pullAt(fc.t), bucket !== 'st') / 1e6;
      } else if (bucket !== 'st') {
        if (consumerCast.id === S.SCK) verdict = 'ok';
        else {
          verdict = `${consumerCast.name} ate it at ${tg} targets (SCK was the call)`;
          const actual = castDmg(consumerCast.id === S.RSK ? S.RSK_DMG : S.RWK_DMG, consumerCast.t, 400);
          const consumerGain = actual - actual / (1 + 0.1 * stacks);
          lossM = Math.max(0, 0.2 * stacks * sckBaseNear(fc.t, pullAt(fc.t), true) - consumerGain) / 1e6;
        }
      } else {
        const wdpSoon = castsOf(S.WDP).some(w => w.t > consumerCast.t && w.t <= consumerCast.t + 3500);
        if (consumerCast.id === S.RWK) verdict = 'ok (RWK, single target)';
        else if (consumerCast.id === S.SCK) verdict = activeAt(iv.dcj, consumerCast.t) ? 'ok (Dance of Chi-Ji SCK, single target)' : 'ok (baseline SCK, single target)';
        else verdict = (inLust(consumerCast.t) || wdpSoon) ? `ok (RSK in single target, ${wdpSoon ? 'enabled WDP' : 'lust'})` : 'RSK in single target without enabling WDP (RWK or SCK was the call)';
      }
      const castsBetween = consumerCast ? casts.filter(x => x.t > fc.t && x.t < consumerCast.t && x.id !== S.FOF && x.id !== S.CHI_EXPLOSION).map(x => x.name) : [];
      return { at: fc.at, pull: fc.pull, targets: tg, bucket, stacks, consumer: consumerCast ? consumerCast.name : null, gapToConsumer: consumerCast ? r2((consumerCast.t - fc.t) / 1000) : null, castsBetween, verdict, lossM: r2(lossM) };
    });
    const tierRemoves = buffs.filter(b => b.abilityGameID === S.TIER4 && b.type === 'removebuff');
    const removeByConsumer = {};
    for (const b of tierRemoves) { const c = casts.find(x => Math.abs(x.t - b.timestamp) <= 60 && CONSUMERS.has(x.id)); const k = c ? c.name : 'expired/other'; removeByConsumer[k] = (removeByConsumer[k] || 0) + 1; }
    const withBuff = tierUse.filter(t => t.stacks > 0);
    const tier = {
      buffId: S.TIER4, buffName: NAME(S.TIER4), removesByConsumer: removeByConsumer, fofWithBuff: withBuff.length, fofSixStacks: withBuff.filter(t => t.stacks >= 6).length, avgStacks: r2(avg(withBuff.map(t => t.stacks))),
      byBucket: { aoe3: withBuff.filter(t => t.bucket === 'aoe3').length, two: withBuff.filter(t => t.bucket === 'two').length, st: withBuff.filter(t => t.bucket === 'st').length },
      ok: withBuff.filter(t => t.verdict.startsWith('ok')).length,
      wrongConsumerAoe3: withBuff.filter(t => t.bucket === 'aoe3' && t.verdict.includes('ate it')).length, wrongConsumerTwo: withBuff.filter(t => t.bucket === 'two' && t.verdict.includes('ate it')).length,
      sckConsumedAoe3Pct: pct(withBuff.filter(t => t.bucket === 'aoe3' && t.verdict === 'ok').length, withBuff.filter(t => t.bucket === 'aoe3' && !t.verdict.startsWith('wasted')).length),
      rskInStWithoutWdp: withBuff.filter(t => t.verdict.startsWith('RSK in single')).length,
      wastedOverwritten: withBuff.filter(t => t.verdict === 'wasted: next FoF before a consumer').length, wastedExpired: withBuff.filter(t => t.verdict === 'wasted: expired unconsumed').length,
      estimatedDamageLostM: r2(withBuff.reduce((s, t) => s + (t.lossM || 0), 0)), estimatedDamageLostPct: pct(withBuff.reduce((s, t) => s + (t.lossM || 0), 0) * 1e6, total),
      problems: withBuff.filter(t => !t.verdict.startsWith('ok')),
    };

    // ── Mastery ──
    const comboRefresh = buffs.filter(b => b.type === 'refreshbuff' && COMBO_MARK[b.abilityGameID]).map(b => { const c = casts.find(c => Math.abs(c.t - b.timestamp) < 60); return { at: at(b.timestamp), ability: COMBO_MARK[b.abilityGameID], pull: pullName(b.timestamp), energy: c ? c.energy : null, chi: c ? c.chi : null }; });
    const seq = casts.filter(c => MASTERY_ABILITIES.has(c.id) || c.id === S.ZENITH).map(c => ({ ...c, mid: c.id === S.ZENITH ? S.ZSTOMP : c.id }));
    const seqBreaks = [];
    for (let i = 1; i < seq.length; i++) if (seq[i].mid === seq[i - 1].mid && seq[i].t - seq[i - 1].t < 12000) seqBreaks.push({ at: at(seq[i].t), ability: NAME(seq[i].mid), pull: pullName(seq[i].t), secondsAfterPrevious: r2((seq[i].t - seq[i - 1].t) / 1000), previousWasZenithPress: seq[i - 1].id === S.ZENITH });
    const mastery = { breaks: comboRefresh.length, breaksFromCastSequence: seqBreaks.length, byAbility: comboRefresh.reduce((m, x) => (m[x.ability] = (m[x.ability] || 0) + 1, m), {}), hitComboDrops: iv.hitCombo.length, list: comboRefresh, sequenceList: seqBreaks };

    // ── Zenith / Zenith Stomp ──
    const stompDmgAvg = avg(castsOf(S.ZSTOMP).map(c => castDmg(S.ZSTOMP, c.t, 300)).filter(x => x > 0)) || 0;
    const zenithCasts = castsOf(S.ZENITH).map(c => {
      const zb = iv.zenith.find(z => Math.abs(z.start - c.t) < 300);
      const active = activeAt(iv.zenith, c.t - 10);
      const win = zb || active;
      const stomps = win ? castsOf(S.ZSTOMP).filter(x => x.t > c.t && x.t <= win.end) : [];
      const chargeIv = iv.stompCharges.find(s => Math.abs(s.start - c.t) < 300) || activeAt(iv.stompCharges, c.t + 10);
      const lastStomp = stomps[stomps.length - 1];
      const endedWithChargesLeft = !!(chargeIv && win && Math.abs(chargeIv.end - win.end) < 100 && !(lastStomp && Math.abs(lastStomp.t - chargeIv.end) < 100));
      const unused = win ? Math.max(0, 2 - stomps.length) : 0;
      const after = casts.find(x => x.t > c.t && !SKIP_FIRST.has(x.id) && x.id !== S.ZENITH);
      return { at: at(c.t), pull: pullName(c.t), inXuen: inXuen(c.t), xuenWithin3s: xuenTimes.some(x => Math.abs(x - c.t) <= 3000), appliedNewBuff: !!zb, pressedWhileActive: !zb && !!active, buffSeconds: zb ? r2((zb.end - zb.start) / 1000) : null,
        manualStomps: stomps.length, unusedStompCharges: unused, endedWithChargesLeft, firstStrikeAfter: after ? after.name : null, straightIntoStomp: after ? after.id === S.ZSTOMP : false, energyAtCast: c.energy };
    });
    const zenith = {
      casts: zenithCasts.length, newBuffs: zenithCasts.filter(z => z.appliedNewBuff).length, pressedWhileActive: zenithCasts.filter(z => z.pressedWhileActive).length,
      withXuen: zenithCasts.filter(z => z.inXuen || z.xuenWithin3s).length, outsideXuen: zenithCasts.filter(z => !(z.inXuen || z.xuenWithin3s)).length, avgBuffSeconds: avgDur(iv.zenith),
      manualStomps: times(S.ZSTOMP).length, stompsPerZenith: zenithCasts.length ? r2(times(S.ZSTOMP).length / zenithCasts.length) : null,
      unusedStompCharges: zenithCasts.reduce((s, z) => s + z.unusedStompCharges, 0), zenithsEndingWithChargesLeft: zenithCasts.filter(z => z.endedWithChargesLeft).length,
      avgStompDamageK: Math.round(stompDmgAvg / 1000), estimatedDamageLostM: r2(zenithCasts.reduce((s, z) => s + z.unusedStompCharges, 0) * stompDmgAvg / 1e6), estimatedDamageLostPct: pct(zenithCasts.reduce((s, z) => s + z.unusedStompCharges, 0) * stompDmgAvg, total),
      chiForegoneFromUnusedStomps: zenithCasts.reduce((s, z) => s + z.unusedStompCharges, 0) * 2,
      straightIntoStomp: zenithCasts.filter(z => z.straightIntoStomp).length, xuenWindowsWithoutZenith: iv.xuen.filter(x => !zenithTimes.some(t => t >= x.start - 3000 && t <= x.end)).length, list: zenithCasts,
    };

    // ── Resources and procs ──
    const energyMax = Math.max(...casts.filter(c => c.energyMax).map(c => c.energyMax), 0);
    const ok3s = (c) => { const p = pullAt(c.t); return p && c.t - p.startTime > 3000 && !inZenith(c.t) && !inLust(c.t); };
    const tpCapped = castsOf(S.TP).filter(c => c.energy !== null && c.energy >= energyMax && ok3s(c));
    const otherCapped = casts.filter(c => c.id !== S.TP && c.energy !== null && c.energy >= energyMax - 2 && MASTERY_ABILITIES.has(c.id) && ok3s(c));
    const tpInPulls = castsOf(S.TP).filter(ok3s);
    const chiWaste = resources.filter(r => r.resourceChangeType === 12 && r.waste > 0);
    const resourcesSummary = {
      energyMax, tigerPalmCasts: times(S.TP).length, tigerPalmAtCapOutsideZenith: tpCapped.length, tigerPalmAtCapPct: pct(tpCapped.length, tpInPulls.length),
      otherCastsAtCapOutsideZenith: otherCapped.length, otherCastsAtCapByAbility: otherCapped.reduce((m, c) => (m[c.name] = (m[c.name] || 0) + 1, m), {}),
      chiWasted: chiWaste.reduce((s, r) => s + r.waste, 0), chiWastedBy: chiWaste.reduce((m, r) => (m[NAME(r.abilityGameID)] = (m[NAME(r.abilityGameID)] || 0) + r.waste, m), {}),
      comboBreaker: { procs: buffs.filter(b => b.abilityGameID === S.COMBO_BREAKER && ['applybuff', 'applybuffstack', 'refreshbuff'].includes(b.type)).length, wastedAtTwoStacks: buffs.filter(b => b.abilityGameID === S.COMBO_BREAKER && b.type === 'refreshbuff').length, bokWithProc: castsOf(S.BOK).filter(c => activeAt(iv.comboBreaker, c.t)).length, bokCasts: times(S.BOK).length },
      danceOfChiJi: { procs: buffs.filter(b => b.abilityGameID === S.DCJ && ['applybuff', 'applybuffstack', 'refreshbuff'].includes(b.type)).length, wastedAtTwoStacks: buffs.filter(b => b.abilityGameID === S.DCJ && b.type === 'refreshbuff').length, sckWithProc: castsOf(S.SCK).filter(c => activeAt(iv.dcj, c.t)).length, sckCasts: times(S.SCK).length },
    };

    // ── Activity ──
    const pullSecs = pulls.reduce((s, p) => s + (p.endTime - p.startTime), 0) / 1000;
    const gcdCasts = casts.filter(c => !NON_BREAKING.has(c.id) && ![S.ROLL, S.FSK, S.LUST].includes(c.id));
    const idle = [];
    for (let i = 1; i < gcdCasts.length; i++) { const g = (gcdCasts[i].t - gcdCasts[i - 1].t) / 1000; const p = pullAt(gcdCasts[i - 1].t); if (p && g > 3 && pullAt(gcdCasts[i].t) === p) idle.push({ at: at(gcdCasts[i - 1].t), seconds: r1(g), after: gcdCasts[i - 1].name, before: gcdCasts[i].name, pull: p.name, dead: deaths.some(d => d.targetID === P && d.timestamp >= gcdCasts[i - 1].t && d.timestamp <= gcdCasts[i].t) }); }
    const activity = { pullSeconds: r1(pullSecs), castsPerMinuteInPulls: pullSecs ? r1(casts.filter(c => pullAt(c.t) && c.id !== S.CHI_EXPLOSION).length / (pullSecs / 60)) : null, idleGapsOver3s: idle.length, idleSecondsOver3s: r1(idle.reduce((s, g) => s + g.seconds, 0)), idleGapsTop: idle.sort((a, b) => b.seconds - a.seconds).slice(0, 12) };

    // ── Deaths ──
    const myDeaths = deaths.filter(d => d.targetID === P).map(d => {
      const before = taken.filter(e => e.timestamp <= d.timestamp && e.timestamp >= d.timestamp - 6000).map(e => ({ ability: NAME(e.abilityGameID), amount: (e.amount || 0) + (e.absorbed || 0), unmit: e.unmitigatedAmount, secondsBefore: r2((d.timestamp - e.timestamp) / 1000) }));
      const lastKarma = times(S.KARMA).filter(t => t < d.timestamp).pop(), lastFort = times(S.FORT).filter(t => t < d.timestamp).pop(), lastViv = times(S.VIVIFY).filter(t => t < d.timestamp).pop();
      const kSec = lastKarma ? (d.timestamp - lastKarma) / 1000 : null, fSec = lastFort ? (d.timestamp - lastFort) / 1000 : null;
      return { at: at(d.timestamp), pull: pullName(d.timestamp), killingAbility: NAME(d.killingAbilityGameID), damageLast6sK: Math.round(before.reduce((s, x) => s + x.amount, 0) / 1000), hitsLast6s: before.slice(-6),
        karmaSecondsBefore: r1(kSec), karmaAvailable: kSec === null || kSec >= KARMA_CD, fortSecondsBefore: r1(fSec), fortAvailable: fSec === null || fSec >= FORT_CD, vivifySecondsBefore: lastViv ? r1((d.timestamp - lastViv) / 1000) : null };
    });
    const partyDeaths = deaths.filter(d => d.targetID !== P).map(d => ({ who: (meta.actors.find(a => a.id === d.targetID) || {}).name || d.targetID, at: fmt(rel(d.timestamp)), pull: pullName(d.timestamp), ability: NAME(d.killingAbilityGameID) }));
    const takenTotal = taken.reduce((s, e) => s + (e.amount || 0) + (e.absorbed || 0), 0);
    const takenBy = Object.values(taken.reduce((m, e) => { (m[e.abilityGameID] ||= { name: NAME(e.abilityGameID), amount: 0, hits: 0 }); m[e.abilityGameID].amount += (e.amount || 0) + (e.absorbed || 0); m[e.abilityGameID].hits++; return m; }, {})).sort((a, b) => b.amount - a.amount).slice(0, 8);

    // ── Gear, consumables, talents seen ──
    const ci = comb.combatantInfo[0] || {};
    const SLOTS = ['head', 'neck', 'shoulder', 'shirt', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands', 'ring1', 'ring2', 'trinket1', 'trinket2', 'back', 'mainhand', 'offhand', 'tabard'];
    const ENCHANTABLE = new Set(['head', 'shoulder', 'chest', 'legs', 'feet', 'ring1', 'ring2', 'mainhand', 'offhand', 'back', 'wrist']);
    const gear = (ci.gear || []).map((g, i) => ({ slot: SLOTS[i], id: g.id, ilvl: g.itemLevel, quality: g.quality, setID: g.setID || null, enchant: g.permanentEnchant || null, oil: g.temporaryEnchant || null, gems: (g.gems || []).map(x => x.id), icon: g.icon })).filter(g => g.id);
    const tierSetId = gear.filter(g => g.setID).map(g => g.setID).sort((a, b) => gear.filter(x => x.setID === b).length - gear.filter(x => x.setID === a).length)[0] || null;
    const auras = (ci.auras || []).map(a => ({ id: a.ability, name: a.name || NAME(a.ability), stacks: a.stacks }));
    const secondaries = { crit: ci.critMelee, haste: ci.hasteMelee, mastery: ci.mastery, versatility: ci.versatilityDamageDone };
    const secondaryOrder = Object.entries(secondaries).sort((a, b) => b[1] - a[1]);
    const gearSummary = {
      avgIlvl: r1(avg(gear.filter(g => !['shirt', 'tabard'].includes(g.slot)).map(g => g.ilvl))), tierPieces: gear.filter(g => g.setID === tierSetId).length, tierSlots: gear.filter(g => g.setID === tierSetId).map(g => g.slot),
      missingEnchants: gear.filter(g => ENCHANTABLE.has(g.slot) && !g.enchant).map(g => g.slot), gemsTotal: gear.reduce((s, g) => s + g.gems.length, 0),
      weapons: gear.filter(g => ['mainhand', 'offhand'].includes(g.slot)).map(g => `${g.slot} ${g.icon.replace('.jpg', '')} ilvl ${g.ilvl} enchant ${g.enchant} oil ${g.oil}`), dualWield: gear.some(g => g.slot === 'offhand'),
      trinkets: gear.filter(g => /trinket/.test(g.slot)).map(g => `${g.icon.replace('.jpg', '')} ilvl ${g.ilvl}${g.setID ? ' set ' + g.setID : ''}`),
      stats: { agility: ci.agility, stamina: ci.stamina, ...secondaries, leech: ci.leech, avoidance: ci.avoidance }, secondaryOrder: secondaryOrder.map(([k, v]) => `${k} ${v}`), potionStatAtThisRating: secondaryOrder[0][0],
      aurasAtStart: auras.map(a => a.name), hasFood: auras.some(a => /well fed|feast|celebration|food/i.test(a.name)), hasFlask: auras.some(a => /flask/i.test(a.name)), hasAugmentRune: auras.some(a => /rune/i.test(a.name)),
      talentImportCode: comb.talentImportCode, gear,
    };
    const talentsSeen = {
      energyBurst: resources.some(r => NAME(r.abilityGameID) === 'Energy Burst'), zenithStomp: times(S.ZSTOMP).length > 0 || iv.stompCharges.length > 0, hitCombo: buffs.some(b => b.abilityGameID === S.HIT_COMBO),
      jadeIgnition: dmg.some(e => e.abilityGameID === S.CHI_EXPLOSION), gloryOfTheDawn: resources.some(r => NAME(r.abilityGameID) === 'Glory of the Dawn'), dualThreat: dmg.some(e => NAME(e.abilityGameID) === 'Dual Threat'),
      momentumBoost: buffs.some(b => b.abilityGameID === S.MOMENTUM), teachingsOfTheMonastery: buffs.some(b => NAME(b.abilityGameID) === 'Teachings of the Monastery'), strikeOfTheWindlord: times(S.SOTW).length > 0,
      slicingWinds: times(S.SLICING).length > 0, rushingWindKick: times(S.RWK).length > 0, whirlingDragonPunch: times(S.WDP).length > 0, celestialConduit: times(S.CONDUIT).length > 0, tigereyeBrew: buffs.some(b => b.abilityGameID === S.TIGEREYE), energyMax,
      xuenCooldownSeconds: cooldowns.xuen.inferredCD,
    };

    // ── KPIs for comparison ──
    const kpi = {
      dps: Math.round(total / dur), keyLevel: f.keystoneLevel, timed: f.kill, minutes: r1(dur / 60), buffCoveragePct,
      sckAteFourPieceAoePct: tier.sckConsumedAoe3Pct, fourPieceWrongConsumer: tier.wrongConsumerAoe3 + tier.wrongConsumerTwo, fourPieceWasted: tier.wastedExpired + tier.wastedOverwritten, fourPieceLostPct: tier.estimatedDamageLostPct,
      fofFullChannelPct: fof.fullPct, fofClippedByPlayer: fof.clippedByPlayer, fofLostPct: fof.estimatedDamageLostPct, fofInsideHotjsPct: fof.insidePct,
      hotjsPerXuen: r2(avg(burstWindows.map(w => w.hotjsCount))), conduitInsideXuenPct: pct(conduitSummary.insideXuenWindow, conduitSummary.casts), conduitAvgSecondsAfterXuen: conduitSummary.avgSecondsAfterXuen, conduitAvgChannel: conduitSummary.avgChannelSeconds, conduitBeforeFirstWdp: conduitSummary.beforeFirstWdpOfWindow,
      wdpUnityOverlapSeconds: hotjs.wdpUnityOverlapSeconds, tenSecondRuleBreaks: wdpRule.length, firstFofLateOpeners: burstWindows.filter(w => w.fofAt === null || w.fofAt > 2.5).length, openersOk: burstWindows.filter(w => w.ok).length, openers: burstWindows.length,
      stompsPerZenith: zenith.stompsPerZenith, unusedStompCharges: zenith.unusedStompCharges, zenithLostPct: zenith.estimatedDamageLostPct, zenithWithXuen: zenith.withXuen, zenithCasts: zenith.casts,
      masteryBreaks: mastery.breaks, tigerPalmAtCapPct: resourcesSummary.tigerPalmAtCapPct, otherCastsAtCap: resourcesSummary.otherCastsAtCapOutsideZenith,
      comboBreakerWastedPct: pct(resourcesSummary.comboBreaker.wastedAtTwoStacks, resourcesSummary.comboBreaker.procs), dcjWastedPct: pct(resourcesSummary.danceOfChiJi.wastedAtTwoStacks, resourcesSummary.danceOfChiJi.procs),
      potions: `${cooldowns.potion.casts}/${cooldowns.potion.possible}`, xuenCasts: cooldowns.xuen.casts, conduitCasts: cooldowns.conduit.casts, todCasts: cooldowns.touchOfDeath.casts, deaths: myDeaths.length, castsPerMinute: activity.castsPerMinuteInPulls,
      ilvl: gearSummary.avgIlvl, secondaries: gearSummary.secondaryOrder.join(' > '), potionStat: gearSummary.potionStatAtThisRating, food: gearSummary.hasFood, dualWield: gearSummary.dualWield, tier: gearSummary.tierPieces, missingEnchants: gearSummary.missingEnchants.join(','),
      xuenCD: cooldowns.xuen.inferredCD, energyMax,
    };

    // ── Sequence file: the rotation as a timeline ──
    const lines = [];
    lines.push(`${meta.player.name} | [${f.id}] ${f.name} +${f.keystoneLevel} ${f.kill ? 'TIMED' : 'DEPLETED'} ${fmt(dur)} | ${Math.round(total / dur).toLocaleString()} DPS`);
    lines.push('Columns: time | cast | energy/chi before the cast | HotJS sources active (Z=Zenith W=WDP U=Unity) | Zen/Xuen active | 4pc stacks | CB=Combo Breaker DCJ=Dance of Chi-Ji stacks | note | pull');
    lines.push('A full Fists of Fury is 5 tick clusters; "clipped" names the cast that cut it. Conduit lines show channel length and what ended it. Mastery breaks and HotJS overlaps are flagged.');
    const tierStacksAt = (t) => { const x = activeAt(iv.tier4, t); return x ? x.stacks : 0; };
    const stacksAt = (ivs, t) => { const x = activeAt(ivs, t); return x ? x.stacks : 0; };
    const fofByT = new Map(fofCasts.map(x => [x.t, x]));
    const conduitByT = new Map(castsOf(S.CONDUIT).map((c, i) => [c.t, conduits[i]]));
    const tierByT = new Map(fofCasts.map((x, i) => [x.t, tierUse[i]]));
    const masteryAt = new Set(comboRefresh.map(m => m.at));
    let lastPull = null;
    for (const p of pulls) p._mark = false;
    for (const c of casts) {
      if (c.id === S.CHI_EXPLOSION) continue;
      const p = pullAt(c.t);
      const pn = p ? `${p.isBoss ? 'BOSS ' : ''}${p.name}` : 'between pulls';
      if (pn !== lastPull) { lines.push(`\n──── ${pn} ${p ? '(' + fmt(rel(p.startTime)) + ' to ' + fmt(rel(p.endTime)) + ')' : ''} ────`); lastPull = pn; }
      const notes = [];
      if (c.id === S.FOF) { const x = fofByT.get(c.t); if (x) { notes.push(`${x.clusters}/5 ticks ${x.channelSeconds}s on ${x.maxTargets} tgt`); if (x.clippedBy) notes.push(x.clippedBy.startsWith('targets') ? 'ended early: targets gone' : `CLIPPED by ${x.clippedBy} at +${x.clipGapSeconds}s`); const tu = tierByT.get(c.t); if (tu && tu.stacks) notes.push(`4pc ${tu.stacks} stacks -> ${tu.consumer || 'nobody'}${tu.verdict.startsWith('ok') ? '' : ' !! ' + tu.verdict}`); } }
      if (c.id === S.CONDUIT) { const x = conduitByT.get(c.t); if (x) notes.push(`channel ${x.channelSeconds}s, ended by ${x.cancelledWith}; ${x.secondsAfterXuen !== null && x.secondsAfterXuen < 60 ? x.secondsAfterXuen + 's after Xuen' : 'no Xuen nearby'}${x.wdpHotjsActiveAtCast ? '; WDP-HotJS still had ' + x.wdpHotjsRemainingSeconds + 's (OVERLAP)' : ''}${!x.wdpAlreadyUsedThisWindow && x.secondsAfterXuen !== null && x.secondsAfterXuen < 30 ? '; BEFORE this window\'s first WDP' : ''}`); }
      if (c.id === S.WDP) { const u = activeAt(iv.hotUnity, c.t); if (u) notes.push(`OVERLAP: Unity-HotJS still had ${r2((u.end - c.t) / 1000)}s`); const nx = xuenTimes.find(x => x > c.t && x - c.t <= 10000); if (nx) notes.push(`Xuen pressed ${r1((nx - c.t) / 1000)}s later (10-second rule)`); }
      if (c.id === S.ZENITH) { const z = zenith.list.find(z => z.at === at(c.t)); if (z) notes.push(`${z.pressedWhileActive ? 'PRESSED WHILE ACTIVE' : 'Zenith ' + z.buffSeconds + 's'}, ${z.manualStomps} manual stomps, ${z.unusedStompCharges} charges unused${z.straightIntoStomp ? ', STRAIGHT INTO STOMP' : ''}`); }
      if (c.id === S.XUEN) { const w = burstWindows.find(w => w.at === at(c.t)); if (w) notes.push(`BURST #${w.n}: ${w.issues.length ? w.issues.join('; ') : 'clean'}`); }
      if (c.id === S.RSK || c.id === S.SCK || c.id === S.RWK) { const tb = activeAt(iv.tier4, c.t); if (tb && Math.abs(tb.end - c.t) <= 60) notes.push(`eats 4pc x${tb.stacks}`); }
      if (c.id === S.TP && c.energy !== null && c.energy >= energyMax && ok3s(c)) notes.push('energy capped');
      if (masteryAt.has(at(c.t)) && MASTERY_ABILITIES.has(c.id)) notes.push('MASTERY BREAK');
      const res = c.energy !== null ? `en ${String(c.energy).padStart(3)}` : (c.chi !== null ? `chi ${c.chi}` : '      ');
      lines.push(`${at(c.t).padStart(7)}  ${c.name.padEnd(28)} ${res.padEnd(7)} hot:${hotSources(c.t).join('').padEnd(3)} ${inZenith(c.t) ? 'Zen' : '   '} ${inXuen(c.t) ? 'Xuen' : '    '} 4pc:${tierStacksAt(c.t)} CB:${stacksAt(iv.comboBreaker, c.t)} DCJ:${stacksAt(iv.dcj, c.t)}${notes.length ? '  | ' + notes.join('; ') : ''}`);
    }
    writeFileSync(join(D, `${tag}-sequence.txt`), lines.join('\n'));

    audit.fights.push({
      id: f.id, name: f.name, key: f.keystoneLevel, affixes: f.keystoneAffixes, timed: f.kill, seconds: r1(dur), dps: Math.round(total / dur), totalDamageM: r2(total / 1e6), buffCoveragePct, damageTop, bossDps,
      burstShare: { xuenSeconds: r1(xuenSecs), xuenPctOfKey: pct(xuenSecs, dur), damageInXuenPct: pct(xuenDmg, total) },
      kpi, cooldowns, burstWindows, wdpTenSecondRule: wdpRule, conduits, conduitSummary, hotjs, fof, tier, tierUse, mastery, zenith, resources: resourcesSummary, activity,
      deaths: { mine: myDeaths, party: partyDeaths, damageTakenTotalM: r2(takenTotal / 1e6), damageTakenTop: takenBy }, gear: gearSummary, talentsSeen,
      pulls: pulls.map(p => ({ name: p.name, boss: p.isBoss, start: fmt(rel(p.startTime)), seconds: r1((p.endTime - p.startTime) / 1000) })),
      sequenceFile: join(D, `${tag}-sequence.txt`),
    });
  }
  writeFileSync(join(D, 'audit.json'), JSON.stringify(audit, null, 1));
  return { audit, dir: D };
}

function printFight(f) {
  console.log(`\n${'═'.repeat(100)}\n  [${f.id}] ${f.name} +${f.key}  ${f.timed ? 'TIMED' : 'DEPLETED'}  ${fmt(f.seconds)}  ${f.dps.toLocaleString()} DPS  (${f.totalDamageM}M)  buff data covers ${f.buffCoveragePct}% of the key\n${'═'.repeat(100)}`);
  console.log('Bosses: ' + f.bossDps.map(b => `${b.boss} ${b.dps.toLocaleString()} (${fmt(b.seconds)})`).join(' | '));
  console.log(`Xuen uptime ${f.burstShare.xuenSeconds}s = ${f.burstShare.xuenPctOfKey}% of key, ${f.burstShare.damageInXuenPct}% of damage | top: ` + f.damageTop.slice(0, 7).map(d => `${d.name} ${d.share}%`).join(', '));
  const c = f.cooldowns;
  console.log(`COOLDOWNS Xuen ${c.xuen.casts} (CD ${c.xuen.inferredCD}s, buff ${c.xuen.buffAvgSeconds}s) | Conduit ${c.conduit.casts} | Zenith ${c.zenith.casts} | ToD ${c.touchOfDeath.casts} | Potion ${c.potion.casts}/${c.potion.possible} | Karma ${c.touchOfKarma.casts} Fort ${c.fortifyingBrew.casts} Vivify ${c.vivify.casts} | SHS ${c.spearHandStrike.casts}/${c.spearHandStrike.interruptsLanded} Leg Sweep ${c.legSweep.casts} RoP ${c.ringOfPeace.casts} Para ${c.paralysis.casts}`);
  const t = f.tier;
  console.log(`\n4PC (${t.buffName}): ${t.fofWithBuff} FoF with buff (avg ${t.avgStacks} stacks, six stacks ${t.fofSixStacks}) | 3+ targets ${t.byBucket.aoe3}, 2 targets ${t.byBucket.two}, single ${t.byBucket.st}`);
  console.log(`    SCK ate it at 3+ targets: ${t.sckConsumedAoe3Pct}% | wrong consumer at 3+ ${t.wrongConsumerAoe3}, at 2 ${t.wrongConsumerTwo} | RSK in ST without WDP ${t.rskInStWithoutWdp} | wasted expired ${t.wastedExpired}, overwritten ${t.wastedOverwritten} | removes by ${JSON.stringify(t.removesByConsumer)} | est. lost ${t.estimatedDamageLostM}M = ${t.estimatedDamageLostPct}%`);
  const fo = f.fof;
  console.log(`\nFoF ${fo.casts}: full channel ${fo.fullChannels} (${fo.fullPct}%) | clipped by the player ${fo.clippedByPlayer} (inside HotJS ${fo.clippedByPlayerInside}, outside ${fo.clippedByPlayerOutside}) by ${JSON.stringify(fo.clippedByAbility)} | ended by targets dying ${fo.clippedTargetsGone} | inside HotJS ${fo.insideHotjs} (${fo.insidePct}%) | full channel ${fo.fullChannelSecondsInside}s in / ${fo.fullChannelSecondsOutside}s out | last tick is ${fo.lastTickSharePct}% of a FoF | est. lost ${fo.estimatedDamageLostM}M = ${fo.estimatedDamageLostPct}%`);
  const h = f.hotjs;
  console.log(`\nHOTJS windows WDP ${h.windows.WDP} / Zenith ${h.windows.Zenith} / Unity ${h.windows.Unity} | FoF per window WDP ${h.avgFofPerWindow.WDP} Zenith ${h.avgFofPerWindow.Zenith} Unity ${h.avgFofPerWindow.Unity} | WDP windows with 0 FoF ${h.wdpWindowsWithZeroFof}, Unity with 0 FoF ${h.unityWindowsWithZeroFof} | WDP/Unity overlaps ${h.wdpUnityOverlaps} (${h.wdpUnityOverlapSeconds}s wasted)`);
  const cs = f.conduitSummary;
  console.log(`\nCONDUIT ${cs.casts}: avg channel ${cs.avgChannelSeconds}s (>1.5s ${cs.channelsOver1_5s}, >2.5s ${cs.channelsOver2_5s}, ran full ${cs.ranFull}) ended by ${JSON.stringify(cs.cancelledWith)} | inside Xuen window ${cs.insideXuenWindow}/${cs.casts}, avg ${cs.avgSecondsAfterXuen}s after Xuen | before the window's first WDP ${cs.beforeFirstWdpOfWindow} | WDP-HotJS still active at cast ${cs.castWithWdpHotjsActive} | unbuffed FoF inside channel ${cs.unbuffedFofBeforeChannelEnd} | FoF as the cancel ${cs.fofUsedAsCancel} (unbuffed ${cs.fofUsedAsCancelUnbuffed}) | FoF inside Unity-HotJS avg ${cs.avgFofInsideUnityHotjs}`);
  for (const x of f.conduits) console.log(`   #${x.n} ${x.at} ${x.pull}: ${x.secondsAfterXuen !== null && x.secondsAfterXuen < 60 ? x.secondsAfterXuen + 's after Xuen' : 'no Xuen nearby'}${x.insideXuenWindow ? '' : ' (OUTSIDE window)'}, channel ${x.channelSeconds}s ended by ${x.cancelledWith}, WDP-HotJS ${x.wdpHotjsActiveAtCast ? 'STILL ACTIVE ' + x.wdpHotjsRemainingSeconds + 's' : 'ended ' + x.secondsSinceWdpHotjsEnded + 's before'}, WDP used before it ${x.wdpAlreadyUsedThisWindow}, FoF in Unity-HotJS ${x.fofInsideUnityHotjs}, next WDP +${x.nextWdpSecondsAfter}s`);
  console.log(`\n10-SECOND RULE breaks: ${f.wdpTenSecondRule.length}` + (f.wdpTenSecondRule.length ? ' -> ' + f.wdpTenSecondRule.map(x => `${x.xuenAt} (${x.wdpSecondsBefore.join('/')}s before, ${x.pull})`).join('; ') : ''));
  const z = f.zenith;
  console.log(`\nZENITH ${z.casts} casts (new buff ${z.newBuffs}, pressed while active ${z.pressedWhileActive}) | with Xuen ${z.withXuen}, outside ${z.outsideXuen} | Xuen windows without Zenith ${z.xuenWindowsWithoutZenith} | manual stomps ${z.manualStomps} (${z.stompsPerZenith} per Zenith, 2 available) | unused stomp charges ${z.unusedStompCharges} = ${z.estimatedDamageLostM}M (${z.estimatedDamageLostPct}%) and ${z.chiForegoneFromUnusedStomps} chi | straight into Stomp ${z.straightIntoStomp}`);
  console.log(`\nMASTERY breaks ${f.mastery.breaks} ${JSON.stringify(f.mastery.byAbility)}: ` + f.mastery.list.map(m => `${m.at} ${m.ability} (${m.pull})`).join('; '));
  const r = f.resources;
  console.log(`\nRESOURCES Tiger Palm at ${r.energyMax} energy outside Zenith: ${r.tigerPalmAtCapOutsideZenith} (${r.tigerPalmAtCapPct}% of TPs) | other casts at cap ${r.otherCastsAtCapOutsideZenith} ${JSON.stringify(r.otherCastsAtCapByAbility)} | chi wasted ${r.chiWasted} ${JSON.stringify(r.chiWastedBy)} | Combo Breaker ${r.comboBreaker.procs} procs, ${r.comboBreaker.wastedAtTwoStacks} wasted at 2 stacks | Dance of Chi-Ji ${r.danceOfChiJi.procs} procs, ${r.danceOfChiJi.wastedAtTwoStacks} wasted`);
  console.log(`ACTIVITY ${f.activity.castsPerMinuteInPulls} casts/min in pulls (${fmt(f.activity.pullSeconds)}); idle >3s: ${f.activity.idleGapsOver3s} gaps, ${f.activity.idleSecondsOver3s}s: ` + f.activity.idleGapsTop.slice(0, 6).map(g => `${g.at} ${g.seconds}s ${g.after}->${g.before} (${g.pull})${g.dead ? ' DEAD' : ''}`).join('; '));
  console.log(`\nDEATHS ${f.deaths.mine.length}: ` + f.deaths.mine.map(d => `${d.at} ${d.pull} by ${d.killingAbility}, ${d.damageLast6sK}K in 6s, Karma ${d.karmaAvailable ? 'AVAILABLE' : d.karmaSecondsBefore + 's before'}, Fort ${d.fortAvailable ? 'AVAILABLE' : d.fortSecondsBefore + 's before'}`).join(' | ') + ` | party ${f.deaths.party.length}`);
  const g = f.gear;
  console.log(`GEAR ilvl ${g.avgIlvl}, tier ${g.tierPieces}, missing enchants [${g.missingEnchants.join(', ')}], gems ${g.gemsTotal}, dual wield ${g.dualWield} | ${g.weapons.join(' | ')} | trinkets ${g.trinkets.join(' | ')}`);
  console.log(`     stats ${g.secondaryOrder.join(' > ')} => potion stat ${g.potionStatAtThisRating} | food ${g.hasFood} flask ${g.hasFlask} | auras: ${g.aurasAtStart.join(', ')}`);
  console.log(`\nBURSTS (one per Xuen):`);
  for (const w of f.burstWindows) {
    console.log(`   #${w.n} ${w.at} ${w.pull}${w.inLust ? ' [LUST]' : ''} ${w.windowDamageM}M | before: ${w.before.join(', ')}`);
    console.log(`       ${w.sequence.slice(0, 16).join(' > ')}`);
    console.log(`       HotJS ${w.hotjs.join(' ')} | FoF ${w.fofCasts} SCK ${w.sckCasts} stomps ${w.stomps} | ${w.ok ? 'CLEAN' : 'ISSUES: ' + w.issues.join('; ')}`);
  }
}

function compare(specs) {
  const rows = [];
  for (const spec of specs) {
    const [code, name] = spec.split(':');
    const p = join(__dirname, '..', 'data', code, 'ww', lcName(name), 'audit.json');
    if (!existsSync(p)) { console.error('missing audit for ' + spec + ' (run the audit first)'); continue; }
    const a = JSON.parse(readFileSync(p, 'utf8'));
    for (const f of a.fights) rows.push({ who: `${a.player.name} ${f.name} +${f.key}`, ...f.kpi });
  }
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => k !== 'who');
  const w = Math.max(...rows.map(r => r.who.length));
  console.log('metric'.padEnd(28) + rows.map(r => r.who.slice(0, 34).padEnd(36)).join(''));
  for (const k of keys) console.log(k.padEnd(28) + rows.map(r => String(r[k] ?? '').slice(0, 34).padEnd(36)).join(''));
}

if (argv[0] === '--compare') {
  compare(argv.slice(1));
} else {
  const [code, nameArg] = argv.filter(a => !a.startsWith('--'));
  if (!code || !nameArg) { console.error('Usage: node scripts/ww-conduit-audit.mjs <reportCode> <playerName> [--quiet] | --compare <report>:<player> ...'); process.exit(1); }
  const { audit, dir } = auditPlayer(code, nameArg);
  if (!QUIET) for (const f of audit.fights) printFight(f);
  console.log(`\nSaved ${join(dir, 'audit.json')} and ${audit.fights.map(f => 'fight' + f.id + '-sequence.txt').join(', ')}`);
}
