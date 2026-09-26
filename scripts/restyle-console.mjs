#!/usr/bin/env node
/**
 * restyle-console.mjs -- dress every healing-cds page in the FRIDAY console register.
 *
 * OWNER ORDER, 2026-09-25: "Every page we have on Friday.joshholyfield.com should match that
 * style", the style being the JHPD platform dashboard. These pages are served at
 * friday.joshholyfield.com/raid and /raid/<slug> by friday-server/src/routes/raid.js.
 *
 * WHAT THIS TOUCHES, AND NOTHING ELSE
 *   - every <style> block: a token block is injected at the top of the first one, then every
 *     colour literal in every declaration is rewritten to a token, every font stack to the
 *     system stacks, radii to the register's steps, shadows to none, Google Fonts @import
 *     lines removed, non-ASCII in CSS comments made ASCII
 *   - the Google Fonts <link> elements in <head>
 *   - inline style="" attributes: colours and font families only
 *   - SVG presentation attributes fill/stroke/stop-color/font-family: moved into style=""
 *     because a browser does not resolve var() inside a presentation attribute
 *   - two <meta name="theme-color"> lines, added once
 *
 * WHAT IT NEVER TOUCHES: text nodes, hrefs, ids, titles, data-* attributes, <script> blocks,
 * SVG geometry, table structure. The raid team reads numbers off these pages; a number that
 * moved would cost them a pull. The proof is a visible-text / href / id / script diff of every
 * page before and after (see the smoke test in the FRIDAY repo and the verify mode below).
 *
 * THE FAMILY. The dashboard has one accent (bronze) and two statuses (ok, warn), on a near-black
 * ground with an ink ladder. WoW class colours are the exception the order allows: they carry
 * player identity (a paladin's name is pink on every raid tool the team uses) and are kept ONLY
 * as --class-* tokens on the elements that name a player, dot or class pill. Everything else
 * goes into the family: red and orange to warn, yellow to bronze, green to ok, blue and purple
 * to bronze, cyan to an ok/bronze mix so an intermission marker still reads apart from a P2
 * marker, and translucent tints to color-mix() of the same token at the same alpha.
 *
 * USAGE
 *   node scripts/restyle-console.mjs                 rewrite healing-cds/*.html in place
 *   node scripts/restyle-console.mjs --dry-run       decide everything, write nothing, print the map
 *   node scripts/restyle-console.mjs --verify <dir>  compare healing-cds/*.html against pristine
 *                                                    copies in <dir>: text, hrefs, ids, scripts,
 *                                                    svg geometry, data-* and title attributes
 *   node scripts/restyle-console.mjs <file.html>...  restyle only the named files
 *
 * Idempotent: a page that already carries the token block is left alone.
 * ASCII only. No em dashes.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = resolve(HERE, '..', 'healing-cds');
const MARKER = '/* raid-console-tokens v1 */';

// -- Tokens: jhpd-platform/src/index.css @theme and :root[data-theme="light"], verbatim ------------

const TOKENS_DARK = {
  '--color-bg': '#0a0a0a',
  '--color-surface': '#111',
  '--color-card': '#141414',
  '--color-border': '#1f1f1f',
  '--color-border-strong': '#2a2a2a',
  '--color-text-primary': '#f5f5f5',
  '--color-text-body': '#d4d4d4',
  '--color-text-secondary': '#a3a3a3',
  '--color-text-muted': '#737373',
  '--color-accent': '#c2a06a',
  '--color-accent-hover': '#6f5b3a',
  '--color-accent-ink': '#0a0a0a',
  '--color-ok': '#8fae95',
  '--color-ok-line': '#2b3a2f',
  '--color-warn': '#c08a5a',
  '--color-warn-line': '#3a2a1c',
};

const TOKENS_LIGHT = {
  '--color-bg': '#f5f5f5',
  '--color-surface': '#ffffff',
  '--color-card': '#ffffff',
  '--color-border': '#e5e5e5',
  '--color-border-strong': '#d4d4d4',
  '--color-text-primary': '#0a0a0a',
  '--color-text-body': '#262626',
  '--color-text-secondary': '#525252',
  '--color-text-muted': '#737373',
  '--color-accent': '#c2a06a',
  '--color-accent-hover': '#6f5b3a',
  '--color-accent-ink': '#0a0a0a',
};

const FONTS = {
  '--font-sans': '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif',
  '--font-mono': 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
};

/**
 * WoW class colours, the one identity system the register admits. Dark values are Blizzard's.
 * Light values were darkened along the same hue until they read at 4.5:1 on the light ground
 * (#f5f5f5); DK and DH already did. Priest is white in WoW and is therefore plain ink here.
 */
const CLASS_DARK = {
  '--class-dk': '#c41e3a',
  '--class-dh': '#a330c9',
  '--class-druid': '#ff7c0a',
  '--class-evoker': '#33937f',
  '--class-hunter': '#aad372',
  '--class-mage': '#3fc7eb',
  '--class-monk': '#00ff98',
  '--class-paladin': '#f48cba',
  '--class-rogue': '#fff468',
  '--class-shaman': '#0070dd',
  '--class-warlock': '#8788ee',
  '--class-warrior': '#c69b6d',
};
const CLASS_LIGHT = {
  '--class-dk': '#c41e3a',
  '--class-dh': '#a330c9',
  '--class-druid': '#b25300',
  '--class-evoker': '#2b7c6b',
  '--class-hunter': '#577b26',
  '--class-mage': '#107a96',
  '--class-monk': '#007f4c',
  '--class-paladin': '#d7156b',
  '--class-rogue': '#776f00',
  '--class-shaman': '#006dd8',
  '--class-warlock': '#5a5ce8',
  '--class-warrior': '#906538',
};

/** Every hex a page spelled for a class, including the near-misses authors typed. */
const CLASS_HEX = {
  '#c41e3a': '--class-dk', '#c41f3b': '--class-dk',
  '#a330c9': '--class-dh',
  '#ff7c0a': '--class-druid', '#ff7d0a': '--class-druid',
  '#33937f': '--class-evoker',
  '#aad372': '--class-hunter',
  '#3fc7eb': '--class-mage',
  '#00ff98': '--class-monk', '#00ff96': '--class-monk',
  '#f48cba': '--class-paladin',
  '#fff468': '--class-rogue',
  '#0070dd': '--class-shaman', '#0070de': '--class-shaman',
  '#8788ee': '--class-warlock',
  '#c69b6d': '--class-warrior', '#c79c6e': '--class-warrior',
};

/** The derived steps, declared once so a page can name them. */
const DERIVED = {
  '--raid-ok-accent': 'color-mix(in srgb, var(--color-ok) 50%, var(--color-accent))',
};

/**
 * Page-local custom properties, mapped by NAME. Every GitHub-dark family page declares the
 * first twelve; the class ones appear on the audit pages. The thousands of inline
 * style="color:var(--red)" uses need no edit at all once the declaration reads a token.
 */
const NAMED_PROPS = {
  '--bg': 'var(--color-bg)',
  '--surface': 'var(--color-card)',
  '--surface2': 'var(--color-surface)',
  '--border': 'var(--color-border-strong)',
  '--border-soft': 'var(--color-border)',
  '--text': 'var(--color-text-primary)',
  '--dim': 'var(--color-text-secondary)',
  '--accent': 'var(--color-accent)',
  '--green': 'var(--color-ok)',
  '--red': 'var(--color-warn)',
  '--yellow': 'var(--color-accent)',
  '--orange': 'var(--color-warn)',
  '--purple': 'var(--color-accent)',
  '--cyan': 'var(--raid-ok-accent)',
  '--priest': 'var(--color-text-primary)',
  '--dk': 'var(--class-dk)', '--dk-color': 'var(--class-dk)',
  '--dh': 'var(--class-dh)', '--dh-color': 'var(--class-dh)',
  '--mage': 'var(--class-mage)', '--mage-color': 'var(--class-mage)',
  '--shaman': 'var(--class-shaman)',
  '--hunter': 'var(--class-hunter)',
  '--druid': 'var(--class-druid)',
  '--warlock': 'var(--class-warlock)',
  '--warrior': 'var(--class-warrior)',
  '--paladin': 'var(--class-paladin)',
  '--monk': 'var(--class-monk)',
  '--evoker': 'var(--class-evoker)',
};

// -- Colour maths -------------------------------------------------------------------------------

function expandHex(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { rgb, alpha };
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

const hex6 = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * The GitHub-dark greys 149 pages were built on carry a faint blue cast that HSL saturation reads
 * as colour (#e6edf3 computes to s=0.35 and is white to any eye). Named, so they stay grey.
 */
const KNOWN_GREY = new Set([
  '#0d1117', '#0a0d12', '#161b22', '#1c2128', '#1c2129', '#1c2333', '#21262d', '#2d333b', '#30363d',
  '#484f58', '#6c757d', '#6e7681', '#8b949e', '#c9d1d9', '#e6edf3', '#f0f6fc',
]);

/** Priest is white in WoW; the one author who typed a yellow for it gets ink, like --priest does. */
const INK_OVERRIDE = new Set(['#fff569']);

function isGrey(hex, rgb, s, l) {
  if (KNOWN_GREY.has(hex)) return true;
  if (s < 0.12) return true;
  const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
  return l > 0.75 && chroma < 0.08;
}

/** The hue families a page used for meaning, each with its token in the register. */
function hueToken(h, s, l, category) {
  if (h < 15 || h >= 335) return 'warn';          // red
  if (h < 38) return 'warn';                       // orange
  if (h < 70) return 'accent';                     // yellow, gold, amber
  if (h < 170) return 'ok';                        // green
  if (h < 200) return 'okaccent';                  // cyan, teal
  if (h < 260) return 'accent';                    // blue
  if (h < 330) return category === 'bg' ? 'accent-hover' : 'accent'; // purple, violet
  return 'accent';                                 // pink
}

const TOKEN_VAR = {
  warn: 'var(--color-warn)',
  ok: 'var(--color-ok)',
  accent: 'var(--color-accent)',
  'accent-hover': 'var(--color-accent-hover)',
  okaccent: 'var(--raid-ok-accent)',
  ink: 'var(--color-text-primary)',
  ink2: 'var(--color-text-body)',
  ink3: 'var(--color-text-secondary)',
  muted: 'var(--color-text-muted)',
  bg: 'var(--color-bg)',
  raise: 'var(--color-surface)',
  card: 'var(--color-card)',
  line: 'var(--color-border)',
  line2: 'var(--color-border-strong)',
  'accent-ink': 'var(--color-accent-ink)',
  'warn-line': 'var(--color-warn-line)',
  'ok-line': 'var(--color-ok-line)',
};

/** Neutral backgrounds the pages used, named by the role they played on their own page. */
const GREY_BG = {
  '#000000': 'bg', '#0a0a0a': 'bg', '#0b0b0b': 'bg', '#0d1117': 'bg', '#0e0e0e': 'bg',
  '#0d0d0d': 'raise', '#0a0d12': 'raise', '#0f0f0f': 'raise', '#101010': 'raise',
  '#111111': 'card', '#121212': 'card', '#131313': 'card', '#141414': 'card', '#161b22': 'card',
  '#151515': 'line', '#161616': 'line', '#181818': 'line', '#1a1a1a': 'line', '#1c1c1c': 'line',
  '#1e1e1e': 'line', '#1f1f1f': 'line', '#222222': 'line',
  '#1c2128': 'line2', '#1c2129': 'line2', '#1c2333': 'line2', '#21262d': 'line2', '#252525': 'line2',
  '#2a2a2a': 'line2', '#2d333b': 'line2', '#30363d': 'line2', '#333333': 'line2',
};

function greyToken(l, category, hex) {
  if (category === 'bg') {
    if (GREY_BG[hex]) return GREY_BG[hex];
    if (l < 0.045) return 'bg';
    if (l < 0.06) return 'raise';
    if (l < 0.10) return 'card';
    if (l < 0.16) return 'line';
    if (l < 0.30) return 'line2';
  }
  if (category === 'border') {
    if (l < 0.13) return 'line';
    if (l < 0.30) return 'line2';
  }
  // text, and any bright value used as a fill
  if (l >= 0.85) return 'ink';
  if (l >= 0.62) return 'ink2';
  if (l >= 0.40) return 'ink3';
  if (l >= 0.12) return 'muted';
  return category === 'text' ? 'accent-ink' : 'bg';
}

/**
 * One solid colour to one token expression. category is 'text' | 'bg' | 'border'.
 * Dark tinted surfaces (a card washed 8% red because it holds a bad finding) become the same
 * wash of the same token on the register's card; solid mid-tones become the token itself.
 */
function solidToken(hex, category) {
  if (CLASS_HEX[hex]) return `var(${CLASS_HEX[hex]})`;
  if (INK_OVERRIDE.has(hex)) return TOKEN_VAR.ink;
  const { rgb } = expandHex(hex);
  const { h, s, l } = rgbToHsl(rgb);
  if (isGrey(hex, rgb, s, l)) return TOKEN_VAR[greyToken(l, category, hex)];
  const tok = hueToken(h, s, l, category);
  if (l < 0.26) {
    if (category === 'border') return tok === 'ok' ? TOKEN_VAR['ok-line'] : tok === 'warn' ? TOKEN_VAR['warn-line'] : `color-mix(in srgb, ${TOKEN_VAR[tok]} 35%, var(--color-border))`;
    if (category === 'bg') return `color-mix(in srgb, ${TOKEN_VAR[tok]} 10%, var(--color-card))`;
  }
  return TOKEN_VAR[tok];
}

/** A translucent colour to the same token at the same alpha. */
function tintToken(rgb, alpha) {
  const hex = hex6(rgb);
  const pct = Math.round(alpha * 100);
  let base;
  if (CLASS_HEX[hex]) base = `var(${CLASS_HEX[hex]})`;
  else if (INK_OVERRIDE.has(hex)) base = TOKEN_VAR.ink;
  else {
    const { h, s, l } = rgbToHsl(rgb);
    if (isGrey(hex, rgb, s, l)) base = TOKEN_VAR[l >= 0.5 ? 'ink' : l >= 0.2 ? 'ink3' : l >= 0.1 ? 'line2' : 'bg'];
    else base = TOKEN_VAR[hueToken(h, s, l, 'tint')];
  }
  return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
}

// -- Declaration rewriting ----------------------------------------------------------------------

const COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|\b(?:white|black)\b/g;

function categoryOf(prop) {
  const p = prop.toLowerCase();
  if (p.startsWith('background')) return 'bg';
  if (p.startsWith('border') || p.startsWith('outline') || p === 'column-rule') return 'border';
  return 'text';
}

const MONO_RE = /^\s*['"]?(?:courier|consolas|sf mono|monaco|menlo|jetbrains|fira|cascadia|ui-monospace|monospace)/i;

function mapFontFamily(value) {
  const first = value.trim().split(',')[0];
  return MONO_RE.test(first) ? 'var(--font-mono)' : 'var(--font-sans)';
}

const RADIUS_STEP = { '3px': '4px', '5px': '6px', '10px': '8px', '14px': '12px', '16px': '12px' };

function mapRadius(value) {
  return value.replace(/\b(\d+px)\b/g, (m) => RADIUS_STEP[m] || m);
}

const decisions = new Map(); // "value|category" -> token expression, for the dry-run report

function replaceColours(value, category) {
  return value.replace(COLOR_RE, (m) => {
    const key = `${m.toLowerCase()}|${category}`;
    let out;
    if (m === 'white') out = TOKEN_VAR[category === 'bg' ? 'raise' : 'ink'];
    else if (m === 'black') out = TOKEN_VAR[category === 'text' ? 'accent-ink' : 'bg'];
    else if (m.startsWith('#')) {
      const { rgb, alpha } = expandHex(m);
      out = alpha < 0.85 ? tintToken(rgb, alpha) : solidToken(hex6(rgb), category);
    } else {
      const nums = m.match(/[\d.]+/g).map(Number);
      const rgb = nums.slice(0, 3).map((v) => Math.round(v));
      const alpha = nums.length > 3 ? nums[3] : 1;
      out = alpha < 0.85 ? tintToken(rgb, alpha) : solidToken(hex6(rgb), category);
    }
    decisions.set(key, out);
    return out;
  });
}

/** Rewrite one declaration's value. Returns the value unchanged when nothing applies. */
function rewriteValue(prop, value) {
  const p = prop.toLowerCase();
  if (p.startsWith('--')) {
    if (NAMED_PROPS[p]) return NAMED_PROPS[p];
    return replaceColours(value, 'text');
  }
  if (p === 'font-family') return mapFontFamily(value);
  if (p === 'font') {
    // shorthand: keep size and weight, swap the family tail
    const idx = value.search(/(['"][^'"]+['"]|-apple-system|inter|consolas|monospace|sans-serif)/i);
    if (idx > 0) return value.slice(0, idx) + mapFontFamily(value.slice(idx));
    return value;
  }
  if (p === 'box-shadow' || p === 'text-shadow') return 'none';
  if (p === 'border-radius' || /^border-.*-radius$/.test(p)) return mapRadius(value);
  if (!COLOR_RE.test(value)) { COLOR_RE.lastIndex = 0; return value; }
  COLOR_RE.lastIndex = 0;
  return replaceColours(value, categoryOf(p));
}

/** Declarations inside a CSS block or a style attribute: prop, colon, value, then ; or }. */
const DECL_RE = /(^|[;{\s])(--[\w-]+|[a-zA-Z-]+)(\s*:\s*)([^;{}]*?)(\s*)(?=[;}]|$)/g;

function rewriteDeclarations(css) {
  return css.replace(DECL_RE, (m, pre, prop, colon, value, post) => {
    if (!value.trim()) return m;
    const next = rewriteValue(prop, value);
    return next === value ? m : pre + prop + colon + next + post;
  });
}

// -- Style block rewriting ----------------------------------------------------------------------

const FONT_IMPORT_RE = /^[ \t]*@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com[^)]*\)\s*;[ \t]*\r?\n?/gm;

/** Rules that carry an uppercase tracked label take the console's mono instrument register. */
function monoLabels(css) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => {
    if (!/text-transform\s*:\s*uppercase/i.test(body) || !/letter-spacing\s*:/i.test(body)) return m;
    if (/font-family\s*:/i.test(body) || /\bth\b/.test(sel) || /\bh[1-6]\b/.test(sel)) return m;
    const sizes = [...body.matchAll(/font-size\s*:\s*([\d.]+)px/g)].map((x) => Number(x[1]));
    if (sizes.some((s) => s > 13)) return m;
    const trimmed = body.replace(/\s+$/, '');
    const tail = body.slice(trimmed.length);
    const sep = trimmed.endsWith(';') ? ' ' : '; ';
    return `${sel}{${trimmed}${sep}font-family: var(--font-mono);${tail}}`;
  });
}

function restyleCss(css) {
  let out = css.replace(FONT_IMPORT_RE, '');
  out = out.replace(/─/g, '-').replace(/[^\x00-\x7f]/g, '-');
  out = rewriteDeclarations(out);
  out = monoLabels(out);
  return out;
}

function decl(table) {
  return Object.entries(table).map(([k, v]) => `${k}:${v}`).join(';');
}

function tokenBlock() {
  return [
    MARKER,
    `:root{color-scheme:dark;${decl(TOKENS_DARK)};${decl(FONTS)};${decl(CLASS_DARK)};${decl(DERIVED)}}`,
    `@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){color-scheme:light;${decl(TOKENS_LIGHT)};${decl(CLASS_LIGHT)}}}`,
    `:root[data-theme="light"]{color-scheme:light;${decl(TOKENS_LIGHT)};${decl(CLASS_LIGHT)}}`,
    'html{-webkit-text-size-adjust:100%;background:var(--color-bg)}',
    'a{color:var(--color-accent)}',
    '::selection{background:var(--color-accent);color:var(--color-accent-ink)}',
    ':focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}',
    '/* end raid-console-tokens */',
  ].join('\n');
}

/** Appended after the page's own rules so it wins: the SPA's 16px phone gutter. */
const TAIL_RULES = '\n/* raid-console-tail */\n@media (max-width:767px){body{padding-left:16px;padding-right:16px}}\n';

const THEME_META = '<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">\n'
  + '<meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)">\n';

// -- Inline styles and SVG attributes ------------------------------------------------------------

function restyleInline(html) {
  return html.replace(/(\sstyle=")([^"]*)(")/g, (m, pre, css, post) => {
    const next = rewriteDeclarations(css);
    return next === css ? m : pre + next + post;
  });
}

const SVG_ATTR_RE = /\s(fill|stroke|stop-color|font-family)="([^"]*)"/g;

/**
 * Inside <svg>...</svg>, move fill / stroke / stop-color / font-family presentation attributes
 * into the element's style attribute as tokens. url(#gradient), none and currentColor stay.
 */
function restyleSvg(html) {
  return html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => svg.replace(/<(\w+)((?:\s+[\w:-]+="[^"]*")*)(\s*\/?)>/g, (tag, name, attrs, tail) => {
    const moved = [];
    let rest = attrs.replace(SVG_ATTR_RE, (m, attr, val) => {
      if (attr === 'font-family') { moved.push(`font-family:${mapFontFamily(val)}`); return ''; }
      if (!/^#|^rgba?\(/.test(val.trim())) return m;
      moved.push(`${attr}:${replaceColours(val, attr === 'fill' || attr === 'stop-color' ? 'text' : 'border')}`);
      return '';
    });
    if (!moved.length) return tag;
    const styleMatch = rest.match(/\sstyle="([^"]*)"/);
    if (styleMatch) {
      const existing = styleMatch[1].trim();
      const joined = (existing ? existing.replace(/;?$/, ';') : '') + moved.join(';');
      rest = rest.replace(styleMatch[0], ` style="${joined}"`);
    } else {
      rest += ` style="${moved.join(';')}"`;
    }
    return `<${name}${rest}${tail}>`;
  }));
}

// -- The page ------------------------------------------------------------------------------------

const FONT_LINK_RE = /[ \t]*<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>[ \t]*\r?\n?/g;

function restylePage(html) {
  if (html.includes(MARKER)) return html;
  let out = html.replace(FONT_LINK_RE, '');
  let first = true;
  out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, closeTag) => {
    let body = restyleCss(css);
    if (first) { body = '\n' + tokenBlock() + '\n' + body; first = false; }
    return open + body + closeTag;
  });
  if (first) throw new Error('page has no <style> block to carry the token block');
  // the tail rule goes at the end of the LAST head style block so it outranks the page's body rule
  const headEnd = out.search(/<\/head>/i);
  const lastStyleClose = out.lastIndexOf('</style>', headEnd < 0 ? undefined : headEnd);
  if (lastStyleClose > 0) out = out.slice(0, lastStyleClose) + TAIL_RULES + out.slice(lastStyleClose);
  out = out.replace(/(<meta name="viewport"[^>]*>\s*\r?\n?)/i, (m) => m + THEME_META);
  out = restyleSvg(out);
  out = restyleInline(out);
  return out;
}

// -- Verify: what must not have changed ----------------------------------------------------------

function fingerprint(html) {
  const noStyle = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]).join('\n');
  const noScript = noStyle.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const text = noScript.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // The Google Fonts <link> hrefs are the one thing the restyle removes on purpose (DL-03: no
  // webfont), so they are counted apart from every href a reader can follow.
  const allHrefs = [...noScript.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
  const isFontHost = (h) => /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(h);
  const hrefs = allHrefs.filter((h) => !isFontHost(h)).join('\n');
  const fontLinks = allHrefs.filter(isFontHost).length;
  const ids = [...noScript.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]).join('\n');
  const dataAttrs = [...noScript.matchAll(/\s(data-[\w-]+|title|alt|aria-label)="([^"]*)"/g)].map((m) => m[1] + '=' + m[2]).join('\n');
  const svg = [...noScript.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => m[0]
    .replace(/\s(fill|stroke|stop-color|font-family|style)="[^"]*"/g, '')
    .replace(/\s+/g, ' ')).join('\n');
  const cells = (noScript.match(/<t[dh]\b/gi) || []).length;
  return { text, hrefs, ids, dataAttrs, scripts, svg, cells, fontLinks };
}

const INVARIANTS = ['text', 'hrefs', 'ids', 'dataAttrs', 'scripts', 'svg', 'cells'];

function verify(beforeDir, files) {
  let bad = 0, fontLinksRemoved = 0, fontLinksLeft = 0;
  for (const f of files) {
    const before = fingerprint(readFileSync(join(beforeDir, basename(f)), 'utf8'));
    const after = fingerprint(readFileSync(f, 'utf8'));
    const diffs = INVARIANTS.filter((k) => before[k] !== after[k]);
    if (diffs.length) { bad++; console.log(`DIFF ${basename(f)}: ${diffs.join(', ')}`); }
    fontLinksRemoved += before.fontLinks - after.fontLinks;
    fontLinksLeft += after.fontLinks;
  }
  console.log(`verify: ${files.length} pages, ${files.length - bad} identical on ${INVARIANTS.join('/')}, ${bad} differ; `
    + `font-service links removed: ${fontLinksRemoved}, left: ${fontLinksLeft}`);
  return bad === 0 && fontLinksLeft === 0;
}

// -- CLI ----------------------------------------------------------------------------------------

function main(argv) {
  const dry = argv.includes('--dry-run');
  const vIdx = argv.indexOf('--verify');
  const named = argv.filter((a) => a.endsWith('.html'));
  const files = named.length ? named.map((a) => resolve(a))
    : readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort().map((f) => join(PAGES_DIR, f));

  if (vIdx >= 0) {
    const dir = resolve(argv[vIdx + 1]);
    if (!existsSync(dir)) throw new Error(`verify: ${dir} does not exist`);
    process.exit(verify(dir, files) ? 0 : 1);
  }

  let changed = 0, skipped = 0;
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const out = restylePage(html);
    if (out === html) { skipped++; continue; }
    changed++;
    if (!dry) writeFileSync(f, out);
  }
  if (dry) {
    console.log('--- colour decisions (value|category -> token) ---');
    for (const [k, v] of [...decisions].sort()) console.log(k.padEnd(36), v);
  }
  console.log(`${dry ? 'dry-run: would restyle' : 'restyled'} ${changed} pages, ${skipped} already carried the tokens`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { restylePage, fingerprint, TOKENS_DARK, TOKENS_LIGHT, CLASS_DARK, CLASS_LIGHT, MARKER };
