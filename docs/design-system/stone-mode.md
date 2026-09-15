# Đá mịn — mode sáng

Mode thứ hai theo yêu cầu ngày 16/09/2026: giao diện sáng, trang nhã, tối giản cho người dùng kinh doanh văn phòng. Aurora là mode mặc định; người dùng chuyển bằng nút Aurora / Đá mịn ở thanh đầu trang hoặc màn đăng nhập. Lựa chọn lưu trong `pv-theme` trên trình duyệt và đồng bộ giữa các tab.

## Chất liệu và màu

- Nền khoáng xám xanh, có hạt tĩnh rất nhẹ; không phủ hạt lên chữ hoặc bảng.
- Mặt nội dung sáng có sắc màu, đặc, không blur; bóng nông và mép nhẹ để phân lớp.
- Chữ than; xanh Pebble trầm dành cho thao tác, liên kết và vùng được chọn.
- IBM Plex Sans cho nội dung, tiêu đề và số; số vẫn canh hàng bằng tabular numerals.
- Token nằm trong `packages/tokens/globals.css`, dưới `:root[data-theme='stone']`.
- `surface-ink` là màu pha của nền phụ, đường phân cách và trạng thái hover: trắng trong Aurora, màu mực trong Đá mịn. Không thay màu chữ trắng trên nút chính hoặc avatar.
- Logo tự chuyển sang bộ tài sản xanh đã có.

## Kiểm tra

TypeScript web, build web, ESLint phần giao diện, token drift và CSS coverage. Kiểm tra trình duyệt tại `/kit` và `/dang-nhap`: chuyển hai mode, lưu sau reload, desktop 1536px và màn đăng nhập mobile 390px. API chưa chạy trong lần kiểm tra này; phản hồi chưa đăng nhập được giả lập riêng trong trình duyệt kiểm thử.
