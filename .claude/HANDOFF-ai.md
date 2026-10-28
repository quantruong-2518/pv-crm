# Bàn giao · AI trong PV One (28/10/2026)

Nhánh làm việc: worktree `pv-crm-ai`, nhánh `ai-gateway` (luôn ngồi trên `origin/master`).
Trạng thái sống của từng mục: ADR và `docs/decisions/open-questions.md` — file này chỉ là
lộ trình và các điểm nối.

## Đã lên production

| Mục                                                                                                                                                  | ADR  | Migration  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| Cổng gọi AI: bảng định tuyến theo tác vụ, dự phòng Gemini ↔ Claude, thử lại, sổ `ai_call` mỗi lần thử, đo thời gian, ngắt mạch, giới hạn đồng thời   | 0127 | 0151, 0152 |
| AI tự điền lead (nút một chạm, không bước duyệt, Hoàn tác; MST đối chiếu VietQR; trùng công ty thì báo)                                              | 0128 | 0153       |
| Nhóm ngành và ngành thành danh mục cấu hình (pill "+N", Báo cáo theo ngành, AI chọn trong danh mục; 5 nhóm, 37 ngành có sẵn)                         | 0129 | 0154, 0155 |
| A-1 · Prompt chuẩn có phiên bản, điền lead hai lượt (xác định công ty → đọc website), Quy mô theo khoảng, tên tỉnh mới không tiền tố, `pnpm ai:eval` | 0130 | 0156       |

Code chính: `apps/api/src/platform/ai/` (cổng), `apps/api/src/platform/ai/prompts/` (khung
prompt + spec từng ô dùng chung), `apps/api/src/branches/sales/lead/lead-enrich.ts` (lõi điền,
nhận bản nháp lead), `apps/api/src/branches/sales/lead/lead-ai-fill.service.ts`,
`packages/ui/src/patterns/ai-fill.tsx`, `packages/ui/src/patterns/pill-overflow.tsx`.

Định tuyến model: việc khó nhất → Gemini 4 Argon; đọc file/ảnh → Gemini 3.8 Flash (dự phòng
Claude Haiku 5.5); phân loại nhanh → Claude Haiku 5.5; tìm web → Gemini 3.8 Flash + Google
(dự phòng Claude Sonnet 5.5). Sửa ở `PUT /ai/routes/:task`, không cần deploy.

## Nợ còn mở

- Migration dọn dẹp (một lần, sau khi bản API mới chạy ổn): xoá `lead.category`,
  `account.category`, `lead.industries`, hai CHECK `lead_industries_*`, sáu trigger tạm
  `*_legacy_*_sync` của 0154 (ADR 0129 §7); xoá `lead.headcount`, `account.headcount`, hai
  trigger `*_legacy_size_province_sync` và ba hàm `sales.legacy_*` của 0156 (ADR 0130).
- Chưa có lần gọi AI thật nào trên production; Gemini `urlContext` + JSON trên 3.8 Flash chưa
  kiểm (câu hỏi mở 134). Lần bấm đầu tiên sẽ cho biết; lỗi thì cổng tự chuyển sang Claude.
- Bộ thử ~20 lead thật cho `pnpm ai:eval` chưa có dữ liệu — chờ chủ dự án.
- Chưa soát luật 12/13 bằng mắt các màn mới (tự điền, danh mục ngành, báo cáo, Quy mô).
- Cột "Nhóm ngành" trong sổ lead không vừa 1440 — chờ chủ dự án chọn cột bỏ.
- Chi phí mỗi lần tìm web chưa vào sổ; điều khoản VietQR chưa kiểm; luật sư xem việc thu
  liên hệ từ web (Luật 91/2025); nhóm ngành chưa có mô tả riêng — câu hỏi mở 124–134.
- Thời gian chờ mỗi lượt gọi AI tạm là 30 giây vì bấm nút vẫn phải chờ; nâng lại khi A-2 lên.

## Lượt kế tiếp (đã duyệt) — ship từng lát

**A-2 · Khay việc chạy nền.** Nút biểu tượng AI thay nút chữ; bấm là việc chạy trên worker
(hàng đợi), không chặn màn; khay góc dưới liệt kê việc song song, mỗi việc 5 bước có đánh
dấu bước xong; tiến độ đẩy qua SSE sẵn có; Hoàn tác nằm ở việc đã xong trong khay; việc xong
ở lại tới khi xoá hoặc 24 giờ. Canvas đã duyệt: artboard 5–6 của
https://claude.ai/artifact/CotaHRgTGAZ3JcfKSfeRtA. Khay dùng chung cho bước điền hàng loạt
khi nạp sheet / quét ảnh (lượt sau nữa).

**A-3 · Tìm nhiều liên hệ.** Người đại diện pháp luật (tra cứu ĐKKD), trang Ban lãnh đạo /
Liên hệ, thông cáo của công ty; LinkedIn công khai chỉ tên + chức danh. Thêm vào khối liên
hệ có dấu AI và nguồn, bỏ trùng tên/email/số. Canvas đã duyệt: artboard 4 của
https://claude.ai/artifact/GMHJUr1m1nyrQ4CyoB3C2x.

**Sau đó:** bước điền hàng loạt trước khi đẩy lead vào DB (nạp sheet, quét ảnh) dùng lại lõi
điền và khay việc; chuyển prompt quét ảnh sang khung prompt chuẩn (câu hỏi mở 133).

Danh sách đề xuất AI gốc (chưa duyệt toàn bộ): `.claude/HANDOFF-ai-proposals.md`.
