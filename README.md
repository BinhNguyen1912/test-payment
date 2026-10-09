# TrustWow Commitment Template Purchase & Accounting Payout Tester

A dedicated, visual end-to-end testing application built with Vue 3 and Vite for verifying the full financial lifecycle of Commitment Template purchases, Creator earnings, manual payout requests, and Accounting Segregation of Duties (Approver ➔ Executor ➔ Reconciler).

## Features
- **Multi-Persona Login**: One-click authentication for Buyer (User A), Creator (Seller), Finance Approver, Treasury Executor, and Finance Reconciler.
- **Full Client ID Selector**: Supports selecting `user`, `creator`, `merchant`, `admin` or custom Client IDs for each test persona.
- **Commitment Template Purchase**: Select listings, create VNPay pending payment orders.
- **VNPay Simulation**: Sandbox checkout redirect link + copyable local simulation CLI command + real-time status polling.
- **Creator Wallet Balances**: Real-time inspection of Ledger-derived balances (`payable`, `available`, `held`, `pendingPayout`, `inTransit`) and source-level earnings breakdown (Gross, Platform Commission, Withholding Tax, Net — rates are read from the active finance policy, not hard-coded).
- **Creator Bank & Payout Request**: Register bank accounts and submit manual payout requests with idempotency keys.
- **Accounting Approval Workflow**:
  - **Approver**: Reviews requested payouts and reserves ledger funds.
  - **Executor**: Claims processing, unmasks verified beneficiary bank details, and submits wire reference.
  - **Reconciler**: Matches bank statement evidence and completes payout to `SUCCEEDED`.
- **Double-Entry Ledger Inspector**: Audits trial balance integrity (`healthy`, `balanced`, total debits vs total credits) and displays recent journal lines.
- **Raw API Inspector**: Real-time JSON viewer for all request/response envelopes.
- **Voucher Full Flow (Stage 10)**: One-click voucher purchase, signed VNPay IPN, buyer Smart OTP, merchant redemption, revenue recognition, merchant payout, three-person Accounting approval/execution/reconciliation, and exact ledger account assertions.

## Catalog, lineage & stepper (v2)
- `src/components/ProductCatalogSelector.vue` — auto-loads commitments, vouchers and membership plans (filter, pagination, **Chọn mua** / **+ Giỏ**). No manual IDs.
- `src/components/DataLineageInspector.vue` — after every action: affected Postgres tables, before/after state, Dr/Cr journal. "Lấy bút toán thật" swaps the *dự kiến* entries for real `finance_journals`; one-click JSON copy.
- `src/components/PayoutApprovalStepper.vue` — Approver ➔ Executor ➔ Reconciler, each step with its `finance_payouts` / journal diff.
- `src/lineage.js` — table/account/event mapping and domain-error hints (`FINANCE_POLICY_UNSUPPORTED`, `FINANCE_JOURNAL_INVALID`, ...).
- Membership audiences are `web` / `mobile` (`/web/membership/plans`), the payout table is `finance_payouts`, and the payout events are `PAYOUT_RESERVED` (approve) / `PAYOUT_SUCCEEDED` (reconcile).

## Voucher full-flow prerequisites

- Các tài khoản KHÔNG được seed: buyer/affiliate tạo bằng "Register via API"; creator, merchant và 3 admin tài chính phải là tài khoản đã tồn tại (API không tạo được: cần eKYC + admin duyệt) — nhập tay trong UI. The three accounting actions use separate accounts to preserve segregation of duties.
- Select a catalog product issued by the configured merchant. The merchant must have a payout-ready bank account.
- If the buyer already has a Smart OTP device, reuse the same browser storage/device key. The tester intentionally does not revoke an existing device automatically.
- Set backend `LOCAL_E2E_BYPASS_GATES=true` with `NODE_ENV=development` or `test` to use T+0 payout holding. The newly redeemed voucher earning then becomes immediately available and Stage 10 continues automatically through merchant payout and Accounting reconciliation. Staging/production cannot enable this bypass.
- The tester verifies a one-time merchant `PAYOUT` PIN and sends its token. The current backend payout and voucher redemption-confirm routes do not enforce the stakeholder-required PIN decorators; Stage 10 surfaces this as a security-policy gap instead of hiding it.

## Data-lineage dock (v3) — "API nào ghi vào bảng nào"
Nút **Dòng chảy dữ liệu** (góc phải dưới). Với MỖI API ghi (POST/PATCH/PUT và IPN) nó hiện: sơ đồ `API → bảng 1 → bảng 2 …` theo thứ tự dữ liệu được ghi,
JSON từng bản ghi mới/sửa (cột sửa: trước → sau), bút toán Nợ/Có thật, phân bổ tiền (người bán / phí sàn / thuế / affiliate) và kiểm tra HALF_UP
so với `calculation_snapshot` thật trong DB. Tab **Ma trận luồng** = API × bảng.

```bash
npm run lineage   # terminal 1: server đọc DB (CHỈ ĐỌC, port 5197); lấy thông tin DB từ LINEAGE_ENV_FILE (mặc định ../trustwow-backend/.env)
npm run dev       # terminal 2: UI :5199, gọi backend :3000 như cũ
```
- Không seed, không ghi DB. Mọi truy vấn chạy `BEGIN READ ONLY`, timeout 8s, giới hạn 80 dòng/bảng, chỉ các bảng tiền trong `WATCH`.
- DB dùng chung với teammate: chỉ dòng **liên quan** (khớp id đơn/payout/txnRef/user của các API bạn vừa gọi) được hiện; dòng của người khác ẩn mặc định (tick "hiện dòng của người khác").
  "Liên quan" là heuristic, không phải bằng chứng tuyệt đối.
- Server từ chối chạy nếu `NODE_ENV`/`DB_NAME` trông như production.
- **Xem lại** dữ liệu đã có: nút "Xem lại 60 phút" hoặc mở `/?lineage-replay=240` (không gọi API).
- Ảnh "trước" của dòng sửa chỉ có nếu dòng đó đã được sửa trong vòng 45 phút trước API.

## Quy tắc test (bắt buộc)
1. **Không seed data.** Không INSERT/UPDATE DB, không script seed. Mọi dữ liệu phải do chính API tạo ra.
2. **Danh sách lấy bằng API GET** (listing, sản phẩm, plan, tài khoản…), không hardcode id/email/số tiền trong code test.
3. Gọi API thật; thanh toán dùng `paymentUrl` thật trả về và **tự mở VNPay** (dock có ô "tự mở VNPay").
4. Không sửa code backend, không push. Tra cứu endpoint/DTO/response ở `API_REFERENCE.md` (`node tools/gen-api-reference.mjs` để sinh lại từ source).

## Getting Started

```bash
cd /Users/trustwow/Desktop/Trustwow/Source-FE-Feature-Test/TestCommitmentTemplatePayoutFlow
npm install
npm run dev
```

App will run at `http://localhost:5199`.
API requests are proxied to `http://localhost:3000`.
