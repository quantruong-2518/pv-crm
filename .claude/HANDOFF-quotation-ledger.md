# Lượt "sổ báo giá + tiền và hợp đồng" — đặc tả chung cho mọi agent

Worktree: `/Users/st2518/Works/pv-crm-quote` · nhánh `feat/quotation-ledger`.
Canvas (chỉ để người xem): https://claude.ai/artifact/GpLJJsAdwE3ZvMUvTMgvuz
Migration kế tiếp: **0104** · ADR kế tiếp: **0090**.

**Mọi lệnh DB chạy với `DATABASE_URL=pglite://…` tường minh.** `apps/api/.env`
của repo gốc trỏ Neon production; worktree này không có `.env` và không được
chép sang. Không ai chạy migrate/seed lên Neon, không ai commit, không ai push.

File này là nguồn chung. Chỗ nào đặc tả thiếu: làm hết phần không phụ thuộc,
ghi câu hỏi vào `openDecisions` trong báo cáo, **không tự quyết**.

## 1 · Quyết định đã chốt với chủ dự án (12/10/2026)

1. Mỗi lần báo giá là một bản ghi trong bảng mới `sales.quotation`.
2. Dòng `sales.touch` kind `quotation-sent` **giữ lại** làm câu trên dòng thời
   gian (như `opportunity_stage_event` cạnh `stage-changed`). Nhưng mọi chỗ
   ĐẾM/GÁC chuyển sang đọc `sales.quotation` trong cùng lượt này:
   `quotationRounds`, cổng ký `hasTouch('quotation-sent')`, `floors.quotation`,
   số lần trong journey. Không để hai cách đếm.
3. Báo giá mang **loại hợp đồng** (`ContractKind`: licence · deployment ·
   training) ngay khi ghi. Bản ghi sinh từ thư mẫu và bản ghi backfill được
   phép thiếu loại và giá trị; màn hiện "Chưa nhập giá trị" kèm cửa bổ sung.
4. **Vòng báo giá (negotiation)** = các lần báo cùng `(opportunity_code, kind,
negotiation_no)`. Mỗi vòng tối đa MỘT lần `pending`. Ghi lần mới trong vòng
   đang có lần pending → lần cũ thành `not-closed`, **bắt buộc lý do**.
   `round_no` do máy chủ cấp dưới khoá cơ hội (`lockDeal`), không đếm ở trình duyệt.
5. Kết quả một lần báo: `pending` · `won` · `not-closed`. Nhãn hiển thị:
   "Chờ khách" · "Thắng" · "Không chốt". Hết hạn hiệu lực KHÔNG tự đóng, chỉ hiển thị.
6. Ký hợp đồng: `ContractSign` nhận thêm `quotationId` (tuỳ chọn). Khi áp chữ
   ký: lần pending của vòng đó thành `won`, cả vòng gắn `contract_code`.
   Hợp đồng ký không kèm `quotationId` (dữ liệu cũ, hoặc vòng chưa có bản ghi)
   vẫn ký được nếu cơ hội có ít nhất một bản ghi báo giá — giữ đúng nghĩa cổng cũ.
7. Dừng cơ hội (`stop`): mọi lần pending thành `not-closed`, lý do lấy từ lý do
   dừng (lưu `stop_reason_key`, không hỏi hai lần).
8. Cơ hội đã thắng không dừng được → thêm cửa **đóng vòng báo giá**: lần
   pending thành `not-closed` kèm lý do, cơ hội giữ nguyên trạng thái.
9. Lý do "Không chốt" là **danh mục cấu hình mới** `QUOTE_REVISION_REASON` trong
   `sales.config_entry` (cùng luồng duyệt cấu hình). Hạt giống: Khách chê giá
   cao · Khách đổi số lượng · Khách đổi phạm vi · Báo giá hết hiệu lực. `other`
   là ảo như ở `LOSS_REASON` và buộc có ghi chú.
10. Tài liệu: vẫn một kệ `platform.attachment` theo workstream. Nhãn công đoạn
    nằm ở **bảng nối phía sales** `sales.document_step` (attachment_id →
    `quotation` | `contract` | `installment`), không thêm cột vào `platform.attachment`.
11. Quyền tài liệu của hành trình nới: người giữ lead **HOẶC** người đứng trên
    một cơ hội của hành trình đó (`dealScope`). Ghi vào ADR 0090.
12. Số liệu hợp đồng trong hồ sơ cơ hội (đợt thanh toán, tổng thu) chỉ trả cho
    người có `contract.view`; người không có nhận mảng rỗng + cờ, màn ẩn khối.
13. **Lịch thanh toán nhập trong đề nghị ký**: `ContractSign` nhận
    `installments[]` (nhãn, tỉ lệ %, số tiền, hạn); giám đốc duyệt ký là duyệt
    luôn lịch. Sau khi ký, người có `contract.edit` sửa/thêm/xoá được đợt
    **chưa thu**, và nhập bổ sung lịch cho hợp đồng cũ chưa có lịch.
    Ràng buộc: Σ tỉ lệ = 100 và Σ số tiền = giá trị hợp đồng khi lịch không rỗng.
    Số tiền đợt theo tiền tệ của hợp đồng.
14. **Ghi đã thu**: người có `contract.record-payment` ghi thẳng `paid_at`
    (ngày ≤ hôm nay, ≥ ngày ký), kèm dòng `platform.audit`. Hoàn tác được bởi
    chính người đã ghi. Không thêm loại duyệt E3 mới.
15. **Ghi lần nhắc**: thêm dòng `contract_record` (kênh, nội dung, kết quả) —
    người có `contract.edit` hoặc `contract.record-payment`.
16. **Điều kiện mở khoá** (`contract_condition`): người có `contract.edit`
    thêm và đánh dấu xong. Bảng `contract_document` (ô giấy tờ theo đợt, chỉ
    có trạng thái) GIỮ NGUYÊN, chỉ đọc; tệp thật của đợt đi qua mục 10.
17. Mọi cửa ghi mới (báo giá, đóng vòng, lịch, đã thu, nhắc, điều kiện) viết
    một dòng `platform.audit`.

Không làm lượt này: sửa trình soạn thư để nhập giá trị/loại; loại duyệt E3 mới;
đổi ma trận quyền mặc định; thống kê theo số lần báo.

## 2 · Hình dạng dữ liệu (định danh tiếng Anh — luật 2)

`sales.quotation`

| cột                         | kiểu                          | ghi chú                                                                                                 |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid PK                       |                                                                                                         |
| `opportunity_code`          | text FK → sales.opportunity   |                                                                                                         |
| `kind`                      | text NULL                     | CHECK trong 3 `ContractKind`; NULL chỉ khi `source` ≠ `manual`                                          |
| `negotiation_no`            | int ≥ 1                       | theo (opportunity_code, kind)                                                                           |
| `round_no`                  | int ≥ 1                       | trong vòng; UNIQUE (opportunity_code, kind, negotiation_no, round_no) — NULL kind coi là một nhóm riêng |
| `amount` / `currency`       | như `contract_money_pair`     | cả hai NULL hoặc cả hai có                                                                              |
| `sent_at`                   | timestamptz                   |                                                                                                         |
| `valid_until`               | date NULL                     | ≥ ngày của `sent_at`                                                                                    |
| `source`                    | text                          | `manual` · `mail` · `backfill`                                                                          |
| `outcome`                   | text                          | `pending` · `won` · `not-closed`                                                                        |
| `closed_at`                 | timestamptz NULL              | có ⇔ outcome ≠ pending                                                                                  |
| `reason_id`                 | text NULL                     | → config_entry (list `QUOTE_REVISION_REASON`); `other` ảo                                               |
| `stop_reason_key`           | text NULL                     | khi đóng vì dừng cơ hội                                                                                 |
| `reason_note`               | text NULL                     | bắt buộc khi `reason_id = 'other'`                                                                      |
| `contract_code`             | text NULL FK → sales.contract | bắt buộc khi `won`                                                                                      |
| `touch_id`                  | NULL                          | dòng touch đi kèm, nếu bảng touch có khoá dùng được                                                     |
| `created_by` / `created_at` |                               |                                                                                                         |

Chỉ mục duy nhất riêng phần: một `pending` cho mỗi (opportunity_code, kind, negotiation_no).
`not-closed` do người ghi tay phải có `reason_id` hoặc `stop_reason_key`; riêng `source='backfill'` được miễn.

`sales.document_step`: `attachment_id` PK/FK → platform.attachment (cascade) ·
`step_kind` (`quotation`|`contract`|`installment`) · `quotation_id` ·
`contract_code` · `installment_no` · CHECK đúng một đích theo `step_kind`.

`sales.contract_installment`: thêm `paid_by_id`, `paid_recorded_at` (ai ghi đã thu, lúc nào).

Backfill trong 0104 (thuần SQL, chạy lại được, không đụng dòng touch):
mỗi touch `quotation-sent` → một `quotation` `source='backfill'`, `kind` NULL,
`amount` NULL, `sent_at = touch.at`; `negotiation_no` tăng mỗi khi vượt qua một
`contract.signed_at` của cơ hội; `round_no` theo thứ tự `at` trong vòng; lần
cuối của vòng đã ký → `won` + `contract_code`; các lần trước nó → `not-closed`;
vòng chưa ký trên cơ hội `lost` → `not-closed` + `stop_reason_key`; còn lại lần
cuối `pending`, các lần trước `not-closed`.

## 3 · Cửa API (gợi ý đường dẫn — contract-drafter chốt tên trong zod)

| Cửa                                                                   | Quyền                                          | Việc                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /sales/opportunities/:code/quotations`                          | Sales · `opportunity.edit` · scoped            | ghi một lần báo: kind, amount, currency, sentAt?, validUntil?, note?, và `supersede: {reasonId, note?}` bắt buộc khi vòng đang có pending |
| `PATCH /sales/opportunities/:code/quotations/:id`                     | như trên                                       | bổ sung kind/amount/validUntil cho lần pending thiếu dữ liệu                                                                              |
| `POST /sales/opportunities/:code/quotations/:id/close`                | như trên                                       | đóng vòng: `{reasonId, note?}`                                                                                                            |
| `GET /sales/opportunities/quotation-reasons`                          | Sales · `opportunity.edit` · unscoped          | danh mục lý do đang bật                                                                                                                   |
| `POST /sales/opportunities/:code/milestones` kind `quotation`         | giữ                                            | đi qua cùng một service ghi báo giá (source `manual`), để cửa cũ và hook thư không tạo sổ thứ hai                                         |
| `PUT /sales/contracts/:code/installments`                             | Sales · `contract.edit` · scoped               | thay toàn bộ các đợt CHƯA thu                                                                                                             |
| `POST /sales/contracts/:code/installments/:no/paid` · `DELETE …/paid` | Sales · `contract.record-payment` · scoped     | ghi / hoàn tác đã thu                                                                                                                     |
| `POST /sales/contracts/:code/installments/:no/records`                | `contract.edit` hoặc `contract.record-payment` | ghi lần nhắc                                                                                                                              |
| `POST …/installments/:no/conditions` · `POST …/conditions/:id/done`   | `contract.edit`                                | thêm / xong điều kiện                                                                                                                     |
| tài liệu workstream: declare nhận `step?`, list trả `step?`           | `workstream.view` · scoped (đã nới, mục 1.11)  |                                                                                                                                           |

Hồ sơ cơ hội (`OpportunityProfileResponse`) thêm một khối `money`:

- `totals`: signed, collected, outstanding, overdue (số tiền + số đợt + ngày trễ lớn nhất), notYetDue (số tiền + số đợt + ngày còn gần nhất), quoting (tổng giá trị các lần pending) — **máy chủ tính**, màn không cộng.
- `open[]`: các vòng chưa ký — kind, amount lần pending, `rounds[]`.
- `contracts[]`: mỗi hợp đồng — code, kind, amount, signedAt, `collected`/`share`, `installments[]` (no, label, share, amount, due, paidAt, `status`: paid | overdue | upcoming, `days`), `rounds[]`, số tệp theo công đoạn.
- `rounds[]` mỗi phần tử: id, roundNo, sentAt, amount, validUntil, outcome, reasonLabel, note, source, số tệp.
  Thứ tự trả về đã xếp sẵn: vòng chưa ký → hợp đồng có đợt quá hạn → còn lại theo ngày ký mới nhất; trong một hợp đồng: đợt quá hạn → sắp tới → đã thu.

## 4 · Màn (apps/web) — theo canvas, đã chốt thứ tự "quan trọng trước"

Chữ trên màn theo `docs/design-system/ui-copy.md`. Tiền viết gọn bằng
`millions()` / `billions()` của `@pv/ui`. Không gõ số vào JSX.

1. **Đầu trang**: tên khách → trạng thái → mã cơ hội (nhỏ). Không đặt nút ghi báo giá ở đầu trang.
2. **Dải số**: ô lớn "Còn phải thu" (kèm dòng quá hạn và dòng chưa đến hạn + thanh ba đoạn) → "Đã thu" → "Đã ký" → "Đang báo giá".
3. **Mỗi vòng chưa ký một section** trên cùng: tên loại · giá trị · nhãn "Chưa ký" · nút "Ghi báo giá" và "Đóng vòng báo giá"; accordion "Báo giá".
4. **Mỗi hợp đồng một section**: tiêu đề (loại · giá trị · mã · ngày ký); khối Thanh toán (% đã thu, a / b, thanh tiến độ, mỗi đợt một ô bấm được: trạng thái → số tiền → tên đợt · tỉ lệ); accordion "Báo giá" (kết quả → giá → lý do → lần · ngày → tệp); accordion "Tài liệu đã ký" (vùng kéo thả của `RunDocuments` + danh sách). Hợp đồng chưa có lịch: "Chưa có lịch thanh toán" + nút nhập lịch nếu có `contract.edit`.
5. **Drawer đợt thanh toán** (bấm một ô đợt): ba ô số (hạn/trạng thái → phải thu → đã thu); "Vì sao chưa thu" = điều kiện; Chứng từ = ô giấy tờ + tệp gắn nhãn đợt + vùng kéo thả; "Đã nhắc"; nút "Ghi lần nhắc" và "Ghi đã thu" theo quyền.
6. **Modal Ghi báo giá**: giá trị → loại hợp đồng → ngày gửi → hiệu lực đến → vùng kéo thả tệp → khối "Lần N · x sẽ đóng là Không chốt" với lý do bắt buộc (chỉ hiện khi vòng có lần pending).
7. **Ngăn Chốt thắng**: chọn lần báo đang chờ (điền sẵn loại và giá trị) + phần các đợt thanh toán.
8. Accordion là component mới `Accordion` trong `@pv/ui` (context chính thêm) — dùng nó, không tự vẽ.
9. Vùng tải tệp dùng lại `DropZone`/`DocList` của `components/run/run-documents.tsx` và mọi chặn sẵn có (loại tệp, 5 MB, 10 tệp một lần, chỉ người tải được xoá).

## 5 · Vùng ghi

| Agent            | Được ghi                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contract-drafter | `packages/contracts/**` (trừ `index.ts` barrel → `sharedRequests`)                                                                                                                                                                                      |
| migration-writer | `**/*.schema.ts` · `apps/api/drizzle/**`                                                                                                                                                                                                                |
| api-builder A    | `apps/api/src/branches/sales/opportunity/**` (trừ schema) · thư mục mới `apps/api/src/branches/sales/quotation/**` · `workstream/workstream-lanes*.ts`                                                                                                  |
| api-builder B    | `apps/api/src/branches/sales/contract/**` (trừ schema) · `workstream/workstream-document.*` · `workstream/workstream.repository.ts` · `lead/lead-scan.mapper.ts`                                                                                        |
| screen-builder A | `apps/web/src/pages/opportunity-*.tsx                                                                                                                                                                                                                   | ts`(trừ`opportunity-events.tsx`) · `apps/web/src/data/opportunities*.ts`·`data/quotations.ts`·`data/contracts.ts`· thư mục mới`apps/web/src/components/deal-money/**` |
| screen-builder B | `apps/web/src/pages/opportunity-events.tsx` + file modal mới cạnh nó · `components/run/**` · `components/sign-drawer.tsx` · `components/opportunity-stop.tsx` · `data/workstream-documents.ts` · `data/quotations-write.ts` · `data/contracts-write.ts` |
| context chính    | `packages/ui/**` · mọi `index.ts` barrel · `apps/web/src/kit/**` · `packages/engines/**` · seed                                                                                                                                                         |

Ngoài vùng: ghi vào `sharedRequests` trong báo cáo, không tự sửa.

## 6 · Bổ sung sau khi contract zod xong (context chính chốt, 12/10)

Tên schema, field, đường dẫn: đọc thẳng `packages/contracts/src/sales/quotation.ts`,
`contract-schedule.ts`, `contract.ts` (`ContractSignShape`, `InstallmentDraft`,
`InstallmentStatus`), `opportunity-profile.ts` (`OpportunityMoney`),
`workstream-document.ts` (`WorkstreamDocumentStep`). Đó là nguồn; mục 3 ở trên chỉ là phác.

1. **Cửa `milestones` không còn nhận `quotation` từ web**: trả lỗi chỉ sang cửa
   `quotations`. Hook thư gọi thẳng service báo giá với `source='mail'` (kind,
   amount NULL). Kiểm mọi caller khác của `lifecycle.milestone('quotation')`.
2. **`negotiation_no` tăng** mỗi khi vòng trước của loại đó đã đóng (đã ký, hoặc
   đóng không ký). `money.open[]` gồm vòng đang có lần pending (xếp trước) và
   vòng đã đóng không ký (`pendingId: null`).
3. **Lần pending thiếu loại** (thư/backfill) là nhóm riêng; lần ghi tay cho loại
   X không đụng tới nó. `PATCH` gán loại thì nó nhập vào vòng đang mở của loại
   đó thành lần kế tiếp (đánh số lại dưới khoá); loại đó đã có lần pending → 409.
4. **Tiền tệ của `totals`**: tiền tệ cơ hội, không có thì của hợp đồng ký đầu
   tiên, không có nữa thì VND; tiền tệ khác không cộng (như `signedTotal`).
5. `outstanding` = đã ký − đã thu. `overdue` + `notYetDue` chỉ tính đợt có lịch.
6. **Quyết định 12 thu hẹp**: thiếu `contract.view` thì `paymentsVisible:false`,
   `installments: []`, số thu = 0; tiêu đề hợp đồng và các lần báo vẫn trả
   (như `contracts` hiện có). `money.can.{editSchedule,recordPayment}` do máy chủ tính.
7. Lần nhắc ghi `contract_record.state = 'done'`. Ghi chú lúc gửi báo giá nằm ở dòng touch.
8. `rounds` mới nhất trước. `QuotationRow.expired` do máy chủ tính.
9. `JourneyDealSubStep.round` = `roundNo` trong vòng.
10. Việc ngoài vùng do context chính áp: barrel contracts (xong), `config.mapper/service/repository` cho danh mục mới, seed.

## 7 · Tầng bảng đã xong (migration 0104, đã thử trên PGlite) — tên để code

- `sales.quotation` → export drizzle `quotation` (`QuotationRowDb`, `QuotationValues`) ở
  `apps/api/src/branches/sales/quotation/quotation.schema.ts`. Đọc file đó lấy tên cột và CHECK.
- `sales.document_step` → export `documentStep` ở `workstream/workstream-document.schema.ts`.
- `sales.contract_installment` thêm `paid_by_id`, `paid_recorded_at`.
- Danh mục `QUOTE_REVISION_REASON` (mã `QR-NN`) đã gieo trong 0104; không có CHECK nào liệt kê `list`.

Ràng buộc mà tầng API phải tôn trọng (sai là 23514/23505):

1. Chỉ mục duy nhất dùng biểu thức `coalesce(kind,'')`; `onConflict` nhắm vào đó phải viết đúng biểu thức. Các lần thiếu loại của một cơ hội là MỘT nhóm.
2. Dòng `pending` và `won` không được mang `reason_id` / `stop_reason_key` / `reason_note`. Dòng `not-closed` ghi tay phải có một trong hai lý do. `closed_at` có ⇔ không còn pending.
3. Dòng `source='manual'` phải có `kind` và `created_by`.
4. **Mọi dòng báo giá mới phải ghi `touch_id`** của dòng touch `quotation-sent` đi kèm — nếu không, lần chạy lại backfill sau deploy sẽ sinh bản trùng.
5. Hoàn tác đã thu: xoá `paid_at`, `paid_by_id`, `paid_recorded_at` trong CÙNG một UPDATE.
6. `PUT …/installments`: cập nhật tại chỗ theo `no`, không xoá-rồi-chèn (xoá đợt là cuốn mất nhãn tài liệu của đợt đó qua FK cascade).
7. Ba hàng rào thêm ngoài đặc tả được giữ: `quotation_manual_has_author`, `quotation_reason_only_not_closed`, `quotation_no_blank`.

## 8 · Lượt sửa sau hai lượt soát (12/10) — contract đã đổi, đọc lại file zod

Contract đã đổi (context chính sửa xong, mọi bên code theo):

- `OpportunityProfileResponse.signedTotal` **bỏ** (trùng `money.totals.signed`).
- `OpportunityMoney.can` (cấp cơ hội) **bỏ**. Mỗi `OpportunityMoneyContract` có `paymentsVisible` và `can.{editSchedule,recordPayment}` riêng, xét theo ĐÚNG phạm vi của cửa hợp đồng (hợp đồng ngoài phạm vi người đọc: `paymentsVisible:false`, `installments:[]`, `collected:0`, `can` false cả hai). `money.paymentsVisible` = có ít nhất một hợp đồng thấy được; `totals` chỉ cộng các hợp đồng thấy được.
- `ContractInstallmentsBody.installments[]` là `InstallmentEdit` = `InstallmentDraft` + `no?`. Có `no` = giữ đợt chưa thu đó (điều kiện, lần nhắc, tệp ở lại với nó); không có = đợt mới (số = max(no)+1…); đợt chưa thu không có trong danh sách = xoá. KHÔNG gán lại số theo vị trí.
- `OpportunityMilestoneBody.kind` chỉ còn `CareActivityKind`.

A. Migration (migration-writer)

1. Câu backfill cuối 0104: lần chạy đầu giữ nguyên kết quả đã chứng minh; nhưng KHÔNG được sửa dòng đã có (bỏ `DO UPDATE`, thành chỉ-chèn).
2. Viết riêng một câu "vá khoảng trống" chạy sau deploy: chỉ chèn cho touch `quotation-sent` chưa có dòng sổ, thành vòng thiếu-loại kế tiếp (`negotiation_no = max+1` của nhóm thiếu loại, `round_no = 1`, `pending`), không đụng dòng nào đã có. Đặt ở nơi `/ship` gọi được (script), và nói rõ lệnh.
3. Seed helper `apps/api/src/seed-quotation.ts` đang lấy "khúc cuối" của 0104 — giữ cho nó vẫn đúng (backfill phải vẫn là câu cuối, hoặc báo lại để context chính sửa helper).
4. Cắt chú thích đầu file SQL về ≤ 15 dòng; phần văn xuôi để ADR 0090.

B. API (api-builder)

1. `QuotationService.money`: xét từng hợp đồng theo phạm vi của cửa hợp đồng (`ContractRepository.inScope` / cùng luật `GET /sales/contracts/:code`) + `contract.view`; điền `paymentsVisible` và `can` từng hợp đồng như trên.
2. `WorkstreamDocumentService`: `fence` trả về nhánh nào cho qua; `list` chỉ kèm tệp scan của lead khi qua bằng nhánh GIỮ LEAD và có `lead.view`. Người chỉ đứng trên cơ hội không nhận tệp scan.
3. `PUT …/installments` theo `InstallmentEdit` như trên (cập nhật theo `no`, chèn mới sau max, xoá đúng đợt chưa thu bị bỏ; `no` trỏ đợt đã thu hoặc không tồn tại → 409/404 kèm câu báo).
4. `winRound` (lúc áp chữ ký): từ chối khi loại lần báo khác loại hợp đồng; lần báo thiếu loại thì nhận loại của hợp đồng khi thắng.
5. Bỏ `signedTotal` khỏi service/profile; dọn `signedTotalOf` nếu hết người gọi.
6. Thay thế lần cũ khi ghi lần mới: `closed_at = max(sentAt lần cũ, sentAt lần mới)`.
7. PATCH một dòng `source='backfill'`: đổi `source` thành `manual` khi đã có đủ loại + người sửa (thoả CHECK), để không còn là dòng backfill.
8. Sửa docblock cửa `milestones` (controller + service) cho đúng: chỉ hoạt động chăm sóc.

C. Web (screen-builder) — gom cả soát luật và soát Aurora

1. Đọc `paymentsVisible`/`can` theo từng hợp đồng; bỏ mọi chỗ đọc `money.can`, `signedTotal`.
2. Trình sửa lịch mang `no` của đợt đang có; thêm nút "Sửa lịch thanh toán" khi hợp đồng đã có lịch và `can.editSchedule`.
3. Drawer đợt: bỏ ba `StatCard`, dùng hai ô phẳng không nền ("Phải thu" · "Hạn thanh toán" kèm dòng trạng thái); điều kiện hiện MỘT lần, nút "Đánh dấu xong" nằm ngay trên dòng; một cách gọi bên ("Bên mình"/"Bên khách") và một định dạng ngày; hàng nút hành động đưa vào `footer` của Drawer; `gap-6` + `SectionTitle`; câu từ chối khi 404 (không phải `forbidden`).
4. `run-documents.tsx:213` dòng lỗi tải tệp: `text-destructive-foreground` (đang 3.73:1 ở nền tối). "Xem thêm (n)" thêm `pointer-coarse:h-12`. `StepDocuments`: danh sách trước, vùng thả sau.
5. `SignDrawer` rộng `lg` (hoặc container query) để ô tỉ lệ/số tiền/ngày của trình sửa lịch không cắt chữ; số thứ tự dòng hiện cả trên điện thoại; câu cân bằng chỉ ở MỘT chỗ (trình sửa), footer chỉ lỗi/đang lưu.
6. Ô đợt trên màn: dòng ba là `{tên đợt} · {tỉ lệ}%`; bỏ đuôi "/ giá trị" lặp lại trong khối Thanh toán.
7. Section vòng chưa ký: tiêu đề chỉ loại + giá trị, nhãn trạng thái nằm ở dòng lần báo (không lặp hai cách gọi).
8. Một bộ format tiền, một bảng nhãn kênh (`RECORD_CHANNEL_LABEL`, đổi "Trong app" → "Trong PV One"); một cách gọi thiếu loại/giá ("Chưa ghi loại" / "Chưa nhập giá trị"); props kiểu lấy từ `@pv/contracts`, không `string | null` + ép kiểu.
9. Chữ: "Bổ sung" → "Bổ sung thông tin"; "Hoàn tác" → "Hoàn tác đã thu"; "Đã nhắc gì" → "Nội dung đã nhắc"; tiêu đề điều kiện một tên "Điều kiện thu tiền"; nhãn nút "Mở vòng báo giá mới" → "Ghi báo giá" (modal tự xử lý vòng); `QUOTE_HINT` viết lại: thư mẫu báo giá tự ghi một lần, cần bổ sung giá trị và loại.
10. `installment-detail.tsx:241-250`: nút toast cũ nối vào cửa thật (`contract.edit`, đánh dấu điều kiện xong) hoặc bỏ.
11. `DealEventModal`: `open: boolean` thay `kind`.
12. Accordion lệch 16px so với tiêu đề thẻ, focus-visible, `aria-controls` chỉ khi mở: thuộc `@pv/ui` — context chính sửa, đừng đụng.

## 9 · Backfill sau lượt sửa (thay cho ghi chú "chạy lại backfill" ở mục 7.4)

- Câu backfill cuối 0104 chỉ chèn, theo từng cơ hội: cơ hội đã có dòng sổ thì bỏ qua cả cơ hội. Không chạy lại nó sau deploy.
- Vá khoảng giữa migrate và deploy: `pnpm --filter @pv/api db:backfill:quotation-gap` (xem trước) rồi thêm `--apply`. Touch `quotation-sent` chưa có dòng sổ thành lần 1 của vòng thiếu-loại kế tiếp, `pending`; không sửa dòng nào đã có.
- Thứ tự ship: migrate → deploy API → vá khoảng trống → push web.
- Quy tắc 7.4 vẫn bắt buộc: dòng báo giá mới thiếu `touch_id` sẽ bị vá thành bản trùng.
