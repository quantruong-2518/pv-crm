# Bàn giao: KPI đợt 3–4, bố cục theo vai và KPI v2 (16/11/2026)

Worktree `/home/quantruong/workspace/pv-crm-kpi-finish`, nhánh `kpi-finish`. Chưa push, chưa lên Neon/Fly.
`apps/api/.env` của worktree cố ý để rỗng; không trỏ nó vào Neon, không chạy reset hay seed.

## Đã commit

- `9bdc9b7a`, `70c92cde`: 2c (ngày vào làm, người vào sau, người nghỉ) và 2d (chia công hợp đồng). ADR 0155, 0156;
  migration 0170, 0171 (trước khi rebase là 0167, 0168).
- `1dc31019`: đợt 3, đợt 4, một mục KPI ba thẻ. ADR 0157–0159; migration 0172.
- `ae81bd80`: KPI v2 theo canvas chủ dự án sửa ngày 16/11. ADR 0160; migration 0173. Chỉ áp từ 01/2027.
- `72433122`: sửa các lỗi thấy khi mở màn thật lần đầu (biểu đồ giá trị ký của trưởng phòng, ngân sách
  Marketing theo đơn vị, lỗi 404 lặp với BD/Presales, nhãn biểu đồ đè đường, tiêu đề điểm theo tháng đang xem).

## Màn đã được mở trên trình duyệt

Trên một bản sao PGlite riêng (đã xoá cùng scratchpad), đồng hồ máy chủ đẩy sang 14/01/2027, dữ liệu mẫu tự
trồng; ba tháng 10–12/2026 đóng bằng cửa chốt thật nên `score_basis` đã chạy thật. Ảnh từng vai ở trang trình bày
https://claude.ai/artifact/9MSHoW5uqYdFvxUU6U4jYW. Chưa ai mở màn trên dữ liệu thật hay trên Neon.

Sau đó đã sửa thẻ cao thấp lệch và nhãn biểu đồ chạm đường. Bảng "Bản ghi tính vào chỉ số" cố ý ghi tiền đủ chữ số
(danh sách đối soát).

## Ship: chủ dự án đã cho phép (16/11, "ship đi, nhưng ship ở phiên mới")

Phải xong **trước 20/11**. Từ 20 tới 28/11 không ship gì đụng cửa giao chỉ tiêu (tháng 12 đang được giao). Lỡ hạn
thì đợi sau 28/11 và hỏi lại chủ dự án.

Đã chuẩn bị:

- Nhánh đã rebase lên `origin/master` `4f4a4313`. `4f4a4313` có 0169 `assistant_brief`, đã chạy trên Neon.
- Migration của nhánh đã đánh số lại thành 0170–0173, `when` tăng dần trên 0169.
- Đã chạy trọn 0000→0173 trên một PGlite trống.
- Bản `.pglite` cũ của worktree đã chạy số cũ nên sẽ báo lỗi khi migrate lại: tạo bản mới, đừng sửa tay.

Các bước, theo skill `/ship` và các memory "db-migrate green proves nothing on prod", "run a real build before
ship", "parallel sessions share one worktree":

1. `git fetch`.
   - `origin/master` đã đi tiếp thì rebase lại, chạy `pnpm check`.
   - Nhánh có migration mới thì đánh số lại cho `when` cao hơn mọi `created_at` trên Neon.
2. Trên Neon (chỉ đọc), lấy `max(created_at)` của `drizzle.__drizzle_migrations`. Phải bằng `when` của 0169
   (1795860220000) hoặc thấp hơn `when` của 0170.
3. Chạy một bản build production của web trong trình duyệt trước khi ship.
4. Fast-forward `master` lên `kpi-finish`, rồi push `origin master`.
   - Cây `kpi-finish` phải sạch.
   - Deploy từ một worktree tách rời ở đúng commit, không từ cây đang có phiên khác sửa.
5. Neon migrate 0170→0173, rồi đọc lại trên Neon:
   - các bảng `contract_credit`, `kpi_transfer`, `kpi_forecast_commit`, `kpi_unit_commit`, `kpi_one_on_one`,
     `kpi_funnel_target`, `kpi_marketing_budget`;
   - cột `kpi_role_metric.from_period` và `weight`;
   - CHECK loại chuông có `kpi-one-on-one`, CHECK touch có `solution-sent`, vai cơ hội có `PRESALES`.
6. Deploy API lên Fly (`deploy-guardian`), kiểm `/healthz` thật và log worker ở lượt chạy đầu.
7. Web lên Vercel từ `master`, mở màn KPI khi đã đăng nhập.

Lưu ý khi chạy:

- 0173 làm `kpi_role_metric.from_period` NOT NULL không có mặc định. Giữa bước 5 và 6, bản API cũ lưu cấu hình KPI
  sẽ lỗi 500 (lỗi rõ, không hỏng dữ liệu). Chạy 5 và 6 liền nhau, báo chủ dự án đừng duyệt cấu hình KPI lúc đó.
- Hook hay quyền chặn lệnh ghi production thì đưa chủ dự án đúng lệnh `! …`.
- Migration bị bỏ qua thì dừng và hỏi, không chạy tay SQL.

## Còn mở

- Từ ngày 1 tới thứ Hai đầu tháng không có tuần nào ghi được dự báo (quy tắc tuần của ADR 0158).
- Chưa cửa nào tạo lead ở mức MQL, nên vế "lead tạo sẵn ở mức MQL" chưa đếm gì.
- Đơn vị chỉ có Presales không có tổng `presales-signed-value` (không cộng được), thẻ đơn vị đó không có số chính.
- Ngân sách Marketing: một đơn vị có hai nhánh con cùng có Marketing thì chưa biết ngân sách thuộc nhánh nào.
- Định dạng ngày ở tiêu đề tuần đang là dd-MM như phần còn lại của app.
- Bóng trợ lý và thanh dưới trên tablet che nội dung (lỗi của khung app, không riêng KPI).
- 2e (gỡ màn cũ) không làm trước 2027-01.
- Các mặc định không phải của chủ dự án: mục "Defaults that are not the owner's" trong ADR 0158 và 0160.
