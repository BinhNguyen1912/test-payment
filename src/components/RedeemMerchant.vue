<script setup>
// FLOW 2 - Thu ngân: quét/nhập token 8 ký tự -> Preview -> nhập tiền bill -> Confirm -> biên nhận.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  confirmVoucherRedemption,
  getMerchantRedemption,
  previewVoucherRedemption,
  redeemContract,
  sessions,
  setRedeemLegacyBody,
  signIn,
  uuid,
} from '../api.js';

const m = sessions.merchant;
const tokenIn = ref('');
const busy = ref(false);
const err = ref('');
const prev = ref(null); // data của API preview
const done = ref(null); // biên nhận
const form = reactive({ orderAmount: '', merchantOrderRef: '', itemIds: '' });
// Một Idempotency-Key cho mỗi challenge: bấm lại sau khi mạng đứt sẽ dùng LẠI key này, nên không bị trừ 2 lần.
const idemKey = ref('');
const needRecovery = ref(false);
const now = ref(Date.now());
let timer = null;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 500); });
onBeforeUnmount(() => { clearInterval(timer); stopCamera(); });

const money = (v) => Number(v ?? 0).toLocaleString('vi-VN');
const legacy = computed(() => redeemContract.legacyBody);
const amount = computed(() => Number(prev.value?.amount || 0));
const minOrder = computed(() => (legacy.value ? Number(prev.value?.applicability?.minOrderAmount || 0) : 0));
const requiresItems = computed(() => legacy.value && !!prev.value?.applicability?.requiresItemIds);
const secondsLeft = computed(() => (prev.value?.expiresAt ? Math.max(0, Math.ceil((Date.parse(prev.value.expiresAt) - now.value) / 1000)) : 0));

const ERRORS = {
  VOUCHER_REDEMPTION_CHALLENGE_EXPIRED: 'Mã QR của khách đã hết 120s. Yêu cầu khách bấm "Làm mới mã".',
  VOUCHER_REDEMPTION_CHALLENGE_USED: 'Mã QR này đã được dùng để đổi trước đó.',
  VOUCHER_REDEMPTION_MIN_ORDER_NOT_MET: 'Đơn hàng chưa đạt giá trị tối thiểu của voucher.',
  VOUCHER_REDEMPTION_ORDER_AMOUNT_REQUIRED: 'Chưa nhập giá trị đơn hàng.',
  VOUCHER_REDEMPTION_ITEMS_REQUIRED: 'Voucher chỉ áp dụng cho món cụ thể, cần nhập mã món (itemIds).',
  VOUCHER_REDEMPTION_ITEM_NOT_ELIGIBLE: 'Có món không thuộc danh sách được áp dụng.',
  VOUCHER_REDEMPTION_ITEM_EXCLUDED: 'Có món bị loại trừ khỏi voucher.',
  VOUCHER_ALREADY_REDEEMED: 'Voucher này đã được sử dụng.',
  VOUCHER_REDEMPTION_VOUCHER_EXPIRED: 'Voucher đã quá hạn sử dụng.',
  VOUCHER_REDEMPTION_NOT_PREVIEWED: 'Cần xem trước (Preview) voucher trước khi xác nhận.',
  VALIDATION_FAILED: 'Dữ liệu không hợp lệ. Kiểm tra lại giá trị đơn hàng (số nguyên dương, không dấu chấm/phẩy).',
  NETWORK: 'Mất kết nối. Bấm "Kiểm tra trạng thái" để biết đã đổi thành công chưa, đừng xác nhận lại ngay.',
};
const explain = (e) => `${ERRORS[e.code] || e.message || String(e)}${e.code ? ` (${e.code})` : ''}`;
async function guard(fn) {
  err.value = '';
  busy.value = true;
  try { return await fn(); } catch (e) { err.value = explain(e); if (e.code === 'NETWORK') needRecovery.value = true; } finally { busy.value = false; }
}

const login = () => guard(async () => { await signIn(m); });

// ---- quét camera (BarcodeDetector nếu trình duyệt hỗ trợ), nếu không thì nhập tay ----
const video = ref(null);
const scanning = ref(false);
const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
let stream = null;
let scanTimer = null;
async function startCamera() {
  err.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scanning.value = true;
    await new Promise((r) => setTimeout(r, 0));
    video.value.srcObject = stream;
    await video.value.play();
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    scanTimer = setInterval(async () => {
      try {
        const codes = await detector.detect(video.value);
        const value = codes[0]?.rawValue?.trim().toUpperCase();
        if (value && /^[A-Z0-9]{8}$/.test(value)) { tokenIn.value = value; stopCamera(); preview(); }
      } catch { /* khung hình chưa sẵn sàng */ }
    }, 300);
  } catch (e) {
    stopCamera();
    err.value = `Không mở được camera: ${e.message || e}. Hãy nhập tay 8 ký tự.`;
  }
}
function stopCamera() {
  clearInterval(scanTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  scanning.value = false;
}

// ---- preview ----
const tokenValid = computed(() => /^[A-Z0-9]{8}$/.test(tokenIn.value.trim().toUpperCase()));
const preview = () => guard(async () => {
  const token = tokenIn.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(token)) throw new Error('Token phải gồm đúng 8 ký tự chữ/số.');
  const res = await previewVoucherRedemption(m, token);
  prev.value = res.data;
  idemKey.value = uuid();
  needRecovery.value = false;
  done.value = null;
  Object.assign(form, { orderAmount: '', merchantOrderRef: '', itemIds: '' });
});

// ---- validate form phía client ----
const AMOUNT_RE = /^[1-9]\d{0,14}$/;
const onAmount = (e) => { form.orderAmount = e.target.value.replace(/\D/g, '').replace(/^0+/, ''); };
const formError = computed(() => {
  if (!legacy.value) return '';
  if (!AMOUNT_RE.test(form.orderAmount)) return 'Nhập giá trị đơn hàng là số nguyên dương (VND).';
  const n = Number(form.orderAmount);
  if (n < amount.value) return `Đơn phải từ ${money(amount.value)} ₫ trở lên (bằng giá trị giảm).`;
  if (n < minOrder.value) return `Đơn tối thiểu để dùng voucher là ${money(minOrder.value)} ₫.`;
  if (requiresItems.value && !form.itemIds.trim()) return 'Voucher này cần mã món áp dụng.';
  return '';
});
const canConfirm = computed(() => !!prev.value && secondsLeft.value > 0 && !formError.value && !busy.value);

// ---- confirm ----
const confirm = () => guard(async () => {
  const body = legacy.value
    ? {
      orderAmount: String(form.orderAmount), // BẮT BUỘC là string số nguyên
      provider: 'INTERNAL',
      ...(form.merchantOrderRef.trim() ? { merchantOrderRef: form.merchantOrderRef.trim() } : {}),
      ...(requiresItems.value ? { itemIds: form.itemIds.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
    }
    : undefined;
  const res = await confirmVoucherRedemption(m, prev.value.challengeId, body, idemKey.value);
  done.value = res.data;
  needRecovery.value = false;
});

// Mạng đứt sau confirm: hỏi lại trạng thái thay vì confirm lần nữa.
const recover = () => guard(async () => {
  const res = await getMerchantRedemption(m, prev.value.challengeId);
  if (res.data?.status === 'CONFIRMED') { done.value = res.data; needRecovery.value = false; } else { err.value = `Trạng thái: ${res.data?.status || 'chưa rõ'}`; }
});

const reset = () => { prev.value = null; done.value = null; tokenIn.value = ''; err.value = ''; needRecovery.value = false; stopCamera(); };
</script>

<template>
  <div class="rm">
    <div class="rm-bar">
      <b>Thu ngân ({{ m.identifier || 'chưa có tài khoản' }})</b>
      <button v-if="!m.accessToken" :disabled="!m.identifier || busy" @click="login">Đăng nhập merchant</button>
      <span v-else class="rm-ok">đã đăng nhập</span>
      <label class="rm-mut"><input type="checkbox" :checked="legacy" @change="setRedeemLegacyBody($event.target.checked)" /> Backend dùng contract cũ (confirm có body)</label>
    </div>
    <p v-if="err" class="rm-err">{{ err }}</p>
    <button v-if="needRecovery && prev" class="rm-go" :disabled="busy" @click="recover">Kiểm tra trạng thái đổi voucher</button>

    <!-- Quét / nhập token -->
    <div v-if="!prev && !done" class="rm-box">
      <h3>Quét mã voucher</h3>
      <div v-if="scanning" class="rm-cam"><video ref="video" playsinline muted /><button @click="stopCamera">Dừng quét</button></div>
      <div class="rm-row">
        <input v-model="tokenIn" class="rm-token" maxlength="8" placeholder="8 ký tự" @input="tokenIn = tokenIn.toUpperCase()" @keyup.enter="preview" />
        <button class="rm-go" :disabled="!m.accessToken || !tokenValid || busy" @click="preview">Xem trước</button>
        <button v-if="canScan && !scanning" :disabled="!m.accessToken || busy" @click="startCamera">Quét bằng camera</button>
      </div>
      <p v-if="!canScan" class="rm-mut">Trình duyệt này không hỗ trợ quét QR bằng camera (BarcodeDetector). Nhập tay 8 ký tự.</p>
    </div>

    <!-- Preview + form xác nhận (bottom sheet) -->
    <div v-if="prev && !done" class="rm-sheet">
      <div class="rm-owner">
        <img v-if="prev.owner?.avatarUrl" :src="prev.owner.avatarUrl" alt="" />
        <div v-else class="rm-ava">{{ (prev.owner?.displayName || '?').slice(0, 1) }}</div>
        <div><b>{{ prev.owner?.displayName || `Khách #${prev.owner?.id}` }}</b><div class="rm-mut">chủ voucher</div></div>
      </div>
      <div class="rm-voucher">
        <div class="rm-pname">{{ prev.productName }}</div>
        <div>Giảm <b>{{ money(prev.amount) }} {{ prev.currency }}</b></div>
        <div v-if="legacy && minOrder" class="rm-mut">Đơn tối thiểu {{ money(minOrder) }} ₫</div>
        <div class="rm-mut" :class="{ 'rm-warn': secondsLeft <= 20 }">{{ secondsLeft > 0 ? `Mã còn hiệu lực ${secondsLeft}s` : 'Mã đã hết hạn, yêu cầu khách làm mới' }}</div>
      </div>
      <template v-if="legacy">
        <label class="rm-fld">Tổng tiền hóa đơn (₫) *
          <input :value="form.orderAmount" inputmode="numeric" placeholder="vd 150000" @input="onAmount" />
        </label>
        <label class="rm-fld">Mã hóa đơn POS
          <input v-model="form.merchantOrderRef" maxlength="255" />
        </label>
        <label v-if="requiresItems" class="rm-fld">Mã món (cách nhau dấu phẩy) *
          <input v-model="form.itemIds" />
        </label>
        <p v-if="formError && form.orderAmount" class="rm-err">{{ formError }}</p>
      </template>
      <p v-else class="rm-mut">Contract TRUST-927: xác nhận không cần nhập thêm gì.</p>
      <div class="rm-row">
        <button :disabled="busy" @click="reset">Hủy</button>
        <button class="rm-go" :disabled="!canConfirm" @click="confirm">{{ busy ? 'Đang xử lý…' : 'Xác nhận đổi voucher' }}</button>
      </div>
    </div>

    <!-- Biên nhận -->
    <div v-if="done" class="rm-sheet rm-receipt">
      <div class="rm-tick">✓</div>
      <h3>Đổi voucher thành công</h3>
      <div class="rm-big">- {{ money(done.amount) }} {{ done.currency }}</div>
      <div class="rm-mut">Mã redemption <b>#{{ done.redemptionId }}</b> · voucher #{{ done.voucherId }}</div>
      <div class="rm-mut">{{ done.redeemedAt }}</div>
      <button class="rm-go" @click="reset">Quét voucher khác</button>
    </div>
  </div>
</template>

<style scoped>
.rm { display: flex; flex-direction: column; gap: 12px; }
.rm-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.rm-ok { color: #16a34a; font-weight: 600; font-size: 12.5px; }
.rm-mut { color: #5f7a69; font-size: 12px; }
.rm-warn { color: #b91c1c; font-weight: 600; }
.rm-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; font-size: 12.5px; }
button { cursor: pointer; background: #fff; color: #14301f; border: 1px solid #86efac; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; }
button:disabled { opacity: .5; cursor: not-allowed; }
button.rm-go { background: #16a34a; color: #fff; border-color: #16a34a; }
.rm-box, .rm-sheet { max-width: 460px; width: 100%; margin: 0 auto; border: 1px solid #bbf7d0; background: #fff; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 12px 36px rgba(22,101,52,.15); }
.rm-row { display: flex; gap: 10px; flex-wrap: wrap; }
.rm-token { width: 170px; font-family: var(--font-mono, monospace); font-size: 22px; letter-spacing: 4px; text-transform: uppercase; padding: 8px; border: 1px solid #86efac; border-radius: 8px; }
.rm-cam video { width: 100%; border-radius: 10px; background: #000; }
.rm-owner { display: flex; gap: 12px; align-items: center; }
.rm-owner img, .rm-ava { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
.rm-ava { background: #dcfce7; color: #166534; display: flex; align-items: center; justify-content: center; font-weight: 800; }
.rm-voucher { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.rm-pname { font-weight: 700; }
.rm-fld { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #14532d; }
.rm-fld input { padding: 9px 10px; border: 1px solid #86efac; border-radius: 8px; font-size: 15px; }
.rm-receipt { align-items: center; text-align: center; }
.rm-tick { width: 64px; height: 64px; border-radius: 50%; background: #16a34a; color: #fff; font-size: 38px; display: flex; align-items: center; justify-content: center; }
.rm-big { font-size: 28px; font-weight: 800; color: #16a34a; }
</style>
