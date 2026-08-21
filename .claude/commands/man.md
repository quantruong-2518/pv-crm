---
description: Dựng một màn PV One hoặc Pebble Sales theo đúng quy trình
argument-hint: <tên màn, ví dụ "Hộp phê duyệt" hoặc "Sales 08">
---

Dựng màn: **$ARGUMENTS**

Làm đúng thứ tự sau. Mỗi lần MỘT màn.

## 1 · Đọc trước khi viết

- `CLAUDE.md` — hợp đồng làm việc, cái gì máy gác, biên giới package
- `docs/luat-thiet-ke.md` — 15 luật (§1), token dùng thật (§2), ba thiết bị (§3), đặc tả 5 màn One (§7), checklist (§8)

> **Không còn bản vẽ `.dc.html`.** Nguồn thiết kế gốc đã xoá 18/08; bộ màn đang
> dựng lại từ đặc tả chữ. Muốn xem bản cũ để tham khảo:
> `git show 107f5e2:project/<tên file>.dc.html > /tmp/xem.html`.
> Không có bản vẽ nghĩa là **bạn có quyền quyết layout** — nhưng luật và số liệu
> thì không được tự quyết.

## 2 · Trước khi code, trả lời ba câu

1. Màn này thuộc **kịch bản nào** — Sao Đỏ (10/08 07:58, khách đã mua) hay
   DAS Vina (17/08 09:10, khách chưa mua)? Không trộn.
2. Nó trả **đúng câu hỏi nào**? Câu trả lời của màn khác không được nhét vào đây.
3. **State nào bắt buộc phải code** theo `docs/luat-thiet-ke.md §7`? Kể cả empty state.

Không chắc màn nào thì liệt kê `docs/luat-thiet-ke.md §7` rồi hỏi, đừng đoán.

## 3 · Dựng

- Màn ngồi trong `<AppShell>`, đặt ở `apps/web/src/pages/`, thêm một dòng vào
  `SCREENS` trong `apps/web/src/routes.tsx`.
- Dùng component có sẵn trong `@pv/ui`. Thiếu thì **thêm vào `@pv/ui`** kèm một
  dòng trên trang kit, không dựng component cục bộ trong `pages/`.
- Dữ liệu lấy từ `@pv/engines/fixtures/<kịch-bản>`. **Không gõ số thẳng vào
  JSX.** Thiếu số thì thêm vào fixture kèm test khoá số đó trong
  `scenario.test.ts`.
- ContextRail dựng từ `graph.story(<mã>)`, không viết tay mảng chip.
- Khối AI đi qua `E3.proposeFromAi` — có `basis`, có nút, không tự chạy.
- Spacing chỉ 8 bậc. Bản vẽ cũ hay lệch thang này và 115 vi phạm đang nằm trong
  `eslint-suppressions.json`; **màn mới thì đừng thêm vi phạm nào**.

## 4 · Tự soát trước khi báo xong

```bash
pnpm check
```

Xanh rồi thì chạy tiếp checklist `docs/luat-thiet-ke.md §8` và **báo cáo từng
dòng một**, kèm kết quả thật chứ không phải "đã kiểm tra".

Dòng §8.8 máy không gác được — nói rõ bạn kiểm bằng cách nào: nền đúng 4 lớp ·
tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b` · nút tablet ≥ 48px.

## 5 · Nêu mọi quyết định thiết kế bạn tự làm

Không có bản vẽ thì mọi con số layout là lựa chọn của bạn. Liệt kê chúng ra —
kích thước, khoảng cách, thứ tự khối — để người review gật hoặc bác. Không
"làm cho đẹp hơn" mà không nói.
