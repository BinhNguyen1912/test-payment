<script setup>
import { computed, ref, watch } from 'vue';
import { vnd } from '../lineage.js';

const props = defineProps({
  /** Newest first. Each item is a lineage object from src/lineage.js. */
  lineages: { type: Array, default: () => [] },
  /** Hide the history picker (used inside the payout stepper). */
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'Database & Ledger Inspector' },
  canLoadLedger: { type: Boolean, default: false },
  loadingLedger: { type: Boolean, default: false },
});
const emit = defineEmits(['load-ledger']);

const tab = ref('tables');
const selectedId = ref('');
const copied = ref(false);

watch(
  () => props.lineages[0]?.id,
  (id) => {
    if (id) selectedId.value = id;
  },
  { immediate: true },
);

const current = computed(
  () => props.lineages.find((l) => l.id === selectedId.value) || props.lineages[0] || null,
);

const totalDebit = computed(() => sum(current.value?.entries.flatMap((e) => e.debits)));
const totalCredit = computed(() => sum(current.value?.entries.flatMap((e) => e.credits)));

function sum(lines = []) {
  return (lines || []).reduce((acc, l) => acc + (l.amount ? BigInt(String(l.amount).replace(/\D/g, '') || '0') : 0n), 0n);
}

function statusClass(value) {
  const s = String(value || '').toUpperCase();
  if (/SUCCESS|POSTED|FULFILLED|ACTIVE|RECORDED|APPROVED|SUCCEEDED/.test(s)) return 'badge-succeeded';
  if (/FAIL|REJECT/.test(s)) return 'badge-failed';
  if (/CANCEL/.test(s)) return 'badge-cancelled';
  if (/SUBMIT|PROCESS|RESERVED/.test(s)) return 'badge-processing';
  return 'badge-pending';
}

async function copyJson() {
  if (!current.value) return;
  const { raw, ...rest } = current.value;
  await navigator.clipboard.writeText(JSON.stringify({ ...rest, response: raw }, null, 2));
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('vi-VN');
}
</script>

<template>
  <section v-if="current" class="lineage-panel" :class="{ compact }">
    <div class="lineage-head">
      <div>
        <h3>🗄️ {{ title }}</h3>
        <div class="muted lineage-sub">{{ current.title }} · {{ fmtTime(current.at) }}</div>
      </div>
      <div class="button-group">
        <select v-if="!compact && lineages.length > 1" v-model="selectedId" class="lineage-select">
          <option v-for="l in lineages" :key="l.id" :value="l.id">{{ fmtTime(l.at) }} — {{ l.title }}</option>
        </select>
        <button
          v-if="canLoadLedger"
          class="secondary lineage-btn"
          :disabled="loadingLedger"
          @click="emit('load-ledger', current)"
        >
          {{ loadingLedger ? 'Đang tải…' : '📒 Lấy bút toán thật' }}
        </button>
        <button class="ghost lineage-btn" @click="copyJson">{{ copied ? '✓ Đã copy' : '📋 Copy JSON' }}</button>
      </div>
    </div>

    <div class="lineage-tabs">
      <button :class="{ on: tab === 'tables' }" @click="tab = 'tables'">1 · Bảng Database ({{ current.tables.length }})</button>
      <button :class="{ on: tab === 'ledger' }" @click="tab = 'ledger'">2 · Bút toán Nợ/Có ({{ current.entries.length }})</button>
      <button :class="{ on: tab === 'states' }" @click="tab = 'states'">3 · Trước / Sau</button>
      <button :class="{ on: tab === 'json' }" @click="tab = 'json'">JSON</button>
    </div>

    <!-- TABLE 1: database tables -->
    <div v-if="tab === 'tables'" class="table-container">
      <table>
        <thead>
          <tr>
            <th>Bảng Database</th>
            <th>Trường chính</th>
            <th>Giá trị ghi nhận</th>
            <th>Trạng thái (trước ➔ sau)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in current.tables" :key="t.table + i">
            <td><code>{{ t.table }}</code></td>
            <td class="mono small">{{ t.fields }}</td>
            <td class="small">
              {{ t.values }}
              <div v-if="t.note" class="muted tiny">{{ t.note }}</div>
            </td>
            <td>
              <span class="muted">{{ t.before }}</span> ➔
              <span class="badge" :class="statusClass(t.after)">{{ t.after }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TABLE 2: double entry -->
    <div v-else-if="tab === 'ledger'" class="table-container">
      <table>
        <thead>
          <tr>
            <th>Sự kiện</th>
            <th>Tài khoản Nợ (Debit)</th>
            <th>Tài khoản Có (Credit)</th>
            <th>Số tiền (VND)</th>
            <th>Ghi chú nghiệp vụ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in current.entries" :key="i" :class="{ dim: e.deferred }">
            <td>
              <strong>{{ e.event }}</strong>
              <div><code v-if="e.eventType !== '—'">{{ e.eventType }}</code></div>
              <span class="badge tiny-badge" :class="e.source === 'ledger' ? 'badge-succeeded' : 'badge-pending'">
                {{ e.source === 'ledger' ? 'THỰC TẾ' : e.deferred ? 'CHỜ REDEEM' : 'DỰ KIẾN' }}
              </span>
            </td>
            <td>
              <div v-for="d in e.debits" :key="d.account" class="acct"><code>{{ d.account }}</code></div>
              <span v-if="!e.debits.length" class="muted">—</span>
            </td>
            <td>
              <div v-for="c in e.credits" :key="c.account" class="acct">
                <code>{{ c.account }}</code><span v-if="c.pct" class="muted tiny"> ({{ c.pct }})</span>
              </div>
              <span v-if="!e.credits.length" class="muted">—</span>
            </td>
            <td class="amount-col">
              <div v-for="d in e.debits" :key="'d' + d.account" class="acct">Nợ {{ vnd(d.amount) }}</div>
              <div v-for="c in e.credits" :key="'c' + c.account" class="acct credit">
                Có {{ c.amount === null ? '(chia theo VAT)' : vnd(c.amount) }}
              </div>
            </td>
            <td class="small">{{ e.note }}</td>
          </tr>
        </tbody>
        <tfoot v-if="totalDebit > 0n || totalCredit > 0n">
          <tr>
            <td colspan="3"><strong>Cân đối</strong></td>
            <td colspan="2">
              Σ Nợ {{ vnd(totalDebit.toString()) }} · Σ Có {{ vnd(totalCredit.toString()) }}
              <span class="badge" :class="totalDebit === totalCredit ? 'badge-succeeded' : 'badge-pending'">
                {{ totalDebit === totalCredit ? 'CÂN' : 'nhiều bút toán / chia VAT' }}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- TABLE 3: before / after -->
    <div v-else-if="tab === 'states'" class="table-container">
      <table>
        <thead><tr><th>Trường</th><th>Trước khi gọi API</th><th>Sau khi gọi API</th></tr></thead>
        <tbody>
          <tr v-for="s in current.states" :key="s.label">
            <td><code>{{ s.label }}</code></td>
            <td><span class="badge badge-cancelled">{{ s.before }}</span></td>
            <td><span class="badge" :class="statusClass(s.after)">{{ s.after }}</span></td>
          </tr>
          <tr v-if="!current.states.length"><td colspan="3" class="muted">Không có thay đổi trạng thái.</td></tr>
        </tbody>
      </table>
    </div>

    <pre v-else class="code-block">{{ JSON.stringify(current.raw ?? current, null, 2) }}</pre>
  </section>
</template>

<style scoped>
.lineage-panel {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow);
}
.lineage-panel.compact {
  margin-top: 8px;
  padding: 10px;
  box-shadow: none;
  border-color: var(--border-subtle);
}
.lineage-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.lineage-head h3 { font-size: 0.95rem; }
.lineage-sub { font-size: 0.75rem; }
.lineage-select { max-width: 320px; font-size: 0.75rem; }
.lineage-btn { padding: 4px 10px; font-size: 0.75rem; }
.lineage-tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.lineage-tabs button {
  background: var(--bg-surface-subtle);
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
  padding: 5px 12px;
  font-size: 0.78rem;
}
.lineage-tabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
.small { font-size: 0.8rem; }
.tiny { font-size: 0.7rem; }
.tiny-badge { font-size: 0.62rem; margin-top: 4px; }
.acct { padding: 1px 0; }
.acct.credit { color: var(--success); }
.amount-col { white-space: nowrap; font-weight: 600; }
.dim { opacity: 0.6; }
</style>
