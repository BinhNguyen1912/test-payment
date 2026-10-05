<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { request, sessions } from '../api.js';
import { ctx, presets, addPreset } from '../ctxStore.js';

// Money-flow tracker. Reads the real DB tables (read-only, through the lineage server) so nobody has to open the DB.
// Two views: follow ONE ORDER through every table, or look at everything the ledger holds for ONE PARTY (user/sub-account id).
const open = ref(location.hash.startsWith('#money'));
const mode = ref('order');
const input = reactive({ orderId: '', txnRef: '', partyId: '' });
const orderPick = ref([]);
const res = ref(null);
const party = ref(null);
const conf = ref(null);
const err = ref('');
const loading = ref(false);
const auto = ref(false);
let timer = null;
const showAll = reactive({});

const post = async (path, body) => {
  const r = await fetch(`/lineage${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
async function runOrder() {
  err.value = ''; loading.value = true;
  try { res.value = await post('/trace', { orderId: input.orderId || ctx.orderId, txnRef: input.txnRef || ctx.txnRef }); }
  catch (e) { err.value = `${e.message} — lineage server chạy chưa? (npm run lineage)`; }
  finally { loading.value = false; }
}
async function runParty() {
  err.value = ''; loading.value = true;
  try { party.value = await post('/party', { partyId: input.partyId }); }
  catch (e) { err.value = `${e.message} — lineage server chạy chưa? (npm run lineage)`; }
  finally { loading.value = false; }
}
const run = () => (mode.value === 'order' ? runOrder() : mode.value === 'party' ? runParty() : runConfig());
async function runConfig() {
  err.value = ''; loading.value = true;
  try { conf.value = await post('/config', {}); }
  catch (e) { err.value = `${e.message} — lineage server chạy chưa? (npm run lineage)`; }
  finally { loading.value = false; }
}
function toggleAuto() { auto.value = !auto.value; clearInterval(timer); if (auto.value) timer = setInterval(run, 5000); }
onBeforeUnmount(() => clearInterval(timer));
async function loadMyOrders() {
  discoverParties();
  const b = sessions.buyer;
  if (!b.accessToken) { err.value = 'Đăng nhập người mua trước (nút Cửa hàng) để lấy danh sách đơn từ API.'; return; }
  try { orderPick.value = (await request(b, 'GET', '/web/payments/orders', { query: { limit: 20 } })).data || []; err.value = ''; }
  catch (e) { err.value = `${e.code || ''} ${e.message}`; }
}
function pickById(id) { const o = orderPick.value.find((x) => String(x.id) === String(id)); if (o) pickOrder(o); }
// also offer sub-accounts discovered through the API for whoever is signed in
async function discoverParties() {
  for (const k of ['creator', 'merchant']) {
    const s = sessions[k];
    if (!s.accessToken) continue;
    try { ((await request(s, 'GET', '/mobile/sub-accounts', { query: { role: k } })).data || []).forEach((a) => addPreset(a.userId, `${a.profile?.displayName || a.profile?.username || k} · ${a.userId} (${a.isSubAccount ? 'sub-account' : 'root'} ${a.status})`)); } catch { /* optional */ }
  }
}
function pickOrder(o) { input.orderId = String(o.id); input.txnRef = o.txnRef; ctx.orderId = String(o.id); ctx.txnRef = o.txnRef; runOrder(); }

{
  const h = new URLSearchParams(location.hash.replace(/^#money&?/, ''));
  if (h.get('order')) { input.orderId = h.get('order'); setTimeout(runOrder, 0); }
  if (h.get('config')) { mode.value = 'config'; setTimeout(runConfig, 0); }
  if (h.get('party')) { mode.value = 'party'; input.partyId = h.get('party'); setTimeout(runParty, 0); }
}
if (open.value || true) setTimeout(() => { if (sessions.buyer.accessToken) loadMyOrders(); discoverParties(); }, 600);
const stages = computed(() => res.value?.stages || []);
const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('vi-VN'));
const scal = (rows) => { const m = new Set(); rows.slice(0, 8).forEach((r) => Object.entries(r).forEach(([k, v]) => { if (v === null || typeof v !== 'object') m.add(k); })); return [...m]; };
const objs = (rows) => { const m = new Set(); rows.slice(0, 8).forEach((r) => Object.entries(r).forEach(([k, v]) => { if (v && typeof v === 'object') m.add(k); })); return [...m]; };
const cell = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const linesOf = (jid) => (stages.value.find((s) => s.key === 'lines')?.rows || []).filter((l) => String(l.journal_id) === String(jid));
const sum = (ls, side) => ls.filter((l) => l.side === side).reduce((a, l) => a + BigInt(l.amount_minor), 0n);
// Where does the money sit? (Credit − Debit per account across this order's journals)
const position = computed(() => {
  const m = new Map();
  (stages.value.find((s) => s.key === 'lines')?.rows || []).forEach((l) => {
    const k = `${l.account_code}|${l.party_type}/${l.party_id}`;
    m.set(k, (m.get(k) || 0n) + (l.side === 'CREDIT' ? 1n : -1n) * BigInt(l.amount_minor));
  });
  return [...m.entries()].map(([k, v]) => ({ account: k.split('|')[0], party: k.split('|')[1], net: v })).filter((x) => x.net !== 0n);
});
const ACC = {
  BANK_CASH: ['Tiền ở ngân hàng của sàn', 'Tài sản'], VNPAY_CLEARING: ['VNPay thu hộ, chưa về ngân hàng', 'Tài sản'], CUSTOMER_FUNDS_HELD: ['Tiền khách sàn giữ hộ (chưa chia)', 'Nợ phải trả'],
  MERCHANT_PAYABLE: ['Sàn nợ Merchant', 'Nợ phải trả'], CREATOR_PAYABLE: ['Sàn nợ Creator', 'Nợ phải trả'], AFFILIATE_PAYABLE: ['Sàn nợ Affiliate', 'Nợ phải trả'],
  TAX_WITHHOLDING_PAYABLE: ['Thuế khấu trừ (TNCN) phải nộp', 'Nợ phải trả'], VAT_OUTPUT_PAYABLE: ['VAT đầu ra phải nộp', 'Nợ phải trả'], PAYOUT_IN_TRANSIT: ['Tiền rút đang chuyển', 'Nợ phải trả'],
  PLATFORM_COMMISSION_REVENUE: ['Doanh thu hoa hồng sàn', 'Doanh thu'], MARKETPLACE_FEE_REVENUE: ['Doanh thu phí marketplace', 'Doanh thu'], MEMBERSHIP_DEFERRED_REVENUE: ['Doanh thu thành viên chưa ghi nhận (3387)', 'Nợ phải trả'],
  MEMBERSHIP_REVENUE: ['Doanh thu thành viên đã ghi nhận (5113)', 'Doanh thu'], PAYMENT_GATEWAY_FEE_EXPENSE: ['Chi phí cổng thanh toán', 'Chi phí'], PAYOUT_BANK_FEE_EXPENSE: ['Chi phí chuyển khoản rút', 'Chi phí'], ROUNDING_ADJUSTMENT: ['Chênh lệch làm tròn', 'Điều chỉnh'],
};
// Plain-language description for each ledger account: what it is, what makes it go up/down, how to read the number.
const ACC_DOC = {
  BANK_CASH: { grp: 'Tiền thật', what: 'Tiền đang nằm trong tài khoản ngân hàng của sàn.', up: 'Tăng khi VNPay chuyển tiền về ngân hàng (đối soát).', down: 'Giảm khi sàn chuyển tiền trả cho creator/merchant/affiliate (rút tiền).', read: (n) => (n < 0n ? `Số âm ${money(-n)}₫ là bình thường theo cách ghi: đây là tài sản (ghi Nợ), nên “Có − Nợ” âm = sàn đang CÓ ${money(-n)}₫ tiền mặt ở ngân hàng.` : 'Chưa có tiền về ngân hàng.') },
  VNPAY_CLEARING: { grp: 'Tiền thật', what: 'Tiền khách đã trả nhưng đang nằm ở VNPay, chưa về ngân hàng của sàn.', up: 'Tăng (ghi Nợ) mỗi khi khách thanh toán thành công.', down: 'Giảm (ghi Có) khi VNPay chuyển tiền về ngân hàng.', read: (n) => (n < 0n ? `VNPay đang giữ ${money(-n)}₫ của sàn, chờ về ngân hàng. Số này lớn có thể do chưa ghi nhận đối soát VNPay (cần xác nhận).` : 'Không còn tiền chờ ở VNPay.') },
  CUSTOMER_FUNDS_HELD: { grp: 'Sàn nợ ai', what: 'Tiền khách đã trả nhưng CHƯA chia cho ai: sàn đang giữ hộ.', up: 'Tăng khi khách thanh toán.', down: 'Giảm khi hàng được giao/redeem và tiền được chia cho người bán, sàn, thuế.', read: (n) => `Sàn đang giữ hộ khách ${money(n)}₫ chưa chia (đơn chưa redeem / chưa hoàn tất).` },
  MERCHANT_PAYABLE: { grp: 'Sàn nợ ai', what: 'Số tiền sàn còn nợ Merchant sau khi voucher của họ được redeem.', up: 'Tăng khi voucher được redeem (phần của merchant sau phí & thuế).', down: 'Giảm khi merchant rút tiền.', read: (n) => `Sàn nợ các merchant tổng cộng ${money(n)}₫ (chưa rút).` },
  CREATOR_PAYABLE: { grp: 'Sàn nợ ai', what: 'Số tiền sàn còn nợ Creator từ việc bán thẻ cam kết.', up: 'Tăng khi thẻ cam kết được ghi nhận (phần creator sau phí & thuế).', down: 'Giảm khi creator rút tiền.', read: (n) => `Sàn nợ các creator tổng cộng ${money(n)}₫ (chưa rút).` },
  AFFILIATE_PAYABLE: { grp: 'Sàn nợ ai', what: 'Hoa hồng giới thiệu sàn còn nợ người giới thiệu (affiliate).', up: 'Tăng khi đơn có affiliate được ghi nhận.', down: 'Giảm khi affiliate rút tiền.', read: (n) => `Sàn nợ affiliate ${money(n)}₫ hoa hồng.` },
  PAYOUT_IN_TRANSIT: { grp: 'Sàn nợ ai', what: 'Tiền rút đã được duyệt/gửi ngân hàng nhưng chưa xác nhận đã chuyển xong.', up: 'Tăng khi lệnh rút được gửi đi.', down: 'Giảm khi ngân hàng xác nhận thành công.', read: (n) => `${money(n)}₫ đang trên đường chuyển cho người rút tiền.` },
  PLATFORM_COMMISSION_REVENUE: { grp: 'Doanh thu của sàn', what: 'Phí/hoa hồng sàn thu từ người bán (mặc định 10%).', up: 'Tăng mỗi lần ghi nhận doanh thu cho người bán.', down: 'Gần như không giảm.', read: (n) => `Sàn đã kiếm được ${money(n)}₫ tiền hoa hồng.` },
  MARKETPLACE_FEE_REVENUE: { grp: 'Doanh thu của sàn', what: 'Phí marketplace (loại phí riêng).', up: 'Tăng khi có phí marketplace.', down: '—', read: (n) => (n === 0n ? 'Chưa phát sinh (0).' : `${money(n)}₫.`) },
  MEMBERSHIP_DEFERRED_REVENUE: { grp: 'Doanh thu của sàn', what: 'Tiền bán thẻ thành viên đã thu nhưng dịch vụ chưa dùng hết (chưa được tính là doanh thu). Mã kế toán 3387.', up: 'Tăng khi khách mua gói thành viên (trừ phần VAT).', down: 'Giảm dần theo từng tháng khi chuyển sang doanh thu (job cuối tháng).', read: (n) => `Còn ${money(n)}₫ tiền thành viên chờ chuyển thành doanh thu theo từng tháng.` },
  MEMBERSHIP_REVENUE: { grp: 'Doanh thu của sàn', what: 'Doanh thu thành viên đã được ghi nhận. Mã 5113.', up: 'Tăng mỗi tháng khi job chuyển từ 3387 sang.', down: '—', read: (n) => (n === 0n ? 'Chưa có tháng nào được ghi nhận (job cuối tháng chưa chạy).' : `Đã ghi nhận ${money(n)}₫ doanh thu thành viên.`) },
  TAX_WITHHOLDING_PAYABLE: { grp: 'Thuế phải nộp', what: 'Thuế khấu trừ (mặc định 7%) sàn giữ lại từ tiền của người bán để nộp nhà nước.', up: 'Tăng mỗi lần ghi nhận doanh thu cho người bán.', down: 'Chỉ giảm khi sàn nộp thuế — hiện backend CHƯA có bước nộp thuế nên chỉ tăng.', read: (n) => `Sàn đang giữ ${money(n)}₫ thuế khấu trừ chưa nộp.` },
  VAT_OUTPUT_PAYABLE: { grp: 'Thuế phải nộp', what: 'VAT đầu ra (8%/10%) nằm trong giá bán thẻ thành viên, sàn phải nộp nhà nước.', up: 'Tăng khi bán gói thành viên.', down: 'Chỉ giảm khi nộp VAT — hiện chưa có bước nộp.', read: (n) => `Sàn đang giữ ${money(n)}₫ VAT chưa nộp.` },
  PAYMENT_GATEWAY_FEE_EXPENSE: { grp: 'Chi phí', what: 'Phí cổng thanh toán VNPay sàn phải trả.', up: 'Tăng khi ghi nhận phí VNPay lúc đối soát.', down: '—', read: (n) => (n === 0n ? 'Chưa ghi nhận chi phí VNPay nào (0).' : `${money(-n)}₫ chi phí.`) },
  PAYOUT_BANK_FEE_EXPENSE: { grp: 'Chi phí', what: 'Phí ngân hàng khi chuyển tiền rút.', up: 'Tăng khi có phí chuyển khoản.', down: '—', read: (n) => (n === 0n ? 'Chưa phát sinh (0).' : `${money(-n)}₫ chi phí.`) },
  ROUNDING_ADJUSTMENT: { grp: 'Chi phí', what: 'Chênh lệch làm tròn 1đ khi chia tiền.', up: 'Tăng khi phép chia có phần lẻ.', down: '—', read: (n) => (n === 0n ? 'Không có chênh lệch làm tròn (0).' : `${money(-n)}₫.`) },
};
const GROUPS = ['Tiền thật', 'Sàn nợ ai', 'Doanh thu của sàn', 'Thuế phải nộp', 'Chi phí'];
const accRead = (a) => { const d = ACC_DOC[a.code]; return d ? d.read(BigInt(a.credit_minus_debit)) : ''; };
const accByGroup = computed(() => GROUPS.map((g) => ({ g, items: (conf.value?.accounts || []).filter((a) => (ACC_DOC[a.code]?.grp || 'Chi phí') === g) })).filter((x) => x.items.length));
// Latest policy version per revenue source = ACTIVE one, otherwise highest version_no. Older ones are behind a toggle.
const showOldPolicies = ref(false);
const latestPolicies = computed(() => {
  const by = new Map();
  (conf.value?.versions || []).forEach((v) => { const k = String(v.revenue_source_id); (by.get(k) || by.set(k, []).get(k)).push(v); });
  return [...by.values()].map((arr) => {
    const sorted = [...arr].sort((a, b) => Number(b.version_no) - Number(a.version_no));
    const latest = sorted.find((v) => v.status === 'ACTIVE') || sorted[0];
    return { latest, older: sorted.filter((v) => v !== latest) };
  }).sort((a, b) => Number(a.latest.revenue_source_id) - Number(b.latest.revenue_source_id));
});
const pct = (bps) => (bps === null || bps === undefined ? '' : `${Number(bps) / 100}%`);
const linesOfVersion = (id) => (conf.value?.lines || []).filter((l) => String(l.policy_version_id) === String(id));
const snapRates = (snap) => {
  if (!snap) return '';
  if (snap.vatRateBps !== undefined) return `VAT ${Number(snap.vatRateBps) / 100}% bóc từ giá đã gồm thuế ${money(snap.grossAmountVnd)} → VAT ${money(snap.vatAmountVnd)} + doanh thu hoãn ${money(snap.netAmountVnd)}`;
  return (snap.lines || []).filter((x) => x.chargeCode).map((x) => `${x.chargeCode} ${x.rateBps / 100}% × ${money(x.basisAmountVnd)} = ${money(x.calculatedAmountVnd)}`).join(' · ');
};
const WHERE = {
  VNPAY_CLEARING: 'VNPay đã thu hộ, chưa về ngân hàng sàn', CUSTOMER_FUNDS_HELD: 'Tiền khách đang được sàn giữ hộ (chưa chia cho ai)',
  CREATOR_PAYABLE: 'Sàn nợ Creator', MERCHANT_PAYABLE: 'Sàn nợ Merchant', AFFILIATE_PAYABLE: 'Sàn nợ Affiliate',
  PLATFORM_COMMISSION_REVENUE: 'Doanh thu phí sàn', TAX_WITHHOLDING_PAYABLE: 'Thuế khấu trừ phải nộp',
};
const chips = computed(() => stages.value.filter((s) => !s.global).map((s) => ({ key: s.key, t: s.title.replace(/^\d+[a-z]?\.\s*/, ''), n: s.rows.length, err: s.error })));
const status = computed(() => {
  const o = stages.value.find((s) => s.key === 'order')?.rows[0];
  if (!o) return null;
  return { status: o.status, f: o.fulfillment_status, amount: o.amount_vnd, purpose: o.purpose };
});
const json = (v) => JSON.stringify(v, null, 2);
</script>

<template>
  <button class="mf-fab" @click="open = !open">💸 Dòng tiền</button>
  <div v-if="open" class="mf">
    <header class="mf-head">
      <b>Theo dõi dòng tiền</b>
      <button :class="{ 'mf-on': mode === 'order' }" @click="mode = 'order'">Theo 1 đơn hàng</button>
      <button :class="{ 'mf-on': mode === 'party' }" @click="mode = 'party'">Theo 1 tài khoản (creator / merchant / buyer)</button>
      <button :class="{ 'mf-on': mode === 'config' }" @click="mode = 'config'; if (!conf) runConfig()">Cấu hình · Thuế · Sổ tài khoản</button>
      <span class="mf-sp" />
      <span class="mf-mut">đọc trực tiếp các bảng DB (chỉ đọc) · không cần mở DB</span>
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="err" class="mf-err">{{ err }}</p>

    <div class="mf-bar">
      <template v-if="mode === 'order'">
        <label>Chọn đơn
          <select @change="pickById($event.target.value)"><option value="">— đơn của người mua (API) —</option>
            <option v-for="o in orderPick" :key="o.id" :value="o.id">#{{ o.id }} · {{ money(o.amountVnd) }}₫ · {{ o.status }}/{{ o.fulfillmentStatus }}</option></select></label>
        <label>hoặc tự nhập orderId <input v-model="input.orderId" list="mf-orders" :placeholder="ctx.orderId || 'vd 259'" /></label>
        <datalist id="mf-orders"><option v-for="o in orderPick" :key="o.id" :value="o.id">{{ o.txnRef }}</option></datalist>
        <label>hoặc txnRef <input v-model="input.txnRef" :placeholder="ctx.txnRef || 'TW26…'" class="mf-wide" /></label>
        <button class="mf-go" :disabled="loading" @click="runOrder">Truy vết đơn</button>
        <button @click="loadMyOrders">Chọn từ đơn của người mua (API)</button>
      </template>
      <template v-else-if="mode === 'config'"><button class="mf-go" :disabled="loading" @click="runConfig">Tải cấu hình &amp; thuế</button><span class="mf-mut">Toàn hệ thống, không theo đơn.</span></template>
      <template v-else>
        <label>Chọn sẵn
          <select @change="input.partyId = $event.target.value; if ($event.target.value) runParty()"><option value="">— chọn tài khoản —</option>
            <option v-for="p in presets.parties" :key="p.id" :value="p.id">{{ p.label }}</option></select></label>
        <label>hoặc tự nhập userId / sub-account id <input v-model="input.partyId" list="mf-parties" placeholder="vd 913253" /></label>
        <datalist id="mf-parties"><option v-for="p in presets.parties" :key="p.id" :value="p.id">{{ p.label }}</option></datalist>
        <button class="mf-go" :disabled="loading || !input.partyId" @click="runParty">Xem sổ cái của tài khoản</button>
        <button v-for="k in ['buyer', 'creator', 'merchant', 'affiliate']" :key="k" :disabled="!sessions[k].activeAccountUserId && !sessions[k].profile?.userId" @click="input.partyId = String(sessions[k].activeAccountUserId || sessions[k].profile?.userId)">dùng {{ k }}</button>
      </template>
      <button :class="{ 'mf-on': auto }" @click="toggleAuto">{{ auto ? 'Dừng tự làm mới' : 'Tự làm mới 5s' }}</button>
    </div>
    <div v-if="mode === 'order' && orderPick.length" class="mf-picks">
      <span v-for="o in orderPick" :key="o.id" class="mf-pick" @click="pickOrder(o)">#{{ o.id }} · {{ money(o.amountVnd) }}₫ · {{ o.status }}/{{ o.fulfillmentStatus }} · {{ o.purpose }}</span>
    </div>

    <!-- ORDER MODE -->
    <div v-if="mode === 'order' && res" class="mf-body">
      <p v-if="res.note" class="mf-err">{{ res.note }}</p>
      <template v-else>
        <div class="mf-sum">
          <div v-if="status" class="mf-card"><div class="mf-k">Đơn #{{ res.orderIds.join(',') }}</div><b>{{ money(status.amount) }}₫</b>
            <div>thanh toán: <span :class="['mf-pill', status.status === 'SUCCESS' ? 'mf-g' : 'mf-y']">{{ status.status }}</span></div>
            <div>giao hàng: <span :class="['mf-pill', status.f === 'FULFILLED' ? 'mf-g' : 'mf-y']">{{ status.f }}</span></div>
            <div class="mf-mut">{{ status.purpose }}</div></div>
          <div class="mf-card mf-grow"><div class="mf-k">Đi qua những bảng nào (số dòng)</div>
            <div class="mf-chips"><span v-for="c in chips" :key="c.key" :class="['mf-chip', c.n ? 'mf-has' : '']" :title="c.err">{{ c.t }} <b>{{ c.n }}</b></span></div></div>
          <div class="mf-card mf-grow"><div class="mf-k">Tiền của đơn này đang nằm ở đâu (Có − Nợ)</div>
            <p v-if="!position.length" class="mf-mut">Chưa có bút toán nào.</p>
            <table v-else class="mf-t"><tbody><tr v-for="p in position" :key="p.account + p.party"><td><b>{{ p.account }}</b></td><td>{{ p.party }}</td><td class="mf-n">{{ money(p.net) }}</td><td class="mf-mut">{{ WHERE[p.account] }}</td></tr></tbody></table></div>
        </div>

        <section v-for="s in stages" :key="s.key" class="mf-stage">
          <div class="mf-sh"><b>{{ s.title }}</b> <code>{{ s.table }}</code> <span :class="['mf-pill', s.rows.length ? 'mf-g' : '']">{{ s.rows.length }} dòng</span><span v-if="s.global" class="mf-mut"> (toàn hệ thống)</span></div>
          <p class="mf-mut">{{ s.explain }}</p>
          <p v-if="s.error" class="mf-err">{{ s.error }}</p>
          <p v-else-if="!s.rows.length" class="mf-mut">Chưa có dòng nào — bước này chưa xảy ra với đơn này.</p>
          <!-- journals: show Dr/Cr -->
          <template v-else-if="s.key === 'journals' || s.key === 'pjournals'">
            <div v-for="j in s.rows" :key="j.id" class="mf-jr">
              <div><b>#{{ j.id }}</b> {{ j.event_type }} · <span class="mf-mut">{{ j.event_key }} · nguồn {{ j.source_type }}:{{ j.source_id }} · {{ j.status }} · {{ j.occurred_at }}</span></div>
              <table class="mf-t"><thead><tr><th>Tài khoản</th><th>Nợ</th><th>Có</th><th>Bên</th></tr></thead><tbody>
                <tr v-for="l in linesOf(j.id)" :key="l.id"><td>{{ l.account_code }}</td><td class="mf-n">{{ l.side === 'DEBIT' ? money(l.amount_minor) : '' }}</td><td class="mf-n">{{ l.side === 'CREDIT' ? money(l.amount_minor) : '' }}</td><td>{{ l.party_type }}/{{ l.party_id }}</td></tr>
              </tbody><tfoot><tr><td>Σ</td><td class="mf-n">{{ money(sum(linesOf(j.id), 'DEBIT')) }}</td><td class="mf-n">{{ money(sum(linesOf(j.id), 'CREDIT')) }}</td>
                <td :class="sum(linesOf(j.id), 'DEBIT') === sum(linesOf(j.id), 'CREDIT') ? 'mf-okc' : 'mf-bad'">{{ sum(linesOf(j.id), 'DEBIT') === sum(linesOf(j.id), 'CREDIT') ? 'cân' : 'LỆCH' }}</td></tr></tfoot></table>
              <details v-if="j.calculation_snapshot"><summary class="mf-mut">calculation_snapshot (cách tính phí/thuế)</summary><pre>{{ json(j.calculation_snapshot) }}</pre></details>
            </div>
          </template>
          <template v-else>
            <div class="mf-tw"><table class="mf-t"><thead><tr><th v-for="c in scal(s.rows)" :key="c">{{ c }}</th></tr></thead>
              <tbody><tr v-for="(r, i) in s.rows" :key="i"><td v-for="c in scal(s.rows)" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div>
            <details v-if="objs(s.rows).length"><summary class="mf-mut">cột JSON: {{ objs(s.rows).join(', ') }}</summary><pre>{{ json(s.rows.map((r) => Object.fromEntries(objs(s.rows).map((k) => [k, r[k]])))) }}</pre></details>
          </template>
        </section>
      </template>
    </div>

    <!-- CONFIG / TAX / ACCOUNTS -->
    <div v-if="mode === 'config' && conf" class="mf-body">
      <section class="mf-stage"><div class="mf-sh"><b>Sổ tài khoản (bảng cân đối thử)</b> <code>finance_accounts + finance_journal_lines</code>
        <span v-if="conf.trial" :class="['mf-pill', conf.trial.debit === conf.trial.credit ? 'mf-g' : 'mf-y']">Σ Nợ {{ money(conf.trial.debit) }} {{ conf.trial.debit === conf.trial.credit ? '=' : '≠' }} Σ Có {{ money(conf.trial.credit) }}</span></div>
        <div class="mf-how">
          <b>Cách đọc nhanh</b>
          <ul>
            <li>Mỗi lần có tiền di chuyển, sổ ghi <b>2 dòng</b>: một dòng <b>Nợ</b> (tiền “đi vào” tài khoản đó) và một dòng <b>Có</b> (tiền “đi ra” từ tài khoản kia). Tổng Nợ luôn bằng tổng Có — nếu lệch là lỗi.</li>
            <li><b>Tài khoản tiền thật</b> (ngân hàng, VNPay): tiền vào ghi Nợ, nên số “Có − Nợ” <b>âm</b> = sàn đang có tiền.</li>
            <li><b>Tài khoản “sàn nợ ai”</b> (khách, creator, merchant, thuế…): số “Có − Nợ” <b>dương</b> = sàn đang giữ/nợ số tiền đó.</li>
            <li>Ví dụ đơn 45.000₫: khách trả → <i>Nợ VNPAY_CLEARING 45.000 / Có CUSTOMER_FUNDS_HELD 45.000</i> (VNPay giữ tiền, sàn giữ hộ khách). Voucher được redeem → tiền rời CUSTOMER_FUNDS_HELD chia vào MERCHANT_PAYABLE (người bán), PLATFORM_COMMISSION_REVENUE (phí sàn), TAX_WITHHOLDING_PAYABLE (thuế).</li>
          </ul>
        </div>
        <div v-for="grp in accByGroup" :key="grp.g" class="mf-grp">
          <div class="mf-gh">{{ grp.g }}</div>
          <div class="mf-tw"><table class="mf-t"><thead><tr><th>Tài khoản</th><th>Là gì</th><th>Tăng khi</th><th>Giảm khi</th><th>Tổng Nợ</th><th>Tổng Có</th><th>Có − Nợ</th><th>Đọc số này như thế nào</th></tr></thead><tbody>
            <tr v-for="a in grp.items" :key="a.id"><td><b>{{ a.code }}</b><div class="mf-mut">{{ a.line_count }} dòng · {{ a.account_type }}/{{ a.normal_side }}</div></td>
              <td class="mf-wrap">{{ ACC_DOC[a.code]?.what || a.name }}</td><td class="mf-wrap">{{ ACC_DOC[a.code]?.up }}</td><td class="mf-wrap">{{ ACC_DOC[a.code]?.down }}</td>
              <td class="mf-n">{{ money(a.total_debit) }}</td><td class="mf-n">{{ money(a.total_credit) }}</td><td class="mf-n"><b>{{ money(a.credit_minus_debit) }}</b></td>
              <td class="mf-wrap mf-read">{{ accRead(a) }}</td></tr></tbody></table></div>
        </div></section>

      <section class="mf-stage mf-tax"><div class="mf-sh"><b>Bảng thuế</b> <code>finance_journal_lines (TAX_*, VAT_*)</code></div>
        <p class="mf-mut">Backend không có bảng thuế riêng: thuế nằm ở tài khoản TAX_WITHHOLDING_PAYABLE (khấu trừ từ người bán) và VAT_OUTPUT_PAYABLE (VAT bán thẻ thành viên). Bảng dưới là tổng hợp và từng dòng thuế thật; cột “cách tính” lấy từ calculation_snapshot của bút toán.</p>
        <table class="mf-t"><thead><tr><th>Tài khoản</th><th>Bên nhận</th><th>Số dòng</th><th>Tổng thuế còn phải nộp (Có − Nợ)</th></tr></thead><tbody>
          <tr v-for="t in conf.taxByAccount" :key="t.account_code"><td><b>{{ t.account_code }}</b></td><td>{{ t.party_type }}</td><td class="mf-n">{{ t.lines }}</td><td class="mf-n">{{ money(t.credit_minus_debit) }}</td></tr></tbody></table>
        <div class="mf-tw"><table class="mf-t"><thead><tr><th>dòng</th><th>bút toán</th><th>sự kiện</th><th>nguồn</th><th>tài khoản</th><th>Nợ/Có</th><th>số tiền</th><th>policy</th><th>cách tính (từ snapshot)</th><th>thời điểm</th></tr></thead><tbody>
          <tr v-for="t in conf.taxLedger" :key="t.line_id"><td>{{ t.line_id }}</td><td>#{{ t.journal_id }}</td><td>{{ t.event_type }}</td><td>{{ t.source_type }}:{{ t.source_id }}</td><td>{{ t.account_code }}</td><td>{{ t.side }}</td><td class="mf-n">{{ money(t.amount_minor) }}</td><td>v{{ t.policy_version_id }}</td>
            <td>{{ snapRates(t.calculation_snapshot) }}</td><td>{{ t.occurred_at }}</td></tr></tbody></table></div>
        <p class="mf-mut">Không thấy dòng nào ghi Nợ vào tài khoản thuế: backend chưa có bước “nộp thuế” (chỉ tích lũy phải nộp).</p></section>

      <section class="mf-stage"><div class="mf-sh"><b>Nguồn doanh thu</b> <code>finance_revenue_sources</code></div>
        <div class="mf-tw"><table class="mf-t"><thead><tr><th v-for="c in scal(conf.sources)" :key="c">{{ c }}</th></tr></thead><tbody><tr v-for="(r, i) in conf.sources" :key="i"><td v-for="c in scal(conf.sources)" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div></section>
      <section class="mf-stage"><div class="mf-sh"><b>Loại phí / thuế</b> <code>finance_charge_types</code></div>
        <div class="mf-tw"><table class="mf-t"><thead><tr><th v-for="c in scal(conf.charges)" :key="c">{{ c }}</th></tr></thead><tbody><tr v-for="(r, i) in conf.charges" :key="i"><td v-for="c in scal(conf.charges)" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div></section>
      <section class="mf-stage"><div class="mf-sh"><b>Chính sách phí/thuế — phiên bản mới nhất</b> <code>finance_policy_versions + finance_policy_lines</code>
        <button @click="showOldPolicies = !showOldPolicies">{{ showOldPolicies ? 'Ẩn bản cũ' : 'Xem cả bản cũ' }}</button></div>
        <p class="mf-mut">Mỗi nguồn doanh thu có nhiều phiên bản; luôn lấy bản <b>ACTIVE</b> (nếu không có thì bản có số phiên bản cao nhất). Bút toán lưu <code>policy_version_id</code> đã dùng. Tỷ lệ = rate_bps / 100.</p>
        <div v-for="p in latestPolicies" :key="p.latest.id" class="mf-jr">
          <div><b>{{ p.latest.revenue_source_code }}</b> · phiên bản <b>{{ p.latest.version_no }}</b> (id v{{ p.latest.id }}) · <span :class="['mf-pill', p.latest.status === 'ACTIVE' ? 'mf-g' : 'mf-y']">{{ p.latest.status }}</span> <span class="mf-mut">hiệu lực {{ p.latest.effective_from }} → {{ p.latest.effective_to || 'hiện tại' }}</span></div>
          <p v-if="p.latest.change_note" class="mf-mut">ghi chú: {{ p.latest.change_note }}</p>
          <table class="mf-t"><thead><tr><th>charge</th><th>loại</th><th>ai trả</th><th>ai nhận</th><th>tính trên</th><th>kiểu</th><th>tỷ lệ</th><th>cố định</th></tr></thead><tbody>
            <tr v-for="l in linesOfVersion(p.latest.id)" :key="l.id"><td>{{ l.charge_code }}</td><td><span :class="['mf-pill', l.charge_kind === 'TAX' ? 'mf-y' : '']">{{ l.charge_kind }}</span></td><td>{{ l.payer }}</td><td>{{ l.recipient }}</td><td>{{ l.basis }}</td><td>{{ l.value_type }}</td><td class="mf-n"><b>{{ pct(l.rate_bps) }}</b></td><td class="mf-n">{{ money(l.fixed_amount_vnd) }}</td></tr>
            <tr v-if="!linesOfVersion(p.latest.id).length"><td colspan="8" class="mf-mut">không có dòng</td></tr></tbody></table>
          <div v-if="showOldPolicies && p.older.length" class="mf-old">
            <div v-for="v in p.older" :key="v.id"><span class="mf-mut">bản cũ: phiên bản {{ v.version_no }} (v{{ v.id }}) · {{ v.status }} · {{ v.effective_from }} → {{ v.effective_to || '…' }} ·
              {{ linesOfVersion(v.id).map((l) => `${l.charge_code} ${pct(l.rate_bps)}`).join(', ') || 'không có dòng' }}</span></div>
          </div>
        </div></section>
    </div>

    <!-- PARTY MODE -->
    <div v-if="mode === 'party' && party" class="mf-body">
      <p v-if="party.error" class="mf-err">{{ party.error }}</p>
      <template v-else>
        <section class="mf-stage"><div class="mf-sh"><b>Số dư theo tài khoản sổ cái của #{{ party.partyId }}</b> <code>finance_journal_lines</code></div>
          <p class="mf-mut">Có − Nợ theo từng tài khoản. Creator/Merchant: CREATOR_PAYABLE / MERCHANT_PAYABLE dương = sàn đang nợ họ. Buyer: CUSTOMER_FUNDS_HELD = tiền sàn giữ hộ.</p>
          <p v-if="!party.balance.length" class="mf-mut">Chưa có dòng sổ cái nào cho tài khoản này (chưa có doanh thu được ghi nhận).</p>
          <table v-else class="mf-t"><thead><tr><th>Tài khoản</th><th>Bên</th><th>Có − Nợ</th><th>Số dòng</th></tr></thead><tbody>
            <tr v-for="b in party.balance" :key="b.account_code + b.party_type"><td><b>{{ b.account_code }}</b></td><td>{{ b.party_type }}</td><td class="mf-n">{{ money(b.credit_minus_debit) }}</td><td>{{ b.lines }}</td></tr></tbody></table></section>
        <section v-for="blk in [['Các dòng sổ cái gần nhất', 'lines', 'finance_journal_lines'], ['Tiền bị giữ (hold)', 'holds', 'finance_holds'], ['Lệnh rút tiền', 'payouts', 'finance_payouts'], ['Tài khoản ngân hàng', 'bank', 'user_bank_accounts']]" :key="blk[1]" class="mf-stage">
          <div class="mf-sh"><b>{{ blk[0] }}</b> <code>{{ blk[2] }}</code> <span :class="['mf-pill', party[blk[1]].length ? 'mf-g' : '']">{{ party[blk[1]].length }} dòng</span></div>
          <p v-if="!party[blk[1]].length" class="mf-mut">Rỗng.</p>
          <div v-else class="mf-tw"><table class="mf-t"><thead><tr><th v-for="c in scal(party[blk[1]])" :key="c">{{ c }}</th></tr></thead>
            <tbody><tr v-for="(r, i) in party[blk[1]]" :key="i"><td v-for="c in scal(party[blk[1]])" :key="c">{{ cell(r[c]) }}</td></tr></tbody></table></div>
        </section>
      </template>
    </div>
    <p v-if="!res && mode === 'order' && !err" class="mf-mut mf-pad">Nhập orderId hoặc txnRef (hoặc chọn đơn từ API) rồi bấm “Truy vết đơn”.</p>
  </div>
</template>

<style>
.mf { position: fixed; inset: 0; z-index: 9700; background: #f6fdf8; color: #14301f; overflow: auto; font: 13px/1.45 -apple-system, 'Segoe UI', sans-serif; }
.mf button { all: unset; box-sizing: border-box; cursor: pointer; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; padding: 5px 12px; font-size: 12.5px; font-weight: 600; }
.mf button:hover:not(:disabled) { background: #f0fdf4; border-color: #10b981; }
.mf button:disabled { opacity: .45; cursor: not-allowed; }
.mf button.mf-on { background: #16a34a; color: #fff; border-color: #16a34a; }
.mf button.mf-go { background: #16a34a; color: #fff; border-color: #16a34a; font-weight: 700; box-shadow: 0 2px 8px rgba(22,163,74,0.3); }
.mf button.mf-go:hover:not(:disabled) { background: #15803d; }
.mf input { width: 130px; padding: 6px 10px; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; font-size: 12.5px; }
.mf input.mf-wide { width: 260px; }
.mf input:focus { border-color: #10b981; outline: none; box-shadow: 0 0 0 2px #86efac; }
.mf label { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 500; color: #14532d; }
.mf-head { display: flex; gap: 10px; align-items: center; padding: 12px 20px; background: #14532d; color: #fff; position: sticky; top: 0; z-index: 3; flex-wrap: wrap; border-bottom: 1px solid #bbf7d0; }
.mf-head b { color: #fff; }
.mf-head .mf-mut { color: #bbf7d0; }
.mf-sp { flex: 1; }
.mf-mut { color: #5f7a69; font-size: 12px; margin: 4px 0; }
.mf-pad { padding: 16px 20px; }
.mf-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 8px 14px; margin: 8px 20px; border-radius: 6px; font-size: 12px; }
.mf-bar { display: flex; gap: 12px; align-items: center; padding: 10px 20px; background: #f7fdf9; border-bottom: 1px solid #bbf7d0; flex-wrap: wrap; position: sticky; top: 52px; z-index: 2; }
.mf-picks { display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 20px; background: #f0fdf4; border-bottom: 1px solid #e6f7ec; }
.mf-pick { background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 12px; padding: 3px 12px; cursor: pointer; font-size: 12px; font-weight: 500; }
.mf-pick:hover { background: #bbf7d0; }
.mf-body { padding: 16px 20px 40px; display: flex; flex-direction: column; gap: 14px; }
.mf-sum { display: flex; gap: 12px; flex-wrap: wrap; align-items: stretch; }
.mf-card { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px 18px; min-width: 200px; box-shadow: 0 4px 16px rgba(22,101,52,0.10); }
.mf-grow { flex: 1; min-width: 320px; }
.mf-k { color: #5f7a69; font-size: 12px; margin-bottom: 6px; }
.mf-card > b { font-size: 24px; color: #14301f; }
.mf-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #f0fdf4; color: #14532d; }
.mf-g { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.mf-y { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.mf-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.mf-chip { background: #ffffff; border: 1px dashed #86efac; border-radius: 12px; padding: 2px 10px; font-size: 12px; color: #5f7a69; }
.mf-chip.mf-has { background: #dcfce7; border: 1px solid #16a34a; color: #166534; }
.mf-stage { background: #ffffff; border: 1px solid #bbf7d0; border-left: 5px solid #10b981; border-radius: 10px; padding: 12px 16px; box-shadow: 0 4px 16px rgba(22,101,52,0.08); }
.mf-sh { font-size: 14px; font-weight: 700; color: #14301f; display: flex; align-items: center; justify-content: space-between; }
.mf-sh code { color: #166534; margin: 0 6px; font-size: 12px; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; }
.mf-tw { overflow: auto; max-height: 360px; border: 1px solid #d9f2e1; border-radius: 8px; margin-top: 8px; }
.mf .mf-t { border-collapse: collapse; font-size: 12px; width: 100%; }
.mf .mf-t th, .mf .mf-t td { border: 1px solid #d9f2e1; padding: 6px 10px; color: #14301f; text-align: left; }
.mf .mf-t th { background: #ffffff; color: #5f7a69; font-weight: 700; text-transform: uppercase; font-size: 11px; }
.mf-n { text-align: right !important; font-variant-numeric: tabular-nums; }
.mf-okc { color: #15803d; font-weight: 700; }
.mf-bad { color: #b91c1c; font-weight: 700; }
.mf-jr { border: 1px solid #86efac; background: #f7fdf9; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.mf-jr tfoot td { font-weight: 700; background: #ffffff !important; color: #14301f; }
.mf pre { background: #f0fdf4 !important; color: #166534 !important; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; overflow: auto; max-height: 260px; font-size: 11.5px; }
.mf-how { background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 12px 18px; margin: 8px 0 14px; }
.mf-how ul { margin: 6px 0 0 20px; padding: 0; }
.mf-how li { margin: 4px 0; color: #14532d; }
.mf-how li b { color: #14301f; }
.mf-grp { margin-bottom: 14px; }
.mf-gh { font-weight: 700; color: #166534; margin: 8px 0 4px; border-bottom: 2px solid #16a34a; display: inline-block; font-size: 14px; }
.mf .mf-t td.mf-wrap { white-space: normal; min-width: 170px; max-width: 280px; color: #14532d; }
.mf .mf-t td.mf-read { background: #fffbeb; color: #92400e; min-width: 230px; }
.mf-old { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #86efac; }
</style>
