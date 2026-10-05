// Data-lineage builders: turn an API response into "which Postgres tables changed,
// before/after state, and which Dr/Cr journal was posted".
//
// Table / account / event names mirror the backend (trustwow-backend):
//   entities  -> payment_orders, vnpay_transactions, vnpay_ipn_logs, finance_journals,
//                finance_journal_lines, finance_payouts, membership_purchases, ...
//   events    -> src/modules/double-entry/constants/finance-event-types.ts
//   accounts  -> src/modules/double-entry/constants/account-codes.ts
//
// Entries flagged source:'expected' are computed from the policy (10% fee / 7% tax /
// affiliate bps); attachLedger() swaps them for the journals really posted.

export const PLATFORM_FEE_BPS = 1000;
export const WITHHOLDING_TAX_BPS = 700;

export const PURPOSE = {
  COMMITMENT: 'COMMITMENT_TEMPLATE_PURCHASE',
  VOUCHER: 'VOUCHER_PURCHASE',
  MEMBERSHIP: 'MEMBERSHIP_PURCHASE',
  CART: 'CART_CHECKOUT',
};

export const KIND_LABEL = {
  COMMITMENT: 'Thẻ cam kết',
  VOUCHER: 'Voucher',
  MEMBERSHIP: 'Gói hội viên',
  CART: 'Giỏ hàng',
};

const PAYABLE_BY_PARTY = {
  CREATOR: 'CREATOR_PAYABLE',
  MERCHANT: 'MERCHANT_PAYABLE',
  AFFILIATE: 'AFFILIATE_PAYABLE',
};

export function vnd(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : `${num.toLocaleString('vi-VN')} đ`;
}

function digits(value) {
  const clean = String(value ?? '0').replace(/\D/g, '');
  return BigInt(clean || '0');
}

function bps(amount, rate) {
  return (amount * BigInt(rate) + 5000n) / 10000n; // half-up, same as the backend policy
}

/** Gross -> creator/merchant net, platform fee, withholding tax and affiliate share. */
export function computeSplit(gross, affiliateBps = 0) {
  const g = digits(gross);
  const fee = bps(g, PLATFORM_FEE_BPS);
  const tax = bps(g, WITHHOLDING_TAX_BPS);
  const affiliate = bps(g, Number(affiliateBps) || 0);
  return {
    gross: g.toString(),
    fee: fee.toString(),
    tax: tax.toString(),
    affiliate: affiliate.toString(),
    net: (g - fee - tax - affiliate).toString(),
  };
}

let seq = 0;
function base(id, title, extra = {}) {
  seq += 1;
  return {
    id: `${id}-${Date.now()}-${seq}`,
    title,
    at: new Date().toISOString(),
    tables: [],
    entries: [],
    states: [],
    raw: null,
    match: {},
    ...extra,
  };
}

function table(name, fields, values, before, after, note = '') {
  return { table: name, fields, values, before, after, note };
}

function line(account, amount, pct) {
  return { account, amount: amount === null ? null : String(amount), pct };
}

// ---------------------------------------------------------------------------
// Purchase flow
// ---------------------------------------------------------------------------
export function orderCreatedLineage({ kind, order, itemTitle = '', raw }) {
  const purpose = order.purpose || PURPOSE[kind];
  const l = base('order', `${KIND_LABEL[kind]}: tạo đơn thanh toán`, { raw, match: { orderId: String(order.orderId || '') } });
  l.tables.push(
    table(
      'payment_orders',
      'id, app_trans_id, amount_vnd, purpose',
      `#${order.orderId}, ${order.txnRef}, ${vnd(order.amountVnd)}, ${purpose}`,
      '—',
      'PENDING',
      itemTitle,
    ),
    table('vnpay_transactions', 'txn_ref, vnp_response_code, signature_verified', `${order.txnRef}, —, —`, '—', 'PENDING', 'Chờ IPN từ VNPay'),
  );
  if (kind === 'CART') {
    l.tables.push(table('cart_checkout_units', 'order_id, product_type, quantity', `#${order.orderId}, theo từng item`, '—', 'RESERVED', 'Mỗi unit giữ chỗ + pin affiliate riêng'));
  }
  if (kind === 'MEMBERSHIP') {
    l.tables.push(table('membership_purchases', 'order_id, plan_id', `#${order.orderId}, ${order.planId ?? '—'}`, '—', 'PENDING'));
  }
  l.states.push({ label: 'payment_orders.status', before: '—', after: 'PENDING' });
  l.entries.push({
    event: 'Chưa có bút toán',
    eventType: '—',
    debits: [],
    credits: [],
    note: 'Tiền chưa về: sổ cái chỉ ghi nhận khi VNPay IPN xác nhận (PAYMENT_CAPTURED).',
    source: 'expected',
  });
  return l;
}

export function captureEntry(amount, orderId) {
  return {
    event: '1. Khách trả tiền',
    eventType: 'PAYMENT_CAPTURED',
    eventKey: `PAYMENT_CAPTURED:${orderId}`,
    debits: [line('VNPAY_CLEARING', amount)],
    credits: [line('CUSTOMER_FUNDS_HELD', amount)],
    note: 'Tiền nằm ở VNPay chờ quyết toán, ghi nhận nghĩa vụ giữ hộ khách.',
    source: 'expected',
  };
}

export function ipnLineage({ kind, order, ipn, ok = true }) {
  const code = ipn?.data?.RspCode ?? (ok ? '00' : '24');
  const l = base('ipn', `${KIND_LABEL[kind]}: VNPay IPN ${ok ? 'thành công' : 'thất bại'}`, {
    raw: ipn,
    match: { orderId: String(order.orderId || '') },
  });
  const after = ok ? 'SUCCESS' : 'FAILED';
  l.tables.push(
    table('payment_orders', 'id, status, paid_at', `#${order.orderId}, ${after}, now()`, 'PENDING', after),
    table('vnpay_transactions', 'txn_ref, vnp_response_code, signature_verified', `${order.txnRef}, ${ok ? '00' : '24'}, true`, 'PENDING', after),
    table('vnpay_ipn_logs', 'txn_ref, rsp_code', `${order.txnRef}, ${code}`, '—', 'RECORDED', 'Log bất biến mỗi lần VNPay gọi'),
  );
  l.states.push({ label: 'payment_orders.status', before: 'PENDING', after });
  if (ok) {
    l.tables.push(
      table('finance_journals', 'event_key, event_type, status', `PAYMENT_CAPTURED:${order.orderId}, PAYMENT_CAPTURED`, '—', 'POSTED', 'Immutable'),
      table('finance_journal_lines', 'journal_id, account, side, amount_minor', 'VNPAY_CLEARING (Nợ) / CUSTOMER_FUNDS_HELD (Có)', '—', vnd(order.amountVnd)),
    );
    l.entries.push(captureEntry(order.amountVnd, order.orderId));
  }
  return l;
}

/** Recognition entry posted when the buyer receives the goods. */
export function fulfillmentEntry({ kind, amount, orderId, affiliateBps = 0 }) {
  if (kind === 'MEMBERSHIP') {
    return {
      event: '2. Kích hoạt hội viên / Khớp lệnh',
      eventType: 'MEMBERSHIP_SALE_RECOGNIZED',
      eventKey: `MEMBERSHIP_SALE_RECOGNIZED:${orderId}`,
      debits: [line('CUSTOMER_FUNDS_HELD', amount)],
      credits: [line('MEMBERSHIP_DEFERRED_REVENUE', null, 'phần trước VAT'), line('VAT_OUTPUT_PAYABLE', null, 'VAT đầu ra')],
      note: 'Doanh thu hội viên ghi nhận hoãn; tổng Có = tổng Nợ, chia theo cấu hình VAT của plan.',
      totalAmount: String(amount),
      source: 'expected',
    };
  }
  const s = computeSplit(amount, affiliateBps);
  const isVoucher = kind === 'VOUCHER';
  const payable = isVoucher ? 'MERCHANT_PAYABLE' : 'CREATOR_PAYABLE';
  const credits = [
    line(payable, s.net, `${+(100 - (PLATFORM_FEE_BPS + WITHHOLDING_TAX_BPS + Number(affiliateBps || 0)) / 100).toFixed(2)}%`),
    line('PLATFORM_COMMISSION_REVENUE', s.fee, '10%'),
    line('TAX_WITHHOLDING_PAYABLE', s.tax, '7%'),
  ];
  if (BigInt(s.affiliate) > 0n) credits.push(line('AFFILIATE_PAYABLE', s.affiliate, `${(Number(affiliateBps) / 100).toFixed(2)}%`));
  return {
    event: isVoucher ? '2. Redeem voucher / Khớp lệnh' : '2. Giao hàng / Khớp lệnh',
    eventType: 'FULFILLMENT_RECOGNIZED',
    eventKey: `FULFILLMENT_RECOGNIZED:${orderId}`,
    debits: [line('CUSTOMER_FUNDS_HELD', s.gross)],
    credits,
    note: isVoucher
      ? 'Voucher chỉ ghi nhận doanh thu khi merchant xác nhận redeem (chưa xảy ra ở bước mua).'
      : 'Giải phóng tiền giữ hộ, cắt chia vào ví Creator, phí sàn và quỹ thuế (affiliate trừ từ phần Creator).',
    deferred: isVoucher,
    source: 'expected',
  };
}

export function fulfillmentLineage({ kind, order, polled, affiliateBps = 0 }) {
  const fulfilled = polled?.fulfillmentStatus === 'FULFILLED';
  const l = base('fulfil', `${KIND_LABEL[kind]}: giao hàng / ghi nhận doanh thu`, {
    raw: polled,
    match: { orderId: String(order.orderId || '') },
  });
  const entitlement = {
    COMMITMENT: ['user_commitment_templates', 'Quyền sở hữu thẻ cam kết'],
    CART: ['user_commitment_templates / vouchers', 'Quyền sở hữu theo từng unit'],
    VOUCHER: ['vouchers', 'Voucher ACTIVE cấp cho buyer'],
    MEMBERSHIP: ['user_memberships', 'Hội viên ACTIVE, cộng dồn thời hạn'],
  }[kind];
  l.tables.push(
    table(
      'payment_orders',
      'id, status, fulfillment_status',
      `#${order.orderId}, ${polled?.status || 'SUCCESS'}, ${polled?.fulfillmentStatus || 'PENDING'}`,
      'PENDING',
      polled?.fulfillmentStatus || 'PENDING',
    ),
  );
  l.states.push({ label: 'payment_orders.fulfillment_status', before: 'PENDING', after: polled?.fulfillmentStatus || 'PENDING' });
  if (fulfilled) {
    l.tables.push(table(entitlement[0], 'owner, status', `buyer, ACTIVE`, '—', 'ACTIVE', entitlement[1]));
    const entry = fulfillmentEntry({ kind: kind === 'CART' ? 'COMMITMENT' : kind, amount: order.amountVnd, orderId: order.orderId, affiliateBps });
    if (!entry.deferred) {
      l.tables.push(
        table('finance_journals', 'event_key, event_type, status', `${entry.eventKey}, ${entry.eventType}`, '—', 'POSTED', 'Immutable'),
        table('finance_journal_lines', 'journal_id, account, side, amount_minor', `${entry.debits[0].account} (Nợ) / ${entry.credits.map((c) => c.account).join(', ')} (Có)`, '—', vnd(order.amountVnd)),
      );
    }
    l.entries.push(entry);
  } else {
    l.entries.push({ event: 'Chưa giao hàng', eventType: '—', debits: [], credits: [], note: 'Đơn chưa FULFILLED nên chưa có bút toán ghi nhận.', source: 'expected' });
  }
  return l;
}

export function freeMembershipLineage({ plan, raw }) {
  const l = base('member-free', 'Gói hội viên 0đ: kích hoạt ngay', { raw });
  l.tables.push(
    table('membership_purchases', 'plan_id, amount_vnd', `${plan?.id ?? '—'}, 0 đ`, '—', 'ACTIVE'),
    table('user_memberships', 'plan_id, status', `${plan?.id ?? '—'}, ACTIVE`, '—', 'ACTIVE'),
  );
  l.entries.push({ event: 'Không có bút toán', eventType: '—', debits: [], credits: [], note: 'Gói 0đ không phát sinh tiền nên không có journal.', source: 'expected' });
  return l;
}

// ---------------------------------------------------------------------------
// Payout flow (finance_payouts). Real events: PAYOUT_RESERVED (on approve) and
// PAYOUT_SUCCEEDED (on reconcile); the spec names PAYOUT_REQUESTED / PAYOUT_RECONCILED
// map to these two.
// ---------------------------------------------------------------------------
export const PAYOUT_STEPS = {
  REQUEST: { label: 'Yêu cầu rút tiền', from: '—', to: 'REQUESTED' },
  APPROVE: { label: 'Approver duyệt chi', from: 'REQUESTED', to: 'APPROVED' },
  PROCESSING: { label: 'Executor nhận xử lý', from: 'APPROVED', to: 'PROCESSING' },
  SUBMIT: { label: 'Executor gửi ngân hàng', from: 'PROCESSING', to: 'SUBMITTED' },
  SUCCEED: { label: 'Reconciler đối soát', from: 'SUBMITTED', to: 'SUCCEEDED' },
  REJECT: { label: 'Từ chối', from: 'REQUESTED', to: 'REJECTED' },
  CANCEL: { label: 'Huỷ', from: 'PROCESSING', to: 'CANCELLED' },
};

export function payoutStepLineage({ step, payout = {}, fromStatus, bankFeeVnd, raw }) {
  const def = PAYOUT_STEPS[step];
  const id = payout.id ?? payout.payoutId ?? '—';
  const amount = payout.amountVnd ?? payout.amount ?? '0';
  const party = String(payout.partyType || 'CREATOR').toUpperCase();
  const payable = PAYABLE_BY_PARTY[party] || 'CREATOR_PAYABLE';
  const l = base(`payout-${step}`, `Payout #${id}: ${def.label}`, { raw, match: { payoutId: String(id) } });
  const before = fromStatus || def.from;
  l.states.push({ label: 'finance_payouts.status', before, after: def.to });
  l.tables.push(
    table('finance_payouts', 'id, party_type, amount_vnd, status', `#${id}, ${party}, ${vnd(amount)}, ${payout.externalReference || payout.status || def.to}`, before, def.to),
  );

  if (step === 'APPROVE') {
    l.tables.push(
      table('finance_journals', 'event_key, event_type, status', `PAYOUT_RESERVED:${id}, PAYOUT_RESERVED`, '—', 'POSTED', 'Immutable'),
      table('finance_journal_lines', 'journal_id, account, side, amount_minor', `${payable} (Nợ) / PAYOUT_IN_TRANSIT (Có)`, '—', vnd(amount)),
    );
    l.entries.push({
      event: '3. Yêu cầu rút tiền được duyệt',
      eventType: 'PAYOUT_RESERVED',
      eventKey: `PAYOUT_RESERVED:${id}`,
      debits: [line(payable, amount)],
      credits: [line('PAYOUT_IN_TRANSIT', amount)],
      note: 'Đóng băng số dư khả dụng, chuyển sang trạng thái chờ giải ngân.',
      source: 'expected',
    });
  } else if (step === 'SUCCEED') {
    const fee = bankFeeVnd && digits(bankFeeVnd) > 0n ? String(digits(bankFeeVnd)) : null;
    l.tables.push(
      table('finance_journals', 'event_key, event_type, status', `PAYOUT_SUCCEEDED:${id}, PAYOUT_SUCCEEDED`, '—', 'POSTED', 'Immutable'),
      table('finance_journal_lines', 'journal_id, account, side, amount_minor', `PAYOUT_IN_TRANSIT${fee ? ' + PAYOUT_BANK_FEE_EXPENSE' : ''} (Nợ) / BANK_CASH (Có)`, '—', vnd(amount)),
    );
    l.entries.push({
      event: '4. Đối soát hoàn tất',
      eventType: 'PAYOUT_SUCCEEDED',
      eventKey: `PAYOUT_SUCCEEDED:${id}`,
      debits: [line('PAYOUT_IN_TRANSIT', amount), ...(fee ? [line('PAYOUT_BANK_FEE_EXPENSE', fee)] : [])],
      credits: [line('BANK_CASH', fee ? String(digits(amount) + BigInt(fee)) : amount)],
      note: 'Tiền đã rời tài khoản ngân hàng của sàn' + (fee ? ', trừ phí bank.' : '.'),
      source: 'expected',
    });
  } else if (step === 'REJECT' || step === 'CANCEL') {
    l.entries.push({
      event: step === 'CANCEL' ? 'Huỷ payout (hoàn dự trữ)' : 'Từ chối payout',
      eventType: step === 'CANCEL' ? 'PAYOUT_CANCELLED' : '—',
      debits: step === 'CANCEL' ? [line('PAYOUT_IN_TRANSIT', amount)] : [],
      credits: step === 'CANCEL' ? [line(payable, amount)] : [],
      note: step === 'CANCEL' ? 'Đảo bút toán PAYOUT_RESERVED, trả lại số dư khả dụng.' : 'Chưa dự trữ nên không có bút toán.',
      source: 'expected',
    });
  } else {
    l.entries.push({ event: 'Không có bút toán', eventType: '—', debits: [], credits: [], note: 'Bước này chỉ đổi trạng thái payout, sổ cái không thay đổi.', source: 'expected' });
  }
  return l;
}

// ---------------------------------------------------------------------------
// Real ledger: replace expected entries with the journals the backend posted.
// ---------------------------------------------------------------------------
export function journalToEntry(journal) {
  const lines = journal.lines || [];
  const code = (x) => x.accountCode || x.account?.code || String(x.accountId ?? '?');
  const side = (x) => String(x.side).toUpperCase();
  return {
    event: `Journal #${journal.id}`,
    eventType: journal.eventType || journal.eventSourceType || '—',
    eventKey: journal.eventKey,
    debits: lines.filter((x) => side(x) === 'DEBIT').map((x) => line(code(x), x.amountMinor ?? x.amountVnd ?? x.amount)),
    credits: lines.filter((x) => side(x) === 'CREDIT').map((x) => line(code(x), x.amountMinor ?? x.amountVnd ?? x.amount)),
    note: `status=${journal.status || 'POSTED'} · sourceId=${journal.sourceId ?? journal.eventSourceId ?? '-'}`,
    journalId: journal.id,
    source: 'ledger',
  };
}

export function journalMatches(journal, match = {}) {
  const src = String(journal.sourceId ?? journal.eventSourceId ?? '');
  const key = String(journal.eventKey || '');
  return [match.orderId, match.payoutId].filter(Boolean).some((id) => src === id || key.endsWith(`:${id}`));
}

export function attachLedger(lineage, journals) {
  const hits = journals.filter((j) => journalMatches(j, lineage.match) && (j.lines || []).length);
  if (!hits.length) return { ...lineage, ledgerCount: 0 };
  const actual = hits.map(journalToEntry);
  const kept = lineage.entries.filter((e) => !actual.some((a) => a.eventType === e.eventType) && e.eventType !== '—');
  return {
    ...lineage,
    ledgerCount: hits.length,
    entries: [...actual, ...kept.map((e) => ({ ...e, source: 'expected' }))],
    tables: [
      ...lineage.tables.filter((t) => t.table !== 'finance_journals' && t.table !== 'finance_journal_lines'),
      ...hits.flatMap((j) => [
        table('finance_journals', 'id, event_key, event_type, status', `#${j.id}, ${j.eventKey}, ${j.eventType}`, '—', j.status || 'POSTED', 'Dữ liệu thật từ sổ cái'),
        table(
          'finance_journal_lines',
          'journal_id, account, side, amount_minor',
          (j.lines || []).map((x) => `${x.accountCode || x.accountId} (${String(x.side).toUpperCase() === 'DEBIT' ? 'Nợ' : 'Có'}) ${vnd(x.amountMinor ?? x.amountVnd ?? x.amount)}`).join(' · '),
          '—',
          `${(j.lines || []).length} dòng`,
        ),
      ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------
export const DOMAIN_ERRORS = {
  FINANCE_POLICY_UNSUPPORTED: 'Chính sách phí/thuế chưa hỗ trợ nguồn tiền hoặc mức affiliate này (kiểm tra finance policy đã seed).',
  FINANCE_POLICY_NOT_CONFIGURED: 'Chưa cấu hình chính sách tài chính cho nguồn doanh thu này.',
  FINANCE_JOURNAL_INVALID: 'Bút toán không hợp lệ (Nợ ≠ Có hoặc thiếu dòng) — backend từ chối ghi sổ.',
  FINANCE_PAYMENT_CAPTURE_MISSING: 'Chưa có PAYMENT_CAPTURED cho đơn này: cần IPN thành công trước khi ghi nhận doanh thu.',
  FINANCE_ACCOUNT_MISSING: 'Thiếu tài khoản kế toán bắt buộc trong bảng finance_accounts.',
  FINANCE_EVENT_CONFLICT: 'event_key đã tồn tại với nội dung khác (idempotency bị xung đột).',
  FINANCE_AFFILIATE_SHARE_UNSUPPORTED: 'Mức chia affiliate vượt/không phù hợp với chính sách.',
  FINANCE_SETTLEMENT_EXCEEDS_CLEARING: 'Số tiền quyết toán vượt số dư VNPAY_CLEARING.',
  FINANCE_SETTLEMENT_REVIEW_SEPARATION_REQUIRED: 'Maker và checker phải là hai admin khác nhau.',
  PAYOUT_INSUFFICIENT_AVAILABLE_BALANCE: 'Không đủ số dư khả dụng hoặc tiền mặt công ty (cần quyết toán VNPay → bank trước).',
  PAYOUT_IDEMPOTENCY_CONFLICT: 'Idempotency-Key header và body không trùng nhau.',
  PAYOUT_INVALID_STATE: 'Payout không ở trạng thái hợp lệ cho bước này.',
  NO_MANAGED_ACCOUNT: 'Login này chưa có sub-account active cho role đã chọn.',
  NETWORK: 'Không kết nối được backend (kiểm tra http://localhost:3000 và Vite proxy).',
};

export function explainError(err) {
  const code = err?.code || 'UNKNOWN';
  const hint = DOMAIN_ERRORS[code];
  return { code, message: err?.message || 'Request failed', hint: hint || '' };
}
