# Pebble Aurora v2.0 — thư viện component + theme kit sống

Bản dựng thật của theme kit Aurora v2.0 (chốt 10/08).

Stack: **Vite + React 19 + TypeScript + Tailwind v4**, quy ước shadcn/ui (`cn` + `cva`),
dark-only. Token layer là `packages/tokens/globals.css` — bản token chốt 10/08
cộng một khối bổ sung đặt tên cho các giá trị vốn đã có trong theme kit nhưng
chưa được tokenize (xem mục _Token bổ sung_). `pnpm tokens:check` chặn mọi
`var(--x)` trỏ vào token không tồn tại.

```bash
pnpm install
pnpm dev           # http://localhost:5173 — app;  /kit là theme kit
pnpm check         # format · kiểu · lint · token · test · build · css
```

---

## Trang theme kit là bài kiểm tra, không phải bản sao

`apps/web/src/kit/` render lại toàn bộ theme kit **bằng chính các component trong
`@pv/ui`**. Không có ví dụ nào là HTML tĩnh chép tay. Component lệch spec thì
trang lệch ngay — đó là mục đích của nó.

Hệ quả trực tiếp: **component không có mặt trên trang kit coi như chưa tồn tại.**

Trang giữ nguyên năm zone, mã item (`F-01`… `T-03`), chuỗi class Tailwind ở chân
mỗi khối, và toàn bộ chữ tiếng Việt của bản gốc.

---

## Cấu trúc

```
packages/tokens/
├─ globals.css               ← FILE MÀU DUY NHẤT. Không viết hex ở nơi khác.
└─ src/tokens.ts             bảng token dạng dữ liệu để zone 00 vẽ lại

packages/ui/src/             @pv/ui — cửa vào duy nhất là index.ts
├─ lib/
│  ├─ cn.ts                  clsx + tailwind-merge
│  └─ format.ts              tiền chuẩn VN: phẩy thập phân, chấm ngăn nghìn
├─ ui/                       Zone 01 · Atoms (A-01 … A-11)
│  button · badge · chip · input · avatar · status-dot · progress
│  skeleton · separator (+ Kicker) · money · sparkline · icon
├─ patterns/                 Zone 02 · Molecules (M-01 … M-09)
│  stat-card · context-rail · approval-chain · search-field · scan-field
│  nav-item · data-table · empty-state · ai-action
├─ organisms/                Zone 03 · Organisms (O-01 … O-05)
│  app-sidebar · top-bar · brief-card · approval-card · kiosk-tile
│  + bottom-nav · order-lifecycle-card
├─ layout/
│  aurora-field              nền màn 4 lớp (luật 12)
│  glass-card                F-03 · variant a | b
│  app-shell                 khung màn, mobile-first (docs/luat-thiet-ke.md §4)
│  assistant-fab             FAB 60px, icon `orbit`
└─ assets/                   logo bản nền tối

apps/web/src/
├─ styles/app.css            khai báo @source cho Tailwind — xem chú thích trong file
├─ routes.tsx                bảng route, mỗi màn lazy-load riêng
├─ pages/                    màn thật
└─ kit/                      trang theme kit, mỗi zone một file
   └─ chrome/                SpecCard · Zone — chrome của trang styleguide
```

`AppShell` và `AssistantFab` không có trong theme kit gốc — chúng đến từ
`docs/luat-thiet-ke.md` §1 luật 5 và §4, và là thứ mọi màn thật sẽ ngồi bên
trong. Chúng nằm trong thư viện nhưng **không** được thêm vào trang kit, để trang
kit giữ đúng 1:1 với bản thiết kế.

---

## Luật được cưỡng chế ở tầng kiểu, không phải bằng thiện chí

| Luật                                       | Cưỡng chế thế nào                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 9 · AI không bao giờ tự làm                | `AiActionProps.basis` và `.onConfirm` là **bắt buộc** — không compile được một khối AI thiếu dòng “Căn cứ:” hoặc thiếu nút |
| 11 · Hugeicons Stroke Rounded, stroke 1.75 | `<Icon>` là cửa duy nhất vào Hugeicons; `size` và `strokeWidth` là union hẹp                                               |
| 4 · Borderless                             | `globals.css` đặt `* { border-color: transparent }`; chỗ duy nhất có `border-2` là `KioskTile highContrast`                |
| 6 · Số luôn tabular                        | `.tnum` nằm sẵn trong `Money`, `Progress`, `KioskTile`, `StatCard`                                                         |
| 8 · Bảng nằm trên `.glass-b`               | `DataTable` không tự vẽ mặt kính — khối cha buộc phải là `<GlassCard variant="b">`                                         |
| 10 · ContextRail bấm được                  | `RailObject.onOpen` biến chip thành `<button>` thật                                                                        |
| A-11 · Sparkline luôn có nguồn             | `source` là prop bắt buộc                                                                                                  |

---

## Token bổ sung

Đặt tên cho giá trị đã có sẵn trong theme kit, **không thêm màu mới**:

`--glass-foreground` (#B4BECD, đã ghi trong docs/luat-thiet-ke.md §2) · `--hc-surface` +
`--hc-border` (biến thể tương phản cao) · `--avatar-from` · `--gold-from` /
`--gold-to` · `--aurora-*` (3 tông quầng) · `--shadow-success` / `--shadow-ai` /
`--shadow-assistant` / `--shadow-control` / `--shadow-control-soft` ·
`--motion-duration` / `--motion-ease`.

Class mới trong `@layer components`: `.glass-b-flat` (panel tài liệu, không sheen
đáy) · `.glass-ai` / `.glass-ai-panel` (nền khối AI, theo docs/luat-thiet-ke.md §2) ·
`.aurora-blob` / `.aurora-grid-fine` / `.aurora-grid-major` / `.aurora-vignette` /
`.aurora-noise` / `.aurora-grain-*` (bốn lớp nền).

---

## Sáu chỗ cố ý lệch khỏi theme kit gốc

Quy tắc cũ là “tài liệu và bản vẽ mâu thuẫn → bản vẽ thắng”. Ngoại lệ áp dụng
ở đây: khi luật **cấm thẳng** hoặc **bắt buộc thẳng** một điều mà bản kit
(viết trước quyết định đó) còn làm ngược, thì luật thắng. Sáu chỗ:

| #   | theme kit gốc                                   | Bản dựng                       | Căn cứ                                                 |
| --- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| 1   | `▲ 2 hóa đơn` trong M-01                        | icon `trending-up`             | luật 15 cấm ▲▼▬                                        |
| 2   | Sidebar ghi “Pebble One”                        | “PV One”                       | luật 14: “gọi **PV One** trên mọi màn”                 |
| 3   | Nút Trợ lý ở TopBar dùng `zap`                  | `orbit`                        | luật 15: “dùng `orbit`, không `sparkles`, không `bot`” |
| 4   | Chữ trong khối AI thừa hưởng `--foreground`     | `--on-tint-primary` / `-muted` | luật 1 · chữ trong khối đã tint dùng `--on-tint-*`     |
| 5   | Mục lục ghi Foundations **10**, Organisms **7** | **9** và **5**                 | đếm đúng số item thật trong chính file đó              |
| 6   | Icon delta 16px                                 | 14px                           | 16px làm StatCard tràn khỏi `h-[150px]`                |

Chỗ 1–4 đổi được về nguyên bản trong một lượt nếu muốn bản kit là ảnh chụp lịch
sử thay vì bản thi hành luật.

**Còn treo, chưa tự quyết:** T-03 vẽ mobile **390 × 844 · status 44**, còn
`docs/luat-thiet-ke.md` §3 nói **440 × 956 · status 62 · bottom nav
84**, kèm ghi chú “bản One cũ còn dựng ở 390×844; khi sửa lại thì nâng lên 440”.
Bản dựng giữ theo file. Nói một tiếng là đổi.

---

## Chưa làm

Màn 01 Home / Morning brief đã dựng. Bốn màn còn lại trong
`docs/luat-thiet-ke.md` §7 (Hộp phê duyệt · Tìm toàn cục · Trợ lý AI · Thông báo)
chưa — dựng bằng `/man <tên màn>`, quy trình ở `.claude/commands/man.md`.

Mười hai màn Pebble Sales cũng chưa.
Chúng dùng kịch bản DAS Vina, dữ liệu đã có sẵn trong
`@pv/engines/fixtures/das-vina`: sổ 10 cơ hội, phễu 100 → 6, sáu lý do ra khỏi
luồng.

Nguồn thiết kế gốc đã xoá 18/08 nên **không còn bản vẽ để đối chiếu** — mọi con
số layout trên màn mới là lựa chọn, phải nêu ra trong PR. Xem bản cũ:
`git show 107f5e2:project/<tên file>.dc.html`.
