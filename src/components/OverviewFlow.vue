<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { ctx } from '../ctxStore.js';

// "Tổng hợp": ONE page for one order. Everything the DB holds for the order (read-only through the lineage server):
// checks → per-unit split → who gets what → journals → every raw table → every involved party's ledger.
const open = ref(location.hash.startsWith('#overview'));
const orderId = ref('');
const orders = ref([]);
const res = ref(null);
const partyData = ref([]);
const err = ref('');
const loading = ref(false);
const auto = ref(false);
let timer = null;

const post = async (path, body = {}) => {
  const r = await fetch(`/lineage${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
const hint = (e) => `${e.message} — lineage server chạy chưa / chưa restart? (npm run lineage)`;

async function loadOrders() {
  try { orders.value = (await post('/orders', { limit: 80 })).orders || []; err.value = ''; }
  catch (e) { err.value = hint(e); }
}
async function run() {
  const id = String(orderId.value || ctx.orderId || '').trim();
  if (!id) { err.value = 'Chọn hoặc nhập orderId.'; return; }
  orderId.value = id; ctx.orderId = id;
  loading.value = true; err.value = '';
  try {
    res.value = await post('/trace', { orderId: id });
    const ids = new Map();
    const add = (pid, role) => { if (pid && !ids.has(String(pid))) ids.set(String(pid), new Set()); if (pid) ids.get(String(pid)).add(role); };
    add(order.value?.user_id, 'Người mua');
    units.value.forEach((u) => { add(u.seller_user_id, /VOUCHER/.test(u.product_type) ? 'Merchant (voucher)' : 'Creator'); add(u.affiliate_user_id, 'Affiliate'); });
    const out = [];
    for (const [pid, roles] of [...ids.entries()].slice(0, 10)) {
      try { out.push({ id: pid, roles: [...roles], ...(await post('/party', { partyId: pid, limit: 15 })) }); }
      catch (e) { out.push({ id: pid, roles: [...roles], error: e.message }); }
    }
    partyData.value = out;
  } catch (e) { err.value = hint(e); }
  finally { loading.value = false; }
}
function pick(id) { orderId.value = String(id); run(); }
function toggleAuto() { auto.value = !auto.value; clearInterval(timer); if (auto.value) timer = setInterval(run, 5000); }
function show() { open.value = true; if (!orders.value.length) loadOrders(); if (!res.value && (orderId.value || ctx.orderId)) { orderId.value = orderId.value || ctx.orderId; run(); } }
onBeforeUnmount(() => clearInterval(timer));
{
  const h = new URLSearchParams(location.hash.replace(/^#overview&?/, ''));
  if (h.get('order')) orderId.value = h.get('order');
  if (open.value) setTimeout(() => { loadOrders(); if (orderId.value) run(); }, 0);
}

// ---------- helpers
const B = (v) => { try { return BigInt(v ?? 0); } catch { return 0n; } };
const money = (v) => (v === null || v === undefined || v === '' ? '—' : B(v).toLocaleString('vi-VN'));
const stage = (k) => res.value?.stages?.find((s) => s.key === k);
const rows = (k) => stage(k)?.rows || [];
const cell = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const cols = (rs) => { const m = new Set(); rs.forEach((r) => Object.entries(r).forEach(([k, v]) => { if (v === null || typeof v !== 'object') m.add(k); })); return [...m]; };
const objCols = (rs) => { const m = new Set(); rs.forEach((r) => Object.entries(r).forEach(([k, v]) => { if (v && typeof v === 'object') m.add(k); })); return [...m]; };
const json = (v) => JSON.stringify(v, null, 2);
const pill = (s) => (['SUCCESS', 'FULFILLED', 'POSTED', 'ACTIVE', 'SUCCEEDED', 'RECOGNIZED'].includes(s) ? 'ov-g' : ['FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED', 'MISSING'].includes(s) ? 'ov-r' : 'ov-y');

const ACC = {
  BANK_CASH: 'Tiền ở ngân hàng của sàn', VNPAY_CLEARING: 'VNPay thu hộ, chưa về ngân hàng', CUSTOMER_FUNDS_HELD: 'Tiền khách sàn giữ hộ (chưa chia)',
  CREATOR_PAYABLE: 'Sàn nợ Creator', MERCHANT_PAYABLE: 'Sàn nợ Merchant', AFFILIATE_PAYABLE: 'Sàn nợ Affiliate',
  PLATFORM_COMMISSION_REVENUE: 'Doanh thu phí sàn', TAX_WITHHOLDING_PAYABLE: 'Thuế TNCN khấu trừ phải nộp (3335)', CREATOR_VAT_WITHHOLDING_PAYABLE: 'VAT khấu trừ Creator phải nộp (3331)', MERCHANT_VAT_WITHHOLDING_PAYABLE: 'VAT khấu trừ Merchant phải nộp (3331)', PAYOUT_IN_TRANSIT: 'Tiền đang rút (chờ ngân hàng)',
  MEMBERSHIP_DEFERRED_REVENUE: 'Doanh thu hội viên hoãn', VAT_OUTPUT_PAYABLE: 'VAT đầu ra phải nộp',
};

// ---------- data
const order = computed(() => rows('order')[0]);
const units = computed(() => rows('units'));
const journals = computed(() => rows('journals'));
const lines = computed(() => rows('lines'));
const linesOf = (jid) => lines.value.filter((l) => String(l.journal_id) === String(jid));
const sumSide = (ls, side, code) => ls.filter((l) => l.side === side && (!code || (Array.isArray(code) ? code : [code]).includes(l.account_code))).reduce((a, l) => a + B(l.amount_minor), 0n);
// Withheld tax is split over 3 accounts: PIT -> 3335 TAX_WITHHOLDING_PAYABLE, creator VAT -> 3331, merchant VAT -> 3331 (separate account codes).
const TAX_ACCOUNTS = ['TAX_WITHHOLDING_PAYABLE', 'CREATOR_VAT_WITHHOLDING_PAYABLE', 'MERCHANT_VAT_WITHHOLDING_PAYABLE'];
const isVoucherUnit = (u) => /VOUCHER/.test(String(u.product_type));

const journalOfUnit = (u) => {
  let j = journals.value.find((x) => String(x.event_key).endsWith(`UNIT:${u.id}`));
  if (!j && isVoucherUnit(u) && u.reserved_voucher_id) {
    const red = rows('reds').filter((r) => String(r.voucher_id) === String(u.reserved_voucher_id));
    j = journals.value.find((x) => x.source_type === 'VOUCHER_REDEMPTION' && red.some((r) => String(r.id) === String(x.source_id)));
  }
  return j;
};
const unitRows = computed(() => units.value.map((u) => {
  const gross = B(u.amount_vnd);
  const j = journalOfUnit(u);
  const ls = j ? linesOf(j.id) : [];
  const vch = isVoucherUnit(u);
  const expAff = (gross * B(u.affiliate_share_bps) + 5000n) / 10000n;
  const parts = {
    net: sumSide(ls, 'CREDIT', ['CREATOR_PAYABLE', 'MERCHANT_PAYABLE']), fee: sumSide(ls, 'CREDIT', 'PLATFORM_COMMISSION_REVENUE'),
    tax: sumSide(ls, 'CREDIT', TAX_ACCOUNTS), pit: sumSide(ls, 'CREDIT', 'TAX_WITHHOLDING_PAYABLE'), aff: sumSide(ls, 'CREDIT', 'AFFILIATE_PAYABLE'),
  };
  // Every credit line of the unit's journal, whatever the account: nothing the BE posts can fall outside the sum.
  const allCredits = ls.filter((l) => l.side === 'CREDIT');
  const total = allCredits.reduce((a, l) => a + B(l.amount_minor), 0n);
  parts.other = total - parts.net - parts.fee - parts.tax - parts.aff;
  const state = j ? 'RECOGNIZED' : vch ? 'HELD' : u.status === 'FULFILLED' ? 'MISSING' : 'WAIT';
  return { u, gross, j, vch, parts, expAff, sum: total, allCredits, state,
    payable: vch ? 'MERCHANT_PAYABLE' : 'CREATOR_PAYABLE' };
}));
const STATE_TXT = { RECOGNIZED: 'Đã ghi nhận doanh thu', HELD: 'Đang giữ hộ — chờ redeem', MISSING: 'THIẾU bút toán ghi nhận', WAIT: 'Chờ giao hàng' };

// VAS code/name per account, read from the lines the BE returned (finance_accounts.vas_account_code).
const VAS_FALLBACK = {
  BANK_CASH: ['1121', 'Tiền Việt Nam'], VNPAY_CLEARING: ['1388', 'Phải thu khác'], CUSTOMER_FUNDS_HELD: ['3387', 'Doanh thu chưa thực hiện'],
  MERCHANT_PAYABLE: ['3388', 'Phải trả, phải nộp khác'], CREATOR_PAYABLE: ['3388', 'Phải trả, phải nộp khác'], AFFILIATE_PAYABLE: ['3388', 'Phải trả, phải nộp khác'],
  PAYOUT_IN_TRANSIT: ['3388', 'Phải trả, phải nộp khác'], TAX_WITHHOLDING_PAYABLE: ['3335', 'Thuế thu nhập cá nhân'],
  PLATFORM_COMMISSION_REVENUE: ['5113', 'Doanh thu cung cấp dịch vụ'], MARKETPLACE_FEE_REVENUE: ['5113', 'Doanh thu cung cấp dịch vụ'], MEMBERSHIP_REVENUE: ['5113', 'Doanh thu cung cấp dịch vụ'],
  PAYMENT_GATEWAY_FEE_EXPENSE: ['6427', 'Chi phí dịch vụ mua ngoài'], PAYOUT_BANK_FEE_EXPENSE: ['6427', 'Chi phí dịch vụ mua ngoài'], ROUNDING_ADJUSTMENT: ['811', 'Chi phí khác'],
  MEMBERSHIP_DEFERRED_REVENUE: ['3387', 'Doanh thu chưa thực hiện'], VAT_OUTPUT_PAYABLE: ['33311', 'Thuế GTGT đầu ra'], VOUCHER_BREAKAGE_INCOME: ['711', 'Thu nhập khác'],
  CORPORATE_INCOME_TAX_EXPENSE: ['8211', 'Chi phí thuế TNDN hiện hành'], CORPORATE_INCOME_TAX_PAYABLE: ['3334', 'Thuế thu nhập doanh nghiệp'],
  MERCHANT_VAT_WITHHOLDING_PAYABLE: ['3331', 'Thuế GTGT phải nộp - nộp thay Merchant'], CREATOR_VAT_WITHHOLDING_PAYABLE: ['3331', 'Thuế GTGT phải nộp - nộp thay Creator'],
  VOUCHER_EXCHANGE_DIFFERENCE_INCOME: ['711', 'Thu nhập khác - chênh lệch đổi voucher'],
};
const vas = (code, l) => {
  const c = l?.vas_account_code || VAS_FALLBACK[code]?.[0];
  const n = l?.vas_account_name || VAS_FALLBACK[code]?.[1];
  return c ? { code: c, name: n || '' } : { code: '', name: '' };
};
const vasOf = (code) => { const v = vas(code, lines.value.find((x) => x.account_code === code)); return v.code ? `${v.code} ${v.name}` : ''; };

const position = computed(() => {
  const m = new Map();
  lines.value.forEach((l) => {
    const k = `${l.party_type}|${l.party_id}|${l.account_code}`;
    const e = m.get(k) || { party_type: l.party_type, party_id: l.party_id, account: l.account_code, debit: 0n, credit: 0n, n: 0 };
    if (l.side === 'DEBIT') e.debit += B(l.amount_minor); else e.credit += B(l.amount_minor);
    e.n += 1; m.set(k, e);
  });
  return [...m.values()].map((e) => ({ ...e, net: e.credit - e.debit })).sort((a, b) => String(a.party_type + a.party_id).localeCompare(b.party_type + b.party_id));
});
const totals = computed(() => {
  const captured = sumSide(journals.value.filter((j) => j.event_type === 'PAYMENT_CAPTURED').flatMap((j) => linesOf(j.id)), 'CREDIT', 'CUSTOMER_FUNDS_HELD');
  const released = sumSide(lines.value, 'DEBIT', 'CUSTOMER_FUNDS_HELD');
  const o = { captured, released, held: captured - released };
  o.creator = position.value.filter((p) => p.account === 'CREATOR_PAYABLE').reduce((a, p) => a + p.net, 0n);
  o.merchant = position.value.filter((p) => p.account === 'MERCHANT_PAYABLE').reduce((a, p) => a + p.net, 0n);
  o.fee = position.value.filter((p) => p.account === 'PLATFORM_COMMISSION_REVENUE').reduce((a, p) => a + p.net, 0n);
  o.tax = position.value.filter((p) => TAX_ACCOUNTS.includes(p.account)).reduce((a, p) => a + p.net, 0n);
  o.aff = position.value.filter((p) => p.account === 'AFFILIATE_PAYABLE').reduce((a, p) => a + p.net, 0n);
  return o;
});

// Accounts that have no dedicated card above: shown automatically so a new account code never disappears.
const KNOWN_CARD_ACCOUNTS = ['CREATOR_PAYABLE', 'MERCHANT_PAYABLE', 'AFFILIATE_PAYABLE', 'PLATFORM_COMMISSION_REVENUE', 'CUSTOMER_FUNDS_HELD', ...TAX_ACCOUNTS];
const otherAccounts = computed(() => {
  const m = new Map();
  position.value.filter((p) => !KNOWN_CARD_ACCOUNTS.includes(p.account)).forEach((p) => m.set(p.account, (m.get(p.account) || 0n) + p.net));
  return [...m.entries()].map(([account, net]) => ({ account, net }));
});

const checks = computed(() => {
  const c = [];
  const o = order.value;
  if (!o) return c;
  const push = (ok, label, detail = '', level) => c.push({ ok, label, detail, level: level || (ok ? 'ok' : 'bad') });
  const paid = o.status === 'SUCCESS';
  push(paid, `Thanh toán SUCCESS (hiện: ${o.status})`, '', paid ? 'ok' : 'info');
  if (paid) push(totals.value.captured === B(o.amount_vnd), 'PAYMENT_CAPTURED = tổng đơn', `ghi ${money(totals.value.captured)} · đơn ${money(o.amount_vnd)}`);
  journals.value.forEach((j) => {
    const ls = linesOf(j.id); const d = sumSide(ls, 'DEBIT'); const cr = sumSide(ls, 'CREDIT');
    push(d === cr && ls.length > 0, `Journal #${j.id} ${j.event_type} cân Nợ = Có`, `Nợ ${money(d)} · Có ${money(cr)}`);
  });
  if (units.value.length) {
    const g = units.value.reduce((a, u) => a + B(u.amount_vnd), 0n);
    push(g === B(o.amount_vnd), 'Σ giá các unit = tổng đơn', `${money(g)} vs ${money(o.amount_vnd)}`);
  }
  unitRows.value.forEach((r) => {
    const tag = `Unit #${r.u.id}`;
    if (r.state === 'MISSING') push(false, `${tag}: đã FULFILLED nhưng KHÔNG có journal FULFILLMENT_RECOGNIZED`, 'creator chưa được ghi nhận tiền');
    else if (r.state === 'HELD') push(true, `${tag}: voucher chưa redeem → tiền nằm ở CUSTOMER_FUNDS_HELD`, `${money(r.gross)}₫`, 'info');
    else if (r.state === 'WAIT') push(true, `${tag}: chờ giao hàng (${r.u.status})`, '', 'info');
    else {
      push(r.sum === r.gross && B(r.j.id) > 0n, `${tag}: Σ tất cả dòng Có của journal = giá bán (người bán + phí + thuế VAT/TNCN + affiliate + khác)`, `${money(r.sum)} vs ${money(r.gross)}`);
      if (B(r.u.affiliate_share_bps) > 0n) push(r.parts.aff === r.expAff, `${tag}: affiliate ${Number(r.u.affiliate_share_bps) / 100}% đúng`, `kỳ vọng ${money(r.expAff)} · ghi ${money(r.parts.aff)}`);
      else push(r.parts.aff === 0n, `${tag}: không có affiliate nên không có AFFILIATE_PAYABLE`, `ghi ${money(r.parts.aff)}`);
      const l = linesOf(r.j.id).find((x) => x.account_code === r.payable);
      push(!!l && String(l.party_id) === String(r.u.seller_user_id), `${tag}: ${r.payable} ghi đúng người bán #${r.u.seller_user_id}`, l ? `ghi cho ${l.party_type}/${l.party_id}` : 'không có dòng');
    }
  });
  if (units.value.length) {
    const exp = unitRows.value.filter((r) => r.state !== 'RECOGNIZED').reduce((a, r) => a + (['HELD', 'WAIT'].includes(r.state) ? r.gross : 0n), 0n);
    if (paid) push(totals.value.held === exp, 'CUSTOMER_FUNDS_HELD còn lại = tiền các unit chưa ghi nhận', `còn ${money(totals.value.held)} · kỳ vọng ${money(exp)}`);
  }
  return c;
});
const badCount = computed(() => checks.value.filter((x) => x.level === 'bad').length);

const stages = computed(() => res.value?.stages || []);
const WHO = { CREATOR: 'Creator', MERCHANT: 'Merchant', AFFILIATE: 'Affiliate', CUSTOMER: 'Khách', PLATFORM: 'Sàn', TAX_AUTHORITY: 'Thuế', VNPAY: 'VNPay' };
</script>

<template>
  <button class="ov-fab" @click="show">📊 Tổng hợp</button>
  <div v-if="open" class="ov">
    <header class="ov-head">
      <b>📊 Tổng hợp dòng tiền theo đơn</b>
      <select @change="pick($event.target.value)">
        <option value="">— chọn đơn (từ DB, mới nhất trước) —</option>
        <option v-for="o in orders" :key="o.id" :value="o.id" :selected="String(o.id) === String(orderId)">#{{ o.id }} · {{ money(o.amount_vnd) }}₫ · {{ o.status }}/{{ o.fulfillment_status }} · {{ o.purpose }}{{ o.units ? ` · ${o.units} unit` : '' }}</option>
      </select>
      <input v-model="orderId" placeholder="orderId" style="width: 90px" @keyup.enter="run" />
      <button class="ov-go" :disabled="loading" @click="run">{{ loading ? 'Đang tải…' : 'Tổng hợp' }}</button>
      <button @click="loadOrders">↻ danh sách đơn</button>
      <button :class="{ 'ov-on': auto }" @click="toggleAuto">{{ auto ? 'Dừng tự làm mới' : 'Tự làm mới 5s' }}</button>
      <span class="ov-sp" />
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="err" class="ov-err">{{ err }}</p>
    <p v-if="!res && !err" class="ov-mut ov-pad">Chọn một đơn ở trên rồi bấm “Tổng hợp”.</p>

    <div v-if="res" class="ov-body">
      <p v-if="res.note" class="ov-err">{{ res.note }}</p>
      <template v-else>
        <!-- 1. SUMMARY -->
        <section class="ov-cards">
          <div class="ov-card"><div class="ov-k">Đơn #{{ orderId }}</div><b class="ov-big">{{ money(order.amount_vnd) }}₫</b>
            <div>thanh toán <span :class="['ov-pill', pill(order.status)]">{{ order.status }}</span></div>
            <div>giao hàng <span :class="['ov-pill', pill(order.fulfillment_status)]">{{ order.fulfillment_status }}</span></div>
            <div class="ov-mut">{{ order.purpose }} · buyer #{{ order.user_id }} · {{ units.length }} unit · bảng payment_orders, cart_checkout_units</div></div>
          <div class="ov-card"><div class="ov-k">Creator nhận</div><b class="ov-big">{{ money(totals.creator) }}₫</b><div class="ov-mut">CREATOR_PAYABLE · finance_journal_lines</div></div>
          <div class="ov-card"><div class="ov-k">Merchant nhận</div><b class="ov-big">{{ money(totals.merchant) }}₫</b><div class="ov-mut">MERCHANT_PAYABLE · finance_journal_lines</div></div>
          <div class="ov-card"><div class="ov-k">Affiliate</div><b class="ov-big">{{ money(totals.aff) }}₫</b><div class="ov-mut">AFFILIATE_PAYABLE · finance_journal_lines</div></div>
          <div class="ov-card"><div class="ov-k">Phí sàn</div><b class="ov-big">{{ money(totals.fee) }}₫</b><div class="ov-mut">PLATFORM_COMMISSION_REVENUE · finance_journal_lines</div></div>
          <div class="ov-card"><div class="ov-k">Thuế khấu trừ</div><b class="ov-big">{{ money(totals.tax) }}₫</b><div class="ov-mut">VAT (3331) + TNCN (3335) · finance_journal_lines</div></div>
          <div v-for="a in otherAccounts" :key="a.account" class="ov-card"><div class="ov-k">{{ ACC[a.account] || a.account }}</div><b class="ov-big">{{ money(a.net) }}₫</b><div class="ov-mut">{{ a.account }} · finance_journal_lines</div></div>
          <div class="ov-card" :class="totals.held > 0n ? 'ov-warn' : ''"><div class="ov-k">Đang giữ hộ khách</div><b class="ov-big">{{ money(totals.held) }}₫</b><div class="ov-mut">CUSTOMER_FUNDS_HELD (chưa chia) · finance_journal_lines</div></div>
        </section>

        <!-- 2. CHECKS -->
        <section class="ov-sec">
          <h3>1. Kiểm tra tự động <code class="ov-tbl">payment_orders · cart_checkout_units · finance_journals · finance_journal_lines</code> <span :class="['ov-pill', badCount ? 'ov-r' : 'ov-g']">{{ badCount ? `${badCount} LỖI` : 'không có lỗi' }}</span></h3>
          <table class="ov-t"><tbody>
            <tr v-for="(k, i) in checks" :key="i" :class="'ov-row-' + k.level"><td class="ov-ic">{{ k.level === 'ok' ? '✅' : k.level === 'bad' ? '❌' : 'ℹ️' }}</td><td>{{ k.label }}</td><td class="ov-mut">{{ k.detail }}</td></tr>
          </tbody></table>
        </section>

        <!-- 3. PER UNIT -->
        <section class="ov-sec">
          <h3>2. Từng unit được chia thế nào <code class="ov-tbl">cart_checkout_units</code> + <code class="ov-tbl">finance_journal_lines</code> + <code class="ov-tbl">finance_accounts</code></h3>
          <p v-if="!unitRows.length" class="ov-mut">Đơn này không có cart unit (mua lẻ) — xem journal ở mục 4.</p>
          <div v-else class="ov-tw"><table class="ov-t"><thead><tr>
            <th>Unit<div class="ov-col">cart_checkout_units.id / unit_no / status</div></th><th>Loại<div class="ov-col">.product_type</div></th><th>Sản phẩm<div class="ov-col">.product_name</div></th><th>Người bán<div class="ov-col">.seller_user_id</div></th><th class="ov-n">Giá bán<div class="ov-col">.amount_vnd</div></th><th class="ov-n">Người bán nhận</th><th class="ov-n">Phí sàn</th><th class="ov-n">Thuế (VAT + TNCN)</th><th class="ov-n">Affiliate</th><th class="ov-n">Khác</th><th class="ov-n">Σ tất cả dòng Có</th><th>Journal<div class="ov-col">finance_journals.id</div></th><th>Trạng thái ghi sổ</th></tr></thead><tbody>
            <tr v-for="r in unitRows" :key="r.u.id">
              <td>#{{ r.u.id }}<div class="ov-mut">no.{{ r.u.unit_no }} · {{ r.u.status }}</div></td><td>{{ r.u.product_type }}</td><td>{{ r.u.product_name || r.u.product_id }}</td>
              <td>{{ r.u.seller_user_id }}<div class="ov-mut">{{ r.payable }}</div></td>
              <td class="ov-n"><b>{{ money(r.gross) }}</b></td>
              <td class="ov-n">{{ r.j ? money(r.parts.net) : '—' }}</td><td class="ov-n">{{ r.j ? money(r.parts.fee) : '—' }}</td><td class="ov-n">{{ r.j ? money(r.parts.tax) : '—' }}</td>
              <td class="ov-n">{{ r.j ? money(r.parts.aff) : '—' }}<div class="ov-mut">{{ r.u.affiliate_user_id ? `#${r.u.affiliate_user_id} · ${Number(r.u.affiliate_share_bps) / 100}%` : 'không có' }}</div></td>
              <td class="ov-n" :class="r.j && r.parts.other !== 0n ? 'ov-bad' : ''">{{ r.j ? money(r.parts.other) : '—' }}</td>
              <td class="ov-n" :class="r.j && r.sum !== r.gross ? 'ov-bad' : ''">{{ r.j ? money(r.sum) : '—' }}
                <div v-for="l in r.allCredits" :key="l.id" class="ov-mut" style="font-size:0.68rem;white-space:nowrap;text-align:right">{{ l.account_code }} [{{ vas(l.account_code, l).code }}]<template v-if="l.metadata?.chargeCode"> · {{ l.metadata.chargeCode }}</template>: {{ money(l.amount_minor) }}</div></td>
              <td>{{ r.j ? `#${r.j.id}` : '—' }}</td>
              <td><span :class="['ov-pill', pill(r.state)]">{{ STATE_TXT[r.state] }}</span></td></tr>
          </tbody><tfoot><tr><td colspan="4">Σ</td><td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.gross, 0n)) }}</td>
            <td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.parts.net, 0n)) }}</td><td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.parts.fee, 0n)) }}</td>
            <td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.parts.tax, 0n)) }}</td><td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.parts.aff, 0n)) }}</td><td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.parts.other, 0n)) }}</td><td class="ov-n">{{ money(unitRows.reduce((a, r) => a + r.sum, 0n)) }}</td><td colspan="2" /></tr></tfoot></table></div>
        </section>

        <!-- 4. POSITION -->
        <section class="ov-sec">
          <h3>3. Ai đang giữ / được nhận bao nhiêu từ đơn này (theo bên × tài khoản) <code class="ov-tbl">finance_journal_lines</code> JOIN <code class="ov-tbl">finance_accounts</code> (gộp theo party_type, party_id, account)</h3>
          <p v-if="!position.length" class="ov-mut">Chưa có bút toán.</p>
          <table v-else class="ov-t"><thead><tr><th>Bên<div class="ov-col">finance_journal_lines.party_type</div></th><th>Id<div class="ov-col">.party_id</div></th><th>Tài khoản<div class="ov-col">finance_accounts.code</div></th><th>VAS<div class="ov-col">finance_accounts.vas_account_code / vas_account_name</div></th><th>Ý nghĩa</th><th class="ov-n">Tổng Nợ<div class="ov-col">SUM(amount_minor) side=DEBIT</div></th><th class="ov-n">Tổng Có<div class="ov-col">SUM(amount_minor) side=CREDIT</div></th><th class="ov-n">Có − Nợ</th><th class="ov-n">Dòng<div class="ov-col">COUNT(*)</div></th></tr></thead><tbody>
            <tr v-for="p in position" :key="p.party_type + p.party_id + p.account"><td>{{ WHO[p.party_type] || p.party_type }}</td><td>{{ p.party_id }}</td><td><b>{{ p.account }}</b></td><td>{{ vasOf(p.account) }}</td><td class="ov-mut">{{ ACC[p.account] }}</td>
              <td class="ov-n">{{ money(p.debit) }}</td><td class="ov-n">{{ money(p.credit) }}</td><td class="ov-n"><b>{{ money(p.net) }}</b></td><td class="ov-n">{{ p.n }}</td></tr>
          </tbody></table>
        </section>

        <!-- 5. JOURNALS -->
        <section class="ov-sec">
          <h3>4. Toàn bộ bút toán (Nợ / Có) <code class="ov-tbl">finance_journals</code> + <code class="ov-tbl">finance_journal_lines</code> + <code class="ov-tbl">finance_accounts</code> <span class="ov-pill ov-g">{{ journals.length }} journal</span></h3>
          <div v-for="j in journals" :key="j.id" class="ov-jr">
            <div><b>#{{ j.id }}</b> <span class="ov-pill ov-b">{{ j.event_type }}</span> <span class="ov-mut">{{ j.event_key }} · nguồn {{ j.source_type }}:{{ j.source_id }} · {{ j.status }} · {{ j.occurred_at }}</span></div>
            <table class="ov-t"><thead><tr><th>Dòng<div class="ov-col">finance_journal_lines.id</div></th><th>Tài khoản<div class="ov-col">finance_accounts.code</div></th><th>VAS<div class="ov-col">finance_accounts.vas_*</div></th><th class="ov-n">Nợ<div class="ov-col">amount_minor (side=DEBIT)</div></th><th class="ov-n">Có<div class="ov-col">amount_minor (side=CREDIT)</div></th><th>Bên<div class="ov-col">party_type/party_id</div></th><th>Tham chiếu<div class="ov-col">reference_type:reference_id</div></th><th>Charge / metadata<div class="ov-col">metadata (jsonb)</div></th></tr></thead><tbody>
              <tr v-for="l in linesOf(j.id)" :key="l.id"><td>{{ l.id }}</td><td>{{ l.account_code }}</td><td>{{ vas(l.account_code, l).code }} <span class="ov-mut">{{ vas(l.account_code, l).name }}</span></td><td class="ov-n">{{ l.side === 'DEBIT' ? money(l.amount_minor) : '' }}</td><td class="ov-n">{{ l.side === 'CREDIT' ? money(l.amount_minor) : '' }}</td><td>{{ l.party_type }}/{{ l.party_id }}</td><td class="ov-mut">{{ l.reference_type }}:{{ l.reference_id }}</td><td class="ov-mut mono" style="font-size:0.7rem">{{ l.metadata?.chargeCode || '' }}<div v-if="l.metadata">{{ cell(l.metadata) }}</div></td></tr>
            </tbody><tfoot><tr><td colspan="3">Σ</td><td class="ov-n">{{ money(sumSide(linesOf(j.id), 'DEBIT')) }}</td><td class="ov-n">{{ money(sumSide(linesOf(j.id), 'CREDIT')) }}</td>
              <td colspan="2" :class="sumSide(linesOf(j.id), 'DEBIT') === sumSide(linesOf(j.id), 'CREDIT') ? 'ov-okc' : 'ov-bad'">{{ sumSide(linesOf(j.id), 'DEBIT') === sumSide(linesOf(j.id), 'CREDIT') ? 'cân' : 'LỆCH' }}</td></tr></tfoot></table>
            <details v-if="j.calculation_snapshot"><summary class="ov-mut">calculation_snapshot (cách tính phí/thuế)</summary><pre>{{ json(j.calculation_snapshot) }}</pre></details>
          </div>
          <p v-if="!journals.length" class="ov-mut">Chưa có bút toán.</p>
        </section>

        <!-- 6. PARTIES -->
        <section class="ov-sec">
          <h3>5. Sổ cái của từng bên liên quan (toàn bộ đơn, không chỉ đơn này) <code class="ov-tbl">finance_journal_lines</code> · <code class="ov-tbl">finance_holds</code> · <code class="ov-tbl">finance_payouts</code> (lọc theo party_id)</h3>
          <div v-for="p in partyData" :key="p.id" class="ov-jr">
            <div><b>#{{ p.id }}</b> <span v-for="r in p.roles" :key="r" class="ov-pill ov-b">{{ r }}</span></div>
            <p v-if="p.error" class="ov-err">{{ p.error }}</p>
            <template v-else>
              <table v-if="p.balance?.length" class="ov-t"><thead><tr><th>Tài khoản</th><th>Bên</th><th class="ov-n">Có − Nợ</th><th class="ov-n">Số dòng</th></tr></thead><tbody>
                <tr v-for="b in p.balance" :key="b.account_code + b.party_type"><td><b>{{ b.account_code }}</b> <span class="ov-mut">[{{ vas(b.account_code, b).code }} {{ vas(b.account_code, b).name }}]</span> <span class="ov-mut">{{ ACC[b.account_code] }}</span></td><td>{{ b.party_type }}</td><td class="ov-n"><b>{{ money(b.credit_minus_debit) }}</b></td><td class="ov-n">{{ b.lines }}</td></tr></tbody></table>
              <p v-else class="ov-mut">Chưa có dòng sổ cái nào.</p>
              <div v-for="blk in [['Dòng sổ cái gần nhất', 'lines'], ['Tiền bị giữ (holds)', 'holds'], ['Lệnh rút tiền', 'payouts']]" :key="blk[1]">
                <details v-if="p[blk[1]]?.length"><summary>{{ blk[0] }} <span class="ov-pill ov-g">{{ p[blk[1]].length }}</span></summary>
                  <div class="ov-tw"><table class="ov-t"><thead><tr><th v-for="c in cols(p[blk[1]])" :key="c">{{ c }}</th></tr></thead><tbody><tr v-for="(r, i) in p[blk[1]]" :key="i"><td v-for="c in cols(p[blk[1]])" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div></details>
              </div>
            </template>
          </div>
        </section>

        <!-- 7. ALL RAW TABLES -->
        <section class="ov-sec">
          <h3>6. Tất cả bảng dữ liệu của đơn (nguyên trạng từ DB)</h3>
          <div v-for="s in stages" :key="s.key" class="ov-stage">
            <div class="ov-sh"><b>{{ s.title }}</b> <code>{{ s.table }}</code> <span :class="['ov-pill', s.rows.length ? 'ov-g' : '']">{{ s.rows.length }} dòng</span><span v-if="s.global" class="ov-mut"> (toàn hệ thống)</span></div>
            <p class="ov-mut">{{ s.explain }}</p>
            <p v-if="s.error" class="ov-err">{{ s.error }}</p>
            <p v-else-if="!s.rows.length" class="ov-mut">— chưa có dòng —</p>
            <template v-else>
              <div class="ov-tw"><table class="ov-t"><thead><tr><th v-for="c in cols(s.rows)" :key="c">{{ c }}</th></tr></thead>
                <tbody><tr v-for="(r, i) in s.rows" :key="i"><td v-for="c in cols(s.rows)" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div>
              <details v-if="objCols(s.rows).length"><summary class="ov-mut">cột JSON: {{ objCols(s.rows).join(', ') }}</summary><pre>{{ json(s.rows.map((r) => Object.fromEntries(objCols(s.rows).map((k) => [k, r[k]])))) }}</pre></details>
            </template>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style>
.ov-fab { background: linear-gradient(135deg, #be123c, #f43f5e) !important; }
.ov-fab:hover { background: linear-gradient(135deg, #9f1239, #be123c) !important; transform: translateY(-2px) scale(1.03) !important; box-shadow: 0 6px 18px rgba(244, 63, 94, 0.45) !important; }
.ov { position: fixed; inset: 0; z-index: 100000; background: #f8fafc; color: #0f172a; display: flex; flex-direction: column; font: 13px/1.45 system-ui, sans-serif; }
.ov-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.ov-head select { max-width: 420px; }
.ov-sp { flex: 1; }
.ov-go, .ov-on { background: #be123c; color: #fff; border-color: #be123c; }
.ov-body { flex: 1; overflow: auto; padding: 14px 16px 60px; }
.ov-pad { padding: 16px; }
.ov-cards { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.ov-card { flex: 1 1 170px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
.ov-card.ov-warn { border-color: #f59e0b; background: #fffbeb; }
.ov-k { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
.ov-big { font-size: 20px; display: block; }
.ov-sec { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.ov-sec h3 { margin: 0 0 8px; font-size: 15px; }
.ov-t { border-collapse: collapse; width: 100%; font-size: 12px; }
.ov-t th, .ov-t td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; vertical-align: top; }
.ov-t th { background: #f1f5f9; white-space: nowrap; }
.ov-t tfoot td { background: #f8fafc; font-weight: 600; }
.ov-n { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ov-tw { overflow: auto; max-width: 100%; }
.ov-mut { color: #64748b; font-size: 11px; }
.ov-err { color: #b91c1c; background: #fef2f2; padding: 6px 10px; border-radius: 6px; margin: 8px 16px; }
.ov-pill { display: inline-block; padding: 1px 8px; border-radius: 9999px; font-size: 11px; background: #e2e8f0; margin-right: 4px; }
.ov-g { background: #dcfce7; color: #166534; } .ov-y { background: #fef9c3; color: #854d0e; } .ov-r { background: #fee2e2; color: #991b1b; } .ov-b { background: #e0e7ff; color: #3730a3; }
.ov-bad { color: #b91c1c; font-weight: 700; } .ov-okc { color: #166534; font-weight: 700; }
.ov-row-bad td { background: #fef2f2; } .ov-ic { width: 28px; text-align: center !important; }
.ov-jr { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
.ov-stage { margin-bottom: 14px; } .ov-sh { margin-bottom: 2px; }
.ov pre { background: #0f172a; color: #e2e8f0; padding: 8px; border-radius: 6px; overflow: auto; max-height: 260px; font-size: 11px; }
.ov-tbl { font-size: 0.68rem; font-weight: 400; background: #eef2ff; color: #3730a3; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.ov-col { font-size: 0.62rem; font-weight: 400; color: #6b7280; font-family: monospace; white-space: normal; }
</style>
