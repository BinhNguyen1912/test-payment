import { reactive } from 'vue';
import { rates } from './lineage.js';

const STORAGE_PREFIX = 'ct_payout_flow_';
const DEFAULT_API_BASE = '/api/v1';

export const CLIENT_ID_OPTIONS = [
  { value: 'user', label: 'user (Mobile App / General User / Creator)' },
  { value: 'creator', label: 'creator (Mobile Creator Sub-account)' },
  { value: 'merchant', label: 'merchant (Mobile Merchant Sub-account)' },
  { value: 'admin', label: 'admin (Admin / Staff Portal)' },
];

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function get(key, fallback = '') {
  return localStorage.getItem(storageKey(key)) || fallback;
}

function set(key, value) {
  if (value === undefined || value === null || value === '') {
    localStorage.removeItem(storageKey(key));
    return;
  }
  localStorage.setItem(storageKey(key), String(value));
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}

export const settings = reactive({
  apiBase: get('api_base', DEFAULT_API_BASE),
  vnpaySecret: get('vnpay_secret', 'HW9H3YDWLIKL9N65ZMXWHNUOQV5MQ5O6'),
  vnpayTmnCode: get('vnpay_tmn_code', '4WUG28C3'),
});

export function saveSettings() {
  set('api_base', settings.apiBase || DEFAULT_API_BASE);
  set('vnpay_secret', settings.vnpaySecret);
  set('vnpay_tmn_code', settings.vnpayTmnCode);
}

// NO hardcoded accounts, passwords or ids. A persona is filled in one of two ways:
//   1. "Register via API" (buyer / affiliate): phone + password are generated per run and the account is created
//      through the real sign-up endpoints (verify-phone -> sign-up -> phone/verify-otp, dev OTP).
//   2. The tester types an EXISTING login for roles the API cannot create (creator/merchant need eKYC + admin approval,
//      staff roles need an admin). Sub-accounts and everything else are discovered with GET calls.
// Only the client id (which app the role signs in as) is fixed per persona.
// Fixed test accounts (seeded through the real API). Password comes from VITE_ACTOR_PASSWORD in .env.local (never in source).
export const PERSONA_PRESETS = {
  buyer: { clientId: 'user', identifier: 'buyer.real@yopmail.com' },
  creator: { clientId: 'creator', identifier: 'creator.real@yopmail.com' },
  merchant: { clientId: 'merchant', identifier: 'merchant.real@yopmail.com' },
  approver: { clientId: 'user', identifier: 'ketoan.duyet.real@yopmail.com' },
  executor: { clientId: 'user', identifier: 'treasury.xuly.real@yopmail.com' },
  reconciler: { clientId: 'user', identifier: 'ketoan.doisoat.real@yopmail.com' },
  affiliate: { clientId: 'user', identifier: 'affiliate.real@yopmail.com' },
  admin: { clientId: 'user' },
};
const PRESET_PASSWORD = import.meta.env?.VITE_ACTOR_PASSWORD || '';
/** Random password satisfying the backend policy (upper, lower, digit, symbol); never persisted in source. */
export function generatePassword() {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `Tw${r[0].toString(36)}${r[1].toString(36)}!${r[2].toString(36).toUpperCase()}9`.slice(0, 40);
}
export const DEFAULT_PASSWORD = '';
// Bump when presets change: stale saved identifiers/tokens are discarded once.
const PRESET_VERSION = '8';
const presetsOutdated = get('preset_version') !== PRESET_VERSION;

function makeSession(key, label, defaultIdentifier, defaultClientId = 'user', description = '') {
  const preset = PERSONA_PRESETS[key] ?? { identifier: defaultIdentifier, clientId: defaultClientId };
  if (presetsOutdated) {
    ['identifier', 'password', 'client_id', 'access_token', 'token_type', 'active_account_user_id', 'active_account_name'].forEach((k) => set(`${key}_${k}`, ''));
  }
  const session = reactive({
    key,
    label,
    description,
    identifier: get(`${key}_identifier`, preset.identifier || ''),
    password: get(`${key}_password`, PRESET_PASSWORD),
    pin: '',
    clientId: get(`${key}_client_id`, preset.clientId),
    activeAccountUserId: get(`${key}_active_account_user_id`),
    activeAccountName: get(`${key}_active_account_name`),
    managedAccountUserId: '',
    deviceId: get(`${key}_device_id`, uuid()),
    accessToken: get(`${key}_access_token`),
    tokenType: get(`${key}_token_type`, 'Bearer'),
    profile: null,
    busy: false,
    error: '',
  });
  set(`${key}_device_id`, session.deviceId);
  return session;
}

export const sessions = reactive({
  buyer: makeSession(
    'buyer',
    'Buyer (User A)',
    '',
    'user',
    'Purchases commitment templates with VNPay',
  ),
  creator: makeSession(
    'creator',
    'Creator (Seller)',
    '',
    'creator',
    'Earns revenue into ledger & requests payouts',
  ),
  merchant: makeSession(
    'merchant',
    'Merchant (Voucher Issuer)',
    '',
    'merchant',
    'Redeems the purchased voucher, receives recognition, and requests payout',
  ),
  approver: makeSession(
    'approver',
    'Finance Approver',
    '',
    'user',
    'Accounting staff reviewing and approving payout requests',
  ),
  executor: makeSession(
    'executor',
    'Treasury Executor',
    '',
    'user',
    'Accesses beneficiary bank details & submits payout transfer',
  ),
  reconciler: makeSession(
    'reconciler',
    'Finance Reconciler',
    '',
    'user',
    'Independently reconciles bank statement & marks payout succeeded',
  ),
  affiliate: makeSession(
    'affiliate',
    'Affiliate (User B)',
    '',
    'user',
    'Referred the buyer; earns the listing affiliate share & requests payouts',
  ),
  admin: makeSession(
    'admin',
    'Admin cấu hình tài chính',
    '',
    'user',
    'Cần quyền FinanceConfigRead / FinanceConfigManage để xem và cấu hình thuế',
  ),
});

set('preset_version', PRESET_VERSION);

/** Restore one persona to its verified preset (identifier, client, password). */
export function applyPreset(session) {
  const preset = PERSONA_PRESETS[session.key];
  if (!preset) return;
  session.identifier = preset.identifier || '';
  session.clientId = preset.clientId;
  session.password = PRESET_PASSWORD;
  saveSession(session);
  clearSession(session);
}

/**
 * Personas sharing one login (the three accounting roles) share one token: a second
 * sign-in of the same account from another device would revoke the first session.
 */
function shareToken(source) {
  Object.values(sessions).forEach((other) => {
    if (
      other !== source &&
      other.identifier.trim() === source.identifier.trim() &&
      other.clientId === source.clientId
    ) {
      setToken(other, source.accessToken, source.tokenType);
      other.profile = source.profile;
      other.error = '';
    }
  });
}

/** Sign in every persona once, reusing the token for personas on the same login. */
export async function signInAll() {
  const done = new Set();
  const failures = [];
  for (const session of Object.values(sessions)) {
    const loginKey = `${session.identifier.trim()}|${session.clientId}`;
    if (done.has(loginKey)) continue;
    done.add(loginKey);
    try {
      await signIn(session);
    } catch (error) {
      failures.push(`${session.label}: ${error.code || ''} ${error.message}`.trim());
    }
  }
  return failures;
}

const MANAGED_CLIENT_IDS = ['creator', 'merchant'];

/**
 * A creator/merchant client must switch into one of its sub-accounts before the
 * role-specific APIs accept the token. Picks the first active sub-account with that
 * role (owner access first) and swaps the session token for the switched one.
 */
export async function selectManagedAccount(session) {
  const role = session.clientId;
  const list = await request(session, 'GET', '/mobile/sub-accounts', { query: { role } });
  const listed = Array.isArray(list.data) ? list.data : [];
  const accounts = listed.filter(
    (a) => a.isSubAccount && a.role === role && a.status === 'active',
  );
  const target =
    accounts.find((account) => String(account.userId) === String(session.managedAccountUserId)) ||
    accounts.find((a) => a.accessType === 'owner') ||
    accounts[0];
  if (!target) {
    const root = listed.find(
      (account) =>
        account.isRoot &&
        account.isCurrent &&
        account.role === role &&
        account.status === 'active',
    );
    if (root) {
      session.activeAccountUserId = root.userId;
      session.activeAccountName =
        root.profile?.username || root.profile?.displayName || root.profile?.name || '';
      set(`${session.key}_active_account_user_id`, session.activeAccountUserId);
      set(`${session.key}_active_account_name`, session.activeAccountName);
      return root;
    }
    const error = new Error(
      `This login has no active ${role} sub-account. Create one (and get it approved) first.`,
    );
    error.code = 'NO_MANAGED_ACCOUNT';
    throw error;
  }
  const switched = await request(session, 'POST', '/mobile/sub-accounts/switch', {
    body: { targetUserId: target.userId },
  });
  setToken(session, tokenFrom(switched.data), switched.data?.tokenType || session.tokenType);
  session.activeAccountUserId = switched.data?.activeAccountUserId || target.userId;
  session.activeAccountName = target.profile?.username || target.profile?.fullName || '';
  set(`${session.key}_active_account_user_id`, session.activeAccountUserId);
  set(`${session.key}_active_account_name`, session.activeAccountName);
  return switched.data;
}

export function saveSession(session) {
  set(`${session.key}_identifier`, session.identifier.trim());
  set(`${session.key}_password`, session.password || '');
  set(`${session.key}_client_id`, session.clientId || 'user');
  set(`${session.key}_device_id`, session.deviceId.trim());
}

export function setToken(session, token, tokenType = 'Bearer') {
  session.accessToken = token || '';
  session.tokenType = tokenType || 'Bearer';
  set(`${session.key}_access_token`, session.accessToken);
  set(`${session.key}_token_type`, session.tokenType);
}

export function clearSession(session) {
  setToken(session, '');
  session.profile = null;
  session.error = '';
  session.activeAccountUserId = '';
  session.activeAccountName = '';
  set(`${session.key}_active_account_user_id`, '');
  set(`${session.key}_active_account_name`, '');
}

function apiBase() {
  const value = (settings.apiBase || DEFAULT_API_BASE).trim();
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function readMessage(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return '';
}

async function requestRaw(session, method, path, opts = {}) {
  const { auth = true, body, headers = {}, query } = opts;
  const requestHeaders = { Accept: 'application/json', ...headers };
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (session?.deviceId && !requestHeaders['Device-Id']) {
    requestHeaders['Device-Id'] = session.deviceId;
  }
  if (auth && session?.accessToken) {
    requestHeaders.Authorization = `${session.tokenType || 'Bearer'} ${session.accessToken}`;
  }

  const lin = globalThis.__lineage;
  let lineageTicket = null;
  try { lineageTicket = lin ? await lin.begin(method) : null; } catch { lineageTicket = null; }
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(`${apiBase()}${withQuery(path, query)}`, {
      method,
      // Bearer calls must never carry leftover web-session cookies: the backend then demands a CSRF token (CSRF_INVALID).
      credentials: 'omit',
      headers: requestHeaders,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const error = new Error('Network error. Check backend server and Vite proxy configuration.');
    error.code = 'NETWORK';
    error.cause = cause;
    throw error;
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  try {
    lin?.end(lineageTicket, {
      method, path, status: response.status, ms: Date.now() - startedAt,
      reqBody: isFormData ? '[FormData]' : body, resBody: json, userId: session?.accessToken ? lin.subOf(session.accessToken) : null,
    });
  } catch { /* lineage must never break a request */ }

  if (!response.ok || json?.success === false) {
    const error = new Error(
      readMessage(json?.error?.message || json?.message) ||
        response.statusText ||
        'Request failed',
    );
    error.status = response.status;
    error.code = json?.error?.code || json?.code || `HTTP_${response.status}`;
    error.body = json;
    throw error;
  }

  return {
    status: response.status,
    body: json,
    data:
      json && Object.prototype.hasOwnProperty.call(json, 'data')
        ? json.data
        : json,
    meta: json?.meta,
  };
}

// The backend allows ONE device per account: signing in elsewhere (another tab, a script, a teammate) revokes this token with
// DEVICE_DISPLACED. Sign in again ONCE per session (shared promise, so parallel calls do not kick each other out) and retry.
const relogin = new WeakMap();
export async function request(session, method, path, opts = {}) {
  try {
    return await requestRaw(session, method, path, opts);
  } catch (error) {
    const canRetry = error?.code === 'DEVICE_DISPLACED' && opts.auth !== false && session?.identifier && session?.password && !path.includes('/auth/');
    if (!canRetry) throw error;
    if (!relogin.has(session)) relogin.set(session, signIn(session).finally(() => relogin.delete(session)));
    await relogin.get(session);
    return requestRaw(session, method, path, opts);
  }
}

function tokenFrom(data) {
  return (
    data?.accessToken ||
    data?.token ||
    data?.tokens?.accessToken ||
    data?.auth?.accessToken ||
    ''
  );
}

export async function signIn(session) {
  session.busy = true;
  session.error = '';
  saveSession(session);
  try {
    const response = await request(session, 'POST', '/mobile/auth/sign-in', {
      auth: false,
      body: {
        clientId: session.clientId || 'user',
        identifier: session.identifier.trim(),
        password: session.password,
      },
    });
    let token = tokenFrom(response.data);
    setToken(session, token, response.data?.tokenType || 'Bearer');

    // BE sign-in outcome is 'PROCEED' | 'TWO_FACTOR_REQUIRED'. The old device takeover route
    // (/mobile/auth/device/confirm-takeover) no longer exists, so 2FA accounts cannot be driven by this tester.
    if (response.data?.outcome === 'TWO_FACTOR_REQUIRED') {
      const error = new Error('Tài khoản bật 2FA (outcome TWO_FACTOR_REQUIRED): tester không tự vượt 2FA được. Tắt 2FA hoặc dùng tài khoản khác.');
      error.code = 'TWO_FACTOR_REQUIRED';
      throw error;
    }

    if (!session.accessToken) {
      const error = new Error('Sign-in succeeded but no access token was returned.');
      error.code = 'AUTH_TOKEN_MISSING';
      throw error;
    }

    if (MANAGED_CLIENT_IDS.includes(session.clientId)) {
      await selectManagedAccount(session);
    }

    session.pin = '';
    try {
      await loadProfile(session);
    } catch {
      session.profile = null;
    }
    shareToken(session);
    return response;
  } catch (error) {
    session.error = `${error.code || ''} ${error.message || 'Sign-in failed'}`.trim();
    throw error;
  } finally {
    session.busy = false;
  }
}

export async function loadProfile(session) {
  const response = await request(session, 'GET', '/mobile/profiles/me');
  session.profile = response.data;
  return response.data;
}

// ---------------------------------------------------------
// Marketplace & Commitment Template APIs
// ---------------------------------------------------------
export async function listCommitments(session, query = {}) {
  return request(session, 'GET', '/mobile/marketplace/commitments', { query, auth: false });
}

/** Walk every marketplace page (cursor/limit) and flatten the listing shape for the UI. */
export async function listAllCommitments(session, maxPages = 20) {
  const items = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const res = await listCommitments(session, { limit: 50, cursor });
    const batch = res.data?.items || res.data || [];
    items.push(...batch);
    cursor = res.meta?.nextCursor;
    if (!cursor || !res.meta?.hasMore) break;
  }
  return items.map((item) => ({
    id: String(item.id),
    title: item.commitment?.title || item.title || '(untitled)',
    priceVnd: String(item.price?.amount ?? item.priceVnd ?? '0'),
    creatorId: String(item.creator?.id ?? item.creatorUserId ?? ''),
    creatorName: item.creator?.displayName || '',
    templateId: String(item.commitment?.templateId ?? item.templateId ?? ''),
    availableUntil: item.availableUntil || null,
    affiliateShareBps: Number(item.affiliateShareBps ?? 0),
    affiliateAmountVnd: String(item.affiliateAmountVnd ?? '0'),
  }));
}

export async function getCommitmentDetail(session, listingId) {
  return request(session, 'GET', `/mobile/marketplace/commitments/${listingId}`, { auth: false });
}

// Mobile commitment purchase now waits for in-app purchase (409
// CART_COMMITMENT_IAP_NOT_AVAILABLE), so the tester buys through the web API.
// The audience guard only checks the /web/ path and clientId=user, and CSRF is
// enforced only for cookie sessions, so the Bearer token from sign-in works.
export async function purchaseCommitment(session, listingId, { idempotencyKey, bankCode, locale = 'vn' }) {
  return request(session, 'POST', `/web/marketplace/commitments/${listingId}/purchase`, {
    body: {
      idempotencyKey: idempotencyKey || uuid(),
      bankCode: bankCode || undefined,
      locale,
    },
  });
}

// ---------------------------------------------------------
// Web Cart (multi-item checkout: one VNPay order, one ledger entry per unit)
// ---------------------------------------------------------
export async function getCart(session) {
  return request(session, 'GET', '/web/cart');
}

export async function addCartItem(session, { productType, productId, quantity = 1 }) {
  return request(session, 'POST', '/web/cart/items', {
    body: { productType, productId: String(productId), quantity: Number(quantity) },
  });
}

export async function clearCart(session) {
  return request(session, 'DELETE', '/web/cart/items');
}

export async function previewCartCheckout(session) {
  return request(session, 'GET', '/web/cart/checkout-preview');
}

export async function checkoutCart(session, { checkoutRevision, cartItemIds, locale = 'vn' }) {
  return request(session, 'POST', '/web/cart/checkout', {
    body: {
      idempotencyKey: uuid(),
      checkoutRevision,
      cartItemIds: cartItemIds?.length ? cartItemIds : undefined,
      locale,
    },
  });
}

export async function pollPaymentOrder(session, txnRef) {
  return request(session, 'GET', `/mobile/payments/orders/${encodeURIComponent(txnRef)}`);
}

// ---------------------------------------------------------
// Voucher purchase, Smart OTP redemption, and Merchant finance
// ---------------------------------------------------------
export async function listMarketplaceVouchers(session, query = {}) {
  return request(session, 'GET', '/mobile/marketplace/vouchers', { query });
}

export async function purchaseVoucher(session, productId, { idempotencyKey, bankCode, locale = 'vn' } = {}) {
  return request(session, 'POST', `/mobile/marketplace/vouchers/${encodeURIComponent(productId)}/purchase`, {
    body: {
      idempotencyKey: idempotencyKey || uuid(),
      bankCode: bankCode || undefined,
      locale,
    },
  });
}

export async function listMyVouchers(session, query = {}) {
  return request(session, 'GET', '/mobile/vouchers/my', { query });
}

export async function listMerchantVoucherPackages(session, query = {}) {
  return request(session, 'GET', '/mobile/vouchers/merchant/voucher-packages', { query });
}

export async function requestVoucherRedemptionAuthorization(session, publicId) {
  return request(session, 'POST', `/mobile/vouchers/my/${encodeURIComponent(publicId)}/redemption-authorization`);
}

export async function createVoucherRedemptionToken(session, publicId, smartOtp) {
  return request(session, 'POST', `/mobile/vouchers/my/${encodeURIComponent(publicId)}/redemption-token`, {
    body: { smartOtp },
  });
}

export async function previewVoucherRedemption(session, token) {
  return request(session, 'POST', '/mobile/vouchers/merchant/redemptions/preview', {
    body: { token },
  });
}

/** Khôi phục trạng thái redemption khi mạng gián đoạn sau lệnh confirm. */
export async function getMerchantRedemption(session, challengeId) {
  return request(session, 'GET', `/mobile/vouchers/merchant/redemptions/${encodeURIComponent(challengeId)}`);
}

/**
 * Hai contract tồn tại song song:
 *  - cũ (trước TRUST-927, vd worktree trust-913): body { orderAmount, itemIds?, provider?, providerRef?, merchantOrderRef? },
 *    gói voucher có applicability.minOrderAmount.
 *  - mới (TRUST-927, develop): KHÔNG có body; gói voucher không còn applicability.
 * Công tắc lưu ở localStorage; mặc định = contract mới (TRUST-927) vì worktree 913 đã merge develop.
 */
// Key v2: bỏ giá trị cũ đã lưu. Mặc định = contract TRUST-927 (không body) vì backend trust-913 đã merge develop.
export const redeemContract = reactive({ legacyBody: get('redeem_legacy_body_v2', '0') === '1' });
export function setRedeemLegacyBody(value) {
  redeemContract.legacyBody = !!value;
  set('redeem_legacy_body_v2', value ? '1' : '0');
}

export async function confirmVoucherRedemption(session, challengeId, payload, idempotencyKey = uuid()) {
  return request(session, 'POST', `/mobile/vouchers/merchant/redemptions/${encodeURIComponent(challengeId)}/confirm`, {
    // payload = undefined => không gửi body (contract TRUST-927)
    ...(payload && redeemContract.legacyBody ? { body: payload } : {}),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export async function getSmartOtpStatus(session) {
  return request(session, 'GET', '/mobile/smart-otp/status');
}

export async function initSmartOtpEnrollment(session, payload) {
  return request(session, 'POST', '/mobile/smart-otp/enroll/init', { body: payload });
}

export async function confirmSmartOtpEnrollment(session, payload) {
  return request(session, 'POST', '/mobile/smart-otp/enroll/confirm', { body: payload });
}

export async function issueSmartOtpChallenge(session, requestId, smartDeviceId) {
  return request(session, 'POST', `/mobile/smart-otp/requests/${encodeURIComponent(requestId)}/issue`, {
    headers: { 'Device-Id': smartDeviceId },
    body: { action: 'CHALLENGE' },
  });
}

export async function issueSmartOtpCode(session, requestId, payload) {
  return request(session, 'POST', `/mobile/smart-otp/requests/${encodeURIComponent(requestId)}/issue`, {
    body: { action: 'ISSUE', ...payload },
  });
}

export async function getMerchantEarnings(session, query = {}) {
  return request(session, 'GET', '/mobile/merchant/finance/earnings/me', { query });
}

export async function getMerchantStatement(session, query = {}) {
  return request(session, 'GET', '/mobile/merchant/finance/statement/me', { query });
}

export async function listMerchantPayouts(session, query = {}) {
  return request(session, 'GET', '/mobile/merchant/finance/payouts/me', { query });
}

export async function requestMerchantPayout(session, { amountVnd, idempotencyKey, pinToken, pin }) {
  const amount = String(amountVnd ?? '').replace(/\D/g, '');
  const key = idempotencyKey || `payout-${uuid()}`;
  // BE: @RequirePin(PAYOUT) on every managed payout request (the token is one-time).
  const token = pinToken || (await getPinToken(session, 'PAYOUT', pin));
  return request(session, 'POST', '/mobile/merchant/finance/payouts', {
    body: { amountVnd: amount, idempotencyKey: key },
    headers: {
      'Idempotency-Key': key,
      'X-Pin-Token': token,
    },
  });
}

export async function getPinStatus(session) {
  return request(session, 'GET', '/mobile/pin/status');
}

export async function setupPin(session, password, pin) {
  return request(session, 'POST', '/mobile/pin/setup', { body: { password, pin } });
}

export async function verifyPin(session, pin, reason) {
  return request(session, 'POST', '/mobile/pin/verify', { body: { pin, reason } });
}

export async function getMerchantBalance(session, pinToken) {
  return request(session, 'GET', '/mobile/merchant/finance/balance/me', {
    headers: { 'X-Pin-Token': pinToken },
  });
}

// ---------------------------------------------------------
// Bank Accounts (TRUST-867): the route AND the authorization depend on the acting role.
//   root user  -> /mobile/bank-accounts            body.smartOtp {requestId, code} (purpose BANK_ACCOUNT_CHANGE)
//   creator    -> /mobile/creator/bank-accounts    header X-Pin-Token (reason BANK_ACCOUNT_CHANGE)
//   merchant   -> /mobile/merchant/bank-accounts   header X-Pin-Token (reason BANK_ACCOUNT_CHANGE; only on the final write)
// Body of add/update: { bank: <6-digit BIN>, account, password, otp: <6-digit email OTP> }.
// ---------------------------------------------------------
export function bankAccountBase(session) {
  if (session?.clientId === 'creator') return '/mobile/creator/bank-accounts';
  if (session?.clientId === 'merchant') return '/mobile/merchant/bank-accounts';
  return '/mobile/bank-accounts';
}

export async function listBanks() {
  return request(null, 'GET', '/public/bank-accounts/banks', { auth: false });
}

export async function getMyBankAccount(session) {
  return request(session, 'GET', `${bankAccountBase(session)}/me`);
}

/** One-time X-Pin-Token for a sensitive action (PAYOUT, BANK_ACCOUNT_CHANGE, VIEW_BALANCE, ...). */
export async function getPinToken(session, reason, pin) {
  const value = String(pin || session?.pin || '');
  if (!/^\d{6}$/.test(value)) {
    const error = new Error('Cần PIN 6 số của tài khoản này (thiết lập PIN trước, rồi nhập vào ô PIN).');
    error.code = 'PIN_REQUIRED_CLIENT';
    throw error;
  }
  const verified = await verifyPin(session, value, reason);
  return verified.data.pinToken;
}

/** Sends the email OTP required by every bank-account mutation. Creator needs a PIN token here too; merchant does not. */
export async function requestBankOtp(session, { pin } = {}) {
  const headers = {};
  if (session?.clientId === 'creator') headers['X-Pin-Token'] = await getPinToken(session, 'BANK_ACCOUNT_CHANGE', pin);
  return request(session, 'POST', `${bankAccountBase(session)}/otp`, { headers });
}

/** Add (or update with method 'PATCH') a bank account. `smartOtp` is required for root users, `pin` for creator/merchant. */
export async function addBankAccount(session, { bank, account, password, otp, smartOtp, pin, method = 'POST' }) {
  const managed = session?.clientId === 'creator' || session?.clientId === 'merchant';
  const headers = {};
  if (managed) headers['X-Pin-Token'] = await getPinToken(session, 'BANK_ACCOUNT_CHANGE', pin);
  const path = method === 'PATCH' ? `${bankAccountBase(session)}/me` : bankAccountBase(session);
  return request(session, method, path, {
    body: { bank, account, password: password ?? session?.password, otp, ...(smartOtp ? { smartOtp } : {}) },
    headers,
  });
}

// ---------------------------------------------------------
// Creator Finance & Payout APIs
// ---------------------------------------------------------
export async function getCreatorBalance(session) {
  return request(session, 'GET', '/mobile/creator/finance/balance/me');
}

export async function getCreatorEarnings(session, query = {}) {
  return request(session, 'GET', '/mobile/creator/finance/earnings/me', { query });
}

export async function getCreatorStatement(session, query = {}) {
  return request(session, 'GET', '/mobile/creator/finance/statement/me', { query });
}

export async function listCreatorPayouts(session, query = {}) {
  return request(session, 'GET', '/mobile/creator/finance/payouts/me', { query });
}

export async function requestCreatorPayout(session, { amountVnd, idempotencyKey, pinToken, pin }) {
  // The API takes money as a digit string (no float/precision loss), and the
  // header and body keys must be identical or it answers PAYOUT_IDEMPOTENCY_CONFLICT.
  const amount = String(amountVnd ?? '').replace(/\D/g, '');
  const key = idempotencyKey || `payout-${uuid()}`;
  // BE: @RequirePin(PAYOUT) on every managed (creator/merchant) payout request; the token is one-time.
  const token = pinToken || (await getPinToken(session, 'PAYOUT', pin));
  return request(session, 'POST', '/mobile/creator/finance/payouts', {
    body: { amountVnd: amount, idempotencyKey: key },
    headers: { 'Idempotency-Key': key, 'X-Pin-Token': token },
  });
}

export async function getCreatorPayoutDetail(session, id) {
  return request(session, 'GET', `/mobile/creator/finance/payouts/${encodeURIComponent(id)}`);
}

export async function listCreatorPayoutAllocations(session, id, query = {}) {
  return request(session, 'GET', `/mobile/creator/finance/payouts/${encodeURIComponent(id)}/allocations`, { query });
}

// ---------------------------------------------------------
// Affiliate (root account) Referral, Finance & Payout APIs
// Root accounts use mobile/finance/* (party AFFILIATE = the signed-in root user).
// ---------------------------------------------------------
export async function getMyReferralCode(session) {
  return request(session, 'GET', '/mobile/referrals/my-code');
}

export async function listMyReferredUsers(session) {
  return request(session, 'GET', '/mobile/referrals');
}

export async function getAffiliateBalance(session) {
  return request(session, 'GET', '/mobile/finance/balance/me');
}

export async function getAffiliateEarnings(session, query = {}) {
  return request(session, 'GET', '/mobile/finance/earnings/me', { query });
}

export async function getAffiliateStatement(session, query = {}) {
  return request(session, 'GET', '/mobile/finance/statement/me', { query });
}

export async function listAffiliatePayouts(session, query = {}) {
  return request(session, 'GET', '/mobile/finance/payouts/me', { query });
}

export async function requestAffiliatePayout(session, { amountVnd, idempotencyKey, smartOtp }) {
  const amount = String(amountVnd ?? '').replace(/\D/g, '');
  const key = idempotencyKey || `payout-${uuid()}`;
  // BE: root payout needs body.smartOtp {requestId, code} (purpose PAYOUT_CONFIRM bound to amountVnd + idempotencyKey).
  return request(session, 'POST', '/mobile/finance/payouts', {
    body: { amountVnd: amount, idempotencyKey: key, ...(smartOtp ? { smartOtp } : {}) },
    headers: { 'Idempotency-Key': key },
  });
}

// ---------------------------------------------------------
// Admin Accounting Payout APIs
// ---------------------------------------------------------
export async function listAdminPayouts(session, query = {}) {
  return request(session, 'GET', '/web/admin/finance/payouts', { query });
}

export async function getAdminPayoutDetail(session, id) {
  return request(session, 'GET', `/web/admin/finance/payouts/${encodeURIComponent(id)}`);
}

export async function getAdminPayoutBankDetails(session, id) {
  return request(session, 'GET', `/web/admin/finance/payouts/${encodeURIComponent(id)}/bank-details`);
}

export async function getAdminPayoutAllocations(session, id, query = {}) {
  return request(session, 'GET', `/web/admin/finance/payouts/${encodeURIComponent(id)}/allocations`, { query });
}

export async function approvePayout(session, id) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/approve`);
}

export async function rejectPayout(session, id, reason) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/reject`, {
    body: { reason },
  });
}

export async function claimPayoutProcessing(session, id) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/processing`);
}

export async function submitPayoutToBank(session, id, externalReference) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/submit`, {
    body: { externalReference },
  });
}

export async function cancelPayout(session, id, reason) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/cancel`, {
    body: { reason },
  });
}

export async function succeedPayout(session, id, payload) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/succeed`, {
    body: payload,
  });
}

export async function failPayout(session, id, payload) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/fail`, {
    body: payload,
  });
}

export async function quarantinePayout(session, id, payload) {
  return request(session, 'PATCH', `/web/admin/finance/payouts/${encodeURIComponent(id)}/reconciliation-required`, {
    body: payload,
  });
}

// ---------------------------------------------------------
// Admin Double-Entry Ledger APIs
// ---------------------------------------------------------
export async function getLedgerIntegrity(session) {
  return request(session, 'GET', '/web/admin/finance/ledger/integrity');
}

/** Payment <-> fulfillment <-> VNPay reconciliation report (FinancePaymentsRead). */
export async function getPaymentReconciliation(session) {
  return request(session, 'GET', '/web/admin/payments/reconciliation');
}

/** Audit trail of inbound VNPay callbacks (vnpay_ipn_logs). Query: txnRef, outcome, channel, cursor, limit<=50. */
export async function listVnpayIpnLogs(session, query = {}) {
  return request(session, 'GET', '/web/admin/payments/ipn-logs', { query });
}

export async function getFinanceJournals(session, query = {}) {
  return request(session, 'GET', '/web/admin/finance/ledger/journals', { query });
}

/** Maker step: record money VNPay actually settled into the company bank account. */
export async function requestTreasurySettlement(session, { grossAmountVnd, gatewayFeeVnd = '0', externalReference, settledAt }) {
  return request(session, 'POST', '/web/admin/finance/ledger/vnpay-settlements', {
    body: {
      grossAmountVnd: String(grossAmountVnd).replace(/\D/g, ''),
      gatewayFeeVnd: String(gatewayFeeVnd).replace(/\D/g, '') || '0',
      externalReference,
      settledAt: settledAt || new Date().toISOString(),
    },
  });
}

/** Checker step (must be a different admin): post the settlement to BANK_CASH. */
export async function approveTreasurySettlement(session, id, { evidenceSource = 'BANK_STATEMENT', evidenceReference }) {
  return request(session, 'PATCH', `/web/admin/finance/ledger/vnpay-settlements/${encodeURIComponent(id)}/approve`, {
    body: { evidenceSource, evidenceReference },
  });
}

// ---------------------------------------------------------
// Withholding Tax Export (background job, file kept 1h in Redis)
// ---------------------------------------------------------
const TAX_EXPORT_BASE = '/web/admin/finance/tax-reports/withholding/exports';

/** Preset enum (TRUST-913). Server resolves dates in VN time; the FE never computes them. */
export const DATE_RANGE_PRESETS = [
  { value: 'TODAY', label: 'Hôm nay' },
  { value: 'YESTERDAY', label: 'Hôm qua' },
  { value: 'THIS_WEEK', label: 'Tuần này' },
  { value: 'LAST_WEEK', label: 'Tuần trước' },
  { value: 'LAST_7_DAYS', label: '7 ngày qua' },
  { value: 'THIS_MONTH', label: 'Tháng này' },
  { value: 'LAST_MONTH', label: 'Tháng trước' },
  { value: 'LAST_30_DAYS', label: '30 ngày qua' },
  { value: 'THIS_QUARTER', label: 'Quý này' },
  { value: 'LAST_QUARTER', label: 'Quý trước' },
  { value: 'THIS_YEAR', label: 'Năm nay' },
  { value: 'LAST_YEAR', label: 'Năm trước' },
  { value: 'CUSTOM', label: 'Tự chọn' },
];

/** `from`/`to` are sent ONLY for CUSTOM; other presets must not carry them. */
export async function requestTaxExport(session, { preset, from, to }) {
  const body = { preset };
  if (preset === 'CUSTOM') {
    body.from = from;
    body.to = to;
  }
  return request(session, 'POST', TAX_EXPORT_BASE, { body });
}

/** Sends an arbitrary body as-is. Only for contract tests (invalid bodies on purpose). */
export async function requestTaxExportRaw(session, body) {
  return request(session, 'POST', TAX_EXPORT_BASE, { body });
}

export async function getTaxExport(session, exportId) {
  return request(session, 'GET', `${TAX_EXPORT_BASE}/${encodeURIComponent(exportId)}`);
}

/** The file endpoint returns raw xlsx bytes, not the JSON envelope. */
export async function downloadTaxExport(session, exportId) {
  const response = await fetch(
    `${apiBase()}${TAX_EXPORT_BASE}/${encodeURIComponent(exportId)}/file`,
    {
      headers: {
        'Device-Id': session.deviceId,
        Authorization: `${session.tokenType || 'Bearer'} ${session.accessToken}`,
      },
    },
  );
  if (!response.ok) {
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const error = new Error(json?.error?.message || response.statusText || 'Download failed');
    error.status = response.status;
    error.code = json?.error?.code || `HTTP_${response.status}`;
    error.body = json;
    throw error;
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return {
    blob: await response.blob(),
    fileName: match?.[1] || `tax-export-${exportId}.xlsx`,
  };
}

export async function getTreasurySettlements(session, query = {}) {
  return request(session, 'GET', '/web/admin/finance/ledger/vnpay-settlements', { query });
}


// ---------------------------------------------------------
// Membership & Subscription APIs (PR Feature)
// ---------------------------------------------------------

/** List active membership plans available to user (web or mobile) */
export async function listMembershipPlans(session, audience = "web") {
  return request(session, "GET", `/${audience}/membership/plans`);
}

/** Get caller current active membership */
export async function getMyMembership(session, audience = "web") {
  return request(session, "GET", `/${audience}/membership/me`);
}

/** Get caller membership purchase/grant history */
export async function getMyMembershipHistory(session, audience = "web") {
  return request(session, "GET", `/${audience}/membership/me/history`);
}

/** Acquire a plan (0 VND activates instantly; paid returns signed VNPay checkout URL) */
export async function checkoutMembership(session, { planId, paymentMethod, bankCode, locale = 'vn', idempotencyKey, audience = 'web' } = {}) {
  const body = {
    planId: String(planId),
    locale: locale || 'vn',
  };
  if (paymentMethod === 'gateway') {
    body.paymentMethod = 'gateway';
  }
  if (bankCode) {
    body.bankCode = bankCode;
  }

  const res = await request(session, 'POST', `/${audience}/membership/me/checkout`, {
    headers: {
      'Idempotency-Key': idempotencyKey || uuid(),
    },
    body,
  });

  // Normalize response shape to be easy to use across both legacy and new templates
  if (res.data) {
    res.data.checkoutUrl = res.data.paymentUrl || null;
    res.data.orderId = res.data.orderId ? String(res.data.orderId) : null;
    res.data.paymentOrder = res.data.orderId ? {
      id: String(res.data.orderId),
      txnRef: res.data.txnRef || '',
      amountVnd: res.data.amountVnd || 0,
      status: 'PENDING',
    } : null;
  }
  return res;
}

/** Web Crypto HMAC-SHA512 helper */
export async function hmacSha512Browser(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function vnpEncode(val) {
  return encodeURIComponent(String(val)).replace(/%20/g, '+');
}

export function formatVnpDate(date) {
  const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${vnTime.getUTCFullYear()}` +
    `${pad(vnTime.getUTCMonth() + 1)}` +
    `${pad(vnTime.getUTCDate())}` +
    `${pad(vnTime.getUTCHours())}` +
    `${pad(vnTime.getUTCMinutes())}` +
    `${pad(vnTime.getUTCSeconds())}`
  );
}

export function buildVnpSignData(params) {
  const SIGNATURE_FIELDS = new Set(['vnp_SecureHash', 'vnp_SecureHashType']);
  return Object.keys(params)
    .filter((k) => !SIGNATURE_FIELDS.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${vnpEncode(params[k])}`)
    .join('&');
}

/**
 * Fast VNPay IPN simulation in the browser: signs parameters with merchant secret
 * and sends callback to GET /api/v1/public/payments/vnpay/ipn
 */
export async function simulateVnpayIpn({
  txnRef,
  amountVnd,
  orderId = '1',
  isFail = false,
  paidDaysAgo = 0,
  orderInfo,
  secret,
  tmnCode,
} = {}) {
  const hashSecret = secret || settings.vnpaySecret || 'HW9H3YDWLIKL9N65ZMXWHNUOQV5MQ5O6';
  const merchantCode = tmnCode || settings.vnpayTmnCode || '4WUG28C3';
  const payDate = new Date(Date.now() - (Number(paidDaysAgo) || 0) * 24 * 60 * 60 * 1000);

  const cleanAmount = String(amountVnd || '0').replace(/\D/g, '');
  const params = {
    vnp_Amount: (BigInt(cleanAmount || '0') * 100n).toString(),
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: `VNP${Math.floor(10000000 + Number(orderId || 1))}`,
    vnp_CardType: 'ATM',
    vnp_OrderInfo: orderInfo || `Mua TrustWow ${txnRef}`,
    vnp_PayDate: formatVnpDate(payDate),
    vnp_ResponseCode: isFail ? '24' : '00',
    vnp_TmnCode: merchantCode,
    vnp_TransactionNo: isFail ? '0' : String(13000000 + Number(orderId || 1)),
    vnp_TransactionStatus: isFail ? '02' : '00',
    vnp_TxnRef: txnRef,
  };

  const signData = buildVnpSignData(params);
  const secureHash = await hmacSha512Browser(hashSecret, signData);

  const queryParams = new URLSearchParams({
    ...params,
    vnp_SecureHash: secureHash,
  });

  const url = `${apiBase()}/public/payments/vnpay/ipn?${queryParams.toString()}`;
  const lin = globalThis.__lineage;
  let lineageTicket = null;
  try { lineageTicket = lin ? await lin.begin('IPN') : null; } catch { lineageTicket = null; }
  const ipnStartedAt = Date.now();
  const response = await fetch(url);
  const json = await response.json();
  try {
    lin?.end(lineageTicket, {
      method: 'IPN', path: `/public/payments/vnpay/ipn (txnRef=${txnRef}, code=${params.vnp_ResponseCode})`, status: response.status,
      ms: Date.now() - ipnStartedAt, reqBody: { ...params, vnp_SecureHash: '•••' }, resBody: json, userId: null,
    });
  } catch { /* lineage must never break a request */ }
  return {
    status: response.status,
    data: json,
    success: json?.RspCode === '00' || json?.RspCode === '02',
  };
}

/** Admin: List all membership plans */
export async function listAdminMembershipPlans(session) {
  return request(session, 'GET', '/web/admin/membership/plans');
}

/** Admin: Get single membership plan */
export async function getAdminMembershipPlan(session, planId) {
  return request(session, 'GET', `/web/admin/membership/plans/${encodeURIComponent(planId)}`);
}

/** Admin: Create a membership plan */
export async function createAdminMembershipPlan(session, planData) {
  const code = (planData.code || planData.name || 'plan')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 40);
  const payload = {
    code: code.startsWith('_') ? `p${code}` : code,
    name: String(planData.name || '').trim(),
    description: planData.description ? String(planData.description) : undefined,
    price: Number(planData.price ?? 0),
    durationDays: planData.durationDays ? Number(planData.durationDays) : undefined,
    isActive: planData.isActive !== false,
    sortOrder: Number(planData.sortOrder || 0),
    ...(planData.upgradedRoleId ? { upgradedRoleId: String(planData.upgradedRoleId) } : {}),
  };
  return request(session, 'POST', '/web/admin/membership/plans', { body: payload });
}

/** Admin: Update a membership plan */
export async function updateAdminMembershipPlan(session, planId, planData) {
  const payload = {};
  if (planData.name !== undefined) payload.name = String(planData.name).trim();
  if (planData.description !== undefined) payload.description = String(planData.description);
  if (planData.price !== undefined) payload.price = Number(planData.price);
  if (planData.durationDays !== undefined) payload.durationDays = planData.durationDays ? Number(planData.durationDays) : null;
  if (planData.isActive !== undefined) payload.isActive = Boolean(planData.isActive);
  if (planData.sortOrder !== undefined) payload.sortOrder = Number(planData.sortOrder);
  if (planData.upgradedRoleId !== undefined) payload.upgradedRoleId = planData.upgradedRoleId ? String(planData.upgradedRoleId) : null;

  return request(session, 'PATCH', `/web/admin/membership/plans/${encodeURIComponent(planId)}`, { body: payload });
}

/** Admin: Delete a membership plan */
export async function deleteAdminMembershipPlan(session, planId) {
  return request(session, 'DELETE', `/web/admin/membership/plans/${encodeURIComponent(planId)}`);
}

/** Admin: Directly grant a membership to a user (anchor stacking) */
export async function grantMembership(session, { userId, planId, durationDays } = {}) {
  const body = {
    userId: String(userId),
    planId: String(planId),
  };
  if (durationDays !== undefined && durationDays !== '' && durationDays !== null) {
    body.durationDays = Number(durationDays);
  }
  return request(session, 'POST', '/web/admin/membership/grants', { body });
}

/** Admin: List all memberships of a target user */
export async function listUserMemberships(session, userId) {
  return request(session, 'GET', `/web/admin/membership/users/${encodeURIComponent(userId)}/memberships`);
}


// ---------------------------------------------------------------------------
// Real account creation through the public sign-up API (no DB access, no seed).
// Dev/staging OTP is 000000 (backend zalo-otp-bypass); on an environment without it this fails with the real error.
// ---------------------------------------------------------------------------
export function randomPhone() {
  const d = crypto.getRandomValues(new Uint32Array(2));
  return `09${String(d[0] % 10000).padStart(4, '0')}${String(d[1] % 10000).padStart(4, '0')}`;
}

/** verify-phone -> sign-up -> phone/verify-otp. Fills identifier/password/token on the session. */
export async function registerUser(session, { firstName = 'Test', lastName = session.key, invitationCode } = {}) {
  session.busy = true;
  session.error = '';
  try {
    let phone = '';
    for (let i = 0; i < 5 && !phone; i += 1) {
      const candidate = randomPhone();
      try {
        await request(session, 'POST', '/mobile/auth/verify-phone', { auth: false, body: { phoneNumber: candidate } });
        phone = candidate;
      } catch (e) {
        if (e.code !== 'PHONE_ALREADY_EXISTS') throw e;
      }
    }
    if (!phone) throw new Error('Could not find a free phone number after 5 tries.');
    const password = generatePassword();
    await request(session, 'POST', '/mobile/auth/sign-up', { auth: false, body: { phoneNumber: phone, firstName, lastName, password } });
    const verify = await request(session, 'POST', '/mobile/auth/phone/verify-otp', {
      auth: false,
      body: { phoneNumber: phone, otp: '000000', ...(invitationCode ? { invitationCode } : {}) },
    });
    session.identifier = phone;
    session.password = password;
    session.clientId = 'user';
    setToken(session, tokenFrom(verify.data), verify.data?.tokenType || 'Bearer');
    saveSession(session);
    try { await loadProfile(session); } catch { session.profile = null; }
    return verify;
  } catch (error) {
    session.error = `${error.code || ''} ${error.message || 'Register failed'}`.trim();
    throw error;
  } finally {
    session.busy = false;
  }
}

/**
 * Fills EMPTY personas from /accounts.local.json (logins that already exist in the DB; nothing is created or seeded here).
 * Anything the tester typed or registered via API is never overwritten.
 */
export async function loadLocalAccounts() {
  try {
    const res = await fetch('/accounts.local.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return 0;
    const cfg = await res.json();
    const { addPreset } = await import('./ctxStore.js');
    Object.values(cfg.personas || {}).forEach((p) => addPreset(p.userId, `${p.label || p.identifier} · ${p.userId}`));
    (cfg.subAccounts || []).forEach((a) => addPreset(a.id, `${a.label} · ${a.id} (${a.role})`));
    (cfg.extraParties || []).forEach((a) => addPreset(a.id, `${a.label} · ${a.id}`));
    let n = 0;
    Object.entries(cfg.personas || {}).forEach(([key, p]) => {
      const s = sessions[key];
      if (!s || s.identifier || s.accessToken) return;
      s.identifier = p.identifier || '';
      s.password = p.password || cfg.password || '';
      if (p.clientId) s.clientId = p.clientId;
      saveSession(s);
      n += 1;
    });
    return n;
  } catch { return 0; }
}

// ---------------------------------------------------------
// Real fee / tax rates (admin read). develop (TRUST-912): 5 fixed seller groups, each with vatBps / pitBps / platformFeeBps.
// Older branches only have revenue-sources/:id/policy-versions; used as a fallback when seller-policy-groups is 404.
// ---------------------------------------------------------
export function selectPolicyGroup(group) {
  const g = rates.groups.find((x) => x.group === group);
  if (!g?.current) return;
  rates.group = group;
  rates.feeBps = Number(g.current.platformFeeBps);
  rates.vatBps = Number(g.current.vatBps);
  rates.pitBps = Number(g.current.pitBps);
  rates.taxBps = rates.vatBps + rates.pitBps;
  rates.source = `seller-policy ${group} v${g.current.versionNo}`;
}

export async function loadPolicyRates(session, { group = 'CREATOR_INDIVIDUAL', sourceCodeHint = 'COMMITMENT' } = {}) {
  try {
    const res = await request(session, 'GET', '/web/admin/finance/seller-policy-groups');
    rates.groups = (res.data?.items || res.data || []).map((x) => ({ group: x.group, current: x.current }));
    if (rates.groups.some((g) => g.current)) {
      selectPolicyGroup(group);
      return rates;
    }
    // Table finance_seller_policy_versions exists but holds no row yet -> use the legacy policy tables below.
  } catch (e) {
    if (e.status !== 404 && e.code !== 'NOT_FOUND') throw e;
  }
  const list = await request(session, 'GET', '/web/admin/finance/revenue-sources', { query: { limit: 50 } });
  const sources = list.data?.items || list.data || [];
  if (!sources.length) throw new Error('BE không trả revenue source nào.');
  const src = sources.find((x) => String(x.code).toUpperCase().includes(sourceCodeHint)) || sources[0];
  const versions = await request(session, 'GET', `/web/admin/finance/revenue-sources/${src.id}/policy-versions`, { query: { limit: 20 } });
  const items = versions.data?.items || versions.data || [];
  const active = items.find((v) => v.status === 'ACTIVE') || [...items].sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!active) throw new Error(`Source ${src.code} chưa có policy version.`);
  const pct = (l) => (l.valueType === 'PERCENT' ? Number(l.rateBps || 0) : 0);
  rates.feeBps = active.lines.filter((l) => l.chargeKind === 'FEE').reduce((a, l) => a + pct(l), 0);
  rates.taxBps = active.lines.filter((l) => l.chargeKind === 'TAX').reduce((a, l) => a + pct(l), 0);
  rates.vatBps = 0; // legacy policy has a single tax line, shown as TNCN
  rates.pitBps = rates.taxBps;
  rates.groups = [];
  rates.source = `${src.code} v${active.versionNo} (${active.status})`;
  return rates;
}

// ---------------------------------------------------------
// Seller tax / fee policy admin (TRUST-912). Versions are append-only and optimistic-locked by expectedVersionNo.
// ---------------------------------------------------------
export async function listSellerPolicyGroups(session) {
  return request(session, 'GET', '/web/admin/finance/seller-policy-groups');
}

export async function listSellerPolicyVersions(session, group, query = { limit: 20 }) {
  return request(session, 'GET', `/web/admin/finance/seller-policy-groups/${encodeURIComponent(group)}/versions`, { query });
}

export async function createSellerPolicyVersion(session, group, { expectedVersionNo, vatBps, pitBps, platformFeeBps, changeNote }) {
  return request(session, 'POST', `/web/admin/finance/seller-policy-groups/${encodeURIComponent(group)}/versions`, {
    body: { expectedVersionNo, vatBps, pitBps, platformFeeBps, changeNote },
  });
}
