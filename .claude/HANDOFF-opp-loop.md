# Cơ hội trong hành trình lặp lại — soát từng luồng (29/09/2026)

Bản này làm cho **phase Sale** đúng việc `HANDOFF-workstream-loop.md` đã làm
cho Presale. Mỗi bậc được soát theo bốn câu: bậc con là gì, cái gì kích hoạt,
dữ liệu đã có chưa, còn hở ở đâu. **Chưa có ADR phase Sale, chưa có code mới.**
Nguồn: code (API và web), ADR 0020–0034, 0057, 0060, 0064, 0067, 0068,
canvas https://claude.ai/artifact/GWVAqJSDxm87NwbgT6eGB5 (E-Model, E-Main,
E-Deal, E-Fall, hàng F).

Tóm lại: năm bậc và các cửa ghi mốc đã chạy thật và rõ. Ba chỗ từng hở là dừng /
kéo lại, bậc con của Quotation và sau khi ký. Cả ba **đã chốt 29/09** (xem "Đã
chốt"). Chỉ còn S3 (nhãn) và số mức của thang hạn trước khi viết ADR.

## Hiện trạng code — máy trạng thái của cơ hội

- `sales.opportunity.state` ∈ `open` "Đang triển khai" · `care` "Danh sách chăm
  sóc". `won` "Thành hợp đồng" không lưu, suy ra từ việc có dòng `sales.contract`.
- `stage` ∈ `new` · `assigned` · `sample` · `poc` · `quotation`, và bằng NULL
  khi cơ hội rời bàn (care hoặc đã ký). CHECK giữ `care` đi kèm đủ ba trường
  `care_from_stage`, `care_reason`, `closed_at`.
- Chỉ `OpportunityMoves` ghi bậc. Mỗi lần đổi bậc, cùng giao dịch đó ghi:
  `opportunity_stage_event`, một touch, dòng mirror, và `syncClosed` khi cần.

| Chuyển                           | Kích hoạt                                                            | Chặn                                                                              |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| tạo → `new` / `assigned`         | `POST /sales/opportunities`, convert, import                         | lead trong phạm vi, không `disqualified`; ≥1 SALE                                 |
| `new` → `assigned`               | PATCH chủ làm bộ PIC đủ điều kiện (1 `head-of-sales` + 1 người khác) | không rút PIC dưới ngưỡng                                                         |
| → `sample` / `poc` / `quotation` | bấm "Ghi mốc X" → `POST /:code/milestones`                           | từ `assigned` trở lên, không lùi, được nhảy; ghi lại mốc đang đứng chỉ thêm touch |
| → `care`                         | "Đẩy sang danh sách chăm sóc" → `POST /:code/care {reasonKey}`       | lý do trong `LOSS_REASON` đúng bậc; `other` bắt buộc ghi chú                      |
| `care` → `open`                  | "Mở lại" → `POST /:code/reactivate`                                  | về lại đúng bậc đã dừng (`care_from_stage`)                                       |
| → won                            | "Chốt thắng" → `POST /:code/contract` → E3 giám đốc duyệt → `apply`  | phải có touch `quotation-sent`; một đề nghị đang chờ                              |

Khi ký xong, `apply` tạo **đúng một** hợp đồng, rồi gọi `syncClosed`. Hàm này
đóng hành trình **WON** khi lead đã có hợp đồng và không còn cơ hội nào sống.
Cơ hội vào `care` thì hành trình **không** đóng Thua, vì LOST chỉ đọc
`lead.disqualified`.

## Luồng đích theo từng bậc

| Bậc            | Kích hoạt                                   | Bậc con / bằng chứng                                                   | Đã có dữ liệu?                                                                                                                                                                                                | Hở                                             |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Khởi tạo opp   | convert từ lead · tạo ở hành trình · import | từ lead nào, ai mở                                                     | có (touch `entered-pipeline`, cạnh E1 `spawned`)                                                                                                                                                              | —                                              |
| Nhận PIC       | bộ PIC đủ điều kiện                         | ai được thêm, lúc nào                                                  | có (stage_event)                                                                                                                                                                                              | "người giữ" của cơ hội là ai trong bộ PIC (S9) |
| Sample (tuỳ)   | bấm ghi mốc; **mẫu thư gắn mốc** (A4)       | các lần gửi sample                                                     | có touch `sample-sent`; A4 **chưa có** (mẫu thư không có trường mốc)                                                                                                                                          | S4                                             |
| POC (tuỳ)      | bấm ghi mốc                                 | canvas: Chuẩn bị dữ liệu → Chạy POC → Tổng kết với khách               | chỉ có touch `poc-run`; ba bước con **không có dữ liệu, không có điểm kích hoạt**                                                                                                                             | S5                                             |
| Quotation      | bấm ghi mốc; mẫu "Báo giá" (A4)             | canvas: Gửi lần n · Soạn lần n+1 · Chờ duyệt chiết khấu · Chờ duyệt ký | Gửi lần n: có (lặp touch `quotation-sent`). Chờ duyệt ký: có (`approval` `contract-sign`, `pendingSign`). **Chờ duyệt chiết khấu: không có**, vì chưa có đối tượng BG, chưa có kind duyệt, ngưỡng còn mở (#6) | S5                                             |
| Thành hợp đồng | E3 duyệt ký                                 | hợp đồng thứ n                                                         | chỉ **một** hợp đồng; service chặn ký lần hai, DB không UNIQUE                                                                                                                                                | S6, S7                                         |
| Dừng           | người bấm + lý do                           | ngày, bậc, lý do, người kết luận                                       | có (các cột `care_*` + stage_event)                                                                                                                                                                           | S1, S2, S12                                    |

Cửa đọc hành trình (`apps/api/src/branches/sales/workstream/workstream-lanes.ts`)
hiện trả như sau:

- `subSteps: []` với mọi cơ hội, nên drawer không có bậc con nào để vẽ.
- Bậc bị nhảy qua được trả là `done` không ngày; trạng thái `skipped` chưa bao giờ được phát.
- Việc tiếp theo của `OP-` luôn null, vì chưa có cửa ghi.
- Liên kết hành trình trước và sau luôn rỗng.

## Chín luồng chung áp vào cơ hội

- **C · Dừng và kéo lại.** Ba nguồn đang nói ngược nhau:
  - ADR 0067 D2: dừng cơ hội không sinh lead, chỉ ghi một bản ghi dừng.
  - Canvas và HW "Luật": dừng thì có một lead chờ mới (LD-0205); kéo lại mở hành trình mới.
  - ADR 0068: lead quay vòng tại chỗ, giữ mã, hành trình và người giữ. Luật này đã đưa đúng mẫu "kích hoạt lại tại chỗ" của 0064 trở lại cho lead.
  - Bản ghi dừng và danh mục lý do chung chưa bao giờ được dựng. Trong code không có `stop_reason` hay `stop_record`.
  - Xem S1, S2, S12.
- **A · Gửi mail.** Thư gửi từ cửa cơ hội không đổi gì. Mẫu thư gắn mốc chưa có. Khách trả lời trên cơ hội thì đẩy gì vẫn là câu mở #27 (S8).
- **D · Người giữ.** Server không kế thừa người giữ từ lead: body tự khai `saleOwners`. Bàn giao lead chỉ kéo theo việc tiếp theo của lead, không kéo cơ hội. Không có cửa giao riêng cho cơ hội (S9).
- **E · Dòng hoạt động.** Có hai nguồn riêng: touch và `opportunity_stage_event`. Luật E1 là gộp làm một và sửa lỗi thư từ cơ hội rơi khỏi lịch sử. Luật này trái với ADR 0018 mặc định 5, mà chưa ADR nào ghi việc lật.
- **G · Việc tiếp theo.** Bảng `sales.next_step` đã nhận mã `OP` nhưng chưa có cửa. Dừng hoặc ký không xoá việc đang mở. Còn lệch số mức của thang hạn: G3 nói 6 mức, 0067 D11 nói 3. Mỗi bậc có hạn nằm (`limitDays`, 21 ngày) → S10.
- **H · Chuông.** Còn hai mail nội bộ `opportunity-opened` và `opportunity-lost` mà luật H đã bỏ, cần thay bằng chuông (S11).
- **I · Liên kết.** Luật I quy định: nhu cầu phát sinh trong lượt bán đang chạy thì thêm cơ hội vào cùng hành trình; nhu cầu phát sinh khi đang triển khai hoặc đang dùng thì mở hành trình mới. Cạnh "nối từ" giữa hai hành trình chưa có.
- **J · Tài liệu.** Tệp đính kèm của cơ hội chỉ lưu tên và dung lượng, không có tệp thật. Luật J1 "máy sinh PDF báo giá" trái với ADR 0029 "không sinh PDF ở máy chủ".
- **K · Nhập/xuất.** Nhập cơ hội giữ như hiện tại. Nhập hợp đồng cũ thuộc Postsale.

## Đã chốt 29/09/2026 (chủ dự án, trong chat)

- **S1 · Cơ hội dừng là mất.**
  - Không còn kéo lại, bỏ cửa `POST /:code/reactivate` và nút "Mở lại". Nuôi lại thì đi từ lead.
  - Mỗi lần dừng ghi **fail log**: bậc đang đứng, lý do, ghi chú, ai kết luận, lúc nào.
  - Các cột `care_from_stage`, `care_reason`, `care_note`, `closed_at` cộng `stage_event.by_id` đã chứa đủ các trường này.
  - Khoá `care` đổi nghĩa thành "mất", nên cần đổi tên khoá (đề xuất `lost`) và nhãn. Hai việc này đi vào S3.
- **Lead về "Nhóm chờ chăm sóc" khi cơ hội cuối cùng dừng.**
  - Điều kiện: không còn cơ hội nào sống và chưa ký hợp đồng nào. Khi đó lead đi `converted` → `nurturing` và giữ người giữ (0068 §4).
  - Còn cơ hội khác đang chạy, hoặc đã ký, thì lead giữ nguyên `converted`.
- **S2 · Hành trình đóng Thua** khi chưa ký gì và mọi cơ hội đã dừng.
  - Lead sau đó được hâm lại theo 0068 (trao đổi thật, hoặc bấm tay). Khi đó **cùng hành trình mở lại**, cùng lead, cùng người giữ.
  - Cơ hội mới mở ra sẽ nằm cạnh các cơ hội đã mất. `syncClosed` đang tự mở lại hành trình đã đóng, nên chỉ phải đổi điều kiện LOST: thôi đọc `lead.disqualified`, đọc "mọi cơ hội đã mất, không có hợp đồng".
- **S6 · Ký thêm hợp đồng được ngay trên cơ hội đã thắng.**
  - Mỗi lần đề nghị ký, người đề nghị nhập giá trị và loại hợp đồng. E3 giám đốc duyệt như lần đầu.
  - Giá trị cơ hội giữ nguyên, không cộng dồn.
  - Hệ quả phải làm:
    - danh mục loại hợp đồng và cột `contract.kind`;
    - cửa ký nhận cơ hội đã thắng;
    - không thêm UNIQUE trên `contract.opportunity_code`;
    - `WorkstreamOpportunity.contractCode` đổi thành danh sách.
  - ADR 0022 ("giá trị hợp đồng lấy từ bản báo giá khách chốt") hoãn tới khi có BG.
- **S7 · "Ký là đóng WON" giữ nguyên** cho tới lượt thang hợp đồng (Postsale).
- **S4, S5, S8–S12 theo đề xuất:**
  - S4: mẫu thư gắn mốc `sample` hoặc `quotation`.
  - S5: bậc con lượt này chỉ gồm "Gửi lần n" và "Chờ duyệt ký". Chiết khấu đợi BG; bước con của POC dùng việc tiếp theo.
  - S8: khách trả lời thì ghi dòng hoạt động và báo chuông, không đẩy bậc.
  - S9: người giữ là SALE đầu tiên không phải `head-of-sales`, mặc định lấy người giữ lead. Bàn giao lead đánh dấu sẵn cơ hội đang mở.
  - S10: cửa việc tiếp theo cho `OP-`. Xoá việc đang mở khi cơ hội mất hoặc khi ký.
  - S11: ba chuông thay mail — hoãn sang lượt chuông riêng (xem "Chốt thêm").
  - S12: giữ `LOSS_REASON`, thêm cờ "Không liên hệ" và lý do áp mọi bậc.

## Chốt thêm 29/09 (lượt lập kế hoạch)

- **S3 · Nhãn.** Cơ hội đã dừng: khoá `lost`, nhãn "Đã dừng". Cơ hội đang mở: khoá `open`, nhãn "Đang chạy" (thay "Đang triển khai").
- **S10 · Thang hạn.** Việc tiếp theo của cơ hội dùng 3 mức như lead (0067 D11, `stepLevelOf`).
- **S11 · Chuông để lượt riêng** cho mọi đối tượng. Lượt này giữ nguyên hai mail nội bộ `opportunity-opened` và `opportunity-lost`.
- **Còn treo khi dựng:**
  - Đếm bộ `LOSS_REASON` và số cơ hội đang `care` trên Neon (chỉ đọc) trước `/ship`.
  - Kiểm `lead_email_live_idx` khi lead về `nurturing` sau hành trình Thua.

## Trạng thái — 29/09/2026 (cuối lượt dựng)

Đã dựng xong, chưa commit:

- ADR 0069.
- Contract.
- Migration 0068 (có backfill đưa lead về nhóm chờ).
- API: cửa dừng; ký lần n; `syncClosed` và lead về nhóm chờ; việc tiếp theo cho `OP-`; người giữ `holderOf`; bàn giao kéo cơ hội; mẫu thư gắn mốc qua hook có kiểm quyền; hook gửi thư thành danh sách.
- Web: màn cơ hội, màn hành trình (fail log trên cơ hội mất), ô chọn mốc trên mẫu thư.
- Mock.

Đã qua:

- rules-reviewer, aurora-reviewer, dataflow-tracer (một vòng sửa);
- typecheck, lint, 155 test.

Làm song song với phiên b2 (ADR 0070, migration 0069–0071):

- Commit: a4 commit trước, b2 sau, mỗi phiên chỉ file của mình.
- Ship: chung một lần, migrate 0068–0071 rồi deploy.
- Không deploy riêng: E2 so người giữ bằng id, nên cần cả hai phần.

Trước `/ship`: chạy `.claude/ship-preflight-0068.sql` trên Neon (chỉ đọc).

- Truy vấn 2 phải chỉ có open → LOST.
- Truy vấn 4 phải bằng 0.
- Truy vấn 5 đếm thư chưa gửi mà migration không giữ lại.

Nợ đã trả (29/09, lượt sau ship):

- khoá cơ hội khi mở đề nghị ký;
- E3 so người duyệt bằng id (`seatedIn`, có test);
- `api.write` kiểm `schema`;
- bàn giao chọn từng cơ hội (`dealCodes`);
- `JourneyLead.state`;
- hover nút ở theme Đá mịn (biến thể `stone:`).

Nợ còn lại:

- Stop, ký, mốc, việc tiếp theo không ghi `platform.audit`. Chưa có quyết định cửa nào phải ghi.
- Mốc mẫu thư đọc lúc gửi, không chụp lúc xếp hàng (cần cột trên `mail_run`).
- `platform.approval.decided_by` còn là tên; chưa có cột id.
- ADR §12 (một dòng hoạt động trên màn cơ hội) chưa làm, cần chốt giao diện.
- Chuông: lượt riêng.

## Việc tiếp theo, theo thứ tự (đã xong tới bước 3; code lên production 29/09)

1. Chốt S3 và S10 (nhãn, số mức thang hạn).
2. ADR "Cơ hội trong hành trình lặp lại" qua `doc-keeper`. ADR này thay:
   - 0064 §3 và §6 (kích hoạt lại tại chỗ, lý do theo bậc);
   - 0067 D2 (bản ghi dừng riêng cho cơ hội);
   - 0022 (hoãn tới khi có BG).
     Ghi luôn việc lật 0018 mặc định 5, và đánh dấu xong câu mở #5 và #27.
3. Chạy lại chuỗi như Presale, gom bằng `/build`: contract → migration (đổi khoá `care`, `contract.kind`, cờ lý do) → API (cửa dừng, bỏ reactivate, `syncClosed` LOST, lead về nhóm chờ, ký lần n, việc tiếp theo `OP-`, chuông, mốc từ mẫu thư) → web (bỏ "Mở lại", ký thêm, thẻ việc tiếp theo, bậc con trong drawer).
