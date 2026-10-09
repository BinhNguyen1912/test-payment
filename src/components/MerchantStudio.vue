<script setup>
import { computed, reactive, ref } from 'vue';
import { redeemContract, setRedeemLegacyBody, request, sessions, signIn, uuid, getSmartOtpStatus, initSmartOtpEnrollment, confirmSmartOtpEnrollment, issueSmartOtpChallenge, issueSmartOtpCode,
  requestVoucherRedemptionAuthorization, createVoucherRedemptionToken, previewVoucherRedemption, confirmVoucherRedemption } from '../api.js';
import { generateDeviceKeyPair, signWithDeviceKey } from '../crypto.js';
import { ctx } from '../ctxStore.js';

// Merchant creates vouchers through the real API: package -> admin review -> mint -> marketplace.
const open = ref(location.hash.startsWith('#merchant'));
const m = sessions.merchant;
const adm = sessions.approver; // the admin who reviews; identifier/password are editable below (an admin with vouchers.admin.* permission)
const err = ref('');
const busy = ref(false);
const log = ref([]);
const cats = ref([]);
const myPackages = ref([]);
const detail = ref(null);
const adminPending = ref([]);

const pkg = reactive({ packageName: '', packageCode: '', description: '' });
const blank = () => ({ title: '', categoryId: '', voucherType: 'DISCOUNT_PERCENT', percentage: 20, amount: 50000, maxAmount: 30000, minOrderAmount: '', faceValue: 60000, salePrice: 45000, maxSupply: 5, affiliateShareBps: 0,
  subtitle: '', description: '', termsAndConditions: '', usageInstructions: '', validFrom: '', validUntil: '', purchaseStartsAt: '', purchaseEndsAt: '', publicCode: '' });
const products = reactive([blank()]);

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const str = (v) => (v === '' || v === null || v === undefined ? undefined : String(v));
// Exactly the DTO the page will send (CreateMerchantVoucherPackageDto). Empty optional fields are omitted.
const dto = computed(() => ({
  packageName: pkg.packageName,
  ...(str(pkg.packageCode) ? { packageCode: pkg.packageCode } : {}),
  ...(str(pkg.description) ? { description: pkg.description } : {}),
  products: products.map((p) => {
    const o = {
      categoryId: String(p.categoryId || ''), title: p.title, voucherType: p.voucherType,
      discount: p.voucherType === 'DISCOUNT_PERCENT' ? { percentage: num(p.percentage), ...(num(p.maxAmount) ? { maxAmount: num(p.maxAmount) } : {}) } : { amount: num(p.amount) },
      faceValue: num(p.faceValue), salePrice: num(p.salePrice), maxSupply: num(p.maxSupply),
    };
    ['subtitle', 'description', 'termsAndConditions', 'usageInstructions', 'publicCode'].forEach((k) => { if (str(p[k])) o[k] = p[k]; });
    ['validFrom', 'validUntil', 'purchaseStartsAt', 'purchaseEndsAt'].forEach((k) => { if (str(p[k])) o[k] = new Date(p[k]).toISOString(); });
    if (redeemContract.legacyBody && num(p.minOrderAmount)) o.applicability = { minOrderAmount: num(p.minOrderAmount) };
    if (num(p.affiliateShareBps)) o.affiliateShareBps = num(p.affiliateShareBps);
    return o;
  }),
}));

async function call(session, label, method, path, opts = {}) {
  const rec = { label, method, path, body: opts.body, status: null, response: null, at: new Date().toLocaleTimeString() };
  log.value.unshift(rec); if (log.value.length > 25) log.value.pop();
  try { const r = await request(session, method, path, opts); rec.status = r.status ?? 200; rec.response = { data: r.data, meta: r.meta }; return r; }
  catch (e) { rec.status = e.status || 'ERR'; rec.response = { code: e.code, message: e.message, details: e.details }; throw e; }
}
async function guard(fn) { err.value = ''; busy.value = true; try { return await fn(); } catch (e) { err.value = `${e.code || ''} ${e.message || e}`.trim(); } finally { busy.value = false; } }

const loginMerchant = () => guard(async () => { await signIn(m); await loadCats(); await loadMine(); });
const loginAdmin = () => guard(async () => { await signIn(adm); await loadPending(); });

// Voucher categories have no list endpoint of their own: they are read from published products (categoryId + categoryName).
async function loadCats() {
  const seen = new Map(); let cursor;
  for (let i = 0; i < 5; i += 1) {
    const r = await call(m, 'Lấy danh mục từ sản phẩm đang bán', 'GET', '/mobile/marketplace/vouchers', { query: { limit: 50, cursor } });
    (r.data || []).forEach((v) => { if (v.categoryId) seen.set(String(v.categoryId), v.categoryName || `#${v.categoryId}`); });
    cursor = r.meta?.nextCursor; if (!r.meta?.hasMore) break;
  }
  cats.value = [...seen].map(([id, name]) => ({ id, name }));
  if (cats.value.length) products.forEach((p) => { if (!p.categoryId) p.categoryId = cats.value[0].id; });
}
const loadMine = () => guard(async () => { myPackages.value = (await call(m, 'Gói voucher của tôi', 'GET', '/mobile/vouchers/merchant/voucher-packages', { query: { limit: 20 } })).data || []; });
const openPkg = (p) => guard(async () => { detail.value = (await call(m, `Chi tiết gói #${p.id}`, 'GET', `/mobile/vouchers/merchant/voucher-packages/${p.id}`)).data; });
const create = () => guard(async () => {
  const r = await call(m, 'Tạo gói voucher', 'POST', '/mobile/vouchers/merchant/voucher-packages', { body: dto.value });
  detail.value = r.data; ctx.productId = r.data?.products?.[0]?.id || ctx.productId;
  await loadMine();
});
const loadPending = () => guard(async () => { adminPending.value = (await call(adm, 'Admin: danh sách gói', 'GET', '/web/admin/vouchers/packages', { query: { limit: 20 } })).data || []; });
const approve = (p) => guard(async () => { await call(adm, `Admin duyệt gói #${p.id}`, 'POST', `/web/admin/vouchers/packages/${p.id}/approve`); await loadPending(); await loadMine(); });
const reject = (p) => guard(async () => { await call(adm, `Admin từ chối gói #${p.id}`, 'POST', `/web/admin/vouchers/packages/${p.id}/reject`, { body: { reason: rejectReason.value || 'Rejected by test admin' } }); await loadPending(); await loadMine(); });
const rejectReason = ref('');

// ---------- Redeem: buyer proves ownership with Smart OTP -> 8-char token (120s) -> merchant previews + confirms ----------
const b = sessions.buyer;
const SK = 'merchant_studio_smartotp_v1';
const dev = reactive({ deviceId: '', publicKey: '', privateKeyBase64: '', pin: '', attestation: '', ...JSON.parse(localStorage.getItem(SK) || '{}') });
const saveDev = () => localStorage.setItem(SK, JSON.stringify({ ...dev }));
const wallet = ref([]);
const rd = reactive({ orderAmount: '', itemIds: '', merchantOrderRef: '', providerRef: '' });
const sel = ref(null);
const otpStatus = ref(null);
const tok = reactive({ token: '', expiresAt: '' });
const prev = ref(null);
const done = ref(null);
const tokenIn = ref('');
const merchantEarn = ref(null);

const loginBuyer = () => guard(async () => { await signIn(b); await loadWallet(); });
const loadWallet = () => guard(async () => {
  const mine = (await call(b, 'Ví voucher của người mua', 'GET', '/mobile/vouchers/my', { query: { status: 'ACTIVE', limit: 50 } })).data || [];
  wallet.value = mine;
});
const pickVoucher = (v) => { sel.value = v; tok.token = ''; prev.value = null; done.value = null; rd.orderAmount = String(v.faceValue ?? v.amount ?? ''); };
const refreshOtp = () => guard(async () => { otpStatus.value = (await call(b, 'Trạng thái Smart OTP', 'GET', '/mobile/smart-otp/status')).data; });
const enrollOtp = () => guard(async () => {
  const st = (await call(b, 'Trạng thái Smart OTP', 'GET', '/mobile/smart-otp/status')).data || {};
  otpStatus.value = st;
  if (st.deviceEnrolled) {
    if (st.device?.deviceId !== dev.deviceId || !dev.privateKeyBase64) throw new Error(`Tài khoản này đã có thiết bị Smart OTP ${st.device?.deviceId || ''} nhưng trình duyệt không giữ khoá. Dùng khung "Khôi phục thiết bị" bên dưới (OTP gửi qua email/Zalo) hoặc dùng đúng trình duyệt đã đăng ký.`);
    return;
  }
  await enrollNew({ deviceId: `studio-${uuid()}` });
});

// Đăng ký thiết bị mới. recoveryToken chỉ cần khi đăng ký lại sau khi đã thu hồi thiết bị cũ.
async function enrollNew({ deviceId, recoveryToken }) {
  const pair = await generateDeviceKeyPair();
  dev.publicKey = pair.publicKey; dev.privateKeyBase64 = pair.privateKeyBase64; dev.deviceId = deviceId; dev.attestation = `dev-attestation-${uuid()}`.padEnd(40, 'x');
  if (!/^\d{6}$/.test(dev.pin)) dev.pin = String(Math.floor(100000 + Math.random() * 900000));
  const init = await call(b, 'Smart OTP: bắt đầu đăng ký thiết bị', 'POST', '/mobile/smart-otp/enroll/init', { body: {
    password: b.password, deviceId: dev.deviceId, platform: 'ios', publicKey: dev.publicKey, keyAttestation: dev.attestation, hardwareInfo: navigator.userAgent,
    ...(recoveryToken ? { recoveryToken } : {}),
    integrity: { isRooted: false, isEmulator: false, isHooked: false, isDebuggerAttached: false, isAppTampered: false } } });
  const signature = await signWithDeviceKey(dev.privateKeyBase64, init.data.challenge);
  await call(b, 'Smart OTP: xác nhận đăng ký (PIN)', 'POST', '/mobile/smart-otp/enroll/confirm', { body: { enrollmentId: init.data.enrollmentId, signature, pin: dev.pin } });
  saveDev(); await refreshOtp();
}

// Khôi phục khi mất khoá: REQUEST_OTP (gửi OTP) -> REVOKE (thu hồi + nhận recoveryToken) -> đăng ký thiết bị mới.
const rec = reactive({ otp: '', sent: false, channel: '' });
const recoverRequestOtp = () => guard(async () => {
  const r = await call(b, 'Smart OTP: xin OTP khôi phục', 'POST', '/mobile/smart-otp/revoke', { body: { action: 'REQUEST_OTP', password: b.password } });
  rec.sent = true; rec.channel = r.data?.channel || '';
});
const DEV_OTP = '000000'; // bypass cố định của backend dev/staging; KHÔNG dùng cho production
const isDev = import.meta.env.DEV;
const recoverAuto = () => guard(async () => {
  // Bước 1: REQUEST_OTP, phải otpSent === true mới đi tiếp.
  const r1 = await call(b, 'Smart OTP: xin OTP khôi phục (bước 1/2)', 'POST', '/mobile/smart-otp/revoke', { body: { action: 'REQUEST_OTP', password: b.password } });
  if (!r1.data?.otpSent) throw new Error('Backend không xác nhận đã gửi OTP (otpSent != true).');
  rec.sent = true; rec.channel = r1.data?.channel || '';
  // Bước 2: REVOKE với OTP dev, nhận recoveryToken rồi đăng ký thiết bị mới.
  const newDeviceId = `studio-${uuid()}`;
  const r2 = await call(b, 'Smart OTP: thu hồi thiết bị cũ (bước 2/2)', 'POST', '/mobile/smart-otp/revoke', { body: { action: 'REVOKE', password: b.password, otp: DEV_OTP, newDeviceId } });
  if (!r2.data?.recoveryToken) throw new Error('Backend không trả recoveryToken.');
  dev.pin = '';
  await enrollNew({ deviceId: newDeviceId, recoveryToken: r2.data.recoveryToken });
  rec.otp = ''; rec.sent = false;
});
const recoverRevoke = () => guard(async () => {
  if (!/^\d{6}$/.test(rec.otp)) throw new Error('OTP phải gồm 6 chữ số.');
  const newDeviceId = `studio-${uuid()}`;
  const r = await call(b, 'Smart OTP: thu hồi thiết bị cũ', 'POST', '/mobile/smart-otp/revoke', { body: { action: 'REVOKE', password: b.password, otp: rec.otp, newDeviceId } });
  if (!r.data?.recoveryToken) throw new Error('Backend không trả recoveryToken.');
  dev.pin = '';
  await enrollNew({ deviceId: newDeviceId, recoveryToken: r.data.recoveryToken });
  rec.otp = ''; rec.sent = false;
});
const makeToken = () => guard(async () => {
  if (!sel.value) throw new Error('Chọn một voucher trong ví trước.');
  const auth = await call(b, 'Voucher: xin phép dùng (Smart OTP request)', 'POST', `/mobile/vouchers/my/${sel.value.publicId}/redemption-authorization`);
  const requestId = String(auth.data.requestId);
  const ch = await request(b, 'POST', `/mobile/smart-otp/requests/${requestId}/issue`, { headers: { 'Device-Id': dev.deviceId }, body: { action: 'CHALLENGE' } });
  const signature = await signWithDeviceKey(dev.privateKeyBase64, ch.data.canonical);
  const code = await call(b, 'Smart OTP: cấp mã 6 số (ký + PIN)', 'POST', `/mobile/smart-otp/requests/${requestId}/issue`, { body: { action: 'ISSUE', challengeId: ch.data.challengeId, pin: dev.pin, signature } });
  const t = await call(b, 'Voucher: tạo token redeem (120s)', 'POST', `/mobile/vouchers/my/${sel.value.publicId}/redemption-token`, { body: { smartOtp: { requestId, code: code.data.smartOtp } } });
  tok.token = t.data.token; tok.expiresAt = t.data.expiresAt; tokenIn.value = t.data.token;
});
const previewTok = () => guard(async () => {
  prev.value = (await call(m, 'Merchant: xem trước voucher', 'POST', '/mobile/vouchers/merchant/redemptions/preview', { body: { token: tokenIn.value.trim() } })).data;
  if (!rd.orderAmount) rd.orderAmount = String(Math.round(Number(prev.value.amount)));
});
const confirmRd = () => guard(async () => {
  // Contract cũ: body { orderAmount, itemIds?, provider, providerRef?, merchantOrderRef? }. Contract TRUST-927: không body.
  const body = redeemContract.legacyBody
    ? { orderAmount: rd.orderAmount, ...(rd.itemIds.trim() ? { itemIds: rd.itemIds.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
      provider: 'MERCHANT_STUDIO', ...(rd.providerRef ? { providerRef: rd.providerRef } : {}), ...(rd.merchantOrderRef ? { merchantOrderRef: rd.merchantOrderRef } : {}) }
    : undefined;
  done.value = (await call(m, 'Merchant: xác nhận redeem', 'POST', `/mobile/vouchers/merchant/redemptions/${prev.value.challengeId}/confirm`, { ...(body ? { body } : {}), headers: { 'Idempotency-Key': uuid() } })).data;
  ctx.voucherId = done.value.voucherId;
  await loadWallet(); await loadEarn();
});
const loadEarn = () => guard(async () => { merchantEarn.value = (await call(m, 'Merchant: thu nhập (earnings)', 'GET', '/mobile/merchant/finance/earnings/me', { query: { limit: 10 } })).data; });
const left = ref(0);
setInterval(() => { left.value = tok.expiresAt ? Math.max(0, Math.round((new Date(tok.expiresAt) - Date.now()) / 1000)) : 0; }, 1000);

const addProduct = () => { const b = blank(); b.categoryId = cats.value[0]?.id || ''; products.push(b); };
const money = (v) => Number(v ?? 0).toLocaleString('vi-VN');
const mint = (p) => p?.metadata?._mint;
const json = (v) => JSON.stringify(v, null, 2);
const margin = (p) => Number(p.faceValue) - Number(p.salePrice);
</script>

<template>
  <button class="ms-fab" @click="open = !open">🏪 Merchant tạo voucher</button>
  <div v-if="open" class="ms">
    <header class="ms-head">
      <b>Merchant tạo voucher</b>
      <span class="ms-mut">tài khoản: {{ m.identifier || '(chưa có)' }}<template v-if="m.activeAccountUserId"> · sub #{{ m.activeAccountUserId }}</template></span>
      <span class="ms-sp" />
      <button v-if="!m.accessToken" :disabled="!m.identifier || busy" @click="loginMerchant">Đăng nhập merchant</button><span v-else class="ms-okc">đã đăng nhập</span>
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="err" class="ms-err">{{ err }}</p>

    <div class="ms-flow">
      <span class="ms-step">1. Merchant tạo gói (DRAFT · PENDING)</span><span>→</span><span class="ms-step">2. Admin duyệt</span><span>→</span><span class="ms-step">3. Hệ thống mint voucher (queue)</span><span>→</span><span class="ms-step">4. Sản phẩm lên marketplace (Cửa hàng)</span>
    </div>

    <div class="ms-grid">
      <section class="ms-card">
        <h3>1. Soạn gói voucher <code>POST /mobile/vouchers/merchant/voucher-packages</code></h3>
        <div class="ms-row"><label>Tên gói* <input v-model="pkg.packageName" class="ms-w" placeholder="vd Voucher tháng 10" /></label>
          <label>Mã gói <input v-model="pkg.packageCode" placeholder="A-Z 0-9 _ -" /></label></div>
        <label>Mô tả <input v-model="pkg.description" class="ms-w2" /></label>
        <div v-for="(p, i) in products" :key="i" class="ms-prod">
          <div class="ms-ph"><b>Sản phẩm {{ i + 1 }}</b> <button v-if="products.length > 1" @click="products.splice(i, 1)">Xóa</button></div>
          <div class="ms-row">
            <label>Tên*<input v-model="p.title" class="ms-w" /></label>
            <label>Danh mục*
              <select v-model="p.categoryId"><option value="">— chọn (lấy từ API) —</option><option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }} · {{ c.id }}</option></select>
              <input v-model="p.categoryId" class="ms-s" placeholder="hoặc id" /></label>
            <label>Loại*<select v-model="p.voucherType"><option>DISCOUNT_PERCENT</option><option>DISCOUNT_AMOUNT</option></select></label>
          </div>
          <div class="ms-row">
            <template v-if="p.voucherType === 'DISCOUNT_PERCENT'"><label>Giảm %*<input v-model="p.percentage" type="number" class="ms-s" /></label><label>Tối đa (₫)<input v-model="p.maxAmount" type="number" /></label></template>
            <label v-else>Giảm (₫)*<input v-model="p.amount" type="number" /></label>
            <label v-if="redeemContract.legacyBody">Đơn tối thiểu (₫)<input v-model="p.minOrderAmount" type="number" /></label>
            <label>Mệnh giá*<input v-model="p.faceValue" type="number" /></label>
            <label>Giá bán*<input v-model="p.salePrice" type="number" /></label>
            <label>Số lượng*<input v-model="p.maxSupply" type="number" class="ms-s" /></label>
            <label>Affiliate (bps)<input v-model="p.affiliateShareBps" type="number" class="ms-s" /></label>
          </div>
          <p class="ms-mut">Giá bán {{ money(p.salePrice) }}₫ / mệnh giá {{ money(p.faceValue) }}₫ (chênh {{ money(margin(p)) }}₫) · affiliate {{ Number(p.affiliateShareBps || 0) / 100 }}% của giá bán = {{ money(Math.round(Number(p.salePrice) * Number(p.affiliateShareBps || 0) / 10000)) }}₫ · doanh thu tối đa {{ money(Number(p.salePrice) * Number(p.maxSupply)) }}₫</p>
          <details><summary class="ms-mut">Tuỳ chọn khác (thời hạn, điều khoản, mã công khai)</summary>
            <div class="ms-row"><label>Phụ đề<input v-model="p.subtitle" /></label><label>Mã công khai<input v-model="p.publicCode" /></label></div>
            <div class="ms-row"><label>Mở bán<input v-model="p.purchaseStartsAt" type="datetime-local" /></label><label>Đóng bán<input v-model="p.purchaseEndsAt" type="datetime-local" /></label>
              <label>Dùng từ<input v-model="p.validFrom" type="datetime-local" /></label><label>Hết hạn dùng<input v-model="p.validUntil" type="datetime-local" /></label></div>
            <label>Mô tả<input v-model="p.description" class="ms-w2" /></label><label>Điều khoản<input v-model="p.termsAndConditions" class="ms-w2" /></label><label>Hướng dẫn dùng<input v-model="p.usageInstructions" class="ms-w2" /></label>
          </details>
        </div>
        <div class="ms-row"><button @click="addProduct">+ Thêm sản phẩm</button><button class="ms-go" :disabled="!m.accessToken || busy" @click="create">Tạo gói (gọi API)</button></div>
        <details open><summary class="ms-mut">DTO sẽ gửi đi (đúng JSON body)</summary><pre>{{ json(dto) }}</pre></details>
      </section>

      <section class="ms-card">
        <h3>2. Gói của tôi <code>GET …/merchant/voucher-packages</code> <button :disabled="!m.accessToken" @click="loadMine">Làm mới</button></h3>
        <p v-if="!myPackages.length" class="ms-mut">Chưa có gói nào.</p>
        <table v-else class="ms-t"><thead><tr><th>id</th><th>tên</th><th>status</th><th>review</th><th>mint</th><th>SP</th><th>SL</th></tr></thead><tbody>
          <tr v-for="p in myPackages" :key="p.id" class="ms-pick" @click="openPkg(p)"><td>{{ p.id }}</td><td>{{ p.packageName }}</td><td>{{ p.status }}</td>
            <td><span :class="['ms-pill', p.reviewStatus === 'APPROVED' ? 'ms-g' : p.reviewStatus === 'REJECTED' ? 'ms-r' : 'ms-y']">{{ p.reviewStatus }}</span></td>
            <td>{{ mint(p)?.state }} {{ mint(p)?.mintedQuantity }}/{{ mint(p)?.requestedQuantity }}</td><td>{{ p.totalProducts }}</td><td>{{ p.totalMintedQuantity }}/{{ p.totalRequestedQuantity }}</td></tr></tbody></table>
        <div v-if="detail" class="ms-detail"><b>Gói #{{ detail.id }}</b> {{ detail.packageName }} · {{ detail.status }}/{{ detail.reviewStatus }}
          <span v-if="detail.rejectionReason" class="ms-err">lý do từ chối: {{ detail.rejectionReason }}</span>
          <div v-for="p in detail.products" :key="p.id" class="ms-mut">sản phẩm #{{ p.id }} · {{ p.title }} · {{ p.voucherType }} · bán {{ money(p.salePrice) }}₫ · {{ p.status }} · đã mint {{ p.issuedCount ?? '' }}/{{ p.maxSupply }}</div></div>

        <h3>3. Admin duyệt <code>/web/admin/vouchers/packages</code></h3>
        <p class="ms-mut">Cần admin có quyền <code>vouchers.admin.read/manage</code> (3 tài khoản payout KHÔNG có). Nhập admin dùng để duyệt sub-account:</p>
        <div class="ms-row"><label>Admin<input v-model="adm.identifier" /></label><label>Mật khẩu<input v-model="adm.password" type="password" /></label>
          <button :disabled="!adm.identifier || !adm.password || busy" @click="loginAdmin">{{ adm.accessToken ? 'Đăng nhập lại' : 'Đăng nhập admin' }}</button>
          <button :disabled="!adm.accessToken" @click="loadPending">Tải danh sách gói</button></div>
        <table v-if="adminPending.length" class="ms-t"><thead><tr><th>id</th><th>tên</th><th>merchant</th><th>review</th><th></th></tr></thead><tbody>
          <tr v-for="p in adminPending" :key="p.id"><td>{{ p.id }}</td><td>{{ p.packageName }}</td><td>{{ p.merchantUserId }}</td><td>{{ p.reviewStatus }}</td>
            <td><button v-if="p.reviewStatus === 'PENDING'" class="ms-go" @click="approve(p)">Duyệt</button> <button v-if="p.reviewStatus === 'PENDING'" @click="reject(p)">Từ chối</button></td></tr></tbody></table>
        <label v-if="adminPending.length">Lý do từ chối <input v-model="rejectReason" class="ms-w" /></label>
        <p class="ms-mut">Sau khi duyệt, hệ thống mint voucher bằng queue; bấm “Làm mới” ở bảng trên vài giây sau để thấy <code>mint</code> chuyển sang xong, rồi vào 🛒 Cửa hàng (tab Voucher) sẽ thấy sản phẩm. Theo dõi tiền: 💸 Dòng tiền.</p>
      </section>

      <section class="ms-card ms-wide">
        <h3>4. Redeem voucher <code>người mua cấp token → merchant quét/nhập → xác nhận</code></h3>
        <label class="ms-mut"><input type="checkbox" :checked="redeemContract.legacyBody" @change="setRedeemLegacyBody($event.target.checked)" /> Backend dùng contract cũ (confirm có body orderAmount…). Bỏ chọn nếu backend đã có TRUST-927.</label>
        <p class="ms-mut">Redeem là lúc <b>ghi nhận doanh thu</b>: tiền rời CUSTOMER_FUNDS_HELD chia vào MERCHANT_PAYABLE / phí sàn / thuế (journal FULFILLMENT_RECOGNIZED). Xem kết quả ở 💸 Dòng tiền.</p>
        <div class="ms-two">
          <div class="ms-box"><h4>A. Người mua <span class="ms-mut">({{ b.identifier || 'chưa có' }})</span></h4>
            <div class="ms-row"><button v-if="!b.accessToken" :disabled="!b.identifier || busy" @click="loginBuyer">Đăng nhập người mua</button><span v-else class="ms-okc2">đã đăng nhập</span>
              <button :disabled="!b.accessToken" @click="loadWallet">Tải ví voucher</button></div>
            <table v-if="wallet.length" class="ms-t"><thead><tr><th>id</th><th>voucher</th><th>mệnh giá</th><th>status</th></tr></thead><tbody>
              <tr v-for="v in wallet" :key="v.id" class="ms-pick" :class="{ 'ms-sel': sel && sel.id === v.id }" @click="pickVoucher(v)"><td>{{ v.id }}</td><td>{{ v.productName || v.title || v.productId }}</td><td>{{ money(v.faceValue ?? v.amount) }}</td><td>{{ v.status }}</td></tr></tbody></table>
            <p v-else class="ms-mut">Ví trống (voucher mua xong mới có, trạng thái ACTIVE).</p>
            <div class="ms-row"><button :disabled="!b.accessToken || busy" @click="enrollOtp">Chuẩn bị Smart OTP (đăng ký thiết bị)</button>
              <span class="ms-mut">PIN Smart OTP: <b>{{ dev.pin || '(tạo ngẫu nhiên khi đăng ký)' }}</b> · thiết bị {{ otpStatus?.deviceEnrolled ? 'đã đăng ký' : 'chưa đăng ký' }}</span></div>
            <div v-if="otpStatus?.deviceEnrolled && !dev.privateKeyBase64" class="ms-detail">
              <b>Khôi phục thiết bị</b> <span class="ms-mut">Trình duyệt này không giữ khoá của thiết bị {{ otpStatus.device?.deviceId }}. Thu hồi nó rồi đăng ký thiết bị mới (PIN mới tự sinh). Backend dev/staging: nếu kênh OTP là <b>zalo</b> thì nhập <b>000000</b> (bỏ qua gửi thật); kênh email thì phải dùng mã thật.</span>
              <div v-if="isDev" class="ms-row"><button class="ms-go" :disabled="!b.accessToken || busy" @click="recoverAuto">Thu hồi thiết bị cũ &amp; đăng ký mới (tự động, OTP dev 000000)</button>
                <span class="ms-mut">Tự gọi REQUEST_OTP rồi REVOKE. Chỉ có ở bản dev.</span></div>
              <div class="ms-row"><button :disabled="!b.accessToken || busy" @click="recoverRequestOtp">1. Gửi OTP khôi phục</button>
                <label>OTP 6 số {{ rec.channel ? '(qua ' + rec.channel + ')' : '' }}<input v-model="rec.otp" class="ms-s" maxlength="6" /></label>
                <button class="ms-go" :disabled="!b.accessToken || busy || rec.otp.length !== 6" @click="recoverRevoke">2. Thu hồi &amp; đăng ký thiết bị mới</button></div>
            </div>
            <div class="ms-row"><button class="ms-go" :disabled="!sel || !dev.privateKeyBase64 || busy" @click="makeToken">Tạo token redeem cho voucher #{{ sel?.id || '…' }}</button></div>
            <div v-if="tok.token" class="ms-token"><span>{{ tok.token }}</span><small>{{ left > 0 ? `còn ${left}s` : 'đã hết hạn — tạo lại' }}</small></div>
          </div>
          <div class="ms-box"><h4>B. Merchant <span class="ms-mut">({{ m.identifier || '' }})</span></h4>
            <div class="ms-row"><label>Token (8 ký tự)<input v-model="tokenIn" class="ms-w" placeholder="gõ tay hoặc lấy từ người mua" /></label>
              <button :disabled="!m.accessToken || !tokenIn || busy" @click="previewTok">Xem trước</button></div>
            <div v-if="prev" class="ms-detail"><b>{{ prev.productName }}</b> · {{ money(prev.amount) }} {{ prev.currency }} · chủ voucher: {{ prev.owner?.displayName || prev.owner?.id }} · challenge #{{ prev.challengeId }} · hết hạn {{ prev.expiresAt }}</div>
            <template v-if="redeemContract.legacyBody">
              <div class="ms-row"><label>Giá trị đơn tại quầy (₫)<input v-model="rd.orderAmount" type="number" /></label><label>Mã món (cách nhau dấu phẩy)<input v-model="rd.itemIds" /></label>
                <label>Mã đơn merchant<input v-model="rd.merchantOrderRef" /></label></div>
              <p class="ms-mut">Giá trị đơn dùng để kiểm tra đơn tối thiểu; món chỉ cần khi voucher giới hạn món áp dụng.</p>
            </template>
            <p v-else class="ms-mut">Contract TRUST-927: xác nhận redeem không cần body.</p>
            <div class="ms-row"><button class="ms-go" :disabled="!prev || busy" @click="confirmRd">Xác nhận redeem</button></div>
            <div v-if="done" class="ms-detail ms-ok2"><b>Redeem #{{ done.redemptionId }} {{ done.status }}</b> · voucher {{ done.voucherId }} · {{ money(done.amount) }} {{ done.currency }} · {{ done.redeemedAt }}
              <div class="ms-row"><a class="ms-link" :href="'#money&party=' + (m.activeAccountUserId || '')" target="_blank">Xem tiền của merchant →</a>
                <button :disabled="!m.accessToken" @click="loadEarn">Tải thu nhập merchant</button></div></div>
            <div v-if="merchantEarn" class="ms-detail"><b>Earnings merchant</b><pre>{{ json(merchantEarn) }}</pre></div>
          </div>
        </div>
      </section>

      <section class="ms-card ms-wide"><h3>Nhật ký API</h3>
        <details v-for="(c, i) in log" :key="i" :open="i === 0"><summary><span :class="['ms-pill', String(c.status).startsWith('2') ? 'ms-g' : 'ms-r']">{{ c.status ?? '…' }}</span> <b>{{ c.method }}</b> {{ c.path }} <span class="ms-mut">{{ c.label }} · {{ c.at }}</span></summary>
          <pre v-if="c.body">DTO: {{ json(c.body) }}</pre><pre>{{ json(c.response) }}</pre></details></section>
    </div>
  </div>
</template>
<style>
.ms { position: fixed; inset: 0; z-index: 9800; background: #f6fdf8; color: #14301f; overflow: auto; font: 13px/1.45 -apple-system, 'Segoe UI', sans-serif; }
.ms button { all: unset; box-sizing: border-box; cursor: pointer; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; padding: 5px 12px; font-size: 12.5px; font-weight: 600; }
.ms button:hover:not(:disabled) { background: #f0fdf4; border-color: #16a34a; }
.ms button:disabled { opacity: .45; cursor: not-allowed; }
.ms button.ms-go { background: #16a34a; color: #fff; border-color: #16a34a; font-weight: 700; box-shadow: 0 2px 8px rgba(22,163,74,0.3); }
.ms button.ms-go:hover:not(:disabled) { background: #15803d; }
.ms input, .ms select { width: 130px; padding: 6px 10px; background: #ffffff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; font-size: 12.5px; }
.ms input.ms-w { width: 260px; }
.ms input.ms-w2 { width: 540px; max-width: 100%; }
.ms input.ms-s { width: 80px; }
.ms input:focus, .ms select:focus { border-color: #16a34a; outline: none; box-shadow: 0 0 0 2px #86efac; }
.ms label { display: inline-flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; color: #14532d; }
.ms-head { display: flex; gap: 12px; align-items: center; padding: 12px 20px; background: #14532d; color: #fff; position: sticky; top: 0; z-index: 3; border-bottom: 1px solid #bbf7d0; }
.ms-head .ms-mut { color: #bbf7d0; }
.ms-head .ms-okc { color: #bbf7d0; font-weight: 600; }
.ms-sp { flex: 1; }
.ms-mut { color: #5f7a69; font-size: 12px; margin: 4px 0; }
.ms-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 8px 14px; margin: 8px 20px; border-radius: 6px; font-size: 12px; }
.ms-flow { display: flex; gap: 10px; align-items: center; padding: 12px 20px; background: #f7fdf9; border-bottom: 1px solid #bbf7d0; flex-wrap: wrap; }
.ms-step { background: #dcfce7; border: 1px solid #86efac; color: #166534; border-radius: 14px; padding: 3px 12px; font-size: 12px; font-weight: 500; }
.ms-grid { display: grid; grid-template-columns: minmax(520px, 1.1fr) minmax(420px, 1fr); gap: 16px; padding: 18px 20px 40px; align-items: start; }
.ms-wide { grid-column: 1 / -1; }
.ms-card { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 18px; box-shadow: 0 4px 16px rgba(22,101,52,0.10); }
.ms-card h3 { margin: 6px 0 10px; font-size: 14px; color: #14301f; }
.ms-card h3 code { font-weight: 400; font-size: 12px; color: #166534; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
.ms-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin: 8px 0; }
.ms-prod { border: 1px solid #86efac; background: #f7fdf9; border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
.ms-ph { display: flex; gap: 10px; align-items: center; }
.ms .ms-t { border-collapse: collapse; font-size: 12px; width: 100%; border: 1px solid #d9f2e1; border-radius: 8px; margin-top: 8px; }
.ms .ms-t th, .ms .ms-t td { border: 1px solid #d9f2e1; padding: 6px 10px; color: #14301f; text-align: left; }
.ms .ms-t th { background: #ffffff; color: #5f7a69; font-weight: 700; text-transform: uppercase; font-size: 11px; }
.ms-pick { cursor: pointer; }
.ms-pick:hover td { background: #dcfce7 !important; }
.ms-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #f0fdf4; color: #14532d; }
.ms-g { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.ms-y { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.ms-r { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
.ms-detail { background: #f7fdf9; border: 1px dashed #86efac; border-radius: 8px; padding: 10px 14px; margin: 10px 0; }
.ms pre { background: #f0fdf4 !important; color: #14301f !important; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; overflow: auto; max-height: 260px; font-size: 11.5px; }
@media (max-width: 1100px) { .ms-grid { grid-template-columns: 1fr; } }
.ms-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .ms-box { border: 1px solid #bbf7d0; background: #f7fdf9; border-radius: 8px; padding: 8px 12px; } .ms-box h4 { margin: 2px 0 6px; }
.ms-sel td { background: #dcfce7 !important; } .ms-okc2 { color: #15803d; font-weight: 600; } .ms-ok2 { border-color: #86efac; background: #f0fdf4; }
.ms-token { display: inline-flex; align-items: baseline; gap: 12px; background: #fff; border: 2px dashed #16a34a; border-radius: 8px; padding: 6px 16px; margin-top: 6px; } .ms-token span { font: 700 26px/1 ui-monospace, Menlo, monospace; letter-spacing: 4px; color: #14532d; }
.ms-link { color: #15803d; font-weight: 600; text-decoration: underline; } @media (max-width: 1100px) { .ms-two { grid-template-columns: 1fr; } }
</style>
