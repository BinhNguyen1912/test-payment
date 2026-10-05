// Data-lineage helper. READ-ONLY: it never writes to the database and never seeds data.
// Before/after each real API call the UI asks this server which money-related rows appeared or changed,
// so you can see "API X wrote these records into table Y".
//
// DB credentials are read from the backend .env (LINEAGE_ENV_FILE, default ../trustwow-backend/.env).
// Every query runs in BEGIN READ ONLY with a statement timeout and row limits (the DB may be shared with teammates).
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

const ENV_FILE = process.env.LINEAGE_ENV_FILE ?? '/Users/backendtrustwow5/trustwow-backend/.env';
const PORT = Number(process.env.LINEAGE_PORT ?? 5197);
const env = {};
for (const l of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (/prod/i.test(env.NODE_ENV ?? '') || /prod/i.test(env.DB_NAME ?? '')) {
  console.error(`Refusing to run against what looks like production (NODE_ENV=${env.NODE_ENV}, DB_NAME=${env.DB_NAME}).`);
  process.exit(1);
}
const pool = new pg.Pool({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432), user: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME, max: 3,
  connectionTimeoutMillis: 8000, ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Money-related tables only (small, targeted queries). Add names here to watch more.
const WATCH = [
  'payment_orders', 'vnpay_transactions', 'vnpay_ipn_logs', 'payment_provider_events',
  'finance_journals', 'finance_journal_lines', 'finance_holds', 'finance_payouts', 'finance_payout_allocations', 'finance_treasury_settlements',
  'finance_policy_versions', 'finance_policy_lines',
  'commitment_listings', 'commitment_purchase_entitlements', 'commitment_purchase_entitlement_usages',
  'cart_checkout_units', 'voucher_products', 'vouchers', 'voucher_events', 'voucher_redemptions', 'voucher_redemption_challenges',
  'membership_plans', 'membership_purchases', 'user_memberships', 'user_bank_accounts',
];
const SENSITIVE = /(password|passwd|secret|token|hash|pepper|otp|pin_|private_key|cipher|encrypted|salt|account_number|bank_account_no)/i;
const mask = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, SENSITIVE.test(k) && v != null ? '••• (ẩn)' : v]));
const BEFORE_WINDOW = '45 minutes';
const ROW_LIMIT = 80;

let schema = null; // table -> Set(columns)
async function loadSchema() {
  if (schema) return schema;
  const { rows } = await pool.query(
    `SELECT table_name::text t, column_name::text c FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1)`, [WATCH]);
  schema = {};
  for (const r of rows) (schema[r.t] ??= new Set()).add(r.c);
  return schema;
}
async function ro(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN READ ONLY'); await c.query("SET LOCAL statement_timeout = '8s'"); return await fn(c); }
  finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
}

// ---- entity memory: ids seen in earlier state-changing responses, so later calls can be linked to them
const entities = { userIds: new Set(), orderIds: new Set(), txnRefs: new Set(), payoutIds: new Set() };
const harvest = (node, path, depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) { node.slice(0, 50).forEach((x) => harvest(x, path, depth + 1)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (v == null) continue;
    if (typeof v === 'object') { harvest(v, path, depth + 1); continue; }
    const s = String(v);
    if (/^(orderId|paymentOrderId|payment_order_id)$/.test(k) && /^\d+$/.test(s)) entities.orderIds.add(s);
    else if (/^(txnRef|appTransId|app_trans_id)$/.test(k)) entities.txnRefs.add(s);
    else if (/^payoutId$/.test(k) && /^\d+$/.test(s)) entities.payoutIds.add(s);
    else if (/^(userId|ownerUserId|creatorUserId|sellerUserId|buyerUserId|affiliateUserId)$/.test(k) && /^\d+$/.test(s)) entities.userIds.add(s);
    else if (k === 'id' && /payouts/.test(path) && /^\d+$/.test(s) && ('status' in node) && ('amountVnd' in node || 'amountMinor' in node)) entities.payoutIds.add(s);
  }
};

const USER_COL = /(^|_)user_id$|^party_id$/;
const ORDER_COL = /^(payment_order_id|order_id|reserved_payment_order_id)$/;
function isRelated(table, row, extra) {
  const ent = { userIds: new Set([...entities.userIds, ...extra.userIds]), orderIds: new Set([...entities.orderIds, ...extra.orderIds]),
    txnRefs: new Set([...entities.txnRefs, ...extra.txnRefs]), payoutIds: new Set([...entities.payoutIds, ...extra.payoutIds]) };
  if (table === 'payment_orders' && ent.orderIds.has(String(row.id))) return true;
  if (table === 'finance_payouts' && ent.payoutIds.has(String(row.id))) return true;
  for (const [c, v] of Object.entries(row)) {
    if (v == null) continue;
    const s = typeof v === 'object' ? '' : String(v);
    if (ORDER_COL.test(c) && ent.orderIds.has(s)) return true;
    if (c === 'payout_id' && ent.payoutIds.has(s)) return true;
    if (c === 'source_id' && (ent.orderIds.has(s) || ent.payoutIds.has(s))) return true;
    if (USER_COL.test(c) && ent.userIds.has(s)) return true;
    if (s.length >= 10) for (const t of ent.txnRefs) if (s.includes(t)) return true;
    if (c === 'event_key') {
      for (const id of ent.orderIds) if (s.includes(`:${id}`) || s.endsWith(`:${id}`)) return true;
      for (const id of ent.payoutIds) if (s.includes(`PAYOUT:${id}:`)) return true;
    }
  }
  return false;
}

// ---- tickets (few round trips: the DB may be remote)
const tickets = new Map();
const num = (v) => { if (!/^\d+$/.test(String(v))) throw new Error('bad id'); return String(v); };
// replayMinutes: pretend the call started N minutes ago, to inspect existing data (no new write needed).
async function begin(replayMinutes = 0) {
  const sc = await loadSchema();
  return ro(async (c) => {
    const names = Object.keys(sc);
    const idTables = names.filter((t) => sc[t].has('id'));
    const updTables = idTables.filter((t) => sc[t].has('updated_at'));
    const back = Math.max(0, Math.min(Number(replayMinutes) || 0, 24 * 60));
    const { rows: [t0] } = await c.query(`SELECT now() - make_interval(mins => ${back}) AS now`);
    const { rows: m } = await c.query(idTables.map((t) => back && sc[t].has('created_at')
      ? `SELECT '${t}'::text AS t, COALESCE(max(id) FILTER (WHERE created_at < $1::timestamptz),0)::text AS m FROM "${t}"`
      : `SELECT '${t}'::text AS t, COALESCE(max(id),0)::text AS m FROM "${t}"`).join(' UNION ALL '), back ? [t0.now] : []);
    const { rows: b } = updTables.length ? await c.query(updTables.map((t) =>
      `(SELECT '${t}'::text AS t, to_jsonb(x) AS r FROM (SELECT * FROM "${t}" WHERE updated_at > now() - interval '${BEFORE_WINDOW}' ORDER BY updated_at DESC LIMIT 300) x)`).join(' UNION ALL ')) : { rows: [] };
    const before = {};
    for (const r of b) (before[r.t] ??= new Map()).set(String(r.r.id), r.r);
    const id = crypto.randomUUID();
    tickets.set(id, { marks: Object.fromEntries(m.map((x) => [x.t, x.m])), before, dbNow: t0.now });
    if (tickets.size > 200) tickets.delete(tickets.keys().next().value);
    return id;
  });
}

const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function collect(ticketId, ctx) {
  const tk = tickets.get(ticketId);
  if (!tk) throw new Error('ticket không tồn tại (server đã khởi động lại?)');
  const sc = await loadSchema();
  const extra = { userIds: new Set(ctx.userId ? [String(ctx.userId)] : []), orderIds: new Set(), txnRefs: new Set(), payoutIds: new Set() };
  return ro(async (c) => {
    const idTables = Object.keys(sc).filter((t) => sc[t].has('id'));
    const { rows: cnt } = await c.query(idTables.map((t) => {
      const mk = num(tk.marks[t] ?? '0');
      const upd = sc[t].has('updated_at') ? `(SELECT count(*) FROM "${t}" WHERE id <= ${mk} AND updated_at >= $1::timestamptz - interval '1 second')` : '0';
      return `SELECT '${t}'::text AS t, (SELECT count(*) FROM "${t}" WHERE id > ${mk})::int AS ins, ${upd}::int AS upd`;
    }).join(' UNION ALL '), [tk.dbNow]);
    const hit = cnt.filter((x) => x.ins > 0 || x.upd > 0);
    const parts = [];
    for (const h of hit) {
      const mk = num(tk.marks[h.t] ?? '0');
      if (h.ins) parts.push(`(SELECT '${h.t}'::text AS t, 'ins'::text AS k, to_jsonb(x) AS r FROM (SELECT * FROM "${h.t}" WHERE id > ${mk} ORDER BY id ASC LIMIT ${ROW_LIMIT}) x)`);
      if (h.upd) parts.push(`(SELECT '${h.t}'::text AS t, 'upd'::text AS k, to_jsonb(x) AS r FROM (SELECT * FROM "${h.t}" WHERE id <= ${mk} AND updated_at >= $1::timestamptz - interval '1 second' ORDER BY updated_at DESC LIMIT ${ROW_LIMIT}) x)`);
    }
    const { rows: data } = parts.length ? await c.query(parts.join(' UNION ALL '), [tk.dbNow]) : { rows: [] };
    const by = {};
    for (const d of data) { const e = (by[d.t] ??= { ins: [], upd: [] }); e[d.k].push(d.r); }

    const relJournals = new Set();
    for (const r of by.finance_journals?.ins ?? []) if (isRelated('finance_journals', r, extra)) relJournals.add(String(r.id));
    const tables = hit.map((h) => {
      const e = by[h.t] ?? { ins: [], upd: [] };
      return {
        table: h.t, insertedTotal: h.ins, truncated: h.ins > e.ins.length,
        inserted: e.ins.map((r) => ({ row: mask(r), related: h.t === 'finance_journal_lines' ? relJournals.has(String(r.journal_id)) : isRelated(h.t, r, extra) })),
        updated: e.upd.map((row) => {
          const b = tk.before[h.t]?.get(String(row.id));
          const changed = b ? Object.keys(row).filter((k) => k !== 'updated_at' && !sameVal(row[k], b[k])) : null;
          return { row: mask(row), before: b ? mask(b) : null, changed, related: isRelated(h.t, row, extra) };
        }),
      };
    });
    // Iterate: a related order/payout makes the rows that point at it related too (transactions, holds, journals, lines...).
    for (let pass = 0; pass < 3; pass += 1) {
      for (const ts of tables) {
        for (const r of [...ts.inserted, ...ts.updated]) {
          if (ts.table === 'payment_orders' && r.related) extra.orderIds.add(String(r.row.id));
          if (ts.table === 'finance_payouts' && r.related) extra.payoutIds.add(String(r.row.id));
        }
      }
      for (const ts of tables) {
        for (const r of ts.inserted) if (!r.related) r.related = ts.table === 'finance_journal_lines' ? relJournals.has(String(r.row.journal_id)) : isRelated(ts.table, r.row, extra);
        for (const r of ts.updated) if (!r.related) r.related = isRelated(ts.table, r.row, extra);
        if (ts.table === 'finance_journals') for (const r of ts.inserted) if (r.related) relJournals.add(String(r.row.id));
      }
    }
    const journalIds = (by.finance_journals?.ins ?? []).map((r) => r.id);
    let journals = [];
    if (journalIds.length) {
      const { rows } = await c.query(
        `SELECT j.id, j.event_key, j.event_type, j.source_type, j.source_id, j.status, j.occurred_at, j.calculation_snapshot,
                COALESCE(json_agg(json_build_object('account', a.code, 'side', l.side, 'amount', l.amount_minor::text, 'partyType', l.party_type, 'partyId', l.party_id,
                  'referenceType', l.reference_type, 'referenceId', l.reference_id) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
           FROM finance_journals j LEFT JOIN finance_journal_lines l ON l.journal_id=j.id LEFT JOIN finance_accounts a ON a.id=l.account_id
          WHERE j.id = ANY($1::bigint[]) GROUP BY j.id ORDER BY j.id`, [journalIds.slice(0, 40)]);
      journals = rows.map((j) => ({ ...j, related: relJournals.has(String(j.id)) }));
    }
    const ts = (t) => Math.min(...[...t.inserted, ...t.updated].map((x) => new Date(x.row.created_at ?? x.row.updated_at ?? 0).getTime()).filter((n) => n > 0), Infinity);
    tables.sort((a, b) => ts(a) - ts(b));
    return { tables, journals, dbNow: tk.dbNow };
  });
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve, reject) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } }); });


// ---------------------------------------------------------------------------------------------------------------------
// STRICT trace of one order through the money tables (read-only). Every stage is an exact key match, not a heuristic.
// ---------------------------------------------------------------------------------------------------------------------
async function trace({ orderId, txnRef, userId }) {
  return ro(async (c) => {
    const q = async (sql, params = []) => { try { return (await c.query(sql, params)).rows.map(mask); } catch (e) { return { __error: String(e.message).split('\n')[0] }; } };
    const ids = (rows) => (Array.isArray(rows) ? rows.map((r) => String(r.id)) : []);
    const stages = [];
    const add = (key, table, title, explain, rows, extra = {}) => stages.push({ key, table, title, explain, rows: Array.isArray(rows) ? rows.slice(0, 100) : [], error: rows?.__error, ...extra });

    const orders = await q('SELECT * FROM payment_orders WHERE ($1::text <> \'\' AND id::text = $1) OR ($2::text <> \'\' AND app_trans_id = $2) LIMIT 5', [orderId ?? '', txnRef ?? '']);
    add('order', 'payment_orders', '1. Đơn thanh toán', 'API checkout tạo dòng này (PENDING). IPN VNPay đổi status → SUCCESS, rồi job giao hàng đổi fulfillment_status → FULFILLED.', orders);
    const oid = ids(orders);
    if (!oid.length) return { orderIds: [], stages, note: 'Không tìm thấy đơn.' };
    const userIds = [...new Set(orders.map((o) => String(o.user_id)))];

    add('vnpay', 'vnpay_transactions', '2. Giao dịch VNPay', 'Bản ghi IPN/return đã xác thực chữ ký: mã GD, ngân hàng, response code.', await q('SELECT * FROM vnpay_transactions WHERE payment_order_id = ANY($1::bigint[]) ORDER BY id', [oid]));
    add('events', 'payment_provider_events', '3. Sự kiện từ VNPay (idempotency)', 'Mỗi IPN gửi về được đếm (received_count) để chống xử lý trùng.', await q('SELECT * FROM payment_provider_events WHERE payment_order_id = ANY($1::bigint[]) ORDER BY id', [oid]));
    const units = await q('SELECT * FROM cart_checkout_units WHERE payment_order_id = ANY($1::bigint[]) ORDER BY unit_no', [oid]);
    add('units', 'cart_checkout_units', '4. Từng món trong đơn', 'Mỗi món trong giỏ là 1 unit: người bán, số tiền, chính sách phí áp dụng, % affiliate.', units);
    add('ent', 'commitment_purchase_entitlements', '5a. Quyền sử dụng thẻ cam kết', 'Chỉ có khi mua thẻ cam kết.', await q('SELECT * FROM commitment_purchase_entitlements WHERE payment_order_id = ANY($1::bigint[]) ORDER BY id', [oid]));
    const vouchers = await q('SELECT * FROM vouchers WHERE reserved_payment_order_id = ANY($1::bigint[]) OR id IN (SELECT voucher_id FROM voucher_events WHERE payment_order_id = ANY($1::bigint[])) ORDER BY id', [oid]);
    add('vouchers', 'vouchers', '5b. Voucher được cấp', 'Voucher được giữ chỗ (reserved) khi tạo đơn, chuyển owner_id sang người mua khi đơn FULFILLED.', vouchers);
    const vid = ids(vouchers);
    add('vevents', 'voucher_events', '5c. Lịch sử voucher', 'Mỗi lần đổi trạng thái/chủ sở hữu của voucher.', await q('SELECT * FROM voucher_events WHERE payment_order_id = ANY($1::bigint[]) OR voucher_id = ANY($2::bigint[]) ORDER BY id', [oid, vid]));
    const reds = await q('SELECT * FROM voucher_redemptions WHERE voucher_id = ANY($1::bigint[]) ORDER BY id', [vid]);
    add('reds', 'voucher_redemptions', '6. Redeem tại merchant', 'Merchant quét/xác nhận voucher → từ đây tiền mới được GHI NHẬN cho merchant.', reds);
    const rid = ids(reds); const uid = ids(units);

    const journals = await q(`SELECT * FROM finance_journals
      WHERE (source_type = 'PAYMENT_ORDER' AND source_id = ANY($1::text[]))
         OR event_key ~ ('(^|:)PAYMENT_ORDER:(' || array_to_string($1::text[], '|') || ')$')
         OR (source_type = 'VOUCHER_REDEMPTION' AND source_id = ANY($2::text[]))
         OR (source_type ILIKE '%UNIT%' AND source_id = ANY($3::text[]))
      ORDER BY id`, [oid, rid, uid]);
    add('journals', 'finance_journals', '7. Bút toán (sổ kép)', 'PAYMENT_CAPTURED khi thu tiền; FULFILLMENT_RECOGNIZED khi ghi nhận doanh thu cho người bán. Mỗi bút toán có Σ Nợ = Σ Có.', journals);
    const jid = ids(journals);
    const lines = await q(`SELECT l.*, a.code AS account_code, a.name AS account_name FROM finance_journal_lines l LEFT JOIN finance_accounts a ON a.id = l.account_id WHERE l.journal_id = ANY($1::bigint[]) ORDER BY l.journal_id, l.id`, [jid]);
    const pvIds = [...new Set([...journals.map((j) => j.policy_version_id), ...units.map((u) => u.finance_policy_version_id)].filter(Boolean).map(String))];
    add('policy', 'finance_policy_lines', '7b. Chính sách phí/thuế được áp dụng', 'Phiên bản chính sách tại thời điểm bán: tỷ lệ hoa hồng sàn, thuế khấu trừ, VAT… (rate_bps: 100 = 1%).', await q(`SELECT v.id AS policy_version_id, v.version_no, v.status, v.effective_from, s.code AS revenue_source, pl.charge_code, pl.charge_kind, pl.payer, pl.recipient, pl.basis, pl.value_type, pl.rate_bps, pl.fixed_amount_vnd FROM finance_policy_versions v JOIN finance_revenue_sources s ON s.id = v.revenue_source_id LEFT JOIN finance_policy_lines pl ON pl.policy_version_id = v.id WHERE v.id = ANY($1::bigint[]) ORDER BY v.id, pl.sort_order`, [pvIds]));
    add('lines', 'finance_journal_lines', '8. Các dòng Nợ/Có', 'Tiền đi từ tài khoản nào sang tài khoản nào, và thuộc bên nào (khách, VNPay, creator, merchant, sàn, thuế…).', lines);
    const lid = ids(lines);
    add('holds', 'finance_holds', '9. Tiền bị giữ (hold)', 'Doanh thu của người bán bị giữ N ngày trước khi rút được.', await q(`SELECT * FROM finance_holds WHERE (source_type ILIKE '%JOURNAL%' AND source_id = ANY($1::text[])) OR (source_type ILIKE '%ORDER%' AND source_id = ANY($2::text[])) OR (source_type ILIKE '%REDEMPTION%' AND source_id = ANY($3::text[])) ORDER BY id`, [jid, oid, rid]));
    const allocs = await q('SELECT * FROM finance_payout_allocations WHERE earning_journal_id = ANY($1::bigint[]) OR earning_journal_line_id = ANY($2::bigint[]) ORDER BY id', [jid, lid]);
    add('allocs', 'finance_payout_allocations', '10. Khoản này đã được rút chưa', 'Lệnh rút tiền trừ vào khoản doanh thu nào (earning).', allocs);
    const pids = [...new Set(allocs.map((a) => String(a.payout_id)))];
    const payouts = await q('SELECT * FROM finance_payouts WHERE id = ANY($1::bigint[]) ORDER BY id', [pids]);
    add('payouts', 'finance_payouts', '11. Lệnh rút tiền', 'REQUESTED → APPROVED → PROCESSING → SUBMITTED → SUCCEEDED (3 admin khác nhau).', payouts);
    const pj = payouts.map((p) => p.reservation_journal_id).filter(Boolean);
    if (pj.length) add('pjournals', 'finance_journals', '12. Bút toán của lệnh rút', 'Bút toán giữ chỗ khi tạo lệnh rút.', await q('SELECT * FROM finance_journals WHERE id = ANY($1::bigint[])', [pj]));
    add('settle', 'finance_treasury_settlements', '13. Đối soát tiền VNPay về ngân hàng', 'Admin ghi nhận VNPay chuyển gross − phí về tài khoản ngân hàng của sàn (toàn hệ thống, không theo đơn).', await q('SELECT * FROM finance_treasury_settlements ORDER BY id DESC LIMIT 5'), { global: true });
    return { orderIds: oid, userIds, stages };
  });
}

// Everything the ledger holds for one party (user id): lines, hold state, payouts. Read-only.
async function party({ partyId, limit = 50 }) {
  return ro(async (c) => {
    const q = async (sql, params = []) => { try { return (await c.query(sql, params)).rows.map(mask); } catch (e) { return { __error: String(e.message).split('\n')[0] }; } };
    const pid = String(partyId ?? '');
    if (!pid) return { error: 'partyId required' };
    const lim = Math.min(Number(limit) || 50, 100);
    const lines = await q(`SELECT l.id AS line_id, l.journal_id, j.event_type, j.source_type, j.source_id, j.occurred_at, a.code AS account_code, l.side, l.amount_minor, l.party_type, l.party_id
      FROM finance_journal_lines l JOIN finance_journals j ON j.id = l.journal_id LEFT JOIN finance_accounts a ON a.id = l.account_id
      WHERE l.party_id = $1 ORDER BY l.id DESC LIMIT ${lim}`, [pid]);
    const balance = await q(`SELECT a.code AS account_code, l.party_type, SUM(CASE WHEN l.side='CREDIT' THEN l.amount_minor ELSE -l.amount_minor END)::text AS credit_minus_debit, COUNT(*)::int AS lines
      FROM finance_journal_lines l LEFT JOIN finance_accounts a ON a.id = l.account_id WHERE l.party_id = $1 GROUP BY 1, 2 ORDER BY 1`, [pid]);
    const holds = await q('SELECT * FROM finance_holds WHERE party_id = $1 ORDER BY id DESC LIMIT 30', [pid]);
    const payouts = await q('SELECT * FROM finance_payouts WHERE party_id = $1 ORDER BY id DESC LIMIT 30', [pid]);
    const bank = await q('SELECT id, user_id, bank_code, bank_name, account_name, verified_at, payout_blocked_until, risk_status FROM user_bank_accounts WHERE user_id::text = $1 AND deleted_at IS NULL', [pid]);
    return { partyId: pid, balance, lines, holds, payouts, bank };
  });
}

// Configuration + tax view: chart of accounts with live balances, revenue sources, charge types, policy versions/lines, tax ledger.
async function config() {
  return ro(async (c) => {
    const q = async (sql, params = []) => { try { return (await c.query(sql, params)).rows.map(mask); } catch (e) { return { __error: String(e.message).split('\n')[0] }; } };
    const accounts = await q(`SELECT a.id, a.code, a.name, a.account_type, a.normal_side, a.is_active,
        COALESCE(SUM(CASE WHEN l.side='DEBIT' THEN l.amount_minor END),0)::text AS total_debit,
        COALESCE(SUM(CASE WHEN l.side='CREDIT' THEN l.amount_minor END),0)::text AS total_credit,
        COALESCE(SUM(CASE WHEN l.side='CREDIT' THEN l.amount_minor ELSE -l.amount_minor END),0)::text AS credit_minus_debit,
        COUNT(l.id)::int AS line_count
      FROM finance_accounts a LEFT JOIN finance_journal_lines l ON l.account_id = a.id GROUP BY a.id ORDER BY a.id`);
    const sources = await q('SELECT * FROM finance_revenue_sources ORDER BY id');
    const charges = await q('SELECT * FROM finance_charge_types ORDER BY id');
    const versions = await q(`SELECT v.*, s.code AS revenue_source_code FROM finance_policy_versions v JOIN finance_revenue_sources s ON s.id = v.revenue_source_id ORDER BY v.revenue_source_id, v.version_no`);
    const lines = await q('SELECT * FROM finance_policy_lines ORDER BY policy_version_id, sort_order, id');
    const taxByAccount = await q(`SELECT a.code AS account_code, l.party_type, COUNT(*)::int AS lines,
        SUM(CASE WHEN l.side='CREDIT' THEN l.amount_minor ELSE -l.amount_minor END)::text AS credit_minus_debit
      FROM finance_journal_lines l JOIN finance_accounts a ON a.id = l.account_id
      WHERE a.code IN ('TAX_WITHHOLDING_PAYABLE','VAT_OUTPUT_PAYABLE','VAT_INPUT_RECEIVABLE','TAX_PAYABLE') OR a.code ILIKE '%TAX%' OR a.code ILIKE '%VAT%'
      GROUP BY 1, 2 ORDER BY 1`);
    const taxLedger = await q(`SELECT l.id AS line_id, l.journal_id, j.event_type, j.source_type, j.source_id, j.occurred_at, a.code AS account_code, l.side, l.amount_minor, l.party_type, l.party_id,
        j.policy_version_id, j.calculation_snapshot
      FROM finance_journal_lines l JOIN finance_journals j ON j.id = l.journal_id JOIN finance_accounts a ON a.id = l.account_id
      WHERE a.code ILIKE '%TAX%' OR a.code ILIKE '%VAT%' ORDER BY l.id DESC LIMIT 60`);
    const trial = await q(`SELECT COALESCE(SUM(CASE WHEN side='DEBIT' THEN amount_minor END),0)::text AS debit, COALESCE(SUM(CASE WHEN side='CREDIT' THEN amount_minor END),0)::text AS credit FROM finance_journal_lines`);
    return { accounts, sources, charges, versions, lines, taxByAccount, taxLedger, trial: Array.isArray(trial) ? trial[0] : null };
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/lineage/info') {
      const sc = await loadSchema();
      return send(res, 200, { database: env.DB_NAME, host: env.DB_HOST, watched: Object.keys(sc), missing: WATCH.filter((t) => !sc[t]), entities: Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, [...v]])) });
    }
    if (req.method === 'POST' && url.pathname === '/lineage/begin') { const b = await readBody(req); return send(res, 200, { ticket: await begin(b.replayMinutes) }); }
    if (req.method === 'POST' && url.pathname === '/lineage/end') {
      const b = await readBody(req);
      if (b.method && b.method !== 'GET') {
        harvest(b.responseBody, b.path ?? ''); if (b.userId) entities.userIds.add(String(b.userId));
        const m = String(b.path ?? '').match(/txnRef=([A-Za-z0-9]+)/); if (m) entities.txnRefs.add(m[1]);
      }
      return send(res, 200, await collect(b.ticket, b));
    }
    if (req.method === 'POST' && url.pathname === '/lineage/trace') return send(res, 200, await trace(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/lineage/party') return send(res, 200, await party(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/lineage/config') return send(res, 200, await config());
    if (req.method === 'POST' && url.pathname === '/lineage/reset') { Object.values(entities).forEach((s) => s.clear()); return send(res, 200, { ok: true }); }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: String(e.message ?? e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`lineage server http://127.0.0.1:${PORT}  db=${env.DB_NAME}@${env.DB_HOST} (READ ONLY)`));
