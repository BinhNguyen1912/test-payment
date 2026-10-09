<script setup>
// Xuất báo cáo thuế khấu trừ theo preset (TRUST-913) + bảng kịch bản test hợp đồng API.
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import {
  downloadTaxExport,
  getTaxExport,
  requestTaxExport,
  requestTaxExportRaw,
  sessions,
} from '../api.js';
import ReportPeriodPicker from './ReportPeriodPicker.vue';

const emit = defineEmits(['resolved']);

const period = ref({ preset: 'LAST_MONTH', from: '', to: '' });
const periodValid = ref(true);
const status = ref(null); // response của export (có preset, from, to đã resolve)
const busy = ref(false);
const fieldErrors = ref({});
const formError = ref('');
let stopped = false;
onBeforeUnmount(() => { stopped = true; });

const loggedIn = computed(() => !!sessions.approver?.accessToken);
const resolved = computed(() => (status.value ? { from: status.value.from, to: status.value.to } : null));

// Chuyển lỗi server thành thông điệp theo error.code (mục 5 của tài liệu).
function describeError(e) {
  const code = e?.code || '';
  const http = e?.status;
  if (code === 'VALIDATION_FAILED') {
    fieldErrors.value = e.body?.error?.fieldErrors || {};
    return 'Dữ liệu gửi lên không hợp lệ, xem lỗi cạnh từng ô.';
  }
  if (code === 'TAX_REPORT_INVALID_PERIOD') return 'Kỳ báo cáo thuế không hợp lệ (sai quy tắc về kỳ).';
  if (code === 'AUTH_TOKEN_INVALID' || http === 401) return 'Chưa đăng nhập hoặc phiên hết hạn. Đăng nhập lại admin.';
  if (http === 403) return 'Thiếu quyền finance.tax_reports.export.';
  if (http === 429) return 'Quá giới hạn 5 request/phút. Đợi một chút rồi thử lại.';
  if (code === 'TAX_REPORT_EXPORT_NOT_FOUND') return 'Export không tồn tại hoặc không thuộc về bạn.';
  if (code === 'TAX_REPORT_EXPORT_NOT_READY') return 'File chưa sẵn sàng (409).';
  return `${code || 'ERROR'}: ${e?.message || e}`;
}

function applyStatus(data) {
  status.value = data;
  // Tô lại lựa chọn theo preset server trả về.
  if (data?.preset) {
    period.value = data.preset === 'CUSTOM'
      ? { preset: 'CUSTOM', from: data.from, to: data.to }
      : { preset: data.preset, from: '', to: '' };
  }
  if (data?.from && data?.to) emit('resolved', { from: data.from, to: data.to });
}

function saveBlob(file) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportNow() {
  fieldErrors.value = {};
  formError.value = '';
  busy.value = true;
  try {
    const session = sessions.approver;
    const created = await requestTaxExport(session, { ...period.value });
    applyStatus(created.data);
    // Poll mỗi 2.5s tới READY/FAILED hoặc hết hạn.
    while (!stopped) {
      const s = status.value;
      if (s.status === 'READY' || s.status === 'FAILED') break;
      if (s.expiresAt && Date.parse(s.expiresAt) < Date.now()) {
        formError.value = 'Export đã hết hạn.';
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
      const res = await getTaxExport(session, created.data.exportId);
      applyStatus(res.data);
    }
    if (status.value?.status === 'FAILED') {
      formError.value = `Export thất bại: ${status.value.errorCode || 'UNKNOWN'}`;
      return;
    }
    await download();
  } catch (e) {
    formError.value = describeError(e);
  } finally {
    busy.value = false;
  }
}

async function download() {
  if (!status.value?.exportId) return;
  try {
    saveBlob(await downloadTaxExport(sessions.approver, status.value.exportId));
  } catch (e) {
    formError.value = describeError(e);
  }
}

// ---------------------------------------------------------------------------
// Kịch bản test (mục 7). Case 14 là luồng POST rồi poll GET ở trên.
// ---------------------------------------------------------------------------
const CASES = [
  { n: 1, body: { preset: 'LAST_MONTH' }, http: 200, note: 'preset=LAST_MONTH, from/to là tháng trước' },
  { n: 2, body: { preset: 'THIS_WEEK' }, http: 200, note: 'from là Thứ Hai, to là hôm nay' },
  { n: 3, body: { preset: 'CUSTOM', from: '2026-09-01', to: '2026-09-15' }, http: 200, note: 'preset=CUSTOM, ngày giữ nguyên' },
  { n: 4, body: { preset: 'TODAY' }, http: 200, note: 'from = to = hôm nay (giờ VN)' },
  { n: 5, body: {}, http: 400, code: 'VALIDATION_FAILED', note: 'fieldErrors.preset' },
  { n: 6, body: { from: '2026-09-01', to: '2026-09-30' }, http: 400, code: 'VALIDATION_FAILED', note: 'body cũ không còn hợp lệ' },
  { n: 7, body: { preset: 'NEXT_WEEK' }, http: 400, code: 'VALIDATION_FAILED', note: 'preset ngoài enum' },
  { n: 8, body: { preset: 'CUSTOM', from: '2026-9-1', to: '2026-09-30' }, http: 400, code: 'VALIDATION_FAILED', note: 'sai định dạng ngày' },
  { n: 9, body: { preset: 'THIS_WEEK', from: '2026-10-01', to: '2026-10-07' }, http: 400, code: 'TAX_REPORT_INVALID_PERIOD', note: 'preset khác CUSTOM mà kèm from/to' },
  { n: 10, body: { preset: 'CUSTOM', from: '2026-09-01' }, http: 400, code: 'TAX_REPORT_INVALID_PERIOD', note: 'CUSTOM thiếu to' },
  { n: 11, body: { preset: 'CUSTOM', from: '2026-02-30', to: '2026-03-05' }, http: 400, code: 'TAX_REPORT_INVALID_PERIOD', note: 'ngày không có thật' },
  { n: 12, body: { preset: 'CUSTOM', from: '2026-09-10', to: '2026-09-09' }, http: 400, code: 'TAX_REPORT_INVALID_PERIOD', note: 'to trước from' },
  { n: 13, body: { preset: 'CUSTOM', from: '2025-01-01', to: '2026-01-02' }, http: 400, code: 'TAX_REPORT_INVALID_PERIOD', note: 'vượt 366 ngày' },
];
const results = reactive({});
const running = ref(0);

async function runCase(c) {
  running.value = c.n;
  const t0 = Date.now();
  try {
    const res = await requestTaxExportRaw(sessions.approver, c.body);
    const d = res.data;
    results[c.n] = {
      http: res.status,
      code: '',
      detail: `${d.preset} ${d.from}→${d.to} (${d.status})`,
      pass: res.status === c.http,
      ms: Date.now() - t0,
    };
  } catch (e) {
    const fe = e.body?.error?.fieldErrors;
    results[c.n] = {
      http: e.status ?? '-',
      code: e.code,
      detail: fe ? `fieldErrors: ${Object.keys(fe).join(', ')}` : e.message,
      pass: e.status === c.http && (!c.code || e.code === c.code),
      ms: Date.now() - t0,
    };
  } finally {
    running.value = 0;
  }
}
</script>

<template>
  <div class="tax-panel">
    <div class="head">
      <strong>🧾 Báo cáo thuế khấu trừ (Excel)</strong>
      <span class="muted">Job nền, chạy bằng Finance Approver. File tải được trong khoảng 1 giờ.</span>
    </div>

    <div class="row">
      <ReportPeriodPicker
        v-model="period"
        :resolved="resolved"
        :field-errors="fieldErrors"
        :disabled="busy"
        @validity="periodValid = $event"
      />
      <button class="success" :disabled="busy || !loggedIn || !periodValid" @click="exportNow">
        {{ busy ? 'Đang xử lý…' : '📥 Xuất Excel' }}
      </button>
      <button class="secondary" :disabled="busy || status?.status !== 'READY'" @click="download">Tải lại file</button>
    </div>
    <p v-if="!loggedIn" class="err">Chưa đăng nhập admin (nhập tk/mk ở thanh trên, hoặc đăng nhập Finance Approver ở tab 1).</p>
    <p v-if="formError" class="err">{{ formError }}</p>

    <div v-if="status" class="facts">
      <span>Export ID <code>{{ status.exportId }}</code></span>
      <span>Trạng thái <b>{{ status.status }}</b></span>
      <span>Preset <b>{{ status.preset }}</b></span>
      <span>Kỳ <b>{{ status.from }} – {{ status.to }}</b></span>
      <span>Dòng / Seller <b>{{ status.rowCount ?? '-' }} / {{ status.sellerCount ?? '-' }}</b></span>
      <span>Hết hạn <b>{{ status.expiresAt }}</b></span>
    </div>

    <details class="cases">
      <summary>Kịch bản test hợp đồng API (13 case + luồng poll)</summary>
      <p class="muted">
        POST bị giới hạn 5 request/phút/user, nên chạy từng case một. Case 14 chính là nút "Xuất Excel":
        so khớp preset/from/to của response với lúc POST, status phải đi tới READY.
      </p>
      <table>
        <thead><tr><th>#</th><th>Body</th><th>Kỳ vọng</th><th></th><th>Kết quả</th></tr></thead>
        <tbody>
          <tr v-for="c in CASES" :key="c.n">
            <td>{{ c.n }}</td>
            <td><code>{{ JSON.stringify(c.body) }}</code></td>
            <td>{{ c.http }}<template v-if="c.code"> {{ c.code }}</template><br /><span class="muted">{{ c.note }}</span></td>
            <td><button class="ghost" :disabled="!loggedIn || running === c.n" @click="runCase(c)">Chạy</button></td>
            <td>
              <template v-if="results[c.n]">
                <b :class="results[c.n].pass ? 'ok' : 'err'">{{ results[c.n].pass ? 'PASS' : 'FAIL' }}</b>
                {{ results[c.n].http }} {{ results[c.n].code }}<br />
                <span class="muted">{{ results[c.n].detail }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>

<style scoped>
.tax-panel { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; background: var(--bg-surface); }
.head { display: flex; flex-direction: column; gap: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.muted { color: var(--text-muted); font-size: 0.78rem; }
.err { color: var(--danger); font-size: 0.85rem; }
.ok { color: var(--success); }
.facts { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.8rem; }
code { font-family: var(--font-mono); font-size: 0.75rem; }
.cases summary { cursor: pointer; font-weight: 600; font-size: 0.85rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 8px; }
th, td { padding: 6px 8px; border: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
th { background: var(--bg-surface-subtle); }
</style>
