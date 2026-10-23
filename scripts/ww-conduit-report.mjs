/**
 * Windwalker Conduit M+ audit page: the written findings, the KPIs side by side with reference players,
 * and every key button by button (each press with the state at that moment and the call next to it).
 *
 * Usage:
 *   node scripts/ww-conduit-report.mjs <report> <player> --refs <report>:<player>,<report>:<player> \
 *        --notes healing-cds/notes/<slug>.md --out healing-cds/<slug>.html [--title "Senssay Conduit Audit"]
 *
 * Reads data/<report>/ww/<player>/audit.json and fight<N>-presses.json (written by ww-conduit-audit.mjs) for the
 * player and each reference. The notes file is markdown (##, ###, paragraphs, - lists, 1. lists, **bold**, `code`)
 * with an optional ```discord fenced block that becomes the copy-for-Discord box.
 * The output is an Artifact-style HTML fragment (title + style + body content, no doctype/html/body wrapper), which
 * is what the Artifact tool publishes; it also opens fine from disk inside any wrapper.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lcName } from './wcl-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
const [code, player] = positional;
const refSpecs = (opt('--refs', '') || '').split(',').filter(Boolean);
const notesPath = opt('--notes', null);
const outPath = opt('--out', null);
const title = opt('--title', `${player} Conduit Audit`);
if (!code || !player || !outPath) {
  console.error('Usage: node scripts/ww-conduit-report.mjs <report> <player> --refs r:p,r:p --notes <md> --out <html> [--title "..."]');
  process.exit(1);
}

const load = (c, p) => {
  const D = join(__dirname, '..', 'data', c, 'ww', lcName(p));
  if (!existsSync(join(D, 'audit.json'))) throw new Error('missing audit for ' + c + ':' + p);
  const audit = JSON.parse(readFileSync(join(D, 'audit.json'), 'utf8'));
  for (const f of audit.fights) { const pp = join(D, `fight${f.id}-presses.json`); f.presses = existsSync(pp) ? JSON.parse(readFileSync(pp, 'utf8')) : []; }
  return audit;
};
const me = load(code, player);
const refs = refSpecs.map(s => { const [c, p] = s.split(':'); return load(c, p); });

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');

function mdToHtml(md) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) { flushPara(); flushList(); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = line.match(/^##\s+(.*)/))) { flushPara(); flushList(); out.push(`<h2 id="${esc(m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^###\s+(.*)/))) { flushPara(); flushList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^-\s+(.*)/))) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^(\d+)\.\s+(.*)/))) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol class="fixes">'); list = 'ol'; } out.push(`<li>${inline(m[2])}</li>`); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}

let notesMd = notesPath && existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
let discord = '';
notesMd = notesMd.replace(/```discord\n([\s\S]*?)```/, (_, b) => { discord = b.trim(); return ''; });
// split notes at "## The window to run" so the KPI table can sit between the fixes and the template
const windowIdx = notesMd.indexOf('## The window to run');
const notesTop = windowIdx >= 0 ? notesMd.slice(0, windowIdx) : notesMd;
const notesWindow = windowIdx >= 0 ? notesMd.slice(windowIdx) : '';

// ── KPI table ──
const KPIS = [
  ['dps', 'DPS', v => Number(v).toLocaleString()], ['keyLevel', 'Key level', v => '+' + v], ['minutes', 'Minutes', v => v],
  ['sckAteFourPieceAoePct', 'SCK ate the 4pc at 3+ targets', v => v + '%'], ['fourPieceWrongConsumer', '4pc eaten by RSK or RWK (2+ targets)', v => v],
  ['fourPieceLostPct', '4pc damage lost', v => v + '%'], ['fofFullChannelPct', 'Fists channels run to the last hit', v => v + '%'],
  ['fofClippedByPlayer', 'Fists cut by your next press', v => v], ['fofLostPct', 'Fists damage lost', v => v + '%'],
  ['hotjsPerXuen', 'HotJS windows per Xuen (target 4)', v => v], ['conduitInsideXuenPct', 'Conduit inside the Xuen window', v => v + '%'],
  ['conduitAvgSecondsAfterXuen', 'Conduit, seconds after Xuen', v => v + 's'], ['conduitBeforeFirstWdp', "Conduit before the window's first WDP", v => v],
  ['wdpUnityOverlapSeconds', 'WDP and Unity windows overlapping', v => v + 's'], ['tenSecondRuleBreaks', 'WDP inside 10s before Xuen', v => v],
  ['stompsPerZenith', 'Manual Zenith Stomps per Zenith (2 available)', v => v], ['unusedStompCharges', 'Stomp charges left unused', v => v],
  ['masteryBreaks', 'Mastery breaks', v => v], ['tigerPalmAtCapPct', 'Tiger Palm at full energy', v => v + '%'],
  ['potions', 'Potions used / possible', v => v], ['deaths', 'Deaths', v => v], ['castsPerMinute', 'Presses per minute in pulls', v => v],
  ['ilvl', 'Item level', v => v], ['secondaries', 'Secondaries', v => v], ['potionStat', 'Stat the potion boosted', v => v],
  ['food', 'Food', v => v ? 'yes' : 'none'], ['dualWield', 'Weapons', v => v ? 'two one-handers' : 'two-hander'],
];
const columns = [...me.fights.map(f => ({ who: me.player.name, f })), ...refs.flatMap(r => r.fights.map(f => ({ who: r.player.name, f, ref: true })))];
const kpiTable = `<div class="scroll"><table class="kpi"><thead><tr><th>Metric</th>${columns.map(c => `<th class="${c.ref ? 'ref' : ''}">${esc(c.who)}<br><span class="sub">${esc(c.f.name)} +${c.f.key}</span></th>`).join('')}</tr></thead><tbody>${KPIS.map(([k, label, fmtv]) => `<tr><th>${esc(label)}</th>${columns.map(c => `<td class="${c.ref ? 'ref' : ''}">${esc(fmtv(c.f.kpi[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// ── button-by-button ──
const stateCell = (p) => `${p.hot ? `<span class="tag hot">HotJS ${esc(p.hot)}</span>` : ''}${p.zen ? '<span class="tag zen">Zenith</span>' : ''}${p.xuen ? '<span class="tag xuen">Xuen</span>' : ''}${p.tier ? `<span class="tag t4">4pc ${p.tier}</span>` : ''}${p.cb ? `<span class="tag">BoK! ${p.cb}</span>` : ''}${p.dcj ? `<span class="tag">DCJ ${p.dcj}</span>` : ''}`;
const resCell = (p) => p.energy !== null && p.energy !== undefined ? `${p.energy} en` : (p.chi !== null && p.chi !== undefined ? `${p.chi} chi` : '');
const noteCell = (p) => { if (!p.note) return '<span class="ok">fine</span>'; return p.bad ? `<span class="bad">${esc(p.note)}</span>` : `<span class="info">${esc(p.note)}</span>`; };
const pressRows = (rows) => rows.map(p => `<tr class="${p.bad ? 'is-bad' : ''}${p.burst ? ' in-burst' : ''}"><td class="t">${esc(p.t)}</td><td class="btn">${esc(p.name)}</td><td class="res">${esc(resCell(p))}</td><td class="state">${stateCell(p)}</td><td class="note">${noteCell(p)}</td></tr>`).join('');
const pressTable = (rows) => `<div class="scroll"><table class="presses"><thead><tr><th>Time</th><th>Button</th><th>Before</th><th>State</th><th>The call</th></tr></thead><tbody>${pressRows(rows)}</tbody></table></div>`;

function fightSection(audit, f, { full }) {
  const bossLine = f.bossDps.map(b => `${esc(b.boss)} ${Number(b.dps).toLocaleString()}`).join(' · ');
  const summary = `<p class="lede">${f.dps.toLocaleString()} DPS over ${f.seconds >= 60 ? Math.floor(f.seconds / 60) + ':' + String(Math.floor(f.seconds % 60)).padStart(2, '0') : f.seconds + 's'}, ${f.timed ? 'timed' : 'depleted'}. Bosses: ${bossLine}. Top damage: ${f.damageTop.slice(0, 4).map(d => `${esc(d.name)} ${d.share}%`).join(', ')}.</p>`;
  const stats = `<ul class="facts"><li>4pc eaten by SCK at 3+ targets <b>${f.tier.sckConsumedAoe3Pct}%</b>, by RSK or RWK at 2+ targets <b>${f.tier.wrongConsumerAoe3 + f.tier.wrongConsumerTwo}</b> times, expired <b>${f.tier.wastedExpired}</b></li><li>Fists run to the last hit <b>${f.fof.fullPct}%</b>, cut by your press <b>${f.fof.clippedByPlayer}</b> (${Object.entries(f.fof.clippedByAbility).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => esc(k) + ' ' + v).join(', ')})</li><li>Zenith <b>${f.zenith.casts}</b> presses, manual stomps <b>${f.zenith.manualStomps}</b>, charges unused <b>${f.zenith.unusedStompCharges}</b>, Xuen windows without a Zenith <b>${f.zenith.xuenWindowsWithoutZenith}</b></li><li>Conduit inside the Xuen window <b>${f.conduitSummary.insideXuenWindow}/${f.conduitSummary.casts}</b>, before the window's first WDP <b>${f.conduitSummary.beforeFirstWdpOfWindow}</b>, WDP window still running at the press <b>${f.conduitSummary.castWithWdpHotjsActive}</b></li><li>Mastery breaks <b>${f.mastery.breaks}</b>, Tiger Palm at full energy <b>${f.resources.tigerPalmAtCapPct}%</b>, deaths <b>${f.deaths.mine.length}</b></li></ul>`;
  const bursts = f.burstWindows.map(w => {
    const rows = f.presses.filter(p => p.burst === w.n);
    return `<details class="burst" ${full ? 'open' : ''}><summary><span class="bn">Burst ${w.n}</span> <span class="bt">${esc(w.at)}</span> <span class="bp">${esc(w.pull)}</span> <span class="bd">${w.windowDamageM}M</span> <span class="${w.ok ? 'ok' : 'bad'}">${w.ok ? 'clean' : esc(w.issues.join('; '))}</span></summary><p class="hot">HotJS windows: ${w.hotjs.length ? esc(w.hotjs.join('  ')) : 'none'} · Fists ${w.fofCasts} · SCK ${w.sckCasts} · stomps ${w.stomps}</p>${pressTable(rows)}</details>`;
  }).join('');
  const deaths = f.deaths.mine.length ? `<h4>Deaths</h4><ul class="facts">${f.deaths.mine.map(d => `<li>${esc(d.at)} ${esc(d.pull)}: ${esc(d.killingAbility)}, ${d.damageLast6sK}K taken in the last 6s, Karma ${d.karmaAvailable ? '<b>was available</b>' : 'used ' + d.karmaSecondsBefore + 's before'}, Fortifying Brew ${d.fortAvailable ? '<b>was available</b>' : 'used ' + d.fortSecondsBefore + 's before'}</li>`).join('')}</ul>` : '';
  let rest = '';
  if (full) {
    const pulls = [...new Set(f.presses.map(p => p.pull))];
    rest = `<h4>Every press, pull by pull</h4><p class="muted">Burst-window presses are tinted. Rows marked in red carry a call; "fine" means no rule applied against that press.</p>` + pulls.map(pn => { const rows = f.presses.filter(p => p.pull === pn); const bad = rows.filter(r => r.bad).length; return `<details class="pull"><summary>${esc(pn)} <span class="muted">${rows.length} presses, ${bad} flagged</span></summary>${pressTable(rows)}</details>`; }).join('');
  }
  return `<section class="fight" id="f${f.id}-${esc(lcName(audit.player.name))}"><h3>${esc(f.name)} +${f.key}</h3>${summary}${stats}<h4>Burst windows, button by button</h4>${bursts}${deaths}${rest}</section>`;
}

const myFights = me.fights.map(f => fightSection(me, f, { full: true })).join('');
const refSections = refs.map(r => r.fights.map(f => `<section class="fight ref"><h3>${esc(r.player.name)}: ${esc(f.name)} +${f.key}, ${f.dps.toLocaleString()} DPS</h3><p class="muted">The first three Xuen windows, button by button, as the reference played them.</p>${f.burstWindows.slice(0, 3).map(w => `<details class="burst" open><summary><span class="bn">Burst ${w.n}</span> <span class="bt">${esc(w.at)}</span> <span class="bp">${esc(w.pull)}</span> <span class="bd">${w.windowDamageM}M</span> <span class="${w.ok ? 'ok' : 'bad'}">${w.ok ? 'clean' : esc(w.issues.join('; '))}</span></summary><p class="hot">HotJS windows: ${esc(w.hotjs.join('  '))}</p>${pressTable(f.presses.filter(p => p.burst === w.n))}</details>`).join('')}</section>`).join('')).join('');

const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
const html = `<title>${esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column for the findings, wide tables below it; dark-first, the jade of Heart of the Jade Serpent as the single accent. */
:root { color-scheme: dark; --bg: #0e1311; --surface: #151c19; --surface-2: #1b2420; --line: #26312c; --fg: #e4ebe6; --muted: #93a39a; --accent: #5fd4a6; --accent-ink: #0b1d16; --bad: #e2726a; --bad-bg: rgba(226,114,106,0.12); --warn: #e0b85c; --burst-bg: rgba(95,212,166,0.07); --display: 'Barlow Condensed', 'Arial Narrow', sans-serif; --body: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif; --mono: 'IBM Plex Mono', Consolas, monospace; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { color-scheme: light; --bg: #f4f7f5; --surface: #ffffff; --surface-2: #eef3f0; --line: #d6ded9; --fg: #17211c; --muted: #5b6a62; --accent: #117a55; --accent-ink: #ffffff; --bad: #b8342e; --bad-bg: rgba(184,52,46,0.09); --warn: #8a5f00; --burst-bg: rgba(17,122,85,0.07); } }
:root[data-theme="light"] { color-scheme: light; --bg: #f4f7f5; --surface: #ffffff; --surface-2: #eef3f0; --line: #d6ded9; --fg: #17211c; --muted: #5b6a62; --accent: #117a55; --accent-ink: #ffffff; --bad: #b8342e; --bad-bg: rgba(184,52,46,0.09); --warn: #8a5f00; --burst-bg: rgba(17,122,85,0.07); }
body { background: var(--bg); color: var(--fg); font-family: var(--body); font-size: 15px; line-height: 1.55; padding-block: 28px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.wrap { max-width: 1180px; margin: 0 auto; }
h1, h2, h3, h4 { font-family: var(--display); text-wrap: balance; line-height: 1.1; }
h1 { font-size: 44px; font-weight: 700; letter-spacing: 0.3px; margin: 0 0 6px; }
h2 { font-size: 28px; font-weight: 700; margin: 44px 0 12px; padding-top: 18px; border-top: 1px solid var(--line); }
h3 { font-size: 23px; font-weight: 600; margin: 34px 0 8px; }
h4 { font-size: 18px; font-weight: 600; margin: 24px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
.subtitle { color: var(--muted); font-size: 15px; margin: 0 0 20px; }
.prose { max-width: 72ch; }
.prose p, .prose li { margin: 0 0 10px; }
.prose ol.fixes { padding-left: 1.3em; } .prose ol.fixes li { margin-bottom: 14px; }
.prose ul { padding-left: 1.2em; }
code { font-family: var(--mono); font-size: 0.92em; background: var(--surface-2); padding: 1px 5px; border-radius: 3px; }
.lede { max-width: 90ch; margin: 0 0 8px; }
.muted { color: var(--muted); }
.facts { list-style: none; padding: 0; margin: 6px 0 10px; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; color: var(--muted); }
.facts li { min-width: 0; } .facts b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; max-width: 100%; margin: 8px 0 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
thead th { background: var(--surface-2); font-family: var(--display); font-size: 15px; font-weight: 600; letter-spacing: 0.3px; position: sticky; top: 0; }
table.kpi tbody th { font-weight: 600; white-space: nowrap; }
table.kpi td { white-space: nowrap; } table.kpi .ref { color: var(--muted); } table.kpi thead th .sub { font-family: var(--body); font-size: 11px; font-weight: 400; color: var(--muted); }
table.presses td.t { font-family: var(--mono); font-size: 12.5px; white-space: nowrap; color: var(--muted); }
table.presses td.btn { font-weight: 600; white-space: nowrap; }
table.presses td.res { font-family: var(--mono); font-size: 12.5px; white-space: nowrap; }
table.presses td.state { white-space: nowrap; } table.presses td.note { min-width: 22ch; max-width: 60ch; }
tr.in-burst td { background: var(--burst-bg); }
tr.is-bad td { background: var(--bad-bg); }
.tag { display: inline-block; font-family: var(--mono); font-size: 11px; padding: 1px 6px; border-radius: 3px; background: var(--surface-2); color: var(--muted); margin-right: 4px; }
.tag.hot { background: var(--accent); color: var(--accent-ink); } .tag.zen, .tag.xuen { border: 1px solid var(--accent); color: var(--accent); background: transparent; } .tag.t4 { border: 1px solid var(--warn); color: var(--warn); background: transparent; }
.ok { color: var(--accent); } .bad { color: var(--bad); } .info { color: var(--muted); }
details.burst, details.pull { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 6px; background: var(--surface); margin: 10px 0; padding: 0 12px 4px; }
details.pull { border-left-color: var(--line); }
details > summary { cursor: pointer; padding: 10px 0; font-weight: 600; list-style: none; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: '▸'; color: var(--muted); } details[open] > summary::before { content: '▾'; }
.bn { font-family: var(--display); font-size: 17px; } .bt { font-family: var(--mono); color: var(--muted); font-size: 13px; } .bp { color: var(--muted); } .bd { font-variant-numeric: tabular-nums; color: var(--muted); }
details.burst .hot { font-family: var(--mono); font-size: 12.5px; color: var(--muted); margin: 0 0 6px; }
section.fight { margin-top: 10px; } section.fight.ref { border-top: 1px dashed var(--line); padding-top: 6px; }
.discord { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; }
.discord pre { font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; margin: 0; }
.discord button { position: absolute; top: 10px; right: 10px; font: 600 13px var(--body); background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
.discord button:focus-visible, details > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
@media (max-width: 640px) { h1 { font-size: 34px; } body { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
<div class="wrap">
<h1>${esc(title)}</h1>
<p class="subtitle">${esc(me.player.name)}-${esc(me.player.server)}, Conduit of the Celestials Windwalker. ${me.fights.length} keys from report ${esc(me.report.code)} on ${esc(new Date(me.report.startTime).toISOString().slice(0, 10))}, graded button by button against the Season 2 Conduit rules and against ${refs.map(r => `${esc(r.player.name)} (${esc(r.fights[0].name)} +${r.fights[0].key}, ${r.fights[0].dps.toLocaleString()} DPS)`).join(', ')}.</p>
<nav class="muted">Jump to: <a href="#what-to-fix-in-order">fixes</a> · <a href="#side-by-side">side by side</a> · <a href="#the-window-to-run">the window to run</a> · ${me.fights.map(f => `<a href="#f${f.id}-${esc(lcName(me.player.name))}">${esc(f.name)}</a>`).join(' · ')} · <a href="#references">references</a> · <a href="#discord">Discord</a></nav>
<div class="prose">${mdToHtml(notesTop)}</div>
<h2 id="side-by-side">Side by side</h2>
<p class="muted">Your keys first, then the references. Every value comes from the same audit script run on each player's own log.</p>
${kpiTable}
<div class="prose">${mdToHtml(notesWindow)}</div>
<h2 id="keys">Your keys, button by button</h2>
<p class="muted">Each burst window opens expanded: every press from the Tiger Palm before Xuen to the second Whirling Dragon Punch, with the resource you had before the press, the windows active at that moment (HotJS source Z = Zenith, W = WDP, U = Unity Within; 4pc = Unbroken Rhythm stacks; BoK! = Combo Breaker; DCJ = Dance of Chi-Ji), and the call. Below the bursts, every pull of the key is there collapsed, every press included.</p>
${myFights}
<h2 id="references">The references, button by button</h2>
${refSections}
<h2 id="discord">Copy for Discord</h2>
<div class="discord"><button type="button" id="copy-discord">Copy</button><pre id="discord-text">${esc(discord)}</pre></div>
<p class="footer">Generated ${esc(generated)} by wcl-analyzer/scripts/ww-conduit-report.mjs from Warcraft Logs report ${esc(me.report.code)} (${esc(me.player.name)}) and ${refs.map(r => `${esc(r.report.code)} (${esc(r.player.name)})`).join(', ')}. Rules: wcl-analyzer/guides/ww-conduit-s2-rules.md. Spell ids and the measured facts behind every call are in scripts/ww-conduit-audit.mjs.</p>
</div>
<script>
(function () {
  var b = document.getElementById('copy-discord'), t = document.getElementById('discord-text');
  if (!b || !t) return;
  b.addEventListener('click', function () {
    var text = t.textContent;
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); };
    var fallback = function () { var r = document.createRange(); r.selectNodeContents(t); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Select and copy'; };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  });
})();
</script>
`;
writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB): ${me.fights.length} keys, ${me.fights.reduce((s, f) => s + f.presses.length, 0)} presses, ${refs.length} references.`);
