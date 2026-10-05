<script setup>
import { computed } from 'vue';
import DataLineageInspector from './DataLineageInspector.vue';
import { vnd } from '../lineage.js';

const props = defineProps({
  payoutId: { type: String, default: '' },
  /** Payout record from GET /web/admin/finance/payouts/:id */
  payout: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  /** { approver, executor, reconciler } sessions, for the "acting as" labels */
  personas: { type: Object, required: true },
  /** Lineages keyed by step: APPROVE, PROCESSING, SUBMIT, SUCCEED (latest result of each) */
  stepLineages: { type: Object, default: () => ({}) },
  bankDetails: { type: Object, default: null },
});
const emit = defineEmits(['approve', 'reject', 'claim', 'view-bank', 'submit', 'reconcile', 'cancel']);

const bankReference = defineModel('bankReference', { type: String, default: '' });
const evidenceReference = defineModel('evidenceReference', { type: String, default: '' });
const evidenceSource = defineModel('evidenceSource', { type: String, default: 'BANK_STATEMENT' });

const status = computed(() => String(props.payout?.status || (props.payoutId ? 'REQUESTED' : '')).toUpperCase());

// Which step is waiting for action, derived from payout status.
const activeStep = computed(() => {
  switch (status.value) {
    case 'REQUESTED': return 1;
    case 'APPROVED':
    case 'PROCESSING': return 2;
    case 'SUBMITTED': return 3;
    case 'SUCCEEDED': return 4;
    default: return 0;
  }
});

const steps = computed(() => [
  { n: 1, role: 'Approver', title: 'Kế toán trưởng', session: props.personas.approver, lineageKeys: ['APPROVE'] },
  { n: 2, role: 'Executor', title: 'Thủ quỹ', session: props.personas.executor, lineageKeys: ['PROCESSING', 'SUBMIT'] },
  { n: 3, role: 'Reconciler', title: 'Đối soát viên', session: props.personas.reconciler, lineageKeys: ['SUCCEED'] },
]);

function stateOf(n) {
  if (!props.payoutId) return 'locked';
  if (activeStep.value > n) return 'done';
  if (activeStep.value === n) return 'active';
  return 'pending';
}

const stateLabel = { done: '✓ Hoàn tất', active: '▶ Đến lượt', pending: 'Chờ bước trước', locked: 'Chưa có payout' };

function lineagesFor(step) {
  return step.lineageKeys.map((k) => props.stepLineages[k]).filter(Boolean);
}

function badge(s) {
  if (/SUCCEED/.test(s)) return 'badge-succeeded';
  if (/FAIL|REJECT/.test(s)) return 'badge-failed';
  if (/CANCEL/.test(s)) return 'badge-cancelled';
  if (/SUBMIT/.test(s)) return 'badge-submitted';
  if (/PROCESS/.test(s)) return 'badge-processing';
  if (/APPROV/.test(s)) return 'badge-approved';
  return 'badge-pending';
}
</script>

<template>
  <div class="stepper">
    <div class="stepper-summary">
      <div><span class="muted">Payout</span> <strong>#{{ payoutId || '—' }}</strong></div>
      <div><span class="muted">Số tiền</span> <strong class="amt">{{ vnd(payout?.amountVnd) }}</strong></div>
      <div><span class="muted">Bên nhận</span> <strong>{{ payout?.partyType || '—' }}</strong></div>
      <div>
        <span class="muted">Trạng thái <code>finance_payouts.status</code></span>
        <span class="badge" :class="badge(status)">{{ status || '—' }}</span>
      </div>
    </div>

    <div class="rail">
      <template v-for="(s, i) in steps" :key="s.n">
        <div class="rail-node" :class="stateOf(s.n)">
          <span class="bullet">{{ stateOf(s.n) === 'done' ? '✓' : s.n }}</span>
          <div>
            <div class="rail-title">Bước {{ s.n }}: {{ s.role }}</div>
            <div class="muted tiny">{{ s.title }} · {{ stateLabel[stateOf(s.n)] }}</div>
          </div>
        </div>
        <span v-if="i < steps.length - 1" class="rail-line" :class="{ filled: activeStep > s.n }"></span>
      </template>
    </div>

    <div class="step-grid">
      <div v-for="s in steps" :key="s.n" class="step-card" :class="stateOf(s.n)">
        <div class="step-head">
          <h4>Bước {{ s.n }}: {{ s.role }} <span class="muted">({{ s.title }})</span></h4>
          <span class="muted tiny">
            <span class="dot" :class="s.session?.accessToken ? 'on' : 'off'"></span>{{ s.session?.identifier }}
          </span>
        </div>

        <template v-if="s.n === 1">
          <p class="muted tiny">Xem xét yêu cầu, dự trữ số dư trong sổ cái (PAYOUT_RESERVED).</p>
          <div class="button-group">
            <button class="primary" :disabled="!payoutId || busy" @click="emit('approve')">✓ Approve Payout</button>
            <button class="danger" :disabled="!payoutId || busy" @click="emit('reject')">✕ Reject</button>
          </div>
        </template>

        <template v-else-if="s.n === 2">
          <p class="muted tiny">Nhận xử lý, xem thông tin ngân hàng thụ hưởng và gửi lệnh chuyển tiền.</p>
          <div class="form-group">
            <label>External bank reference</label>
            <input v-model="bankReference" class="mono" placeholder="FT240928001" />
          </div>
          <div v-if="bankDetails" class="callout info tiny-box">
            <strong>{{ bankDetails.accountName }}</strong> — {{ bankDetails.bankShortName }} ({{ bankDetails.accountNumber }})
          </div>
          <div class="button-group">
            <button class="secondary" :disabled="!payoutId || busy" @click="emit('claim')">Claim Processing</button>
            <button class="secondary" :disabled="!payoutId || busy" @click="emit('view-bank')">👁️ Bank info</button>
            <button class="primary" :disabled="!payoutId || !bankReference || busy" @click="emit('submit')">Submit to Bank / Execute</button>
          </div>
        </template>

        <template v-else>
          <p class="muted tiny">Đối chiếu sao kê, đánh dấu thành công (PAYOUT_SUCCEEDED).</p>
          <div class="form-group">
            <label>Evidence reference</label>
            <input v-model="evidenceReference" class="mono" placeholder="STMT-2026-10" />
          </div>
          <div class="form-group">
            <label>Evidence source</label>
            <select v-model="evidenceSource">
              <option value="BANK_STATEMENT">BANK_STATEMENT</option>
              <option value="BANK_PORTAL">BANK_PORTAL</option>
              <option value="BANK_API">BANK_API</option>
            </select>
          </div>
          <div class="button-group">
            <button class="success" :disabled="!payoutId || busy" @click="emit('reconcile')">✓ Reconcile &amp; Succeeded</button>
            <button class="ghost" :disabled="!payoutId || busy" @click="emit('cancel')">Cancel payout</button>
          </div>
        </template>

        <DataLineageInspector
          v-for="l in lineagesFor(s)"
          :key="l.id"
          :lineages="[l]"
          compact
          :title="`finance_payouts & finance_journals — ${l.title}`"
        />
        <div v-if="!lineagesFor(s).length" class="muted tiny empty">Chưa thực thi — bảng thay đổi sẽ hiện ở đây.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stepper { display: flex; flex-direction: column; gap: 14px; }
.stepper-summary {
  display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 14px;
  background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
}
.stepper-summary > div { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; }
.amt { color: var(--success); }
.rail { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rail-node { display: flex; align-items: center; gap: 10px; opacity: 0.55; }
.rail-node.active, .rail-node.done { opacity: 1; }
.bullet {
  width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 700;
  background: var(--bg-surface-subtle); border: 2px solid var(--border-subtle);
}
.active .bullet { border-color: var(--primary); box-shadow: 0 0 12px var(--primary-glow); color: var(--primary); }
.done .bullet { background: var(--success); border-color: var(--success); color: #04120c; }
.rail-title { font-weight: 700; font-size: 0.85rem; }
.rail-line { flex: 1; min-width: 30px; height: 2px; background: var(--border-subtle); }
.rail-line.filled { background: var(--success); }
.step-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.step-card {
  display: flex; flex-direction: column; gap: 10px; padding: 14px;
  background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
}
.step-card.active { border-color: var(--primary); box-shadow: var(--shadow-glow); }
.step-card.done { border-color: rgba(16, 185, 129, 0.4); }
.step-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-head h4 { font-size: 0.9rem; }
.tiny { font-size: 0.72rem; }
.tiny-box { font-size: 0.75rem; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
.dot.on { background: var(--success); }
.dot.off { background: var(--danger); }
.empty { text-align: center; padding: 6px; }
</style>
