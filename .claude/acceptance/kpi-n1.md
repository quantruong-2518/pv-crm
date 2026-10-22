# Nghiệm thu Nợ 1 · duyệt lý do quá hạn đọc kỳ vắng (D1) + ghi chú điều chỉnh ở bảng nhóm (D3) + mép Đợt 1

An toàn như `kpi-d0.md` (PGlite mới, không Neon, không worker, `PV_TRUST_ACTOR_HEADER=true`; một tiến trình Nest +
`app.inject`). Không migration mới cho phần nợ (cây có thể đang ở 0140, không ảnh hưởng).

## D1 · lý do quá hạn là việc chờ dạng "pool" (ADR 0117 §5)

Người: D `director`, H `head-of-sales` (cả hai giữ `contract.approve-overdue-reason` và `kpi.set-target`); S `sale`
là người chốt hợp đồng HĐ-Q có đợt 1 quá hạn. Chủ dự án chốt 22/10: mọi người duyệt đều vắng → vẫn báo người đang
vắng (áp chung cho mọi pool việc chờ KPI, kể cả pool người đặt chỉ tiêu). Mặc định chưa phải của chủ dự án: danh sách "Chờ bạn xử lý" không ẩn với người đang vắng; việc đã
chờ trước kỳ vắng không rung lại.

| #   | Bước                                                                                                                                     | Kỳ vọng                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Không ai vắng; S gửi lý do R1 cho HĐ-Q đợt 1                                                                                             | Chuông kind `overdue-reason-waiting` (sự kiện `overdue-reason-sent`, occurrence `1/<R1>`) tới đúng {D, H} |
| 2   | H khai vắng hôm nay → +3, người thay D (`POST /sales/kpi/absences`)                                                                      | 2xx                                                                                                       |
| 3   | S gửi lý do R2 (đợt 2 quá hạn của HĐ-Q, hoặc hợp đồng thứ hai)                                                                           | Chuông `overdue-reason-sent` của R2 tới đúng {D}; H không nhận                                            |
| 4   | H gọi `POST /sales/overdue-reasons/<R2>/decide` duyệt                                                                                    | 409; R2 vẫn `waiting`; 0 dòng audit `approve` cho R2                                                      |
| 5   | D duyệt R2                                                                                                                               | 200; R2 `approved`; đúng 1 dòng audit; chuông `overdue-reason-decided` tới S                              |
| 6   | D cũng vắng hôm nay → +1: chèn kỳ vắng bằng SQL (cửa từ chối người thay H vì H đang vắng — đúng 0117 §1, kiểm luôn: 400); S gửi lý do R3 | Cửa khai vắng D→H: 400; chuông R3 tới đúng {D, H} (ai cũng vắng → báo người vắng); D gọi decide R3 → 409  |
| 7   | Huỷ cả hai kỳ vắng; H duyệt R1                                                                                                           | 200                                                                                                       |
| 8   | So số `overdue-receivables` tháng hiện tại trước bước 1 và sau bước 7                                                                    | Chỉ lệch đúng phần của đợt R1 + R2 đã duyệt                                                               |

## D3 · bảng chỉ số nhóm có ghi chú điều chỉnh

Nhóm T: A và B (`sale`), cả hai có phần `signed-value` tháng 2026-09 và 2026-10. A ký HĐ-A 50.000.000 VND ngày
2026-09-10; B ký HĐ-B 20.000.000 VND ngày 2026-09-12 và HĐ-C 30.000.000 VND ngày 2026-10-05. Chốt 2026-09. Thanh lý
HĐ-A (tháng 10), chạy `KpiReconcileService.run()`.

| #   | Bước                                              | Kỳ vọng                                                                                     |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 9   | `GET /sales/kpi/2026-10/teams/T` dòng doanh số ký | `value` = 30.000.000 − 50.000.000 theo cách cộng của thành viên; `adjustedBy` = −50.000.000 |
| 10  | `GET /sales/kpi/2026-09/teams/T` dòng doanh số ký | `value` đóng băng = 70.000.000; `adjustedBy` null; `afterAdjustments` = 20.000.000          |
| 11  | Dòng chỉ số không cộng được (tỷ lệ) của nhóm T    | `adjustedBy` và `afterAdjustments` đều null                                                 |
| 12  | Đọc của A và B riêng (`/people`) so với tổng nhóm | Tổng `adjustedBy` thành viên = `adjustedBy` nhóm                                            |

Bước 9: số `value` lấy đúng như dòng của từng thành viên cộng lại — kỳ vọng tính tay: A tháng 10 = −50.000.000
(dòng điều chỉnh), B tháng 10 = 30.000.000 → nhóm −20.000.000.

## Mép Đợt 1 chưa thử (ADR 0116, 0117)

| #   | Bước                                                                                                | Kỳ vọng                                                                          |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 13  | Pool người đặt chỉ tiêu: A và B đều vắng hôm nay; một gói phòng được gửi bởi người thứ ba giữ quyền | Chuông `kpi-allocation-waiting` tới {A, B}                                       |
| 14  | Một HĐ tháng 8 = 10.000.000; một HĐ tháng 9 = 50.000.000; `GET .../2026-09/close-gate`              | `flags.bigContracts` = []                                                        |
| 15  | Như 14 nhưng HĐ tháng 9 = 50.000.001                                                                | `flags.bigContracts` có 1 dòng                                                   |
| 16  | A ký 60.000.000 ngày 10/09 và 40.000.000 ngày 28/09 00:00+07                                        | `flags.lateHeavy` = []                                                           |
| 17  | Như 16 nhưng 40.000.001                                                                             | `flags.lateHeavy` có A                                                           |
| 18  | Như 16 nhưng HĐ 40.000.000 ký 27/09 23:59+07                                                        | Không tính là dồn cuối tháng                                                     |
| 19  | 6 gói nháp trong kỳ                                                                                 | `pending.packagesDraft` dài 5; `counts.packagesDraft` = 6                        |
| 20  | Kỳ vắng `fromDay` = mai, có việc chờ; `UPDATE from_day = hôm nay`; chạy `sweep` hai lần             | Đúng 1 chuông `kpi-stand-in` occurrence `absence/<id>` sau cả hai lần            |
| 21  | Sale không trưởng nhóm, không giữ `kpi.set-target` khai vắng hôm nay, người thay là D               | 201; 1 dòng audit `absence-declared`; 0 chuông `kpi-stand-in`; sweep cùng ngày 0 |

`notLooked` có chủ ý: ghi chú "Gồm điều chỉnh …" trên bảng nhóm — nghiệm thu bằng mắt.
