# Nghiệm thu Đợt 0 · ba chuông KPI + trang thành viên (ADR 0112, migration 0133)

Chạy trên PGlite mới trong scratchpad, KHÔNG BAO GIỜ Neon. Boot API với
`DATABASE_URL=pglite://<scratchpad>/.pglite-d0`, `PV_TRUST_ACTOR_HEADER=true`, gọi bằng header `X-PV-Actor-Id`.
Không chạy worker. Hình dạng payload: đọc `packages/contracts/src/sales/kpi*.ts` và controller trong
`apps/api/src/branches/sales/kpi/`.

Dữ liệu: nếu không có cách nạp tài khoản mà không chạm lệnh bị `guard-db.mjs` chặn, tự chèn bằng SQL đúng 5 người
đang hoạt động, rồi để boot seeder cấp quyền mặc định theo vai trò:

| Tên | Vai trò         | Ghi chú                              |
| --- | --------------- | ------------------------------------ |
| A   | `director`      | giữ `kpi.set-target`, `kpi.view-all` |
| B   | `head-of-sales` | giữ `kpi.set-target`, `kpi.view-all` |
| L   | `sale`          | trưởng nhóm T                        |
| M   | `sale`          | thành viên nhóm T                    |
| O   | `sale`          | không thuộc nhóm nào                 |

Kỳ: `2026-12`. Chỉ số: một chỉ số đếm hoặc tiền ở phạm vi own của vai trò `sale` (ví dụ `signed-value`).
"Chuông của X" = số dòng trong bảng thông báo có người nhận X và kind tương ứng; đếm bằng SELECT trước và sau mỗi bước.

| #   | Bước                                                                                                                           | Kỳ vọng                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Áp toàn bộ migration                                                                                                           | Sổ migration có đủ tới 0133; cả hai CHECK `kind` chứa `kpi-allocation-waiting`, `kpi-counter-proposed`, `kpi-month-unclosed`, `contract-terminated`, `contract-collector-changed` |
| 2   | B gửi chỉ tiêu vai trò `sale` 2026-12 (100), A duyệt                                                                           | 2 lệnh 2xx                                                                                                                                                                        |
| 3   | B tạo nhóm T: trưởng nhóm L, thành viên L và M                                                                                 | 2xx                                                                                                                                                                               |
| 4   | B lập gói phòng: phần nhóm T = 70, dòng O = 30; gửi                                                                            | 2xx. Chuông `kpi-allocation-waiting` của A +1; của B +0. `kpi-target-allocated` của O +1 (chuông này phát lúc GỬI, xem ghi chú)                                                   |
| 5   | A duyệt gói phòng                                                                                                              | Chuông `kpi-team-share-assigned` của L +1; O +0                                                                                                                                   |
| 6   | L lập gói nhóm: L = 35, M = 35; gửi                                                                                            | 2xx. Chuông `kpi-allocation-waiting` của A +1 và của B +1; của L +0. `kpi-target-allocated` của M +1; của L +0 (người gửi không tự nhận)                                          |
| 7   | A duyệt gói nhóm                                                                                                               | 2xx; không chuông mới                                                                                                                                                             |
| 8   | M đề xuất số khác (40, có lý do)                                                                                               | 2xx. Chuông `kpi-counter-proposed` của L +1; của A +0; của B +0                                                                                                                   |
| 9   | O đề xuất số khác (25, có lý do)                                                                                               | 2xx. Chuông `kpi-counter-proposed` của A +1 và của B +1; của L +0                                                                                                                 |
| 10  | L xử lý đề xuất của M (nhận 40)                                                                                                | 2xx. Chuông `kpi-counter-resolved` của M +1                                                                                                                                       |
| 11  | L gửi lại gói nhóm phiên bản mới (bước 10 đã mở bản nháp, ADR 0098 §3), A duyệt; rồi L đề xuất số khác cho dòng của chính mình | Chuông `kpi-counter-proposed` tới A và B, KHÔNG tới L                                                                                                                             |
| 12  | L đọc `GET /sales/kpi/2026-12/people/M` và `/forecast/people/M`                                                                | 200 cả hai                                                                                                                                                                        |
| 13  | L đọc `GET /sales/kpi/2026-12/people/O`                                                                                        | 403                                                                                                                                                                               |
| 14  | O đọc `GET /sales/kpi/2026-12/people/M`                                                                                        | 403                                                                                                                                                                               |
| 15  | A đọc `GET /sales/kpi/2026-12/people/M`                                                                                        | 200                                                                                                                                                                               |
| 16  | M đọc `GET /sales/kpi/2026-12/people/M` (chính mình)                                                                           | 200                                                                                                                                                                               |

`notLooked` có chủ ý: chuông `kpi-month-unclosed` chạy trong sweeper của worker, không được chạy worker ở đây.
Nghiệm thu trên production sáng 01/11/2026: người giữ `kpi.set-target` nhận đúng một chuông cho tháng 10 nếu tháng 10
chưa chốt.

Ghi chú lần chạy 22/10: chuông `kpi-target-allocated` phát lúc gói được gửi, không phải lúc duyệt — hành vi có từ
ADR 0099, Đợt 0 không đổi. Nếu gói bị trả lại, người nhận đã được báo sớm. Câu hỏi này gom vào Đợt 2 (giao theo cấp bỏ bước duyệt, Q1).
