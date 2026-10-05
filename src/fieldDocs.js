// Plain-Vietnamese meaning of response fields. Used by DataView to print "(giải thích)" under each field name.
// Source: backend DTO/column names + VNPay IPN spec. Entries marked "(suy luận)" are inferred from the name, not verified in code.
export const FIELD_DOCS = {
  // --- VNPay IPN / settlement ---
  vnp_response_code: 'mã kết quả VNPay trả về cho giao dịch. "00" = thành công, mã khác = lỗi/huỷ/bị từ chối',
  vnp_transaction_status: 'trạng thái giao dịch bên VNPay. "00" = đã thanh toán thành công; khác "00" = chưa/không thành công',
  vnp_txnref: 'mã đơn của hệ thống mình gửi sang VNPay (khớp txnRef/app_trans_id của đơn)',
  vnp_amount: 'số tiền VNPay ghi nhận, đã nhân 100 (45.000₫ → 4500000)',
  vnp_transactionno: 'mã giao dịch do VNPay sinh ra, dùng khi đối soát với VNPay',
  vnp_bankcode: 'ngân hàng/phương thức khách đã dùng để trả (vd NCB)',
  vnp_paydate: 'thời điểm khách thanh toán, định dạng yyyyMMddHHmmss',
  vnp_securehash: 'chữ ký (HMAC) VNPay gắn vào dữ liệu để chống giả mạo',
  secure_hash: 'chữ ký (HMAC) VNPay gửi kèm; backend tính lại và so sánh để biết dữ liệu có bị sửa không',
  signature_verified: 'backend đã kiểm tra chữ ký của VNPay: true = hợp lệ, false = sai chữ ký (không được tin dữ liệu này)',
  amount_vnd: 'số tiền tính bằng đồng (VND)',
  gatewayfeevnd: 'phí cổng thanh toán VNPay thu (đồng)',
  grossamountvnd: 'tổng tiền VNPay chuyển về trước khi trừ phí (đồng)',
  settledat: 'thời điểm VNPay chuyển tiền về ngân hàng của sàn',
  externalreference: 'mã tham chiếu bên ngoài (mã đối soát của VNPay/ngân hàng)',
  // --- order / payment ---
  id: 'mã định danh nội bộ của bản ghi này',
  publicid: 'mã công khai (UUID) dùng khi đưa ra ngoài app, không lộ id nội bộ',
  txnref: 'mã giao dịch của đơn (= app_trans_id) gửi sang VNPay để đối chiếu',
  app_trans_id: 'mã giao dịch của đơn trong hệ thống mình (= txnRef)',
  status: 'trạng thái hiện tại của bản ghi',
  fulfillmentstatus: 'trạng thái GIAO HÀNG (khác với status là trạng thái TIỀN): FULFILLED = đã cấp voucher/gói cho khách',
  confirmedsource: 'nguồn xác nhận thanh toán: IPN = VNPay gọi server; RETURN = khách quay về trang kết quả',
  transactionno: 'mã giao dịch phía VNPay',
  bankcode: 'ngân hàng / phương thức thanh toán',
  paymenturl: 'đường dẫn sang cổng VNPay để khách thanh toán',
  idempotencykey: 'khoá chống gửi trùng: gửi lại cùng khoá thì backend trả kết quả cũ, không tạo thêm',
  currency: 'đơn vị tiền tệ (VND)',
  // --- ledger ---
  balanced: 'true = tổng Nợ bằng tổng Có (sổ cái cân). false = lỗi nghiêm trọng',
  healthy: 'tổng kết sức khoẻ sổ cái: true khi mọi bộ đếm lệch đều = 0 và sổ cân',
  totaldebits: 'tổng mọi dòng Nợ trong sổ cái (đồng)',
  totalcredits: 'tổng mọi dòng Có trong sổ cái (đồng). Phải bằng tổng Nợ',
  staledraftcount: 'số bút toán nháp bị treo quá lâu chưa ghi sổ. Mong đợi 0',
  orphanpayoutjournalcount: 'số bút toán rút tiền không gắn với lệnh rút nào. Mong đợi 0',
  payoutstatejournalmismatchcount: 'số lệnh rút mà trạng thái không khớp bút toán. Mong đợi 0',
  payoutallocationmismatchcount: 'số lệnh rút mà phân bổ (allocation) tiền không khớp số tiền lệnh. Mong đợi 0',
  treasurysettlementmismatchcount: 'số lần đối soát VNPay mà số tiền không khớp bút toán. Mong đợi 0',
  paymentledgermismatchcount: 'số đơn thanh toán thành công nhưng thiếu/lệch bút toán PAYMENT_CAPTURED. Mong đợi 0',
  earningledgermismatchcount: 'số khoản thu nhập (earning) thiếu/lệch bút toán. Mong đợi 0',
  membershipledgermismatchcount: 'số giao dịch membership thiếu/lệch bút toán. Mong đợi 0',
  eventtype: 'loại sự kiện kế toán, vd PAYMENT_CAPTURED (thu tiền), FULFILLMENT_RECOGNIZED (ghi nhận doanh thu khi redeem)',
  sourcetype: 'loại nghiệp vụ gây ra bút toán này (đơn, redeem, rút tiền…)',
  sourceid: 'id của nghiệp vụ gây ra bút toán (khớp với đơn/redemption/payout)',
  occurredat: 'thời điểm nghiệp vụ xảy ra; đồng hồ giữ tiền 7 ngày tính từ mốc này',
  accountcode: 'mã tài khoản kế toán bị ghi (vd VNPAY_CLEARING, MERCHANT_PAYABLE)',
  side: 'bên ghi sổ: DEBIT = Nợ, CREDIT = Có',
  amountvnd: 'số tiền của dòng/khoản này (đồng)',
  amount_minor: 'số tiền của dòng bút toán (đơn vị nhỏ nhất; VND = đồng)',
  partytype: 'loại bên liên quan (USER, MERCHANT, CREATOR, PLATFORM…)',
  partyid: 'id của bên liên quan (người/merchant/creator) bị ghi sổ',
  lines: 'các dòng Nợ/Có của bút toán; tổng Nợ phải bằng tổng Có',
  // --- voucher / merchant ---
  voucherid: 'id voucher cụ thể khách đang giữ',
  productid: 'id sản phẩm (loại voucher) được bán',
  faceValue: 'mệnh giá: giá trị voucher có thể dùng (đồng)',
  saleprice: 'giá bán cho khách (đồng)',
  maxsupply: 'số lượng tối đa được phát hành',
  redemptionid: 'id lần redeem (dùng voucher tại quầy)',
  challengeid: 'id phiên redeem tạm thời sinh ra khi merchant xem trước token',
  merchantuserid: 'id tài khoản merchant phát hành',
  issuerid: 'id đơn vị phát hành voucher',
  reviewstatus: 'trạng thái duyệt của admin: PENDING chờ duyệt, APPROVED đã duyệt, REJECTED từ chối',
  rejectionreason: 'lý do admin từ chối',
  // --- payout ---
  payoutid: 'id lệnh rút tiền',
  allocations: 'các khoản thu nhập được gom để trả cho lệnh rút này',
  settlementid: 'id lần đối soát VNPay',
  // --- DB columns (snake_case) seen in the money-flow tables ---
  journal_id: 'id bút toán (một lần chuyển tiền gồm nhiều dòng Nợ/Có)',
  account_id: 'id tài khoản kế toán bị ghi',
  calculation_snapshot: 'ảnh chụp cách tính phí/thuế tại lúc bán (giá gốc, tỷ lệ, số tiền từng khoản). Không đổi dù policy sau này đổi',
  policy_version_id: 'id phiên bản chính sách phí/thuế đã áp dụng cho giao dịch',
  version_no: 'số phiên bản của chính sách (số lớn = mới hơn)',
  effective_from: 'chính sách bắt đầu có hiệu lực từ thời điểm này',
  rate_bps: 'tỷ lệ tính bằng bps: 100 bps = 1%, 1000 bps = 10%',
  fixed_amount_vnd: 'số tiền cố định (đồng), dùng khi không tính theo %',
  charge_code: 'mã khoản thu (vd phí sàn, thuế)',
  charge_type: 'loại khoản thu: phí sàn, thuế VAT, thuế khấu trừ…',
  revenue_source: 'nguồn doanh thu (bán voucher, bán gói cam kết, membership…)',
  hold_until: 'tiền bị giữ (chưa rút được) cho đến thời điểm này',
  available_at: 'thời điểm tiền thành khả dụng để rút',
  seller_proceeds_vnd: 'tiền người bán thực nhận sau khi trừ phí và thuế (đồng)',
  user_id: 'id người dùng sở hữu bản ghi',
  order_id: 'id đơn hàng',
  payment_order_id: 'id đơn thanh toán',
  txn_ref: 'mã giao dịch của đơn gửi sang VNPay',
  event_type: 'loại sự kiện kế toán, vd PAYMENT_CAPTURED, FULFILLMENT_RECOGNIZED',
  source_type: 'loại nghiệp vụ gây ra bút toán',
  source_id: 'id của nghiệp vụ gây ra bút toán',
  occurred_at: 'thời điểm nghiệp vụ xảy ra',
  created_at: 'thời điểm tạo bản ghi',
  updated_at: 'thời điểm cập nhật gần nhất',
  // --- time/common ---
  createdat: 'thời điểm tạo bản ghi',
  updatedat: 'thời điểm cập nhật gần nhất',
  expiresat: 'thời điểm hết hạn',
  redeemedat: 'thời điểm voucher được dùng',
  nextcursor: 'con trỏ để tải trang kế tiếp',
  hasmore: 'true = còn dữ liệu ở trang sau',
};

// Pattern fallbacks when a field is not in the dictionary (inferred from the name only).
export function fieldDoc(name) {
  const k = String(name);
  const hit = FIELD_DOCS[k] || FIELD_DOCS[k.toLowerCase()] || FIELD_DOCS[k.replace(/_/g, '').toLowerCase()];
  if (hit) return hit;
  const l = k.toLowerCase();
  if (l.endsWith('count')) return 'bộ đếm (suy luận từ tên)';
  if (l.endsWith('at') || l.endsWith('date')) return 'thời điểm (suy luận từ tên)';
  if (l.endsWith('vnd') || l.includes('amount')) return 'số tiền, đồng (suy luận từ tên)';
  if (l.endsWith('id')) return 'mã định danh của đối tượng liên quan (suy luận từ tên)';
  if (l.startsWith('is') || l.startsWith('has')) return 'cờ đúng/sai (suy luận từ tên)';
  return 'chưa có giải thích — cho tôi biết để bổ sung';
}

export function hasDoc(name) {
  const k = String(name);
  return Boolean(FIELD_DOCS[k] || FIELD_DOCS[k.toLowerCase()] || FIELD_DOCS[k.replace(/_/g, '').toLowerCase()]);
}
