<script setup>
import { computed, onMounted, ref } from 'vue';
import { lineage, redirect, refreshInfo, reload, replay, resetFlow, setEnabled, setRedirect } from '../lineageStore.js';

const open = ref(false);
const tab = ref('timeline');
const onlyWrites = ref(true);
const showOthers = ref(false);
onMounted(() => {
  refreshInfo(); setInterval(refreshInfo, 15000);
  const q = new URLSearchParams(location.search).get('lineage-replay');
  if (q) { open.value = true; showOthers.value = true; replay(Number(q)); }
});

const entries = computed(() => lineage.entries.filter((e) => !onlyWrites.value || e.write));
const fmt = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const vnd = (n) => (n === null || n === undefined ? '' : BigInt(n).toLocaleString('en-US'));
const rel = (list) => list.filter((x) => x.related);
const oth = (list) => list.filter((x) => !x.related);
const counts = (t) => ({ ins: rel(t.inserted).length, upd: rel(t.updated).length, oIns: oth(t.inserted).length, oUpd: oth(t.updated).length });
const badge = (s) => (s >= 200 && s < 300 ? 'ok' : 'bad');

// ----- ledger / tax analysis (everything derived from the real journal rows)
const B = (x) => BigInt(x ?? 0);
const halfUp = (num, den) => (2n * num + den) / (2n * den);
function findRates(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out;
  if (Array.isArray(node)) { node.forEach((x) => findRates(x, out, depth + 1)); return out; }
  if (typeof node.rateBps === 'number' && (node.calculatedAmountVnd !== undefined || node.amountVnd !== undefined)) out.push(node);
  Object.values(node).forEach((v) => findRates(v, out, depth + 1));
  return out;
}
function analyze(j) {
  const lines = j.lines || [];
  const dr = lines.filter((l) => l.side === 'DEBIT').reduce((a, l) => a + B(l.amount), 0n);
  const cr = lines.filter((l) => l.side === 'CREDIT').reduce((a, l) => a + B(l.amount), 0n);
  const sum = (code) => lines.filter((l) => l.account === code && l.side === 'CREDIT').reduce((a, l) => a + B(l.amount), 0n);
  const checks = [{ label: 'Σ Nợ = Σ Có', ok: dr === cr, detail: `${vnd(dr)} vs ${vnd(cr)}` }];
  const snap = j.calculation_snapshot;
  const split = [];
  if (j.event_type === 'FULFILLMENT_RECOGNIZED' && dr > 0n) {
    const parts = [['Người bán nhận', sum('CREATOR_PAYABLE') + sum('MERCHANT_PAYABLE')], ['Phí sàn (hoa hồng)', sum('PLATFORM_COMMISSION_REVENUE')],
      ['Thuế khấu trừ (VAT + TNCN)', sum('TAX_WITHHOLDING_PAYABLE') + sum('CREATOR_VAT_WITHHOLDING_PAYABLE') + sum('MERCHANT_VAT_WITHHOLDING_PAYABLE')], ['Affiliate', sum('AFFILIATE_PAYABLE')]];
    for (const [label, amt] of parts) split.push({ label, amt, pct: Number((amt * 10000n) / dr) / 100 });
    for (const r of findRates(snap)) {
      const actual = B(r.calculatedAmountVnd ?? r.amountVnd);
      const basis = r.basisAmountVnd !== undefined ? B(r.basisAmountVnd) : dr;
      const expected = halfUp(basis * B(r.rateBps), 10000n);
      checks.push({ label: `${r.chargeCode ?? 'charge'} ${r.rateBps / 100}% trên ${vnd(basis)}`, ok: expected === actual, detail: `kỳ vọng ${vnd(expected)} · ghi ${vnd(actual)}` });
    }
  }
  if (j.event_type === 'MEMBERSHIP_SALE_RECOGNIZED' && snap?.vatRateBps !== undefined) {
    const g = B(snap.grossAmountVnd); const r = B(snap.vatRateBps); const d = 10000n + r;
    const vat = (2n * g * r + d) / (2n * d);
    checks.push({ label: `VAT ${Number(r) / 100}% bóc từ giá đã gồm thuế`, ok: vat === B(snap.vatAmountVnd) && g - vat === B(snap.netAmountVnd), detail: `kỳ vọng VAT ${vnd(vat)} / hoãn ${vnd(g - vat)} · ghi VAT ${vnd(snap.vatAmountVnd)} / hoãn ${vnd(snap.netAmountVnd)}` });
    split.push({ label: 'VAT đầu ra', amt: B(snap.vatAmountVnd), pct: Number((B(snap.vatAmountVnd) * 10000n) / g) / 100 }, { label: 'Doanh thu hoãn (TK 3387)', amt: B(snap.netAmountVnd), pct: Number((B(snap.netAmountVnd) * 10000n) / g) / 100 });
  }
  return { dr, cr, checks, split };
}
const journalsOf = (e) => (e.data?.journals || []).filter((j) => showOthers.value || j.related);

// ----- matrix view
const matrixTables = computed(() => {
  const s = new Set();
  entries.value.forEach((e) => (e.data?.tables || []).forEach((t) => { if (counts(t).ins + counts(t).upd > 0 || showOthers.value) s.add(t.table); }));
  return [...s];
});
const cell = (e, name) => { const t = (e.data?.tables || []).find((x) => x.table === name); return t ? counts(t) : null; };
const copy = (v) => navigator.clipboard?.writeText(JSON.stringify(v, null, 2));
</script>

<template>
  <div class="ld-root">
    <button class="ld-toggle" @click="open = !open">
      Dòng chảy dữ liệu <span class="ld-count">{{ lineage.entries.filter((e) => e.write).length }}</span>
      <span v-if="lineage.serverOk === false" class="ld-warn">server tắt</span>
    </button>
    <a v-if="redirect.blockedUrl" class="ld-pay" :href="redirect.blockedUrl" target="_blank" rel="noopener" @click="redirect.blockedUrl = ''">Trình duyệt chặn popup — bấm để sang VNPay</a>
    <div v-if="open" class="ld-panel">
      <div class="ld-head">
        <b>Dòng chảy dữ liệu theo từng API</b>
        <span class="ld-muted" v-if="lineage.info">đọc DB (chỉ đọc): {{ lineage.info.database }}@{{ lineage.info.host }}</span>
        <span class="ld-spacer" />
        <label><input type="checkbox" :checked="redirect.enabled" @change="setRedirect($event.target.checked)" /> tự mở VNPay</label>
        <label><input type="checkbox" :checked="lineage.enabled" @change="setEnabled($event.target.checked)" /> bật ghi</label>
        <label><input type="checkbox" v-model="onlyWrites" /> chỉ API ghi</label>
        <label><input type="checkbox" v-model="showOthers" /> hiện dòng của người khác</label>
        <button @click="replay(60)" title="Xem dữ liệu đã có, không gọi API">Xem lại 60 phút</button>
        <button @click="resetFlow">Luồng mới</button>
        <button @click="open = false">Đóng</button>
      </div>
      <div v-if="lineage.serverOk === false" class="ld-err">Lineage server chưa chạy. Chạy <code>npm run lineage</code> (port 5197). Gọi API vẫn hoạt động bình thường.</div>
      <p class="ld-muted ld-note">
        "Liên quan" = dòng gắn với đơn/payout/tài khoản của các API bạn vừa gọi (heuristic theo id, txnRef, user). DB dùng chung với teammate nên có thể có dòng của người khác ghi cùng lúc; chúng bị ẩn mặc định.
      </p>
      <div class="ld-tabs">
        <button :class="{ on: tab === 'timeline' }" @click="tab = 'timeline'">Từng API</button>
        <button :class="{ on: tab === 'matrix' }" @click="tab = 'matrix'">Ma trận luồng (API × bảng)</button>
      </div>

      <div v-if="tab === 'matrix'" class="ld-scroll">
        <table class="ld-matrix">
          <thead><tr><th>API (cũ → mới)</th><th v-for="t in matrixTables" :key="t"><span class="v">{{ t }}</span></th></tr></thead>
          <tbody>
            <tr v-for="e in [...entries].reverse()" :key="e.id">
              <td><span class="m">{{ e.method }}</span> {{ e.path }} <span :class="['pill', badge(e.status)]">{{ e.status }}</span></td>
              <td v-for="t in matrixTables" :key="t">
                <template v-if="cell(e, t)">
                  <span v-if="cell(e, t).ins" class="pill ins">+{{ cell(e, t).ins }}</span>
                  <span v-if="cell(e, t).upd" class="pill upd">~{{ cell(e, t).upd }}</span>
                  <span v-if="showOthers && (cell(e, t).oIns || cell(e, t).oUpd)" class="pill oth">±{{ cell(e, t).oIns + cell(e, t).oUpd }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="ld-muted">+n dòng mới · ~n dòng sửa · ± dòng của người khác</p>
      </div>

      <div v-else class="ld-scroll">
        <p v-if="!entries.length" class="ld-muted">Chưa có API ghi nào. Hãy bấm một nút trong app (đăng nhập, mua, IPN, rút tiền…).</p>
        <div v-for="e in entries" :key="e.id" class="ld-entry">
          <div class="ld-eh">
            <span class="m">{{ e.method }}</span> <b>{{ e.path }}</b>
            <span :class="['pill', badge(e.status)]">HTTP {{ e.status }}</span>
            <span class="ld-muted">{{ e.ms }}ms · {{ e.at.slice(11, 19) }}</span>
            <span class="ld-spacer" />
            <button v-if="e.ticket" @click="reload(e)">Làm mới</button>
            <button @click="copy({ request: e.reqBody, response: e.resBody, lineage: e.data })">Copy JSON</button>
          </div>

          <p v-if="e.state === 'waiting' || e.state === 'loading'" class="ld-muted">Đang đọc DB…</p>
          <p v-else-if="e.state === 'error'" class="ld-err">{{ e.error }}</p>
          <p v-else-if="e.state === 'read'" class="ld-muted">API đọc (GET): không ghi DB.</p>

          <template v-if="e.data">
            <!-- flow diagram: API -> tables in the order data was written -->
            <div class="ld-flow">
              <div class="ld-api"><b>{{ e.method }}</b><br />{{ e.path }}<br /><span :class="['pill', badge(e.status)]">{{ e.status }}</span></div>
              <template v-for="(t, i) in e.data.tables" :key="t.table">
                <div v-if="counts(t).ins + counts(t).upd > 0 || showOthers" class="ld-arrow">{{ i === 0 ? '⟶' : '→' }}</div>
                <div v-if="counts(t).ins + counts(t).upd > 0 || showOthers" :class="['ld-node', counts(t).ins + counts(t).upd === 0 ? 'faint' : '']">
                  <b>{{ t.table }}</b>
                  <div>
                    <span v-if="counts(t).ins" class="pill ins">+{{ counts(t).ins }} mới</span>
                    <span v-if="counts(t).upd" class="pill upd">~{{ counts(t).upd }} sửa</span>
                    <span v-if="showOthers && counts(t).oIns + counts(t).oUpd" class="pill oth">±{{ counts(t).oIns + counts(t).oUpd }} khác</span>
                  </div>
                </div>
              </template>
              <div v-if="!e.data.tables.some((t) => counts(t).ins + counts(t).upd > 0)" class="ld-muted">Không thấy dòng nào liên quan được ghi vào các bảng tiền đang theo dõi.</div>
            </div>

            <!-- records per table -->
            <div v-for="t in e.data.tables" :key="t.table">
              <details v-if="rel(t.inserted).length + rel(t.updated).length + (showOthers ? oth(t.inserted).length + oth(t.updated).length : 0) > 0" class="ld-table" open>
                <summary><b>{{ t.table }}</b>
                  <span v-if="counts(t).ins" class="pill ins">+{{ counts(t).ins }}</span>
                  <span v-if="counts(t).upd" class="pill upd">~{{ counts(t).upd }}</span>
                  <span v-if="t.truncated" class="ld-muted"> (cắt ở 80 dòng, tổng {{ t.insertedTotal }})</span>
                </summary>
                <div v-for="(r, i) in (showOthers ? t.inserted : rel(t.inserted))" :key="'i' + i" :class="['ld-rec', r.related ? '' : 'faint']">
                  <div class="ld-tag ins">GHI MỚI{{ r.related ? '' : ' · người khác?' }}</div>
                  <pre>{{ JSON.stringify(r.row, null, 2) }}</pre>
                </div>
                <div v-for="(r, i) in (showOthers ? t.updated : rel(t.updated))" :key="'u' + i" :class="['ld-rec', r.related ? '' : 'faint']">
                  <div class="ld-tag upd">SỬA{{ r.related ? '' : ' · người khác?' }}</div>
                  <table v-if="r.changed && r.changed.length" class="ld-diff">
                    <tr v-for="c in r.changed" :key="c"><td>{{ c }}</td><td class="old">{{ fmt(r.before[c]) }}</td><td class="new">{{ fmt(r.row[c]) }}</td></tr>
                  </table>
                  <p v-else-if="!r.before" class="ld-muted">Không có ảnh trước (dòng cũ hơn 45 phút); chỉ hiện trạng thái hiện tại.</p>
                  <pre>{{ JSON.stringify(r.row, null, 2) }}</pre>
                </div>
              </details>
            </div>

            <!-- ledger -->
            <div v-for="j in journalsOf(e)" :key="j.id" class="ld-journal">
              <div class="ld-jh"><b>Bút toán #{{ j.id }}</b> {{ j.event_type }} <span :class="['pill', j.status === 'POSTED' ? 'ok' : 'bad']">{{ j.status }}</span>
                <span class="ld-muted">{{ j.event_key }}</span></div>
              <table class="ld-dc">
                <thead><tr><th>Tài khoản</th><th>Nợ</th><th>Có</th><th>Bên</th></tr></thead>
                <tbody>
                  <tr v-for="(l, i) in j.lines" :key="i">
                    <td>{{ l.account }}</td>
                    <td class="num">{{ l.side === 'DEBIT' ? vnd(l.amount) : '' }}</td>
                    <td class="num">{{ l.side === 'CREDIT' ? vnd(l.amount) : '' }}</td>
                    <td>{{ l.partyType }}/{{ l.partyId }}</td>
                  </tr>
                </tbody>
                <tfoot><tr><td>Σ</td><td class="num">{{ vnd(analyze(j).dr) }}</td><td class="num">{{ vnd(analyze(j).cr) }}</td><td /></tr></tfoot>
              </table>
              <div v-if="analyze(j).split.length" class="ld-split">
                <b>Phân bổ tiền của giao dịch này</b>
                <div v-for="s in analyze(j).split" :key="s.label" class="ld-bar"><span class="lab">{{ s.label }}</span><span class="bar"><i :style="{ width: Math.min(100, s.pct) + '%' }" /></span><span class="num">{{ vnd(s.amt) }} ({{ s.pct }}%)</span></div>
              </div>
              <ul class="ld-checks">
                <li v-for="c in analyze(j).checks" :key="c.label" :class="c.ok ? 'ok' : 'bad'">{{ c.ok ? '✔' : '✘' }} {{ c.label }} <span class="ld-muted">{{ c.detail }}</span></li>
              </ul>
              <details><summary class="ld-muted">calculation_snapshot (thật từ DB)</summary><pre>{{ JSON.stringify(j.calculation_snapshot, null, 2) }}</pre></details>
            </div>

            <details><summary class="ld-muted">Request / Response</summary>
              <pre>{{ JSON.stringify({ request: e.reqBody, response: e.resBody }, null, 2) }}</pre></details>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.ld-root { position: fixed; right: 0; bottom: 0; z-index: 9999; font: 13px/1.4 -apple-system, 'Segoe UI', sans-serif; color: #1c2430; }
.ld-toggle { position: fixed; right: 16px; bottom: 16px; background: #14532d; color: #fff; border: 0; border-radius: 22px; padding: 10px 16px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
.ld-count { background: #2f6fed; border-radius: 9px; padding: 0 7px; margin-left: 6px; } .ld-warn { background: #d33; border-radius: 9px; padding: 0 7px; margin-left: 6px; }
.ld-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(920px, 62vw); background: #f4f6f9; box-shadow: -6px 0 24px rgba(0,0,0,.3); display: flex; flex-direction: column; }
.ld-head { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #14532d; color: #fff; flex-wrap: wrap; } .ld-head label { font-size: 12px; }
.ld-head button, .ld-eh button, .ld-tabs button { padding: 4px 10px; border: 1px solid #b8c4d8; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.ld-spacer { flex: 1; } .ld-muted { color: #6b7c96; font-size: 12px; } .ld-note { padding: 6px 14px 0; margin: 0; }
.ld-err { background: #fde8e8; color: #a11; padding: 6px 14px; margin: 6px 14px; border-radius: 4px; }
.ld-tabs { display: flex; gap: 6px; padding: 8px 14px; } .ld-tabs button.on { background: #2f6fed; color: #fff; border-color: #2f6fed; }
.ld-scroll { flex: 1; overflow: auto; padding: 0 14px 20px; }
.ld-entry { background: #fff; border: 1px solid #dde3ec; border-radius: 8px; margin-bottom: 14px; padding: 10px 12px; }
.ld-eh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .m { background: #e3ebf8; border-radius: 3px; padding: 0 6px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
.pill { display: inline-block; padding: 0 8px; border-radius: 9px; font-size: 11px; background: #ddd; margin-right: 4px; }
.pill.ok, .pill.ins { background: #c9f0d8; color: #0a6b3a; } .pill.bad { background: #fcd5d5; color: #a11; } .pill.upd { background: #ffe9a8; color: #7a5200; } .pill.oth { background: #e5e5ea; color: #555; }
.ld-flow { display: flex; align-items: stretch; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
.ld-api { background: #14532d; color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 12px; max-width: 240px; word-break: break-all; }
.ld-arrow { align-self: center; font-size: 20px; color: #2f6fed; }
.ld-node { background: #eef3fb; border: 2px solid #2f6fed; border-radius: 8px; padding: 6px 10px; font-size: 12px; } .ld-node.faint { border-color: #bbb; opacity: .6; } .ld-node b { font-family: ui-monospace, Menlo, monospace; }
.ld-table { border: 1px solid #e3e8f0; border-radius: 6px; margin: 6px 0; padding: 4px 8px; } .ld-table summary { cursor: pointer; padding: 4px 0; } .ld-table summary b { font-family: ui-monospace, Menlo, monospace; margin-right: 8px; }
.ld-rec { margin: 6px 0; border-left: 4px solid #1f9d5b; padding-left: 8px; } .ld-rec.faint { opacity: .55; border-left-color: #aaa; }
.ld-tag { font-size: 10px; font-weight: 700; letter-spacing: .5px; } .ld-tag.ins { color: #0a6b3a; } .ld-tag.upd { color: #7a5200; }
.ld-panel pre { background: #f0fdf4; color: #14301f; padding: 8px; border-radius: 6px; overflow: auto; max-height: 280px; font-size: 11.5px; margin: 4px 0; }
.ld-diff, .ld-dc, .ld-matrix { border-collapse: collapse; font-size: 12px; } .ld-diff td, .ld-dc td, .ld-dc th, .ld-matrix td, .ld-matrix th { border: 1px solid #e3e8f0; padding: 3px 8px; }
.ld-diff .old { background: #fdf0f0; text-decoration: line-through; } .ld-diff .new { background: #effaf3; font-weight: 600; }
.ld-journal { border: 1px solid #cfe3d6; background: #fbfefc; border-radius: 6px; padding: 8px 10px; margin: 8px 0; } .ld-jh { margin-bottom: 6px; }
.num { text-align: right; font-variant-numeric: tabular-nums; } .ld-dc tfoot td { font-weight: 700; background: #f0f4f8; }
.ld-split { margin: 8px 0; } .ld-bar { display: flex; align-items: center; gap: 8px; font-size: 12px; } .ld-bar .lab { width: 150px; } .ld-bar .bar { flex: 1; height: 10px; background: #e3e8f0; border-radius: 5px; overflow: hidden; } .ld-bar .bar i { display: block; height: 100%; background: #2f6fed; }
.ld-checks { list-style: none; padding: 0; margin: 6px 0; font-size: 12px; } .ld-checks .ok { color: #0a6b3a; } .ld-checks .bad { color: #a11; font-weight: 700; }
.ld-matrix th .v { writing-mode: vertical-rl; transform: rotate(180deg); font-family: ui-monospace, Menlo, monospace; font-size: 11px; white-space: nowrap; } .ld-matrix td { text-align: center; white-space: nowrap; } .ld-matrix td:first-child { text-align: left; }

/* isolate from the app's global dark theme */
.ld-root label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 400; color: inherit; justify-content: flex-start; }
.ld-root input[type='checkbox'] { width: auto; height: auto; padding: 0; box-shadow: none; margin: 0; }
.ld-root button { display: inline-block; padding: 4px 10px; background: #fff; color: #1c2430; border: 1px solid #b8c4d8; box-shadow: none; transform: none; font: 12px -apple-system, 'Segoe UI', sans-serif; border-radius: 4px; }
.ld-root button:hover:not(:disabled) { background: #eef3fb; box-shadow: none; transform: none; }
.ld-root .ld-tabs button.on { background: #2f6fed; color: #fff; border-color: #2f6fed; }
.ld-root .ld-toggle { background: #14532d; color: #fff; border: 0; border-radius: 22px; padding: 10px 16px; font-size: 13px; font-weight: 600; }
.ld-root .ld-toggle:hover:not(:disabled) { background: #15803d; }
.ld-root pre { background: #f0fdf4 !important; color: #14301f !important; margin: 4px 0; }
.ld-root table { width: auto; background: transparent; }
.ld-root th, .ld-root td { color: #1c2430; background: transparent; text-transform: none; letter-spacing: normal; font-size: 12px; }
.ld-root .ld-head, .ld-root .ld-head label, .ld-root .ld-head b { color: #fff; }
.ld-root .ld-head .ld-muted { color: #9fb2cf; }
.ld-root .ld-dc tfoot td { background: #f0f4f8; }
.ld-root .ld-diff .old { background: #fdf0f0; } .ld-root .ld-diff .new { background: #effaf3; }
.ld-root b, .ld-root summary { color: inherit; }
.ld-root .ld-api { color: #fff; } .ld-root .ld-api b { color: #fff; }
.ld-root .ld-matrix th { background: #eef2f8; }
.ld-pay { position: fixed; right: 16px; bottom: 64px; background: #e8590c; color: #fff !important; padding: 10px 16px; border-radius: 8px; font-weight: 700; text-decoration: none; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
</style>
