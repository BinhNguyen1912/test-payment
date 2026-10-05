<script setup>
import { computed, onMounted, reactive } from 'vue';
import {
  addBankAccount,
  approvePayout,
  approveTreasurySettlement,
  claimPayoutProcessing,
  confirmSmartOtpEnrollment,
  confirmVoucherRedemption,
  createVoucherRedemptionToken,
  getAdminPayoutBankDetails,
  getFinanceJournals,
  getLedgerIntegrity,
  getMerchantBalance,
  getMerchantEarnings,
  getMerchantStatement,
  getMyBankAccount,
  getPinStatus,
  getSmartOtpStatus,
  initSmartOtpEnrollment,
  issueSmartOtpChallenge,
  issueSmartOtpCode,
  listMarketplaceVouchers,
  listMerchantVoucherPackages,
  listMyVouchers,
  pollPaymentOrder,
  previewVoucherRedemption,
  purchaseVoucher,
  requestMerchantPayout,
  requestTreasurySettlement,
  requestVoucherRedemptionAuthorization,
  selectManagedAccount,
  sessions,
  setupPin,
  signIn,
  simulateVnpayIpn,
  submitPayoutToBank,
  succeedPayout,
  uuid,
  verifyPin,
} from './api.js';
import { generateDeviceKeyPair, signWithDeviceKey } from './crypto.js';

const STORE_KEY = 'voucher_payout_full_flow_v1';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

const saved = readSaved();
const state = reactive({
  busy: false,
  products: [],
  selectedProductId: saved.selectedProductId || '',
  paidDaysAgo: Number(saved.paidDaysAgo ?? 8),
  smartOtpPin: saved.smartOtpPin || '482915',
  merchantPin: saved.merchantPin || '482915',
  payoutAmountVnd: saved.payoutAmountVnd || '',
  orderId: '',
  txnRef: '',
  voucher: null,
  redemption: null,
  merchantBalance: null,
  merchantEarnings: [],
  merchantStatement: [],
  payout: null,
  bankDetails: null,
  integrity: null,
  journals: [],
  accountChecks: [],
  result: null,
  logs: [],
  error: '',
});

const smartDevice = reactive({
  deviceId: saved.smartDeviceId || `voucher-flow-${uuid()}`,
  publicKey: saved.publicKey || '',
  privateKeyBase64: saved.privateKeyBase64 || '',
  attestation: saved.attestation || `dev-attestation-${uuid()}`.padEnd(40, 'x'),
});

const selectedProduct = computed(() =>
  state.products.find((item) => String(item.id) === String(state.selectedProductId)),
);

function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    selectedProductId: state.selectedProductId,
    paidDaysAgo: state.paidDaysAgo,
    smartOtpPin: state.smartOtpPin,
    merchantPin: state.merchantPin,
    payoutAmountVnd: state.payoutAmountVnd,
    smartDeviceId: smartDevice.deviceId,
    publicKey: smartDevice.publicKey,
    privateKeyBase64: smartDevice.privateKeyBase64,
    attestation: smartDevice.attestation,
  }));
}

function items(response) {
  return response?.data?.items || response?.data || [];
}

function addLog(step, status, detail = '') {
  state.logs.push({ time: new Date().toLocaleTimeString('vi-VN'), step, status, detail });
}

function money(value) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : value} ₫`;
}

async function ensureSignedIn(session, { force = false } = {}) {
  if (force || !session.accessToken) {
        addLog(`login:${session.key}`, 'running', session.identifier);
    await signIn(session);
    addLog(`login:${session.key}`, 'ok', session.activeAccountUserId || session.profile?.id || '');
  }
  if (
    ['merchant', 'creator'].includes(session.clientId) &&
    !session.activeAccountUserId
  ) {
    addLog(`account-switch:${session.key}`, 'running', `select ${session.clientId} context`);
    await selectManagedAccount(session);
    addLog(`account-switch:${session.key}`, 'ok', `account #${session.activeAccountUserId}`);
  }
}

async function loadProducts() {
  state.error = '';
  await ensureSignedIn(sessions.buyer);
  const response = await listMarketplaceVouchers(sessions.buyer, { limit: 50 });
  state.products = items(response);
  if (!selectedProduct.value && state.products.length) {
    state.selectedProductId = String(state.products[0].id);
  }
  persist();
}

async function ensureSelectedMerchantProduct() {
  let response;
  try {
    response = await listMerchantVoucherPackages(sessions.merchant, { limit: 50 });
  } catch (error) {
    if (error.code !== 'SUB_ACCOUNT_CONTEXT_REQUIRED') throw error;
    await selectManagedAccount(sessions.merchant);
    response = await listMerchantVoucherPackages(sessions.merchant, { limit: 50 });
  }
  const ownedIds = new Set(
    items(response)
      .flatMap((voucherPackage) => voucherPackage.products || [])
      .filter(
        (product) =>
          product.status === 'ACTIVE' &&
          product.reviewStatus === 'APPROVED' &&
          product.publicationStatus === 'PUBLISHED',
      )
      .map((product) => String(product.id)),
  );
  if (ownedIds.has(String(state.selectedProductId))) return;
  const replacement = state.products.find((product) => ownedIds.has(String(product.id)));
  if (!replacement) {
    throw new Error(
      'The configured merchant does not own any currently buyable catalog voucher. Select/login the issuer merchant before running the flow.',
    );
  }
  state.selectedProductId = String(replacement.id);
  persist();
  addLog('merchant-product-scope', 'ok', `auto-selected owned product #${replacement.id}`);
}

async function ensureMerchantBankAccount() {
  try {
    const current = await getMyBankAccount(sessions.merchant);
    if (current.data?.id) {
      addLog('merchant-bank', 'ok', `reuse bank account #${current.data.id}`);
      return current.data;
    }
  } catch (error) {
    if (error.status !== 404 && error.code !== 'RESOURCE_NOT_FOUND') throw error;
  }

  const actingId = String(sessions.merchant.activeAccountUserId || sessions.merchant.profile?.id || '').replace(/\D/g, '');
  try {
    const created = await addBankAccount(sessions.merchant, {
      bank: '970436',
      account: actingId.padStart(10, '0').slice(-10),
      password: sessions.merchant.password,
      otp: '000000',
    });
    addLog('merchant-bank', 'ok', `provisioned local bank account #${created.data.id}`);
    return created.data;
  } catch (error) {
    if (error.code !== 'BANK_ACCOUNT_ALREADY_EXISTS') throw error;
    const current = await getMyBankAccount(sessions.merchant);
    addLog('merchant-bank', 'ok', `reuse bank account #${current.data.id}`);
    return current.data;
  }
}

async function ensureSmartOtpDevice() {
  const response = await getSmartOtpStatus(sessions.buyer);
  const status = response.data || {};
  if (status.deviceEnrolled) {
    if (
      status.device?.deviceId !== smartDevice.deviceId ||
      !smartDevice.privateKeyBase64
    ) {
      throw new Error(
        `Buyer already has Smart OTP device ${status.device?.deviceId || '(unknown)'}. ` +
        'This tester does not revoke an existing device automatically. Import/use the matching browser state or revoke it explicitly.',
      );
    }
    addLog('smart-otp-device', 'ok', `reuse ${smartDevice.deviceId}`);
    return;
  }

  if (status.pinConfigured) {
    state.smartOtpPin = state.smartOtpPin === '482916' ? '482915' : '482916';
    addLog('smart-otp-recovery', 'ok', 'rotated local test PIN for re-enrollment');
  }

  addLog('smart-otp-enroll', 'running', 'generate P-256 key and enroll test device');
  const pair = await generateDeviceKeyPair();
  smartDevice.publicKey = pair.publicKey;
  smartDevice.privateKeyBase64 = pair.privateKeyBase64;
  smartDevice.deviceId = `voucher-flow-${uuid()}`;
  const init = await initSmartOtpEnrollment(sessions.buyer, {
    password: sessions.buyer.password,
    deviceId: smartDevice.deviceId,
    platform: 'ios',
    publicKey: smartDevice.publicKey,
    keyAttestation: smartDevice.attestation,
    hardwareInfo: navigator.userAgent,
    integrity: {
      isRooted: false,
      isEmulator: false,
      isHooked: false,
      isDebuggerAttached: false,
      isAppTampered: false,
    },
  });
  const signature = await signWithDeviceKey(
    smartDevice.privateKeyBase64,
    init.data.challenge,
  );
  await confirmSmartOtpEnrollment(sessions.buyer, {
    enrollmentId: init.data.enrollmentId,
    signature,
    pin: state.smartOtpPin,
  });
  persist();
  addLog('smart-otp-enroll', 'ok', smartDevice.deviceId);
}

async function issueVoucherProof(publicId) {
  const authorization = await requestVoucherRedemptionAuthorization(sessions.buyer, publicId);
  const requestId = String(authorization.data.requestId);
  addLog('redemption-authorization', 'ok', `request #${requestId}`);
  const challenge = await issueSmartOtpChallenge(
    sessions.buyer,
    requestId,
    smartDevice.deviceId,
  );
  const signature = await signWithDeviceKey(
    smartDevice.privateKeyBase64,
    challenge.data.canonical,
  );
  const issued = await issueSmartOtpCode(sessions.buyer, requestId, {
    challengeId: challenge.data.challengeId,
    pin: state.smartOtpPin,
    signature,
  });
  return { requestId, code: issued.data.smartOtp };
}

async function readMerchantFinance() {
  const [earnings, statement] = await Promise.all([
    getMerchantEarnings(sessions.merchant, { limit: 50 }),
    getMerchantStatement(sessions.merchant, { limit: 50 }),
  ]);
  state.merchantEarnings = items(earnings);
  state.merchantStatement = items(statement);

  const pinStatus = await getPinStatus(sessions.merchant);
  if (pinStatus.data?.status === 'NOT_CONFIGURED') {
    await setupPin(
      sessions.merchant,
      sessions.merchant.password,
      state.merchantPin,
    );
  }
  const verified = await verifyPin(sessions.merchant, state.merchantPin, 'VIEW_BALANCE');
  const balance = await getMerchantBalance(sessions.merchant, verified.data.pinToken);
  state.merchantBalance = balance.data;
  if (!state.payoutAmountVnd && Number(balance.data?.available || 0) > 0) {
    state.payoutAmountVnd = String(balance.data.available);
  }
}

function hasLine(journal, accountCode, side) {
  return journal?.lines?.some((line) => line.accountCode === accountCode && line.side === side);
}

function verifyAccounts() {
  const capture = state.journals.find(
    (journal) => journal.eventType === 'PAYMENT_CAPTURED' && String(journal.sourceId) === state.orderId,
  );
  const recognition = state.journals.find(
    (journal) => journal.eventType === 'FULFILLMENT_RECOGNIZED' && String(journal.sourceId) === String(state.redemption?.redemptionId),
  );
  const reserved = state.journals.find(
    (journal) => journal.eventType === 'PAYOUT_RESERVED' && String(journal.sourceId) === String(state.payout?.id),
  );
  const succeeded = state.journals.find(
    (journal) => journal.eventType === 'PAYOUT_SUCCEEDED' && String(journal.sourceId) === String(state.payout?.id),
  );
  const checks = [
    {
      label: 'Payment capture',
      ok: hasLine(capture, 'VNPAY_CLEARING', 'DEBIT') && hasLine(capture, 'CUSTOMER_FUNDS_HELD', 'CREDIT'),
      expected: 'Dr VNPAY_CLEARING / Cr CUSTOMER_FUNDS_HELD',
    },
    {
      label: 'Voucher recognition',
      ok:
        hasLine(recognition, 'CUSTOMER_FUNDS_HELD', 'DEBIT') &&
        hasLine(recognition, 'MERCHANT_PAYABLE', 'CREDIT') &&
        hasLine(recognition, 'PLATFORM_COMMISSION_REVENUE', 'CREDIT') &&
        hasLine(recognition, 'TAX_WITHHOLDING_PAYABLE', 'CREDIT'),
      expected: 'Dr CUSTOMER_FUNDS_HELD / Cr MERCHANT_PAYABLE + commission + withholding tax',
    },
  ];
  if (state.payout?.id) {
    checks.push(
      {
        label: 'Payout reserve',
        ok: hasLine(reserved, 'MERCHANT_PAYABLE', 'DEBIT') && hasLine(reserved, 'PAYOUT_IN_TRANSIT', 'CREDIT'),
        expected: 'Dr MERCHANT_PAYABLE / Cr PAYOUT_IN_TRANSIT',
      },
      {
        label: 'Payout succeeded',
        ok: hasLine(succeeded, 'PAYOUT_IN_TRANSIT', 'DEBIT') && hasLine(succeeded, 'BANK_CASH', 'CREDIT'),
        expected: 'Dr PAYOUT_IN_TRANSIT / Cr BANK_CASH',
      },
    );
  }
  state.accountChecks = checks;
}

async function inspectLedger() {
  const integrityPromise = getLedgerIntegrity(sessions.approver);
  const collected = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const response = await getFinanceJournals(sessions.approver, { limit: 50, cursor });
    collected.push(...items(response));
    const captureFound = collected.some(
      (journal) => journal.eventType === 'PAYMENT_CAPTURED' && String(journal.sourceId) === state.orderId,
    );
    const recognitionFound = collected.some(
      (journal) =>
        journal.eventType === 'FULFILLMENT_RECOGNIZED' &&
        String(journal.sourceId) === String(state.redemption?.redemptionId),
    );
    const payoutFound = !state.payout?.id || collected.some(
      (journal) => journal.eventType === 'PAYOUT_SUCCEEDED' && String(journal.sourceId) === String(state.payout.id),
    );
    if ((captureFound && recognitionFound && payoutFound) || !response.meta?.hasMore) break;
    cursor = response.meta?.nextCursor;
    if (!cursor) break;
  }
  state.journals = collected;
  const integrity = await integrityPromise;
  state.integrity = integrity.data;
  verifyAccounts();
}

async function runFullFlow() {
  persist();
  state.busy = true;
  state.error = '';
  state.result = null;
  state.logs = [];
  state.accountChecks = [];
  try {
    for (const key of ['buyer', 'merchant', 'approver', 'executor', 'reconciler']) {
      await ensureSignedIn(sessions[key], { force: true });
    }
    await loadProducts();
    await ensureSelectedMerchantProduct();
    await ensureSmartOtpDevice();
    await ensureMerchantBankAccount();

    addLog('voucher-purchase', 'running', `product #${selectedProduct.value.id}`);
    const purchase = await purchaseVoucher(sessions.buyer, selectedProduct.value.id, {
      idempotencyKey: uuid(),
    });
    state.orderId = String(purchase.data.orderId);
    state.txnRef = purchase.data.txnRef;
    addLog('voucher-purchase', 'ok', `order #${state.orderId} / ${state.txnRef}`);

    addLog('vnpay-ipn', 'running', `signed local IPN, pay date -${state.paidDaysAgo} days`);
    const checkoutUrl = new URL(purchase.data.paymentUrl);
    const ipn = await simulateVnpayIpn({
      txnRef: state.txnRef,
      amountVnd: purchase.data.amountVnd,
      orderId: state.orderId,
      paidDaysAgo: state.paidDaysAgo,
      orderInfo: `Mua voucher TrustWow ${state.txnRef}`,
      tmnCode: checkoutUrl.searchParams.get('vnp_TmnCode') || undefined,
    });
    if (!ipn.success) throw new Error(`VNPay simulation failed: ${JSON.stringify(ipn.data)}`);
    const order = await pollPaymentOrder(sessions.buyer, state.txnRef);
    if (order.data?.fulfillmentStatus !== 'FULFILLED') {
      throw new Error(`Voucher payment is not fulfilled: ${order.data?.fulfillmentStatus || order.data?.status}`);
    }
    addLog('vnpay-ipn', 'ok', `${order.data.status} / ${order.data.fulfillmentStatus}`);

    const owned = await listMyVouchers(sessions.buyer, { status: 'ACTIVE', limit: 50 });
    state.voucher = items(owned)
      .filter((voucher) => String(voucher.productId) === String(selectedProduct.value.id))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    if (!state.voucher?.publicId) throw new Error('Purchased ACTIVE voucher was not found in buyer wallet.');
    addLog('buyer-wallet', 'ok', `voucher #${state.voucher.id}`);

    const proof = await issueVoucherProof(state.voucher.publicId);
    const token = await createVoucherRedemptionToken(sessions.buyer, state.voucher.publicId, proof);
    const preview = await previewVoucherRedemption(sessions.merchant, token.data.token);
    const minimum = Number(selectedProduct.value.applicability?.minOrderAmount || 0);
    const orderAmount = String(Math.max(Number(selectedProduct.value.faceValue || 0), minimum, 1));
    const eligibleItems = selectedProduct.value.applicability?.eligibleItems || [];
    const redemption = await confirmVoucherRedemption(
      sessions.merchant,
      preview.data.challengeId,
      {
        orderAmount,
        ...(eligibleItems.length ? { itemIds: [eligibleItems[0]] } : {}),
        provider: 'LOCAL_FULL_FLOW_TEST',
        providerRef: `voucher-${state.orderId}`,
        merchantOrderRef: `merchant-order-${uuid()}`,
      },
      `redeem-${uuid()}`,
    );
    state.redemption = redemption.data;
    addLog('voucher-redemption', 'ok', `redemption #${state.redemption.redemptionId}`);

    await readMerchantFinance();
    const available = Number(state.merchantBalance?.available || 0);
    addLog(
      'merchant-recognition',
      'ok',
      `payable ${money(state.merchantBalance?.payable)}; available ${money(available)}; pending settlement ${money(state.merchantBalance?.pendingSettlement)}`,
    );

    const requested = Number(state.payoutAmountVnd || available);
    if (!Number.isFinite(requested) || requested <= 0 || requested > available) {
      state.result = 'WAITING_T_PLUS_7';
      addLog(
        't+7-gate',
        'blocked',
        `Recognition occurs at redemption time, so the new earning is immutable and immature for T+7. ` +
          `Available now is ${money(available)}; no posted journal was backdated.`,
      );
      await inspectLedger();
      return;
    }

    const bank = await getMyBankAccount(sessions.merchant);
    if (!bank.data?.id) throw new Error('Merchant has no payout-ready bank account. Seed or verify one first.');
    const payoutPin = await verifyPin(sessions.merchant, state.merchantPin, 'PAYOUT');
    const payout = await requestMerchantPayout(sessions.merchant, {
      amountVnd: String(requested),
      idempotencyKey: `merchant-payout-${uuid()}`,
      pinToken: payoutPin.data.pinToken,
    });
    state.payout = payout.data;
    addLog('payout-request', 'ok', `payout #${state.payout.id} / ${money(requested)}`);

    const settlement = await requestTreasurySettlement(sessions.approver, {
      grossAmountVnd: String(purchase.data.amountVnd),
      gatewayFeeVnd: '0',
      externalReference: `VNP-${state.orderId}-${Date.now()}`,
      settledAt: new Date().toISOString(),
    });
    await approveTreasurySettlement(sessions.executor, settlement.data.id, {
      evidenceSource: 'BANK_STATEMENT',
      evidenceReference: `VNP-STMT-${state.orderId}-${Date.now()}`,
    });
    addLog('treasury-settlement', 'ok', `settlement #${settlement.data.id}`);

    await approvePayout(sessions.approver, state.payout.id);
    await claimPayoutProcessing(sessions.executor, state.payout.id);
    const bankDetails = await getAdminPayoutBankDetails(sessions.executor, state.payout.id);
    state.bankDetails = bankDetails.data;
    const bankReference = `FT-VOUCHER-${Date.now()}`;
    await submitPayoutToBank(sessions.executor, state.payout.id, bankReference);
    const succeeded = await succeedPayout(sessions.reconciler, state.payout.id, {
      externalReference: bankReference,
      evidenceSource: 'BANK_STATEMENT',
      evidenceReference: `STMT-VOUCHER-${Date.now()}`,
      bankOccurredAt: new Date().toISOString(),
      note: 'Reconciled successfully via voucher full-flow tester',
    });
    state.payout = succeeded.data;
    addLog('accounting-payout', 'ok', `payout #${state.payout.id} ${state.payout.status}`);

    await inspectLedger();
    const scopedLedgerPass =
      state.integrity?.balanced && state.accountChecks.every((check) => check.ok);
    state.result = scopedLedgerPass
      ? state.integrity.healthy
        ? 'PASS'
        : 'PASS_WITH_PREEXISTING_LEDGER_WARNINGS'
      : 'FAILED_LEDGER_ASSERTION';
  } catch (error) {
    state.error = `[${error.code || 'ERROR'}] ${error.message}`;
    addLog('flow', 'error', state.error);
  } finally {
    state.busy = false;
  }
}

onMounted(() => {
  loadProducts().catch((error) => {
    state.error = `[${error.code || 'ERROR'}] ${error.message}`;
  });
});
</script>

<template>
  <section id="voucher-full-flow" class="col-12 panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <span class="panel-step-badge">10</span>
        <div>
          <h2>Voucher → Merchant Recognition → Payout Full Flow</h2>
          <p>One-click local flow with Smart OTP, merchant redemption, accounting SoD, and ledger account assertions.</p>
        </div>
      </div>
      <div class="button-group">
        <button class="secondary" :disabled="state.busy" @click="loadProducts">Refresh vouchers</button>
        <button class="success" :disabled="state.busy" @click="runFullFlow">
          {{ state.busy ? 'Running full flow…' : '▶ Run full flow' }}
        </button>
      </div>
    </div>

    <div class="callout warning">
      <strong>Local full-flow mode:</strong>
      with backend <code>LOCAL_E2E_BYPASS_GATES=true</code> in development/test, payout holding is T+0, so the voucher earning becomes
      <code>available</code> immediately after redemption and the flow continues automatically through Accounting reconciliation.
      Production and staging always retain the configured T+7 policy.
    </div>

    <div class="callout danger" style="margin-top: 10px;">
      <strong>Security-policy gap detected:</strong>
      the tester obtains and sends a one-time <code>PAYOUT</code> PIN token, but the current merchant payout route does not declare
      <code>@RequirePin(PinTokenReason.Payout)</code>. Voucher merchant confirmation also has no PIN step-up contract, although the audit policy requires one.
      This screen does not bypass or patch that backend gap.
    </div>

    <div class="flow-grid" style="margin-top: 16px;">
      <div class="col-7">
        <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Voucher catalog</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>Select</th><th>Product</th><th>Issuer</th><th>Sale / Face</th><th>Supply</th></tr></thead>
            <tbody>
              <tr v-for="product in state.products" :key="product.id">
                <td><input v-model="state.selectedProductId" type="radio" :value="String(product.id)" @change="persist" /></td>
                <td><strong>{{ product.name }}</strong><br /><code>#{{ product.id }}</code></td>
                <td>{{ product.issuerName || product.issuerId }}</td>
                <td>{{ money(product.salePrice) }} / {{ money(product.faceValue) }}</td>
                <td>{{ product.remainingSupply ?? 'unlimited' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="col-5">
        <div class="metric-card highlight" style="gap: 10px;">
          <h3 style="font-size: 0.95rem;">Flow configuration</h3>
          <div class="form-row">
            <div class="form-group">
              <label>VNPay paid days ago</label>
              <input v-model.number="state.paidDaysAgo" type="number" min="0" max="90" @change="persist" />
            </div>
            <div class="form-group">
              <label>Buyer Smart OTP PIN</label>
              <input v-model="state.smartOtpPin" maxlength="6" @change="persist" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Merchant account PIN</label>
              <input v-model="state.merchantPin" maxlength="6" @change="persist" />
            </div>
            <div class="form-group">
              <label>Payout amount (blank = available)</label>
              <input v-model="state.payoutAmountVnd" inputmode="numeric" @change="persist" />
            </div>
          </div>
          <div class="muted" style="font-size: 0.75rem;">
            Buyer: <code>{{ sessions.buyer.identifier }}</code><br />
            Merchant: <code>{{ sessions.merchant.identifier }}</code><br />
            Smart OTP device: <code>{{ smartDevice.deviceId }}</code>
          </div>
        </div>
      </div>
    </div>

    <div v-if="state.error" class="callout danger" style="margin-top: 16px;">{{ state.error }}</div>
    <div v-if="state.result" class="callout" :class="state.result.startsWith('PASS') ? 'success' : 'warning'" style="margin-top: 16px;">
      Result: <strong>{{ state.result }}</strong>
    </div>

    <div class="flow-grid" style="margin-top: 16px;">
      <div class="col-6">
        <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Execution log</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>Time</th><th>Step</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              <tr v-for="(entry, index) in state.logs" :key="`${entry.step}-${index}`">
                <td>{{ entry.time }}</td><td><code>{{ entry.step }}</code></td>
                <td><span class="badge" :class="entry.status === 'ok' ? 'badge-succeeded' : entry.status === 'error' || entry.status === 'blocked' ? 'badge-failed' : 'badge-pending'">{{ entry.status }}</span></td>
                <td>{{ entry.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="col-6">
        <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Ledger assertions</h3>
        <div class="fact-grid">
          <div class="fact-item"><span class="label">Order</span><span class="value">#{{ state.orderId || '-' }}</span></div>
          <div class="fact-item"><span class="label">Voucher</span><span class="value">#{{ state.voucher?.id || '-' }}</span></div>
          <div class="fact-item"><span class="label">Redemption</span><span class="value">#{{ state.redemption?.redemptionId || '-' }}</span></div>
          <div class="fact-item"><span class="label">Payout</span><span class="value">#{{ state.payout?.id || '-' }} {{ state.payout?.status || '' }}</span></div>
          <div class="fact-item"><span class="label">Available</span><span class="value">{{ money(state.merchantBalance?.available) }}</span></div>
          <div class="fact-item"><span class="label">Pending T+7</span><span class="value">{{ money(state.merchantBalance?.pendingSettlement) }}</span></div>
        </div>
        <div v-for="check in state.accountChecks" :key="check.label" class="callout" :class="check.ok ? 'success' : 'danger'" style="margin-top: 8px; font-size: 0.78rem;">
          <strong>{{ check.ok ? '✓' : '✕' }} {{ check.label }}</strong> — {{ check.expected }}
        </div>
        <div v-if="state.integrity" class="callout" :class="state.integrity.healthy ? 'success' : 'danger'" style="margin-top: 8px;">
          Ledger {{ state.integrity.healthy ? 'HEALTHY' : 'UNHEALTHY' }} — debits {{ money(state.integrity.totalDebits) }}, credits {{ money(state.integrity.totalCredits) }}
          <template v-if="!state.integrity.healthy">
            — existing mismatches: payment {{ state.integrity.paymentLedgerMismatchCount }},
            earning {{ state.integrity.earningLedgerMismatchCount }},
            membership {{ state.integrity.membershipLedgerMismatchCount }}.
            The scoped order/redemption/payout assertions above remain authoritative for this run.
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
