# Nghiệm thu Đợt 1c · người tạm thay khi vắng (ADR 0117, migration 0138)

An toàn như `kpi-d0.md` (PGlite mới, không Neon, không worker, `PV_TRUST_ACTOR_HEADER=true`; được chạy một tiến trình
Nest + `app.inject`). "Hôm nay" là ngày máy (tháng 10/2026); kỳ chỉ tiêu dùng `2026-12`.
Người: A `director`, B `head-of-sales` (cả hai giữ `kpi.set-target`); nhóm T: trưởng nhóm L (`sale`), thành viên M
và N (`sale`); O `sale` ngoài nhóm. Dựng như `kpi-d0` tới khi có gói phòng đã duyệt với phần cho nhóm T.

| #   | Bước                                                                    | Kỳ vọng                                                                                                                                     |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Áp migration                                                            | Có `sales.kpi_absence`; CHECK loại chuông có `kpi-stand-in`                                                                                 |
| 2   | L khai vắng từ hôm nay tới hôm nay + 3, người thay M                    | 2xx. M nhận đúng 1 chuông `kpi-stand-in`                                                                                                    |
| 3   | L khai thêm một kỳ vắng chồng ngày                                      | 4xx                                                                                                                                         |
| 4   | L khai người thay là O (ngoài nhóm, không giữ `kpi.set-target`)         | 4xx                                                                                                                                         |
| 5   | O khai vắng thay cho L                                                  | 403 (chỉ chính người đó hoặc người giữ `kpi.set-target`)                                                                                    |
| 6   | M lập và gửi gói nhóm T thay L                                          | 2xx (cửa nhận M là người đang thay trưởng nhóm)                                                                                             |
| 7   | Sau khi A duyệt gói nhóm, N đề xuất số khác                             | Chuông `kpi-counter-proposed` tới M, KHÔNG tới L                                                                                            |
| 8   | M xử lý đề xuất của N                                                   | 2xx                                                                                                                                         |
| 9   | Danh sách nhóm (`GET /sales/kpi/teams` và trang nhóm 2026-12)           | Nhóm T báo người đang thay là M                                                                                                             |
| 10  | B huỷ kỳ vắng của L                                                     | 2xx. Ngay sau đó N đề xuất lần nữa → chuông tới L, không tới M; M mở cửa gói nhóm T → 403                                                   |
| 11  | Khoá tài khoản L (cửa thật hoặc SQL `disabled_at`), không khai ai thay  | Đề xuất mới của N → chuông tới A và B; A làm được việc của trưởng nhóm                                                                      |
| 12  | B khai vắng (hôm nay → +2) người thay A; rồi một gói phòng mới do A gửi | Chuông chờ duyệt gói KHÔNG tới B (đang vắng); không ai duyệt được ngoài người thứ hai khác A — nếu chỉ còn A thì gói chờ (A không tự duyệt) |
| 13  | Phần nhóm được giao cho nhóm có trưởng nhóm bị khoá                     | Chuông `kpi-team-share-assigned` tới người đang thay (theo `seatActors`), không bị bỏ                                                       |

`notLooked` có chủ ý: chữ trên màn khai vắng — nghiệm thu bằng mắt.
