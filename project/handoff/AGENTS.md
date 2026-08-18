# PV One — Build Spec cho AI coding agent

Đưa nguyên file này vào repo (đổi tên `AGENTS.md`, `CLAUDE.md` hoặc `.cursorrules` tuỳ tool). Agent phải đọc hết trước khi viết dòng code đầu tiên.

Stack đích: **React + TypeScript + Tailwind v4 + shadcn/ui**, dark-only. Token layer có sẵn ở `theme/globals.css` — import, đừng viết lại.

---

## 0. Nguồn sự thật, theo thứ tự ưu tiên

| Thứ tự | File | Dùng để |
|---|---|---|
| 1 | `theme/globals.css` | Toàn bộ màu, font, bóng, bán kính, `.glass-a` / `.glass-b` / `.aurora-field`. Chỉ dùng `var(--*)` có thật trong file này. |
| 2 | `screens/*.dc.html` | 5 màn tham chiếu, mở trực tiếp bằng browser. Đây là **spec pixel**: đọc inline style để lấy đúng số. |
| 3 | `screens-png/*.png` | Ảnh 1:1 để so mắt sau khi build. |
| 4 | `theme-kit/Pebble Aurora - Theme Kit.dc.html` | Đặc tả từng component + bảng token đầy đủ. |

Khi tài liệu và file mâu thuẫn → **file thắng**. Khi không tìm thấy token → hỏi, đừng bịa hex mới.

---

## 1. Mười lăm luật cứng (vi phạm là reject PR)

1. **Không viền.** `--border: transparent`. Mép đọc bằng `box-shadow` + vệt sáng `inset 0 1px 0 rgba(255,255,255,.15)`. Ngoại lệ duy nhất: biến thể tương phản cao cho kiosk tablet, viền 2px.
2. **Màu chỉ lấy từ `globals.css`.** `#22B573` (success) là màu phái sinh duy nhất được phép. Không thêm màu decor.
3. `#133A8A` (Pebble Blue) và `#5E6B80` (Slate Gray) **không bao giờ làm màu chữ**. Chữ phụ dùng `--muted-foreground` `#93A1B8`.
4. `#2E63E6` (Azure) **chỉ làm nền**: AI, nút chính, item active. Chữ azure luôn `#7FA3FF` (`--accent-foreground`).
5. Chữ **bên trong khối đã nhuộm màu** dùng nhóm `--on-tint-*`. Không tự pha tint mới.
6. **Bán kính**: thẻ 6 (`--radius-lg`) · control 4 (`--radius-md`) · tag 3 (`--radius-sm`). `rounded-full` chỉ cho chấm trạng thái và FAB Trợ lý AI (60px, góc phải dưới).
7. **Font**: Archivo (display/heading) · IBM Plex Sans (body) · Space Grotesk (số hero) · IBM Plex Mono (mã object, số trong bảng, nhãn uppercase). Số luôn `tabular-nums`.
8. **Spacing chỉ 8 bậc**: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48. Không có 10, 14, 18 trong padding/gap.
9. **Bảng và danh sách dài luôn nằm trên `.glass-b`**, không bao giờ `.glass-a` (chữ trôi trên kính trong).
10. **Nền màn đúng 4 lớp**, không lớp thứ 5: quầng aurora (2 blob blur 90px) → lưới 32px → lưới 160px → hạt nhiễu SVG `soft-light` opacity .11. Đặt ở khung ngoài cùng của màn, `pointer-events:none`.
11. **Icon Lucide outline**, `stroke-width 1.75`, size 16 trong nút / 20 trong nav. Không icon fill, không emoji. Trợ lý AI dùng `orbit` (không `sparkles`, không `bot`). Delta số dùng `trending-up` / `trending-down` / `minus`.
12. **Tương phản chữ ≥ 4.5:1** trên cả `.glass-a` và `.glass-b`. Nút tablet ≥ 48px. Mobile chừa safe-area 34px.
13. **AI không bao giờ tự làm.** Mọi khối AI có dòng `Basis: …` và chờ nút xác nhận. Có state "Nothing has been created yet" nằm ngay dưới nút.
14. **ContextRail bắt buộc trên mọi màn**: dãy chip mã mono nối các object của cùng một câu chuyện (`HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`). Chip azure = object của câu chuyện đang mở, chip trắng mờ = object liên quan.
15. **Không AI slop**: không gradient trang trí ngoài 4 lớp nền và nền khối AI, không ▲▼, không emoji, không rounded-card-with-left-border-accent.

---

## 2. Token dùng thật (copy đúng tên)

```
bg màn            var(--background)  #0B1220     · khung màn dùng .aurora-field
chữ chính         var(--foreground)  #E5E7EB
chữ phụ           var(--muted-foreground)  #93A1B8
chữ trên kính mờ  #B4BECD  (body 11.5–12.5px trong .glass-b)
azure nền         var(--primary)     #2E63E6
azure chữ         var(--accent-foreground)  #7FA3FF
azure nền nhạt    var(--accent)      rgba(46,99,230,.22)
success           var(--success)     #22B573   · chữ #B9E7D2 / số #5EE0A8
warning           var(--warning)     #FFCD00   · chữ #FFE9A3
danger nền        var(--destructive) #DA251D   · chữ #FF6B5E / #FFD9D5
```

Kính:
- `.glass-a` — thẻ, KPI, ô hero, panel chính.
- `.glass-b` — bảng, list dài, sidebar phải, popover.
- Khối AI — `linear-gradient(90deg, rgba(46,99,230,.22), rgba(46,99,230,.06))` + `inset 0 1px 0 var(--sheen-ai)`; bản panel dọc dùng `150deg`.

---

## 3. Ba thiết bị là ba vai

| Thiết bị | Khung | Luật riêng |
|---|---|---|
| Desktop | **1440 × 900** | Sidebar 232 · topbar 40 (trong padding 22/28) · bento 4 cột gap 16 · mỗi dashboard đúng **1 ô hero 2×2** |
| Tablet | 1024 × 768 | Header 72 · không sidebar · nút ≥ 48px · có nút "High contrast" |
| Mobile | 390 × 844 | Status 44 · bottom nav 84 (Home · Approvals · Search · Assistant) · safe-area 34 |

5 màn trong `screens/` đều là desktop 1440×900, tỉ lệ 1:1.

---

## 4. Component cần dựng trước (theo thứ tự)

1. `AppShell` — aurora field 4 lớp + `Sidebar` (232) + `Topbar` + `AssistantFab`.
2. `Sidebar` — nhóm: điều hướng Core (Home · Approvals · Notifications · Global search, badge số đỏ `#DA251D`) → nhãn mono "BRANCHES OWNED" (Sales · Supply · Factory · Finance) → nhãn "ONE PLUS" (People · Documents & processes · Work · Reports) → footer Admin & audit log. Item active: `background rgba(46,99,230,.24)` + `inset 0 1px 0 rgba(150,180,255,.22)`, icon `#7FA3FF`.
3. `GlassCard` (`variant: a | b`), `Kpi` (số Space Grotesk 42px + label + delta icon + footer strip nguồn), `CodeChip`, `ContextRail`.
4. `AiBlock` — 3 biến thể: strip ngang (dưới dashboard), block trong detail, panel dọc 420/760px. Bắt buộc slot `basis` + `actions`.
5. `ApprovalChain` (timeline dot 11px: success đã xong · azure + halo 4px đang chờ · trắng .22 chưa tới), `AuditLog` (cột thời gian mono 74px), `RuleTable` (grid `1fr 104px 188px 156px 44px`).

Đừng componentize sớm hơn mức này. Tất cả layout bằng flex/grid + `gap`, không margin lẻ.

---

## 5. Naming trên UI (bắt buộc)

- Sản phẩm trung tâm luôn gọi **PV One**.
- Nhánh giữ tên tiếng Anh: **Sales · Supply · Factory · Finance** (là tên sản phẩm).
- Năng lực trong One Plus **viết đủ chữ**: People · Documents & processes · Work · Reports · Equipment effectiveness. **Không viết tắt HR, DMS, BI, OEE trên giao diện.**
- Engine chỉ hiện dưới dạng nhãn phụ: `E1 · Object graph` · `E2 · Permissions & audit` · `E3 · Approval engine` · `E4 · Multi-channel notifications`.
- Hai tầng license: **One Core** (Home · Global search · Approvals · Notifications · Directory · Admin · Integrations) và **One Plus** (People · Documents & processes · Work · Reports · AI assistant). Một năng lực chỉ nằm ở đúng một tầng.

---

## 6. Dữ liệu demo — đóng băng tại 10 Aug, 07:58

Không bịa số mới. Mọi seed/mock dùng đúng bộ này:

```
Company     Thắng Lợi Engineering · user Nguyễn Văn Thắng (Managing Director)
Customer    Sao Đỏ Engineering — 2 open deals, ₫0 overdue, 14 documents
Chain       LD-0334 → BG-0512 → HĐ-2607 → SO-0891 → WO-1180 → PR-0231 → PO-0455 → L-2608-042
SO-0891     ₫1.84bn · customer deadline 22 Aug
WO-1180     68% · 2 days late · blocked on Ø40 steel · plant X1
PO-0455     ₫128.5M · Nam Việt Steel · 500 kg Ø40 · lead time 2 days · warehouse K1-A2
Quotes      Nam Việt Steel ₫128.5M/2d · Hưng Long ₫131.2M/1d · Toàn Phát ₫127.9M/5d
KPI         revenue ₫4.2bn (+12%) · on-time 86% (target 90%) · overdue ₫890M (2 inv) · OEE 91.4%
Machine     CNC-03 fault E-214, down 37 min, 3rd time this week · BT-0310 → Mr. Hải
Receivables Minh Quang ₫520M (12d) · Trường Thịnh ₫370M
People      Lê Minh Đức (Head of Planning) · Trần Thu Hà (Head of Sales) · Phạm Thị Mai (Chief Accountant) · Nguyễn Văn Tú · Vũ Văn Nam
Timeline    07:58 brief · 08:03 assistant · 08:21 CNC-03 stop · 08:40 step-1 approval · 09:12 approved · 09:40 search · 16:30 notification rules
```

Định dạng số: `₫1.84bn` · `₫128.5M` · `91.4%` · ngày `22 Aug` · giờ 24h `08:21`. Mã object giữ nguyên, kể cả `HĐ-2607`.

---

## 7. Năm màn: mục đích và state phải có

| # | Màn | Trạng thái cần code |
|---|---|---|
| 01 | **Home / Morning brief** | 1 hero 2×2 (order lifecycle 10 mốc) + 4 KPI + 2 alert card + AI strip. Empty state khi không có việc cần chú ý. |
| 02 | **Approvals inbox** | list nhóm theo loại · detail 3 khối (why / AI quote table / impact if approved today) · chain E3 · audit E2. State: `waiting` ↔ `approved`. |
| 03 | **Global search** | 1 query → 4 nguồn, 1 list trộn theo liên quan. Bắt buộc có hàng **"Hidden by your permissions"** + nút request access. Đổi theo viewer (Head of Sales vs Managing Director). |
| 04 | **AI assistant** | panel phải 420px ↔ 760px, đè lên brief + scrim `rgba(3,7,16,.52)`. Suggestion card sticky đáy, collapse được. State: `pending` ↔ `done` (2 cards created, logged 08:04). |
| 05 | **Notifications & channels** | rule table (event → threshold → channel → timing → role) · delivery log có 1 dòng **Blocked (duplicate)** · preview thật Zalo OA ↔ Email · dirty state "unsaved". |

---

## 8. Checklist trước khi mở PR

- [ ] Không có hex nào trong code ngoài `globals.css` (grep `#[0-9a-fA-F]{6}` trong `src/` phải sạch, trừ file token).
- [ ] Không có `border:` / `border-width` nào ngoài biến thể high-contrast.
- [ ] Mọi bảng/list dài nằm trên `.glass-b`.
- [ ] Mọi khối AI có `Basis:` + nút; không có hành động nào tự chạy.
- [ ] Mọi màn có ContextRail.
- [ ] Padding/gap chỉ thuộc 8 bậc.
- [ ] `prefers-reduced-motion` tắt hết animation aurora.
- [ ] So màn build với `screens-png/` ở 100% zoom, lệch < 4px.

---

## 9. Cách ra prompt cho agent

Mỗi lần chỉ một màn, và luôn kèm 3 thứ: file spec này + file `.dc.html` của màn đó + PNG tương ứng. Mẫu:

> Đọc `AGENTS.md`, `theme/globals.css`, `screens/One 02 - Approvals inbox (Desktop) EN.dc.html`.
> Dựng lại màn này thành React + Tailwind v4 + shadcn/ui, desktop 1440×900, dùng đúng token trong `globals.css`, không thêm màu, không thêm viền.
> Tách component theo mục 4 của spec, dữ liệu mock lấy đúng mục 6.
> Xong thì tự chạy checklist mục 8 và báo cáo từng dòng.

Không bao giờ hỏi agent "làm cho đẹp hơn" — mọi khác biệt so với `.dc.html` phải được nêu ra và xin phê duyệt trước.
