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

## Trước khi ship

- Đã rebase lên `origin/master` `4f4a4313` (có 0169 `assistant_brief`, đã trên Neon) và đánh số lại migration của
  nhánh thành 0170–0173, `when` tăng dần trên 0169. Đã chạy trọn 0000→0173 trên một PGlite trống. Bản `.pglite` cũ
  của worktree đã chạy số cũ nên sẽ báo lỗi khi migrate lại: tạo bản mới, đừng sửa tay.
- Thứ tự: Neon migrate trước, API sau, web cuối. Giữa migrate và deploy, bản API cũ không lưu được cấu hình KPI
  (cột `from_period` không có mặc định): tránh sửa cấu hình trong khoảng đó.
- Không ship gì đụng cửa giao chỉ tiêu trong 20–28/11 (tháng 12 đang được giao).
- Push và ship cần chủ dự án cho phép.

## Còn mở

- Từ ngày 1 tới thứ Hai đầu tháng không có tuần nào ghi được dự báo (quy tắc tuần của ADR 0158).
- Chưa cửa nào tạo lead ở mức MQL, nên vế "lead tạo sẵn ở mức MQL" chưa đếm gì.
- Đơn vị chỉ có Presales không có tổng `presales-signed-value` (không cộng được), thẻ đơn vị đó không có số chính.
- Ngân sách Marketing: một đơn vị có hai nhánh con cùng có Marketing thì chưa biết ngân sách thuộc nhánh nào.
- Định dạng ngày ở tiêu đề tuần đang là dd-MM như phần còn lại của app.
- Bóng trợ lý và thanh dưới trên tablet che nội dung (lỗi của khung app, không riêng KPI).
- 2e (gỡ màn cũ) không làm trước 2027-01.
- Các mặc định không phải của chủ dự án: mục "Defaults that are not the owner's" trong ADR 0158 và 0160.
