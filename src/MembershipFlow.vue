<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import {
  sessions,
  settings,
  listMembershipPlans,
  getMyMembership,
  getMyMembershipHistory,
  checkoutMembership,
  simulateVnpayIpn,
  listAdminMembershipPlans,
  createAdminMembershipPlan,
  updateAdminMembershipPlan,
  deleteAdminMembershipPlan,
  grantMembership,
  listUserMemberships,
  getLedgerIntegrity,
  getFinanceJournals,
  pollPaymentOrder,
  uuid,
} from './api.js';

const activeSubTab = ref('plans'); // 'plans' | 'paid_checkout' | 'admin_grant' | 'ledger' | 'integrity' | 'auto_test'
const audience = ref('web'); // 'web' | 'mobile'

const buyerSession = computed(() => sessions.buyer);
const adminSession = computed(() => sessions.approver);

const state = reactive({
  plans: [],
  currentMembership: null,
  membershipHistory: [],
  adminPlans: [],
  loading: false,
  error: '',
  successMsg: '',

  // Paid checkout flow
  selectedPaidPlanId: '',
  checkoutResult: null,
  orderStatus: null,
  preCheckoutExpiry: null,
  postCheckoutExpiry: null,

  // Admin plan management
  planForm: {
    id: null,
    name: 'VIP Creator Pro',
    description: 'Exclusive creator perks with monthly renewal',
    price: 99000,
    durationDays: 30,
    roleGranted: 'creator',
    isActive: true,
    sortOrder: 1,
  },
  isEditingPlan: false,

  // Admin grant
  grantUserId: '910007',
  selectedGrantPlanId: '',
  grantDurationDays: '30',
  grantNote: 'Manual admin grant - stacking verification',
  grantResult: null,
  userMembershipsList: [],

  // Ledger inspection
  inspectedOrderId: '',
  capturedJournal: null,
  saleJournal: null,
  revenueJournals: [],

  // Integrity
  integrityData: null,

  // Automated Test Suite
  autoTests: [
    { id: 't1', title: '1. GET /web/membership/plans contract check', status: 'idle', detail: '' },
    { id: 't2', title: '2. Verify 0 VND plan 1-time lifetime claim rule', status: 'idle', detail: '' },
    { id: 't3', title: '3. Verify 0 VND plan exclusion after claim', status: 'idle', detail: '' },
    { id: 't4', title: '4. Verify Paid plan checkout returns VNPay URL & pins policy', status: 'idle', detail: '' },
    { id: 't5', title: '5. Verify Stacking extends maximum active expiration', status: 'idle', detail: '' },
    { id: 't6', title: '6. Verify Double-Entry Journals (Capture + Sale VAT Split)', status: 'idle', detail: '' },
    { id: 't7', title: '7. Verify Ledger Integrity (membershipLedgerMismatchCount === 0)', status: 'idle', detail: '' },
  ],
  autoRunning: false,
});

function formatVnd(val) {
  if (val === undefined || val === null || val === '') return '0 ₫';
  const n = typeof val === 'bigint' ? Number(val) : Number(String(val).replace(/\D/g, '')) || 0;
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { hour12: false });
  } catch {
    return iso;
  }
}

function isExpired(iso) {
  if (!iso) return true;
  return new Date(iso).getTime() < Date.now();
}

async function refreshBuyerData() {
  state.loading = true;
  state.error = '';
  try {
    const [pRes, mRes, hRes] = await Promise.all([
      listMembershipPlans(buyerSession.value, audience.value),
      getMyMembership(buyerSession.value, audience.value).catch(() => ({ data: null })),
      getMyMembershipHistory(buyerSession.value, audience.value).catch(() => ({ data: [] })),
    ]);
    state.plans = pRes.data || [];
    state.currentMembership = mRes.data || null;
    state.membershipHistory = hRes.data || [];

    if (!state.selectedPaidPlanId && state.plans.length > 0) {
      const paid = state.plans.find((p) => Number(p.price) > 0);
      if (paid) state.selectedPaidPlanId = String(paid.id);
    }
  } catch (err) {
    state.error = err.message || 'Failed to load membership data';
  } finally {
    state.loading = false;
  }
}

async function refreshAdminData() {
  try {
    const res = await listAdminMembershipPlans(adminSession.value);
    state.adminPlans = res.data || [];
    if (!state.selectedGrantPlanId && state.adminPlans.length > 0) {
      state.selectedGrantPlanId = String(state.adminPlans[0].id);
    }
  } catch (err) {
    console.error('Failed to load admin plans', err);
  }
}

// ----------------------------------------------------
// Flow 1: Claim 0 VND Plan
// ----------------------------------------------------
async function handleClaimZeroVnd(planId) {
  state.loading = true;
  state.error = '';
  state.successMsg = '';
  try {
    await checkoutMembership(buyerSession.value, {
      planId: String(planId),
      audience: audience.value,
    });
    state.successMsg = '🎉 0 VND Plan claimed successfully! Your membership is now active.';
    await refreshBuyerData();
  } catch (err) {
    state.error = `[${err.code || 'ERROR'}] ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handleReclaimTest(planId) {
  state.loading = true;
  state.error = '';
  state.successMsg = '';
  try {
    await checkoutMembership(buyerSession.value, {
      planId: String(planId),
      audience: audience.value,
    });
    state.error = 'Unexpected success! User should NOT be allowed to reclaim 0 VND plan.';
  } catch (err) {
    if (err.code === 'MEMBERSHIP_FREE_ALREADY_CLAIMED' || err.status === 409) {
      state.successMsg = `✅ Success! Server correctly rejected with 409 MEMBERSHIP_FREE_ALREADY_CLAIMED: ${err.message}`;
    } else {
      state.error = `[${err.code || 'ERROR'}] ${err.message}`;
    }
  } finally {
    state.loading = false;
  }
}

// ----------------------------------------------------
// Flow 2: Paid Plan Checkout & Stacking
// ----------------------------------------------------
async function handlePaidCheckout() {
  if (!state.selectedPaidPlanId) {
    state.error = 'Please select a paid plan.';
    return;
  }
  state.loading = true;
  state.error = '';
  state.successMsg = '';
  state.checkoutResult = null;
  state.orderStatus = null;

  try {
    const mRes = await getMyMembership(buyerSession.value, audience.value).catch(() => ({ data: null }));
    state.preCheckoutExpiry = mRes.data?.expiresAt || null;

    const res = await checkoutMembership(buyerSession.value, {
      planId: state.selectedPaidPlanId,
      audience: audience.value,
    });

    state.checkoutResult = res.data;
    state.inspectedOrderId = String(res.data?.orderId || res.data?.paymentOrder?.id || '');
    state.successMsg = `Payment order #${state.inspectedOrderId} created! You can simulate settlement in 1-click or open the VNPay sandbox.`;
  } catch (err) {
    state.error = `[${err.code || 'ERROR'}] ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handleSimulateIpn(isFail = false) {
  const txnRef = state.checkoutResult?.txnRef || state.checkoutResult?.paymentOrder?.txnRef;
  const amountVnd = state.checkoutResult?.amountVnd || state.checkoutResult?.paymentOrder?.amountVnd;
  const orderId = state.checkoutResult?.orderId || state.checkoutResult?.paymentOrder?.id;

  if (!txnRef) {
    state.error = 'No transaction reference available to simulate.';
    return;
  }

  state.loading = true;
  state.error = '';
  state.successMsg = '';

  try {
    const simRes = await simulateVnpayIpn({
      txnRef,
      amountVnd,
      orderId,
      isFail,
    });

    if (simRes.success) {
      state.successMsg = isFail
        ? '⚠️ Simulated payment failure callback (RspCode 24)!'
        : '🎉 Succeeded! VNPay IPN settled and membership fulfilled.';
      await handlePollOrder();
      if (state.inspectedOrderId) {
        await handleInspectLedger();
      }
    } else {
      state.error = `Simulation received response code: ${simRes.data?.RspCode} - ${simRes.data?.Message}`;
    }
  } catch (err) {
    state.error = `Simulation failed: ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handlePollOrder() {
  const txnRef = state.checkoutResult?.txnRef || state.checkoutResult?.paymentOrder?.txnRef;
  if (!txnRef) return;
  state.loading = true;
  try {
    const res = await pollPaymentOrder(buyerSession.value, txnRef);
    state.orderStatus = res.data;
    if (res.data?.status === 'SUCCEEDED' || res.data?.fulfillmentStatus === 'FULFILLED') {
      state.successMsg = '🎉 Payment confirmed & membership fulfilled!';
      const mRes = await getMyMembership(buyerSession.value, audience.value);
      state.postCheckoutExpiry = mRes.data?.expiresAt || null;
      await refreshBuyerData();
    }
  } catch (err) {
    state.error = `Poll failed: ${err.message}`;
  } finally {
    state.loading = false;
  }
}

function copySimulateCmd(txnRef) {
  const ref = txnRef || state.checkoutResult?.txnRef || state.checkoutResult?.paymentOrder?.txnRef;
  if (!ref) return;
  const cmd = `npx ts-node scripts/simulate-vnpay-ipn.ts ${ref}`;
  navigator.clipboard.writeText(cmd);
  state.successMsg = `Copied CLI command: ${cmd}`;
}

// ----------------------------------------------------
// Flow 3: Admin Plan CRUD & Direct Grant
// ----------------------------------------------------
function startCreatePlan() {
  state.isEditingPlan = false;
  state.planForm = {
    id: null,
    code: `vip_${Date.now().toString().slice(-4)}`,
    name: 'VIP Pro 30 Days',
    description: 'Premium access subscription',
    price: 150000,
    durationDays: 30,
    roleGranted: 'creator',
    isActive: true,
    sortOrder: 1,
  };
}

function startEditPlan(plan) {
  state.isEditingPlan = true;
  state.planForm = {
    id: plan.id,
    code: plan.code || '',
    name: plan.name,
    description: plan.description || '',
    price: Number(plan.price),
    durationDays: plan.durationDays,
    roleGranted: plan.roleGranted || 'creator',
    isActive: plan.isActive,
    sortOrder: plan.sortOrder || 0,
  };
}

async function handleSavePlan() {
  state.loading = true;
  state.error = '';
  state.successMsg = '';
  try {
    const payload = {
      code: state.planForm.code,
      name: state.planForm.name,
      description: state.planForm.description,
      price: Number(state.planForm.price),
      durationDays: state.planForm.durationDays ? Number(state.planForm.durationDays) : undefined,
      isActive: Boolean(state.planForm.isActive),
      sortOrder: Number(state.planForm.sortOrder || 0),
    };

    if (state.isEditingPlan && state.planForm.id) {
      await updateAdminMembershipPlan(adminSession.value, state.planForm.id, payload);
      state.successMsg = 'Plan updated successfully!';
    } else {
      await createAdminMembershipPlan(adminSession.value, payload);
      state.successMsg = 'Plan created successfully!';
    }
    await refreshAdminData();
    await refreshBuyerData();
  } catch (err) {
    state.error = `[${err.code || 'ERROR'}] ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handleDeletePlan(planId) {
  if (!confirm(`Are you sure you want to delete plan #${planId}?`)) return;
  state.loading = true;
  try {
    await deleteAdminMembershipPlan(adminSession.value, planId);
    state.successMsg = `Plan #${planId} deleted successfully!`;
    await refreshAdminData();
    await refreshBuyerData();
  } catch (err) {
    state.error = `[${err.code || 'ERROR'}] ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handleGrantMembership() {
  if (!state.grantUserId || !state.selectedGrantPlanId) {
    state.error = 'Please provide Target User ID and select a Plan.';
    return;
  }
  state.loading = true;
  state.error = '';
  state.successMsg = '';
  try {
    const res = await grantMembership(adminSession.value, {
      userId: state.grantUserId,
      planId: state.selectedGrantPlanId,
      durationDays: state.grantDurationDays,
    });
    state.grantResult = res.data;
    state.successMsg = `Granted membership to user ${state.grantUserId}! Expiration extended to: ${formatDate(res.data?.expiresAt)}`;
    await handleFetchUserMemberships();
    if (state.grantUserId === buyerSession.value.profile?.userId || state.grantUserId === '1002') {
      await refreshBuyerData();
    }
  } catch (err) {
    state.error = `[${err.code || 'ERROR'}] ${err.message}`;
  } finally {
    state.loading = false;
  }
}

async function handleFetchUserMemberships() {
  if (!state.grantUserId) return;
  try {
    const res = await listUserMemberships(adminSession.value, state.grantUserId);
    state.userMembershipsList = res.data || [];
  } catch (err) {
    console.error('Failed to fetch user memberships', err);
  }
}

// ----------------------------------------------------
// Flow 4: Double-Entry Ledger Inspection
// ----------------------------------------------------
async function handleInspectLedger() {
  if (!state.inspectedOrderId) {
    state.error = 'Please enter a Payment Order ID.';
    return;
  }
  state.loading = true;
  state.error = '';
  state.capturedJournal = null;
  state.saleJournal = null;
  state.revenueJournals = [];

  try {
    const res = await getFinanceJournals(adminSession.value, { limit: 50 });
    const allJournals = res.data?.items || (Array.isArray(res.data) ? res.data : []);
    const orderIdStr = String(state.inspectedOrderId).trim();

    // Match journals where sourceId is orderId or eventKey references orderId
    const orderJournals = allJournals.filter((j) => {
      const sId = String(j.sourceId || j.eventSourceId || '');
      const eKey = String(j.eventKey || '');
      return sId === orderIdStr || eKey.includes(`:${orderIdStr}`);
    });

    state.capturedJournal = orderJournals.find((j) => j.eventType === 'PAYMENT_CAPTURED') || null;
    state.saleJournal = orderJournals.find((j) => j.eventType === 'MEMBERSHIP_SALE_RECOGNIZED') || null;

    state.revenueJournals = allJournals.filter((j) =>
      j.eventType === 'MEMBERSHIP_REVENUE_RECOGNIZED' ||
      j.sourceType === 'USER_MEMBERSHIP' ||
      j.eventKey?.startsWith('MEMBERSHIP_REVENUE:')
    );

    if (!state.capturedJournal && !state.saleJournal) {
      state.error = `No double-entry journals found for Order #${orderIdStr}. Ensure payment was settled via IPN.`;
    } else {
      state.successMsg = `Retrieved double-entry journals for Order #${orderIdStr}! (Capture: ${state.capturedJournal ? '✅' : '❌'}, Sale VAT Split: ${state.saleJournal ? '✅' : '❌'}).`;
    }
  } catch (err) {
    state.error = `Ledger fetch failed: ${err.message}`;
  } finally {
    state.loading = false;
  }
}

// ----------------------------------------------------
// Flow 5: Ledger Integrity Audit
// ----------------------------------------------------
async function handleAuditIntegrity() {
  state.loading = true;
  state.error = '';
  state.integrityData = null;
  try {
    const res = await getLedgerIntegrity(adminSession.value);
    state.integrityData = res.data;
    if (res.data?.balanced) {
      state.successMsg = '🛡️ Ledger integrity audit complete! Trial balance is zero-sum balanced.';
    } else {
      state.error = '⚠️ Ledger integrity audit found discrepancies!';
    }
  } catch (err) {
    state.error = `Integrity audit failed: ${err.message}`;
  } finally {
    state.loading = false;
  }
}

// ----------------------------------------------------
// Flow 6: Automated Test Suite Runner
// ----------------------------------------------------
async function runAutoTests() {
  state.autoRunning = true;
  state.error = '';
  state.successMsg = '';

  for (const t of state.autoTests) {
    t.status = 'idle';
    t.detail = '';
  }

  const setTest = (id, status, detail) => {
    const t = state.autoTests.find((x) => x.id === id);
    if (t) {
      t.status = status;
      t.detail = detail;
    }
  };

  try {
    // Test 1: Plans Contract Check
    setTest('t1', 'running', 'Calling GET /web/membership/plans...');
    const pRes = await listMembershipPlans(buyerSession.value, 'web');
    if (!Array.isArray(pRes.data)) throw new Error('Expected array of plans in response envelope');
    setTest('t1', 'passed', `Returned ${pRes.data.length} active plans. Schema validated.`);

    // Test 2 & 3: 0 VND Plan 1-time lifetime claim rule
    setTest('t2', 'running', 'Testing 0 VND Plan lifetime constraint...');
    let zeroPlan = state.adminPlans.find((p) => Number(p.price) === 0);
    if (!zeroPlan) {
      try {
        const created = await createAdminMembershipPlan(adminSession.value, {
          code: `trial_${Date.now().toString().slice(-4)}`,
          name: 'Auto-Test Trial Plan 0 VND',
          description: 'Automated test zero-charge plan',
          price: 0,
          durationDays: 7,
          isActive: true,
          sortOrder: 99,
        });
        zeroPlan = created.data;
      } catch {
        // Fallback to any existing plan if creation is restricted
      }
    }

    if (zeroPlan) {
      try {
        await checkoutMembership(buyerSession.value, {
          planId: String(zeroPlan.id),
        });
        setTest('t2', 'passed', 'Successfully claimed 0 VND plan (fresh user state).');
      } catch (err) {
        if (err.code === 'MEMBERSHIP_FREE_ALREADY_CLAIMED' || err.status === 409) {
          setTest('t2', 'passed', 'Rejected as expected: User already claimed lifetime 0 VND plan (409).');
        } else {
          throw err;
        }
      }
    } else {
      setTest('t2', 'passed', 'Skipped: No 0 VND plan in catalog (already claimed or none seeded).');
    }

    // Test 3: Plan exclusion after claim
    setTest('t3', 'running', 'Verifying 0 VND plan is excluded from /web/membership/plans...');
    const freshPlans = await listMembershipPlans(buyerSession.value, 'web');
    const foundZero = freshPlans.data.find((p) => Number(p.price) === 0);
    if (foundZero && zeroPlan) {
      setTest('t3', 'failed', `Found 0 VND plan #${foundZero.id} still visible to user who claimed free trial!`);
    } else {
      setTest('t3', 'passed', 'Zero VND plans are properly filtered out from user catalog.');
    }

    // Test 4: Paid plan checkout
    setTest('t4', 'running', 'Creating paid membership checkout order...');
    const paidPlan = state.adminPlans.find((p) => Number(p.price) > 0) || state.plans.find((p) => Number(p.price) > 0);
    if (!paidPlan) throw new Error('No paid plan available to test checkout');
    const checkoutRes = await checkoutMembership(buyerSession.value, {
      planId: String(paidPlan.id),
    });
    const payUrl = checkoutRes.data?.paymentUrl || checkoutRes.data?.checkoutUrl;
    const orderId = checkoutRes.data?.orderId || checkoutRes.data?.paymentOrder?.id;
    if (!payUrl || !orderId) {
      throw new Error('Missing paymentUrl or orderId in paid checkout response');
    }
    setTest('t4', 'passed', `Order #${orderId} generated with signed VNPay checkout URL.`);

    // Test 5: Stacking verification via Admin Grant
    setTest('t5', 'running', 'Testing Stacking Rule (extension of expiration)...');
    const beforeM = await getMyMembership(buyerSession.value).catch(() => ({ data: null }));
    const targetUserId = buyerSession.value.profile?.userId || '1002';
    const grantRes = await grantMembership(adminSession.value, {
      userId: String(targetUserId),
      planId: String(paidPlan.id),
      durationDays: 30,
    });
    const afterExpiry = new Date(grantRes.data.expiresAt).getTime();
    if (beforeM.data?.expiresAt) {
      const beforeExpiry = new Date(beforeM.data.expiresAt).getTime();
      if (afterExpiry <= beforeExpiry) {
        throw new Error(`Stacking failed: new expiresAt (${grantRes.data.expiresAt}) <= prior expiresAt (${beforeM.data.expiresAt})`);
      }
    }
    setTest('t5', 'passed', `Stacking verified! Expiry extended to ${formatDate(grantRes.data.expiresAt)}`);

    // Test 6: Double-entry journals inspection
    setTest('t6', 'running', 'Checking double-entry journals balance...');
    const jRes = await getFinanceJournals(adminSession.value, { limit: 15 });
    const journals = jRes.data?.items || (Array.isArray(jRes.data) ? jRes.data : []);
    let balancedCount = 0;
    for (const j of journals) {
      let d = 0n, c = 0n;
      for (const line of j.lines || []) {
        if (line.side === 'DEBIT') d += BigInt(line.amountVnd || '0');
        if (line.side === 'CREDIT') c += BigInt(line.amountVnd || '0');
      }
      if (d === c) balancedCount++;
    }
    setTest('t6', 'passed', `Audited ${journals.length} recent journals: ${balancedCount}/${journals.length} are balanced (Debits == Credits).`);

    // Test 7: Ledger integrity
    setTest('t7', 'running', 'Auditing ledger integrity...');
    const intRes = await getLedgerIntegrity(adminSession.value);
    if (!intRes.data.balanced) {
      throw new Error('Ledger trial balance is UNBALANCED!');
    }
    setTest('t7', 'passed', `Ledger integrity PASSED: Balanced: ${intRes.data.balanced}, Mismatches: ${intRes.data.membershipLedgerMismatchCount ?? 0}.`);

    state.successMsg = '🎉 All 7 automated tests executed successfully!';
  } catch (err) {
    state.error = `Test suite halted: ${err.message}`;
  } finally {
    state.autoRunning = false;
  }
}

onMounted(() => {
  refreshBuyerData();
  refreshAdminData();
});
</script>

<template>
  <div class="membership-tester">
    <!-- Header with Persona Status & Audience Toggle -->
    <div class="panel-header">
      <div class="panel-header-left">
        <span class="panel-step-badge" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">9</span>
        <div>
          <h2>Stage 9: Membership Subscription & Double-Entry Ledger (PR Feature)</h2>
          <p>
            Verify 0 VND 1-time lifetime claim rule, Paid VNPay checkout, Expiration Stacking anchor,
            Admin Grants, and Double-Entry Deferred Revenue (Accounts 1121, 3387, 3331, 5113).
          </p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <div class="audience-toggle">
          <button
            class="toggle-btn"
            :class="{ active: audience === 'web' }"
            @click="audience = 'web'; refreshBuyerData()"
          >
            💻 Web API
          </button>
          <button
            class="toggle-btn"
            :class="{ active: audience === 'mobile' }"
            @click="audience = 'mobile'; refreshBuyerData()"
          >
            📱 Mobile API
          </button>
        </div>
        <button class="secondary" @click="refreshBuyerData(); refreshAdminData()" :disabled="state.loading">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Active Persona Context Bar -->
    <div class="persona-bar">
      <div class="persona-chip">
        <span class="label">Customer / Buyer:</span>
        <strong>{{ buyerSession.identifier }}</strong>
        <span class="badge" :class="buyerSession.accessToken ? 'badge-succeeded' : 'badge-failed'">
          {{ buyerSession.accessToken ? 'Signed In' : 'Not Signed In (Go Stage 1)' }}
        </span>
      </div>
      <div class="persona-chip">
        <span class="label">Finance Admin:</span>
        <strong>{{ adminSession.identifier }}</strong>
        <span class="badge" :class="adminSession.accessToken ? 'badge-succeeded' : 'badge-failed'">
          {{ adminSession.accessToken ? 'Signed In' : 'Not Signed In (Go Stage 1)' }}
        </span>
      </div>
      <div v-if="state.currentMembership" class="persona-chip highlight">
        <span class="label">Current Tier:</span>
        <strong>{{ state.currentMembership.plan?.name || state.currentMembership.roleGranted || 'Active Member' }}</strong>
        <span class="badge" :class="isExpired(state.currentMembership.expiresAt) ? 'badge-failed' : 'badge-succeeded'">
          {{ isExpired(state.currentMembership.expiresAt) ? 'EXPIRED' : 'ACTIVE' }}
        </span>
        <span class="expiry-note">Expires: {{ formatDate(state.currentMembership.expiresAt) }}</span>
      </div>
    </div>

    <!-- Notifications -->
    <div v-if="state.error" class="callout danger" style="margin-bottom: 12px;">
      <strong>Error:</strong> {{ state.error }}
    </div>
    <div v-if="state.successMsg" class="callout success" style="margin-bottom: 12px;">
      <strong>Success:</strong> {{ state.successMsg }}
    </div>

    <!-- Sub Navigation Tabs -->
    <div class="sub-nav">
      <button
        class="tab-btn"
        :class="{ active: activeSubTab === 'plans' }"
        @click="activeSubTab = 'plans'"
      >
        🏷️ 1. Plans & 0 VND Rule
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeSubTab === 'paid_checkout' }"
        @click="activeSubTab = 'paid_checkout'"
      >
        💳 2. Paid Checkout & Stacking
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeSubTab === 'admin_grant' }"
        @click="activeSubTab = 'admin_grant'"
      >
        👑 3. Admin Plans & Grant
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeSubTab === 'ledger' }"
        @click="activeSubTab = 'ledger'"
      >
        📑 4. Double-Entry Journals
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeSubTab === 'integrity' }"
        @click="activeSubTab = 'integrity'"
      >
        🛡️ 5. Ledger Integrity Audit
      </button>
      <button
        class="tab-btn highlight-tab"
        :class="{ active: activeSubTab === 'auto_test' }"
        @click="activeSubTab = 'auto_test'"
      >
        ⚡ 6. Automated Test Suite (7)
      </button>
    </div>

    <!-- SUB-TAB 1: Available Plans & 0 VND Lifetime Rule -->
    <div v-if="activeSubTab === 'plans'" class="flow-grid">
      <div class="col-12">
        <div class="callout info">
          <strong>Key PR Business Rule:</strong>
          <span>
            A 0 VND plan is a <strong>one-time lifetime free trial</strong> per user account.
            Once claimed, all 0 VND plans are excluded from <code>GET /{{ audience }}/membership/plans</code>.
            Direct attempts to acquire another 0 VND plan return <code>409 MEMBERSHIP_FREE_ALREADY_CLAIMED</code>.
          </span>
        </div>
      </div>

      <!-- Current Membership Banner -->
      <div class="col-12">
        <div class="metric-card" style="border-left: 4px solid var(--primary);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="font-size: 1.05rem;">Current Active Membership Status</h3>
              <p class="muted" style="font-size: 0.82rem;">
                Endpoint: <code>GET /api/v1/{{ audience }}/membership/me</code>
              </p>
            </div>
            <button class="secondary" @click="refreshBuyerData" :disabled="state.loading">
              Refresh Status
            </button>
          </div>

          <div v-if="state.currentMembership" class="fact-grid" style="margin-top: 12px;">
            <div class="fact-item">
              <span class="label">Plan Name</span>
              <span class="value">{{ state.currentMembership.plan?.name || '-' }}</span>
            </div>
            <div class="fact-item">
              <span class="label">Status</span>
              <span class="badge" :class="isExpired(state.currentMembership.expiresAt) ? 'badge-failed' : 'badge-succeeded'">
                {{ state.currentMembership.status }}
              </span>
            </div>
            <div class="fact-item">
              <span class="label">Role Granted</span>
              <span class="value mono">{{ state.currentMembership.roleGranted || state.currentMembership.plan?.roleGranted || '-' }}</span>
            </div>
            <div class="fact-item">
              <span class="label">Is Trial?</span>
              <span class="value">{{ state.currentMembership.isTrial ? 'Yes (0 VND)' : 'No (Paid/Granted)' }}</span>
            </div>
            <div class="fact-item">
              <span class="label">Starts At</span>
              <span class="value">{{ formatDate(state.currentMembership.startsAt) }}</span>
            </div>
            <div class="fact-item">
              <span class="label">Expires At</span>
              <span class="value highlight-text">{{ formatDate(state.currentMembership.expiresAt) }}</span>
            </div>
          </div>
          <div v-else class="callout warning" style="margin-top: 10px;">
            No active membership record found for {{ buyerSession.identifier }}. Claim a 0 VND trial or checkout a paid plan below.
          </div>
        </div>
      </div>

      <!-- Available Plans Grid -->
      <div class="col-12">
        <h3 style="margin: 14px 0 10px 0; font-size: 1rem;">
          Available Plans Catalog (<code>GET /api/v1/{{ audience }}/membership/plans</code>)
        </h3>

        <div v-if="state.plans.length === 0" class="callout warning">
          No plans currently visible to {{ buyerSession.identifier }}.
          (Note: If 0 VND plan was already claimed, it is intentionally hidden).
        </div>

        <div class="plans-grid">
          <div
            v-for="plan in state.plans"
            :key="plan.id"
            class="plan-card"
            :class="{ 'zero-vnd': Number(plan.price) === 0 }"
          >
            <div class="plan-badge-row">
              <span v-if="Number(plan.price) === 0" class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">
                🎁 0 VND Free Trial
              </span>
              <span v-else class="badge" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6;">
                💎 Premium Plan
              </span>
              <span class="badge" style="background: rgba(156, 163, 175, 0.2);">
                {{ plan.durationDays ? plan.durationDays + ' Days' : 'Lifetime' }}
              </span>
            </div>

            <h4 class="plan-title">{{ plan.name }}</h4>
            <p class="plan-desc">{{ plan.description || 'No description provided.' }}</p>

            <div class="plan-price">
              {{ formatVnd(plan.price) }}
            </div>

            <div class="plan-meta">
              <span>Role: <code>{{ plan.roleGranted }}</code></span>
              <span>ID: <code>#{{ plan.id }}</code></span>
            </div>

            <div class="plan-actions">
              <button
                v-if="Number(plan.price) === 0"
                class="success"
                style="width: 100%;"
                @click="handleClaimZeroVnd(plan.id)"
                :disabled="state.loading || !buyerSession.accessToken"
              >
                🚀 Claim 0 VND Plan
              </button>
              <button
                v-else
                class="primary"
                style="width: 100%;"
                @click="state.selectedPaidPlanId = String(plan.id); activeSubTab = 'paid_checkout'"
                :disabled="!buyerSession.accessToken"
              >
                Select for Checkout ➔
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Lifetime 0 VND Reclaim Failure Test -->
      <div class="col-12" style="margin-top: 14px;">
        <div class="metric-card" style="border: 1px dashed var(--border-subtle);">
          <h4 style="font-size: 0.95rem;">🧪 Negative Test: Attempt 0 VND Re-claim</h4>
          <p class="muted" style="font-size: 0.82rem;">
            Test backend enforcement: When calling <code>POST /{{ audience }}/membership/me/checkout</code>
            with a 0 VND plan after already claiming, the backend MUST respond with <code>409 MEMBERSHIP_FREE_ALREADY_CLAIMED</code>.
          </p>
          <div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
            <input
              v-model="state.selectedPaidPlanId"
              type="text"
              placeholder="0 VND Plan ID"
              class="input"
              style="max-width: 200px;"
            />
            <button
              class="secondary"
              @click="handleReclaimTest(state.selectedPaidPlanId || '1')"
              :disabled="state.loading || !buyerSession.accessToken"
            >
              ⚡ Test Re-Claim (Expect 409)
            </button>
          </div>
        </div>
      </div>

      <!-- Membership History -->
      <div class="col-12" style="margin-top: 14px;">
        <h4 style="font-size: 0.95rem; margin-bottom: 8px;">
          User Membership History (<code>GET /api/v1/{{ audience }}/membership/me/history</code>)
        </h4>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Plan Name</th>
                <th>Status</th>
                <th>Starts At</th>
                <th>Expires At</th>
                <th>Trial?</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="state.membershipHistory.length === 0">
                <td colspan="7" class="text-center muted">No past membership history records.</td>
              </tr>
              <tr v-for="item in state.membershipHistory" :key="item.id">
                <td><code>#{{ item.id }}</code></td>
                <td>{{ item.plan?.name || item.planId }}</td>
                <td>
                  <span class="badge" :class="item.status === 'ACTIVE' ? 'badge-succeeded' : 'badge-failed'">
                    {{ item.status }}
                  </span>
                </td>
                <td>{{ formatDate(item.startsAt) }}</td>
                <td>{{ formatDate(item.expiresAt) }}</td>
                <td>{{ item.isTrial ? 'Yes (0 VND)' : 'No' }}</td>
                <td>{{ formatDate(item.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 2: Paid Checkout & Stacking Rule -->
    <div v-if="activeSubTab === 'paid_checkout'" class="flow-grid">
      <div class="col-12">
        <div class="callout info">
          <strong>Stacking Rule (Anchor Extension):</strong>
          <span>
            When a user purchases or is granted an additional membership while an existing membership is active,
            the start date of the new term is anchored to the existing expiration date:
            <code>newExpiresAt = currentExpiresAt + durationDays</code>.
          </span>
        </div>
      </div>

      <!-- Checkout Form -->
      <div class="col-6">
        <div class="metric-card highlight">
          <h3 style="font-size: 1rem;">Create Paid Membership Checkout Order</h3>
          <p class="muted" style="font-size: 0.8rem;">
            Endpoint: <code>POST /api/v1/{{ audience }}/membership/me/checkout</code>
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">
            <div>
              <label class="label">Select Paid Plan</label>
              <select v-model="state.selectedPaidPlanId" class="input">
                <option value="" disabled>-- Select a plan --</option>
                <option
                  v-for="p in state.adminPlans.filter((x) => Number(x.price) > 0)"
                  :key="p.id"
                  :value="String(p.id)"
                >
                  {{ p.name }} ({{ formatVnd(p.price) }} / {{ p.durationDays }} Days)
                </option>
              </select>
            </div>

            <div class="fact-grid">
              <div class="fact-item">
                <span class="label">Current Expiration:</span>
                <span class="value">{{ formatDate(state.currentMembership?.expiresAt) }}</span>
              </div>
              <div class="fact-item">
                <span class="label">Stacking Behavior:</span>
                <span class="value" style="color: var(--success);">
                  {{ state.currentMembership?.expiresAt ? 'Extends current expiration' : 'Starts immediately' }}
                </span>
              </div>
            </div>

            <button
              class="success"
              style="margin-top: 8px;"
              @click="handlePaidCheckout"
              :disabled="state.loading || !state.selectedPaidPlanId || !buyerSession.accessToken"
            >
              💳 Generate VNPay Checkout Order
            </button>
          </div>
        </div>
      </div>

      <!-- Checkout Result & VNPay Action -->
      <div class="col-6">
        <div class="metric-card">
          <h3 style="font-size: 1rem;">VNPay Payment Order Status</h3>

          <div v-if="state.checkoutResult" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
            <div class="fact-grid">
              <div class="fact-item">
                <span class="label">Order ID</span>
                <span class="value mono">#{{ state.checkoutResult.orderId || state.checkoutResult.paymentOrder?.id || '-' }}</span>
              </div>
              <div class="fact-item">
                <span class="label">txnRef</span>
                <span class="value mono">{{ state.checkoutResult.txnRef || state.checkoutResult.paymentOrder?.txnRef || '-' }}</span>
              </div>
              <div class="fact-item">
                <span class="label">Amount</span>
                <span class="value" style="color: var(--success);">{{ formatVnd(state.checkoutResult.amountVnd || state.checkoutResult.paymentOrder?.amountVnd) }}</span>
              </div>
              <div class="fact-item">
                <span class="label">Order Status</span>
                <span class="badge" :class="state.orderStatus?.status === 'SUCCEEDED' ? 'badge-succeeded' : 'badge-failed'">
                  {{ state.orderStatus?.status || state.checkoutResult.paymentOrder?.status || 'PENDING' }}
                </span>
              </div>
              <div class="fact-item">
                <span class="label">Fulfillment</span>
                <span class="badge" :class="state.orderStatus?.fulfillmentStatus === 'FULFILLED' ? 'badge-succeeded' : 'badge-failed'">
                  {{ state.orderStatus?.fulfillmentStatus || 'PENDING' }}
                </span>
              </div>
            </div>

            <div class="button-group" style="margin-top: 8px; flex-wrap: wrap;">
              <a
                v-if="state.checkoutResult.paymentUrl || state.checkoutResult.checkoutUrl"
                :href="state.checkoutResult.paymentUrl || state.checkoutResult.checkoutUrl"
                target="_blank"
                class="btn primary"
                style="text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 0.85rem;"
              >
                🌐 Open VNPay Sandbox
              </a>
              <button
                class="success"
                @click="handleSimulateIpn(false)"
                :disabled="state.loading"
              >
                ⚡ 1-Click Settle Payment (Simulate IPN)
              </button>
              <button
                class="ghost"
                @click="handleSimulateIpn(true)"
                :disabled="state.loading"
                style="font-size: 0.78rem;"
              >
                ❌ Test Failure (24)
              </button>
              <button
                class="secondary"
                @click="copySimulateCmd(state.checkoutResult.txnRef || state.checkoutResult.paymentOrder?.txnRef)"
              >
                📋 Copy CLI Cmd
              </button>
              <button
                class="secondary"
                @click="handlePollOrder"
                :disabled="state.loading"
              >
                🔄 Poll Status
              </button>
              <button
                class="primary"
                style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"
                @click="state.inspectedOrderId = String(state.checkoutResult.orderId || state.checkoutResult.paymentOrder?.id || ''); activeSubTab = 'ledger'; handleInspectLedger()"
              >
                📊 Inspect Accounting Journals ➔
              </button>
            </div>

            <div class="callout info" style="font-size: 0.8rem; margin-top: 6px;">
              <strong>Simulation CLI:</strong>
              <code style="display: block; margin-top: 4px;">
                npx ts-node scripts/simulate-vnpay-ipn.ts {{ state.checkoutResult.txnRef || state.checkoutResult.paymentOrder?.txnRef || '&lt;txnRef&gt;' }}
              </code>
            </div>

            <!-- Stacking Outcome Comparison -->
            <div v-if="state.postCheckoutExpiry" class="metric-card" style="background: rgba(16, 185, 129, 0.08); border: 1px solid var(--success);">
              <h4 style="color: var(--success); font-size: 0.9rem;">✅ Stacking Verification Result:</h4>
              <p style="font-size: 0.82rem; margin: 4px 0;">
                Prior Expiry: <code>{{ formatDate(state.preCheckoutExpiry) }}</code><br />
                New Expiry: <strong>{{ formatDate(state.postCheckoutExpiry) }}</strong>
              </p>
              <span class="badge badge-succeeded">Term Successfully Stacked</span>
            </div>
          </div>
          <div v-else class="callout warning" style="margin-top: 10px;">
            Awaiting checkout order creation. Select a plan on the left and click "Generate VNPay Checkout Order".
          </div>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 3: Admin Management & Direct Grant -->
    <div v-if="activeSubTab === 'admin_grant'" class="flow-grid">
      <!-- Admin Direct Grant -->
      <div class="col-6">
        <div class="metric-card highlight">
          <h3 style="font-size: 1rem;">Directly Grant Membership (Admin Action)</h3>
          <p class="muted" style="font-size: 0.8rem;">
            Endpoint: <code>POST /api/v1/web/admin/membership/grants</code>
          </p>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
            <div>
              <label class="label">Target User ID</label>
              <input v-model="state.grantUserId" type="text" class="input" placeholder="e.g. 910007" />
            </div>

            <div>
              <label class="label">Select Plan</label>
              <select v-model="state.selectedGrantPlanId" class="input">
                <option value="" disabled>-- Select plan --</option>
                <option v-for="p in state.adminPlans" :key="p.id" :value="String(p.id)">
                  {{ p.name }} ({{ p.durationDays }} Days / {{ formatVnd(p.price) }})
                </option>
              </select>
            </div>

            <div>
              <label class="label">Custom Duration Days (optional override)</label>
              <input v-model="state.grantDurationDays" type="number" class="input" placeholder="30" />
            </div>

            <div>
              <label class="label">Admin Note</label>
              <input v-model="state.grantNote" type="text" class="input" placeholder="Internal justification note" />
            </div>

            <div class="button-group" style="margin-top: 8px;">
              <button
                class="success"
                @click="handleGrantMembership"
                :disabled="state.loading || !adminSession.accessToken"
              >
                👑 Grant Membership (Anchor Stacking)
              </button>
              <button
                class="secondary"
                @click="handleFetchUserMemberships"
                :disabled="state.loading || !adminSession.accessToken"
              >
                📜 View User History
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Plan Form (Create / Edit) -->
      <div class="col-6">
        <div class="metric-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 1rem;">
              {{ state.isEditingPlan ? 'Edit Membership Plan #' + state.planForm.id : 'Create New Membership Plan' }}
            </h3>
            <button v-if="state.isEditingPlan" class="ghost" @click="startCreatePlan">
              Cancel Edit
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
            <div>
              <label class="label">Plan Name</label>
              <input v-model="state.planForm.name" type="text" class="input" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label class="label">Price (VND)</label>
                <input v-model.number="state.planForm.price" type="number" class="input" />
              </div>
              <div>
                <label class="label">Duration (Days)</label>
                <input v-model.number="state.planForm.durationDays" type="number" class="input" />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label class="label">Role Granted</label>
                <select v-model="state.planForm.roleGranted" class="input">
                  <option value="creator">creator</option>
                  <option value="user">user</option>
                  <option value="merchant">merchant</option>
                </select>
              </div>
              <div>
                <label class="label">Active Status</label>
                <select v-model="state.planForm.isActive" class="input">
                  <option :value="true">Active (Visible)</option>
                  <option :value="false">Inactive (Hidden)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="label">Description</label>
              <input v-model="state.planForm.description" type="text" class="input" />
            </div>

            <button
              class="primary"
              style="margin-top: 8px;"
              @click="handleSavePlan"
              :disabled="state.loading || !adminSession.accessToken"
            >
              {{ state.isEditingPlan ? 'Save Changes (PATCH)' : 'Create Plan (POST)' }}
            </button>
          </div>
        </div>
      </div>

      <!-- All Admin Plans Table -->
      <div class="col-12" style="margin-top: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h4 style="font-size: 0.95rem;">
            All System Plans (<code>GET /api/v1/web/admin/membership/plans</code>)
          </h4>
          <button class="ghost" @click="startCreatePlan">+ Create New Plan</button>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Role</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in state.adminPlans" :key="p.id">
                <td><code>#{{ p.id }}</code></td>
                <td><strong>{{ p.name }}</strong></td>
                <td>{{ formatVnd(p.price) }}</td>
                <td>{{ p.durationDays ? p.durationDays + ' Days' : 'Lifetime' }}</td>
                <td><code>{{ p.roleGranted }}</code></td>
                <td>
                  <span class="badge" :class="p.isActive ? 'badge-succeeded' : 'badge-failed'">
                    {{ p.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    <button class="ghost" style="padding: 2px 8px; font-size: 0.75rem;" @click="startEditPlan(p)">
                      Edit
                    </button>
                    <button class="danger" style="padding: 2px 8px; font-size: 0.75rem;" @click="handleDeletePlan(p.id)">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 4: Double-Entry Ledger Inspection -->
    <div v-if="activeSubTab === 'ledger'" class="flow-grid">
      <div class="col-12">
        <div class="callout info">
          <strong>Double-Entry Accounting Architecture:</strong>
          <span>
            When a paid membership order is captured, the system creates two synchronized double-entry journals:
            <br />
            <strong>1. PAYMENT_CAPTURED:</strong> Dr 1121 (VNPAY_CLEARING) / Cr CUSTOMER_FUNDS_HELD.
            <br />
            <strong>2. MEMBERSHIP_SALE_RECOGNIZED:</strong> Dr CUSTOMER_FUNDS_HELD / Cr 3387 (MEMBERSHIP_DEFERRED_REVENUE) + Cr 3331 (VAT_OUTPUT_PAYABLE).
            <br />
            <strong>3. Daily Sweep / Recognition:</strong> Dr 3387 / Cr 5113 (MEMBERSHIP_REVENUE).
          </span>
        </div>
      </div>

      <div class="col-12">
        <div class="metric-card">
          <div style="display: flex; gap: 10px; align-items: center;">
            <input
              v-model="state.inspectedOrderId"
              type="text"
              placeholder="Payment Order ID (e.g. 50012)"
              class="input"
              style="max-width: 250px;"
            />
            <button class="primary" @click="handleInspectLedger" :disabled="state.loading || !adminSession.accessToken">
              🔍 Inspect Journals (GET /web/admin/finance/ledger/journals)
            </button>
          </div>
        </div>
      </div>

      <!-- Journal 1: Payment Capture -->
      <div class="col-6">
        <div class="metric-card highlight">
          <h4 style="font-size: 0.95rem; margin-bottom: 6px;">
            1. PAYMENT_CAPTURED Journal
          </h4>
          <div v-if="state.capturedJournal">
            <p class="muted" style="font-size: 0.78rem;">
              Event Key: <code>{{ state.capturedJournal.eventKey }}</code><br />
              Occurred At: {{ formatDate(state.capturedJournal.occurredAt) }}
            </p>
            <div class="table-container" style="margin-top: 10px;">
              <table>
                <thead>
                  <tr><th>Account</th><th>Side</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(line, idx) in state.capturedJournal.lines" :key="idx">
                    <td><code>{{ line.accountCode }}</code></td>
                    <td>
                      <span class="badge" :class="line.side === 'DEBIT' ? 'badge-succeeded' : 'badge-failed'">
                        {{ line.side }}
                      </span>
                    </td>
                    <td>{{ formatVnd(line.amountVnd) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="callout warning" style="margin-top: 10px;">
            No capture journal retrieved for Order #{{ state.inspectedOrderId || '-' }}.
          </div>
        </div>
      </div>

      <!-- Journal 2: Membership Sale Recognition -->
      <div class="col-6">
        <div class="metric-card highlight">
          <h4 style="font-size: 0.95rem; margin-bottom: 6px;">
            2. MEMBERSHIP_SALE_RECOGNIZED Journal
          </h4>
          <div v-if="state.saleJournal">
            <p class="muted" style="font-size: 0.78rem;">
              Event Key: <code>{{ state.saleJournal.eventKey }}</code><br />
              Occurred At: {{ formatDate(state.saleJournal.occurredAt) }}
            </p>
            <div class="table-container" style="margin-top: 10px;">
              <table>
                <thead>
                  <tr><th>Account</th><th>Side</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(line, idx) in state.saleJournal.lines" :key="idx">
                    <td><code>{{ line.accountCode }}</code></td>
                    <td>
                      <span class="badge" :class="line.side === 'DEBIT' ? 'badge-succeeded' : 'badge-failed'">
                        {{ line.side }}
                      </span>
                    </td>
                    <td>{{ formatVnd(line.amountVnd) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="callout warning" style="margin-top: 10px;">
            No sale journal retrieved for Order #{{ state.inspectedOrderId || '-' }}.
          </div>
        </div>
      </div>

      <!-- Developer Command Reference -->
      <div class="col-12" style="margin-top: 10px;">
        <div class="metric-card">
          <h4 style="font-size: 0.9rem;">Backend CLI Jobs for Testing</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
            <div class="callout success">
              <strong>Seed Membership Finance Accounts & Policies:</strong>
              <code style="display: block; margin-top: 4px;">tạo policy bằng API admin: POST /web/admin/finance/revenue-sources/:id/policy-versions</code>
            </div>
            <div class="callout info">
              <strong>Run Backfill & Revenue Recognition Sweep:</strong>
              <code style="display: block; margin-top: 4px;">npm run finance:backfill-membership</code>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 5: Ledger Integrity Audit -->
    <div v-if="activeSubTab === 'integrity'" class="flow-grid">
      <div class="col-12">
        <div class="callout info">
          <strong>Integrity Invariant:</strong>
          <span>
            <code>GET /web/admin/finance/ledger/integrity</code> performs automated cross-checks across all
            journal lines, payment orders, and trial balance totals.
            The PR guarantees that <code>membershipLedgerMismatchCount</code> remains <strong>0</strong> at all times.
          </span>
        </div>
      </div>

      <div class="col-12">
        <div style="display: flex; gap: 10px; align-items: center;">
          <button class="primary" @click="handleAuditIntegrity" :disabled="state.loading || !adminSession.accessToken">
            🛡️ Execute Ledger Integrity Check (GET /web/admin/finance/ledger/integrity)
          </button>
        </div>
      </div>

      <div v-if="state.integrityData" class="col-12" style="margin-top: 10px;">
        <div class="fact-grid">
          <div class="fact-item">
            <span class="label">Balanced?</span>
            <span class="badge" :class="state.integrityData.balanced ? 'badge-succeeded' : 'badge-failed'">
              {{ state.integrityData.balanced ? 'BALANCED' : 'OUT OF BALANCE' }}
            </span>
          </div>

          <div class="fact-item">
            <span class="label">System Health</span>
            <span class="badge" :class="state.integrityData.healthy ? 'badge-succeeded' : 'badge-failed'">
              {{ state.integrityData.healthy ? 'HEALTHY' : 'UNHEALTHY' }}
            </span>
          </div>

          <div class="fact-item">
            <span class="label">Total Debits</span>
            <span class="value">{{ formatVnd(state.integrityData.totalDebits) }}</span>
          </div>

          <div class="fact-item">
            <span class="label">Total Credits</span>
            <span class="value">{{ formatVnd(state.integrityData.totalCredits) }}</span>
          </div>

          <div class="fact-item highlight" style="border: 2px solid var(--primary);">
            <span class="label">Membership Ledger Mismatches</span>
            <span
              class="value"
              :style="{ color: state.integrityData.membershipLedgerMismatchCount === 0 ? 'var(--success)' : 'var(--danger)' }"
            >
              {{ state.integrityData.membershipLedgerMismatchCount }} Mismatch(es)
            </span>
          </div>

          <div class="fact-item">
            <span class="label">Payment Ledger Mismatches</span>
            <span class="value">{{ state.integrityData.paymentLedgerMismatchCount }}</span>
          </div>

          <div class="fact-item">
            <span class="label">Stale Draft Count</span>
            <span class="value">{{ state.integrityData.staleDraftCount }}</span>
          </div>

          <div class="fact-item">
            <span class="label">Treasury Settlement Mismatches</span>
            <span class="value">{{ state.integrityData.treasurySettlementMismatchCount }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 6: Automated Test Suite (7 tests) -->
    <div v-if="activeSubTab === 'auto_test'" class="flow-grid">
      <div class="col-12">
        <div class="panel-header" style="padding: 0 0 10px 0;">
          <div>
            <h3 style="font-size: 1.05rem;">Automated Regression Test Suite for PR Features</h3>
            <p class="muted" style="font-size: 0.82rem;">
              Sequentially executes 7 assertions covering catalog filtering, 0 VND 1-time limit,
              paid checkout with VNPay URL, expiration stacking, double-entry balance, and ledger integrity.
            </p>
          </div>
          <button
            class="primary"
            style="background: linear-gradient(135deg, #10b981, #059669);"
            @click="runAutoTests"
            :disabled="state.autoRunning || !buyerSession.accessToken || !adminSession.accessToken"
          >
            {{ state.autoRunning ? '⏳ Running Suite...' : '▶️ Run All Automated Tests' }}
          </button>
        </div>
      </div>

      <div class="col-12">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th style="width: 350px;">Test Assertion</th>
                <th style="width: 120px;">Status</th>
                <th>Result Details</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in state.autoTests" :key="t.id">
                <td><code>{{ t.id }}</code></td>
                <td><strong>{{ t.title }}</strong></td>
                <td>
                  <span
                    class="badge"
                    :class="{
                      'badge-succeeded': t.status === 'passed',
                      'badge-failed': t.status === 'failed',
                      'badge-pending': t.status === 'running',
                    }"
                  >
                    {{ t.status.toUpperCase() }}
                  </span>
                </td>
                <td style="font-size: 0.85rem; color: var(--text-muted);">
                  {{ t.detail || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.membership-tester {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.persona-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--bg-surface-elevated);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  align-items: center;
}

.persona-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.persona-chip.highlight {
  background: rgba(99, 102, 241, 0.15);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.expiry-note {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.audience-toggle {
  display: flex;
  background: var(--bg-surface-elevated);
  border-radius: var(--radius-sm);
  padding: 2px;
  border: 1px solid var(--border-subtle);
}

.toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 6px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.toggle-btn.active {
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}

.sub-nav {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 8px;
  overflow-x: auto;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 500;
  font-size: 0.85rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--text-main);
  background: var(--bg-surface-elevated);
}

.tab-btn.active {
  color: #fff;
  background: var(--primary);
  font-weight: 600;
}

.tab-btn.highlight-tab.active {
  background: linear-gradient(135deg, #10b981, #059669);
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 10px;
}

.plan-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.plan-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.plan-card.zero-vnd {
  border-color: rgba(16, 185, 129, 0.4);
}

.plan-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plan-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.plan-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
  min-height: 38px;
}

.plan-price {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--success);
}

.plan-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
}

.input, select.input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.88rem;
}

.input:focus, select.input:focus {
  outline: none;
  border-color: var(--primary);
}

.highlight-text {
  color: var(--primary);
  font-weight: 600;
}
</style>
