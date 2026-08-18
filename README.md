# pv-crm

Pebble Vina — hệ thiết kế **Aurora v2.0** và thư viện component dựng theo nó.

```
app/       thư viện component + trang theme kit sống (React 19 · TypeScript · Tailwind v4)
project/   nguồn thiết kế: theme kit, 5 màn PV One, các màn Sales, bản đồ hệ sinh thái
```

## Chạy

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — theme kit
```

`npm run build` chạy `tsc -b && vite build`. Không có bước nào khác.

## Nguồn sự thật, theo thứ tự

| # | File | Dùng để |
|---|---|---|
| 1 | `project/CLAUDE.md` | 15 luật cứng của hệ thiết kế. Đọc trước khi viết dòng code đầu tiên. |
| 2 | `project/theme/globals.css` | Token gốc. Bản copy đang chạy nằm ở `app/src/styles/globals.css`. |
| 3 | `project/Pebble Aurora - Theme Kit.dc.html` | Đặc tả 39 item, mỗi item có mã và chuỗi class Tailwind. |
| 4 | `project/handoff/AGENTS.md` | Build spec cho AI coding agent + dữ liệu demo. |
| 5 | `app/README.md` | Bản dựng lệch chỗ nào so với `.dc.html`, và vì sao. |

Tài liệu mâu thuẫn với file thiết kế thì **file thắng** — trừ khi `CLAUDE.md` cấm
thẳng hoặc bắt buộc thẳng điều ngược lại. Sáu chỗ như vậy đã ghi trong
`app/README.md`.

Thiếu token thì **hỏi, đừng bịa hex mới**.

## Trạng thái

Xong: toàn bộ Zone 00–04 của theme kit — 11 atom, 9 molecule, 5 organism, 3 khung
thiết bị, cộng `AppShell` và `AssistantFab`. `tsc -b` và `vite build` sạch, không
có hex nào ngoài file token.

Chưa làm: 5 màn desktop trong `project/handoff/screens/` (Trang chủ · Hộp phê
duyệt · Tìm toàn cục · Trợ lý AI · Thông báo).
