# Nghiệm thu Đợt 1b · cổng trước chốt tháng (ADR 0116, migration 0137)

An toàn như `kpi-d0.md` (PGlite mới, không Neon, không worker, `PV_TRUST_ACTOR_HEADER=true`, chỉ PID của mình; có thể
chạy một tiến trình Nest + `app.inject`). Hôm nay tháng 10/2026; tháng được chốt: 2026-09.
Người: A `director`, B `head-of-sales`, P và Q `sale`, R `sale` không giữ `kpi.set-target`.

Dữ liệu chèn bằng SQL đúng ràng buộc: hợp đồng trước tháng 9: H1 = 10.000.000 (ký 05/07/2026), H2 = 30.000.000
(ký 10/08/2026) → trung bình trước tháng 9 = 20.000.000. Trong tháng 9: của P: S1 = 150.000.000 ký 02/09 (> 5 × 20 tr →
cờ), S2 = 20.000.000 ký 29/09; của Q: T1 = 10.000.000 ký 05/09, T2 = 30.000.000 ký 28/09 và T3 = 5.000.000 ký 30/09.
Ba ngày cuối tháng 9 là 28, 29, 30/09. P: 20 / 170 = 11,8% → không cờ. Q: 35 / 45 = 77,8% → cờ.
Việc treo tháng 9: một lý do quá hạn chờ duyệt; một đề xuất đổi chỉ tiêu còn mở; một gói phòng đã gửi chưa duyệt.

| #   | Bước                                                                            | Kỳ vọng                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Áp migration                                                                    | `sales.kpi_month_close` có cột `gate` (jsonb, nullable)                                                                                                                                                                       |
| 2   | A đọc `GET /sales/kpi/2026-09/close-gate`                                       | 200. Việc treo: 1 lý do quá hạn, 1 đề xuất mở, 1 gói chưa duyệt. Cờ: S1 (hợp đồng lớn, so với trung bình 20.000.000); Q (77,8% trong 3 ngày cuối). Không cờ cho P về 3 ngày cuối, không cờ cho S2, T1, T2, T3 về hợp đồng lớn |
| 3   | R đọc cùng đường                                                                | 403                                                                                                                                                                                                                           |
| 4   | B đọc cùng đường (giữ `contract.approve-overdue-reason`? theo seed mặc định có) | 200, cùng số                                                                                                                                                                                                                  |
| 5   | Thanh lý S1 rồi A đọc lại                                                       | Cờ S1 biến mất (hợp đồng đã thanh lý không tính); P giờ bị cờ 3 ngày cuối (20 / 20 = 100%)                                                                                                                                    |
| 6   | A chốt tháng 2026-09                                                            | 2xx dù cổng còn việc treo; `kpi_month_close.gate` lưu đúng số việc treo và mã bị cờ lúc chốt                                                                                                                                  |
| 7   | A đọc `GET /sales/kpi/2026-09/company` (hoặc đường mà màn chốt tháng đọc)       | Tháng đã chốt trả về bản chụp cổng lúc chốt                                                                                                                                                                                   |
| 8   | Một tháng chưa hết (2026-10)                                                    | `close-gate` vẫn đọc được (để xem trước) nhưng chốt bị từ chối như cũ                                                                                                                                                         |

`notLooked` có chủ ý: chữ trên màn của hộp chốt — nghiệm thu bằng mắt.
