# Nghiệm thu · KPI 2b chỉnh sau đánh giá (ADR 0120 §12)

Chạy trên PGlite, `DATABASE_URL` ghi rõ trên mọi lệnh. Không gọi script seed. Tháng giao P = 2026-12.
Dựng tay: công ty C (trưởng A) → phòng D (trưởng B) → nhóm T (trưởng L, thành viên M, N) + P thuộc phòng.
Vai Sale. M, N, P có số thật tháng 2026-10; L không có hợp đồng nào.

| #   | Làm                                                                 | Kỳ vọng                                                                                       |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `GET 2026-12/assignments/sale` hôm nay 01/11, đơn vị D              | `lastActualPeriod` = `2026-10`, không phải `2026-11` đang chạy                                |
| 2   | Cùng lần đọc, M đạt 100 tr, N đạt 50 tr, P đạt 30 tr `signed-value` | Dòng T = 150 tr, dòng P = 30 tr                                                               |
| 3   | Cùng lần đọc, chỉ số `copied` và `total`                            | Không có trong `lastActuals` của dòng con                                                     |
| 4   | Đọc đơn vị C, vai Sale rồi vai Giám đốc                             | Vai Sale có chỉ số cộng được; vai Giám đốc có chỉ số `room`; không vai nào có chỉ số `copied` |
| 5   | Tháng 2026-10 đã chốt rồi sửa số sau chốt                           | `lastActuals` đọc số đã chốt, không trôi                                                      |
| 6   | M nhận 700 tr, L sửa thành 750 tr rồi gửi lại, M chưa từng xác nhận | `mine.changedFrom` = `[{signed-value, 700}]`; `debriefs-closed` không đổi nên không có dòng   |
| 7   | Gửi lại lần ba, 750 giữ nguyên                                      | `changedFrom` không còn `signed-value`                                                        |
| 8   | Bản gửi bình thường                                                 | `contact` = tên và email người gửi                                                            |
| 9   | Bộ `by_default` do quét trễ hạn ghi                                 | `contact` = trưởng đơn vị của người đọc                                                       |
| 10  | Đơn vị không có trưởng, bộ `by_default`                             | `contact` = `null`, cửa vẫn trả 200                                                           |
| 10b | Người gửi bị khoá tài khoản, đơn vị có trưởng khác                  | `contact` = trưởng đơn vị                                                                     |
| 10c | P có số âm tháng 2026-10 do hoàn tiền (−20 tr)                      | Dòng P = −20 tr, dòng phòng cộng cả số âm, cửa trả 200                                        |
| 11  | Sale ngoài đơn vị đọc trang D                                       | 403, không lộ số của người khác                                                               |
| 12  | Tháng 2026-11 (trước cắt) đọc `/company`, `/people`                 | Giống hệt trước lát này                                                                       |

`notLooked` có chủ ý: chữ, luật 12 · 13, tablet 48px trên màn thật. Chủ dự án nhìn.
