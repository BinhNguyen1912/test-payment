<script setup>
// FLOW 1 - Khách hàng mở mã đổi voucher: authorization -> nhập PIN Smart OTP -> token 8 ký tự (QR) + đếm ngược 120s.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import qrcode from 'qrcode-generator';
import {
  createVoucherRedemptionToken,
  issueSmartOtpChallenge,
  issueSmartOtpCode,
  listMyVouchers,
  requestVoucherRedemptionAuthorization,
  sessions,
  signIn,
} from '../api.js';
import { signWithDeviceKey } from '../crypto.js';

const buyer = sessions.buyer;
// Khoá thiết bị Smart OTP do panel Merchant đăng ký (localStorage, cùng origin).
const DEVICE_KEY = 'merchant_studio_smartotp_v1';
const readDevice = () => {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}'); } catch { return {}; }
};

const wallet = ref([]);
const selected = ref(null);
const step = ref('list'); // list | pin | qr
const busy = ref(false);
const err = ref('');
const pin = ref('');
const requestId = ref('');
const redeem = reactive({ token: '', expiresAt: '' });
const now = ref(Date.now());
let timer = null;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 250); });
onBeforeUnmount(() => clearInterval(timer));

const secondsLeft = computed(() => (redeem.expiresAt ? Math.max(0, Math.ceil((Date.parse(redeem.expiresAt) - now.value) / 1000)) : 0));
const expired = computed(() => step.value === 'qr' && secondsLeft.value <= 0);
const qrSvg = computed(() => {
  if (!redeem.token) return '';
  const qr = qrcode(0, 'M');
  qr.addData(redeem.token);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
});
const money = (v) => Number(v ?? 0).toLocaleString('vi-VN');
const voucherName = (v) => v.productName || v.title || v.name || `Voucher #${v.id}`;

function explain(e) {
  const map = {
    NETWORK: 'Không kết nối được máy chủ.',
    VALIDATION_FAILED: 'Dữ liệu gửi lên không hợp lệ.',
  };
  return `${e.code ? e.code + ': ' : ''}${map[e.code] || e.message || e}`;
}
async function guard(fn) {
  err.value = '';
  busy.value = true;
  try { return await fn(); } catch (e) { err.value = explain(e); } finally { busy.value = false; }
}

const login = () => guard(async () => { await signIn(buyer); await loadWallet(); });
const loadWallet = () => guard(async () => {
  const res = await listMyVouchers(buyer, { status: 'ACTIVE', limit: 50 });
  wallet.value = res.data?.items || res.data || [];
});

// 1) Bấm "Dùng ngay": xin quyền Smart OTP, rồi mở bottom sheet nhập PIN.
function useNow(v) {
  return guard(async () => {
    const device = readDevice();
    if (!device.privateKeyBase64 || !device.deviceId) {
      throw new Error('Trình duyệt này chưa có khoá thiết bị Smart OTP. Mở 🏪 Merchant > Redeem > "Chuẩn bị Smart OTP" (hoặc "Khôi phục thiết bị") trước.');
    }
    selected.value = v;
    const auth = await requestVoucherRedemptionAuthorization(buyer, v.publicId);
    requestId.value = String(auth.data.requestId);
    pin.value = device.pin || '';
    step.value = 'pin';
  });
}

// 2) Nhập PIN: challenge -> ký bằng khoá thiết bị -> cấp mã 6 số -> 3) lấy token QR (120s).
const submitPin = () => guard(async () => {
  if (!/^\d{6}$/.test(pin.value)) throw new Error('PIN Smart OTP gồm 6 chữ số.');
  const device = readDevice();
  const challenge = await issueSmartOtpChallenge(buyer, requestId.value, device.deviceId);
  const signature = await signWithDeviceKey(device.privateKeyBase64, challenge.data.canonical);
  const issued = await issueSmartOtpCode(buyer, requestId.value, {
    challengeId: challenge.data.challengeId,
    pin: pin.value,
    signature,
  });
  // Body thật của backend là SmartOtpProofDto { requestId, code }, không phải chuỗi "123456".
  const token = await createVoucherRedemptionToken(buyer, selected.value.publicId, {
    requestId: requestId.value,
    code: issued.data.smartOtp,
  });
  redeem.token = token.data.token;
  redeem.expiresAt = token.data.expiresAt;
  pin.value = '';
  step.value = 'qr';
});

// Hết 120s: làm mờ QR, "Làm mới mã" chạy lại từ bước xin quyền.
const refresh = () => { const v = selected.value; redeem.token = ''; step.value = 'list'; return useNow(v); };
const back = () => { step.value = 'list'; redeem.token = ''; err.value = ''; loadWallet(); };
</script>

<template>
  <div class="rc">
    <div class="rc-bar">
      <b>Khách hàng ({{ buyer.identifier || 'chưa có tài khoản' }})</b>
      <button v-if="!buyer.accessToken" :disabled="!buyer.identifier || busy" @click="login">Đăng nhập khách hàng</button>
      <template v-else>
        <span class="rc-ok">đã đăng nhập</span>
        <button :disabled="busy" @click="loadWallet">Tải ví voucher</button>
      </template>
    </div>
    <p v-if="err" class="rc-err">{{ err }}</p>

    <!-- Danh sách voucher của tôi -->
    <div v-if="step === 'list'">
      <p v-if="!wallet.length" class="rc-mut">Ví trống. Voucher mua xong (trạng thái ACTIVE) mới hiện ở đây.</p>
      <div class="rc-grid">
        <div v-for="v in wallet" :key="v.id" class="rc-card">
          <div class="rc-name">{{ voucherName(v) }}</div>
          <div class="rc-mut">#{{ v.id }} · mệnh giá {{ money(v.faceValue ?? v.amount) }} ₫ · {{ v.status }}</div>
          <button class="rc-go" :disabled="busy" @click="useNow(v)">Dùng ngay</button>
        </div>
      </div>
    </div>

    <!-- Bottom sheet nhập PIN Smart OTP -->
    <div v-if="step === 'pin'" class="rc-sheet">
      <h3>Xác thực Smart OTP</h3>
      <p class="rc-mut">{{ voucherName(selected) }} · yêu cầu #{{ requestId }}</p>
      <input v-model="pin" class="rc-pin" inputmode="numeric" maxlength="6" placeholder="PIN 6 số" type="password" @keyup.enter="submitPin" />
      <div class="rc-row">
        <button :disabled="busy" @click="back">Hủy</button>
        <button class="rc-go" :disabled="busy || pin.length !== 6" @click="submitPin">{{ busy ? 'Đang xử lý…' : 'Lấy mã đổi voucher' }}</button>
      </div>
    </div>

    <!-- Mã QR + token + đếm ngược -->
    <div v-if="step === 'qr'" class="rc-qrbox">
      <h3>{{ voucherName(selected) }}</h3>
      <div class="rc-qrwrap">
        <div class="rc-qr" :class="{ 'rc-dim': expired }" v-html="qrSvg" />
        <div v-if="expired" class="rc-over">Mã đã hết hạn</div>
      </div>
      <div class="rc-token" :class="{ 'rc-dim': expired }">{{ redeem.token }}</div>
      <div class="rc-count" :class="{ 'rc-warn': secondsLeft <= 20 }">
        <template v-if="!expired">Còn <b>{{ secondsLeft }}s</b></template>
        <template v-else>Đưa mã mới cho thu ngân</template>
      </div>
      <div class="rc-row">
        <button :disabled="busy" @click="back">Đóng</button>
        <button v-if="expired" class="rc-go" :disabled="busy" @click="refresh">Làm mới mã</button>
      </div>
      <p class="rc-mut">Thu ngân quét QR hoặc nhập 8 ký tự ở màn hình Thu ngân.</p>
    </div>
  </div>
</template>

<style scoped>
.rc { display: flex; flex-direction: column; gap: 12px; }
.rc-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.rc-ok { color: #16a34a; font-weight: 600; font-size: 12.5px; }
.rc-mut { color: #5f7a69; font-size: 12px; }
.rc-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; font-size: 12.5px; }
.rc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.rc-card { border: 1px solid #bbf7d0; background: #fff; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.rc-name { font-weight: 700; }
button { cursor: pointer; background: #fff; color: #14301f; border: 1px solid #86efac; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; }
button:disabled { opacity: .5; cursor: not-allowed; }
button.rc-go { background: #16a34a; color: #fff; border-color: #16a34a; }
.rc-sheet, .rc-qrbox { max-width: 420px; margin: 0 auto; width: 100%; border: 1px solid #bbf7d0; background: #fff; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; align-items: center; box-shadow: 0 12px 36px rgba(22,101,52,.15); }
.rc-pin { width: 180px; text-align: center; font-size: 22px; letter-spacing: 8px; padding: 8px; border: 1px solid #86efac; border-radius: 8px; }
.rc-row { display: flex; gap: 10px; }
.rc-qrwrap { position: relative; width: 240px; height: 240px; }
.rc-qr { width: 100%; height: 100%; }
.rc-qr :deep(svg) { width: 100%; height: 100%; }
.rc-dim { filter: blur(5px); opacity: .45; transition: all .25s; }
.rc-over { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #b91c1c; font-size: 18px; filter: none; }
.rc-token { font-family: var(--font-mono, monospace); font-size: 34px; font-weight: 800; letter-spacing: 6px; }
.rc-count { font-size: 15px; }
.rc-warn { color: #b91c1c; }
</style>
