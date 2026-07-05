/**
 * Shared WCL v2 API helpers for all wcl-analyzer scripts.
 * Import from here — do NOT re-implement token fetch / gql / paging in new scripts.
 *
 *   import { gql, gqlPaged, fmt, lcName } from './wcl-lib.mjs';
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SECRETS = join(homedir(), '.openclaw', 'workspace', '.secrets');
const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

let cachedToken = null;
let tokenExpiry = 0;

export async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const id = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-id.txt'), 'utf8').trim();
  const secret = readFileSync(join(SECRETS, 'warcraftlogs-v2-client-secret.txt'), 'utf8').trim();
  const creds = Buffer.from(id + ':' + secret).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('WCL auth failed (' + res.status + '): ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error('WCL HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const json = await res.json();
  if (json.errors) throw new Error('WCL GraphQL: ' + JSON.stringify(json.errors).slice(0, 300));
  return json.data;
}

/**
 * Pull ALL events for a report query, following nextPageTimestamp.
 * buildQuery(startTime|null) must return a query whose events node
 * is at reportData.report.events.
 */
export async function gqlPaged(buildQuery) {
  let events = [];
  let res = await gql(buildQuery(null));
  events = events.concat(res.reportData.report.events.data);
  let np = res.reportData.report.events.nextPageTimestamp;
  while (np) {
    res = await gql(buildQuery(np));
    events = events.concat(res.reportData.report.events.data);
    np = res.reportData.report.events.nextPageTimestamp;
  }
  return events;
}

/** Seconds → "m:ss" */
export function fmt(secs) {
  return Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
}

/**
 * Normalize player names for filenames/URLs: strip accents, lowercase.
 * Voidhéart → voidheart, Sìlencio → silencio, Sonìc → sonic.
 * ALWAYS use this for output filenames — accented filenames break /raid/ URLs.
 */
export function lcName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
