<script setup>
// Màn "Đối soát thanh toán" dựng lại từ docs/man-01-doi-soat-thanh-toan.html của BE, nhưng nối dữ liệu thật.
// Mỗi khối có nhãn "🔌 API ← bảng" cho biết nối API nào và dữ liệu đọc từ bảng nào.
import { computed, ref } from 'vue';
import { sessions, signIn, getPaymentReconciliation, listVnpayIpnLogs } from '../api.js';
import AllFieldsTable from './AllFieldsTable.vue';

const open = ref(false);
const adm = sessions.admin;
adm.clientId = adm.clientId || 'user';
const err = ref('');
const busy = ref(false);
const report = ref(null);
const loadedAt = ref(null);
const tab = ref('paid');
const q = ref('');
const logs = ref(null); // { txnRef, rows, err }
const logBusy = ref(false);

const TABS = [
  { key: 'paid', field: 'paidOrdersWithoutFulfillment', label: 'Đã thanh toán, chưa giao', title: 'Đơn đã thanh toán nhưng chưa giao', crit: true,
    sql: 'payment_orders: status=SUCCESS AND provider=VNPAY AND fulfillment_status IN (PENDING, PROCESSING, FAILED)' },
  { key: 'unpaid', field: 'fulfilledOrdersWithoutPaidStatus', label: 'Đã giao, chưa thanh toán', title: 'Đã giao nhưng chưa thanh toán',
    sql: 'payment_orders: fulfillment_status=FULFILLED AND status<>SUCCESS' },
  { key: 'reversal', field: 'providerReversalsAfterSuccess', label: 'VNPAY đảo sau thành công', title: 'VNPAY đảo giao dịch sau khi thành công',
    sql: 'payment_orders JOIN vnpay_ipn_logs: o.status=SUCCESS AND l.outcome=PROVIDER_REVERSAL_REPORTED' },
  { key: 'late', field: 'providerSuccessAfterFailedOrder', label: 'VNPAY báo thành công sau thất bại', title: 'VNPAY báo thành công cho đơn đã thất bại',
    sql: 'payment_orders JOIN vnpay_ipn_logs: o.status=FAILED AND l.outcome=PROVIDER_SUCCESS_AFTER_FAILURE' },
];
const PURPOSE = {
  CART_CHECKOUT: 'Thanh toán giỏ hàng', COMMITMENT_TEMPLATE_PURCHASE: 'Mẫu cam kết', VOUCHER_PURCHASE: 'Voucher',
  MEMBERSHIP_PURCHASE: 'Hội viên', REVIVAL_CARD_PURCHASE: 'Thẻ hồi sinh',
};
const PAY_LABEL = { SUCCESS: ['Thành công', 'good'], FAILED: ['Thất bại', 'bad'], EXPIRED: ['Hết hạn', 'wait'], PENDING: ['Đang chờ thanh toán', 'blue'] };
const FUL_LABEL = { FULFILLED: ['Đã giao', 'good'], CANCELLED: ['Đã hủy', ''], FAILED: ['Thất bại', 'bad'], PENDING: ['Đang chờ', 'blue'], PROCESSING: ['Đang xử lý', 'blue'] };

const cur = computed(() => TABS.find((t) => t.key === tab.value));
const list = computed(() => {
  const arr = report.value?.[cur.value.field] || [];
  const s = q.value.toLowerCase().trim();
  return arr.filter((x) => !s || `${x.orderId} ${x.txnRef} ${x.purpose}`.toLowerCase().includes(s));
});
const countOf = (t) => (report.value?.[t.field] || []).length;
const byStatus = (s) => (report.value?.ordersByStatus || []).find((x) => x.status === s);
const money = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;
const pad = (n) => String(n ?? 0).padStart(2, '0');
const when = computed(() => (loadedAt.value ? new Date(report.value?.generatedAt || loadedAt.value).toLocaleString('vi-VN') : '—'));

async function login() {
  err.value = '';
  busy.value = true;
  try {
    await signIn(adm);
    await refresh();
  } catch (e) {
    err.value = `${e.code || ''} ${e.message || e}`.trim();
  } finally {
    busy.value = false;
  }
}
async function refresh() {
  err.value = '';
  busy.value = true;
  try {
    report.value = await getPaymentReconciliation(adm);
    loadedAt.value = Date.now();
  } catch (e) {
    err.value = `${e.code || ''} ${e.message || e}`.trim();
  } finally {
    busy.value = false;
  }
}
async function showLogs(row) {
  logs.value = { txnRef: row.txnRef, rows: [], err: '' };
  logBusy.value = true;
  try {
    const res = await listVnpayIpnLogs(adm, { txnRef: row.txnRef, limit: 50 });
    logs.value.rows = Array.isArray(res) ? res : res?.data || [];
  } catch (e) {
    logs.value.err = `${e.code || ''} ${e.message || e}`.trim();
  } finally {
    logBusy.value = false;
  }
}
function pick(k) { tab.value = k; q.value = ''; logs.value = null; }
</script>

<template>
  <button class="rs-fab" @click="open = !open">💳 Đối soát thanh toán</button>
  <div v-if="open" class="pr">
    <div class="app">
      <aside>
        <div class="brand"><div class="brand-mark">T</div><div><strong>TrustWow</strong><small>FINANCE CONSOLE</small></div></div>
        <div>
          <div class="nav-label">Điều hành</div>
          <nav class="nav">
            <a href="#" class="todo" @click.prevent><span>Tổng quan<span class="src">chưa dựng · gợi ý: GET /web/admin/finance/ledger/integrity</span></span></a>
            <a href="#" class="active" @click.prevent><span>Đối soát thanh toán<span class="src">GET /web/admin/payments/reconciliation</span></span></a>
            <a href="#" @click.prevent="showLogs({ txnRef: '' })"><span>IPN logs<span class="src">GET /web/admin/payments/ipn-logs ← vnpay_ipn_logs</span></span></a>
            <a href="#" class="todo" @click.prevent><span>Sổ cái<span class="src">đã có: nút "Tổng quan" / Stage 7 · GET .../finance/ledger/journals</span></span></a>
            <a href="#" class="todo" @click.prevent><span>Quyết toán VNPAY<span class="src">đã có: Stage 7 · GET/POST .../ledger/vnpay-settlements ← finance_treasury_settlements</span></span></a>
            <a href="#" class="todo" @click.prevent><span>Chi trả<span class="src">đã có: Stage 5/6 · .../finance/payouts ← finance_payouts</span></span></a>
            <div class="divider"></div>
            <a href="#" class="todo" @click.prevent><span>Nguồn doanh thu<span class="src">đã có: tab Cấu hình · .../finance/revenue-sources ← finance_revenue_sources</span></span></a>
            <a href="#" class="todo" @click.prevent><span>Loại phí &amp; thuế<span class="src">đã có: tab Cấu hình · ← finance_charge_types</span></span></a>
            <a href="#" class="todo" @click.prevent><span>Xuất thuế khấu trừ<span class="src">đã có: 🧾 Đối soát &amp; Chứng từ · POST .../tax-exports</span></span></a>
          </nav>
        </div>
        <div class="sidebar-bottom"><div class="avatar">KT</div><div><b>Phòng kế toán</b><small>FinancePaymentsRead</small></div></div>
      </aside>
      <main>
        <div class="topbar"><div>Quản trị / <strong>Tài chính</strong> / Đối soát thanh toán</div>
          <div class="right"><span class="env"><i></i> {{ report ? (report.healthy ? 'Sổ cân đối (healthy)' : 'CÓ SAI LỆCH (healthy=false)') : 'Chưa tải' }}</span><button class="btn" @click="open = false">Đóng</button></div></div>
        <div class="content">
          <div class="login">
            <label>Tài khoản admin <input v-model="adm.identifier" placeholder="email / sđt" autocomplete="username" /></label>
            <label>Mật khẩu <input v-model="adm.password" type="password" autocomplete="current-password" @keyup.enter="login" /></label>
            <button class="btn btn-primary" :disabled="!adm.identifier || !adm.password || busy" @click="login">{{ adm.accessToken ? 'Đăng nhập lại' : 'Đăng nhập admin' }}</button>
            <span v-if="adm.accessToken" style="color:#1d675d;font-weight:700">đã đăng nhập</span>
            <span class="src">cần quyền FinancePaymentsRead · tài khoản dev: tw1@yopmail.com</span>
          </div>
          <p v-if="err" class="err">{{ err }}</p>

          <header class="heading">
            <div><div class="eyebrow">Kiểm soát giao dịch · 01</div><h1>Đối soát thanh toán</h1>
              <p>Theo dõi chênh lệch giữa trạng thái thanh toán, giao hàng và phản hồi từ VNPAY. Các khoản bất thường được đưa lên đầu để kiểm tra.</p>
              <span class="src">🔌 <b>GET /web/admin/payments/reconciliation</b> ← bảng <b>payment_orders</b>, <b>vnpay_ipn_logs</b> (không phải số minh hoạ)</span></div>
            <div class="heading-actions"><span class="snapshot">Dữ liệu lúc <b>{{ when }}</b></span>
              <button class="btn" :disabled="!adm.accessToken || busy" @click="refresh">Làm mới</button></div>
          </header>

          <template v-if="report">
            <div v-if="countOf(TABS[0]) || countOf(TABS[1]) || countOf(TABS[2]) || countOf(TABS[3])" class="incident">
              <div class="incident-main"><div class="incident-icon">!</div><div>
                <strong>Cần điều tra {{ countOf(TABS[0]) }} đơn đã thanh toán nhưng chưa giao<template v-if="countOf(TABS[1])"> · {{ countOf(TABS[1]) }} đơn giao khi chưa thanh toán</template><template v-if="countOf(TABS[2])"> · {{ countOf(TABS[2]) }} VNPAY đảo</template><template v-if="countOf(TABS[3])"> · {{ countOf(TABS[3]) }} VNPAY thành công sau thất bại</template></strong>
                <span>healthy = {{ report.healthy }} (false khi bất kỳ nhóm nào trong 4 tab có dòng)</span></div></div>
              <button type="button" @click="document.getElementById('pr-alerts')?.scrollIntoView({ behavior: 'smooth' })">Xem sai lệch ↓</button>
            </div>
            <div v-else class="incident" style="background:#e5f3ee;border-color:#bfe0d3;border-left-color:#4c9b78"><div class="incident-main"><div class="incident-icon" style="background:#cfe9de;color:#1d675d">✓</div><div><strong style="color:#1d675d">Không có sai lệch</strong><span>healthy = true</span></div></div></div>

            <section class="kpis">
              <div class="kpi danger"><label>Đã thanh toán, chưa giao</label><div class="value">{{ pad(countOf(TABS[0])) }}</div><small>Ưu tiên kiểm tra fulfillment</small>
                <span class="src">paidOrdersWithoutFulfillment.length</span></div>
              <div class="kpi warning"><label>Đơn chưa ghi nhận quá 1 giờ</label><div class="value">{{ report.unsettledOrdersOlderThanOneHour }}</div><small>Cần kiểm tra IPN / QueryDR</small>
                <span class="src">unsettledOrdersOlderThanOneHour ← payment_orders status IN (PENDING, EXPIRED), created_at &lt; now()-1h</span></div>
              <div class="kpi"><label>Đơn thanh toán thành công</label><div class="value">{{ byStatus('SUCCESS')?.count ?? 0 }}</div><small>Theo trạng thái thanh toán</small>
                <span class="src">ordersByStatus[SUCCESS].count</span></div>
              <div class="kpi"><label>Giá trị đơn thành công</label><div class="value">{{ Number(byStatus('SUCCESS')?.totalVnd || 0).toLocaleString('vi-VN') }} <span style="font-size:13px">₫</span></div><small>Tổng tiền đơn, chưa trừ phí cổng</small>
                <span class="src">ordersByStatus[SUCCESS].totalVnd ← SUM(payment_orders.amount_vnd)</span></div>
            </section>

            <div class="section-head" id="pr-alerts"><div><h2>Danh sách sai lệch</h2><p>Chọn nhóm để xem các giao dịch cần điều tra.</p></div><span class="aside-note">Dữ liệu đối chiếu theo từng đơn thanh toán</span></div>
            <section class="panel">
              <div class="tabs">
                <button v-for="t in TABS" :key="t.key" type="button" :class="['tab', { active: tab === t.key, critical: t.crit }]" @click="pick(t.key)">{{ t.label }} <span class="count">{{ countOf(t) }}</span></button>
              </div>
              <div class="table-toolbar"><div><b>{{ cur.title }}</b><small>{{ countOf(cur) ? `${countOf(cur)} giao dịch cần kiểm tra.` : 'Không có giao dịch sai lệch trong nhóm này.' }}</small>
                <span class="src">🔌 {{ cur.field }} ← {{ cur.sql }}</span></div>
                <label class="search"><input v-model="q" type="search" placeholder="Tìm mã đơn hoặc Txn ref" /></label></div>
              <div class="table-wrap"><table>
                <thead><tr><th style="width:16%">Mã đơn<div class="src">orderId ← payment_orders.id</div></th><th style="width:34%">Txn ref<div class="src">txnRef ← payment_orders.app_trans_id</div></th><th style="width:28%">Mục đích<div class="src">purpose ← payment_orders.purpose</div></th><th style="width:22%;text-align:right">Điều tra</th></tr></thead>
                <tbody>
                  <tr v-if="!list.length"><td colspan="4"><div class="empty"><strong>{{ q ? 'Không tìm thấy giao dịch' : 'Không có sai lệch' }}</strong>{{ q ? 'Thử mã đơn hoặc Txn ref khác.' : 'Nhóm này hiện không có đơn cần điều tra.' }}</div></td></tr>
                  <tr v-for="x in list" :key="x.orderId">
                    <td class="mono id">Đơn {{ x.orderId }}</td><td class="mono">{{ x.txnRef }}</td>
                    <td><span :class="['purpose', { cart: x.purpose === 'CART_CHECKOUT' }]">{{ PURPOSE[x.purpose] || x.purpose || '—' }}</span> <span class="mono" style="color:#8a989c">{{ x.purpose }}</span></td>
                    <td style="text-align:right"><button class="row-action" type="button" @click="showLogs(x)">Xem IPN logs →</button>
                      <div class="src">GET /web/admin/payments/ipn-logs?txnRef=…</div></td>
                  </tr>
                </tbody></table></div>
              <div v-if="logs" class="logs">
                <h4>IPN logs của <span class="mono">{{ logs.txnRef || '(tất cả, mới nhất)' }}</span> <button class="row-action" @click="logs = null">đóng</button></h4>
                <p v-if="logBusy" class="mono">Đang tải…</p>
                <p v-if="logs.err" class="err">{{ logs.err }}</p>
                <AllFieldsTable :rows="logs.rows" title="vnpay_ipn_logs (tất cả field BE trả về)" table="vnpay_ipn_logs" :open="true" />
              </div>
              <div class="panel-foot"><span>Hiển thị {{ list.length }} giao dịch</span><span>Dữ liệu thật từ BE, không rút gọn</span></div>
            </section>

            <div class="lower">
              <section class="panel"><div class="summary-head"><h3>Trạng thái thanh toán</h3><small>Số đơn · Tổng tiền</small></div>
                <span class="src hdr">ordersByStatus ← payment_orders GROUP BY status (provider=VNPAY)</span>
                <div class="summary-table"><table><thead><tr><th>Trạng thái</th><th class="num">Số đơn</th><th class="num">Tổng tiền</th></tr></thead><tbody>
                  <tr v-for="s in report.ordersByStatus" :key="s.status"><td><span :class="['status', PAY_LABEL[s.status]?.[1]]">{{ PAY_LABEL[s.status]?.[0] || s.status }}</span> <span class="mono" style="color:#8a989c">{{ s.status }}</span></td><td class="num">{{ s.count }}</td><td class="num">{{ money(s.totalVnd) }}</td></tr>
                </tbody></table></div></section>
              <section class="panel"><div class="summary-head"><h3>Trạng thái giao hàng</h3><small>Số đơn · Tổng tiền</small></div>
                <span class="src hdr">ordersByFulfillmentStatus ← payment_orders GROUP BY fulfillment_status</span>
                <div class="summary-table"><table><thead><tr><th>Trạng thái</th><th class="num">Số đơn</th><th class="num">Tổng tiền</th></tr></thead><tbody>
                  <tr v-for="s in report.ordersByFulfillmentStatus" :key="s.status"><td><span :class="['status', FUL_LABEL[s.status]?.[1]]">{{ FUL_LABEL[s.status]?.[0] || s.status }}</span> <span class="mono" style="color:#8a989c">{{ s.status }}</span></td><td class="num">{{ s.count }}</td><td class="num">{{ money(s.totalVnd) }}</td></tr>
                </tbody></table></div></section>
            </div>
            <AllFieldsTable :rows="[Object.fromEntries(Object.entries(report).filter(([k, v]) => !Array.isArray(v)))]" title="Report (các field đơn lẻ)" table="payment_orders + vnpay_ipn_logs" />
          </template>
          <p v-else class="note">Đăng nhập admin rồi bấm "Làm mới" để tải dữ liệu thật.</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
.pr{--ink:#183144;--ink-2:#355062;--muted:#71818a;--paper:#f5f7f6;--panel:#fff;--line:#dce4e2;--line-2:#eaf0ed;--green:#1d675d;--green-soft:#e5f3ee;--red:#aa3d3d;--red-soft:#fcecec;--amber:#9a621c;--amber-soft:#fff3df;--blue-soft:#e9f1f7;--shadow:0 10px 30px rgba(25,49,56,.035)}.pr *{box-sizing:border-box}.pr{font-size:14px;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;position:fixed;inset:0;z-index:9800;overflow:auto}.pr button,.pr input{font:inherit}.pr button{cursor:pointer}.pr button:focus-visible,.pr input:focus-visible{outline:3px solid #79aba0;outline-offset:2px}.pr .app{min-height:100vh;display:grid;grid-template-columns:244px minmax(0,1fr)}.pr aside{background:#173044;color:#dbe6e9;min-height:100vh;border-right:1px solid #244357;padding:24px 14px;display:flex;flex-direction:column;gap:23px}.pr .brand{display:flex;align-items:center;gap:10px;padding:3px 12px 19px;border-bottom:1px solid rgba(255,255,255,.13)}.pr .brand-mark{height:31px;width:31px;border-radius:8px;background:#d7e7d4;color:#173044;display:grid;place-items:center;font-family:Georgia,serif;font-size:23px;font-weight:bold;line-height:1}.pr .brand strong{font-size:16px;letter-spacing:-.03em;color:#fff}.pr .brand small{display:block;color:#9db4be;font-size:10px;letter-spacing:.16em;font-weight:700;margin-top:3px}.pr .nav-label{font-size:10px;letter-spacing:.16em;color:#89a5b2;font-weight:800;text-transform:uppercase;margin:0 12px 10px}.pr .nav{display:grid;gap:4px}.pr .nav a{display:flex;align-items:center;gap:11px;color:#bbd0d8;text-decoration:none;padding:10px 12px;border-radius:7px;font-size:12px;font-weight:600;line-height:1.25}.pr .nav a:hover{background:rgba(255,255,255,.07);color:#fff}.pr .nav a.active{background:#e5f2ec;color:#175248;box-shadow:inset 3px 0 #76ad89}.pr .nav svg{width:16px;height:16px;flex:none;stroke-width:1.8}.pr .nav .divider{height:1px;background:rgba(255,255,255,.1);margin:10px 11px}.pr .sidebar-bottom{margin-top:auto;border-top:1px solid rgba(255,255,255,.12);padding:15px 12px 0;display:flex;gap:10px;align-items:center}.pr .avatar{height:31px;width:31px;display:grid;place-items:center;border-radius:50%;background:#426779;color:#fff;font-weight:700;font-size:11px}.pr .sidebar-bottom b{display:block;font-size:11px;color:white}.pr .sidebar-bottom small{font-size:10px;color:#9bb5bf}.pr main{min-width:0}.pr .topbar{height:56px;border-bottom:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 34px;color:#68808a;font-size:11px}.pr .topbar strong{color:var(--ink-2)}.pr .topbar .right{display:flex;align-items:center;gap:15px}.pr .env{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:20px;padding:5px 9px;color:var(--ink-2);font-weight:700;font-size:10px}.pr .env i{width:6px;height:6px;background:#68a586;border-radius:50%}.pr .content{max-width:1480px;margin:auto;padding:28px 34px 50px}.pr .heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.pr .eyebrow{color:#55766f;font-size:10px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;margin:0 0 9px}.pr .heading h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:30px;letter-spacing:-.035em;font-weight:700}.pr .heading p{margin:7px 0 0;color:var(--muted);font-size:12px;max-width:640px;line-height:1.5}.pr .heading-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}.pr .snapshot{border:1px solid var(--line);background:#fff;border-radius:7px;padding:8px 11px;color:var(--ink-2);font-size:11px;white-space:nowrap}.pr .btn{border:1px solid #bfd0cf;background:#fff;color:var(--ink);padding:9px 13px;border-radius:7px;font-size:11px;font-weight:750;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;min-height:34px}.pr .btn:hover{background:#f2f6f4}.pr .btn svg{width:14px;height:14px}.pr .btn-primary{background:var(--ink);color:#fff;border-color:var(--ink)}.pr .btn-primary:hover{background:#2b4b5c}.pr .incident{background:var(--red-soft);border:1px solid #ecc9c6;border-left:4px solid #c85d52;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 17px;margin-bottom:18px}.pr .incident-main{display:flex;align-items:center;gap:12px}.pr .incident-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#f5d8d6;color:#a83c36;font-size:17px;font-weight:800}.pr .incident strong{display:block;color:#8c342f;font-size:12px}.pr .incident span{display:block;color:#865a57;font-size:11px;margin-top:3px}.pr .incident button{border:0;background:none;color:#9c3730;font-size:11px;font-weight:800;white-space:nowrap;padding:5px 0}.pr .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin-bottom:23px}.pr .kpi{background:var(--panel);border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow);padding:16px 18px 14px;min-height:104px;position:relative;overflow:hidden}.pr .kpi:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:#acc8bd}.pr .kpi.warning:before{background:#dfaa67}.pr .kpi.danger:before{background:#d58a83}.pr .kpi label{display:block;font-size:11px;color:#61747c;font-weight:650}.pr .kpi .value{margin-top:13px;font-family:Georgia,"Times New Roman",serif;font-size:27px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}.pr .kpi.danger .value{color:var(--red)}.pr .kpi.warning .value{color:var(--amber)}.pr .kpi small{display:block;margin-top:7px;color:#8a989c;font-size:10px}.pr .section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:0 0 12px}.pr .section-head h2{font-size:16px;letter-spacing:-.015em;margin:0;font-family:Georgia,"Times New Roman",serif}.pr .section-head p{margin:5px 0 0;color:var(--muted);font-size:11px}.pr .section-head .aside-note{font-size:10px;color:#87979b}.pr .panel{background:#fff;border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow);overflow:hidden}.pr .tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--line);padding:0 17px}.pr .tab{border:0;border-bottom:2px solid transparent;background:transparent;color:#667980;padding:14px 12px 11px;white-space:nowrap;font-size:11px;font-weight:720}.pr .tab.active{color:var(--green);border-bottom-color:var(--green)}.pr .count{display:inline-block;font-size:10px;padding:2px 6px;margin-left:4px;border-radius:12px;background:#ecf1ef;color:#667b77}.pr .tab.active .count{background:#dceee6;color:var(--green)}.pr .tab.critical .count{background:#f8e2df;color:#a6413a}.pr .table-toolbar{padding:13px 17px;display:flex;align-items:center;justify-content:space-between;gap:15px}.pr .table-toolbar b{display:block;font-size:12px}.pr .table-toolbar small{display:block;color:var(--muted);font-size:10px;margin-top:4px}.pr .search{display:flex;align-items:center;gap:7px;width:250px;border:1px solid var(--line);border-radius:6px;background:#fafcfb;padding:0 10px;height:32px;color:#8a999c}.pr .search svg{width:13px;height:13px}.pr .search input{border:0;background:transparent;outline:0;width:100%;min-width:0;color:var(--ink);font-size:11px}.pr .search input::placeholder{color:#a1adaf}.pr .table-wrap{overflow:auto}.pr table{width:100%;border-collapse:collapse;font-size:11px}.pr th{text-align:left;background:#f8faf9;color:#657880;font-size:10px;letter-spacing:.035em;font-weight:800;padding:10px 17px;border-top:1px solid var(--line-2);border-bottom:1px solid var(--line)}.pr td{padding:10px 17px;border-bottom:1px solid var(--line-2);color:#334d5a}.pr tbody tr:last-child td{border-bottom:0}.pr tbody tr:hover{background:#fbfcfb}.pr .mono{font-family:"SFMono-Regular",Consolas,Menlo,monospace;font-size:10px;font-variant-numeric:tabular-nums}.pr .id{font-weight:800;color:#2f5160}.pr .purpose{display:inline-block;background:#e9f0ee;color:#3a695d;border-radius:4px;padding:4px 7px;font-size:10px;font-weight:700}.pr .purpose.cart{background:#edf0f6;color:#4c6285}.pr .row-action{font-size:10px;color:var(--green);font-weight:800;background:none;border:0;padding:3px 0}.pr .row-action:hover{text-decoration:underline}.pr .empty{padding:40px;text-align:center;color:var(--muted);font-size:11px}.pr .empty strong{display:block;color:var(--ink);font-size:13px;margin-bottom:5px}.pr .panel-foot{padding:10px 17px;border-top:1px solid var(--line);font-size:10px;color:#899a9d;display:flex;justify-content:space-between;gap:10px}.pr .lower{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:23px}.pr .summary-head{padding:17px 18px 12px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline}.pr .summary-head h3{margin:0;font-size:13px;font-family:Georgia,"Times New Roman",serif}.pr .summary-head small{font-size:10px;color:var(--muted)}.pr .summary-table{padding:4px 16px 12px}.pr .summary-table table th{padding:10px 8px;border-top:0;background:#fff}.pr .summary-table table td{padding:12px 8px}.pr .summary-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:750}.pr .status{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:740}.pr .status:before{content:"";width:6px;height:6px;border-radius:50%;background:#b5c2c0}.pr .status.good:before{background:#4c9b78}.pr .status.bad:before{background:#d06960}.pr .status.wait:before{background:#d4a14d}.pr .status.blue:before{background:#6a95b5}.pr .summary-table .total{font-weight:800;color:var(--ink)}.pr .note{margin-top:14px;color:#87979a;font-size:10px;line-height:1.5}.pr .toast{position:fixed;bottom:20px;right:20px;background:#173044;color:#fff;padding:10px 14px;border-radius:7px;box-shadow:0 10px 35px rgba(0,0,0,.15);font-size:11px;opacity:0;transform:translateY(10px);transition:.2s;pointer-events:none}.pr .toast.show{opacity:1;transform:none}@media(max-width:1120px){.pr .app{grid-template-columns:65px minmax(0,1fr)}.pr aside{padding:20px 8px}.pr .brand{padding:2px 7px 18px}.pr .brand strong,.pr .brand small,.pr .nav-label,.pr .nav span,.pr .sidebar-bottom b,.pr .sidebar-bottom small{display:none}.pr .nav a{justify-content:center;padding:11px}.pr .sidebar-bottom{justify-content:center;padding:14px 0 0}.pr .content{padding:25px}.pr .topbar{padding:0 25px}.pr .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.pr .app{display:block}.pr aside{display:none}.pr .topbar{height:45px;padding:0 17px}.pr .topbar .right .env{display:none}.pr .content{padding:20px 14px}.pr .heading{display:block}.pr .heading h1{font-size:27px}.pr .heading-actions{justify-content:flex-start;margin-top:16px}.pr .incident{align-items:flex-start}.pr .incident button{display:none}.pr .kpis{gap:8px}.pr .kpi{padding:13px;min-height:94px}.pr .kpi .value{font-size:23px}.pr .lower{grid-template-columns:1fr}.pr .section-head .aside-note{display:none}.pr .tabs{padding:0 8px}.pr .tab{padding:12px 9px;font-size:10px}.pr .table-toolbar{display:block}.pr .search{width:100%;margin-top:12px}.pr .table-wrap{overflow:auto}.pr .table-wrap table{min-width:620px}.pr .panel-foot{display:block}.pr .panel-foot span{display:block;margin-top:4px}}
.pr .src{display:inline-block;margin-top:5px;background:#eef2ff;color:#3730a3;border:1px dashed #a5b4fc;border-radius:5px;padding:2px 7px;font-size:9.5px;font-family:Menlo,monospace;line-height:1.5;white-space:normal}
.pr .src b{color:#1e1b4b}
.pr .src.hdr{display:block;margin:0 17px 10px}
.pr .login{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px}
.pr .login label{display:flex;flex-direction:column;gap:3px;color:#61747c;font-weight:650}
.pr .login input{border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-size:11px;width:200px}
.pr .err{background:var(--red-soft);color:var(--red);border:1px solid #ecc9c6;border-radius:7px;padding:8px 12px;font-size:11px;margin-bottom:12px}
.pr .logs{padding:14px 17px;border-top:1px solid var(--line);background:#fafcfb}
.pr .logs h4{margin:0 0 8px;font-size:12px}
.pr .nav a.todo{opacity:.55}
.pr .nav a .src{background:rgba(255,255,255,.1);color:#bbd0d8;border-color:rgba(255,255,255,.25);display:block;margin:3px 0 0}
.pr .nav a{align-items:flex-start}

</style>
