<script setup>
import { computed, reactive, ref } from 'vue';
import TaxExportPanel from './TaxExportPanel.vue';
import {
  getFinanceJournals,
  getLedgerIntegrity,
  listAdminPayouts,
  sessions,
} from '../api.js';

// Dữ liệu mẫu (đã tính khớp nhau) - merchant ABC, kỳ 09/2026.
// Khóa nối: batch_id -> payout_id -> bank_txn_ref -> invoice_no / tax_cert_no
const PERIOD = '202609';

const MOCK_FILES = [
  {
    key: 'tonghop',
    name: `DOISOAT_TONGHOP_ABC_${PERIOD}`,
    title: 'Tổng hợp kỳ đối soát',
    law: 'Luật Kế toán 2015',
    sheets: [
      {
        name: 'Tổng hợp',
        columns: ['Chỉ tiêu', 'Giá trị (VND)'],
        numeric: [1],
        rows: [
          ['Doanh nghiệp / MST', 'Công ty ABC / 0312345678'],
          ['Kỳ đối soát', '01/09/2026 – 30/09/2026'],
          ['(1) Số dư đầu kỳ', 100000000],
          ['(2) Tổng tiền nạp', 50000000],
          ['(3) Tổng lệnh chi yêu cầu (4 lệnh)', 21500000],
          ['(4) Lệnh chi thành công (3 lệnh)', 18500000],
          ['(5) Lệnh chi thất bại, đã hoàn (1 lệnh)', 3000000],
          ['(6) Phí dịch vụ', 15000],
          ['(7) VAT phí', 1500],
          ['Thuế TNCN đã khấu trừ (thông tin, nằm trong (4))', 1700000],
          ['(8) Số dư cuối kỳ = (1)+(2)−(4)−(6)−(7)', 131483500],
          ['Thời điểm xuất / Người xuất / Hash', '01/10/2026 08:00 / admin@abc.vn / a3f9…c21'],
        ],
        boldRows: [10],
      },
    ],
  },
  {
    key: 'chitiet',
    name: `DOISOAT_CHITIET_ABC_${PERIOD}`,
    title: 'Chi tiết từng lệnh chi',
    law: 'NĐ 52/2024, quy định NHNN về trung gian thanh toán',
    sheets: [
      {
        name: 'Chi tiết lệnh chi',
        columns: [
          'payout_id', 'batch_id', 'merchant_ref', 'Ngày hoàn tất', 'Người nhận', 'Loại',
          'CCCD/MST', 'Ngân hàng', 'Số TK', 'Gross', 'Thuế TNCN', 'Net thực chuyển',
          'Phí', 'VAT phí', 'Trạng thái', 'bank_txn_ref',
        ],
        numeric: [9, 10, 11, 12, 13],
        rows: [
          ['P001', 'B01', 'ORD-1001', '05/09/2026', 'Nguyễn Văn A', 'Cá nhân', '079****123', 'VCB', '****5678', 5000000, 500000, 4500000, 5000, 500, 'Thành công', 'FT26248001'],
          ['P002', 'B01', 'ORD-1002', '05/09/2026', 'Trần Thị B', 'Cá nhân', '079****456', 'TCB', '****1122', 1500000, 0, 1500000, 5000, 500, 'Thành công', 'FT26248002'],
          ['P003', 'B02', 'ORD-1003', '12/09/2026', 'Lê Văn C', 'Cá nhân', '079****789', 'ACB', '****3344', 12000000, 1200000, 10800000, 5000, 500, 'Thành công', 'FT26255010'],
          ['P004', 'B02', 'ORD-1004', '12/09/2026', 'Phạm D', 'Cá nhân', '079****000', 'MB', '****9900', 3000000, 0, 0, 0, 0, 'Thất bại', ''],
          ['Tổng thành công', '', '', '', '', '', '', '', '', 18500000, 1700000, 16800000, 15000, 1500, '', ''],
        ],
        boldRows: [4],
      },
    ],
    note: 'Cột ẩn mặc định: trạng thái KYC, mã lỗi, nội dung chuyển khoản, loại khoản chi, created_at, submitted_at.',
  },
  {
    key: 'socai',
    name: `SOCAI_SODU_ABC_${PERIOD}`,
    title: 'Sổ biến động số dư',
    law: 'Luật Kế toán 2015 (lưu trữ 10 năm)',
    sheets: [
      {
        name: 'Sổ biến động số dư',
        columns: ['ledger_id', 'Thời gian', 'Loại bút toán', 'ref_id', 'Ghi nợ (−)', 'Ghi có (+)', 'Số dư sau', 'Diễn giải'],
        numeric: [4, 5, 6],
        rows: [
          ['L01', '01/09 09:00', 'Nạp tiền', 'TOPUP-001', '', 50000000, 150000000, 'Nạp qua chuyển khoản'],
          ['L02', '05/09 10:15', 'Chi payout', 'P001', 5000000, '', 145000000, 'Chi ORD-1001'],
          ['L03', '05/09 10:15', 'Phí + VAT', 'P001', 5500, '', 144994500, 'Phí 5,000 + VAT 500'],
          ['L04', '05/09 10:16', 'Chi payout', 'P002', 1500000, '', 143494500, 'Chi ORD-1002'],
          ['L05', '05/09 10:16', 'Phí + VAT', 'P002', 5500, '', 143489000, ''],
          ['L06', '12/09 14:00', 'Chi payout', 'P004', 3000000, '', 140489000, 'Chi ORD-1004'],
          ['L07', '12/09 14:02', 'Hoàn tiền', 'P004', '', 3000000, 143489000, 'Ngân hàng từ chối, hoàn'],
          ['L08', '12/09 14:05', 'Chi payout', 'P003', 12000000, '', 131489000, 'Chi ORD-1003'],
          ['L09', '12/09 14:05', 'Phí + VAT', 'P003', 5500, '', 131483500, ''],
        ],
        boldRows: [8],
      },
    ],
    note: 'Dòng cuối của sổ cái phải khớp số dư cuối kỳ ở file Tổng hợp.',
  },
  {
    key: 'hoadon',
    name: `HOADON_PHIDICHVU_ABC_${PERIOD}`,
    title: 'Phí dịch vụ và hóa đơn điện tử',
    law: 'NĐ 123/2020, TT 78/2021, NĐ 70/2025',
    sheets: [
      {
        name: 'Hóa đơn',
        columns: [
          'Số HĐ', 'Ký hiệu', 'Mẫu số', 'Ngày HĐ', 'MST bên bán', 'MST bên mua',
          'Tiền trước thuế', 'Thuế suất', 'VAT', 'Tổng', 'Trạng thái HĐĐT', 'Mã CQT', 'Link tra cứu',
        ],
        numeric: [6, 8, 9],
        rows: [
          ['0000123', 'C26TAA', '1', '30/09/2026', '0100000001', '0312345678', 15000, '10%', 1500, 16500, 'Đã phát hành', '00A1B2…', '(link)'],
        ],
      },
      {
        name: 'Chi tiết phí theo lệnh',
        columns: ['payout_id', 'Ngày', 'Phí', 'VAT', 'Số HĐ'],
        numeric: [2, 3],
        rows: [
          ['P001', '05/09', 5000, 500, '0000123'],
          ['P002', '05/09', 5000, 500, '0000123'],
          ['P003', '12/09', 5000, 500, '0000123'],
        ],
      },
    ],
  },
  {
    key: 'tncn',
    name: `THUE_TNCN_KHAUTRU_ABC_${PERIOD}`,
    title: 'Khấu trừ thuế TNCN',
    law: 'Luật Thuế TNCN, TT 111/2013',
    sheets: [
      {
        name: 'Khấu trừ TNCN',
        columns: [
          'tax_cert_no', 'payout_id', 'Ngày khấu trừ', 'Người nhận', 'MST/CCCD',
          'Thu nhập chịu thuế', 'Thuế suất', 'Thuế đã khấu trừ', 'Trạng thái chứng từ', 'Kỳ kê khai',
        ],
        numeric: [5, 7],
        rows: [
          ['CT-0001', 'P001', '05/09/2026', 'Nguyễn Văn A', '079****123', 5000000, '10%', 500000, 'Đã cấp', 'Tháng 09/2026'],
          ['CT-0002', 'P003', '12/09/2026', 'Lê Văn C', '079****789', 12000000, '10%', 1200000, 'Đã cấp', 'Tháng 09/2026'],
          ['Tổng', '', '', '', '', 17000000, '', 1700000, '', ''],
        ],
        boldRows: [2],
      },
    ],
    note: 'P002 (1,500,000) dưới ngưỡng 2 triệu nên không khấu trừ, không xuất hiện ở file này.',
  },
  {
    key: 'ngoaile',
    name: `NGOAILE_HOANTIEN_ABC_${PERIOD}`,
    title: 'Lệnh lỗi, hoàn, treo',
    law: 'Luật PCRT 2022, NĐ 52/2024',
    sheets: [
      {
        name: 'Ngoại lệ',
        columns: [
          'payout_id', 'Loại ngoại lệ', 'Thời điểm', 'Số tiền', 'Mã lỗi', 'Lý do',
          'Xử lý', 'Ngày hoàn', 'Ref hoàn (ledger)',
        ],
        numeric: [3],
        rows: [
          ['P004', 'Chuyển thất bại', '12/09/2026 14:02', 3000000, '51', 'TK nhận không hợp lệ', 'Đã hoàn', '12/09/2026', 'L07'],
        ],
      },
    ],
  },
];

const CHECKS = [
  ['Tổng Gross thành công = (4)', 'Chi tiết ↔ Tổng hợp'],
  ['Số dư cuối kỳ = dòng cuối sổ cái', 'Sổ cái ↔ Tổng hợp'],
  ['Tổng phí + VAT = hóa đơn', 'Chi tiết ↔ Hóa đơn'],
  ['Tổng thuế TNCN', 'Chi tiết ↔ Khấu trừ TNCN'],
  ['bank_txn_ref', 'Chi tiết ↔ sao kê ngân hàng của DN'],
  ['Lệnh thất bại và hoàn tiền', 'Chi tiết ↔ Ngoại lệ ↔ Sổ cái'],
];

// ---------------------------------------------------------------------------
// Chế độ dữ liệu thật: payouts + journals + tax export từ backend (cần đăng nhập Finance Approver).
// ---------------------------------------------------------------------------
const mode = ref('mock'); // 'mock' | 'real'
const real = reactive({
  from: '', // kỳ lọc FE: lấy từ response của export thuế gần nhất (server resolve preset)
  to: '',
  loading: false,
  error: '',
  files: null,
  loadedAt: '',
  integrity: null,
});

const FILES = computed(() => (mode.value === 'real' && real.files ? real.files : MOCK_FILES));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
const isFailedLike = (s) => ['FAILED', 'REJECTED', 'CANCELLED', 'RECONCILIATION_REQUIRED'].includes(String(s).toUpperCase());

async function pageAll(fn, session, query, maxPages = 20) {
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i += 1) {
    const res = await fn(session, { ...query, limit: 50, cursor });
    const data = res.data?.items || res.data || [];
    out.push(...data);
    cursor = res.meta?.nextCursor;
    if (!res.meta?.hasMore || !cursor) break;
  }
  return out;
}

function buildRealFiles(payouts, journals) {
  const inRange = payouts.filter((p) => {
    const d = day(p.createdAt);
    return (!real.from || d >= real.from) && (!real.to || d <= real.to);
  });
  const ok = inRange.filter((p) => String(p.status).toUpperCase() === 'SUCCEEDED');
  const bad = inRange.filter((p) => isFailedLike(p.status));
  const sum = (arr) => arr.reduce((s, p) => s + num(p.amountVnd), 0);
  const files = MOCK_FILES.map((f) => ({ ...f, sheets: f.sheets.map((s) => ({ ...s })) }));
  const by = (k) => files.find((f) => f.key === k);

  by('tonghop').sheets = [{
    name: 'Tổng hợp',
    columns: ['Chỉ tiêu', 'Giá trị'],
    numeric: [1],
    rows: [
      ['Kỳ đối soát', real.from ? `${real.from} – ${real.to}` : 'Tất cả (chưa chọn kỳ)'],
      ['Số lệnh chi trong kỳ', inRange.length],
      ['Tổng tiền lệnh chi yêu cầu', sum(inRange)],
      [`Lệnh chi thành công (${ok.length} lệnh)`, sum(ok)],
      [`Lệnh lỗi / từ chối / hủy / chờ đối soát (${bad.length} lệnh)`, sum(bad)],
      ['Số dư đầu kỳ, tổng nạp, phí, VAT, TNCN', 'Chưa có API tổng hợp (xem mục thiếu dữ liệu)'],
      ['Toàn vẹn sổ cái', real.integrity ? JSON.stringify(real.integrity).slice(0, 120) : 'n/a'],
      ['Thời điểm xuất', new Date().toISOString()],
    ],
  }];

  by('chitiet').sheets = [{
    name: 'Chi tiết lệnh chi',
    columns: [
      'payout_id', 'Bên nhận (loại)', 'party_id', 'Tạo lúc', 'Hoàn tất', 'Tên TK', 'Ngân hàng',
      'Số TK (mask)', 'Số tiền', 'Tiền tệ', 'Trạng thái', 'bank_txn_ref (externalReference)', 'Lý do lỗi',
    ],
    numeric: [8],
    rows: [
      ...inRange.map((p) => [
        p.id, p.partyType, p.partyId, p.createdAt, p.completedAt || '', p.accountName, p.bankName,
        p.accountNumberMasked, num(p.amountVnd), p.currency || 'VND', p.status, p.externalReference || '', p.failureReason || '',
      ]),
      ['Tổng thành công', '', '', '', '', '', '', '', sum(ok), '', '', '', ''],
    ],
    boldRows: [inRange.length],
  }];
  by('chitiet').note = 'Backend chưa trả: Gross/TNCN/Net, phí, VAT, loại người nhận (cá nhân/tổ chức), CCCD/MST, batch_id, merchant_ref.';

  const ledgerRows = [];
  journals.forEach((j) => {
    (j.lines || []).forEach((l) => {
      const side = String(l.side).toUpperCase();
      const amt = num(l.amountMinor ?? l.amountVnd ?? l.amount);
      ledgerRows.push([
        j.id, j.createdAt || j.postedAt || '', j.eventType || '', j.sourceId ?? '',
        l.accountCode || l.accountId || '', side === 'DEBIT' ? amt : '', side === 'CREDIT' ? amt : '', j.status || 'POSTED',
      ]);
    });
  });
  by('socai').sheets = [{
    name: 'Sổ cái (journal lines)',
    columns: ['journal_id', 'Thời gian', 'event_type', 'source_id', 'Tài khoản', 'Nợ', 'Có', 'Trạng thái'],
    numeric: [5, 6],
    rows: ledgerRows,
  }];
  by('socai').note = 'Đây là sổ cái kế toán kép của nền tảng (toàn hệ thống), chưa lọc theo từng doanh nghiệp và chưa có số dư sau từng dòng.';

  by('ngoaile').sheets = [{
    name: 'Ngoại lệ',
    columns: ['payout_id', 'Trạng thái', 'Tạo lúc', 'Hoàn tất', 'Số tiền', 'Lý do', 'externalReference'],
    numeric: [4],
    rows: bad.map((p) => [p.id, p.status, p.createdAt, p.completedAt || '', num(p.amountVnd), p.failureReason || '', p.externalReference || '']),
  }];

  by('hoadon').sheets = [{
    name: 'Chưa có API',
    columns: ['Ghi chú'],
    numeric: [],
    rows: [['Backend chưa có module hóa đơn điện tử / phí dịch vụ theo lệnh chi. Cần bổ sung nguồn dữ liệu.']],
  }];
  by('tncn').note = 'Dùng khung "Báo cáo thuế khấu trừ" bên dưới: backend tạo file xlsx qua job nền.';
  return files;
}

async function loadReal() {
  const session = sessions.approver;
  real.error = '';
  if (!session?.accessToken) {
    real.error = 'Chưa đăng nhập admin. Nhập tài khoản/mật khẩu admin ở thanh trên rồi bấm Đăng nhập.';
    return;
  }
  real.loading = true;
  try {
    const [payouts, journals, integrity] = await Promise.all([
      pageAll(listAdminPayouts, session, {}),
      pageAll(getFinanceJournals, session, {}, 10),
      getLedgerIntegrity(session).then((r) => r.data).catch(() => null),
    ]);
    real.integrity = integrity;
    real.files = buildRealFiles(payouts, journals);
    real.loadedAt = new Date().toLocaleString('vi-VN');
    mode.value = 'real';
    selectFile(activeKey.value);
  } catch (e) {
    real.error = e?.message || String(e);
  } finally {
    real.loading = false;
  }
}

function useMock() {
  mode.value = 'mock';
  selectFile(activeKey.value);
}

const activeKey = ref(MOCK_FILES[0].key);
const activeSheetIdx = ref(0);

const activeFile = computed(() => FILES.value.find((f) => f.key === activeKey.value) || FILES.value[0]);
const activeSheet = computed(() => activeFile.value.sheets[Math.min(activeSheetIdx.value, activeFile.value.sheets.length - 1)]);

function selectFile(key) {
  activeKey.value = key;
  activeSheetIdx.value = 0;
}

const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadCsv(file, sheet) {
  const lines = [sheet.columns, ...sheet.rows].map((r) => r.map(csvCell).join(','));
  // BOM để Excel đọc đúng UTF-8 tiếng Việt
  download(`${file.name}${file.sheets.length > 1 ? '_' + sheet.name : ''}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Excel 2003 XML (SpreadsheetML): hỗ trợ nhiều sheet, không cần thư viện.
function downloadExcel(file) {
  const cell = (v) =>
    typeof v === 'number'
      ? `<Cell ss:StyleID="n"><Data ss:Type="Number">${v}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
  const sheets = file.sheets
    .map(
      (s) => `<Worksheet ss:Name="${xmlEsc(s.name).slice(0, 31)}"><Table>
<Row>${s.columns.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`).join('')}</Row>
${s.rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('\n')}
</Table></Worksheet>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>
<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/></Style>
</Styles>
${sheets}
</Workbook>`;
  download(`${file.name}.xls`, xml, 'application/vnd.ms-excel');
}

function downloadAll() {
  FILES.value.forEach((f, i) => setTimeout(() => downloadExcel(f), i * 250));
}
</script>

<template>
  <div class="recon">
    <div class="recon-head">
      <div>
        <h2>Đối soát &amp; Chứng từ</h2>
        <p class="muted">
          <template v-if="mode === 'mock'">Công ty ABC (MST 0312345678) · Kỳ 01/09/2026 – 30/09/2026 · Dữ liệu mẫu để hình dung bộ file Excel doanh nghiệp tải về.</template>
          <template v-else>Dữ liệu thật từ backend · Kỳ {{ real.from ? real.from + ' → ' + real.to : 'tất cả' }} · Tải lúc {{ real.loadedAt }}</template>
        </p>
      </div>
      <button class="success" @click="downloadAll">Tải tất cả (6 file)</button>
    </div>

    <div class="source-bar">
      <div class="seg">
        <button class="ghost" :class="{ active: mode === 'mock' }" @click="useMock">Dữ liệu mẫu</button>
        <button class="ghost" :class="{ active: mode === 'real' }" :disabled="!real.files" @click="mode = 'real'">Dữ liệu thật</button>
      </div>
      <button class="primary" :disabled="real.loading" @click="loadReal">{{ real.loading ? 'Đang tải…' : 'Tải dữ liệu thật' }}</button>
      <span class="muted">Kỳ lọc: {{ real.from ? real.from + ' → ' + real.to : 'tất cả' }} (lấy từ lần xuất thuế gần nhất bên dưới)</span>
    </div>
    <p v-if="real.error" class="err">{{ real.error }}</p>

    <TaxExportPanel @resolved="(p) => { real.from = p.from; real.to = p.to; }" />

    <table class="recon-list">
      <thead>
        <tr><th>#</th><th>Tên file</th><th>Nội dung</th><th>Căn cứ</th><th>Sheet</th><th></th></tr>
      </thead>
      <tbody>
        <tr
          v-for="(f, i) in FILES"
          :key="f.key"
          :class="{ sel: f.key === activeKey }"
          @click="selectFile(f.key)"
        >
          <td>{{ i + 1 }}</td>
          <td class="mono">{{ f.name }}.xls</td>
          <td>{{ f.title }}</td>
          <td class="muted">{{ f.law }}</td>
          <td>{{ f.sheets.length }}</td>
          <td><button class="ghost" @click.stop="downloadExcel(f)">Tải Excel</button></td>
        </tr>
      </tbody>
    </table>

    <div class="recon-preview">
      <div class="preview-bar">
        <strong class="mono">{{ activeFile.name }}.xls</strong>
        <div class="sheet-tabs">
          <button
            v-for="(s, i) in activeFile.sheets"
            :key="s.name"
            class="ghost"
            :class="{ active: i === activeSheetIdx }"
            @click="activeSheetIdx = i"
          >{{ s.name }}</button>
        </div>
        <button class="secondary" @click="downloadCsv(activeFile, activeSheet)">Tải CSV (sheet này)</button>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr><th v-for="c in activeSheet.columns" :key="c">{{ c }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, ri) in activeSheet.rows" :key="ri" :class="{ bold: (activeSheet.boldRows || []).includes(ri) }">
              <td v-for="(v, ci) in r" :key="ci" :class="{ num: activeSheet.numeric.includes(ci) }">{{ fmt(v) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="activeFile.note" class="muted note">{{ activeFile.note }}</p>
    </div>

    <div class="recon-checks">
      <h3>Cách doanh nghiệp tự đối soát</h3>
      <table class="data">
        <thead><tr><th>Kiểm tra</th><th>So khớp giữa</th></tr></thead>
        <tbody>
          <tr v-for="c in CHECKS" :key="c[0]"><td>{{ c[0] }}</td><td>{{ c[1] }}</td></tr>
        </tbody>
      </table>
      <p class="muted note">Khóa nối: batch_id → payout_id → bank_txn_ref → invoice_no / tax_cert_no</p>
    </div>
  </div>
</template>

<style scoped>
.recon { display: flex; flex-direction: column; gap: 20px; }
.recon-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.muted { color: var(--text-muted); font-size: 0.85rem; }
.mono { font-family: var(--font-mono); font-size: 0.8rem; }
.note { margin-top: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; background: var(--bg-surface); }
th, td { padding: 7px 10px; border: 1px solid var(--border-subtle); text-align: left; white-space: nowrap; }
th { background: var(--bg-surface-subtle); font-weight: 700; }
td.num { text-align: right; font-family: var(--font-mono); }
tr.bold td { font-weight: 700; background: var(--bg-surface-subtle); }
.recon-list tbody tr { cursor: pointer; }
.recon-list tbody tr:hover { background: var(--bg-surface-subtle); }
.recon-list tbody tr.sel { background: var(--primary-glow); }
.recon-preview { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; background: var(--bg-surface); }
.preview-bar { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
.sheet-tabs { display: flex; gap: 6px; flex: 1; }
.sheet-tabs .active { border-color: var(--primary); color: var(--primary); font-weight: 700; }
.table-wrap { overflow-x: auto; }
h2, h3 { margin-bottom: 6px; }
.source-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); }
.source-bar label { font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
.seg { display: flex; gap: 6px; }
.seg .active { border-color: var(--primary); color: var(--primary); font-weight: 700; }
.err { color: var(--danger); font-size: 0.85rem; }
</style>
