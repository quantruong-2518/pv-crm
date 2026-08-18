---
description: Dựng một màn từ file .dc.html theo đúng quy trình AGENTS §9
argument-hint: <tên file .dc.html hoặc tên màn>
---

Dựng màn: **$ARGUMENTS**

Làm đúng thứ tự sau. Mỗi lần chỉ MỘT màn.

## 1 · Đọc trước khi viết

- `CLAUDE.md` (gốc repo) — hợp đồng làm việc, biên giới package
- `project/CLAUDE.md` — 15 luật cứng, cấu trúc sản phẩm, kịch bản dữ liệu
- `project/handoff/AGENTS.md` — token dùng thật (§2), ba thiết bị (§3), state bắt buộc của màn (§7)
- File `.dc.html` của màn — **spec pixel**, đọc inline style để lấy đúng số
- PNG tương ứng trong `project/handoff/screens-png/` nếu có

Không tìm thấy file `.dc.html` khớp `$ARGUMENTS` thì liệt kê các file trong
`project/` rồi hỏi, đừng đoán.

## 2 · Trước khi code, trả lời ba câu

1. Màn này thuộc **kịch bản nào** — Sao Đỏ (10/08 07:58) hay DAS Vina (17/08 09:10)?
2. Nó trả **đúng câu hỏi nào**? Câu trả lời của màn khác không được nhét vào đây.
3. **State nào bắt buộc phải code** theo AGENTS §7? Kể cả empty state.

## 3 · Dựng

- Màn ngồi trong `<AppShell>`, đặt ở `apps/web/src/pages/`, thêm một dòng vào `SCREENS` trong `apps/web/src/routes.tsx`.
- Dùng component có sẵn trong `@pv/ui`. Thiếu thì **thêm vào `@pv/ui`** (kèm dòng trên trang kit), không dựng component cục bộ trong `pages/`.
- Dữ liệu lấy từ `@pv/engines/fixtures/<kịch-bản>`. **Không gõ số thẳng vào JSX.** Thiếu số thì thêm vào fixture kèm test khoá số đó.
- ContextRail dựng từ `graph.story(<mã>)`, không viết tay mảng chip.
- Khối AI đi qua `E3.proposeFromAi` — có `basis`, có nút, không tự chạy.

## 4 · Tự soát trước khi báo xong

```bash
pnpm check
```

Xanh rồi thì chạy tiếp checklist AGENTS §8 và **báo cáo từng dòng một**, kèm
kết quả thật chứ không phải "đã kiểm tra".

Ba dòng cuối của §8 máy không gác được — nói rõ bạn kiểm bằng cách nào:
luật 12 (nền 4 lớp) · luật 13 (tương phản, cỡ nút) · §8.8 (lệch < 4px so với PNG).

## 5 · Nêu mọi chỗ lệch

Khác `.dc.html` chỗ nào thì liệt kê ra kèm căn cứ và **xin phê duyệt**. Không tự
quyết, không "làm cho đẹp hơn".
