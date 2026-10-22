# Nghiệm thu Đợt 1a · tháng đã chốt không trôi, thay đổi sau chốt thành điều chỉnh (ADR 0115, migration 0136)

An toàn như `kpi-d0.md`: PGlite mới trong scratchpad, không Neon, không worker, `PV_TRUST_ACTOR_HEADER=true`, chỉ dừng
PID của mình. Lượt đối chiếu (reconcile) bình thường chạy trong sweep của worker: ở đây gọi trực tiếp hàm của service
bằng một script tsx dựng application context Nest trên cùng thư mục PGlite (API đang tắt), không chạy worker.

Hôm nay là tháng 10/2026 (tháng đang chạy). Người: A `director`, B `head-of-sales`, P `sale`. Dữ liệu tối thiểu chèn
bằng SQL (đúng ràng buộc của bảng): một lead còn sống không có `marketing_owner_id`, một cơ hội của P, hợp đồng C1 =
100.000.000 VND ký 10/09/2026 và C2 = 50.000.000 VND ký 20/09/2026, cả hai `owner_id = P`; C1 có đợt 1 = 40.000.000
đã thu 25/09/2026 và đợt 2 = 60.000.000 chưa thu.

| #   | Bước                                                                                | Kỳ vọng                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Áp migration                                                                        | Có `sales.kpi_month_basis` và `sales.kpi_adjustment`                                                                                                                       |
| 2   | A đọc `/sales/kpi/2026-09/people/P`                                                 | `signed-value` = 150.000.000                                                                                                                                               |
| 3   | B chốt tháng 2026-09                                                                | 2xx. `kpi_month_basis` có dòng C1 và C2 ở chuỗi `signed-value` của P và của phòng; lượt đối chiếu ngay sau chốt ghi 0 dòng điều chỉnh                                      |
| 4   | Thanh lý C2 qua cửa thật (`POST /sales/contracts/C2/terminate`)                     | 2xx                                                                                                                                                                        |
| 5   | Chạy lượt đối chiếu                                                                 | Đúng các dòng: nguồn 2026-09, áp vào 2026-10, mã C2, `vanished`, delta −50.000.000, ở chuỗi `signed-value` của P và của phòng. Không dòng nào cho chuỗi tỷ lệ (`win-rate`) |
| 6   | Chạy lại lượt đối chiếu                                                             | 0 dòng mới                                                                                                                                                                 |
| 7   | P đọc `/sales/kpi/2026-10/me`                                                       | `signed-value` = −50.000.000 (tháng 10 chưa ký gì); danh sách đóng góp có một dòng điều chỉnh ghi nguồn tháng 9                                                            |
| 8   | A đọc `/sales/kpi/2026-09/people/P`                                                 | Số chốt 150.000.000, sau điều chỉnh 100.000.000; danh sách đóng góp tháng 9 vẫn có C1 và C2 (đọc từ bản đóng băng)                                                         |
| 9   | Ghi thu đợt 2 của C1 lùi ngày 28/09/2026 qua cửa thật                               | 2xx                                                                                                                                                                        |
| 10  | Chạy lượt đối chiếu                                                                 | Một dòng `appeared` +60.000.000 ở chuỗi `collected-value` của phòng, nguồn 2026-09, áp 2026-10                                                                             |
| 11  | Vô hiệu hoá lead của C1 (cửa thật, người có `lead.disable`) rồi chạy lượt đối chiếu | Dòng `vanished` cho C1 ở `signed-value` (P và phòng, −100.000.000) và ở `collected-value` (phòng, hai dòng theo đợt: C1/1 −40.000.000 và C1/2 −60.000.000)                 |
| 12  | Khôi phục lead rồi chạy lượt đối chiếu                                              | Các dòng `appeared` bù đúng bước 11; tổng điều chỉnh nguồn tháng 9 của `signed-value` P = −50.000.000                                                                      |
| 13  | Đọc lại tháng 9 qua `kpi_month_value`                                               | Không dòng nào đổi so với lúc chốt (SELECT so trước/sau)                                                                                                                   |

`notLooked` có chủ ý: chữ trên màn ("Số chốt", "Sau điều chỉnh", dòng điều chỉnh) — nghiệm thu bằng mắt.

Lần chạy 22/10 (acceptance-runner, script độc lập): 13/13 khớp.
