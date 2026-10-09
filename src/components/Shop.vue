<script setup>
import { fieldDoc } from '../fieldDocs.js';
import { computed, reactive, ref, watch } from 'vue';
import { request, sessions, signIn, uuid } from '../api.js';
import { ctx } from '../ctxStore.js';

// A real storefront. Every list comes from a GET, every action is a real API call, nothing is hardcoded or seeded.
// Each call shows the exact DTO sent (what the user typed vs. what the page filled in) and the raw response.
const open = ref(false);
const buyer = sessions.buyer;
if (location.hash === '#shop') open.value = true;
const tab = ref('commitments');
const loading = ref(false);
const err = ref('');
const lists = reactive({
  commitments: { items: [], cursor: null, hasMore: false, loaded: false },
  vouchers: { items: [], cursor: null, hasMore: false, loaded: false },
});
const filter = reactive({ q: '', minPrice: '', maxPrice: '' });
const pay = reactive({ bankCode: '', locale: 'vn' });
const qty = reactive({});
const cart = ref(null);
const preview = ref(null);
const picked = reactive({});
const calls = ref([]);
const order = ref(null);

const money = (v) => `${Number(v ?? 0).toLocaleString('vi-VN')} ₫`;
const priceOf = (it) => Number(it.price?.amount ?? it.salePrice ?? it.priceVnd ?? 0);
const titleOf = (it) => it.commitment?.title || it.title || it.name || `#${it.id}`;
const sellerOf = (it) => it.creator?.displayName || it.issuerName || '';

async function call(label, method, path, { query, body, auto = {}, typed = {} } = {}) {
  const rec = reactive({ label, method, path, query, body, auto, typed, status: null, response: null, at: new Date().toLocaleTimeString() });
  calls.value.unshift(rec);
  if (calls.value.length > 30) calls.value.pop();
  try {
    const res = await request(buyer, method, path, { query, body });
    rec.status = res.status ?? 200;
    rec.response = { data: res.data, meta: res.meta };
    return res;
  } catch (e) {
    rec.status = e.status || 'ERR';
    rec.response = { code: e.code, message: e.message, details: e.details };
    throw e;
  }
}
const guard = async (fn) => {
  err.value = '';
  loading.value = true;
  try { return await fn(); } catch (e) { err.value = `${e.code || ''} ${e.message || e}`.trim(); } finally { loading.value = false; }
};

async function login() { await guard(() => signIn(buyer)); await loadInfo(); if (!lists[tab.value].loaded) loadList(tab.value); loadCart(); }

async function loadList(kind, more = false) {
  await guard(async () => {
    const L = lists[kind];
    const query = { limit: 12, cursor: more ? L.cursor : undefined };
    if (kind === 'commitments') { query.minPrice = filter.minPrice || undefined; query.maxPrice = filter.maxPrice || undefined; }
    else query.q = filter.q || undefined;
    const path = kind === 'commitments' ? '/web/marketplace/commitments' : '/web/marketplace/vouchers';
    const res = await call(`Danh sách ${kind}`, 'GET', path, { query, typed: Object.fromEntries(Object.entries(query).filter(([k, v]) => v !== undefined && !['limit', 'cursor'].includes(k))) });
    const data = Array.isArray(res.data) ? res.data : [];
    L.items = more ? [...L.items, ...data] : data;
    L.cursor = res.meta?.nextCursor || null;
    L.hasMore = !!res.meta?.hasMore;
    L.loaded = true;
  });
}
watch(open, (v) => { if (v && buyer.accessToken) { loadInfo(); if (!lists[tab.value].loaded) loadList(tab.value); loadCart(); } });
watch(tab, (k) => { if (open.value && buyer.accessToken && !lists[k].loaded) loadList(k); });

async function buyNow(kind, item) {
  await guard(async () => {
    const body = { idempotencyKey: uuid(), bankCode: pay.bankCode || undefined, locale: pay.locale };
    const path = kind === 'commitments' ? `/web/marketplace/commitments/${item.id}/purchase` : `/web/marketplace/vouchers/${item.id}/purchase`;
    const res = await call(`Mua ngay: ${titleOf(item)}`, 'POST', path, { body, auto: { idempotencyKey: 'sinh tự động (UUID v4)', 'path param': 'id lấy từ GET danh sách' }, typed: { bankCode: pay.bankCode || '(để VNPay chọn)', locale: pay.locale } });
    order.value = res.data;
    track(res.data);
  });
}

function track(o) { if (o?.txnRef) { ctx.txnRef = o.txnRef; ctx.orderId = String(o.orderId || ''); window.dispatchEvent(new CustomEvent('shop:order', { detail: o })); } }
function openConsole() { window.dispatchEvent(new CustomEvent('actor:open', { detail: { actor: 'buyer', poll: true } })); }
const productTypeOf = (kind) => (kind === 'commitments' ? 'COMMITMENT_TEMPLATE' : 'VOUCHER');
async function addToCart(kind, item) {
  await guard(async () => {
    const quantity = Number(qty[`${kind}:${item.id}`] || 1);
    // Thẻ cam kết: item.id là id LISTING (dùng cho /purchase). Giỏ hàng cần id TEMPLATE = item.commitment.templateId,
    // nếu gửi listing id thì backend trả 404 CART_PRODUCT_NOT_FOUND.
    const productId = kind === 'commitments' ? item.commitment?.templateId : item.id;
    if (!productId) throw new Error('Không tìm thấy commitment.templateId trong item của danh sách');
    const body = { productType: productTypeOf(kind), productId: String(productId), quantity };
    try {
      const res = await call(`Thêm giỏ: ${titleOf(item)}`, 'POST', '/web/cart/items', { body, auto: { productType: 'theo tab đang xem', productId: kind === 'commitments' ? 'commitment.templateId từ GET danh sách (không phải id listing)' : 'id từ GET danh sách' }, typed: { quantity } });
      cart.value = res.data;
      await refreshPreview();
    } catch (e) {
      // Backend trả 404 CART_PRODUCT_NOT_FOUND cả khi sản phẩm chỉ không còn đủ điều kiện mua (hết hàng,
      // hết hạn mở bán, chưa publish...), vì bước kiểm tra dùng chung bộ lọc marketplace. Tải lại danh sách để khớp.
      if (e.code === 'CART_PRODUCT_NOT_FOUND') {
        await loadList(kind);
        err.value = `CART_PRODUCT_NOT_FOUND: sản phẩm #${productId} hiện không còn đủ điều kiện mua (hết hàng, hết hạn mở bán hoặc chưa publish) hoặc không tồn tại. Đã tải lại danh sách.`;
        return;
      }
      throw e;
    }
  });
}
async function loadCart() { await guard(async () => { cart.value = (await call('Xem giỏ', 'GET', '/web/cart')).data; await refreshPreview(); }); }
async function refreshPreview() {
  if (!cart.value?.items?.length) { preview.value = null; return; }
  preview.value = (await call('Preview thanh toán giỏ', 'GET', '/web/cart/checkout-preview')).data;
}
async function setQty(ci, n) {
  await guard(async () => { cart.value = (await call(`Đổi số lượng #${ci.id}`, 'PATCH', `/web/cart/items/${ci.id}`, { body: { quantity: n }, typed: { quantity: n } })).data; await refreshPreview(); });
}
async function removeItem(ci) {
  await guard(async () => { await call(`Xóa #${ci.id}`, 'DELETE', `/web/cart/items/${ci.id}`); await loadCart(); });
}
const pickedIds = computed(() => (cart.value?.items || []).filter((c) => picked[c.id]).map((c) => String(c.id)));
async function checkout() {
  await guard(async () => {
    await refreshPreview();
    if (!preview.value?.checkoutEligible) throw Object.assign(new Error(`Giỏ chưa thanh toán được: ${preview.value?.checkoutBlockedReason || 'unknown'}`), { code: 'CART_BLOCKED' });
    const body = { idempotencyKey: uuid(), checkoutRevision: preview.value.checkoutRevision, cartItemIds: pickedIds.value.length ? pickedIds.value : undefined, locale: pay.locale, bankCode: pay.bankCode || undefined };
    const res = await call('Thanh toán giỏ hàng', 'POST', '/web/cart/checkout', { body, auto: { idempotencyKey: 'UUID v4 tự sinh', checkoutRevision: 'lấy từ GET checkout-preview' }, typed: { cartItemIds: pickedIds.value.length ? pickedIds.value : '(cả giỏ)', bankCode: pay.bankCode || '(để VNPay chọn)', locale: pay.locale } });
    order.value = res.data;
    track(res.data);
    await loadCart();
  });
}
// ---- buyer information: every block is a real GET, labelled with the API it came from
const info = reactive({ loading: false, blocks: [], at: '' });
const COMMITMENT_PURPOSES = ['COMMITMENT_TEMPLATE_PURCHASE', 'CART_CHECKOUT'];
function commitmentOrders(list) {
  return (Array.isArray(list) ? list : [])
    .filter((o) => COMMITMENT_PURPOSES.includes(o.purpose))
    .map((o) => ({
      txnRef: o.txnRef, purpose: o.purpose, amountVnd: o.amountVnd, status: o.status,
      fulfillmentStatus: o.fulfillmentStatus, paidAt: o.paidAt, fulfilledAt: o.fulfilledAt, createdAt: o.createdAt,
    }));
}
const SOURCES = [
  ['Hồ sơ', '/mobile/profiles/me'],
  ['eKYC', '/mobile/ekyc/status'],
  ['Gói thành viên', '/web/membership/me'],
  ['Ngân hàng nhận tiền', '/mobile/bank-accounts/me'],
  ['Mã giới thiệu', '/mobile/referrals/my-code'],
  ['Đơn thanh toán (5 gần nhất)', '/web/payments/orders', { limit: 5 }],
  ['Voucher đã mua', '/mobile/vouchers/purchase-history', { limit: 5 }],
  // Backend chưa có API liệt kê kho thẻ cam kết của người mua, nên lọc từ đơn thanh toán:
  // mua lẻ (COMMITMENT_TEMPLATE_PURCHASE) và mua qua giỏ (CART_CHECKOUT, có thể kèm voucher).
  ['Thẻ cam kết đã mua (lọc từ đơn thanh toán)', '/web/payments/orders', { limit: 50 }, commitmentOrders],
];
async function loadInfo() {
  if (!buyer.accessToken) return;
  info.loading = true;
  info.blocks = [];
  for (const [title, path, query, pick] of SOURCES) {
    const b = { title, path, status: null, data: null, err: '' };
    info.blocks.push(b);
    try { const res = await request(buyer, 'GET', path, { query }); b.status = res.status ?? 200; b.data = pick ? pick(res.data) : res.data; }
    catch (e) { b.status = e.status || 'ERR'; b.err = `${e.code || ''} ${e.message}`.trim(); }
  }
  info.at = new Date().toLocaleTimeString();
  info.loading = false;
}
const flat = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).filter(([, v]) => v === null || typeof v !== 'object') : []);
const listOf = (d) => (Array.isArray(d) ? d : null);
const cols = (l) => { const m = new Set(); l.slice(0, 5).forEach((r) => Object.entries(r || {}).forEach(([k, v]) => { if (v === null || typeof v !== 'object') m.add(k); })); return [...m].slice(0, 8); };
const showInfo = ref(true);
// ---- where the current order is in the pipeline (from GET /web/payments/orders/:txnRef)
const track2 = reactive({ data: null, err: '', auto: false });
let timer = null;
async function refreshOrder() {
  if (!order.value?.txnRef) return;
  try { track2.data = (await request(buyer, 'GET', `/web/payments/orders/${encodeURIComponent(order.value.txnRef)}`)).data; track2.err = ''; }
  catch (e) { track2.err = `${e.code || ''} ${e.message}`.trim(); }
  const d = track2.data;
  if (d && d.status !== 'PENDING' && !['PENDING', 'PROCESSING'].includes(d.fulfillmentStatus)) stopWatch();
}
function watchOrder() { stopWatch(); track2.auto = true; refreshOrder(); timer = setInterval(refreshOrder, 3000); }
function stopWatch() { track2.auto = false; clearInterval(timer); }
const steps = computed(() => {
  const d = track2.data; const o = order.value;
  if (!o) return [];
  return [
    { t: 'Tạo đơn', sub: `POST …/purchase | cart/checkout → payment_orders #${o.orderId}`, ok: true },
    { t: 'Chuyển sang VNPay', sub: o.paymentUrl ? 'có paymentUrl' : 'không có paymentUrl', ok: !!o.paymentUrl },
    { t: 'Thanh toán', sub: d ? `status = ${d.status}${d.paidAt ? ` · ${d.paidAt}` : ''}` : 'chưa kiểm tra', ok: d?.status === 'SUCCESS', bad: ['FAILED', 'EXPIRED', 'CANCELLED'].includes(d?.status) },
    { t: 'VNPay báo về backend (IPN)', sub: d?.confirmedSource ? `xác nhận bởi ${d.confirmedSource} · mã GD ${d.transactionNo}` : 'chờ', ok: !!d?.confirmedSource },
    { t: 'Giao hàng / ghi voucher', sub: d ? `fulfillmentStatus = ${d.fulfillmentStatus}${d.fulfilledAt ? ` · ${d.fulfilledAt}` : ''}` : 'chờ', ok: d?.fulfillmentStatus === 'FULFILLED', bad: d?.fulfillmentStatus === 'FAILED' },
    { t: 'Ghi sổ kép (journal)', sub: 'PAYMENT_CAPTURED: Nợ VNPAY_CLEARING / Có CUSTOMER_FUNDS_HELD — xem ở 👥 3 Actor › Admin › Bút toán', ok: d?.status === 'SUCCESS' && d?.fulfillmentStatus === 'FULFILLED', soft: true },
  ];
});
const cartCount = computed(() => () => cart.value?.totalQuantity || 0);
const json = (v) => JSON.stringify(v, null, 2);
</script>

<template>
  <button class="shop-fab" @click="open = !open">🛒 Cửa hàng <span v-if="cartCount" class="shop-badge">{{ cartCount }}</span></button>
  <div v-if="open" class="shop">
    <header class="shop-head">
      <b>TrustWow Shop</b>
      <span class="shop-muted">người mua: {{ buyer.identifier || '(chưa có)' }}</span>
      <span class="sh-sp" />
      <button v-if="!buyer.accessToken" :disabled="!buyer.identifier || buyer.busy" @click="login">Đăng nhập người mua</button>
      <span v-else class="sh-ok">đã đăng nhập</span>
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="!buyer.accessToken" class="shop-warn">Chưa đăng nhập. Persona Buyer lấy từ <code>public/accounts.local.json</code> hoặc nút Register via API ở trang chính.</p>
    <p v-if="err" class="shop-err">{{ err }}</p>

    <section v-if="buyer.accessToken" class="sh-info">
      <div class="sh-ih"><b>Thông tin người mua</b> <span class="shop-muted">mỗi khối là 1 API GET thật · {{ info.at }}</span>
        <span class="sh-sp" /><button :disabled="info.loading" @click="loadInfo">Làm mới</button><button @click="showInfo = !showInfo">{{ showInfo ? 'Thu gọn' : 'Mở' }}</button></div>
      <div v-if="showInfo" class="sh-ig">
        <div v-for="b in info.blocks" :key="b.title" class="sh-ib">
          <div class="sh-it">{{ b.title }} <code>GET {{ b.path }}</code> <span :class="['sh-st', String(b.status).startsWith('2') ? 'sh-ok' : 'sh-bad']">{{ b.status ?? '…' }}</span></div>
          <div v-if="b.err" class="shop-err">{{ b.err }}</div>
          <template v-else-if="listOf(b.data)">
            <div v-if="!b.data.length" class="shop-muted">rỗng</div>
            <div v-else class="sh-tw"><table class="sh-tb"><thead><tr><th v-for="c in cols(b.data)" :key="c" class="fd-h"><b>{{ c }}</b><span class="fd-d">({{ fieldDoc(c) }})</span></th></tr></thead>
              <tbody><tr v-for="(r, i) in b.data" :key="i"><td v-for="c in cols(b.data)" :key="c">{{ r[c] }}</td></tr></tbody></table></div>
          </template>
          <div v-else-if="b.data === null && b.status" class="shop-muted">chưa có dữ liệu (null)</div>
          <div v-else class="sh-kv"><div v-for="[k, v] in flat(b.data)" :key="k"><span>{{ k }}</span><b>{{ v }}</b></div></div>
        </div>
      </div>
    </section>

    <div v-if="order" class="shop-order">
      <b>Đơn đã tạo</b> #{{ order.orderId }} · txnRef <code>{{ order.txnRef }}</code> · {{ money(order.amountVnd) }} · hết hạn {{ order.expiresAt }}
      <div v-if="order.paymentUrl"><a class="sh-pay" :href="order.paymentUrl" target="_blank" rel="noopener">Thanh toán trên VNPay →</a>
        <span class="shop-muted"> (tab VNPay đã tự mở; bấm lại nếu trình duyệt chặn)</span></div>
      <div v-else class="shop-warn">paymentUrl = null (đơn không còn thanh toán được — idempotency replay).</div>
      <button @click="track2.auto ? stopWatch() : watchOrder()">{{ track2.auto ? 'Dừng theo dõi' : 'Theo dõi kết quả đơn (3s)' }}</button>
      <button @click="openConsole">Mở console 3 actor</button>
      <button @click="order = null">Ẩn</button>
      <ol v-if="steps.length" class="sh-steps">
        <li v-for="(x, i) in steps" :key="i" :class="{ 'sh-done': x.ok, 'sh-fail': x.bad }"><b>{{ i + 1 }}. {{ x.t }}</b><span>{{ x.sub }}</span></li>
      </ol>
      <p v-if="track2.err" class="shop-err">{{ track2.err }}</p>
    </div>

    <div class="shop-body">
      <section class="shop-main">
        <div class="shop-tabs">
          <button :class="{ 'sh-on': tab === 'commitments' }" @click="tab = 'commitments'">Thẻ cam kết</button>
          <button :class="{ 'sh-on': tab === 'vouchers' }" @click="tab = 'vouchers'">Voucher</button>
          <span class="sh-sp" />
          <label>Thanh toán
            <select v-model="pay.bankCode"><option value="">VNPay tự chọn</option><option>VNPAYQR</option><option>VNBANK</option><option>INTCARD</option></select></label>
          <label>Ngôn ngữ <select v-model="pay.locale"><option>vn</option><option>en</option></select></label>
        </div>
        <div class="shop-filter">
          <template v-if="tab === 'commitments'">
            <input v-model="filter.minPrice" placeholder="giá từ (VND)" /><input v-model="filter.maxPrice" placeholder="đến (VND)" />
          </template>
          <input v-else v-model="filter.q" placeholder="tìm theo tên / người bán" />
          <button :disabled="!buyer.accessToken || loading" @click="loadList(tab)">Tải danh sách</button>
        </div>
        <p v-if="lists[tab].loaded && !lists[tab].items.length" class="shop-muted">API trả danh sách rỗng.</p>
        <div class="sh-grid">
          <article v-for="it in lists[tab].items" :key="it.id" class="sh-card">
            <div class="sh-t">{{ titleOf(it) }}</div>
            <div class="shop-muted">{{ sellerOf(it) }} · #{{ it.id }}</div>
            <div v-if="tab === 'commitments'" class="shop-muted">
              {{ it.commitment?.productType }}<template v-if="it.commitment?.maxUsages"> · {{ it.commitment.maxUsages }} lượt</template>
              <template v-if="it.availability"> · còn {{ it.availability.remainingQuantity ?? '∞' }}</template>
              <template v-if="it.affiliateShareBps"> · affiliate {{ it.affiliateShareBps / 100 }}%</template>
            </div>
            <div v-else class="shop-muted">
              {{ it.voucherType }} <template v-if="it.faceValue">· mệnh giá {{ money(it.faceValue) }}</template> · còn {{ it.remainingSupply }}
              <template v-if="it.affiliateShareBps"> · affiliate {{ it.affiliateShareBps / 100 }}%</template>
            </div>
            <div class="sh-price">{{ money(priceOf(it)) }}</div>
            <div class="sh-row">
              <input type="number" min="1" max="99" v-model="qty[`${tab}:${it.id}`]" placeholder="SL" class="sh-q" />
              <button :disabled="loading" @click="addToCart(tab, it)">Thêm giỏ</button>
              <button class="sh-buy" :disabled="loading" @click="buyNow(tab, it)">Mua ngay</button>
            </div>
          </article>
        </div>
        <button v-if="lists[tab].hasMore" :disabled="loading" @click="loadList(tab, true)">Xem thêm</button>
      </section>

      <aside class="shop-side">
        <h4>Giỏ hàng</h4>
        <p v-if="!cart?.items?.length" class="shop-muted">Giỏ trống.</p>
        <div v-for="ci in cart?.items || []" :key="ci.id" class="sh-ci">
          <label><input type="checkbox" v-model="picked[ci.id]" /> {{ ci.product?.title || ci.product?.name || ci.productType }} #{{ ci.productId }}</label>
          <div class="sh-row">
            <button @click="setQty(ci, Math.max(1, ci.quantity - 1))">−</button> {{ ci.quantity }} <button @click="setQty(ci, Math.min(99, ci.quantity + 1))">+</button>
            <button @click="removeItem(ci)">Xóa</button>
            <span v-if="!ci.available" class="shop-err">không khả dụng</span>
          </div>
        </div>
        <div v-if="preview" class="sh-sum">
          Tổng {{ money(preview.totalAmountVnd) }} <span class="shop-muted">(voucher {{ money(preview.voucherAmountVnd) }})</span>
          <div :class="preview.checkoutEligible ? 'sh-ok' : 'shop-err'">{{ preview.checkoutEligible ? 'Đủ điều kiện thanh toán' : `Bị chặn: ${preview.checkoutBlockedReason}` }}</div>
        </div>
        <button class="sh-buy" :disabled="loading || !cart?.items?.length" @click="checkout">Thanh toán {{ pickedIds.length ? `${pickedIds.length} món đã chọn` : 'cả giỏ' }}</button>
        <h4>DTO &amp; response từng API</h4>
        <details v-for="(c, i) in calls" :key="i" :open="i === 0" class="sh-call">
          <summary><span :class="['sh-st', String(c.status).startsWith('2') ? 'sh-ok' : 'sh-bad']">{{ c.status ?? '…' }}</span> <b>{{ c.method }}</b> {{ c.path }} <span class="shop-muted">{{ c.at }}</span></summary>
          <div v-if="c.body || c.query">
            <div class="sh-lab">DTO gửi đi</div><pre>{{ json(c.body ?? c.query) }}</pre>
            <div v-if="Object.keys(c.typed).length" class="sh-lab">Do người dùng nhập/chọn: <code>{{ json(c.typed) }}</code></div>
            <div v-if="Object.keys(c.auto).length" class="sh-lab">Trang tự điền: <code>{{ json(c.auto) }}</code></div>
          </div>
          <div class="sh-lab">Response</div><pre>{{ json(c.response) }}</pre>
        </details>
      </aside>
    </div>
  </div>
</template>

<style>
.shop { position: fixed; inset: 0; z-index: 9500; background: #f6fdf8; color: #14301f; overflow: auto; font: 14px/1.45 -apple-system, 'Segoe UI', sans-serif; }
.shop * { box-sizing: border-box; }
.shop button { all: unset; box-sizing: border-box; cursor: pointer; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: 600; }
.shop button:hover:not(:disabled) { background: #f0fdf4; border-color: #16a34a; }
.shop button:disabled { opacity: .45; cursor: not-allowed; }
.shop button.sh-buy { background: #16a34a; color: #fff; border-color: #16a34a; font-weight: 700; box-shadow: 0 2px 8px rgba(22,163,74,0.3); }
.shop button.sh-buy:hover:not(:disabled) { background: #15803d; }
.shop button.sh-on { background: #16a34a; color: #fff; border-color: #16a34a; }
.shop input, .shop select { width: auto; padding: 6px 10px; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; font-size: 13px; }
.shop input:focus, .shop select:focus { border-color: #16a34a; outline: none; box-shadow: 0 0 0 2px rgba(22,163,74,0.3); }
.shop label { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 500; color: #14532d; }
.shop-head { color:#fff; background:#14532d !important; display: flex; gap: 12px; align-items: center; padding: 14px 20px; background: #ffffff; color: #14301f; position: sticky; top: 0; z-index: 2; border-bottom: 1px solid #bbf7d0; }
.shop-head b { font-size: 16px; }
.shop-head .shop-muted { color: #bbf7d0; }
.shop-head b, .shop-head .sh-ok { color: #fff; }
.sh-sp { flex: 1; }
.shop-muted { color: #5f7a69; font-size: 12px; }
.sh-ok { color: #15803d; font-weight: 600; }
.shop-head .sh-ok { color: #15803d; }
.shop-warn { background: #fffbeb; color: #92400e; border-bottom: 1px solid #fde68a; padding: 10px 20px; margin: 0; font-size: 13px; }
.shop-err { color: #b91c1c; background: #fef2f2; border-bottom: 1px solid #fecaca; padding: 8px 20px; margin: 0; font-size: 13px; }
.shop-order { background: #f0fdf4; border-bottom: 1px solid #bbf7d0; padding: 12px 20px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.shop-order .sh-pay { background: #16a34a; color: #fff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 700; box-shadow: 0 2px 8px rgba(22,163,74,0.3); }
.shop-order .sh-pay:hover { background: #15803d; }
.shop-body { display: grid; grid-template-columns: 1fr 420px; gap: 20px; padding: 20px; align-items: start; }
.shop-tabs, .shop-filter { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.sh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-bottom: 14px; }
.sh-card { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 4px 16px rgba(22,101,52,0.10); }
.sh-card .sh-t { font-weight: 700; color: #14301f; font-size: 14px; }
.sh-card .sh-price { font-size: 18px; font-weight: 800; color: #166534; margin: 4px 0; }
.sh-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sh-q { width: 60px !important; }
.shop-side { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; position: sticky; top: 68px; max-height: calc(100vh - 88px); overflow: auto; box-shadow: 0 4px 16px rgba(22,101,52,0.10); }
.shop-side h4 { margin: 12px 0 8px; color: #14301f; font-size: 14px; }
.sh-ci { border-bottom: 1px solid #d9f2e1; padding: 8px 0; }
.sh-sum { margin: 10px 0; font-weight: 600; color: #14301f; }
.sh-call { border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 10px; margin: 8px 0; font-size: 12px; background: #f7fdf9; }
.sh-call summary { cursor: pointer; color: #14301f; font-weight: 600; }
.sh-call pre { background: #f0fdf4; color: #166534; padding: 10px; border-radius: 8px; overflow: auto; max-height: 220px; font-size: 11.5px; margin: 6px 0; border: 1px solid #d9f2e1; }
.sh-lab { font-size: 11px; color: #5f7a69; margin-top: 6px; font-weight: 600; text-transform: uppercase; }
.sh-st { padding: 2px 6px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.sh-st.sh-ok { background: #dcfce7; color: #15803d; }
.sh-st.sh-bad { background: #fee2e2; color: #b91c1c; }
@media (max-width: 1000px) { .shop-body { grid-template-columns: 1fr; } .shop-side { position: static; max-height: none; } }
.sh-info { background: #ffffff; border-bottom: 1px solid #bbf7d0; padding: 14px 20px; }
.sh-ih { display: flex; align-items: center; gap: 10px; }
.sh-ig { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; margin-top: 10px; }
.sh-ib { border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; background: #f7fdf9; min-width: 0; }
.sh-it { font-weight: 700; color: #14301f; margin-bottom: 6px; }
.sh-it code { font-weight: 400; color: #166534; font-size: 11px; margin: 0 4px; }
.sh-kv > div { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid #e6f7ec; padding: 4px 0; font-size: 12.5px; }
.sh-kv span { color: #5f7a69; }
.sh-kv b { color: #14301f; word-break: break-all; text-align: right; }
.sh-tw { overflow: auto; max-height: 220px; border: 1px solid #d9f2e1; border-radius: 8px; }
.sh-tb { border-collapse: collapse; font-size: 11.5px; width: 100%; }
.sh-tb th, .sh-tb td { border: 1px solid #d9f2e1; padding: 4px 8px; color: #14301f; text-align: left; }
.sh-tb th { background: #ffffff; color: #5f7a69; font-weight: 700; text-transform: uppercase; font-size: 10px; }
.sh-steps { width: 100%; list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
.sh-steps li { background: #f7fdf9; border: 1px solid #bbf7d0; border-left: 5px solid #86efac; border-radius: 8px; padding: 8px 12px; display: flex; flex-direction: column; font-size: 12px; }
.sh-steps li span { color: #5f7a69; word-break: break-word; }
.sh-steps li.sh-done { border-left-color: #10b981; background: #f0fdf4; }
.sh-steps li.sh-fail { border-left-color: #ef4444; background: #fef2f2; }
.fd-h { white-space: normal !important; min-width: 150px; max-width: 250px; vertical-align: top; text-transform: none !important; }
.fd-h b { display: block; } .fd-d { display: block; font-weight: 400; color: #4b6b57; font-size: 11px; line-height: 1.35; margin-top: 2px; text-transform: none; letter-spacing: 0; }
</style>
