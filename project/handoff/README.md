# PV One — POC handoff pack (EN)

Xuất ngày 10 Aug 2026. Bộ này đủ để một AI coding agent dựng lại 5 màn desktop.

```
handoff/
├─ AGENTS.md                  ← đọc trước tiên. Build spec + luật cứng + dữ liệu demo
├─ theme/globals.css          ← token layer Tailwind v4 + shadcn/ui (dark-only)
├─ screens/                   ← 5 màn tham chiếu, mở trực tiếp bằng browser
│   ├─ One 01 - Home (Desktop) EN.dc.html
│   ├─ One 02 - Approvals inbox (Desktop) EN.dc.html
│   ├─ One 03 - Global search (Desktop) EN.dc.html
│   ├─ One 04 - AI assistant (Desktop) EN.dc.html
│   ├─ One 05 - Notifications and channels (Desktop) EN.dc.html
│   ├─ support.js             ← runtime, phải nằm cùng thư mục
│   └─ assets/                ← logo bản nền tối
├─ theme-kit/                 ← Pebble Aurora Theme Kit: bảng token đầy đủ + đặc tả component
└─ screens-png/               ← ảnh 1440×900, đúng tỉ lệ 1:1 để so mắt
```

## Cách dùng

1. Mở `screens/*.dc.html` bằng Chrome — mỗi file là một màn 1440×900 hoàn chỉnh, có panel "What this screen sells" hai bên để hiểu ý đồ.
2. Đọc `AGENTS.md`. Copy nó vào repo dưới tên `AGENTS.md` / `CLAUDE.md` / `.cursorrules`.
3. Import `theme/globals.css` vào Tailwind v4. Không tự định nghĩa lại màu.
4. Prompt agent theo mẫu ở mục 9 của `AGENTS.md` — mỗi lần một màn.

## Lưu ý khi đọc file màn

- Layout dùng **inline style** để đọc số trực tiếp (padding, gap, size, shadow). Đây là bản tham chiếu, không phải code sản xuất — khi dựng React thì chuyển sang class Tailwind + token.
- Ảnh avatar trong file trỏ tới `i.pravatar.cc` (placeholder). Thay bằng ảnh thật hoặc initials block.
- Font tải từ Google Fonts: Archivo, IBM Plex Sans, IBM Plex Mono, Space Grotesk. Icon từ Lucide UMD.
- Một vài màn có prop bật/tắt (ví dụ `showPitch`, `chainStage`, `viewer`, `previewChannel`) để trình bày các trạng thái khác nhau của cùng một màn.
