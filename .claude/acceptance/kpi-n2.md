# Nghiệm thu Nợ 2 · tiền đã thu của hợp đồng thanh lý (ADR mới thay 0107 §3 cho `collected-value`)

An toàn như `kpi-d0.md` (PGlite mới, không Neon, không worker, `PV_TRUST_ACTOR_HEADER=true`). Không migration mới.
Chủ dự án chốt 22/10: tiền đã thu giữ nguyên ở ngày thu; phần hoàn ghi âm vào ngày thanh lý (`terminated_at`, chưa
có cột ngày hoàn). Doanh số ký và công nợ quá hạn giữ nguyên luật cũ (hợp đồng thanh lý không tính).

Dựng: hợp đồng HĐ-T 100.000.000 VND ký tháng 9, đợt 1 = 30.000.000 thu ngày 2026-09-15; hợp đồng HĐ-U 50.000.000 VND ký tháng 8, đợt 1 =
20.000.000 thu ngày 2026-09-20. Chốt 2026-09 (`POST /sales/kpi/2026-09/close`). Ghi lại `collected-value` tháng 9
(đóng băng) và tháng 10 (live) trước khi thanh lý.

| #   | Bước                                                                                                                                               | Kỳ vọng                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Trước thanh lý: `GET /sales/kpi/2026-09/company` `collected-value`                                                                                 | 50.000.000                                                                                                           |
| 2   | Thanh lý HĐ-T ngày tháng 10, hoàn 10.000.000; `KpiReconcileService.run()`                                                                          | 0 dòng `kpi_adjustment` series `collected-value` (2 dòng `signed-value` −100.000.000 own + room là đúng, bước 7 cần) |
| 3   | `collected-value` tháng 10                                                                                                                         | Giảm đúng 10.000.000 so với trước bước 2; `adjustedBy` null                                                          |
| 4   | `collected-value` tháng 9                                                                                                                          | Vẫn 50.000.000; `afterAdjustments` null                                                                              |
| 5   | Chạy `run()` lần hai                                                                                                                               | Ghi 0 dòng                                                                                                           |
| 6   | Thanh lý HĐ-U ngày tháng 10, hoàn 0; `run()`                                                                                                       | Tháng 10 không đổi so với bước 3; 0 dòng `kpi_adjustment` mới                                                        |
| 7   | `signed-value` tháng 10 sau bước 2 (HĐ-T ký tháng 9, tháng 9 đã chốt)                                                                              | Vẫn có dòng điều chỉnh −100.000.000 như ADR 0115 — luật doanh số ký không đổi                                        |
| 8   | Bù dữ liệu cũ: trước khi áp code mới, dựng sẵn một dòng `vanished` −30.000.000 cho `HĐ-T/1` (chạy `run()` với code cũ), rồi áp code mới và `run()` | Đúng 1 dòng `appeared` +30.000.000 ở tháng đang chạy; tổng các dòng của `HĐ-T/1` = 0                                 |
| 9   | Danh sách đóng góp `collected-value` tháng 10 của phòng (chỉ số phạm vi phòng, `actor_id` NULL)                                                    | Có dòng HĐ-T −10.000.000, nhãn "Đã chấm dứt"; không 500                                                              |

Bước 8 chạy được nếu kịch bản dựng PGlite theo hai pha (code cũ → code mới); không làm được thì ghi `notRun` kèm lý do,
và context chính đếm số hợp đồng thanh lý đã sinh dòng `vanished` trên Neon bằng truy vấn chỉ-đọc trước khi ship.
