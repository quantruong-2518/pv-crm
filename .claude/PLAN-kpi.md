# PLAN · KPI khép kín (22/10/2026)

Thiết kế đích: https://claude.ai/artifact/BtqKiRSNRWhtMEAABj4FHu (sáu nguyên tắc, Q1–Q11, ma trận ngoại lệ, lộ trình).
Trạng thái lượt trước: `.claude/HANDOFF-kpi.md`. Đợt 0 đã lấy migration **0133**, ADR **0112**
(origin đã dùng 0128–0132 và ADR 0107–0111; ADR 0110 "hợp đồng thuộc người chốt" liên quan Q10).

## 1 · Vòng chuẩn cho MỘT lát

Một đợt chia thành nhiều lát. Mỗi lát đi đủ 11 bước, không nhảy bước.

| #   | Bước                                           | Ai làm                                                                             | Model · effort                        | Đầu ra                                                              |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| 1   | Truy hiện trạng: luồng dữ liệu, quyền          | `dataflow-tracer` (+ `Explore` nếu rộng)                                           | sonnet high · opus nếu đụng quyền     | Bảng endpoint · quyền · lỗ hổng                                     |
| 2   | ADR + kịch bản nghiệm thu                      | Context chính                                                                      | opus                                  | `docs/decisions/01xx-*.md` nháp · `.claude/acceptance/kpi-<lát>.md` |
| 3   | Contract zod                                   | `contract-drafter`                                                                 | sonnet medium · opus nếu đổi bất biến | `packages/contracts/src/sales/kpi*.ts`                              |
| 4   | Bảng + migration, chứng minh CHECK             | `migration-writer`                                                                 | opus high                             | `*.schema.ts` · `apps/api/drizzle/01xx_*.sql`                       |
| 5   | API                                            | `api-builder`                                                                      | opus high                             | `apps/api/src/branches/sales/kpi/**`                                |
| 6   | Màn                                            | `screen-builder`                                                                   | opus high                             | `apps/web/src/pages/sales/kpi/**` · `data/**`                       |
| 7   | Áp `sharedRequests` (routes, barrel, `@pv/ui`) | Context chính                                                                      | opus                                  | —                                                                   |
| 8   | Soát song song, lặp tới sạch                   | `rules-reviewer` · `aurora-reviewer` (có màn) · `dataflow-tracer` (soát quyền lại) | opus high                             | Bảng phát hiện, 0 dòng mở                                           |
| 9   | Nghiệm thu máy                                 | `acceptance-runner` trên PGlite                                                    | sonnet high                           | Bảng Kỳ vọng / Thật / Khớp                                          |
| 10  | Cổng                                           | Context chính, **chỉ một người chạy**                                              | —                                     | `pnpm check` tầng 2 xanh trên commit đã dựng                        |
| 11  | Nghiệm thu người                               | Bạn, trên app chạy PGlite rồi trên bản thật                                        | —                                     | Duyệt màn (luật 12 · 13 · chữ trên màn)                             |

Bước 3 và 4 chạy song song khi không chờ nhau; bước 5 chờ 3 và 4; bước 6 chờ 3 (đọc contract, không chờ API).
Agent dựng nào hỏng vì bài khó: nâng effort trước, vẫn hỏng mới lên model (theo `/dispatch`).

**Kịch bản nghiệm thu viết ở bước 2, trước khi dựng.** Mỗi bước có kỳ vọng bằng con số hoặc trạng thái DB cụ thể,
tính tay sẵn. Không viết kịch bản sau khi đã thấy kết quả.

**Test:** CLAUDE.md cấm tự sinh test. Với hàm tính thuần (chia theo ngày, điểm tổng, khoảng hở) đề nghị cho phép
một file test cạnh hàm — **cần bạn đồng ý từng lần**.

## 2 · Điều kiện sync master (cả năm phải đúng)

1. Soát xong, không còn phát hiện mở. 2. Nghiệm thu máy khớp 100% (lệch là sửa, không "chấp nhận lệch nhỏ").
2. `pnpm check` xanh trên commit. 4. Migration là **cộng thêm**; thứ phá đi tách sang lần ship sau.
3. Bạn duyệt màn trên app chạy PGlite.

Thứ tự sync: rebase `origin/master` → `/check` → hỏi rồi commit → **bạn chạy** `! migrate` lên Neon (memory
`lenh-ghi-production-nho-nguoi-dung`) → tôi đọc `pg_constraint`/`information_schema` xác nhận → `deploy-guardian`
ship API + healthz → push master (web tự build) → bạn thử trên bản thật → cập nhật trang Vòng KPI (đổi ô sang
"đang chạy") + memory.

## 3 · Các đợt

### Đợt 0 · Cứu nhánh `kpi-optimize` — sync ngay

| Lát | Việc                                                                                                                    | Agent                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0a  | Đổi ADR 0107 → 0112 và mọi chỗ trỏ tới (0082, 0099, 0101, index, routes.tsx, comment)                                   | `doc-keeper` (sonnet medium) + context chính cho code |
| 0b  | Rebase lên origin/master; viết lại migration 0128 → **0133**, CHECK chuông = HỢP danh sách mới nhất của origin + 3 kind | context chính rebase · `migration-writer` viết SQL    |
| 0c  | Soát + nghiệm thu                                                                                                       | `rules-reviewer` · `acceptance-runner`                |

Nghiệm thu: gửi gói → chuông `kpi-allocation-waiting` tới mọi người giữ `kpi.set-target` trừ người gửi; đề xuất trong
nhóm → chỉ trưởng nhóm nhận; ngày 1 → `kpi-month-unclosed` đúng một lần; trưởng nhóm mở được trang thành viên, người
ngoài nhóm bị 403; trên Neon CHECK có đủ kind của origin (không rơi `contract-terminated`).
`leadLocked` để sang Đợt 1c (người tạm thay giải luôn).

### Đợt 1 · Khoá dữ liệu

**Đã chốt 22/10 (người dùng):** 1a cho ghi ngày thật, tự sinh điều chỉnh (ADR 0115, migration 0136); 1b ngưỡng 5× · 40%;
1c người vắng tự khai khoảng ngày + người thay, GĐ/TP khai thay được, không khai thì về người giữ `kpi.set-target`;
phạm vi chỉ việc chờ KPI (E3 để sau). Trạng thái: Đợt 0 commit 82662d2 (chờ migrate 0133); 1d commit 0799042
(ADR 0114, migration 0135 — chỉ lên Neon SAU 0134 của phiên cây chính).

| Lát | Việc                                                                                                                                                                                   | Nghiệm thu chính                                                                                                                                                                                                                               | Sync       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1a  | **Sổ điều chỉnh** `sales.kpi_adjustment`: tự ghi khi hợp đồng thanh lý, sửa giá trị, đổi người chốt sau khi tháng ký đã chốt; yêu cầu điều chỉnh tay (nhập sai) qua trưởng phòng duyệt | HĐ 100tr ký tháng 9 → chốt 9 → thanh lý tháng 10: tháng 9 hiện chốt 100tr / sau điều chỉnh 0; tháng 10 người đó −100tr và cơ hội thắng −1. Sửa 100→80 sau chốt: tháng hiện tại −20tr. Ký và thanh lý cùng tháng chưa chốt: không sinh dòng nào | Riêng      |
| 1b  | **Cổng trước chốt**: hộp chốt liệt kê lý do quá hạn chờ, đề xuất chưa xử lý, gói chưa duyệt, cờ đột biến; chốt vẫn được, danh sách lúc chốt được lưu                                   | Dựng mỗi loại một ca → cổng đếm đúng từng loại; sau chốt đọc lại được danh sách                                                                                                                                                                | Riêng      |
| 1c  | **Người tạm thay** cho mọi việc chờ KPI; không khai báo thì về người giữ `kpi.set-target` (cấp trên trong cây khi có Đợt 2); gỡ `leadLocked`                                           | Khoá trưởng nhóm → đề xuất mới và chuông tới người tạm thay; hết hạn uỷ quyền → về người chính; không khai báo → người giữ quyền đặt chỉ tiêu                                                                                                  | Riêng      |
| 1d  | **Cờ "mặc định nhận"** tách khỏi "đã xác nhận" trên mọi màn KPI                                                                                                                        | Dòng quá hạn hiện "mặc định nhận" ở KPI của tôi · trang nhóm · KPI công ty                                                                                                                                                                     | Gộp với 1a |

Rủi ro cao nhất: 1a (số tiền sai mà cổng vẫn xanh) → `dataflow-tracer` chạy model opus; nghiệm thu thêm một bước
so toàn bộ số KPI tháng 9–10 trước và sau lát (phải giống hệt, trừ chỗ kịch bản cố ý đổi).

**Kết quả truy 1a (22/10, đã chạy):** không cửa nghiệp vụ nào xét tháng đã chốt; thẻ đóng băng nhưng danh sách
đóng góp và biểu đồ tuần vẫn chạy live. Không có cửa sửa giá trị hợp đồng sau ký. Những chỗ số trôi hoặc biến mất:
thanh lý (tháng chốt giữ nguyên, tháng hiện tại còn mất luôn tiền đã thu của hợp đồng đó); ghi thu lùi ngày vào tháng
đã chốt; duyệt yêu cầu ký sau chốt (`signedAt` lấy lúc gửi, không giới hạn ngày); huỷ thu rồi thu lại (đếm hai lần);
vô hiệu/khôi phục lead (lệch lớn nhất); đổi làn BD/SALE trên cơ hội đã thắng (PATCH không có dòng audit).
**Kết quả truy 1c (22/10):** chưa có khái niệm "vắng mặt" hay uỷ quyền; người thay duy nhất là ADR 0101 default 16
(trưởng nhóm bị khoá → mọi người giữ `kpi.set-target`), chép hai nơi (`actsFor` ở cửa, `answeringLead` ở chuông).
Lỗ: chuông "phần nhóm được giao" và "gói nhóm bị trả" gửi tới trưởng nhóm đã khoá rồi bị hub bỏ, không danh sách nào
hiện (H1, H2); `iLead` hai nghĩa (H3); cửa rộng hơn chuông (H4); `kpi-target-proposed` dùng tập người nhận khác
(H5); bốn mắt với nhóm 2 người tắc khi một người vắng (H7); duyệt E3 kẹt khi người duyệt bị khoá sau (H10).
Hướng: một hàm `seatActors(seat, period)` thay cả hai bản chép + 3 chỗ chuông; server trả `actingFor` thay `leadLocked`.
Câu hỏi chủ dự án: ai khai báo vắng/người thay, có khoảng ngày không; phạm vi chỉ KPI hay cả duyệt E3.

**Hướng thiết kế đề xuất 1a:** đóng băng các dòng nền `(actor, kind, code, at, value)` lúc chốt rồi so với live, thay vì
cài ghi tại ~7 cửa. Câu hỏi cho chủ dự án: có chặn luôn ngày ký/ngày thu rơi vào tháng đã chốt không.

### Đợt 2 · Giao theo cấp — cần Q1–Q4, Q10, Q11 + duyệt canvas 11 màn

**Đã chốt 22/10 (người dùng):** Q1–Q4, Q10, Q11 nhận đúng mặc định trên trang thiết kế; áp từ tháng **12/2026**.
Canvas màn duyệt song song với lát 2a (canvas cũ 404, dựng lại): 2a "Phòng ban & nhóm" ở
https://claude.ai/artifact/FdrbrL4SVNwk7DTo2Esh4c (3 artboard, chưa duyệt). ADR 0118 (cây) nháp, 0119 (tiền thu HĐ thanh lý).
Số đã giữ với phiên pv-crm-d9 (22/10): KPI dùng migration 0140–0142, ADR 0118–0120; d9 lấy 0143+, ADR 0121+.
Cũng chốt 22/10: người giữ `kpi.set-target` sửa cây; Giám đốc đứng đầu Công ty, Trưởng phòng đứng đầu Phòng (gỡ lệnh
cấm hai vai này trong nhóm); công nợ quá hạn tính cho người thu tiền (`collector_id`, làm cùng 2d).
Nợ: D2 tiền đã thu của HĐ thanh lý giữ nguyên, trừ phần hoàn ở ngày thanh lý (ADR mới thay 0107 §3); D1 mọi người
duyệt đều vắng → vẫn báo người vắng, áp chung mọi pool việc chờ KPI. Kịch bản: `acceptance/kpi-n1.md`, `kpi-n2.md`.

**Mốc cứng:** nếu cắt từ tháng 12/2026 thì Giám đốc phải chốt số trước 20/11 → lát 2a + 2b phải lên production trước ~15/11.

| Lát | Việc                                                                                                                                                                                                            | Nghiệm thu chính                                                                                                                                                                 | Sync                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2a  | **Cây đơn vị** `platform.org_unit` · `org_member` · `sales.kpi_org_month`, hàm `headsOver`, màn Phòng ban & nhóm, chuyển nhóm cũ sang cây                                                                       | DB từ chối một người hai đơn vị, đơn vị hai trưởng; `headsOver` đúng 5 ca dựng sẵn; nhóm cũ sang cây không mất ai; sửa cây áp từ tháng chưa giao                                 | Riêng (cây có trước, chưa ai đọc) |
| 2b  | **Giao theo cấp + xác nhận** `sales.kpi_assignment`, lịch hạn, giao mặc định khi trễ (tạm lấy mức tháng trước, Đợt 3 thay bằng năng lực), cờ "giao mặc định", ADR mới thay phần duyệt của 0082 §5 / 0098 / 0101 | Chuỗi GĐ→TP→TN→NV đủ; tổng giao xuống thấp hơn số nhận bị từ chối, vượt 120% cảnh báo (Q2); trễ hạn → giao mặc định + chuông lên trên; số KPI tháng 10–11 (mô hình cũ) không đổi | Riêng · trước 15/11               |
| 2c  | **Ngày làm + hệ số làm quen + ngoại lệ** vào/nghỉ/chuyển nhóm/đổi vai trò (cần ngày vào làm, ngày nghỉ trên tài khoản)                                                                                          | Mỗi dòng ma trận ngoại lệ một ca, số chỉ tiêu tính tay khớp                                                                                                                      | Riêng                             |
| 2d  | **Chia công hợp đồng** ≤3 người, cộng 100%, trưởng nhóm duyệt, khoá khi ký; giữ ADR 0110 (người chốt = hoa hồng)                                                                                                | 100tr chia 60/30/10 → đúng từng người; tổng phòng vẫn 100tr; sửa sau ký → 422                                                                                                    | Riêng                             |
| 2e  | **Gỡ màn và luồng cũ** sau một tháng chạy song song; migration phá đi tách ship riêng                                                                                                                           | Đường cũ chuyển hướng; tháng cũ vẫn đọc đúng                                                                                                                                     | Riêng, ship hai bước              |

Đợt này `contract-drafter` chạy model opus (đổi mô hình duyệt là đổi bất biến).

### Đợt 3 · Kế hoạch từ năng lực — cần Q5, Q6, Q7

| Lát | Việc                                                                                                    | Nghiệm thu chính                                                            |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 3a  | **Từ điển chỉ số**: điền đủ 7 cột cho 14 chỉ số trong catalog; chỉ số thiếu nguồn không bật được        | Bật chỉ số "Báo giá" → từ chối kèm lý do                                    |
| 3b  | **Chỉ số dẫn**: doanh số thu (Q6), tỷ lệ thắng theo giai đoạn, độ phủ pipeline, cơ hội mới đủ điều kiện | Bộ dữ liệu dựng sẵn → từng số khớp tính tay; tỷ lệ cộng tử/mẫu rồi mới chia |
| 3c  | **Gợi ý năng lực + khoảng hở** trên màn giao; độ phủ < 3× gắn cờ                                        | Thiếu dữ liệu lịch sử → hiện "chưa đủ dữ liệu, đang chia đều", không bịa số |
| 3d  | **Kế hoạch của tôi** cho nhân viên                                                                      | —                                                                           |

Q7 (dung sai 5%) chỉ là đổi một giá trị cấu hình qua luồng duyệt có sẵn, không cần code.
Dữ liệu production bắt đầu từ 10/2026: gợi ý năng lực sẽ chạy bằng mặc định một thời gian dài.

### Đợt 4 · Dự báo và đánh giá — cần Q8, Q9

| Lát | Việc                                                      | Nghiệm thu chính                                                   |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| 4a  | **Họp dự báo tuần**: ghi số cam kết + việc giao           | —                                                                  |
| 4b  | **Độ chính xác dự báo** theo trưởng nhóm, trưởng phòng    | Dùng số chốt, không dùng số sau điều chỉnh                         |
| 4c  | **Điểm tổng + xếp loại + 1:1 đầu tháng**                  | 3 hồ sơ mẫu (có chỉ số ngược, chỉ tiêu 0, vượt 120%) khớp tính tay |
| 4d  | **Kỳ quý · năm, hệ số mùa vụ, kế hoạch năm ⓪**            | —                                                                  |
| 4e  | **Khép vòng**: kết quả + độ chính xác vào gợi ý tháng sau | Điều kiện xong của đợt: vòng chạy liền ba tháng trên production    |

Q8 lật quyết định cũ của chủ dự án (chuông từ ngày 16) — hỏi rõ, không áp mặc định.

## 4 · Câu hỏi gửi chủ dự án, gom theo đợt

- Trước Đợt 1: 2 ngưỡng đột biến; người tạm thay do ai khai báo, có hạn ngày không.
- Trước Đợt 2: Q1–Q4, Q10, Q11 + duyệt canvas; cắt từ tháng 12/2026 hay muộn hơn.
- Trước Đợt 3: Q5, Q6, Q7. Trước Đợt 4: Q8, Q9.

Câu nào chưa trả lời: làm theo mặc định trên trang và ghi vào mục "Defaults that are not the owner's" của ADR — trừ Q8.
