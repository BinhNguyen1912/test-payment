<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { listAllCommitments, listMarketplaceVouchers, listMembershipPlans } from '../api.js';
import { explainError, vnd } from '../lineage.js';

const props = defineProps({
  session: { type: Object, required: true },
  /** Creator sub-account to highlight in the commitment list. */
  myCreatorId: { type: String, default: '' },
  selectedKey: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  pageSize: { type: Number, default: 8 },
});
const emit = defineEmits(['select', 'add-to-cart', 'loaded']);

const KINDS = [
  { value: 'COMMITMENT', label: '🎯 Thẻ cam kết' },
  { value: 'VOUCHER', label: '🎟️ Voucher' },
  { value: 'MEMBERSHIP', label: '👑 Gói hội viên' },
];

const kind = ref('COMMITMENT');
// The membership API is mounted at /web/membership and /mobile/membership.
const audience = ref('web');
const search = ref('');
const onlyMine = ref(false);
const page = ref(1);
const state = reactive({ rows: { COMMITMENT: [], VOUCHER: [], MEMBERSHIP: [] }, loading: false, error: null });

const rows = computed(() => state.rows[kind.value]);
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (kind.value === 'COMMITMENT' && onlyMine.value && r.ownerId !== props.myCreatorId) return false;
    return !q || `${r.id} ${r.title} ${r.owner}`.toLowerCase().includes(q);
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)));
const paged = computed(() => filtered.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize));

watch([search, onlyMine, kind, audience], () => (page.value = 1));
watch(kind, (k) => {
  if (!state.rows[k].length) load();
});
watch(audience, () => kind.value === 'MEMBERSHIP' && load());

const asList = (res) => (Array.isArray(res.data) ? res.data : res.data?.items || []);

const normalizers = {
  COMMITMENT: (i) => ({
    kind: 'COMMITMENT',
    id: String(i.id),
    productId: String(i.commitment?.templateId || i.templateId || ''),
    title: i.title,
    owner: i.creatorName || (i.creatorId ? `Creator ${i.creatorId}` : '—'),
    ownerId: i.creatorId,
    price: i.priceVnd,
    affiliateBps: i.affiliateShareBps,
    badge: i.availableUntil ? `Đến ${new Date(i.availableUntil).toLocaleDateString('vi-VN')}` : 'PUBLISHED',
    raw: i,
  }),
  VOUCHER: (i) => ({
    kind: 'VOUCHER',
    id: String(i.id),
    productId: String(i.id),
    title: i.name || i.title,
    owner: i.issuerName || (i.issuerId ? `Merchant ${i.issuerId}` : '—'),
    ownerId: String(i.issuerId ?? ''),
    price: i.salePrice,
    faceValue: i.faceValue,
    stock: i.remainingSupply,
    badge: i.remainingSupply === 0 ? 'HẾT HÀNG' : i.publicationStatus || 'ACTIVE',
    raw: i,
  }),
  MEMBERSHIP: (i) => ({
    kind: 'MEMBERSHIP',
    id: String(i.id),
    productId: String(i.id),
    code: i.code,
    title: i.name,
    owner: 'TrustWow',
    price: i.price,
    days: i.durationDays,
    perks: i.description || i.benefits || '',
    badge: Number(i.price) === 0 ? 'FREE' : i.isActive === false ? 'INACTIVE' : 'ACTIVE',
    raw: i,
  }),
};

async function fetchVouchers() {
  const out = [];
  let cursor;
  for (let p = 0; p < 10; p++) {
    const res = await listMarketplaceVouchers(props.session, { limit: 50, cursor });
    out.push(...asList(res));
    cursor = res.meta?.nextCursor;
    if (!cursor || !res.meta?.hasMore) break;
  }
  return out;
}

async function load() {
  state.loading = true;
  state.error = null;
  const k = kind.value;
  try {
    let list;
    if (k === 'COMMITMENT') list = await listAllCommitments(props.session);
    else if (k === 'VOUCHER') list = await fetchVouchers();
    else list = asList(await listMembershipPlans(props.session, audience.value));
    state.rows[k] = list
      .map(normalizers[k])
      .map((r) => (k === 'MEMBERSHIP' ? { ...r, audience: audience.value } : r));
    emit('loaded', k, state.rows[k]);
  } catch (err) {
    state.error = explainError(err);
  } finally {
    state.loading = false;
  }
}

function durationLabel(days) {
  if (!days) return 'Vĩnh viễn';
  if (days % 30 === 0) return `${days / 30} tháng (${days} ngày)`;
  return `${days} ngày`;
}

function badgeClass(b) {
  if (/HẾT|INACTIVE/.test(b)) return 'badge-failed';
  if (/FREE|ACTIVE|PUBLISHED/.test(b)) return 'badge-succeeded';
  return 'badge-approved';
}

const keyOf = (r) => `${r.kind}:${r.id}`;
onMounted(load);
defineExpose({ reload: load });
</script>

<template>
  <div class="catalog">
    <div class="catalog-toolbar">
      <div class="catalog-tabs">
        <button v-for="k in KINDS" :key="k.value" :class="{ on: kind === k.value }" @click="kind = k.value">
          {{ k.label }} <span class="count">{{ state.rows[k.value].length }}</span>
        </button>
      </div>
      <div class="catalog-filters">
        <input v-model="search" placeholder="🔍 Lọc theo tên / ID / người bán" />
        <select v-if="kind === 'MEMBERSHIP'" v-model="audience" title="Audience của API membership">
          <option value="web">/web/membership</option>
          <option value="mobile">/mobile/membership</option>
        </select>
        <label v-if="kind === 'COMMITMENT'" class="mine">
          <input v-model="onlyMine" type="checkbox" /> Chỉ creator của tôi ({{ myCreatorId || '?' }})
        </label>
        <button class="secondary" :disabled="state.loading" @click="load">{{ state.loading ? 'Đang tải…' : '↻ Tải lại' }}</button>
      </div>
    </div>

    <div v-if="state.error" class="callout warning">
      <strong><code>{{ state.error.code }}</code></strong> — {{ state.error.message }}
      <div v-if="state.error.hint" class="muted">{{ state.error.hint }}</div>
    </div>
    <div v-else-if="!state.loading && !filtered.length" class="callout info">Không có sản phẩm nào khớp bộ lọc.</div>

    <!-- Commitments & vouchers: table -->
    <div v-if="kind !== 'MEMBERSHIP' && filtered.length" class="table-container">
      <table>
        <thead>
          <tr v-if="kind === 'COMMITMENT'">
            <th>ID</th><th>Tên cam kết</th><th>Creator (người bán)</th><th>Giá niêm yết</th><th>Hoa hồng Affiliate</th><th>Trạng thái</th><th></th>
          </tr>
          <tr v-else>
            <th>ID</th><th>Tên Voucher / Quán ăn</th><th>Merchant sở hữu</th><th>Giá bán / Mệnh giá</th><th>Còn lại</th><th>Trạng thái</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in paged" :key="keyOf(r)" :class="{ picked: selectedKey === keyOf(r) }">
            <td><code>#{{ r.id }}</code></td>
            <td><strong>{{ r.title }}</strong></td>
            <td>
              {{ r.owner }}
              <span v-if="r.kind === 'COMMITMENT' && r.ownerId === myCreatorId" class="badge badge-succeeded tiny">MY CREATOR</span>
            </td>
            <td class="price">
              {{ vnd(r.price) }}
              <div v-if="r.kind === 'VOUCHER'" class="muted tiny">mệnh giá {{ vnd(r.faceValue) }}</div>
            </td>
            <td v-if="r.kind === 'COMMITMENT'">
              <span v-if="r.affiliateBps > 0" class="badge badge-approved">{{ (r.affiliateBps / 100).toFixed(2) }}%</span>
              <span v-else class="muted">0%</span>
            </td>
            <td v-else>{{ r.stock ?? '∞' }}</td>
            <td><span class="badge" :class="badgeClass(r.badge)">{{ r.badge }}</span></td>
            <td class="actions">
              <button class="success" :disabled="disabled || r.stock === 0" @click="emit('select', r)">Chọn mua</button>
              <button class="ghost" :disabled="disabled || r.stock === 0" @click="emit('add-to-cart', r)">+ Giỏ</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Plans: card grid -->
    <div v-else-if="kind === 'MEMBERSHIP' && filtered.length" class="plan-grid">
      <div v-for="r in paged" :key="keyOf(r)" class="plan-card" :class="{ picked: selectedKey === keyOf(r) }">
        <div class="plan-top">
          <code>{{ r.code || '#' + r.id }}</code>
          <span class="badge" :class="badgeClass(r.badge)">{{ r.badge }}</span>
        </div>
        <h4>{{ r.title }}</h4>
        <div class="plan-price">{{ vnd(r.price) }}</div>
        <div class="muted tiny">⏱ {{ durationLabel(r.days) }} · plan #{{ r.id }}</div>
        <p class="muted perks">{{ r.perks || 'Quyền lợi theo cấu hình plan.' }}</p>
        <button class="success" :disabled="disabled" @click="emit('select', r)">1-Click Checkout Plan</button>
      </div>
    </div>

    <div v-if="pageCount > 1" class="pager">
      <button class="ghost" :disabled="page <= 1" @click="page--">‹</button>
      <span>Trang {{ page }} / {{ pageCount }} · {{ filtered.length }} mục</span>
      <button class="ghost" :disabled="page >= pageCount" @click="page++">›</button>
    </div>
  </div>
</template>

<style scoped>
.catalog-toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.catalog-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.catalog-tabs button {
  background: var(--bg-surface-subtle);
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
}
.catalog-tabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
.count { opacity: 0.7; margin-left: 4px; font-size: 0.75rem; }
.catalog-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.catalog-filters input:not([type='checkbox']) { min-width: 260px; }
.mine { display: flex; gap: 6px; align-items: center; font-size: 0.8rem; }
.price { color: var(--success); font-weight: 600; white-space: nowrap; }
.tiny { font-size: 0.7rem; }
.actions { white-space: nowrap; }
.actions button { padding: 4px 10px; font-size: 0.75rem; margin-right: 4px; }
tr.picked { background: rgba(99, 102, 241, 0.15); }
.plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.plan-card {
  display: flex; flex-direction: column; gap: 6px; padding: 14px;
  background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
}
.plan-card.picked { border-color: var(--primary); }
.plan-top { display: flex; justify-content: space-between; align-items: center; }
.plan-price { font-size: 1.3rem; font-weight: 700; color: var(--success); }
.perks { font-size: 0.78rem; flex: 1; }
.pager { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 10px; font-size: 0.8rem; }
</style>
