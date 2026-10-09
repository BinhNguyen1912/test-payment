// Generic Smart OTP proof for ANY sensitive action of a "root" account (payout, bank-account change, ...).
// BE contract (TRUST-867): the body of the protected endpoint carries `smartOtp: { requestId, code }`.
//   1. POST /mobile/smart-otp/requests            { purpose, subject: { type, id }, params }  -> requestId
//   2. POST /mobile/smart-otp/requests/:id/issue  { action: 'CHALLENGE' } + Device-Id header  -> canonical
//   3. sign canonical with the device key, POST .../issue { action: 'ISSUE', challengeId, pin, signature } -> smartOtp code
// Each persona keeps its OWN device key in localStorage (the BE allows one Smart OTP device per user).
import {
  confirmSmartOtpEnrollment,
  getSmartOtpStatus,
  initSmartOtpEnrollment,
  issueSmartOtpChallenge,
  issueSmartOtpCode,
  request,
  uuid,
} from './api.js';
import { generateDeviceKeyPair, signWithDeviceKey } from './crypto.js';

const LEGACY_BUYER_KEY = 'merchant_studio_smartotp_v1';
const keyOf = (session) => `smartotp_dev_${session.key}`;

export function readSmartDevice(session) {
  const parse = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
  };
  const own = parse(keyOf(session));
  if (own.deviceId && own.privateKeyBase64) return own;
  if (session.key === 'buyer') {
    const legacy = parse(LEGACY_BUYER_KEY);
    if (legacy.deviceId && legacy.privateKeyBase64) return legacy;
  }
  return own;
}

function saveSmartDevice(session, dev) {
  localStorage.setItem(keyOf(session), JSON.stringify(dev));
}

/** Enrolls a device for the session when the account has none; reuses the stored key otherwise. */
export async function ensureSmartDevice(session, { pin } = {}) {
  const status = (await getSmartOtpStatus(session)).data || {};
  const dev = readSmartDevice(session);
  if (status.deviceEnrolled) {
    if (status.device?.deviceId !== dev.deviceId || !dev.privateKeyBase64) {
      throw new Error(
        `Tài khoản ${session.key} đã có thiết bị Smart OTP ${status.device?.deviceId || ''} nhưng trình duyệt này không giữ khoá. ` +
        'Dùng đúng trình duyệt đã đăng ký, hoặc thu hồi thiết bị (POST /mobile/smart-otp/revoke) rồi đăng ký lại.',
      );
    }
    return dev;
  }
  const pair = await generateDeviceKeyPair();
  const next = {
    deviceId: `tester-${session.key}-${uuid()}`,
    publicKey: pair.publicKey,
    privateKeyBase64: pair.privateKeyBase64,
    attestation: `dev-attestation-${uuid()}`.padEnd(40, 'x'),
    pin: /^\d{6}$/.test(pin || '') ? pin : dev.pin || String(Math.floor(100000 + Math.random() * 900000)),
  };
  const init = await initSmartOtpEnrollment(session, {
    password: session.password,
    deviceId: next.deviceId,
    platform: 'ios',
    publicKey: next.publicKey,
    keyAttestation: next.attestation,
    hardwareInfo: navigator.userAgent,
    integrity: { isRooted: false, isEmulator: false, isHooked: false, isDebuggerAttached: false, isAppTampered: false },
  });
  const signature = await signWithDeviceKey(next.privateKeyBase64, init.data.challenge);
  await confirmSmartOtpEnrollment(session, { enrollmentId: init.data.enrollmentId, signature, pin: next.pin });
  saveSmartDevice(session, next);
  return next;
}

/** Returns `{ requestId, code }` = the `smartOtp` object the protected endpoint expects. */
export async function getSmartOtpProof(session, { purpose, subjectType, params, pin }) {
  const dev = await ensureSmartDevice(session, { pin });
  const userId = String(session.activeAccountUserId || session.profile?.id || '');
  const created = await request(session, 'POST', '/mobile/smart-otp/requests', {
    body: { purpose, subject: { type: subjectType, id: userId }, params },
  });
  const requestId = String(created.data.requestId);
  const challenge = await issueSmartOtpChallenge(session, requestId, dev.deviceId);
  const signature = await signWithDeviceKey(dev.privateKeyBase64, challenge.data.canonical);
  const issued = await issueSmartOtpCode(session, requestId, {
    challengeId: challenge.data.challengeId,
    pin: pin && /^\d{6}$/.test(pin) ? pin : dev.pin,
    signature,
  });
  return { requestId, code: issued.data.smartOtp };
}
