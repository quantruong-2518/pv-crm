## Làm gì

<!-- Một đoạn. Màn nào / component nào, và vì sao. -->

## Nguồn

<!-- Bỏ trống nếu PR không đụng giao diện. -->

- Đặc tả: <!-- docs/luat-thiet-ke.md §7 · hoặc mục nào trong docs/ -->
- Lát cắt dữ liệu: <!-- Sao Đỏ 10/08 07:58 · hoặc · DAS Vina 17/08 09:10 -->

## Hai thứ CI không gác được

CI đã kiểm hex, viền, spacing, emoji, icon, kịch bản, token, kiểu, test, build.
Hai dòng dưới đây vẫn là việc của mắt người — tick nghĩa là **đã tự mở màn ra
nhìn**, không phải "chắc là ổn":

- [ ] **Luật 12** — nền đúng 4 lớp, không có lớp thứ 5
- [ ] **Luật 13** — tương phản chữ ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px; mobile chừa safe-area 34px

## Quyết định thiết kế tự làm

<!-- Nguồn thiết kế gốc (.dc.html + ảnh tham chiếu 1:1) đã xoá 18/08, nên mọi
     con số layout trên màn mới là LỰA CHỌN, không phải "theo spec". Liệt kê
     chúng ra để người review gật hoặc bác: kích thước, khoảng cách, thứ tự
     khối. Không có thì ghi "không có".

     Cần xem bản vẽ cũ: git show 107f5e2:project/<tên file>.dc.html -->

## Nợ spacing

<!-- Màn mới KHÔNG được thêm vi phạm aurora/spacing-scale nào. Nếu PR này có
     dọn bớt nợ cũ thì chạy `pnpm lint:prune` và nói rõ đã dọn file nào. -->
