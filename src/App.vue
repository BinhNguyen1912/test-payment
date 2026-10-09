<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  CLIENT_ID_OPTIONS,
  addBankAccount,
  applyPreset,
  registerUser,
  approvePayout,
  approveTreasurySettlement,
  requestTreasurySettlement,
  cancelPayout,
  claimPayoutProcessing,
  clearSession,
  failPayout,
  getAdminPayoutBankDetails,
  getAdminPayoutDetail,
  getCommitmentDetail,
  getCreatorBalance,
  getCreatorEarnings,
  getCreatorPayoutDetail,
  getCreatorStatement,
  addCartItem,
  checkoutCart,
  clearCart,
  getCart,
  previewCartCheckout,
  getAffiliateBalance,
  getAffiliateEarnings,
  getAffiliateStatement,
  getMyReferralCode,
  listAffiliatePayouts,
  listMyReferredUsers,
  requestAffiliatePayout,
  getFinanceJournals,
  getLedgerIntegrity,
  getMyBankAccount,
  listAdminPayouts,
  listAllCommitments,
  listCommitments,
  PERSONA_PRESETS,
  listCreatorPayouts,
  loadProfile,
  pollPaymentOrder,
  purchaseCommitment,
  quarantinePayout,
  rejectPayout,
  requestCreatorPayout,
  saveSession,
  saveSettings,
  sessions,
  settings,
  signIn,
  signInAll,
  submitPayoutToBank,
  succeedPayout,
  uuid,
  simulateVnpayIpn,
  purchaseVoucher,
  checkoutMembership,
  listBanks,
  loadPolicyRates,
  selectPolicyGroup,
  requestBankOtp,
  getPinStatus,
  setupPin,
} from './api.js';
import { getSmartOtpProof } from './smartOtp.js';
import ReadinessPanel from './components/ReadinessPanel.vue';
import AllFieldsTable from './components/AllFieldsTable.vue';
import {
  PAYOUT_STEPS,
  attachLedger,
  explainError,
  fulfillmentLineage,
  freeMembershipLineage,
  ipnLineage,
  orderCreatedLineage,
  payoutStepLineage,
  vnd,
  computeSplit,
  rates,
} from './lineage.js';
import ProductCatalogSelector from './components/ProductCatalogSelector.vue';
import DataLineageInspector from './components/DataLineageInspector.vue';
import PayoutApprovalStepper from './components/PayoutApprovalStepper.vue';
import MembershipFlow from './MembershipFlow.vue';
import VoucherPayoutFlow from './VoucherPayoutFlow.vue';
import TaxExportPanel from './components/TaxExportPanel.vue';

const STORAGE_FLOW_STATE = 'ct_payout_flow_state';

function loadStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_FLOW_STATE) || '{}');
  } catch {
    return {};
  }
}

const saved = loadStoredState();

// Active tab / stage
const currentStage = ref(saved.currentStage || 1);
const activeSessionKey = ref(saved.activeSessionKey || 'buyer');

// Flow state
const flow = reactive({
  listingId: saved.listingId || '',
  templateId: saved.templateId || '',
  orderId: saved.orderId || '',
  txnRef: saved.txnRef || '',
  paymentUrl: saved.paymentUrl || '',
  amountVnd: saved.amountVnd || '50000',
  payoutId: saved.payoutId || '',
  bankReference: saved.bankReference || `FT${Date.now().toString().slice(-8)}`,
  evidenceReference: saved.evidenceReference || `STMT-${Date.now().toString().slice(-8)}`,
  evidenceSource: saved.evidenceSource || 'BANK_STATEMENT',
  bankOccurredAt: new Date().toISOString(),
  payoutAmountVnd: saved.payoutAmountVnd || '41500', // Net after 10% fee + 7% tax on 50k
  payoutIdempotencyKey: saved.payoutIdempotencyKey || `payout-${uuid()}`,
  affiliatePayoutAmountVnd: saved.affiliatePayoutAmountVnd || '',
  autoSettle: saved.autoSettle !== false,
});

// Watch and persist flow state
watch([flow, currentStage, activeSessionKey], () => {
  localStorage.setItem(
    STORAGE_FLOW_STATE,
    JSON.stringify({
      currentStage: currentStage.value,
      activeSessionKey: activeSessionKey.value,
      ...flow,
    }),
  );
}, { deep: true });

// UI reactive stores
const ui = reactive({
  busy: '',
  toast: null,
  rawResponse: null,
  marketplaceListings: [],
  selectedListing: null,
  paymentOrder: null,
  creatorBalance: null,
  creatorEarnings: [],
  creatorStatement: [],
  creatorPayouts: [],
  creatorBankAccount: null,
  adminPayouts: [],
  adminPayoutDetail: null,
  adminBankDetails: null,
  ledgerIntegrity: null,
  financeJournals: [],
  referralCode: '',
  referredUsers: [],
  affiliateBalance: null,
  affiliateEarnings: [],
  affiliateStatement: [],
  affiliatePayouts: [],
  affiliateBankAccount: null,
  cartPreview: null,
  // Data lineage (newest first) + latest lineage per payout step
  lineages: [],
  payoutStepLineages: {},
  loadingLedger: false,
  buyItem: null,
  lastOrder: null,
});

// TRUST-867: the BE only takes { bank: <6-digit BIN>, account, password, otp } (+ X-Pin-Token for creator/merchant).
// bankName / accountName are resolved by the BE (OpenBankGate lookup), they are not inputs any more.
const newBankForm = reactive({
  bankBin: '970436',
  accountNumber: '0071009998888',
  otp: '000000', // dev/staging bypass; the real code is emailed by "Gửi email OTP"
});
const banks = ref([]);
const pinInfo = reactive({ creatorStatus: '', affiliatePin: '482915' });

function notify(message, type = 'info') {
  ui.toast = { message, type };
  setTimeout(() => {
    if (ui.toast?.message === message) ui.toast = null;
  }, 4000);
}

async function run(label, fn) {
  ui.busy = label;
  ui.rawResponse = null;
  try {
    const res = await fn();
    ui.rawResponse = res?.body || res?.data || res;
    notify(`Success: ${label}`, 'success');
    return res;
  } catch (err) {
    const { code, message, hint } = explainError(err);
    ui.rawResponse = err.body || { error: message, code, hint };
    notify(`Error (${code}): ${message}${hint ? ` — ${hint}` : ''}`, 'error');
    throw err;
  } finally {
    ui.busy = '';
  }
}

// Formatters
function money(val) {
  if (val === null || val === undefined || val === '') return '0 ₫';
  const num = Number(val);
  if (Number.isNaN(num)) return `${val} ₫`;
  return `${num.toLocaleString('vi-VN')} ₫`;
}

// The 8 integrity counters the BE returns (ledger-integrity.res.dto.ts); healthy = balanced && all counters 0.
const INTEGRITY_COUNTERS = [
  { key: 'staleDraftCount', label: 'Stale drafts (>5 phút)' },
  { key: 'orphanPayoutJournalCount', label: 'Orphan payout journals' },
  { key: 'payoutStateJournalMismatchCount', label: 'Payout state ≠ journal' },
  { key: 'payoutAllocationMismatchCount', label: 'Payout allocation mismatch' },
  { key: 'treasurySettlementMismatchCount', label: 'Treasury settlement mismatch' },
  { key: 'paymentLedgerMismatchCount', label: 'Payment ≠ ledger' },
  { key: 'earningLedgerMismatchCount', label: 'Earning ≠ ledger' },
];

function journalBalanced(j) {
  let d = 0n;
  let c = 0n;
  for (const l of j.lines || []) {
    const v = BigInt(String(l.amountVnd ?? '0').replace(/\D/g, '') || '0');
    if (l.side === 'DEBIT') d += v; else c += v;
  }
  return d === c;
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

function statusBadgeClass(status) {
  if (!status) return 'badge-pending';
  const s = String(status).toUpperCase();
  if (s.includes('SUCCEED') || s.includes('PAID') || s.includes('FULFILLED') || s === 'TRUE') return 'badge-succeeded';
  if (s.includes('PROCESS')) return 'badge-processing';
  if (s.includes('SUBMIT')) return 'badge-submitted';
  if (s.includes('APPROV')) return 'badge-approved';
  if (s.includes('FAIL') || s === 'FALSE') return 'badge-failed';
  if (s.includes('CANCEL')) return 'badge-cancelled';
  if (s.includes('QUARANT') || s.includes('RECONCIL')) return 'badge-quarantined';
  return 'badge-pending';
}

// -------------------------------------------------------------
// STEP 1: Auth actions
// -------------------------------------------------------------
async function handleSignIn(session) {
  await run(`Sign-in [${session.label}]`, () => signIn(session));
}

async function handleRegister(session) {
  activeSessionKey.value = session.key;
  await run(`Register via API [${session.label}]`, async () => {
    // Buyer signs up with the affiliate's real referral code (GET /mobile/referrals/my-code), so the link is made by the API.
    let invitationCode;
    if (session.key === 'buyer' && sessions.affiliate.accessToken) {
      const ref = await getMyReferralCode(sessions.affiliate);
      invitationCode = ref.data?.code || ref.data?.invitationCode || ref.data?.referralCode;
      if (!invitationCode) notify('Affiliate referral code not found in response; buyer registers without a referrer', 'warning');
    }
    const r = await registerUser(session, { invitationCode });
    notify(`Created account ${session.identifier} through the sign-up API`, 'success');
    return r;
  });
}

async function handleSignInAll() {
  ui.busy = 'Sign-in all personas';
  try {
    const failures = await signInAll();
    if (failures.length) notify(`Sign-in failed: ${failures.join(' | ')}`, 'error');
    else notify('All personas signed in (creator switched into its sub-account)', 'success');
  } finally {
    ui.busy = '';
  }
}

function handleResetPresets() {
  Object.values(sessions).forEach((s) => applyPreset(s));
  notify('Personas reset to presets — click "Sign In All"', 'info');
}

function handleClearSession(session) {
  clearSession(session);
  notify(`Logged out ${session.label}`, 'info');
}

async function handleLoadProfile(session) {
  await run(`Profile [${session.label}]`, () => loadProfile(session));
}

// -------------------------------------------------------------
// STEP 2: Marketplace Commitment Template Purchase
// -------------------------------------------------------------
// The creator sub-account the Creator persona is switched into; its sales are the
// ones that show up in that persona's balance.
const myCreatorId = computed(
  () => sessions.creator.activeAccountUserId || '',
);
const catalogRef = ref(null);

function selectListing(listing) {
  ui.selectedListing = listing;
  flow.listingId = String(listing.id || listing.listingId || '');
  flow.templateId = String(listing.templateId || '');
  flow.amountVnd = String(listing.priceVnd || listing.amountVnd || '0');
  const owner = listing.creatorId === myCreatorId.value ? ' (my creator)' : ` (creator ${listing.creatorId} — NOT my creator)`;
  notify(`Selected Listing #${flow.listingId}${owner}`, listing.creatorId === myCreatorId.value ? 'info' : 'warning');
}

// -------------------------------------------------------------
// Lineage helpers
// -------------------------------------------------------------
function pushLineage(lineage) {
  ui.lineages = [lineage, ...ui.lineages].slice(0, 40);
  return lineage;
}

function replaceLineage(updated) {
  ui.lineages = ui.lineages.map((l) => (l.id === updated.id ? updated : l));
  Object.entries(ui.payoutStepLineages).forEach(([step, l]) => {
    if (l.id === updated.id) ui.payoutStepLineages[step] = updated;
  });
}

const ledgerSession = computed(
  () => [sessions.reconciler, sessions.approver, sessions.executor].find((s) => s.accessToken) || null,
);

/** Replace "expected" entries with the journals really posted (needs an admin login). */
async function loadLedger(lineage, { silent = false } = {}) {
  const session = ledgerSession.value;
  if (!session) {
    if (!silent) notify('Sign in an admin persona (Approver/Reconciler) to read the real ledger', 'warning');
    return;
  }
  ui.loadingLedger = true;
  try {
    const res = await getFinanceJournals(session, { limit: 100 });
    const journals = res.data?.items || (Array.isArray(res.data) ? res.data : []);
    const updated = attachLedger(lineage, journals);
    replaceLineage(updated);
    if (!silent) {
      notify(
        updated.ledgerCount
          ? `Loaded ${updated.ledgerCount} real journal(s) from finance_journals`
          : 'No journal found yet for this record (still dự kiến)',
        updated.ledgerCount ? 'success' : 'warning',
      );
    }
  } catch (err) {
    if (!silent) notify(`Ledger read failed (${err.code}): ${err.message}`, 'error');
  } finally {
    ui.loadingLedger = false;
  }
}

async function track(lineage) {
  pushLineage(lineage);
  await loadLedger(lineage, { silent: true });
}

async function ensureSignedIn(session) {
  if (!session.accessToken) await run(`Sign-in [${session.label}]`, () => signIn(session));
}

// -------------------------------------------------------------
// 1-Click purchase (commitment / voucher / membership plan / cart)
// -------------------------------------------------------------
function openBuyConfirm(item) {
  if (item.kind === 'COMMITMENT') selectListing(item.raw);
  ui.buyItem = item;
}

const buySplit = computed(() => {
  const item = ui.buyItem;
  if (!item || item.kind === 'MEMBERSHIP' || !/^\d+$/.test(String(item.price))) return null;
  return computeSplit(item.price, item.affiliateBps || 0);
});

function toOrder(data, extra = {}) {
  return {
    orderId: data.orderId ? String(data.orderId) : '',
    txnRef: data.txnRef || '',
    amountVnd: String(data.amountVnd ?? '0'),
    paymentUrl: data.paymentUrl || '',
    purpose: data.purpose,
    ...extra,
  };
}

async function confirmBuy() {
  const item = ui.buyItem;
  if (!item) return;
  ui.buyItem = null;
  try {
    await ensureSignedIn(sessions.buyer);
    let res;
    if (item.kind === 'COMMITMENT') {
      res = await run(`Purchase commitment #${item.id} (VNPay)`, () =>
        purchaseCommitment(sessions.buyer, item.id, { idempotencyKey: uuid(), locale: 'vn' }),
      );
    } else if (item.kind === 'VOUCHER') {
      res = await run(`Purchase voucher #${item.id} (VNPay)`, () =>
        purchaseVoucher(sessions.buyer, item.id, { idempotencyKey: uuid() }),
      );
    } else {
      res = await run(`Checkout membership plan #${item.id}`, () =>
        checkoutMembership(sessions.buyer, {
          planId: item.id,
          paymentMethod: 'gateway',
          audience: item.audience || 'web',
        }),
      );
    }
    const data = res.data || {};
    if (item.kind === 'MEMBERSHIP' && !data.orderId && !data.paymentUrl) {
      await track(freeMembershipLineage({ plan: item.raw, raw: res.body }));
      return;
    }
    const order = toOrder(data, { planId: item.id });
    flow.paymentUrl = order.paymentUrl;
    flow.txnRef = order.txnRef;
    flow.orderId = order.orderId;
    flow.amountVnd = order.amountVnd;
    ui.paymentOrder = null;
    ui.lastOrder = { kind: item.kind, order, affiliateBps: item.affiliateBps || 0 };
    await track(orderCreatedLineage({ kind: item.kind, order, itemTitle: item.title, raw: res.body }));
    if (flow.autoSettle) await settleOrder(item.kind, order, item.affiliateBps || 0);
    else currentStage.value = 3;
  } catch {
    /* run() already reported the domain error */
  }
}

/** Signed VNPay IPN (browser-side) -> poll order -> fulfilment lineage. */
async function settleOrder(kind, order, affiliateBps = 0) {
  let tmnCode;
  try {
    tmnCode = order.paymentUrl ? new URL(order.paymentUrl).searchParams.get('vnp_TmnCode') || undefined : undefined;
  } catch {
    tmnCode = undefined;
  }
  const ipn = await run('Simulate signed VNPay IPN', async () => {
    const r = await simulateVnpayIpn({
      txnRef: order.txnRef,
      amountVnd: order.amountVnd,
      orderId: order.orderId,
      tmnCode,
    });
    if (!r.success) {
      const error = new Error(`IPN rejected: ${JSON.stringify(r.data)}`);
      error.code = 'VNPAY_IPN_REJECTED';
      error.body = r.data;
      throw error;
    }
    return r;
  });
  await track(ipnLineage({ kind, order, ipn }));

  let polled = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await run('Poll payment order', () => pollPaymentOrder(sessions.buyer, order.txnRef));
    polled = res.data;
    if (polled?.fulfillmentStatus === 'FULFILLED') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  ui.paymentOrder = polled;
  await track(fulfillmentLineage({ kind, order, polled, affiliateBps }));
}

async function handleSimulateIpnStage3() {
  const last = ui.lastOrder?.order?.txnRef === flow.txnRef ? ui.lastOrder : null;
  const order =
    last?.order ||
    toOrder({ orderId: flow.orderId, txnRef: flow.txnRef, amountVnd: flow.amountVnd, paymentUrl: flow.paymentUrl });
  try {
    await settleOrder(last?.kind || 'COMMITMENT', order, last?.affiliateBps || 0);
  } catch {
    /* reported by run() */
  }
}

// Web cart: several products in one VNPay order. Each item becomes one checkout
// unit with its own affiliate pin and its own FULFILLMENT_RECOGNIZED journal.
const CART_PRODUCT_TYPE = { COMMITMENT: 'COMMITMENT_TEMPLATE', VOUCHER: 'VOUCHER' };

async function handleCatalogAddToCart(item) {
  const productType = CART_PRODUCT_TYPE[item.kind];
  if (!productType) {
    notify('Membership plans are bought directly (not via cart)', 'warning');
    return;
  }
  if (!item.productId) {
    notify('Item has no productId (templateId)', 'warning');
    return;
  }
  try {
    await ensureSignedIn(sessions.buyer);
    await run(`Add ${productType} ${item.productId} to cart`, () =>
      addCartItem(sessions.buyer, { productType, productId: item.productId, quantity: 1 }),
    );
    await handlePreviewCart();
  } catch {
    /* reported by run() */
  }
}

function cartSeller(it) {
  const p = it.product || {};
  return (
    p.creatorName || p.creator?.displayName || p.issuerName || p.merchantName || p.seller?.name ||
    (it.productType === 'VOUCHER' ? 'Merchant' : 'Creator')
  );
}

async function handlePreviewCart() {
  const [cart, preview] = await Promise.all([
    run('Cart', () => getCart(sessions.buyer)).catch(() => null),
    run('Cart checkout preview', () => previewCartCheckout(sessions.buyer)),
  ]);
  ui.cartPreview = preview.data;
  return cart;
}

async function handleClearCart() {
  await run('Clear cart', () => clearCart(sessions.buyer));
  ui.cartPreview = null;
}

async function handleCheckoutCart() {
  const preview = ui.cartPreview;
  if (!preview?.checkoutRevision) {
    notify('Preview the cart first', 'warning');
    return;
  }
  try {
    const res = await run('Checkout cart (VNPay, web)', () =>
      checkoutCart(sessions.buyer, { checkoutRevision: preview.checkoutRevision }),
    );
    const order = toOrder(res.data || {});
    flow.paymentUrl = order.paymentUrl;
    flow.txnRef = order.txnRef;
    flow.orderId = order.orderId;
    flow.amountVnd = order.amountVnd || flow.amountVnd;
    ui.paymentOrder = null;
    ui.lastOrder = { kind: 'CART', order, affiliateBps: 0 };
    await track(orderCreatedLineage({ kind: 'CART', order, itemTitle: `${preview.items?.length || 0} item`, raw: res.body }));
    if (flow.autoSettle) await settleOrder('CART', order, 0);
    else currentStage.value = 3;
  } catch {
    /* reported by run() */
  }
}

function openVnpayUrl() {
  if (flow.paymentUrl) {
    window.open(flow.paymentUrl, '_blank', 'noopener,noreferrer');
  }
}

function copySimulateCommand() {
  if (!flow.txnRef) return;
  const cmd = `npx ts-node scripts/simulate-vnpay-ipn.ts ${flow.txnRef}`;
  navigator.clipboard.writeText(cmd);
  notify('Copied simulation command to clipboard!', 'success');
}

async function handlePollOrder() {
  if (!flow.txnRef) {
    notify('No txnRef available to poll', 'warning');
    return;
  }
  const res = await run('Poll Payment Order', () =>
    pollPaymentOrder(sessions.buyer, flow.txnRef),
  );
  ui.paymentOrder = res.data;
  if (res.data?.fulfillmentStatus === 'FULFILLED') {
    notify('Payment fulfilled! Creator earnings recognized in ledger.', 'success');
    const last = ui.lastOrder?.order?.txnRef === flow.txnRef ? ui.lastOrder : null;
    const order = last?.order || toOrder({ orderId: flow.orderId, txnRef: flow.txnRef, amountVnd: flow.amountVnd });
    await track(fulfillmentLineage({ kind: last?.kind || 'COMMITMENT', order, polled: res.data, affiliateBps: last?.affiliateBps || 0 }));
  }
}

// -------------------------------------------------------------
// STEP 4: Creator Finance & Balance
// -------------------------------------------------------------
function sumSucceeded(payouts) {
  return (payouts || [])
    .filter((p) => String(p.status).toUpperCase() === 'SUCCEEDED')
    .reduce((acc, p) => acc + Number(p.amountVnd || 0), 0);
}

const creatorPaidOut = computed(() => sumSucceeded(ui.creatorPayouts));
const affiliatePaidOut = computed(() => sumSucceeded(ui.affiliatePayouts));

function withdrawAll(persona) {
  if (persona === 'affiliate') {
    flow.affiliatePayoutAmountVnd = String(ui.affiliateBalance?.available ?? '');
  } else {
    flow.payoutAmountVnd = String(ui.creatorBalance?.available ?? '');
  }
}

async function handleRefreshCreatorFinance() {
  const [balRes, earnRes, stmtRes] = await Promise.all([
    run('Creator Balance', () => getCreatorBalance(sessions.creator)),
    run('Creator Earnings', () => getCreatorEarnings(sessions.creator, { limit: 10 })),
    run('Creator Statement', () => getCreatorStatement(sessions.creator, { limit: 10 })),
  ]);
  ui.creatorBalance = balRes.data;
  try {
    const payoutsRes = await listCreatorPayouts(sessions.creator, { limit: 50 });
    ui.creatorPayouts = payoutsRes.data?.items || payoutsRes.data || [];
  } catch {
    ui.creatorPayouts = [];
  }
  ui.creatorEarnings = earnRes.data?.items || earnRes.data || [];
  ui.creatorStatement = stmtRes.data?.items || stmtRes.data || [];

  if (ui.creatorBalance?.available) {
    flow.payoutAmountVnd = String(ui.creatorBalance.available);
  }
}

// -------------------------------------------------------------
// STEP 5: Creator Bank & Payout Request
// -------------------------------------------------------------
async function handleGetCreatorBank() {
  const res = await run('Get Creator Bank Account', () => getMyBankAccount(sessions.creator));
  ui.creatorBankAccount = res.data;
}

async function handleLoadRates() {
  await run('Load real fee/tax policy', () => loadPolicyRates(sessions.reconciler));
  notify(`Tỉ lệ thật: phí ${rates.feeBps / 100}% · thuế ${rates.taxBps / 100}% — ${rates.source}`, 'success');
}

async function handleLoadBanks() {
  const res = await run('Public bank list', () => listBanks());
  banks.value = res.data?.items || res.data || [];
}

async function handleCreatorPinStatus() {
  const res = await run('Creator PIN status', () => getPinStatus(sessions.creator));
  pinInfo.creatorStatus = res.data?.status || '';
}

async function handleSetupCreatorPin() {
  await run('Setup creator PIN', () => setupPin(sessions.creator, sessions.creator.password, sessions.creator.pin));
  await handleCreatorPinStatus();
  notify('PIN đã thiết lập', 'success');
}

async function handleRequestCreatorBankOtp() {
  await run('Creator bank email OTP', () => requestBankOtp(sessions.creator));
  notify('Đã gửi email OTP (dev/staging nhận 000000)', 'success');
}

async function handleAddCreatorBank() {
  const res = await run('Add Creator Bank Account', () =>
    addBankAccount(sessions.creator, {
      bank: newBankForm.bankBin,
      account: newBankForm.accountNumber,
      password: sessions.creator.password,
      otp: newBankForm.otp,
    }),
  );
  ui.creatorBankAccount = res.data;
  notify('Bank account added for creator!', 'success');
}

async function handleRequestCreatorPayout() {
  flow.payoutIdempotencyKey = `payout-${uuid()}`;
  const res = await run('Submit Creator Payout Request', () =>
    requestCreatorPayout(sessions.creator, {
      amountVnd: flow.payoutAmountVnd,
      idempotencyKey: flow.payoutIdempotencyKey,
      // BE @RequirePin(PAYOUT): PIN 6 số của creator (nhập ở khung PIN phía trên).
    }),
  );
  const payout = res.data;
  flow.payoutId = String(payout.id);
  ui.payoutStepLineages = {};
  await track(payoutStepLineage({ step: 'REQUEST', payout: { partyType: 'CREATOR', amountVnd: flow.payoutAmountVnd, ...payout }, raw: res.body }));
  notify(`Payout #${flow.payoutId} requested successfully!`, 'success');
  currentStage.value = 6;
  await handleRefreshAdminPayouts();
}

async function handleListCreatorPayouts() {
  const res = await run('List Creator Payouts', () => listCreatorPayouts(sessions.creator));
  ui.creatorPayouts = res.data?.items || res.data || [];
}

// -------------------------------------------------------------
// STEP 6: Accounting / Admin Payout Lifecycle
// -------------------------------------------------------------
async function handleRefreshAdminPayouts() {
  const res = await run('List Admin Payouts', () => listAdminPayouts(sessions.approver));
  ui.adminPayouts = res.data?.items || res.data || [];
  if (flow.payoutId) {
    await handleGetAdminPayoutDetail(flow.payoutId);
  }
}

async function handleGetAdminPayoutDetail(id) {
  const res = await run(`Payout #${id} Detail`, () => getAdminPayoutDetail(sessions.approver, id));
  ui.adminPayoutDetail = res.data;
}

// Payout approval also requires company cash: money sitting in VNPAY_CLEARING only
// becomes BANK_CASH once a settlement is recorded (maker) and approved (a different
// admin, checker). Without it approve answers PAYOUT_INSUFFICIENT_AVAILABLE_BALANCE.
const treasuryForm = reactive({ amountVnd: '', externalReference: '' });

async function handleSettleTreasury() {
  const amount = String(treasuryForm.amountVnd || flow.payoutAmountVnd || '').replace(/\D/g, '');
  if (!amount) {
    notify('Enter the settled amount (VND)', 'warning');
    return;
  }
  const ref = (treasuryForm.externalReference || `VNPAY-STL-${Date.now()}`).toUpperCase();
  const created = await run('Record VNPay settlement (maker: Approver)', () =>
    requestTreasurySettlement(sessions.approver, { grossAmountVnd: amount, externalReference: ref }),
  );
  const id = created.data?.id;
  await run(`Approve VNPay settlement #${id} (checker: Executor)`, () =>
    approveTreasurySettlement(sessions.executor, id, {
      evidenceSource: 'BANK_STATEMENT',
      evidenceReference: `STMT-${ref}`,
    }),
  );
  notify(`Company cash +${amount} ₫ (VNPay clearing → bank). Now approve the payout.`, 'success');
}

const payoutRecord = () => {
  const d = ui.adminPayoutDetail;
  const rec = d?.payout || d || {};
  return String(rec.id) === String(flow.payoutId) ? rec : {};
};

async function trackPayoutStep(step, res, fromStatus, extra = {}) {
  const payout = {
    id: flow.payoutId,
    amountVnd: flow.payoutAmountVnd,
    ...payoutRecord(),
    ...(res?.data?.payout || (res?.data && typeof res.data === 'object' ? res.data : {})),
    ...extra,
  };
  const lineage = payoutStepLineage({ step, payout, fromStatus, raw: res?.body });
  ui.payoutStepLineages = { ...ui.payoutStepLineages, [step]: lineage };
  await track(lineage);
}

async function handleApprovePayout() {
  if (!flow.payoutId) return;
  const before = payoutRecord().status;
  const res = await run(`Approve Payout #${flow.payoutId}`, () =>
    approvePayout(sessions.approver, flow.payoutId),
  );
  await trackPayoutStep('APPROVE', res, before);
  await handleRefreshAdminPayouts();
}

async function handleClaimProcessing() {
  if (!flow.payoutId) return;
  const before = payoutRecord().status;
  const res = await run(`Claim Processing #${flow.payoutId}`, () =>
    claimPayoutProcessing(sessions.executor, flow.payoutId),
  );
  await trackPayoutStep('PROCESSING', res, before);
  await handleRefreshAdminPayouts();
}

async function handleGetAdminBankDetails() {
  if (!flow.payoutId) return;
  const res = await run(`View Beneficiary Bank #${flow.payoutId}`, () =>
    getAdminPayoutBankDetails(sessions.executor, flow.payoutId),
  );
  ui.adminBankDetails = res.data;
}

async function handleSubmitToBank() {
  if (!flow.payoutId) return;
  const before = payoutRecord().status;
  const res = await run(`Submit Payout #${flow.payoutId} to Bank`, () =>
    submitPayoutToBank(sessions.executor, flow.payoutId, flow.bankReference),
  );
  await trackPayoutStep('SUBMIT', res, before, { externalReference: flow.bankReference });
  await handleRefreshAdminPayouts();
}

async function handleSucceedPayout() {
  if (!flow.payoutId) return;
  const before = payoutRecord().status;
  const res = await run(`Reconcile & Succeed Payout #${flow.payoutId}`, () =>
    succeedPayout(sessions.reconciler, flow.payoutId, {
      externalReference: flow.bankReference,
      evidenceSource: flow.evidenceSource,
      evidenceReference: flow.evidenceReference,
      // Must not predate the executor's submit (backend allows 5 min skew); a value
      // restored from yesterday's saved state is rejected as PAYOUT_INVALID_STATE.
      bankOccurredAt: new Date().toISOString(),
      note: 'Reconciled successfully via E2E Flow Tester',
    }),
  );
  await trackPayoutStep('SUCCEED', res, before);
  await handleRefreshAdminPayouts();
  currentStage.value = 7;
  await handleCheckLedger();
}

async function handleRejectPayout() {
  if (!flow.payoutId) return;
  const reason = prompt('Enter rejection reason:', 'Suspected duplicate payout');
  if (!reason) return;
  const before = payoutRecord().status;
  const res = await run(`Reject Payout #${flow.payoutId}`, () =>
    rejectPayout(sessions.approver, flow.payoutId, reason),
  );
  await trackPayoutStep('REJECT', res, before);
  await handleRefreshAdminPayouts();
}

async function handleCancelPayout() {
  if (!flow.payoutId) return;
  const reason = prompt('Enter cancellation reason:', 'Bank rejected wire transfer');
  if (!reason) return;
  const before = payoutRecord().status;
  const res = await run(`Cancel Payout #${flow.payoutId}`, () =>
    cancelPayout(sessions.executor, flow.payoutId, reason),
  );
  await trackPayoutStep('CANCEL', res, before);
  await handleRefreshAdminPayouts();
}

// -------------------------------------------------------------
// STEP 8: Affiliate (User B) — referral, earnings & payout
// -------------------------------------------------------------
// Estimated split for the selected listing. Rates come from the active finance policy (see handleLoadRates); the posted journal (Stage 7) is the source of truth.
function percentHalfUp(amount, bps) {
  return (BigInt(amount) * BigInt(bps) + 5000n) / 10000n;
}
const expectedSplit = computed(() => {
  const listing = ui.selectedListing;
  if (!listing || !/^\d+$/.test(String(listing.priceVnd))) return null;
  const gross = BigInt(listing.priceVnd);
  const fee = percentHalfUp(gross, rates.feeBps);
  // The BE rounds VAT and TNCN separately (half-up each), then adds them.
  const tax = percentHalfUp(gross, rates.vatBps) + percentHalfUp(gross, rates.pitBps);
  const affiliate = percentHalfUp(gross, listing.affiliateShareBps || 0);
  return {
    gross: gross.toString(),
    fee: fee.toString(),
    tax: tax.toString(),
    affiliate: affiliate.toString(),
    sellerWithAffiliate: (gross - fee - tax - affiliate).toString(),
    sellerWithoutAffiliate: (gross - fee - tax).toString(),
  };
});

const buyerIsReferred = computed(() => {
  const buyerId = String(sessions.buyer.profile?.userId ?? sessions.buyer.profile?.id ?? '');
  return ui.referredUsers.some((u) => String(u.userId) === buyerId);
});

async function handleCheckReferral() {
  const [codeRes, listRes] = await Promise.all([
    run('Affiliate referral code', () => getMyReferralCode(sessions.affiliate)),
    run('Users referred by affiliate', () => listMyReferredUsers(sessions.affiliate)),
  ]);
  ui.referralCode = codeRes.data?.invitationCode || '';
  ui.referredUsers = Array.isArray(listRes.data) ? listRes.data : listRes.data?.items || [];
}

async function handleRefreshAffiliateFinance() {
  const [balRes, earnRes, stmtRes, payoutRes] = await Promise.all([
    run('Affiliate Balance', () => getAffiliateBalance(sessions.affiliate)),
    run('Affiliate Earnings', () => getAffiliateEarnings(sessions.affiliate, { limit: 20 })),
    run('Affiliate Statement', () => getAffiliateStatement(sessions.affiliate, { limit: 20 })),
    run('Affiliate Payouts', () => listAffiliatePayouts(sessions.affiliate, { limit: 20 })),
  ]);
  ui.affiliateBalance = balRes.data;
  ui.affiliateEarnings = earnRes.data?.items || earnRes.data || [];
  ui.affiliateStatement = stmtRes.data?.items || stmtRes.data || [];
  ui.affiliatePayouts = payoutRes.data?.items || payoutRes.data || [];
  if (ui.affiliateBalance?.available) {
    flow.affiliatePayoutAmountVnd = String(ui.affiliateBalance.available);
  }
}

async function handleGetAffiliateBank() {
  const res = await run('Get Affiliate Bank Account', () => getMyBankAccount(sessions.affiliate));
  ui.affiliateBankAccount = res.data;
}

async function handleRequestAffiliatePayout() {
  const key = `payout-${uuid()}`;
  const res = await run('Submit Affiliate Payout Request', async () => {
    // BE (root payout): body.smartOtp bound to { amountVnd, idempotencyKey } via purpose PAYOUT_CONFIRM.
    const smartOtp = await getSmartOtpProof(sessions.affiliate, {
      purpose: 'PAYOUT_CONFIRM',
      subjectType: 'PAYOUT',
      params: { amountVnd: String(flow.affiliatePayoutAmountVnd).replace(/\D/g, ''), idempotencyKey: key },
      pin: pinInfo.affiliatePin,
    });
    return requestAffiliatePayout(sessions.affiliate, {
      amountVnd: flow.affiliatePayoutAmountVnd,
      idempotencyKey: key,
      smartOtp,
    });
  });
  flow.payoutId = String(res.data.id);
  flow.payoutAmountVnd = String(flow.affiliatePayoutAmountVnd);
  ui.payoutStepLineages = {};
  await track(payoutStepLineage({ step: 'REQUEST', payout: { partyType: 'AFFILIATE', amountVnd: flow.affiliatePayoutAmountVnd, ...res.data }, raw: res.body }));
  notify(`Affiliate payout #${flow.payoutId} requested — approve it in Stage 6`, 'success');
  currentStage.value = 6;
  await handleRefreshAdminPayouts();
}

// -------------------------------------------------------------
// STEP 7: Double-Entry Ledger Inspector
// -------------------------------------------------------------
async function handleCheckLedger() {
  const [intRes, jnlRes] = await Promise.all([
    run('Ledger Integrity Report', () => getLedgerIntegrity(sessions.reconciler)),
    run('Recent Finance Journals', () => getFinanceJournals(sessions.reconciler, { limit: 15 })),
  ]);
  ui.ledgerIntegrity = intRes.data;
  ui.financeJournals = jnlRes.data?.items || jnlRes.data || [];
}

function openVoucherFlow() {
  currentStage.value = 10;
  requestAnimationFrame(() => {
    document.getElementById('voucher-full-flow')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}
</script>

<template>
  <div class="app-container">
    <!-- Top Header -->
    <header class="app-header">
      <div class="brand-title">
        <div class="brand-icon">⚡</div>
        <div>
          <h1>TrustWow Financial Full-Flow Tester</h1>
          <p class="muted">Commitment + Voucher Purchase ➔ VNPay ➔ Redeem ➔ Earnings ➔ Payout ➔ Accounting Reconciliation</p>
        </div>
        <span class="badge">E2E Flow</span>
      </div>

      <div class="header-settings">
        <button class="success" @click="openVoucherFlow">
          🎟️ Mua Voucher Full Flow
        </button>
        <button class="secondary" @click="handleSignInAll" :disabled="!!ui.busy">
          🔑 Sign In All (personas that have credentials)
        </button>
        <button class="ghost" @click="handleResetPresets" :disabled="!!ui.busy">
          ♻️ Reset Accounts
        </button>
        <button class="ghost" @click="saveSettings">
          ⚙️ Settings
        </button>
      </div>
    </header>

    <section class="voucher-flow-launcher" @click="openVoucherFlow">
      <div>
        <span class="voucher-flow-kicker">NEW · STAGE 10</span>
        <h2>🎟️ Mua Voucher → Redeem → Merchant Payout</h2>
        <p>
          Chạy một phát toàn bộ VNPay, Smart OTP, merchant recognition, T+7,
          kế toán approve/execute/reconcile và kiểm tra đúng tài khoản ledger.
        </p>
      </div>
      <button class="success">Mở luồng mua Voucher ➔</button>
    </section>

    <!-- Multi-Persona Quick Switcher Banner -->
    <section class="persona-bar">
      <div class="persona-bar-header">
        <span class="persona-bar-title">👥 Personas & Client IDs (Multi-Client Login Support)</span>
        <span class="muted" style="font-size: 0.8rem;">Click a persona to inspect & customize login credentials</span>
      </div>

      <div class="persona-chips">
        <div
          v-for="session in Object.values(sessions)"
          :key="session.key"
          class="persona-chip"
          :class="{ active: activeSessionKey === session.key }"
          @click="activeSessionKey = session.key"
        >
          <div class="persona-chip-top">
            <span class="persona-role-label">
              <span class="status-dot" :class="session.accessToken ? 'online' : 'offline'"></span>
              {{ session.label }}
            </span>
            <span class="client-id-tag">{{ session.clientId }}</span>
          </div>
          <div class="persona-meta">
            <span>{{ session.identifier }}</span>
            <span v-if="session.accessToken" class="badge badge-succeeded" style="font-size: 0.65rem;">Auth</span>
            <span v-else class="badge badge-pending" style="font-size: 0.65rem;">No Token</span>
          </div>
        </div>
      </div>

      <!-- Active Persona Config Drawer -->
      <div v-if="sessions[activeSessionKey]" style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main);">
            Configuring Persona: <span style="color: var(--primary);">{{ sessions[activeSessionKey].label }}</span>
          </h3>
          <span class="muted" style="font-size: 0.8rem;">{{ sessions[activeSessionKey].description }}</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Identifier (Email / Phone)</label>
            <input v-model="sessions[activeSessionKey].identifier" placeholder="phone / email of an existing account, or use Register via API" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input v-model="sessions[activeSessionKey].password" type="password" placeholder="generated when you Register via API" />
          </div>
          <div class="form-group">
            <label>Client ID (Supported: user, creator, merchant, admin)</label>
            <select v-model="sessions[activeSessionKey].clientId">
              <option v-for="opt in CLIENT_ID_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Device ID</label>
            <input v-model="sessions[activeSessionKey].deviceId" class="mono" />
          </div>
        </div>

        <div class="button-group" style="margin-top: 12px;">
          <button @click="handleSignIn(sessions[activeSessionKey])" :disabled="!!ui.busy">
            {{ sessions[activeSessionKey].busy ? 'Signing In...' : 'Sign In ' + sessions[activeSessionKey].label }}
          </button>
          <button class="secondary" @click="handleLoadProfile(sessions[activeSessionKey])" :disabled="!sessions[activeSessionKey].accessToken || !!ui.busy">
            Check Profile
          </button>
          <button class="danger" @click="handleClearSession(sessions[activeSessionKey])" :disabled="!sessions[activeSessionKey].accessToken">
            Logout
          </button>
          <span v-if="sessions[activeSessionKey].error" style="color: var(--danger); font-size: 0.8rem; align-self: center;">
            ⚠️ {{ sessions[activeSessionKey].error }}
          </span>
          <span v-else-if="sessions[activeSessionKey].profile" style="color: var(--success); font-size: 0.8rem; align-self: center;">
            ✓ Logged in as: {{ sessions[activeSessionKey].profile.fullName || sessions[activeSessionKey].profile.email }} (ID: {{ sessions[activeSessionKey].profile.id }})
          </span>
        </div>
      </div>
    </section>

    <!-- Pipeline Step Navigation -->
    <nav class="pipeline-nav">
      <div
        class="pipeline-step"
        :class="{ active: currentStage === 1, completed: currentStage > 1 }"
        @click="currentStage = 1"
      >
        <span class="step-number">1</span>
        <span>Auth & Setup</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 2, completed: currentStage > 2 }"
        @click="currentStage = 2"
      >
        <span class="step-number">2</span>
        <span>Buyer Purchase</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 3, completed: currentStage > 3 }"
        @click="currentStage = 3"
      >
        <span class="step-number">3</span>
        <span>VNPay Settlement</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 4, completed: currentStage > 4 }"
        @click="currentStage = 4"
      >
        <span class="step-number">4</span>
        <span>Creator Balance</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 5, completed: currentStage > 5 }"
        @click="currentStage = 5"
      >
        <span class="step-number">5</span>
        <span>Creator Payout</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 6, completed: currentStage > 6 }"
        @click="currentStage = 6"
      >
        <span class="step-number">6</span>
        <span>Accounting Approval</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 7, completed: currentStage > 7 }"
        @click="currentStage = 7"
      >
        <span class="step-number">7</span>
        <span>Ledger Integrity</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 8, completed: currentStage > 8 }"
        @click="currentStage = 8"
      >
        <span class="step-number">8</span>
        <span>Affiliate (B)</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 9, completed: currentStage > 9 }"
        @click="currentStage = 9"
      >
        <span class="step-number">9</span>
        <span>Membership & Ledger</span>
      </div>
      <span class="pipeline-arrow">➔</span>

      <div
        class="pipeline-step"
        :class="{ active: currentStage === 10 }"
        @click="currentStage = 10"
      >
        <span class="step-number">10</span>
        <span>Voucher Full Flow</span>
      </div>

    </nav>

    <!-- Main Content Area based on Stage -->
    <main class="flow-grid">
      <!-- STAGE 1: Auth & Personas Overview -->
      <section v-if="currentStage === 1" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">1</span>
            <div>
              <h2>Stage 1: Multi-Persona Setup & Client ID Verification</h2>
              <p>Sign in each role before executing the lifecycle. No seeded accounts: use <b>Register via API</b> (buyer / affiliate) or type an existing login for creator, merchant and staff.</p>
            </div>
          </div>
          <button class="success" @click="currentStage = 2">Next: Buyer Purchase ➔</button>
        </div>

        <div class="callout info">
          <strong>Client ID Contract:</strong>
          <span>In TrustWow, mobile authentication uses <code>POST /mobile/auth/sign-in</code> with client IDs:
          <code>user</code> (standard users / buyers), <code>creator</code> (creator context), <code>merchant</code> (merchant context).
          Staff / Admin actions utilize users with administrative roles (such as <code>payout_approver</code>, <code>payout_executor</code>, <code>payout_reconciler</code>).</span>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Role in Flow</th>
                <th>Default Account</th>
                <th>Client ID</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in Object.values(sessions)" :key="s.key">
                <td><strong>{{ s.label }}</strong></td>
                <td class="muted">{{ s.description }}</td>
                <td><code>{{ s.identifier }}</code></td>
                <td><span class="client-id-tag">{{ s.clientId }}</span></td>
                <td>
                  <span v-if="s.accessToken" class="badge badge-succeeded">Logged In</span>
                  <span v-else class="badge badge-pending">Not Logged In</span>
                </td>
                <td>
                  <button v-if="!s.accessToken && ['buyer','affiliate'].includes(s.key) && !s.identifier" class="secondary" style="padding: 4px 10px; font-size: 0.75rem;" :disabled="s.busy" @click="handleRegister(s)">
                    Register via API
                  </button>
                  <button v-else-if="!s.accessToken" class="secondary" style="padding: 4px 10px; font-size: 0.75rem;" :disabled="!s.identifier || !s.password" @click="activeSessionKey = s.key; handleSignIn(s)">
                    Login
                  </button>
                  <button v-else class="ghost" style="padding: 4px 10px; font-size: 0.75rem;" @click="handleClearSession(s)">
                    Logout
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="callout info" style="margin-top: 12px; font-size: 0.8rem;">
            Tỉ lệ phí/thuế đang dùng để ước tính: <b>phí {{ rates.feeBps / 100 }}% · thuế {{ rates.taxBps / 100 }}%</b> — nguồn: {{ rates.source }}.
            <button class="secondary" style="padding: 4px 10px; font-size: 0.75rem; margin-left: 8px;" :disabled="!!ui.busy || !sessions.reconciler.accessToken" @click="handleLoadRates">Tải tỉ lệ thật từ BE (cần Login reconciler)</button>
            <div v-if="rates.groups.length" class="table-container" style="margin-top: 8px;">
              <table>
                <thead><tr><th>Nhóm người bán</th><th>v</th><th>Phí sàn</th><th>VAT</th><th>PIT</th><th>Tổng thuế</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="g in rates.groups" :key="g.group" :style="g.group === rates.group ? 'font-weight:700' : ''">
                    <td><code>{{ g.group }}</code></td>
                    <td>{{ g.current?.versionNo ?? '—' }}</td>
                    <td>{{ g.current ? g.current.platformFeeBps / 100 + '%' : '—' }}</td>
                    <td>{{ g.current ? g.current.vatBps / 100 + '%' : '—' }}</td>
                    <td>{{ g.current ? g.current.pitBps / 100 + '%' : '—' }}</td>
                    <td>{{ g.current ? (g.current.vatBps + g.current.pitBps) / 100 + '%' : '—' }}</td>
                    <td><button class="secondary" style="padding: 2px 8px; font-size: 0.72rem;" :disabled="!g.current" @click="selectPolicyGroup(g.group)">Dùng để ước tính</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <ReadinessPanel />
        </div>
      </section>

      <!-- STAGE 2: Buyer Purchase Commitment Template -->
      <section v-if="currentStage === 2" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">2</span>
            <div>
              <h2>Stage 2: Buyer chọn sản phẩm &amp; mua 1-Click <code class="tbl-tag">DB: payment_orders · cart_checkout_units · carts · cart_items · vouchers · commitment_listings · membership_plans</code></h2>
              <p>Danh sách tự tải từ API (thẻ cam kết, voucher, gói hội viên) — không cần nhập ID.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="catalogRef?.reload()" :disabled="!!ui.busy">Refresh Catalog</button>
            <button class="success" @click="currentStage = 3">Next: VNPay Settlement ➔</button>
          </div>
        </div>

        <div class="flow-grid">
          <div class="col-8">
            <ProductCatalogSelector
              ref="catalogRef"
              :session="sessions.buyer"
              :my-creator-id="myCreatorId"
              :selected-key="ui.buyItem ? `${ui.buyItem.kind}:${ui.buyItem.id}` : ''"
              :disabled="!!ui.busy"
              @select="openBuyConfirm"
              @add-to-cart="handleCatalogAddToCart"
            />
          </div>

          <div class="col-4">
            <div class="metric-card highlight" style="gap: 8px;">
              <h3 style="font-size: 0.95rem;">⚡ 1-Click Flow <code class="tbl-tag">DB: payment_orders (+ reserved_voucher_id → vouchers)</code></h3>
              <div class="callout info" style="font-size: 0.78rem;">
                Buyer: <strong>{{ sessions.buyer.identifier }}</strong>
                ({{ sessions.buyer.accessToken ? 'đã đăng nhập' : 'sẽ tự đăng nhập khi mua' }})
              </div>
              <label style="font-size: 0.8rem; display: flex; gap: 6px; align-items: center;">
                <input type="checkbox" v-model="flow.autoSettle" />
                Tự giả lập VNPay IPN + nhận hàng sau khi tạo đơn
              </label>
            </div>

            <div class="metric-card" style="gap: 10px; margin-top: 14px;">
              <h3 style="font-size: 0.95rem;">🧺 Giỏ hàng Multi-Seller (1 đơn VNPay) <code class="tbl-tag">DB: carts · cart_items → payment_orders (CART_CHECKOUT) · cart_checkout_units</code></h3>
              <div v-if="ui.cartPreview?.items?.length" class="table-container">
                <table>
                  <thead><tr><th>Item</th><th>Người bán</th><th>Giá</th><th>OK</th></tr></thead>
                  <tbody>
                    <tr v-for="it in ui.cartPreview.items" :key="it.id">
                      <td style="font-size: 0.75rem;">
                        {{ it.product?.title || it.product?.name || it.productId }}
                        <div class="muted" style="font-size: 0.68rem;">{{ it.productType }} × {{ it.quantity }}</div>
                      </td>
                      <td style="font-size: 0.75rem;">{{ cartSeller(it) }}</td>
                      <td>{{ money(it.product?.price) }}</td>
                      <td>{{ it.available ? '✓' : '✕' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="muted" style="font-size: 0.8rem;">Giỏ trống — bấm "+ Giỏ" ở danh sách.</div>
              <div class="fact-grid" v-if="ui.cartPreview">
                <div class="fact-item"><span class="label">Tổng tiền</span><span class="value">{{ money(ui.cartPreview.totalAmountVnd) }}</span></div>
                <div class="fact-item">
                  <span class="label">Đủ điều kiện</span>
                  <span class="badge" :class="ui.cartPreview.checkoutEligible ? 'badge-succeeded' : 'badge-failed'">
                    {{ ui.cartPreview.checkoutEligible ? 'YES' : ui.cartPreview.checkoutBlockedReason || 'NO' }}
                  </span>
                </div>
              </div>
              <div class="button-group">
                <button class="secondary" @click="handlePreviewCart" :disabled="!sessions.buyer.accessToken || !!ui.busy">Xem giỏ</button>
                <button class="success" @click="handleCheckoutCart" :disabled="!ui.cartPreview?.checkoutEligible || !!ui.busy">Thanh toán toàn bộ giỏ</button>
                <button class="danger" @click="handleClearCart" :disabled="!sessions.buyer.accessToken || !!ui.busy">Xoá</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- STAGE 3: VNPay Settlement & Verification -->
      <section v-if="currentStage === 3" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">3</span>
            <div>
              <h2>Stage 3: VNPay Payment & Fulfillment Verification <code class="tbl-tag">DB: payment_orders · vnpay_transactions · vnpay_ipn_logs · payment_provider_events · finance_journals (PAYMENT_CAPTURED)</code></h2>
              <p>Simulate or complete payment on VNPay sandbox, then verify entitlement & ledger recognition.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="currentStage = 2">Back</button>
            <button class="success" @click="currentStage = 4">Next: Creator Balance ➔</button>
          </div>
        </div>

        <div class="flow-grid">
          <div class="col-6">
            <div class="metric-card highlight" style="gap: 14px;">
              <h3 style="font-size: 0.95rem;">VNPay Checkout Order Details <code class="tbl-tag">DB: payment_orders (app_trans_id = txnRef, status, fulfillment_status)</code></h3>
              <div class="fact-grid">
                <div class="fact-item">
                  <span class="label">Payment Order ID</span>
                  <span class="value">{{ flow.orderId || '-' }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Transaction Reference (txnRef)</span>
                  <span class="value">{{ flow.txnRef || '-' }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Amount</span>
                  <span class="value" style="color: var(--success);">{{ money(flow.amountVnd) }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Order Status</span>
                  <span class="badge" :class="statusBadgeClass(ui.paymentOrder?.status)">
                    {{ ui.paymentOrder?.status || 'PENDING' }}
                  </span>
                </div>
                <div class="fact-item">
                  <span class="label">Fulfillment Status</span>
                  <span class="badge" :class="statusBadgeClass(ui.paymentOrder?.fulfillmentStatus)">
                    {{ ui.paymentOrder?.fulfillmentStatus || 'PENDING' }}
                  </span>
                </div>
              </div>

              <div class="button-group" style="margin-top: 8px;">
                <button @click="openVnpayUrl" :disabled="!flow.paymentUrl">
                  🌐 Open VNPay Sandbox
                </button>
                <button class="secondary" @click="copySimulateCommand" :disabled="!flow.txnRef">
                  📋 Copy Simulation CLI Command
                </button>
                <button class="success" @click="handlePollOrder" :disabled="!flow.txnRef || !!ui.busy">
                  🔄 Poll Payment Status
                </button>
                <button class="primary" @click="handleSimulateIpnStage3" :disabled="!flow.txnRef || !!ui.busy">
                  ⚡ Simulate Signed IPN + Poll
                </button>
              </div>
            </div>
          </div>

          <div class="col-6">
            <div class="metric-card" style="gap: 12px;">
              <h3 style="font-size: 0.95rem;">Local Development Simulation Helper <code class="tbl-tag">DB: ghi: vnpay_ipn_logs, vnpay_transactions, payment_orders</code></h3>
              <p class="muted" style="font-size: 0.82rem;">
                Since VNPay's live IPN webhook cannot reach <code>localhost</code> directly, you can simulate server-to-server settlement in two ways:
              </p>

              <div class="callout success">
                <strong>Method 1: Terminal Command</strong>
                <pre class="code-block" style="margin-top: 6px;">npx ts-node scripts/simulate-vnpay-ipn.ts {{ flow.txnRef || '&lt;txnRef&gt;' }}</pre>
                <div class="muted" style="font-size: 0.75rem; margin-top: 6px;">
                  Skip the payout holding period (templates are recognized at the pay date):
                </div>
                <pre class="code-block" style="margin-top: 4px;">npx ts-node scripts/simulate-vnpay-ipn.ts {{ flow.txnRef || '&lt;txnRef&gt;' }} --paid-days-ago 8</pre>
              </div>

              <div class="callout info">
                <strong>Fulfillment Behavior:</strong>
                <span>Upon successful payment settlement, <code>CommitmentTemplatePaymentFulfillmentHandler</code> automatically executes:
                1. Grants/merges commitment template entitlement for the buyer.
                2. Posts agent sale recognition to double-entry ledger (credits Creator net payable, credits the platform commission, credits the withheld tax (rates come from the active finance policy), and — when the buyer was referred — credits the affiliate share to AFFILIATE_PAYABLE for User B, netted out of the creator line).</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- STAGE 4: Creator Earnings & Double-Entry Ledger Balance -->
      <section v-if="currentStage === 4" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">4</span>
            <div>
              <h2>Stage 4: Creator Ledger-Derived Earnings & Balance</h2>
              <p>Inspect Creator's wallet balances derived directly from double-entry accounting entries.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="handleRefreshCreatorFinance" :disabled="!!ui.busy">
              🔄 Refresh Balances
            </button>
            <button class="success" @click="currentStage = 5">Next: Creator Payout ➔</button>
          </div>
        </div>

        <!-- Creator Balance Metrics -->
        <div class="metrics-row">
          <div class="metric-card highlight">
            <span class="metric-label">Total Payable</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.payable) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Total ledger balance</span>
          </div>

          <div class="metric-card success">
            <span class="metric-label">Available for Payout</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.available) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Ready to withdraw</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">Pending Settlement</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.pendingSettlement) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Inside holding period (PAYOUT_HOLDING_DAYS)</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">Held / Reserve</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.held) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Reserved by payouts + risk holds (risk: {{ money(ui.creatorBalance?.riskHeld) }})</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">Pending Payout</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.pendingPayout) }}</span>
            <span class="muted" style="font-size: 0.72rem;">In review / processing</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">In-Transit</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.inTransit) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Submitted to bank</span>
          </div>
        </div>

        <!-- Earnings Breakdown Table -->
        <div style="margin-top: 16px;">
          <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Source-Level Earnings Breakdown (Fee & Tax Recognition) <code class="tbl-tag">DB: finance_journals + finance_journal_lines + finance_policy_versions (dẫn xuất, không có bảng earnings riêng)</code></h3>
          <div v-if="ui.creatorEarnings.length === 0" class="callout info">
            Click "Refresh Balances" to load earnings entries.
          </div>
          <div v-else class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Event Source</th>
                  <th>Loại</th>
                  <th>Sản phẩm</th>
                  <th>Journal / Order</th>
                  <th>Occurred At</th>
                  <th>Gross Amount</th>
                  <th>Platform Fee</th>
                  <th>Withholding Tax</th>
                  <th>Affiliate Share</th>
                  <th>Net Payable</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in ui.creatorEarnings" :key="item.id || item.eventSourceId">
                  <td><code>{{ item.revenueSourceCode || item.sourceType || item.eventSourceType || 'CommitmentTemplateSale' }}</code><div class="muted mono" style="font-size:0.68rem">{{ item.sourceId }}</div></td>
                  <td>{{ item.earningKind }}</td>
                  <td>{{ item.productType }}<div class="muted" style="font-size:0.7rem">{{ item.productName }}</div></td>
                  <td class="mono" style="font-size:0.72rem">J#{{ item.journalId }}<br />PO#{{ item.paymentOrderId }}</td>
                  <td>{{ formatDate(item.occurredAt || item.createdAt) }}</td>
                  <td style="color: var(--text-main); font-weight: 600;">{{ money(item.grossAmountVnd) }}</td>
                  <td style="color: var(--warning);">- {{ money(item.platformFeeVnd) }}<div v-for="c in (item.charges || []).filter(x => x.kind === 'FEE')" :key="c.code" class="muted mono" style="font-size:0.66rem">{{ c.code }}</div></td>
                  <td style="color: var(--danger);">- {{ money(item.taxWithheldVnd) }}<div v-for="c in (item.charges || []).filter(x => x.kind === 'TAX')" :key="c.code" class="muted mono" style="font-size:0.66rem">{{ c.code }}: {{ money(c.amountVnd) }}</div></td>
                  <td style="color: var(--primary);">
                    - {{ money(item.affiliateShareVnd) }}
                    <span v-if="item.affiliateShareBps" class="muted" style="font-size: 0.7rem;">({{ (item.affiliateShareBps / 100).toFixed(2) }}%)</span>
                  </td>
                  <td style="color: var(--success); font-weight: 700;">{{ money(item.netAmountVnd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Statement (ledger lines with VAS codes) -->
        <div style="margin-top: 16px;" v-if="ui.creatorStatement.length">
          <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Creator Statement (dòng sổ cái + mã VAS) <code class="tbl-tag">DB: finance_journal_lines JOIN finance_accounts JOIN finance_journals</code></h3>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Line</th><th>Journal</th><th>Event</th><th>Account</th><th>VAS</th><th>Dr/Cr</th><th>Amount</th><th>Reference</th><th>Occurred At</th></tr>
              </thead>
              <tbody>
                <tr v-for="l in ui.creatorStatement" :key="l.lineId">
                  <td class="mono">{{ l.lineId }}</td>
                  <td class="mono">{{ l.journalId }}</td>
                  <td><code>{{ l.eventType }}</code></td>
                  <td><code>{{ l.accountCode }}</code></td>
                  <td>{{ l.vasAccountCode }} <span class="muted" style="font-size:0.7rem">{{ l.vasAccountName }}</span></td>
                  <td>{{ l.side }}</td>
                  <td>{{ money(l.amountVnd) }}</td>
                  <td class="mono" style="font-size:0.72rem">{{ l.referenceType }} {{ l.referenceId }}</td>
                  <td>{{ formatDate(l.occurredAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <AllFieldsTable table="finance_journal_lines (CREATOR_PAYABLE) + finance_holds + finance_payouts" title="Balance (tất cả field)" :rows="ui.creatorBalance ? [ui.creatorBalance] : []" open />
        <AllFieldsTable table="finance_journals + finance_journal_lines" title="Earnings (tất cả field, gồm charges[])" :rows="ui.creatorEarnings" />
        <AllFieldsTable table="finance_journal_lines + finance_accounts" title="Statement (tất cả field)" :rows="ui.creatorStatement" />
      </section>

      <!-- STAGE 5: Creator Bank Account & Payout Request -->
      <section v-if="currentStage === 5" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">5</span>
            <div>
              <h2>Stage 5: Creator Bank Setup & Payout Request</h2>
              <p>Creator registers their verified bank account and requests a payout from available balance.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="handleGetCreatorBank" :disabled="!!ui.busy">Check Bank Account</button>
            <button class="success" @click="currentStage = 6">Next: Accounting Approval ➔</button>
          </div>
        </div>

        <div class="metrics-row" style="margin-bottom: 14px;">
          <div class="metric-card success">
            <span class="metric-label">Creator — Khả dụng</span>
            <span class="metric-value">{{ money(ui.creatorBalance?.available) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Đang chờ: {{ money((Number(ui.creatorBalance?.pendingSettlement || 0)) + Number(ui.creatorBalance?.pendingPayout || 0)) }} · Đã rút: {{ money(creatorPaidOut) }}</span>
            <button class="ghost" style="padding: 3px 8px; font-size: 0.72rem;" @click="handleRefreshCreatorFinance" :disabled="!!ui.busy">↻ Tải số dư</button>
          </div>
          <div class="metric-card">
            <span class="metric-label">Affiliate — Khả dụng</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.available) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Đang chờ: {{ money((Number(ui.affiliateBalance?.pendingSettlement || 0)) + Number(ui.affiliateBalance?.pendingPayout || 0)) }} · Đã rút: {{ money(affiliatePaidOut) }}</span>
            <button class="ghost" style="padding: 3px 8px; font-size: 0.72rem;" @click="handleRefreshAffiliateFinance" :disabled="!sessions.affiliate.accessToken || !!ui.busy">↻ Tải số dư</button>
          </div>
        </div>

        <div class="flow-grid">
          <!-- Bank Account Info / Form -->
          <div class="col-6">
            <div class="metric-card" style="gap: 12px;">
              <h3 style="font-size: 0.95rem;">Creator Bank Account <code class="tbl-tag">DB: user_bank_accounts</code></h3>
              <div v-if="ui.creatorBankAccount" class="fact-grid">
                <div class="fact-item">
                  <span class="label">Bank Name</span>
                  <span class="value">{{ ui.creatorBankAccount.bankName || ui.creatorBankAccount.bankShortName }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Account Number</span>
                  <span class="value">{{ ui.creatorBankAccount.accountNumber }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Beneficiary Name</span>
                  <span class="value">{{ ui.creatorBankAccount.accountName }}</span>
                </div>
                <div class="fact-item">
                  <span class="label">Status</span>
                  <span class="badge badge-succeeded">Active & Verified</span>
                </div>
              </div>

              <div v-else style="display: flex; flex-direction: column; gap: 10px;">
                <p class="muted" style="font-size: 0.82rem;">
                  Chưa có tài khoản ngân hàng. BE (TRUST-867) yêu cầu: PIN creator → email OTP → ghi kèm <code>X-Pin-Token</code> (BANK_ACCOUNT_CHANGE).
                </p>
                <div class="form-row">
                  <div class="form-group">
                    <label>PIN creator (6 số)</label>
                    <input v-model="sessions.creator.pin" maxlength="6" inputmode="numeric" />
                  </div>
                  <div class="form-group">
                    <label>Trạng thái PIN</label>
                    <span class="badge">{{ pinInfo.creatorStatus || '—' }}</span>
                  </div>
                </div>
                <div class="button-group">
                  <button class="secondary" @click="handleCreatorPinStatus" :disabled="!!ui.busy">Kiểm tra PIN</button>
                  <button class="secondary" @click="handleSetupCreatorPin" :disabled="!!ui.busy || !/^\d{6}$/.test(sessions.creator.pin || '')">Thiết lập PIN</button>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Ngân hàng (BIN 6 số)</label>
                    <select v-model="newBankForm.bankBin" @focus="!banks.length && handleLoadBanks()">
                      <option v-if="!banks.length" :value="newBankForm.bankBin">{{ newBankForm.bankBin }}</option>
                      <option v-for="b in banks" :key="b.bin || b.bankBin" :value="b.bin || b.bankBin">{{ b.shortName || b.bankShortName || b.name }} ({{ b.bin || b.bankBin }})</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Số tài khoản</label>
                    <input v-model="newBankForm.accountNumber" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Email OTP (dev/staging: 000000)</label>
                  <input v-model="newBankForm.otp" maxlength="6" />
                </div>
                <div class="button-group">
                  <button class="secondary" @click="handleRequestCreatorBankOtp" :disabled="!!ui.busy || !/^\d{6}$/.test(sessions.creator.pin || '')">Gửi email OTP</button>
                  <button class="secondary" @click="handleAddCreatorBank" :disabled="!!ui.busy || !/^\d{6}$/.test(sessions.creator.pin || '')">
                    Register Bank Account
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Payout Request Form -->
          <div class="col-6">
            <div class="metric-card highlight" style="gap: 12px;">
              <h3 style="font-size: 0.95rem;">Request Manual-Accounting Payout <code class="tbl-tag">DB: finance_payouts</code></h3>
              <div class="form-group">
                <label>Payout Amount (VND)</label>
                <div style="display: flex; gap: 6px;">
                  <input v-model="flow.payoutAmountVnd" inputmode="numeric" style="flex: 1;" />
                  <button class="secondary" type="button" @click="withdrawAll('creator')" :disabled="!ui.creatorBalance">Rút toàn bộ số dư</button>
                </div>
              </div>
              <div class="form-group">
                <label>Idempotency Key</label>
                <input v-model="flow.payoutIdempotencyKey" class="mono" />
              </div>
              <div class="callout warning" style="font-size: 0.78rem;">
                Amount must be &gt;= 10,000 VND and &lt;= Available Balance ({{ money(ui.creatorBalance?.available) }}).
                Creator payout cần PIN 6 số (<code>X-Pin-Token</code> reason PAYOUT, tự lấy từ PIN ở khung ngân hàng).
              </div>
              <button
                class="success"
                @click="handleRequestCreatorPayout"
                :disabled="!flow.payoutAmountVnd || !!ui.busy"
              >
                💸 Submit Payout Request
              </button>
            </div>
          </div>
        </div>
      <AllFieldsTable table="user_bank_accounts" title="Creator bank account (tất cả field)" :rows="ui.creatorBankAccount ? [ui.creatorBankAccount] : []" />
        <AllFieldsTable table="finance_payouts + finance_payout_allocations" title="Creator payouts (tất cả field)" :rows="ui.creatorPayouts" open />
      </section>

      <!-- STAGE 6: Accounting / Admin Payout Lifecycle -->
      <section v-if="currentStage === 6" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">6</span>
            <div>
              <h2>Stage 6: Accounting / Admin Payout Approval & Execution</h2>
              <p>Segregation of Duties: Approver reviews ➔ Executor claims & submits ➔ Reconciler succeeds.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="handleRefreshAdminPayouts" :disabled="!!ui.busy">Refresh Payouts</button>
            <button class="success" @click="currentStage = 7">Next: Ledger Integrity ➔</button>
          </div>
        </div>

        <div class="flow-grid">
          <div class="col-12">
            <div class="callout info" style="display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;">
              <div style="flex: 1 1 280px;">
                <strong>Step 0 — Treasury: VNPay clearing → company bank</strong>
                <div class="muted" style="font-size: 0.78rem;">
                  Approve checks company cash too. Record the VNPay settlement (maker = Approver, checker = Executor) for at least the payout amount first.
                </div>
              </div>
              <div class="form-group" style="margin: 0;">
                <label>Settled amount (VND)</label>
                <input v-model="treasuryForm.amountVnd" :placeholder="flow.payoutAmountVnd || 'e.g. 150000'" />
              </div>
              <button class="secondary" @click="handleSettleTreasury" :disabled="!!ui.busy || !sessions.approver.accessToken || !sessions.executor.accessToken">
                🏦 Record + Approve VNPay Settlement
              </button>
            </div>
          </div>

          <!-- Active Payout Status Bar -->
          <div class="col-12">
            <div class="fact-grid">
              <div class="fact-item">
                <span class="label">Target Payout ID</span>
                <span class="value">#{{ flow.payoutId || '-' }}</span>
              </div>
              <div class="fact-item">
                <span class="label">Current Status</span>
                <span class="badge" :class="statusBadgeClass(ui.adminPayoutDetail?.payout?.status || ui.adminPayoutDetail?.status)">
                  {{ ui.adminPayoutDetail?.payout?.status || ui.adminPayoutDetail?.status || 'REQUESTED' }}
                </span>
              </div>
              <div class="fact-item">
                <span class="label">Requested Amount</span>
                <span class="value" style="color: var(--success);">
                  {{ money(ui.adminPayoutDetail?.payout?.amountVnd || ui.adminPayoutDetail?.amountVnd || flow.payoutAmountVnd) }}
                </span>
              </div>
              <div class="fact-item">
                <span class="label">Party (Creator)</span>
                <span class="value">{{ ui.adminPayoutDetail?.payout?.partyId || ui.adminPayoutDetail?.partyId || 'Creator' }}</span>
              </div>
            </div>
          </div>

                    <div class="col-12">
            <PayoutApprovalStepper
              v-model:bank-reference="flow.bankReference"
              v-model:evidence-reference="flow.evidenceReference"
              v-model:evidence-source="flow.evidenceSource"
              :payout-id="flow.payoutId"
              :payout="ui.adminPayoutDetail?.payout || ui.adminPayoutDetail"
              :busy="!!ui.busy"
              :personas="{ approver: sessions.approver, executor: sessions.executor, reconciler: sessions.reconciler }"
              :step-lineages="ui.payoutStepLineages"
              :bank-details="ui.adminBankDetails"
              @approve="handleApprovePayout"
              @reject="handleRejectPayout"
              @claim="handleClaimProcessing"
              @view-bank="handleGetAdminBankDetails"
              @submit="handleSubmitToBank"
              @reconcile="handleSucceedPayout"
              @cancel="handleCancelPayout"
            />
          </div>
        </div>
      <AllFieldsTable table="finance_payouts + finance_payout_allocations" title="Admin payouts (tất cả field)" :rows="ui.adminPayouts" open />
      </section>

      <!-- STAGE 7: Double-Entry Ledger Inspector -->
      <section v-if="currentStage === 7" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">7</span>
            <div>
              <h2>Stage 7: Double-Entry Ledger Integrity & Journals</h2>
              <p>Auditing the immutable financial journals to verify zero-sum balance and correct account debit/credits.</p>
            </div>
          </div>
          <div class="button-group">
            <button class="primary" @click="currentStage = 9">
              👑 Membership & Ledger (Stage 9) ➔
            </button>
            <button class="secondary" @click="handleCheckLedger" :disabled="!!ui.busy">
              🔄 Re-Run Ledger Audit
            </button>
          </div>
        </div>

        <div class="flow-grid">
          <!-- Integrity Status -->
          <div class="col-12">
            <div class="metrics-row">
              <div class="metric-card" :class="ui.ledgerIntegrity?.healthy ? 'success' : 'danger'">
                <span class="metric-label">Ledger System Health</span>
                <span class="metric-value">{{ ui.ledgerIntegrity?.healthy ? 'HEALTHY' : 'UNHEALTHY' }}</span>
              </div>

              <div class="metric-card" :class="ui.ledgerIntegrity?.balanced ? 'success' : 'danger'">
                <span class="metric-label">Trial Balance Zero-Sum</span>
                <span class="metric-value">{{ ui.ledgerIntegrity?.balanced ? 'BALANCED' : 'IMBALANCED' }}</span>
              </div>

              <div class="metric-card">
                <span class="metric-label">Total Debits</span>
                <span class="metric-value">{{ money(ui.ledgerIntegrity?.totalDebits || ui.ledgerIntegrity?.totalDebitsVnd) }}</span>
              </div>

              <div class="metric-card">
                <span class="metric-label">Total Credits</span>
                <span class="metric-value">{{ money(ui.ledgerIntegrity?.totalCredits || ui.ledgerIntegrity?.totalCreditsVnd) }}</span>
              </div>

              <div
                class="metric-card"
                :class="ui.ledgerIntegrity?.membershipLedgerMismatchCount === 0 ? 'success' : 'warning'"
                style="border-left: 3px solid var(--primary);"
              >
                <span class="metric-label">Membership Mismatches</span>
                <span class="metric-value">{{ ui.ledgerIntegrity?.membershipLedgerMismatchCount ?? 0 }}</span>
              </div>

              <div
                v-for="c in INTEGRITY_COUNTERS"
                :key="c.key"
                class="metric-card"
                :class="ui.ledgerIntegrity?.[c.key] === 0 ? 'success' : (ui.ledgerIntegrity ? 'warning' : '')"
                style="border-left: 3px solid var(--primary);"
              >
                <span class="metric-label">{{ c.label }}</span>
                <span class="metric-value">{{ ui.ledgerIntegrity?.[c.key] ?? '—' }}</span>
                <span class="muted mono" style="font-size: 0.66rem;">{{ c.key }}</span>
              </div>
            </div>
          </div>

          <!-- Withholding Tax Export (preset, TRUST-913) -->
          <div class="col-12">
            <TaxExportPanel />
          </div>

          <!-- Recent Journals Table -->
          <div class="col-12">
            <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Recent Ledger Journal Entries <code class="tbl-tag">DB: finance_journals + finance_journal_lines + finance_accounts</code></h3>
            <div v-if="ui.financeJournals.length === 0" class="callout info">
              Click "Re-Run Ledger Audit" to fetch journals.
            </div>
            <div v-else class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Journal ID</th>
                    <th>Event Type / Key</th>
                    <th>Source</th>
                    <th>Dòng Dr / Cr (VAS)</th>
                    <th>ΣDr = ΣCr</th>
                    <th>Occurred At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="j in ui.financeJournals" :key="j.id">
                    <td><code>#{{ j.id }}</code></td>
                    <td><span class="client-id-tag">{{ j.eventType }}</span><div class="muted mono" style="font-size:0.66rem">{{ j.eventKey }}</div></td>
                    <td><code>{{ j.eventSourceType || j.sourceType }} {{ j.eventSourceId || j.sourceId || '-' }}</code></td>
                    <td>
                      <div v-for="(l, i) in (j.lines || [])" :key="i" class="mono" style="font-size:0.72rem">
                        {{ l.side === 'DEBIT' ? 'Dr' : 'Cr' }} {{ l.vasAccountCode }} <code>{{ l.accountCode }}</code> {{ money(l.amountVnd) }}
                        <span class="muted">{{ l.vasAccountName }}<template v-if="l.partyType"> · {{ l.partyType }}#{{ l.partyId }}</template></span>
                      </div>
                    </td>
                    <td>{{ journalBalanced(j) ? '✓' : '✗' }}</td>
                    <td>{{ formatDate(j.createdAt || j.occurredAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      <AllFieldsTable table="finance_journals + finance_journal_lines + finance_payouts + payment_orders (đối chiếu)" title="Ledger integrity (8 counters + balanced + healthy)" :rows="ui.ledgerIntegrity ? [ui.ledgerIntegrity] : []" open />
        <AllFieldsTable table="finance_journals + finance_journal_lines + finance_accounts" title="Journals (tất cả field, gồm lines[])" :rows="ui.financeJournals" />
      </section>

      <!-- STAGE 8: Affiliate (User B) -->
      <section v-if="currentStage === 8" class="col-12 panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="panel-step-badge">8</span>
            <div>
              <h2>Stage 8: Affiliate (User B) — Referral Share & Payout</h2>
              <p>B referred the buyer at signup. Each purchase credits B the listing's affiliate % of the gross price (seller-funded).</p>
            </div>
          </div>
          <div class="button-group">
            <button class="secondary" @click="handleCheckReferral" :disabled="!sessions.affiliate.accessToken || !!ui.busy">Check Referral</button>
            <button class="secondary" @click="handleRefreshAffiliateFinance" :disabled="!sessions.affiliate.accessToken || !!ui.busy">🔄 Refresh Affiliate Finance</button>
            <button class="secondary" @click="handleGetAffiliateBank" :disabled="!sessions.affiliate.accessToken || !!ui.busy">Check Bank Account</button>
          </div>
        </div>

        <div v-if="!sessions.affiliate.accessToken" class="callout warning">
          Sign in the <strong>Affiliate (User B)</strong> persona first ({{ sessions.affiliate.identifier }}, client <code>user</code>).
        </div>

        <div class="callout info" style="font-size: 0.8rem;">
          <strong>Setup (100% qua API, không seed):</strong> đăng ký Affiliate trước (Register via API), rồi đăng ký Buyer —
          Buyer dùng mã giới thiệu thật của Affiliate nên liên kết referral do API tạo. Tỷ lệ affiliate của listing và tài khoản ngân hàng của B
          phải có sẵn qua các API tương ứng của creator/B (không có script seed). Earnings rút được sau <code>PAYOUT_HOLDING_DAYS</code>.
        </div>

        <div class="flow-grid">
          <div class="col-6">
            <div class="metric-card" style="gap: 10px;">
              <h3 style="font-size: 0.95rem;">Referral Link</h3>
              <div class="fact-grid">
                <div class="fact-item"><span class="label">B's invitation code</span><span class="value mono">{{ ui.referralCode || '-' }}</span></div>
                <div class="fact-item"><span class="label">Users referred by B</span><span class="value">{{ ui.referredUsers.length }}</span></div>
                <div class="fact-item">
                  <span class="label">Buyer referred by B?</span>
                  <span class="badge" :class="buyerIsReferred ? 'badge-succeeded' : 'badge-failed'">{{ buyerIsReferred ? 'YES' : 'NO / unknown' }}</span>
                </div>
              </div>
              <div v-if="ui.referredUsers.length" class="muted" style="font-size: 0.75rem;">
                {{ ui.referredUsers.map((u) => `${u.username || u.fullName || u.userId} (#${u.userId})`).join(', ') }}
              </div>
            </div>
          </div>

          <div class="col-6">
            <div class="metric-card" style="gap: 10px;">
              <h3 style="font-size: 0.95rem;">Affiliate Bank Account <code class="tbl-tag">DB: user_bank_accounts</code></h3>
              <div v-if="ui.affiliateBankAccount" class="fact-grid">
                <div class="fact-item"><span class="label">Bank</span><span class="value">{{ ui.affiliateBankAccount.bankShortName || ui.affiliateBankAccount.bankName }}</span></div>
                <div class="fact-item"><span class="label">Account Number</span><span class="value">{{ ui.affiliateBankAccount.accountNumber }}</span></div>
                <div class="fact-item"><span class="label">Beneficiary</span><span class="value">{{ ui.affiliateBankAccount.accountName }}</span></div>
              </div>
              <div v-else class="muted" style="font-size: 0.8rem;">Click "Check Bank Account". Add one via the bank-account API (OTP) if missing.</div>
            </div>
          </div>
        </div>

        <div class="metrics-row" style="margin-top: 14px;">
          <div class="metric-card highlight">
            <span class="metric-label">Affiliate Payable</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.payable) }}</span>
            <span class="muted" style="font-size: 0.72rem;">AFFILIATE_PAYABLE balance</span>
          </div>
          <div class="metric-card success">
            <span class="metric-label">Available for Payout</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.available) }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Pending Settlement</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.pendingSettlement) }}</span>
            <span class="muted" style="font-size: 0.72rem;">Inside holding period</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Pending Payout</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.pendingPayout) }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">In-Transit</span>
            <span class="metric-value">{{ money(ui.affiliateBalance?.inTransit) }}</span>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Affiliate Commission Sources <code class="tbl-tag">DB: finance_journals + finance_journal_lines (AFFILIATE_PAYABLE) + cart_checkout_units</code></h3>
          <div v-if="ui.affiliateEarnings.length === 0" class="callout info">
            No commission yet. Buy a listing with an affiliate % as the referred buyer (Stage 2–3), then refresh.
          </div>
          <div v-else class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Product Type</th>
                  <th>Occurred At</th>
                  <th>Sale Gross</th>
                  <th>Share %</th>
                  <th>Commission</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in ui.affiliateEarnings" :key="item.earningId">
                  <td><span class="client-id-tag">{{ item.earningKind }}</span></td>
                  <td>{{ item.productType }}</td>
                  <td>{{ formatDate(item.occurredAt) }}</td>
                  <td>{{ money(item.grossAmountVnd) }}</td>
                  <td>{{ ((item.affiliateShareBps || 0) / 100).toFixed(2) }}%</td>
                  <td style="color: var(--success); font-weight: 700;">{{ money(item.netAmountVnd) }}</td>
                  <td>{{ money(item.remainingVnd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flow-grid" style="margin-top: 16px;">
          <div class="col-6">
            <div class="metric-card highlight" style="gap: 12px;">
              <h3 style="font-size: 0.95rem;">Request Affiliate Payout</h3>
              <div class="form-group">
                <label>Payout Amount (VND)</label>
                <input v-model="flow.affiliatePayoutAmountVnd" inputmode="numeric" />
              </div>
              <div class="callout warning" style="font-size: 0.78rem;">
                Must be &lt;= Available ({{ money(ui.affiliateBalance?.available) }}). After submit, approve / execute / reconcile it in Stage 6 (same 3-admin flow).
              </div>
              <button class="success" @click="handleRequestAffiliatePayout" :disabled="!flow.affiliatePayoutAmountVnd || !sessions.affiliate.accessToken || !!ui.busy">
                💸 Submit Affiliate Payout
              </button>
            </div>
          </div>
          <div class="col-6">
            <h3 style="font-size: 0.95rem; margin-bottom: 10px;">My Affiliate Payouts <code class="tbl-tag">DB: finance_payouts + finance_payout_allocations</code></h3>
            <div v-if="ui.affiliatePayouts.length === 0" class="muted" style="font-size: 0.8rem;">None yet.</div>
            <div v-else class="table-container">
              <table>
                <thead><tr><th>ID</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="p in ui.affiliatePayouts" :key="p.id">
                    <td><code>#{{ p.id }}</code></td>
                    <td>{{ money(p.amountVnd) }}</td>
                    <td><span class="badge" :class="statusBadgeClass(p.status)">{{ p.status }}</span></td>
                    <td>
                      <button class="ghost" style="padding: 2px 8px; font-size: 0.72rem;" @click="flow.payoutId = String(p.id); currentStage = 6; handleRefreshAdminPayouts()">Open in Stage 6</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      <AllFieldsTable table="finance_journal_lines (AFFILIATE_PAYABLE) + finance_holds + finance_payouts" title="Affiliate balance (tất cả field)" :rows="ui.affiliateBalance ? [ui.affiliateBalance] : []" open />
        <AllFieldsTable table="finance_journals + finance_journal_lines" title="Affiliate earnings (tất cả field)" :rows="ui.affiliateEarnings" />
        <AllFieldsTable table="finance_journal_lines + finance_accounts" title="Affiliate statement (tất cả field)" :rows="ui.affiliateStatement" />
        <AllFieldsTable table="finance_payouts + finance_payout_allocations" title="Affiliate payouts (tất cả field)" :rows="ui.affiliatePayouts" />
      </section>

      <!-- STAGE 9: Membership & Double-Entry Ledger (PR Feature) -->
      <section v-if="currentStage === 9" class="col-12 panel">
        <MembershipFlow />
      </section>

      <!-- STAGE 10: Voucher purchase, redemption, merchant payout, and ledger assertions -->
      <VoucherPayoutFlow v-if="currentStage === 10" />
    </main>

    <DataLineageInspector
      :lineages="ui.lineages"
      :can-load-ledger="!!ledgerSession"
      :loading-ledger="ui.loadingLedger"
      @load-ledger="(l) => loadLedger(l)"
    />

    <!-- 1-Click purchase confirmation -->
    <div v-if="ui.buyItem" class="modal-backdrop" @click.self="ui.buyItem = null">
      <div class="modal-box">
        <h3>Xác nhận mua — {{ ui.buyItem.title }}</h3>
        <div class="fact-grid">
          <div class="fact-item"><span class="label">Loại</span><span class="value">{{ ui.buyItem.kind }} #{{ ui.buyItem.id }}</span></div>
          <div class="fact-item"><span class="label">Người bán</span><span class="value">{{ ui.buyItem.owner }}</span></div>
          <div class="fact-item"><span class="label">Giá</span><span class="value" style="color: var(--success);">{{ vnd(ui.buyItem.price) }}</span></div>
          <div class="fact-item"><span class="label">Người mua</span><span class="value">{{ sessions.buyer.identifier }}</span></div>
        </div>
        <div v-if="buySplit" class="muted" style="font-size: 0.78rem;">
          Dự kiến chia: người bán {{ vnd(buySplit.net) }} · phí sàn {{ rates.feeBps / 100 }}% {{ vnd(buySplit.fee) }} · thuế {{ rates.taxBps / 100 }}% (VAT {{ rates.vatBps / 100 }}% + TNCN {{ rates.pitBps / 100 }}%) {{ vnd(buySplit.tax) }} <span class="muted">[{{ rates.source }}]</span>
          <span v-if="Number(buySplit.affiliate) > 0"> · affiliate {{ vnd(buySplit.affiliate) }}</span>
        </div>
        <label style="font-size: 0.82rem; display: flex; gap: 6px; align-items: center;">
          <input type="checkbox" v-model="flow.autoSettle" /> Tự giả lập VNPay IPN + nhận hàng
        </label>
        <div class="button-group">
          <button class="success" @click="confirmBuy" :disabled="!!ui.busy">✓ Xác nhận &amp; tạo đơn</button>
          <button class="ghost" @click="ui.buyItem = null">Huỷ</button>
        </div>
      </div>
    </div>

    <!-- Raw API Inspector Footer Drawer -->
    <section class="panel" style="margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 0.9rem; color: var(--text-muted);">
          🔍 Real-Time API Response Inspector
        </h3>
        <span v-if="ui.busy" style="color: var(--primary); font-size: 0.8rem;">
          Executing: {{ ui.busy }}...
        </span>
      </div>
      <pre class="code-block">{{ JSON.stringify(ui.rawResponse || { message: 'Awaiting actions...' }, null, 2) }}</pre>
    </section>

    <!-- Toast Notification -->
    <div v-if="ui.toast" class="toast-bar" :class="ui.toast.type">
      <span>{{ ui.toast.message }}</span>
    </div>
  </div>
</template>
