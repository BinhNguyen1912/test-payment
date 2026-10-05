// Records, for every WRITE API call made through api.js, which DB rows appeared/changed (via the read-only lineage server).
import { reactive } from 'vue';

export const lineage = reactive({ enabled: localStorage.getItem('lineage.enabled') !== 'false', entries: [], serverOk: null, info: null });

const SETTLE_MS = 700; // let async work (IPN fulfillment, queue) finish before reading
const post = (path, body) =>
  fetch(`/lineage${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  });

const subOf = (token) => { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null; } catch { return null; } };

export function setEnabled(v) { lineage.enabled = v; localStorage.setItem('lineage.enabled', String(v)); }
export async function refreshInfo() {
  try { lineage.info = await fetch('/lineage/info').then((r) => r.json()); lineage.serverOk = true; } catch { lineage.serverOk = false; }
}
export async function resetFlow() { lineage.entries.splice(0); await post('/reset').catch(() => {}); await refreshInfo(); }

async function load(entry) {
  entry.state = 'loading';
  try {
    const d = await post('/end', { ticket: entry.ticket, method: entry.method, path: entry.path, userId: entry.userId, responseBody: entry.resBody });
    entry.data = d; entry.state = 'ready'; entry.error = null;
  } catch (e) { entry.state = 'error'; entry.error = String(e.message || e); }
}
export const reload = (entry) => load(entry);

// Real payment URL returned by a write API -> go to VNPay immediately (new tab; banner link if the browser blocks popups).
export const redirect = reactive({ enabled: localStorage.getItem('redirect.vnpay') !== 'false', blockedUrl: '' });
export function setRedirect(v) { redirect.enabled = v; localStorage.setItem('redirect.vnpay', String(v)); }
function findPaymentUrl(o, d = 0) {
  if (!o || typeof o !== 'object' || d > 4) return '';
  if (typeof o.paymentUrl === 'string' && /^https?:\/\//.test(o.paymentUrl)) return o.paymentUrl;
  for (const v of Object.values(o)) { const r = findPaymentUrl(v, d + 1); if (r) return r; }
  return '';
}
function redirectToVnpay(info) {
  if (!redirect.enabled || info.method === 'GET' || info.method === 'IPN' || info.status >= 300) return;
  const url = findPaymentUrl(info.resBody);
  if (!url) return;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  redirect.blockedUrl = w ? '' : url;
}

// Installed on globalThis so api.js has no import dependency on Vue.
globalThis.__lineage = {
  async begin(method) {
    if (!lineage.enabled || method === 'GET') return null;
    try { const r = await post('/begin'); lineage.serverOk = true; return r.ticket; } catch { lineage.serverOk = false; return null; }
  },
  end(ticket, info) {
    redirectToVnpay(info);
    if (!lineage.enabled) return;
    const entry = reactive({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), method: info.method, path: info.path,
      status: info.status, ms: info.ms, reqBody: info.reqBody ?? null, resBody: info.resBody ?? null, userId: info.userId, ticket,
      write: info.method !== 'GET', state: ticket ? 'waiting' : info.method === 'GET' ? 'read' : 'error', data: null, error: ticket || info.method === 'GET' ? null : 'Lineage server không chạy (npm run lineage)',
    });
    lineage.entries.unshift(entry);
    if (lineage.entries.length > 80) lineage.entries.pop();
    if (ticket) setTimeout(() => load(entry), SETTLE_MS);
  },
  subOf,
};

/** Inspect data that already exists (last N minutes) without making a new write. Shows other people's rows too. */
export async function replay(minutes) {
  const entry = reactive({
    id: `replay-${Date.now()}`, at: new Date().toISOString(), method: 'REPLAY', path: `dữ liệu ${minutes} phút gần nhất (không gọi API)`, status: 200, ms: 0,
    reqBody: null, resBody: null, userId: null, ticket: null, write: true, state: 'loading', data: null, error: null,
  });
  lineage.entries.unshift(entry);
  try {
    entry.ticket = (await post('/begin', { replayMinutes: minutes })).ticket;
    await load(entry);
  } catch (e) { entry.state = 'error'; entry.error = String(e.message || e); }
}
