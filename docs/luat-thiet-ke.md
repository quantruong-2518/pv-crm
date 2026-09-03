# Aurora v2.0 — luật thiết kế

Chốt 10/08. Đây là bản **cứu ra** từ `project/CLAUDE.md` và `project/handoff/AGENTS.md`
trước khi thư mục `project/` (bản vẽ `.dc.html`, ảnh tham chiếu, gói handoff) bị
xoá ngày 18/08 — bộ màn sẽ dựng lại, còn luật thì không dựng lại.

Mọi trích dẫn `luật N` trong code trỏ vào **§1** của file này.

> **Hai hệ đánh số cũ.** `project/CLAUDE.md` và `AGENTS.md §1` đánh số 15 luật
> khác nhau (borderless là luật 4 ở bản thứ nhất, §1.1 ở bản thứ hai). File này
> lấy **cách đánh số của `project/CLAUDE.md`** làm chuẩn vì 36 trích dẫn trong
> code dùng nó. Hai chỗ từng trích theo `AGENTS §1.11` và `§1.13` đã đổi sang
> số chuẩn.

---

## §1 · Mười lăm luật cứng

Vi phạm là reject PR.

1. **Màu** chỉ lấy từ bảng brand Pebble Vina + token semantic trong
   `packages/tokens/globals.css`. `#22B573` là màu semantic phái sinh duy nhất
   được phép (bảng brand không có xanh lá). Chữ đặt **bên trong khối đã nhuộm
   màu** dùng nhóm token `--on-tint-*` — không tự chế tint mới.
2. **Pebble Blue `#133A8A` và Slate Gray `#5E6B80` không bao giờ làm màu chữ**
   trên nền tối — chỉ nền, đường kẻ, quầng sáng. Chữ phụ dùng `#93A1B8`.
3. **Azure `#2E63E6` chỉ làm nền** cho AI · nút chính · trạng thái active, đếm
   được trên mỗi màn. Chữ màu azure luôn là `#7FA3FF`.
4. **Borderless.** `--border: transparent`. Mép đọc bằng bóng + vệt sáng inset
   1px. Ngoại lệ duy nhất: biến thể tương phản cao cho kiosk tablet ngoài sáng,
   viền 2px.
5. **Bo góc** thẻ 6 · control 4 · tag 3 · `rounded-full` chỉ cho chấm trạng thái
   và nút Trợ lý AI nổi (FAB 60px, góc phải dưới).
6. **Chữ** Archivo (display) · IBM Plex Sans (nội dung) · Space Grotesk (số hero)
   · IBM Plex Mono (mã, số bảng). Số luôn `tabular-nums`. Tiền chuẩn VN: phẩy
   thập phân, chấm ngăn nghìn.
7. **Spacing** chỉ 8 bậc: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
8. **Bảng và danh sách dài** luôn nằm trên `.glass-b`, không bao giờ `.glass-a`.
9. **AI không bao giờ tự làm.** Mọi khối AI có dòng "Căn cứ: …" và chờ nút xác
   nhận. Có state "Chưa tạo gì cả" nằm ngay dưới nút.
10. **ContextRail bắt buộc trên mọi màn** — dãy chip mã mono nối các object của
    cùng một câu chuyện (`HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`).
    Chip azure = object của câu chuyện đang mở, chip trắng mờ = object liên quan.
11. **Icon** Hugeicons Stroke Rounded, stroke 1.75, size 16 trong nút / 20 trong
    nav. Mọi glyph đi qua `Icon` gateway của `@pv/ui`; không icon fill, không
    emoji.
12. **Nền màn** đúng 4 lớp: quầng aurora (2 blob blur 90px) → lưới 32px → lưới
    160px → hạt nhiễu SVG `soft-light` opacity .11. Không thêm lớp thứ 5. Đặt ở
    khung ngoài cùng của màn, `pointer-events: none`.
13. **Tương phản chữ ≥ 4.5:1** trên cả `.glass-a` và `.glass-b`. Nút tablet
    ≥ 48px. Mobile chừa safe-area 34px.
14. **Tên hiển thị**: sản phẩm trung tâm gọi **PV One** trên mọi màn. Nhánh giữ
    tên tiếng Anh (Sales · Supply · Factory · Finance) vì là tên sản phẩm; năng
    lực bên trong luôn tiếng Việt — Nhân sự · Tài liệu & quy trình · Công việc ·
    Báo cáo · Hiệu suất thiết bị. Không viết tắt HR, DMS, BI, OEE trên giao diện.
15. **Không AI slop**: icon Trợ lý AI dùng `orbit` (không `sparkles`, không
    `bot`). Delta số dùng icon Hugeicons `trending-up/down/minus`, không dùng ▲▼▬.
    Không emoji, không gradient trang trí ngoài 4 lớp nền và nền khối AI, không
    rounded-card-with-left-border-accent.

---

## §2 · Token dùng thật

Tên chính xác, copy nguyên. Nguồn duy nhất là `packages/tokens/globals.css`.

```
bg màn            var(--background)         #0B1220   · khung màn dùng .aurora-field
chữ chính         var(--foreground)         #E5E7EB
chữ phụ           var(--muted-foreground)   #93A1B8
chữ trên kính mờ  var(--glass-foreground)   #B4BECD   · body 11.5–12.5px trong .glass-b
azure nền         var(--primary)            #2E63E6
azure chữ         var(--accent-foreground)  #7FA3FF
azure nền nhạt    var(--accent)             rgba(46,99,230,.22)
success           var(--success)            #22B573   · chữ #B9E7D2 / số #5EE0A8
warning           var(--warning)            #FFCD00   · chữ #FFE9A3
danger nền        var(--destructive)        #DA251D   · chữ #FF6B5E / #FFD9D5
```

Kính:

- `.glass-a` — thẻ, KPI, ô hero, panel chính.
- `.glass-b` — bảng, list dài, sidebar phải, popover.
- Khối AI — `linear-gradient(90deg, rgba(46,99,230,.22), rgba(46,99,230,.06))`
  \+ `inset 0 1px 0 var(--sheen-ai)`; bản panel dọc dùng `150deg`.

**Thiếu token thì HỎI, đừng bịa hex mới.** `pnpm tokens:check` chặn mọi
`var(--x)` trỏ vào token không tồn tại.

---

## §3 · Ba thiết bị là ba vai

| Thiết bị    | Khung      | Luật riêng                                                                                                                               |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop** | 1440 × 900 | văn phòng, nghiệp vụ sâu. Sidebar 232 · topbar 64 · bento 4 cột gap 16 · mỗi dashboard đúng **1 ô hero 2×2**                             |
| **Tablet**  | 1024 × 768 | hiện trường, kiosk. Header 72 · không sidebar · nút ≥ 48px · có nút "Tương phản cao"                                                     |
| **Mobile**  | 440 × 956  | trong túi. iPhone 17 Pro Max, có khung máy + dynamic island. Status 62 · bottom nav 84 (Trang chủ · Duyệt · Tìm · Trợ lý) · safe-area 34 |

> **Còn treo, chưa quyết.** Bản theme kit T-03 vẽ mobile **390 × 844 · status 44**;
> bảng trên nói **440 × 956 · status 62**. Ghi chú gốc: "bản One cũ còn dựng ở
> 390×844; khi sửa lại thì nâng lên 440". Bản dựng trong `@pv/ui` đang theo
> 390×844. Nói một tiếng là đổi.

---

## §4 · Component dựng trước, theo thứ tự

Toàn bộ mục này **đã dựng xong** trong `@pv/ui`; giữ lại để biết thứ tự và ràng
buộc của từng cái khi dựng thêm.

1. `AppShell` — aurora field 4 lớp + `AppSidebar` (232) + `TopBar` + `AssistantFab`.
2. `AppSidebar` — nhóm: điều hướng Core (Trang chủ · Duyệt · Thông báo · Tìm toàn
   cục, badge số đỏ `#DA251D`) → nhãn mono "BRANCHES OWNED" (Sales · Supply ·
   Factory · Finance) → nhãn "ONE PLUS" (Nhân sự · Tài liệu & quy trình · Công
   việc · Báo cáo) → footer Admin & audit log. Item active:
   `background rgba(46,99,230,.24)` + `inset 0 1px 0 rgba(150,180,255,.22)`,
   icon `#7FA3FF`. Item `locked` (phần chưa mở): nút `disabled`, không hover, ổ
   khoá 14 đứng chỗ badge số; **chữ giữ nguyên `--muted-foreground`** — chỉ hai
   icon mờ `opacity-55`, vì dìm chữ là phá luật 13.
3. `GlassCard` (`variant: a | b`), `StatCard` (số Space Grotesk 42px + label +
   delta icon + footer strip nguồn), `Chip`, `ContextRail`.
4. `AiAction` — 3 biến thể: strip ngang (dưới dashboard), block trong detail,
   panel dọc 420/760px. Bắt buộc slot `basis` + `actions`.
5. `ApprovalChain` (timeline dot 11px: success đã xong · azure + halo 4px đang
   chờ · trắng .22 chưa tới), `AuditLog` (cột thời gian mono 74px), `DataTable`
   (grid `1fr 104px 188px 156px 44px`).

Đừng componentize sớm hơn mức này. Layout bằng flex/grid + `gap`, không margin lẻ.

---

## §7 · Năm màn PV One — mục đích và state phải có

Bản vẽ đã xoá; đây là phần đặc tả còn giữ để dựng lại.

| #   | Màn                       | Trạng thái bắt buộc code                                                                                                                                                                                                         |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | **Trang chủ / Tổng quan** | HAI TẦNG. Tầng phòng: 1 hero 2×2 (đường tiền) + 4 KPI + 2 alert card + pipeline theo chặng + phễu + bảng nhân sự. Tầng cá nhân: hàng việc quá hạn của chính người đăng nhập + AI strip. Empty state khi không có việc cần chú ý. |
| 02  | **Hộp phê duyệt**         | list nhóm theo loại · detail 3 khối (vì sao / bảng báo giá AI / ảnh hưởng nếu duyệt hôm nay) · chuỗi duyệt E3 · ghi vết E2. State: `waiting` ↔ `approved`.                                                                       |
| 03  | **Tìm toàn cục**          | 1 query → 4 nguồn, 1 list trộn theo liên quan. Bắt buộc có hàng **"Bị ẩn theo quyền của bạn"** + nút xin quyền. Đổi theo người xem (TP Kinh doanh vs Giám đốc).                                                                  |
| 04  | **Trợ lý AI**             | panel phải 420px ↔ 760px, đè lên brief + scrim `rgba(3,7,16,.52)`. Suggestion card sticky đáy, collapse được. State: `pending` ↔ `done`.                                                                                         |
| 05  | **Thông báo & kênh**      | bảng quy tắc (sự kiện → ngưỡng → kênh → nhịp → vai) · nhật ký gửi có 1 dòng **`blocked-duplicate`** · preview thật Zalo OA ↔ Email · dirty state "chưa lưu".                                                                     |

Màn 01 đã dựng (`apps/web/src/pages/home.tsx`). Bốn màn còn lại chưa.

> **Màn 01 đổi hình 03/09.** Bản cũ là morning brief của một câu chuyện sản xuất:
> hero là vòng đời đơn bán `SO-0891`, bốn KPI gồm hiệu suất thiết bị và công nợ,
> hai alert card nói về máy CNC. Không thứ nào trong số đó có bảng, endpoint hay
> màn đứng sau — `apps/api` chỉ có nhánh `sales`, `routes.tsx` không có route
> Supply/Factory/Finance nào — và mọi con số đều gõ thẳng vào JSX.
>
> Bản mới đọc ba sổ có thật (lead · cơ hội · hợp đồng) và tách làm hai tầng vì
> hai tầng trả lời hai câu khác nhau: tầng trên là số của cả phòng, **không**
> theo phạm vi người xem; tầng dưới là việc quá hạn của riêng người đang đăng
> nhập. Gộp chúng lại là để chữ "pipeline" mang hai nghĩa dưới cùng một nhãn.
>
> Hero vẫn đúng MỘT ô 2×2 (luật §3 · desktop), nhưng nội dung là **đường tiền**
> — đang mở · đã ký · đã thu · quá hạn thu — chứ không phải vòng đời một đơn.
> Bốn cái đó không phải bốn bậc của một phễu và nhãn không được gọi chúng là
> phễu: chúng chung đơn vị, không chung mẫu số.
>
> `/` là route DUY NHẤT không khai `permission`, nên mỗi khối tự hỏi E2 quyền
> của nó (`enabled` trên từng query) và màn nói ra khối nào bị ẩn. Một tài khoản
> marketing không có `cơ-hội.xem` lẫn `hợp-đồng.xem`; bắn query vô điều kiện là
> biến trang chủ của họ thành một dải báo lỗi.

---

## §8 · Checklist trước khi mở PR

- [ ] §8.1 — Không có hex nào trong code ngoài tầng token → `aurora/no-raw-hex`
- [ ] §8.2 — Không có viền quanh hộp ngoài biến thể tương phản cao → `aurora/no-box-border`
- [ ] §8.3 — Mọi bảng/list dài nằm trên `.glass-b` → tầng kiểu, `DataTable` không tự vẽ mặt kính
- [ ] §8.4 — Mọi khối AI có "Căn cứ:" + nút; không hành động nào tự chạy → tầng kiểu + `E3.proposeFromAi`
- [ ] §8.5 — Mọi màn có ContextRail → `E1.story()`
- [ ] §8.6 — Padding/gap chỉ thuộc 8 bậc → `aurora/spacing-scale`
- [ ] §8.7 — `prefers-reduced-motion` tắt hết animation aurora
- [ ] **§8.8 — Nền đúng 4 lớp · tương phản ≥ 4.5:1 · nút tablet ≥ 48px**

Bảy dòng đầu **máy gác** — `pnpm check` chạy hết. Dòng cuối là việc của mắt
người, có trong `.github/pull_request_template.md`.

> §8.8 nguyên bản là "so màn build với `screens-png/` ở 100% zoom, lệch < 4px".
> Ảnh tham chiếu đã xoá cùng `project/`, nên tiêu chí đổi thành ba thứ tự kiểm
> được bằng mắt mà không cần ảnh gốc. Dựng lại bộ ảnh thì khôi phục tiêu chí cũ.
