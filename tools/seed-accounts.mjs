#!/usr/bin/env node
// Seeds extra test accounts ONLY through public/mobile APIs (no direct DB writes).
//
//   ACTOR_PASSWORD='...' node tools/seed-accounts.mjs [--count=2] [--check]
//
// env: API_BASE (default http://localhost:3000/api/v1), ACTOR_PASSWORD (password of the existing actors AND of new accounts),
//      AFFILIATE_IDENTIFIER (default affiliate.real@yopmail.com), VNPAY_SECRET, VNPAY_TMN_CODE.
// Steps per new account: verify-phone -> sign-up -> verify-otp(000000, invitationCode of the affiliate)
//   -> sign-in -> membership checkout -> signed VNPAY IPN -> verify membership -> report eKYC status.
// eKYC is NOT created here: BE only creates it from real ID/selfie images via VNPT (ocr-id-files, face-compare),
// then an admin approves. The script reports it as NEEDS_EKYC instead of faking it.
import crypto from 'node:crypto';

const B = process.env.API_BASE || 'http://localhost:3000/api/v1';
const PW = process.env.ACTOR_PASSWORD;
const AFF = process.env.AFFILIATE_IDENTIFIER || 'affiliate.real@yopmail.com';
const SECRET = process.env.VNPAY_SECRET || 'HW9H3YDWLIKL9N65ZMXWHNUOQV5MQ5O6';
const TMN = process.env.VNPAY_TMN_CODE || '4WUG28C3';
const count = Number((process.argv.find((a) => a.startsWith('--count=')) || '--count=2').split('=')[1]);
const checkOnly = process.argv.includes('--check');
const resume = (process.argv.find((a) => a.startsWith('--resume=')) || '').split('=')[1]?.split(',').filter(Boolean) || [];
if (!PW) { console.error('Set ACTOR_PASSWORD'); process.exit(1); }

const log = [];
async function api(method, path, { token, body, headers = {}, device = 'seed-script' } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Device-Id': device, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  log.push(`${method} ${path} -> ${res.status}`);
  return { status: res.status, json, data: json?.data };
}
const must = (r, what) => {
  if (r.status >= 400 || r.json?.success === false) throw new Error(`${what}: ${r.status} ${r.json?.error?.code || ''} ${r.json?.error?.message || ''}`);
  return r;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function signIn(identifier, clientId = 'user', device) {
  for (let t = 0; t < 4; t += 1) {
    const r = await api('POST', '/mobile/auth/sign-in', { body: { clientId, identifier, password: PW }, device });
    if (r.status !== 429) return must(r, `sign-in ${identifier}`).data;
    console.log(`sign-in rate limited, waiting 65s (${identifier})`);
    await sleep(65000);
  }
  throw new Error(`sign-in ${identifier}: still rate limited`);
}

const pad = (n) => String(n).padStart(2, '0');
function vnpDate(d) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
}
const enc = (v) => encodeURIComponent(String(v)).replace(/%20/g, '+');
async function ipn(txnRef, amountVnd) {
  const p = {
    vnp_Amount: (BigInt(amountVnd) * 100n).toString(), vnp_BankCode: 'NCB', vnp_BankTranNo: `VNP${Date.now()}`.slice(0, 15),
    vnp_CardType: 'ATM', vnp_OrderInfo: `Mua TrustWow ${txnRef}`, vnp_PayDate: vnpDate(new Date()), vnp_ResponseCode: '00',
    vnp_TmnCode: TMN, vnp_TransactionNo: String(Date.now()).slice(-8), vnp_TransactionStatus: '00', vnp_TxnRef: txnRef,
  };
  const sign = Object.keys(p).sort().map((k) => `${k}=${enc(p[k])}`).join('&');
  const hash = crypto.createHmac('sha512', SECRET).update(Buffer.from(sign, 'utf8')).digest('hex');
  const url = `${B}/public/payments/vnpay/ipn?${new URLSearchParams({ ...p, vnp_SecureHash: hash })}`;
  const res = await fetch(url);
  const json = await res.json();
  log.push(`GET /public/payments/vnpay/ipn -> ${res.status} ${json.RspCode}`);
  return json;
}

const rows = [];

// 0) Existing actors: sign-in + eKYC + membership (read only).
const ACTORS = [
  ['buyer', 'buyer.real@yopmail.com'], ['creator', 'creator.real@yopmail.com', 'creator'], ['merchant', 'merchant.real@yopmail.com', 'merchant'],
  ['affiliate', AFF], ['payout_approver', 'ketoan.duyet.real@yopmail.com'], ['payout_executor', 'treasury.xuly.real@yopmail.com'],
  ['payout_reconciler', 'ketoan.doisoat.real@yopmail.com'],
];
let affToken = '';
for (const [role, id, clientId = 'user'] of ACTORS) {
  if (!checkOnly && role !== 'affiliate') continue;
  try {
    const s = await signIn(id, clientId, `seed-${role}`);
    const ek = (await api('GET', '/mobile/ekyc/status', { token: s.accessToken })).data?.status;
    const mem = (await api('GET', '/mobile/membership/me', { token: s.accessToken })).data?.active;
    if (role === 'affiliate') affToken = s.accessToken;
    rows.push({ role, id, ekyc: ek, membership: mem, note: 'existing' });
  } catch (e) { rows.push({ role, id, note: `FAIL ${e.message}` }); }
}
if (checkOnly || !affToken) { console.table(rows); process.exit(0); }

// 1) Affiliate invitation code.
const code = must(await api('GET', '/mobile/referrals/my-code', { token: affToken }), 'my-code').data.invitationCode;
console.log(`affiliate invitationCode = ${code}`);

// 2) New accounts.
for (let i = 1; i <= count; i += 1) {
  const row = { role: `affiliate_ref${i}`, note: '' };
  rows.push(row);
  try {
    let phone = resume[i - 1] || '';
    for (let t = 0; t < 8 && !phone; t += 1) {
      const cand = `09${String(crypto.randomInt(0, 1e8)).padStart(8, '0')}`;
      const r = await api('POST', '/mobile/auth/verify-phone', { body: { phoneNumber: cand } });
      if (r.status < 400) phone = cand;
      else if (r.json?.error?.code !== 'PHONE_ALREADY_EXISTS') must(r, 'verify-phone');
    }
    if (!phone) throw new Error('no free phone');
    if (!resume[i - 1]) {
    must(await api('POST', '/mobile/auth/sign-up', { body: { phoneNumber: phone, firstName: 'Ref', lastName: `Affiliate${i}`, password: PW } }), 'sign-up');
    must(await api('POST', '/mobile/auth/phone/verify-otp', { body: { phoneNumber: phone, otp: '000000', invitationCode: code } }), 'verify-otp');
    }
    const s = await signIn(phone, 'user', `seed-ref${i}`);
    row.id = phone; row.userId = s.user?.id || s.userId || '';
    const plans = must(await api('GET', '/mobile/membership/plans', { token: s.accessToken }), 'plans').data;
    const plan = (plans.items || plans)[0];
    if (!plan) throw new Error('no membership plan');
    const co = must(await api('POST', '/web/membership/me/checkout', {
      token: s.accessToken, body: { planId: String(plan.id), locale: 'vn' }, headers: { 'Idempotency-Key': crypto.randomUUID() },
    }), 'membership checkout').data;
    if (co.txnRef && Number(co.amountVnd) > 0) {
      const r = await ipn(co.txnRef, String(co.amountVnd));
      if (r.RspCode !== '00') throw new Error(`IPN ${JSON.stringify(r)}`);
    }
    let active = false;
    for (let t = 0; t < 6 && !active; t += 1) {
      active = (await api('GET', '/mobile/membership/me', { token: s.accessToken })).data?.active === true;
      if (!active) await new Promise((r2) => setTimeout(r2, 1000));
    }
    row.membership = active;
    row.ekyc = (await api('GET', '/mobile/ekyc/status', { token: s.accessToken })).data?.status || 'NEEDS_EKYC';
    row.note = `plan ${plan.id}, ${co.amountVnd} VND, referred by ${code}`;
  } catch (e) { row.note = `FAIL ${e.message}`; }
}
console.table(rows);
console.log(log.join('\n'));
