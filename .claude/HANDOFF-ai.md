# Bàn giao · AI trong PV One (01/11/2026)

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
| A-2 · Điền lead chạy nền, khay Việc AI, Hoàn tác trên máy chủ                                                                                        | 0131 | 0157       |
| Báo cáo AI trên liên hệ: Tạo tóm tắt, Tạo biên bản, đánh giá, gợi ý bước. Tuyến `comm-report` đang TẮT, chờ hồ sơ chuyển dữ liệu                     | 0132 | 0158       |

Code chính: `apps/api/src/platform/ai/` (cổng), `apps/api/src/platform/ai/prompts/` (khung
prompt + spec từng ô dùng chung), `apps/api/src/branches/sales/lead/lead-enrich.ts` (lõi điền,
nhận bản nháp lead), `apps/api/src/branches/sales/lead/lead-ai-fill.service.ts`,
`packages/ui/src/patterns/ai-fill.tsx`, `packages/ui/src/patterns/pill-overflow.tsx`.

Định tuyến model: việc khó nhất → Gemini 4 Argon; đọc file/ảnh → Gemini 3.8 Flash (dự phòng
Claude Haiku 5.5); phân loại nhanh → Claude Haiku 5.5; tìm web → Gemini 3.8 Flash + Google
(dự phòng Claude Sonnet 5.5). Sửa ở `PUT /ai/routes/:task`, không cần deploy.

## Đợt 0 CRM Agent (ADR 0133, 01/11/2026)

Đã ship 02/11/2026 cùng ADR 0134: commit `bf19d6c3`, Fly v206, Neon 0159 và 0160. Bốn tuyến
`assistant*` vẫn tắt, chưa có tuyến chat và màn, nên chưa ai dùng được trợ lý. Cổng 0 còn MỞ: chờ
khoá nhà cung cấp trên một máy. Việc kế tiếp: chạy
`pnpm ai:eval -- --suite assistant --live --yes --model <id>` có khoá, cho cả hai hãng.

Chủ dự án trả lời câu hỏi mở 141 đến 153 (ADR 0134) và kéo 143, 144, 147, 149 lên trước cổng 0.
Câu hỏi mở mới: 154 đến 157. Chưa có lượt gọi AI nào trên v206, nên ghi `ai_call` với cột mới
chưa được thử thật trên production.

## Đợt 1 CRM Agent: màn chat (ADR 0136, 02/11/2026)

Đã làm, chưa ship tại thời điểm ghi (cần migration 0162 lên Neon trước khi deploy API). Chủ dự án
cho dùng thử MỘT MÌNH trước lượt chạy có khoá: quyền mới `assistant.use`, mặc định chỉ giám đốc;
mở cho Sales bằng cách tick từng vai trong ma trận vai trò, không cần code. Nút chỉ hiện khi
tuyến `assistant` bật và người đó có quyền. Cổng 0 vẫn MỞ; mở cho cả phòng nên chờ lượt chạy có
khoá. Câu hỏi mở mới: 165 và 166.

## Ghi âm trong báo cáo liên hệ (ADR 0135, 02/11/2026)

Đã lên production 02/11/2026: commit 218822fa, Neon 0161, Fly v207, web Vercel. Tuyến
`comm-audio-report` đã bật theo lệnh chủ dự án (Gemini 3.8 Flash, không dự phòng, effort medium,
540 giây, 20 lượt mỗi người mỗi ngày). Mới thử thật một bản ghi 2 giờ (ADR 0135 §3), chưa đối
chiếu với buổi họp, chưa chạy qua worker thật. Ô xác nhận đã báo ghi âm đang chạy thật, nhưng vẫn
là đề xuất chủ dự án chưa chốt. Câu hỏi mở 158–164 nằm ở `docs/decisions/open-questions.md`.

## Nợ còn mở

- Migration dọn dẹp (một lần, sau khi bản API mới chạy ổn): xoá `lead.category`,
  `account.category`, `lead.industries`, hai CHECK `lead_industries_*`, sáu trigger tạm
  `*_legacy_*_sync` của 0154 (ADR 0129 §7); xoá `lead.headcount`, `account.headcount`, hai
  trigger `*_legacy_size_province_sync` và ba hàm `sales.legacy_*` của 0156 (ADR 0130).
- Bật tuyến `comm-report` (`PUT /ai/routes/comm-report`) sau khi có hồ sơ chuyển dữ liệu, câu hỏi mở 139; trước đó nút AI trên liên hệ bị ẩn.
- Trong ADR 0132 chưa làm: tệp chữ dài bị cắt vẫn ghi là đã đọc; khách đã mua không được gợi ý bước.
- Chưa có lần gọi AI thật nào trên production; Gemini `urlContext` + JSON trên 3.8 Flash chưa
  kiểm (câu hỏi mở 134). Lần bấm đầu tiên sẽ cho biết; lỗi thì cổng tự chuyển sang Claude.
- Bộ thử ~20 lead thật cho `pnpm ai:eval` chưa có dữ liệu — chờ chủ dự án.
- Chưa soát luật 12/13 bằng mắt các màn mới (tự điền, danh mục ngành, báo cáo, Quy mô).
- Cột "Nhóm ngành" trong sổ lead không vừa 1440 — chờ chủ dự án chọn cột bỏ.
- Chi phí mỗi lần tìm web chưa vào sổ; điều khoản VietQR chưa kiểm; luật sư xem việc thu
  liên hệ từ web (Luật 91/2025); nhóm ngành chưa có mô tả riêng — câu hỏi mở 124–134.

## Lượt kế tiếp (đã duyệt) — ship từng lát

**CRM Agent** — kế hoạch đầy đủ và mọi quyết định 01/11:
https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR. Việc tiếp theo là viết ADR rồi làm đợt 0
(nền an toàn).

**A-3 · Tìm nhiều liên hệ.** Người đại diện pháp luật (tra cứu ĐKKD), trang Ban lãnh đạo /
Liên hệ, thông cáo của công ty; LinkedIn công khai chỉ tên + chức danh. Thêm vào khối liên
hệ có dấu AI và nguồn, bỏ trùng tên/email/số. Canvas đã duyệt: artboard 4 của
https://claude.ai/artifact/GMHJUr1m1nyrQ4CyoB3C2x.

**Sau đó:** bước điền hàng loạt trước khi đẩy lead vào DB (nạp sheet, quét ảnh) dùng lại lõi
điền và khay việc; chuyển prompt quét ảnh sang khung prompt chuẩn (câu hỏi mở 133).

Danh sách đề xuất AI gốc (chưa duyệt toàn bộ): `.claude/HANDOFF-ai-proposals.md`.
