# pv-crm

Pebble Vina — **PV One** dựng theo hệ thiết kế **Aurora v2.0**.

```
packages/tokens    globals.css — file màu duy nhất + bảng token dạng dữ liệu
packages/ui        @pv/ui — thư viện component
packages/engines   @pv/engines — E1 đồ thị object · E2 quyền · E3 duyệt · E4 thông báo
apps/web           app thật (/) + theme kit sống (/kit)
tools/             eslint-plugin-aurora + script gác token & CSS
project/           nguồn thiết kế: theme kit, 5 màn PV One, các màn Sales
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

## Nguồn sự thật, theo thứ tự

| #   | File                          | Dùng để                                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `CLAUDE.md`                   | Hợp đồng làm việc: cái gì máy gác, cái gì người gác, biên giới package.                            |
| 2   | `project/CLAUDE.md`           | 15 luật cứng của hệ thiết kế + cấu trúc sản phẩm + kịch bản dữ liệu.                               |
| 3   | `packages/tokens/globals.css` | Token gốc. `project/theme/globals.css` là bản thiết kế, `pnpm tokens:check` gác hai bên khớp nhau. |
| 4   | `project/**/*.dc.html`        | Spec pixel — đọc inline style để lấy đúng số.                                                      |
| 5   | `project/handoff/AGENTS.md`   | Build spec cho AI coding agent + dữ liệu demo.                                                     |
| 6   | `apps/web/README.md`          | Bản dựng lệch chỗ nào so với `.dc.html`, và vì sao.                                                |

Tài liệu mâu thuẫn với file thiết kế thì **file thắng** — trừ khi `project/CLAUDE.md`
cấm thẳng hoặc bắt buộc thẳng điều ngược lại. Sáu chỗ như vậy đã ghi trong
`apps/web/README.md`.

Thiếu token thì **hỏi, đừng bịa hex mới**.

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
- **Tầng dữ liệu** — mọi con số đã chốt trong `project/CLAUDE.md` bị test khoá:
  sổ 10 cơ hội tổng 18,5 tỷ, phễu 100 → 6, sáu lý do ra khỏi luồng cộng đúng 94.

Ba thứ vẫn là việc của mắt người, có trong PR template: nền 4 lớp (luật 12) ·
tương phản ≥ 4.5:1 (luật 13) · lệch < 4px so với PNG (AGENTS §8.8).

## Trạng thái

Xong: toàn bộ Zone 00–04 của theme kit — 11 atom, 9 molecule, 5 organism, 3
khung thiết bị, cộng `AppShell` và `AssistantFab`. Màn 01 Home / Morning brief.
Bốn engine có interface + bản in-memory + hai kịch bản dữ liệu đóng băng.

Chưa làm: bốn màn desktop còn lại trong `project/handoff/screens/` (Hộp phê
duyệt · Tìm toàn cục · Trợ lý AI · Thông báo), và 12 màn Pebble Sales.
