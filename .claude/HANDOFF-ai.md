# Bàn giao · AI trong PV One (28/10/2026)

Nhánh làm việc: worktree `pv-crm-ai`, nhánh `ai-gateway` (luôn ngồi trên `origin/master`).
Trạng thái sống của từng mục: ADR và `docs/decisions/open-questions.md` — file này chỉ là
lộ trình và các điểm nối.

## Đã lên production

| Mục                                                                                                                                                | ADR  | Migration  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| Cổng gọi AI: bảng định tuyến theo tác vụ, dự phòng Gemini ↔ Claude, thử lại, sổ `ai_call` mỗi lần thử, đo thời gian, ngắt mạch, giới hạn đồng thời | 0127 | 0151, 0152 |
| AI tự điền lead (nút một chạm, không bước duyệt, Hoàn tác; MST đối chiếu VietQR; trùng công ty thì báo)                                            | 0128 | 0153       |
| Nhóm ngành và ngành thành danh mục cấu hình (pill "+N", Báo cáo theo ngành, AI chọn trong danh mục)                                                | 0129 | 0154, 0155 |

Code chính: `apps/api/src/platform/ai/` (cổng), `apps/api/src/branches/sales/lead/lead-enrich.ts`
(lõi điền, nhận bản nháp lead), `apps/api/src/branches/sales/lead/lead-ai-fill.service.ts`,
`packages/ui/src/patterns/ai-fill.tsx`, `packages/ui/src/patterns/pill-overflow.tsx`.

Định tuyến model: việc khó nhất → Gemini 4 Argon; đọc file/ảnh → Gemini 3.8 Flash (dự phòng
Claude Haiku 5.5); phân loại nhanh → Claude Haiku 5.5; tìm web → Gemini 3.8 Flash + Google
(dự phòng Claude Sonnet 5.5). Sửa ở `PUT /ai/routes/:task`, không cần deploy.

## Nợ còn mở

- Migration dọn dẹp: xoá `lead.category`, `account.category`, `lead.industries`, hai CHECK
  `lead_industries_*` và sáu trigger tạm `*_legacy_*_sync` (ADR 0129 §7).
- Chưa có lần gọi AI thật nào trên production; chưa soát luật 12/13 bằng mắt các màn mới.
- Cột "Nhóm ngành" trong sổ lead không vừa 1440 — chờ chủ dự án chọn cột bỏ.
- Chi phí mỗi lần tìm web chưa vào sổ; điều khoản VietQR chưa kiểm; luật sư xem việc thu
  liên hệ từ web (Luật 91/2025) — câu hỏi mở 124–127.

## Lượt kế tiếp (đã duyệt, đang làm) — chia ba lát, ship từng lát

**A-1 · Prompt chuẩn + chất lượng điền** (quyết định ở ADR 0130, migration 0156; dựng xong 28/10, chưa ship). Khung prompt là dữ liệu có phiên bản
(ngữ cảnh · các bước · spec từng ô: nguồn ưu tiên, cách tìm, định dạng, khi nào "chưa chắc",
ví dụ · định dạng trả về · luật chung), số phiên bản ghi vào `ai_call`. Hai lần gọi: xác định
công ty (website, MST, tên pháp nhân) → đọc website công ty (sản phẩm, ngành, quy mô). Ô
"Số người tại chỗ" → **Quy mô** theo khoảng (dưới 50 · 50–200 · 200–500 · 500–1.000 · trên
1.000). Tỉnh ghi tên không tiền tố, theo tên tỉnh mới sau sáp nhập 2025. Địa chỉ nhà máy
không có trên website → điền địa chỉ trụ sở kèm "Chưa chắc". Bộ thử ~20 lead thật.

**A-2 · Khay việc chạy nền.** Nút biểu tượng AI thay nút chữ; bấm là việc chạy trên worker
(hàng đợi), không chặn màn; khay góc dưới liệt kê việc song song, mỗi việc 5 bước có đánh
dấu bước xong; tiến độ đẩy qua SSE sẵn có. Canvas đã duyệt: artboard 5–6 của
https://claude.ai/artifact/CotaHRgTGAZ3JcfKSfeRtA. Khay dùng chung cho bước điền hàng loạt
khi nạp sheet / quét ảnh (lượt sau nữa).

**A-3 · Tìm nhiều liên hệ.** Người đại diện pháp luật (tra cứu ĐKKD), trang Ban lãnh đạo /
Liên hệ, thông cáo của công ty; LinkedIn công khai chỉ tên + chức danh. Thêm vào khối liên
hệ có dấu AI và nguồn, bỏ trùng tên/email/số. Canvas đã duyệt: artboard 4 của
https://claude.ai/artifact/GMHJUr1m1nyrQ4CyoB3C2x.

Danh sách đề xuất AI gốc (chưa duyệt toàn bộ): `.claude/HANDOFF-ai-proposals.md`.
