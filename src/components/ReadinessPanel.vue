<script setup>
// Kiểm tra & chuẩn bị từng actor đúng như BE hiện tại yêu cầu:
//  - root (clientId user): eKYC, membership, Smart OTP device (không dùng PIN: /mobile/pin/* trả 403 với clientId user)
//  - creator/merchant: PIN (X-Pin-Token) + tài khoản ngân hàng
import { reactive, ref } from 'vue';
import { getMyBankAccount, getPinStatus, getSmartOtpStatus, request, sessions, setupPin } from '../api.js';
import { ensureSmartDevice, readSmartDevice } from '../smartOtp.js';

const rows = reactive({});
const busy = ref(false);
const err = ref('');
const pinValue = ref('482915');
const isManaged = (s) => ['creator', 'merchant'].includes(s.clientId);

async function probe(fn) {
  try { return await fn(); } catch (e) { return { error: e.code || e.message }; }
}

async function checkOne(s) {
  const r = { login: !!s.accessToken };
  if (!s.accessToken) { rows[s.key] = r; return; }
  if (isManaged(s)) {
    r.pin = (await probe(() => getPinStatus(s))).data?.status || '—';
    const b = await probe(() => getMyBankAccount(s));
    r.bank = b.data?.id ? `${b.data.bankShortName || b.data.bankCode} ${b.data.accountNumberMasked || ''}` : (b.error || 'chưa có');
  } else {
    r.ekyc = (await probe(() => request(s, 'GET', '/mobile/ekyc/status'))).data?.status || '—';
    const m = await probe(() => request(s, 'GET', '/mobile/membership/me'));
    r.membership = m.data?.active ? `active → ${String(m.data.expiresAt).slice(0, 10)}` : (m.error || 'không');
    const o = await probe(() => getSmartOtpStatus(s));
    const local = readSmartDevice(s);
    const dev = o.data?.deviceEnrolled;
    r.smartOtp = dev ? (o.data.device?.deviceId === local.deviceId && local.privateKeyBase64 ? 'có khoá ở trình duyệt này' : 'ĐÃ ĐĂNG KÝ nhưng trình duyệt không giữ khoá') : (o.error || 'chưa đăng ký');
    const b = await probe(() => getMyBankAccount(s));
    r.bank = b.data?.id ? `${b.data.bankShortName || b.data.bankCode} ${b.data.accountNumberMasked || ''}` : (b.error || 'chưa có');
  }
  rows[s.key] = r;
}

async function checkAll() {
  busy.value = true; err.value = '';
  try { for (const s of Object.values(sessions)) await checkOne(s); } finally { busy.value = false; }
}

async function prepare(s) {
  busy.value = true; err.value = '';
  try {
    if (isManaged(s)) {
      const st = (await getPinStatus(s)).data?.status;
      if (st === 'NOT_CONFIGURED') await setupPin(s, s.password, pinValue.value);
      s.pin = s.pin || pinValue.value;
    } else {
      await ensureSmartDevice(s, { pin: pinValue.value });
    }
    await checkOne(s);
  } catch (e) { err.value = `${s.label}: ${e.code || ''} ${e.message}`; } finally { busy.value = false; }
}
</script>

<template>
  <div class="metric-card" style="margin-top: 16px; gap: 10px;">
    <h3 style="font-size: 0.95rem;">Sẵn sàng của từng actor (theo BE hiện tại)</h3>
    <div class="button-group" style="align-items: center;">
      <label class="muted" style="font-size: 0.78rem;">PIN 6 số dùng khi thiết lập</label>
      <input v-model="pinValue" maxlength="6" inputmode="numeric" style="width: 90px;" />
      <button class="secondary" :disabled="busy" @click="checkAll">Kiểm tra tất cả (cần đã Login)</button>
    </div>
    <div v-if="err" class="callout warning">{{ err }}</div>
    <div class="table-container">
      <table>
        <thead><tr><th>Persona</th><th>Login<div class="col-db">auth_sessions, user_device_sessions</div></th><th>eKYC<div class="col-db">ekyc_verifications.status</div></th><th>Membership<div class="col-db">user_memberships (+ membership_plans)</div></th><th>PIN<div class="col-db">account_pins</div></th><th>Smart OTP<div class="col-db">smart_otp_credentials, smart_otp_devices</div></th><th>Ngân hàng<div class="col-db">user_bank_accounts</div></th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in Object.values(sessions)" :key="s.key">
            <td><strong>{{ s.key }}</strong> <span class="muted">({{ s.clientId }})</span></td>
            <td>{{ rows[s.key]?.login ? '✓' : '—' }}</td>
            <td>{{ rows[s.key]?.ekyc ?? '—' }}</td>
            <td>{{ rows[s.key]?.membership ?? '—' }}</td>
            <td>{{ isManaged(s) ? (rows[s.key]?.pin ?? '—') : 'không dùng' }}</td>
            <td>{{ isManaged(s) ? 'không dùng' : (rows[s.key]?.smartOtp ?? '—') }}</td>
            <td>{{ rows[s.key]?.bank ?? '—' }}</td>
            <td><button class="secondary" style="padding: 4px 10px; font-size: 0.75rem;" :disabled="busy || !s.accessToken" @click="prepare(s)">{{ isManaged(s) ? 'Thiết lập PIN' : 'Đăng ký Smart OTP' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.col-db { font-size: 0.62rem; font-weight: 400; color: #6b7280; font-family: monospace; white-space: normal; }
</style>
