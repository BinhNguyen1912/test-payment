<script setup>
// Admin editor for the 5 seller tax/fee groups (TRUST-912). Talks to the real admin API:
//   GET  /web/admin/finance/seller-policy-groups
//   GET  /web/admin/finance/seller-policy-groups/:group/versions
//   POST /web/admin/finance/seller-policy-groups/:group/versions  { expectedVersionNo, vatBps, pitBps, platformFeeBps, changeNote }
// Versions are append-only: "saving" always adds a new version; nothing is edited or deleted.
import { reactive, ref } from 'vue';
import { createSellerPolicyVersion, listSellerPolicyGroups, listSellerPolicyVersions, sessions, signIn } from '../api.js';

const admin = sessions.admin;
const GROUPS = [
  { key: 'CREATOR_INDIVIDUAL', label: 'Creator · Cá nhân', company: false },
  { key: 'CREATOR_HOUSEHOLD_BUSINESS', label: 'Creator · Hộ kinh doanh', company: false },
  { key: 'CREATOR_COMPANY', label: 'Creator · Công ty', company: true },
  { key: 'MERCHANT_HOUSEHOLD_BUSINESS', label: 'Merchant · Hộ kinh doanh', company: false },
  { key: 'MERCHANT_COMPANY', label: 'Merchant · Công ty', company: true },
];
// Suggested values only (code seed defaults); the real figures are the accountants' decision.
const SUGGEST = {
  CREATOR_INDIVIDUAL: { fee: 10, vat: 5, pit: 5 },
  CREATOR_HOUSEHOLD_BUSINESS: { fee: 10, vat: 5, pit: 5 },
  CREATOR_COMPANY: { fee: 10, vat: 0, pit: 0 },
  MERCHANT_HOUSEHOLD_BUSINESS: { fee: 10, vat: 5, pit: 2 },
  MERCHANT_COMPANY: { fee: 10, vat: 0, pit: 0 },
};

const current = reactive({});
const form = reactive({});
const history = reactive({});
const busy = ref(false);
const msg = ref('');
const err = ref('');
for (const g of GROUPS) form[g.key] = { fee: '', vat: '', pit: '', note: '' };

const bps = (pct) => Math.round(Number(String(pct).replace(',', '.')) * 100);
const pct = (b) => (b === null || b === undefined ? '—' : `${b / 100}%`);
const fail = (e) => { err.value = `${e.code || ''} ${e.message || e}`.trim(); msg.value = ''; };

async function doSignIn() {
  busy.value = true; err.value = ''; msg.value = '';
  try { await signIn(admin); msg.value = `Đăng nhập: ${admin.identifier}`; await load(); } catch (e) { fail(e); } finally { busy.value = false; }
}

async function load() {
  busy.value = true; err.value = '';
  try {
    const res = await listSellerPolicyGroups(admin);
    for (const row of res.data?.items || res.data || []) {
      current[row.group] = row.current;
      const f = form[row.group];
      if (row.current && !f.fee && !f.vat && !f.pit) {
        f.fee = String(row.current.platformFeeBps / 100); f.vat = String(row.current.vatBps / 100); f.pit = String(row.current.pitBps / 100);
      }
    }
    msg.value = 'Đã tải 5 nhóm từ BE.';
  } catch (e) { fail(e); } finally { busy.value = false; }
}

function suggest(key) {
  const s = SUGGEST[key];
  Object.assign(form[key], { fee: String(s.fee), vat: String(s.vat), pit: String(s.pit) });
}
function suggestAll() { GROUPS.forEach((g) => suggest(g.key)); }

function problem(g) {
  const f = form[g.key];
  const vals = [f.fee, f.vat, f.pit];
  if (vals.some((v) => v === '' || Number.isNaN(Number(String(v).replace(',', '.'))))) return 'Nhập đủ phí, VAT, PIT (đơn vị %).';
  const [fee, vat, pit] = vals.map(bps);
  if ([fee, vat, pit].some((b) => !Number.isInteger(b) || b < 0 || b > 9999)) return 'Mỗi tỉ lệ phải từ 0% đến 99.99%.';
  if (fee + vat + pit >= 10000) return 'Tổng phí + VAT + PIT phải < 100%.';
  if (g.company && (vat !== 0 || pit !== 0)) return 'Nhóm công ty: VAT và PIT phải bằng 0.';
  if (!f.note.trim()) return 'Cần ghi chú lý do / căn cứ pháp lý.';
  return '';
}

async function save(g) {
  const f = form[g.key];
  busy.value = true; err.value = ''; msg.value = '';
  try {
    const res = await createSellerPolicyVersion(admin, g.key, {
      expectedVersionNo: current[g.key]?.versionNo ?? 0,
      platformFeeBps: bps(f.fee), vatBps: bps(f.vat), pitBps: bps(f.pit), changeNote: f.note.trim(),
    });
    current[g.key] = res.data;
    f.note = '';
    msg.value = `${g.key}: đã thêm phiên bản v${res.data?.versionNo}.`;
    if (history[g.key]) await loadHistory(g.key);
  } catch (e) {
    fail(e);
    if (e.code === 'FINANCE_SELLER_POLICY_VERSION_CONFLICT') err.value += ' — phiên bản đã đổi, bấm "Tải lại" rồi lưu lại.';
  } finally { busy.value = false; }
}

async function loadHistory(key) {
  try {
    const res = await listSellerPolicyVersions(admin, key);
    history[key] = res.data?.items || res.data || [];
  } catch (e) { fail(e); }
}
</script>

<template>
  <section class="mf-stage" style="border: 2px solid #16a34a;">
    <div class="mf-sh"><b>Cấu hình thuế / phí theo nhóm người bán (nhập tay)</b> <code>POST /web/admin/finance/seller-policy-groups/:group/versions</code> <code>DB: finance_seller_policy_versions</code> (append-only) · hồ sơ người bán: <code>sub_account_profiles</code> (legal_entity_type, tax_code)</div>
    <p class="mf-mut">
      Checkout cần nhóm người bán đã có phiên bản policy. Mỗi lần lưu <b>thêm một phiên bản mới</b> (không sửa, không xóa được bản cũ), áp dụng cho đơn phát sinh sau đó.
      Cần tài khoản admin có quyền <code>FinanceConfigRead</code> / <code>FinanceConfigManage</code>. Công ty: VAT và PIT bắt buộc 0%.
    </p>

    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0;">
      <input v-model="admin.identifier" placeholder="Email / SĐT admin" style="min-width: 240px;" />
      <input v-model="admin.password" type="password" placeholder="Mật khẩu admin" style="min-width: 160px;" />
      <button :disabled="busy || !admin.identifier || !admin.password" @click="doSignIn">{{ admin.accessToken ? 'Đăng nhập lại' : 'Đăng nhập' }}</button>
      <button :disabled="busy || !admin.accessToken" @click="load">Tải lại từ BE</button>
      <button :disabled="busy" @click="suggestAll">Điền số seed mặc định của code (chỉ gợi ý)</button>
      <span v-if="admin.accessToken" class="mf-pill mf-g">đã đăng nhập</span>
    </div>
    <p v-if="msg" class="mf-mut" style="color: #15803d;">{{ msg }}</p>
    <p v-if="err" class="mf-err">{{ err }}</p>

    <table class="mf-t">
      <thead><tr><th>Nhóm<div class="mf-mut">group_code</div></th><th>Hiện tại (v)<div class="mf-mut">version_no</div></th><th>Phí sàn %<div class="mf-mut">platform_fee_bps ÷ 100</div></th><th>VAT %<div class="mf-mut">vat_bps ÷ 100</div></th><th>PIT %<div class="mf-mut">pit_bps ÷ 100</div></th><th>Ghi chú / căn cứ<div class="mf-mut">change_note</div></th><th></th></tr></thead>
      <tbody>
        <template v-for="g in GROUPS" :key="g.key">
          <tr>
            <td><b>{{ g.label }}</b><div class="mf-mut"><code>{{ g.key }}</code></div></td>
            <td>
              <template v-if="current[g.key]">v{{ current[g.key].versionNo }}<div class="mf-mut">phí {{ pct(current[g.key].platformFeeBps) }} · VAT {{ pct(current[g.key].vatBps) }} · PIT {{ pct(current[g.key].pitBps) }}</div></template>
              <span v-else class="mf-mut">chưa có</span>
            </td>
            <td><input v-model="form[g.key].fee" style="width: 64px;" /></td>
            <td><input v-model="form[g.key].vat" style="width: 64px;" :disabled="g.company" /></td>
            <td><input v-model="form[g.key].pit" style="width: 64px;" :disabled="g.company" /></td>
            <td><input v-model="form[g.key].note" placeholder="vd: Test dev, chờ kế toán chốt" style="min-width: 220px;" /></td>
            <td style="white-space: nowrap;">
              <button :disabled="busy || !admin.accessToken || !!problem(g)" :title="problem(g)" @click="save(g)">Lưu phiên bản mới</button>
              <button class="secondary" :disabled="busy || !admin.accessToken" @click="loadHistory(g.key)">Lịch sử</button>
              <button class="secondary" :disabled="busy" @click="suggest(g.key)">Gợi ý</button>
            </td>
          </tr>
          <tr v-if="problem(g) && (form[g.key].fee || form[g.key].vat || form[g.key].pit || form[g.key].note)"><td colspan="7" class="mf-mut" style="color: #b45309;">⚠ {{ problem(g) }}</td></tr>
          <tr v-if="history[g.key]"><td colspan="7">
            <div v-for="v in history[g.key]" :key="v.id" class="mf-mut">v{{ v.versionNo }} · phí {{ pct(v.platformFeeBps) }} · VAT {{ pct(v.vatBps) }} · PIT {{ pct(v.pitBps) }} · {{ v.createdAt }} · {{ v.changeNote }}</div>
            <div v-if="!history[g.key].length" class="mf-mut">Chưa có phiên bản nào.</div>
          </td></tr>
        </template>
      </tbody>
    </table>
  </section>
</template>
