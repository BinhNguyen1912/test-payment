<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { request, sessions, signIn, verifyPin, setupPin, getPinStatus } from '../api.js';
import { ctx } from '../ctxStore.js';
import DataView from './DataView.vue';

// Three-actor console. Every panel = one real GET endpoint. Lists come from the API; ids are picked from rows (click) or typed.
const open = ref(false);
const actor = ref(new URLSearchParams(location.hash.slice(1)).get('actor') || 'buyer');
if (location.hash.startsWith('#console')) open.value = true;
const adminKey = ref('approver');
const ACTORS = { buyer: 'Người mua', merchant: 'Merchant', creator: 'Creator', admin: 'Admin / Kế toán' };
const session = computed(() => sessions[actor.value === 'admin' ? adminKey.value : actor.value]);

const first = (...ks) => (r) => { for (const k of ks) if (r?.[k] !== undefined && r?.[k] !== null) return String(r[k]); return ''; };
const E = (id, label, path, o = {}) => ({ id, label, method: 'GET', path, params: [], query: [], ...o });
const LIMIT = { k: 'limit', label: 'limit', def: '20' };
const CATALOG = {
  buyer: [
    E('b-orders', '1. Đơn thanh toán của tôi', '/web/payments/orders', { query: [{ k: 'status', label: 'status (PENDING/SUCCESS/FAILED…)' }, LIMIT], pick: { txnRef: first('txnRef'), orderId: first('id') }, why: 'Thấy đơn vừa tạo ở trạng thái PENDING → SUCCESS sau khi VNPay gọi IPN.' }),
    E('b-order', '2. Kết quả 1 đơn (status + fulfillment)', '/web/payments/orders/{txnRef}', { params: ['txnRef'], poll: true, why: 'status = trạng thái tiền (VNPay); fulfillmentStatus = đã giao hàng/voucher chưa. SUCCESS + PENDING/FAILED = đã thu tiền nhưng chưa giao.' }),
    E('b-vouchers', '3. Voucher đã mua', '/mobile/vouchers/my', { query: [LIMIT], pick: { voucherId: first('id') }, why: 'Sau khi đơn SUCCESS + fulfilled, voucher xuất hiện ở đây.' }),
    E('b-voucher', '4. Chi tiết 1 voucher', '/mobile/vouchers/my/{voucherId}', { params: ['voucherId'] }),
    E('b-vledger', '5. Sổ cái của voucher', '/mobile/vouchers/my/{voucherId}/ledger', { params: ['voucherId'], why: 'Các sự kiện tiền gắn với voucher này.' }),
    E('b-history', '6. Lịch sử mua voucher', '/mobile/vouchers/purchase-history', { query: [LIMIT] }),
  ],
  merchant: [
    E('m-packages', '1. Gói voucher của tôi', '/mobile/vouchers/merchant/voucher-packages', { query: [LIMIT], pick: { productId: first('productId', 'id') } }),
    E('m-vouchers', '2. Voucher đã bán theo sản phẩm', '/mobile/vouchers/merchant/voucher-products/{productId}/vouchers', { params: ['productId'], pick: { voucherId: first('id') } }),
    E('m-voucher', '3. Chi tiết 1 voucher đã bán', '/mobile/vouchers/merchant/vouchers/{voucherId}', { params: ['voucherId'] }),
    E('m-earn', '4. Ghi nhận doanh thu (earnings)', '/mobile/merchant/finance/earnings/me', { query: [LIMIT], why: 'Tiền được ghi nhận cho merchant sau khi redeem (FULFILLMENT_RECOGNIZED). Hold 7 ngày trước khi rút được.' }),
    E('m-stmt', '5. Sao kê (statement)', '/mobile/merchant/finance/statement/me', { query: [LIMIT] }),
    E('m-pay', '6. Lệnh rút tiền', '/mobile/merchant/finance/payouts/me', { query: [LIMIT], pick: { payoutId: first('id') } }),
    E('m-bal', '7. Số dư (cần PIN)', '/mobile/merchant/finance/balance/me', { pin: 'VIEW_BALANCE', why: 'Cần PIN như creator.' }),
    E('m-bank', '8. Tài khoản ngân hàng', '/mobile/bank-accounts/me'),
  ],
  creator: [
    E('c-tpl', '0a. Template cam kết của tôi (đăng nhập web)', '/web/creator/commitment-templates', { web: true, query: [LIMIT], why: 'Sản phẩm gốc do creator tạo (chưa bán).' }),
    E('c-list', '0b. Listing đang bán', '/web/creator/commitment-listings', { web: true, query: [LIMIT], pick: { listingId: first('id') }, why: 'Listing = template đã đăng bán trên marketplace (người mua thấy ở Cửa hàng).' }),
    E('c-bal', '1. Số dư (cần PIN)', '/mobile/creator/finance/balance/me', { pin: 'VIEW_BALANCE', why: 'Nhập PIN ở thanh trên; trang tự gọi POST /mobile/pin/verify (reason VIEW_BALANCE) lấy X-Pin-Token 1 lần. pending = đang hold; available = rút được.' }),
    E('c-earn', '2. Ghi nhận doanh thu (earnings)', '/mobile/creator/finance/earnings/me', { query: [LIMIT] }),
    E('c-stmt', '3. Sao kê', '/mobile/creator/finance/statement/me', { query: [LIMIT] }),
    E('c-sales', '4. Đơn bán thẻ cam kết', '/mobile/creator/commitment-dashboard/sales/orders', { why: 'Backend hiện trả 503 CREATOR_DASHBOARD_DISABLED nếu dashboard đang tắt.', query: [LIMIT, { k: 'startDate', label: 'từ ngày YYYY-MM-DD' }, { k: 'endDate', label: 'đến ngày' }], pick: { orderId: first('orderId', 'id') } }),
    E('c-sale', '5. Chi tiết 1 đơn bán', '/mobile/creator/commitment-dashboard/sales/orders/{orderId}', { params: ['orderId'] }),
    E('c-pay', '6. Lệnh rút tiền', '/mobile/creator/finance/payouts/me', { query: [LIMIT], pick: { payoutId: first('id') } }),
    E('c-payd', '7. Chi tiết lệnh rút', '/mobile/creator/finance/payouts/{payoutId}', { params: ['payoutId'] }),
    E('c-alloc', '8. Lệnh rút trừ vào khoản nào (allocations)', '/mobile/creator/finance/payouts/{payoutId}/allocations', { params: ['payoutId'] }),
  ],
  admin: [
    E('a-int', '1. Kiểm tra toàn vẹn sổ cái', '/web/admin/finance/ledger/integrity', { why: 'Tổng Nợ = tổng Có và các bộ đếm lệch (payment/earning/payout/treasury…) phải = 0.' }),
    E('a-jour', '2. Bút toán gần đây (Nợ/Có)', '/web/admin/finance/ledger/journals', { query: [LIMIT], ledger: true, why: 'Mỗi dòng: tài khoản, Nợ/Có, bên liên quan. Tick "chỉ đơn đang chọn" để lọc theo đơn.' }),
    E('a-settle', '3. Đối soát VNPay (settlements)', '/web/admin/finance/ledger/vnpay-settlements', { query: [LIMIT], pick: { settlementId: first('id') } }),
    E('a-pays', '4. Lệnh rút tiền', '/web/admin/finance/payouts', { query: [LIMIT, { k: 'status', label: 'status' }], pick: { payoutId: first('id') } }),
    E('a-pay', '5. Chi tiết lệnh rút', '/web/admin/finance/payouts/{payoutId}', { params: ['payoutId'] }),
    E('a-alloc', '6. Allocations của lệnh rút', '/web/admin/finance/payouts/{payoutId}/allocations', { params: ['payoutId'] }),
    E('a-rev', '7. Nguồn doanh thu (revenue sources)', '/web/admin/finance/revenue-sources'),
  ],
};
const INFO = {
  buyer: [['Hồ sơ', '/mobile/profiles/me'], ['eKYC', '/mobile/ekyc/status'], ['Gói thành viên', '/mobile/membership/me'], ['Ngân hàng', '/mobile/bank-accounts/me'], ['Mã giới thiệu', '/mobile/referrals/my-code']],
  merchant: [['Hồ sơ', '/mobile/profiles/me'], ['Sub-account', '/mobile/sub-accounts', { role: 'merchant' }], ['Trạng thái PIN', '/mobile/pin/status'], ['Ngân hàng', '/mobile/bank-accounts/me']],
  creator: [['Hồ sơ', '/mobile/profiles/me'], ['Sub-account', '/mobile/sub-accounts', { role: 'creator' }], ['Trạng thái PIN', '/mobile/pin/status'], ['Ngân hàng', '/mobile/bank-accounts/me']],
  admin: [['Hồ sơ', '/mobile/profiles/me']],
};
const info = reactive({ blocks: [], at: '', loading: false });
async function loadInfo() {
  if (!session.value.accessToken) return;
  info.loading = true; info.blocks = [];
  for (const [title, path, query] of INFO[actor.value]) {
    const b = { title, path, status: null, data: null, err: '' };
    info.blocks.push(b);
    try { const r = await request(session.value, 'GET', path, { query }); b.status = r.status ?? 200; b.data = r.data; } catch (e) { b.status = e.status || 'ERR'; b.err = `${e.code || ''} ${e.message}`.trim(); }
  }
  info.at = new Date().toLocaleTimeString(); info.loading = false;
}
const flat = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).filter(([, v]) => v === null || typeof v !== 'object') : []);
const entries = computed(() => CATALOG[actor.value]);
const state = reactive({});
const qv = reactive({});
const timers = {};
const onlyOrder = ref(false);

// Creator "web" endpoints need a COOKIE web session (clientId user, then switch into the creator sub-account).
const webFor = ref('');
const getCookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(`${n}=`))?.split('=')[1] || '';
async function webFetch(method, path, body) {
  const s = session.value;
  const headers = { 'content-type': 'application/json', 'Device-Id': s.deviceId };
  if (method !== 'GET') headers['x-csrf-token'] = decodeURIComponent(getCookie('csrf_token'));
  const r = await fetch(`/api/v1${path}`, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { code: j?.error?.code, status: r.status });
  return { status: r.status, data: j.data, meta: j.meta };
}
async function ensureWeb() {
  const s = session.value;
  if (webFor.value === s.key) return;
  await webFetch('POST', '/web/auth/sign-in', { clientId: 'user', identifier: s.identifier, password: s.password });
  if (s.activeAccountUserId) await webFetch('POST', '/web/sub-accounts/switch', { targetUserId: String(s.activeAccountUserId) });
  webFor.value = s.key;
}
const st = (e) => (state[e.id] ??= { loading: false, status: null, body: null, meta: null, err: '', at: '', auto: false, sent: null });
const rows = (s) => (Array.isArray(s.body) ? s.body : null);
const scalarCols = (list) => {
  const ks = new Map();
  list.slice(0, 10).forEach((r) => Object.entries(r || {}).forEach(([k, v]) => { if (v === null || typeof v !== 'object') ks.set(k, (ks.get(k) || 0) + 1); }));
  return [...ks.keys()].slice(0, 9);
};
const fill = (e) => e.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(ctx[k] || `{${k}}`));

async function run(e) {
  const s = st(e);
  const missing = e.params.filter((k) => !ctx[k]);
  if (missing.length) { s.err = `Thiếu ${missing.join(', ')} — bấm một dòng ở danh sách phía trên, hoặc nhập vào ô.`; return; }
  const query = {};
  e.query.forEach((q) => { const v = qv[`${e.id}:${q.k}`] ?? q.def; if (v) query[q.k] = v; });
  s.loading = true; s.err = '';
  s.sent = { path: fill(e), query, typed: e.params.concat(e.query.map((q) => q.k)).filter((k) => (ctx[k] || query[k])) };
  try {
    const headers = {};
    if (e.pin) {
      if (!ctx.pin) throw Object.assign(new Error('Nhập PIN ở thanh trên trước.'), { code: 'PIN_INPUT_REQUIRED' });
      const v = await verifyPin(session.value, ctx.pin, e.pin);
      headers['X-Pin-Token'] = v.data.pinToken;
    }
    let res;
    if (e.web) {
      await ensureWeb();
      const qs = new URLSearchParams(query).toString();
      res = await webFetch('GET', fill(e) + (qs ? `?${qs}` : ''));
    } else res = await request(session.value, 'GET', fill(e), { query, headers });
    s.status = res.status ?? 200; s.body = res.data; s.meta = res.meta; s.at = new Date().toLocaleTimeString();
    return res;
  } catch (er) {
    s.status = er.status || 'ERR'; s.body = null; s.err = `${er.code || ''} ${er.message}`.trim(); s.at = new Date().toLocaleTimeString();
  } finally { s.loading = false; }
}
function pickRow(e, r) {
  if (!e.pick) return;
  Object.entries(e.pick).forEach(([k, fn]) => { const v = fn(r); if (v) ctx[k] = v; });
}
function togglePoll(e) {
  const s = st(e);
  s.auto = !s.auto;
  clearInterval(timers[e.id]);
  if (s.auto) {
    timers[e.id] = setInterval(async () => {
      await run(e);
      if (s.body && s.body.status && s.body.status !== 'PENDING' && !['PENDING', 'PROCESSING'].includes(s.body.fulfillmentStatus)) { s.auto = false; clearInterval(timers[e.id]); }
    }, 3000);
  }
}
onMounted(() => {
  // #console&actor=admin&run=a-int,a-settle  -> run those panels once the session is signed in
  const ids = (new URLSearchParams(location.hash.slice(1)).get('run') || '').split(',').filter(Boolean);
  if (ids.length) setTimeout(async () => { for (const id of ids) { const e = Object.values(CATALOG).flat().find((x) => x.id === id); if (e && session.value.accessToken) await run(e); } }, 800);
});
onMounted(() => window.addEventListener('actor:open', (ev) => {
  open.value = true; actor.value = ev.detail?.actor || 'buyer';
  const e = CATALOG.buyer.find((x) => x.id === 'b-order');
  if (ev.detail?.poll && sessions.buyer.accessToken && ctx.txnRef && !st(e).auto) { run(e).then(() => togglePoll(e)); }
}));
onBeforeUnmount(() => Object.values(timers).forEach(clearInterval));
const needLogin = computed(() => !session.value.accessToken);
const pinMsg = ref('');
async function pinStatus() { try { pinMsg.value = JSON.stringify((await getPinStatus(session.value)).data); } catch (e) { pinMsg.value = `${e.code || ''} ${e.message}`; } }
async function pinSetup() {
  try { pinMsg.value = JSON.stringify((await setupPin(session.value, session.value.password, ctx.pin)).data); } catch (e) { pinMsg.value = `${e.code || ''} ${e.message}`; }
}
async function login() { try { await signIn(session.value); await loadInfo(); } catch { /* shown on session.error */ } }
const money = (v) => Number(v ?? 0).toLocaleString('vi-VN');
const journals = (s) => {
  const l = rows(s) || [];
  return onlyOrder.value && ctx.orderId ? l.filter((j) => String(j.sourceId) === String(ctx.orderId)) : l;
};
const dr = (j) => j.lines.filter((x) => x.side === 'DEBIT').reduce((a, x) => a + BigInt(x.amountVnd), 0n);
const cr = (j) => j.lines.filter((x) => x.side === 'CREDIT').reduce((a, x) => a + BigInt(x.amountVnd), 0n);
const json = (v) => JSON.stringify(v, null, 2);
watch([actor, adminKey], () => { info.blocks = []; info.at = ''; loadInfo(); });
</script>

<template>
  <button class="ac-fab" @click="open = !open">👥 3 Actor</button>
  <div v-if="open" class="ac">
    <header class="ac-head">
      <b>Console theo vai trò</b>
      <button v-for="(n, k) in ACTORS" :key="k" :class="{ 'ac-on': actor === k }" @click="actor = k">{{ n }}</button>
      <span class="ac-sp" />
      <select v-if="actor === 'admin'" v-model="adminKey"><option value="approver">Kế toán duyệt</option><option value="executor">Treasury</option><option value="reconciler">Đối soát</option></select>
      <span class="ac-who">{{ session.identifier || '(chưa có tài khoản)' }}<template v-if="session.activeAccountUserId"> · sub #{{ session.activeAccountUserId }}</template></span>
      <button v-if="needLogin" :disabled="!session.identifier || session.busy" @click="login">Đăng nhập</button><span v-else class="ac-okc">đã đăng nhập</span>
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="session.error" class="ac-err">{{ session.error }}</p>
    <section v-if="!needLogin && info.blocks.length" class="ac-info">
      <div class="ac-ih"><b>Thông tin tài khoản đang dùng</b> <span class="ac-muted">mỗi khối là 1 API GET thật · {{ info.at }}</span> <button @click="loadInfo" :disabled="info.loading">Làm mới</button></div>
      <div class="ac-ig">
        <div v-for="b in info.blocks" :key="b.title" class="ac-ib">
          <div class="ac-it">{{ b.title }} <code>GET {{ b.path }}</code> <span :class="['ac-badge', String(b.status).startsWith('2') ? 'ac-good' : 'ac-bad']">{{ b.status ?? '…' }}</span></div>
          <div v-if="b.err" class="ac-err">{{ b.err }}</div>
          <DataView v-else-if="b.data !== null" :data="b.data" />
          <div v-else class="ac-muted">chưa có dữ liệu (null)</div>
        </div>
      </div>
    </section>
    <div class="ac-ctxbar">
      <span>Đang theo dõi:</span>
      <label v-for="k in ['txnRef', 'orderId', 'voucherId', 'productId', 'payoutId', 'settlementId']" :key="k">{{ k }} <input v-model="ctx[k]" :placeholder="k" /></label>
      <template v-if="actor === 'merchant' || actor === 'creator'">
        <label>PIN <input v-model="ctx.pin" type="password" placeholder="PIN 6 số" /></label>
        <button @click="pinStatus" :disabled="needLogin">Trạng thái PIN</button>
        <button @click="pinSetup" :disabled="needLogin || !ctx.pin" title="POST /mobile/pin/setup, dùng mật khẩu đăng nhập">Thiết lập PIN</button>
        <span class="ac-muted">{{ pinMsg }}</span>
      </template>
      <span class="ac-muted">Chọn dòng trong bảng để tự điền; hoặc gõ tay.</span>
    </div>
    <div class="ac-panels">
      <section v-for="e in entries" :key="e.id" class="ac-panel">
        <div class="ac-ph">
          <b>{{ e.label }}</b> <code>GET {{ e.path }}</code>
        </div>
        <p v-if="e.why" class="ac-muted">{{ e.why }}</p>
        <div class="ac-row">
          <label v-for="k in e.params" :key="k">{{ k }} <input v-model="ctx[k]" :placeholder="k" /></label>
          <label v-for="q in e.query" :key="q.k">{{ q.label }} <input v-model="qv[`${e.id}:${q.k}`]" :placeholder="q.def || ''" /></label>
          <button class="ac-go" :disabled="st(e).loading || needLogin" @click="run(e)">Gọi API</button>
          <button v-if="e.poll" :class="{ 'ac-on': st(e).auto }" :disabled="needLogin" @click="togglePoll(e)">{{ st(e).auto ? 'Dừng tự làm mới' : 'Tự làm mới 3s' }}</button>
          <label v-if="e.ledger"><input type="checkbox" v-model="onlyOrder" /> chỉ đơn đang chọn</label>
          <span v-if="st(e).status" :class="['ac-badge', String(st(e).status).startsWith('2') ? 'ac-good' : 'ac-bad']">{{ st(e).status }}</span>
          <span class="ac-muted">{{ st(e).at }}</span>
        </div>
        <p v-if="st(e).err" class="ac-err">{{ st(e).err }}</p>
        <div v-if="st(e).sent && st(e).body !== null" class="ac-muted">Đã gọi: <code>{{ st(e).sent.path }}</code> <code v-if="Object.keys(st(e).sent.query).length">?{{ new URLSearchParams(st(e).sent.query).toString() }}</code></div>

        <template v-if="st(e).body !== null">
          <!-- ledger view -->
          <div v-if="e.ledger && rows(st(e))">
            <p v-if="!journals(st(e)).length" class="ac-muted">Không có bút toán khớp.</p>
            <div v-for="j in journals(st(e))" :key="j.id" class="ac-jr" @click="ctx.orderId = j.sourceType === 'PAYMENT_ORDER' ? String(j.sourceId) : ctx.orderId">
              <div><b>#{{ j.id }}</b> {{ j.eventType }} <span class="ac-muted">{{ j.sourceType }}:{{ j.sourceId }} · {{ j.occurredAt }}</span></div>
              <table><thead><tr><th>Tài khoản</th><th>Nợ</th><th>Có</th><th>Bên</th></tr></thead><tbody>
                <tr v-for="(l, i) in j.lines" :key="i"><td>{{ l.accountCode }}</td><td class="ac-n">{{ l.side === 'DEBIT' ? money(l.amountVnd) : '' }}</td><td class="ac-n">{{ l.side === 'CREDIT' ? money(l.amountVnd) : '' }}</td><td>{{ l.partyType }}/{{ l.partyId }}</td></tr>
              </tbody><tfoot><tr><td>Σ</td><td class="ac-n">{{ money(dr(j)) }}</td><td class="ac-n">{{ money(cr(j)) }}</td><td :class="dr(j) === cr(j) ? 'ac-okc' : 'ac-bad2'">{{ dr(j) === cr(j) ? 'cân' : 'LỆCH' }}</td></tr></tfoot></table>
            </div>
          </div>
          <!-- every field of the response, as tables -->
          <div v-else class="ac-data">
            <DataView :data="st(e).body" :on-pick="e.pick ? (r) => pickRow(e, r) : null" />
            <div v-if="st(e).meta" class="ac-muted">meta: <code>{{ JSON.stringify(st(e).meta) }}</code></div>
            <div v-if="e.pick" class="ac-muted">Bấm một dòng để chọn làm id đang theo dõi.</div>
          </div>
          <details><summary class="ac-muted">JSON thô</summary><pre>{{ json({ data: st(e).body, meta: st(e).meta }) }}</pre></details>
        </template>
      </section>
    </div>
  </div>
</template>

<style>
/* White + green theme */
.ac-fab { position: fixed; left: 150px; bottom: 16px; z-index: 9000; background: #16a34a !important; color: #fff !important; border: 0; border-radius: 22px; padding: 10px 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
.ac { position: fixed; inset: 0; z-index: 9600; background: #f6fdf8; color: #14301f; overflow: auto; font: 13px/1.45 -apple-system, 'Segoe UI', sans-serif; }
.ac button { all: unset; box-sizing: border-box; cursor: pointer; background: #fff; color: #14532d; border: 1px solid #86efac; border-radius: 6px; padding: 4px 11px; font-size: 12.5px; }
.ac button:hover:not(:disabled) { background: #f0fdf4; } .ac button:disabled { opacity: .5; cursor: not-allowed; }
.ac button.ac-on { background: #14532d; color: #fff; border-color: #14532d; } .ac button.ac-go { background: #16a34a; color: #fff; border-color: #16a34a; font-weight: 700; }
.ac input, .ac select { width: auto; padding: 4px 7px; background: #fff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; font-size: 12.5px; box-shadow: none; }
.ac input { width: 120px; } .ac input[type=checkbox] { width: auto; }
.ac input:focus, .ac select:focus { outline: none; border-color: #16a34a; box-shadow: 0 0 0 2px #bbf7d0; }
.ac label { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; font-weight: 400; color: #14532d; justify-content: flex-start; }
.ac-head { display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #14532d; color: #fff; position: sticky; top: 0; z-index: 3; flex-wrap: wrap; }
.ac-head b { color: #fff; } .ac-head button.ac-on { background: #22c55e; border-color: #22c55e; color: #052e16; font-weight: 700; }
.ac-sp { flex: 1; } .ac-who { color: #bbf7d0; } .ac-okc { color: #15803d; font-weight: 600; } .ac-head .ac-okc { color: #bbf7d0; } .ac-bad2 { color: #b91c1c; font-weight: 700; }
.ac-ctxbar { display: flex; gap: 10px; align-items: center; padding: 8px 16px; background: #fff; border-bottom: 1px solid #bbf7d0; flex-wrap: wrap; position: sticky; top: 50px; z-index: 2; }
.ac-panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(620px, 1fr)); gap: 12px; padding: 14px 16px 40px; align-items: start; }
.ac-panel { background: #fff; border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; border-radius: 10px; padding: 10px 14px; min-width: 0; }
.ac-ph { font-size: 13.5px; } .ac-ph code { color: #166534; font-size: 11.5px; margin-left: 6px; background: #f0fdf4; padding: 1px 6px; border-radius: 4px; }
.ac .ac-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
.ac-muted { color: #5f7a69; font-size: 12px; margin: 3px 0; }
.ac-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 5px 10px; border-radius: 6px; margin: 6px 0; }
.ac-badge { padding: 0 8px; border-radius: 9px; font-size: 11px; font-weight: 700; } .ac-badge.ac-good { background: #dcfce7; color: #166534; } .ac-badge.ac-bad { background: #fee2e2; color: #b91c1c; }
.ac-data { margin-top: 6px; }
.ac table { border-collapse: collapse; font-size: 12px; width: auto; background: #fff; }
.ac th, .ac td { border: 1px solid #d9f2e1; padding: 3px 8px; color: #14301f; text-align: left; text-transform: none; letter-spacing: 0; font-size: 12px; white-space: nowrap; background: #fff; }
.ac th { background: #dcfce7; color: #14532d; font-weight: 700; }
.ac tr.ac-pick { cursor: pointer; } .ac tr.ac-pick:hover td { background: #f0fdf4; } .ac-n { text-align: right !important; font-variant-numeric: tabular-nums; }
.ac-jr { border: 1px solid #bbf7d0; background: #f7fdf9; border-radius: 8px; padding: 6px 10px; margin: 6px 0; cursor: pointer; }
.ac-jr tfoot td { font-weight: 700; background: #dcfce7; color: #14532d; }
.ac pre { background: #f0fdf4 !important; color: #14301f !important; border: 1px solid #bbf7d0; padding: 8px; border-radius: 6px; overflow: auto; max-height: 260px; font-size: 11.5px; }
.ac-info { background: #fff; border-bottom: 1px solid #bbf7d0; padding: 10px 16px; } .ac-ih { display: flex; gap: 10px; align-items: center; }
.ac-ig { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 10px; margin-top: 8px; } .ac-ib { border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 10px; background: #f7fdf9; min-width: 0; }
.ac-it { font-weight: 700; color: #14532d; margin-bottom: 4px; } .ac-it code { font-weight: 400; color: #166534; font-size: 11px; margin: 0 4px; }
</style>
