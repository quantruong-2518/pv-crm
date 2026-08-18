# Pebble Aurora v2.0 — thư viện component + theme kit sống

Bản dựng thật của `project/Pebble Aurora - Theme Kit.dc.html` (chốt 10/08).

Stack: **Vite + React 19 + TypeScript + Tailwind v4**, quy ước shadcn/ui (`cn` + `cva`),
dark-only. Token layer là `project/theme/globals.css` copy nguyên vào
`src/styles/globals.css`, cộng một khối bổ sung đặt tên cho các giá trị vốn đã có
trong theme kit nhưng chưa được tokenize (xem mục *Token bổ sung*).

```bash
npm install
npm run dev        # http://localhost:5173 — theme kit
npm run build      # tsc -b && vite build
npm run typecheck
```

---

## Trang theme kit là bài kiểm tra, không phải bản sao

`src/kit/` render lại toàn bộ theme kit **bằng chính các component trong
`src/components`**. Không có ví dụ nào là HTML tĩnh chép tay. Component lệch spec
thì trang lệch ngay — đó là mục đích của nó.

Trang giữ nguyên năm zone, mã item (`F-01`… `T-03`), chuỗi class Tailwind ở chân
mỗi khối, và toàn bộ chữ tiếng Việt của bản gốc.

---

## Cấu trúc

```
src/
├─ styles/globals.css        ← FILE MÀU DUY NHẤT. Không viết hex ở nơi khác.
├─ lib/
│  ├─ cn.ts                  clsx + tailwind-merge
│  └─ format.ts              tiền chuẩn VN: phẩy thập phân, chấm ngăn nghìn
├─ components/
│  ├─ ui/                    Zone 01 · Atoms (A-01 … A-11)
│  │  button · badge · chip · input · avatar · status-dot · progress
│  │  skeleton · separator (+ Kicker) · money · sparkline · icon
│  ├─ patterns/              Zone 02 · Molecules (M-01 … M-09)
│  │  stat-card · context-rail · approval-chain · search-field · scan-field
│  │  nav-item · data-table · empty-state · ai-action
│  ├─ organisms/             Zone 03 · Organisms (O-01 … O-05)
│  │  app-sidebar · top-bar · brief-card · approval-card · kiosk-tile
│  ├─ layout/
│  │  aurora-field           nền màn 4 lớp (luật 12)
│  │  glass-card             F-03 · variant a | b
│  │  app-shell              khung desktop 1440×900 (AGENTS.md §4)
│  │  assistant-fab          FAB 60px, icon `orbit`
│  └─ kit/                   chrome của trang styleguide (SpecCard, Zone)
├─ kit/                      trang theme kit, mỗi zone một file
└─ data/tokens.ts            bảng token dạng dữ liệu để zone 00 vẽ lại
```

`AppShell` và `AssistantFab` không có trong file `.dc.html` — chúng đến từ
`CLAUDE.md` luật 5 và `handoff/AGENTS.md` §4, và là thứ mọi màn thật sẽ ngồi bên
trong. Chúng nằm trong thư viện nhưng **không** được thêm vào trang kit, để trang
kit giữ đúng 1:1 với bản thiết kế.

---

## Luật được cưỡng chế ở tầng kiểu, không phải bằng thiện chí

| Luật | Cưỡng chế thế nào |
|---|---|
| 9 · AI không bao giờ tự làm | `AiActionProps.basis` và `.onConfirm` là **bắt buộc** — không compile được một khối AI thiếu dòng “Căn cứ:” hoặc thiếu nút |
| 11 · Lucide outline, stroke 1.75 | `<Icon>` là cửa duy nhất vào lucide; `size` và `strokeWidth` là union hẹp |
| 4 · Borderless | `globals.css` đặt `* { border-color: transparent }`; chỗ duy nhất có `border-2` là `KioskTile highContrast` |
| 6 · Số luôn tabular | `.tnum` nằm sẵn trong `Money`, `Progress`, `KioskTile`, `StatCard` |
| 8 · Bảng nằm trên `.glass-b` | `DataTable` không tự vẽ mặt kính — khối cha buộc phải là `<GlassCard variant="b">` |
| 10 · ContextRail bấm được | `RailObject.onOpen` biến chip thành `<button>` thật |
| A-11 · Sparkline luôn có nguồn | `source` là prop bắt buộc |

---

## Token bổ sung

Đặt tên cho giá trị đã có sẵn trong theme kit, **không thêm màu mới**:

`--glass-foreground` (#B4BECD, đã ghi trong AGENTS.md §2) · `--hc-surface` +
`--hc-border` (biến thể tương phản cao) · `--avatar-from` · `--gold-from` /
`--gold-to` · `--aurora-*` (3 tông quầng) · `--shadow-success` / `--shadow-ai` /
`--shadow-assistant` / `--shadow-control` / `--shadow-control-soft` ·
`--motion-duration` / `--motion-ease`.

Class mới trong `@layer components`: `.glass-b-flat` (panel tài liệu, không sheen
đáy) · `.glass-ai` / `.glass-ai-panel` (nền khối AI, theo AGENTS.md §2) ·
`.aurora-blob` / `.aurora-grid-fine` / `.aurora-grid-major` / `.aurora-vignette` /
`.aurora-noise` / `.aurora-grain-*` (bốn lớp nền).

---

## Sáu chỗ cố ý lệch khỏi `.dc.html`

`AGENTS.md` §0 nói “tài liệu và file mâu thuẫn → file thắng”. Ngoại lệ áp dụng ở
đây: khi `CLAUDE.md` **cấm thẳng** hoặc **bắt buộc thẳng** một điều mà file kit
(viết trước quyết định đó) còn làm ngược, thì luật thắng. Sáu chỗ:

| # | `.dc.html` | Bản dựng | Căn cứ |
|---|---|---|---|
| 1 | `▲ 2 hóa đơn` trong M-01 | icon `trending-up` | luật 15 cấm ▲▼▬ |
| 2 | Sidebar ghi “Pebble One” | “PV One” | luật 14: “gọi **PV One** trên mọi màn” |
| 3 | Nút Trợ lý ở TopBar dùng `zap` | `orbit` | luật 15: “dùng `orbit`, không `sparkles`, không `bot`” |
| 4 | Chữ trong khối AI thừa hưởng `--foreground` | `--on-tint-primary` / `-muted` | luật 1 + AGENTS §1.5 |
| 5 | Mục lục ghi Foundations **10**, Organisms **7** | **9** và **5** | đếm đúng số item thật trong chính file đó |
| 6 | Icon delta 16px | 14px | 16px làm StatCard tràn khỏi `h-[150px]` |

Chỗ 1–4 đổi được về nguyên bản trong một lượt nếu muốn bản kit là ảnh chụp lịch
sử thay vì bản thi hành luật.

**Còn treo, chưa tự quyết:** T-03 vẽ mobile **390 × 844 · status 44**, còn
`CLAUDE.md` (“Ba thiết bị là ba vai”) nói **440 × 956 · status 62 · bottom nav
84**, kèm ghi chú “bản One cũ còn dựng ở 390×844; khi sửa lại thì nâng lên 440”.
Bản dựng giữ theo file. Nói một tiếng là đổi.

---

## Chưa làm

Năm màn desktop trong `project/handoff/screens/` (Home · Approvals · Global search
· AI assistant · Notifications) chưa dựng. Thư viện này là nền cho chúng —
`AppShell` + `GlassCard` + `DataTable` + `AiAction` đã đủ để bắt đầu màn 01.
