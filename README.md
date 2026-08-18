# pv-crm

Pebble Vina — **PV One** dựng theo hệ thiết kế **Aurora v2.0**.

```
docs/              luật thiết kế + kiến trúc sản phẩm
packages/tokens    globals.css — file màu duy nhất + bảng token dạng dữ liệu
packages/ui        @pv/ui — thư viện component
packages/engines   @pv/engines — E1 đồ thị object · E2 quyền · E3 duyệt · E4 thông báo
apps/web           app thật (/) + theme kit sống (/kit)
tools/             eslint-plugin-aurora + script gác token & CSS
```

Stack: pnpm workspace · React 19 · TypeScript · Vite 6 · Tailwind v4 · quy ước
shadcn/ui. Dark-only. Package trỏ thẳng vào source TS — không có bước build
trung gian, sửa component thấy ngay trên màn.

## Chạy

```bash
pnpm install
pnpm dev            # http://localhost:5173   ·   /kit là theme kit
```

Node 22 (`.nvmrc`), pnpm 10.

## Một cổng duy nhất

```bash
pnpm check
```

Chạy đúng thứ CI chạy, theo thứ tự: `format:check` → `typecheck` → `lint` →
`tokens:check` → `test` → `build` → `css:check`. Xanh ở máy thì qua được CI.

Lệnh lẻ khi cần: `pnpm lint:fix` · `pnpm format` · `pnpm test:watch` ·
`pnpm lint:debt` (còn nợ bao nhiêu vi phạm cũ) · `pnpm lint:prune` (dọn nợ đã trả).

## Nguồn sự thật

| #   | File                          | Dùng để                                                                        |
| --- | ----------------------------- | ------------------------------------------------------------------------------ |
| 1   | `CLAUDE.md`                   | Hợp đồng làm việc: cái gì máy gác, cái gì người gác, biên giới package.        |
| 2   | `docs/luat-thiet-ke.md`       | 15 luật cứng, token dùng thật, ba thiết bị, đặc tả 5 màn One, checklist PR.    |
| 3   | `docs/kien-truc-san-pham.md`  | 5 nhánh, hai tầng license, luật engine, vai người Sales, hai kịch bản dữ liệu. |
| 4   | `packages/tokens/globals.css` | Token gốc. File màu duy nhất của cả hệ.                                        |
| 5   | `apps/web/README.md`          | Bản dựng lệch chỗ nào so với thiết kế gốc, và vì sao.                          |

Thiếu token thì **hỏi, đừng bịa hex mới**.

> **Nguồn thiết kế gốc đã xoá 18/08.** `project/` từng chứa 22 bản vẽ `.dc.html`,
> ảnh tham chiếu 1:1 và gói handoff EN — khoảng 12 MB. Bộ màn sẽ dựng lại; luật
> và kiến trúc đã cứu sang `docs/`, số liệu đã cứu sang `@pv/engines/fixtures`
> kèm test khoá. Lấy lại bản cũ: `git show 107f5e2:project/<tên file>`.

## Luật cưỡng chế bằng máy

Không phải bằng trí nhớ của người review:

- **Tầng kiểu** — khối AI thiếu dòng "Căn cứ" hoặc thiếu nút thì không compile;
  `<Icon>` là cửa duy nhất vào lucide; bảng buộc nằm trên `.glass-b`.
- **Tầng engine** — "AI không bao giờ tự làm" thực thi ở `E3.proposeFromAi`,
  không phải bằng thiện chí của màn.
- **Tầng lint** — `eslint-plugin-aurora` với 6 rule: hex thô · viền hộp ·
  thang spacing · emoji và ▲▼ · icon không qua cửa · trộn hai kịch bản dữ liệu.
- **Tầng biên giới** — `@pv/ui` không biết engine, `@pv/engines` không phụ thuộc
  React, app không với vào `src/` của package khác.
- **Tầng dữ liệu** — mọi con số đã chốt bị test khoá: sổ 10 cơ hội tổng 18,5 tỷ,
  phễu 100 → 6, sáu lý do ra khỏi luồng cộng đúng 94, công nợ quá hạn cộng đúng
  KPI 890 tr, ba báo giá vật tư khớp giá PO-0455.

Hai thứ vẫn là việc của mắt người, có trong PR template: nền 4 lớp (luật 12) ·
tương phản ≥ 4.5:1 và cỡ nút tablet (luật 13).

## Trạng thái

Xong: toàn bộ Zone 00–04 của theme kit — 11 atom, 9 molecule, 5 organism, 3
khung thiết bị, cộng `AppShell` và `AssistantFab`. Màn 01 Home / Morning brief.
Bốn engine có interface + bản in-memory + hai kịch bản dữ liệu đóng băng.

Chưa làm: bốn màn PV One còn lại (Hộp phê duyệt · Tìm toàn cục · Trợ lý AI ·
Thông báo — đặc tả ở `docs/luat-thiet-ke.md §7`), và 12 màn Pebble Sales (thứ tự
kể ở `docs/kien-truc-san-pham.md`).
