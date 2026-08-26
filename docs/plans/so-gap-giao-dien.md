# Sổ gap giao diện — PV One

Soát ngày 20/08 trên `develop` (mốc `9c99a79`). Phạm vi: toàn bộ `packages/ui/src`,
`apps/web/src/{pages,app,components,kit,styles}`.

Đây là **sổ gap**, không phải bài cảm nhận: mỗi dòng có `file:line` và một câu vá.
Mục §8 là **hợp đồng nhất quán** — thứ phải dán vào PR template để lần dựng sau
không lệch lại. Mục §3 (spacing) là **đề xuất**, không phải quyết định: CLAUDE.md
nói món nợ đó "đừng tự quyết, gặp thì hỏi".

Ba con số mở đầu:

| Đo                                   | Hiện tại             | Nên                 |
| ------------------------------------ | -------------------- | ------------------- |
| cỡ chữ khác nhau trong code sản phẩm | **21**               | 7 (đúng thang F-02) |
| mức nền `bg-white/N` khác nhau       | **11 nền + 6 hover** | 4                   |
| chỗ spacing ngoài thang 8 bậc        | **108** ở 25 file    | 0                   |

---

## §1 · Bảng tổng gap

Mức: **chặn** = sai luật cứng hoặc người dùng gặp lỗi thật · **nên** = lệch nhất
quán, sửa rẻ · **tuỳ** = dọn khi đụng tới file.

| Mã   | Trục | Mức      | file:line                                                                                                                                                        | Vá một câu                                                                                                                                                                                                                  |
| ---- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | 1    | nên      | `apps/web/src/pages/home.tsx:24`, `campaigns.tsx:168`, `campaign-detail.tsx:214`, `leads.tsx:233`, `lead-detail.tsx:190`, `plan.tsx:122`, `sales-config.tsx:106` | Rút khối "h2 + p phụ đề + hàng nút phải" thành `PageHeader` ở `layout/`.                                                                                                                                                    |
| G-02 | 1    | **chặn** | `apps/web/src/pages/home.tsx:111`                                                                                                                                | `AiAction` thiếu slot "Chưa tạo gì cả" nên home không có state đó — luật 9; thêm prop `empty` bắt buộc vào `patterns/ai-action.tsx`.                                                                                        |
| G-03 | 1    | nên      | `campaign-parts.tsx:66,477,603,625,705`, `campaign-detail.tsx:434`, `lead-detail.tsx:317,377,447`, `leads.tsx:813,839`, `plan.tsx:258`, `sales-config.tsx:353`   | 13 bản chép `rounded-md bg-white/5 p-3\|p-4` → `InsetPanel` ở `ui/`.                                                                                                                                                        |
| G-04 | 1    | nên      | `campaign-parts.tsx:49` vs `plan.tsx:329`                                                                                                                        | Hai bản "Cố tình không làm" khác vỏ và khác cỡ chữ → `NotDoingList` ở `patterns/`.                                                                                                                                          |
| G-05 | 1    | nên      | `campaign-detail.tsx:104`, `campaigns.tsx:249,282`, `leads.tsx:376`, `performance.tsx:216`, `lead-detail.tsx:144`, `sales-config.tsx:133`, `plan.tsx:144`        | 6 hình khung chờ tự dựng → `LoadingBlock` + `TableSkeleton` ở `patterns/`.                                                                                                                                                  |
| G-06 | 1    | nên      | `lead-detail.tsx:257` vs `packages/ui/src/patterns/empty-state.tsx:10`                                                                                           | `EmptyLead` là bản chép `EmptyState` chỉ vì `message` khai kiểu `string` — nới thành `ReactNode` rồi xoá bản chép.                                                                                                          |
| G-07 | 1    | nên      | `components/assign-menu.tsx:160`, `lead-detail.tsx:486`                                                                                                          | Hai bản chép `Kicker` (`font-mono text-[10.5px] uppercase tracking-[.13em]`) → dùng `<Kicker tone="muted">`.                                                                                                                |
| G-08 | 1    | nên      | 12 chỗ, xem §2 G-08                                                                                                                                              | Cặp `variant={x ? 'default' : 'ghost'}` là ba việc khác nhau (tab · lọc · công tắc) đội một hình → tách `TabRow` (patterns/) và dùng `SegmentedControl` cho lọc.                                                            |
| G-09 | 1    | nên      | `leads.tsx:892`                                                                                                                                                  | `Pager` nằm trong màn → chuyển sang `patterns/pager.tsx`, vì sổ nguồn và bảng nhân sự sẽ cần.                                                                                                                               |
| G-10 | 1    | tuỳ      | `campaign-detail.tsx:204`, `lead-detail.tsx:180`                                                                                                                 | Hai bản "← Sổ X" → `BackLink` ở `ui/`.                                                                                                                                                                                      |
| G-11 | 1    | nên      | `leads.tsx:281` vs `campaigns.tsx:263`                                                                                                                           | Một màn có hàng lọc thật (SearchField + 4 Select), màn kia là bốn nút pill trong `SectionTitle.actions` → `FilterBar` ở `patterns/`.                                                                                        |
| G-12 | 1    | nên      | `leads.tsx:824` vs `packages/ui/src/patterns/data-table.tsx:133`                                                                                                 | Thẻ kanban chép lại nguyên logic "dòng bấm được" của `DataTable` (role/tabIndex/Enter/Space/focus ring) → `ClickableSurface` ở `ui/`.                                                                                       |
| G-13 | 1    | tuỳ      | `lead-detail.tsx:734`, `leads.tsx:863`, `plan.tsx:284`                                                                                                           | Cặp "Badge _Đã đề nghị_ ↔ Button hành động" lặp 3 chỗ → `ActionOrDone` ở `patterns/`.                                                                                                                                       |
| G-14 | 1    | tuỳ      | `performance.tsx:908`, `sales-config.tsx:353`, `leads.tsx:757`                                                                                                   | Ba bản "số to + nhãn nhỏ" → `FactTile` ở `ui/`.                                                                                                                                                                             |
| G-15 | 2    | nên      | `performance.tsx:171` vs 7 màn còn lại                                                                                                                           | Performance dùng `SectionTitle size="lg"` (18px) làm tiêu đề màn, 7 màn kia dùng `h2` 20/22px → **chuẩn là `PageHeader` 20/22px**, `SectionTitle` chỉ dùng cho khối con.                                                    |
| G-16 | 2    | nên      | `campaigns.tsx:167` (`gap-4`) vs `plan.tsx:121` (`gap-5`)                                                                                                        | Hai nhịp dọc trang, 4 màn mỗi bên → **chuẩn `gap-4 lg:gap-6`**, vì `AppShell` đã dùng đúng nhịp đó cho khe nav↔nội dung (`app-shell.tsx:32`).                                                                               |
| G-17 | 2    | nên      | `lead-detail.tsx:290` (`p-5 lg:p-6`) vs `leads.tsx:374` (`p-4 lg:p-5`) vs `campaigns.tsx:253` (`p-5`)                                                            | Bốn cách đệm thẻ → **thang ba bậc: thẻ cấp một `p-5 lg:p-6` · thẻ lồng `p-4` · ô lồng cấp hai `p-3`**.                                                                                                                      |
| G-18 | 2    | **chặn** | `campaigns.tsx:354` (`tnum font-num`) vs `performance.tsx:1205` (`<Money scale="table">`)                                                                        | Luật 6 nói số bảng là IBM Plex Mono; trong `pages` có 48 lượt `tnum font-num` (phần lớn nằm trong ô bảng) và đúng 2 lượt mono → **mono trong ô bảng và mã, `font-num` chỉ cho số hero/KPI/gauge**.                          |
| G-19 | 2    | nên      | `packages/ui/src/ui/money.tsx` vs `performance.tsx:134` vs `campaign-model.ts:77` vs `data/plan.ts:174`                                                          | Năm bộ định dạng tiền/số song song → **`<Money>` là đường duy nhất trên JSX**; `millions/billions/percent` chỉ dùng khi ghép chuỗi (hint, basis).                                                                           |
| G-20 | 2    | nên      | `apps/web/src/lib/date.ts:6` vs `apps/web/src/data/period.ts:251`                                                                                                | `dm()` và `vn()` cho ra đúng một chuỗi và đứng cạnh nhau trên cùng màn (`performance.tsx:179` với `:294`) → giữ `lib/date`, xoá `vn()`.                                                                                     |
| G-21 | 2    | nên      | `performance.tsx:140,719,737,1120`, `campaigns.tsx:355`, `campaign-detail.tsx:307`                                                                               | Sáu cách nói "không có số": `—` · `chưa đo được` · `chưa chấm` · `không đặt` · `chưa có lead tốt` · để trống → **ba mức chốt ở §8**.                                                                                        |
| G-22 | 2    | nên      | `performance.tsx:794` (Drawer) vs `leads.tsx:139` / `campaigns.tsx:319` (route)                                                                                  | Hai cách mở chi tiết một dòng → **dòng có hồ sơ riêng đi route; dòng chỉ mang số phái sinh của kỳ đang xem mở Drawer** — viết thành luật để khỏi cãi lại.                                                                   |
| G-23 | 2    | **chặn** | `home.tsx` (không có), `campaign-detail.tsx:186` (chế độ sửa không có)                                                                                           | Luật 10 đòi ContextRail trên mọi màn; hai chỗ thiếu, và 6 chỗ còn lại đặt rail ở 5 vị trí khác nhau → **rail luôn là hàng riêng ngay dưới `PageHeader`**.                                                                   |
| G-24 | 2    | tuỳ      | `data-table.tsx:77,158` (`border-b-white/6`) vs `separator.tsx:13` (`bg-white/8`) vs `theme-kit.tsx:86,124` (`/12`, `/10`)                                       | Bốn giá trị vạch kẻ qua ba cơ chế → **một `Separator`, một mức `/8`**.                                                                                                                                                      |
| G-25 | 2    | nên      | toàn repo                                                                                                                                                        | 11 mức `bg-white/N` + 6 mức hover, không mức nào có tên → **tokenize 4 mức**: nền lồng `/5` · control ghost `/9` · hover control `/16` · chip nguồn/active `/24`.                                                           |
| G-26 | 2    | nên      | `sales-config.tsx:523` bọc `:163,206,244,281,369,402`                                                                                                            | `GlassCard variant="b"` lồng trong `glass-a` 6 lần — đảo chiều độ sâu của §2 → **mục có bảng thì chính `Section` là `variant="b"`, bỏ thẻ lồng**.                                                                           |
| G-27 | 2    | nên      | `campaigns.tsx:191` (comment cấm) vs `campaigns.tsx:194` (`xl:`)                                                                                                 | Comment nói "không đẻ điểm gãy thứ tư", chính file đó dùng `xl:`; toàn repo còn `sm:` 12 lần → **ba điểm gãy: base = mobile · `md:` = tablet · `lg:` = desktop. Bỏ `sm:` và `xl:`.**                                        |
| G-28 | 2/5  | **chặn** | `home.tsx:18–118`                                                                                                                                                | Màn 01 còn nguyên tiếng Anh ("Good morning", "Basis", "Equipment effectiveness") trong khi 8 màn kia tiếng Việt — luật 14 → dịch trọn màn.                                                                                  |
| G-29 | 3    | nên      | `eslint-suppressions.json`                                                                                                                                       | 108 vi phạm `spacing-scale` đo lại được ở 25 file; suppressions còn khoá 2 file **đã xoá** (`organisms/app-sidebar.tsx`, `organisms/top-bar.tsx`, 6 lượt) → `pnpm lint:prune`, rồi dọn theo bảng §3.                        |
| G-30 | 4    | nên      | `sales-config.tsx`                                                                                                                                               | ~3.6k px cuộn, 11 thẻ `glass-a` cấp một, 7 mục lồng bảng, 10 đoạn giải thích → gộp còn 5 khối, xem §4.                                                                                                                      |
| G-31 | 4    | **chặn** | `campaign-parts.tsx:268,352`                                                                                                                                     | `lg:min-h-0 lg:flex-1 lg:overflow-y-auto` là xác của chế độ `AppShell fill` đã bỏ (`app-shell.tsx:19`); cha không phải flex nên form **không** tự cuộn như docblock hứa → xoá ba class, sửa docblock.                       |
| G-32 | 4    | nên      | `campaigns.tsx:194`, `campaign-detail.tsx:303`, `performance.tsx:399`, `plan.tsx:163`                                                                            | Bốn công thức cột khác nhau cho cùng một hàng `StatCard size="compact"` → một `StatRow` nhận `count`, tự chia cột.                                                                                                          |
| G-33 | 4    | nên      | `leads.tsx:232–445`                                                                                                                                              | 9 khối cấp một; `Pager` in hai lần (`:369`, `:442`); ghi chú phễu (`:588`) và ghi chú SLA (`:349`) nói cùng một chuyện "hai chỗ ra số khác nhau" → còn 6 khối, một pager.                                                   |
| G-34 | 5    | nên      | `kit/zone-foundations.tsx:28` (thang 7 cỡ)                                                                                                                       | Thực tế 21 cỡ trong code sản phẩm, 4 cỡ nữa chỉ có ở kit → khoá thang 7 cỡ, mọi cỡ ngoài thang phải nêu lý do.                                                                                                              |
| G-35 | 5    | nên      | 53 đoạn `text-muted-foreground text-[11.5px] leading-[1.5]` + 23 `SectionTitle.hint`                                                                             | Màn tự giải thích bằng văn xuôi 11,5px — dày nhất ở `sales-config` (10) và `campaign-parts` (14) → cắt còn 1 đoạn/khối, phần còn lại về docblock.                                                                           |
| G-36 | 6    | **chặn** | `packages/ui/src/layout/aurora-field.tsx:60`                                                                                                                     | `.aurora-vignette` là **lớp thứ 5** của nền, luật 12 chốt đúng 4 → gộp vignette vào `.aurora-field` hoặc bỏ.                                                                                                                |
| G-37 | 6    | **chặn** | `organisms/app-header.tsx:94,273`                                                                                                                                | Mục khoá dìm cả CHỮ bằng `opacity-45` → đo được **2,29:1** trên `glass-a` (ngưỡng 4,5); 8/9 mục tầng 2 đang khoá. Làm như `nav-item.tsx:62`: chỉ mờ icon, giữ nguyên màu chữ.                                               |
| G-38 | 6    | **chặn** | `packages/ui/src/ui/button.tsx:26`                                                                                                                               | `size="lg"` (h-12 = 48px) tồn tại nhưng **không màn nào dùng**; nút nghiệp vụ trên tablet đang là `md` = 40px (`campaign-detail.tsx:243` tự thừa nhận) → luật 13.                                                           |
| G-39 | 6    | nên      | `patterns/rich-text.tsx:57`, `ui/segmented-control.tsx:71`, `ui/checkbox.tsx:42`                                                                                 | Cùng bệnh với G-37 ở mức `opacity-55` → **2,77:1**; chốt: không bao giờ `opacity` lên chữ, trạng thái tắt đọc bằng nền + icon khoá.                                                                                         |
| G-40 | 6    | nên      | `patterns/rich-text.tsx:164` (đã ghi chú)                                                                                                                        | Chồng ba lớp trắng (`glass-a` → `bg-white/5` → `bg-input`) kéo `--muted-foreground` xuống **4,19:1**; chỉ RichText đã sửa → luật hoá: quá 2 lớp trắng thì chữ phụ dùng `--glass-foreground`.                                |
| G-41 | 6    | **chặn** | `app-shell.tsx:52` vs 9 màn                                                                                                                                      | `onNavigate` và `onOpenAssistant` **chưa màn nào truyền** → BottomNav 4 mục, FAB Trợ lý, nút "Trợ lý" ở header đều bấm không ra gì; `chrome.tsx:87–89` còn 3 mục Core không `path` nhưng `locked:false` nên trông bấm được. |
| G-42 | 6    | tuỳ      | `lead-detail.tsx:319`                                                                                                                                            | `<Separator className="hidden w-px self-stretch sm:block" />` — `h-px` của component thắng `self-stretch`, ra một chấm 1×1px → cần prop `orientation`.                                                                      |
| G-43 | 1/6  | nên      | `packages/ui/src/index.ts:58–68`                                                                                                                                 | Bốn component xuất khẩu mà **không có trên `/kit`**: `AppShell`, `OrderLifecycleCard`, `BottomNav`, `AssistantFab` — CLAUDE.md coi như chưa tồn tại.                                                                        |
| G-44 | 6    | tuỳ      | `kit/theme-kit.tsx:16` · `kit/zone-templates.tsx:140` · `organisms/order-lifecycle-card.tsx:7`                                                                   | Ba chỗ kit nói sai: mục lục đếm 14/11/5/3 trong khi thật là 19/12/4/4; T-04 ghi "md 480 / lg 640" còn `drawer.tsx:130` là 560/760; mã `O-06` cấp cho cả `AppHeader` lẫn `OrderLifecycleCard`.                               |

---

## §2 · Trục 1+2 — component chung và hai-cách-làm

### 2.1 · Mẫu lặp chưa thành component

| Mẫu lặp                                                                           | Xuất hiện                                                                                                                                   | Nên thành                                  | Zone        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- |
| tiêu đề màn: `h2 font-display 20/22px` + `p` phụ đề 12px + hàng nút/rail bên phải | home:24 · campaigns:168 · campaign-detail:214 · leads:233 · lead-detail:190 · plan:122 · sales-config:106 (7 màn)                           | `PageHeader`                               | `layout/`   |
| ô lồng `rounded-md bg-white/5 p-3\|p-4`                                           | campaign-parts:66,477,603,625,705 · campaign-detail:434 · lead-detail:317,377,447 · leads:813,839 · plan:258 · sales-config:353 (13)        | `InsetPanel`                               | `ui/`       |
| khung chờ (Skeleton dựng tay)                                                     | campaign-detail:104 · campaigns:249,282 · leads:376 · performance:216 · lead-detail:144 · sales-config:133 · plan:144 (8, 6 hình khác nhau) | `LoadingBlock`, `TableSkeleton`            | `patterns/` |
| khối "Cố tình không làm"                                                          | campaign-parts:49 (div bg-white/5, h3 12,5px) · plan:329 (GlassCard, h3 13px)                                                               | `NotDoingList`                             | `patterns/` |
| "Chưa tạo gì cả" dưới khối AI                                                     | campaign-detail:425 · campaign-parts:768 · performance:1255 · plan:223 · **thiếu ở home:111**                                               | prop `empty` của `AiAction`                | `patterns/` |
| cặp nút chọn 2 trạng thái                                                         | campaign-detail:271 · campaigns:268 · campaign-parts:381,662,710 · leads:250,257,331 · lead-detail:217,639,742 · sales-config:178 (12)      | `TabRow` + dùng `SegmentedControl` cho lọc | `patterns/` |
| phân trang                                                                        | leads:892 (chỉ 1 nơi, nhưng sổ nguồn 8 dòng và bảng nhân sự sẽ cần)                                                                         | `Pager`                                    | `patterns/` |
| back-link "← Sổ X"                                                                | campaign-detail:204 · lead-detail:180                                                                                                       | `BackLink`                                 | `ui/`       |
| hàng lọc                                                                          | leads:281 (SearchField + 4 Select + 2 nút) · campaigns:263 (4 nút pill trong `SectionTitle.actions`)                                        | `FilterBar`                                | `patterns/` |
| thẻ bấm được (không phải hàng bảng)                                               | leads:824 (chép logic của `data-table.tsx:133`) · leads:692                                                                                 | `ClickableSurface`                         | `ui/`       |
| "số to + nhãn nhỏ" ngoài `StatCard`                                               | performance:908 (`Fact`) · sales-config:353 (ô hoa hồng) · leads:757 (ô tóm tắt)                                                            | `FactTile`                                 | `ui/`       |
| cặp "Đã đề nghị ↔ nút hành động"                                                  | lead-detail:734 · leads:863 · plan:284                                                                                                      | `ActionOrDone`                             | `patterns/` |
| kicker mono in hoa                                                                | assign-menu:160 · lead-detail:486 (bản chép của `separator.tsx:34`)                                                                         | dùng `Kicker` sẵn có                       | —           |
| hàng `StatCard size="compact"`                                                    | campaigns:194 · campaign-detail:303 · performance:399 · plan:163 — bốn công thức cột                                                        | `StatRow`                                  | `patterns/` |

### 2.2 · Cùng một thứ, hai cách làm — và chốt cái nào

| Việc                 | Cách A                                                                            | Cách B                                                                                                                                                        | **Chuẩn**                                                                                         | Vì sao                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| tiêu đề màn          | `h2` 20/22px — 7 màn                                                              | `SectionTitle size="lg"` 18px — `performance.tsx:171`                                                                                                         | **A**, gói vào `PageHeader`                                                                       | 7 màn đã theo; và `SectionTitle` render `<h2>`, dùng nó làm tiêu đề màn thì mọi khối con cũng là `h2` — cây tiêu đề phẳng lì. |
| nhịp dọc trang       | `gap-4 lg:gap-6` — campaigns:167, campaign-detail:203, leads:232, lead-detail:179 | `gap-5 lg:gap-6` — home:23, performance:170, plan:121, sales-config:105                                                                                       | **A**                                                                                             | `AppShell` đã dùng đúng nhịp này cho khe nav↔nội dung (`app-shell.tsx:32`); khung và nội dung thở cùng nhịp.                  |
| đệm thẻ              | `p-5 lg:p-6` (18 chỗ)                                                             | `p-4 lg:p-5` (4), `p-5` (9), `p-4` (40), `p-3` (25)                                                                                                           | **thang 3 bậc**: cấp một `p-5 lg:p-6` · lồng `p-4` · lồng cấp hai `p-3`                           | Ba bậc đọc ra ba tầng sâu; bốn bậc chỉ đọc ra nhiễu.                                                                          |
| số trong ô bảng      | `tnum font-num` — 48 lượt trong `pages`                                           | `<Money scale="table">` mono — performance:1124,1205                                                                                                          | **B**                                                                                             | Luật 6: "IBM Plex Mono (mã, số bảng)". Cách A đang phổ biến nhưng sai luật.                                                   |
| tiền                 | `<Money>` (4 chỗ)                                                                 | `millions()` thô (campaigns:355, campaign-detail:329), `money()` riêng (performance:134), `grouped()` (campaign-model:77), `num()` (performance:131)          | **`<Money>`** cho mọi số tiền hiện trên JSX                                                       | Một chỗ quyết đơn vị (tr/tỷ/đồng) và một chỗ quyết font. Hàm chuỗi chỉ dùng khi ghép câu.                                     |
| ngày ngắn            | `dm()` — `lib/date.ts:6`                                                          | `vn()` — `data/period.ts:251` (cùng đầu ra)                                                                                                                   | **`dm()`**                                                                                        | Ngày tháng là chuyện trình bày, thuộc `lib/`, không thuộc một file dữ liệu của một màn.                                       |
| số 0 / rỗng          | `'—'` (11 chỗ)                                                                    | `'chưa đo được'` / `'chưa chấm'` / `'không đặt'` / `'chưa có lead tốt'` / để trống                                                                            | **ba mức, xem §8**                                                                                | Hiện `—` mang hai nghĩa khác nhau (không áp dụng · chưa có nguồn số) trên cùng một màn (`performance.tsx:413` với `:590`).    |
| mở chi tiết một dòng | Drawer — `performance.tsx:794`                                                    | Route — `leads.tsx:139`, `campaigns.tsx:319`                                                                                                                  | **cả hai, nhưng có luật**: thực thể có hồ sơ riêng → route; số phái sinh của kỳ đang xem → Drawer | Hồ sơ cần gửi được link và F5 được (`campaign-detail.tsx:65`); số của kỳ thì mất mạch so sánh nếu rời bảng (`drawer.tsx:12`). |
| ContextRail          | hàng riêng — leads:265, lead-detail:228, sales-config:130                         | trong hàng tiêu đề — campaigns:179, campaign-detail:240; cuối màn — performance:1261; có nhãn dẫn — plan:135; **không có** — home, campaign-detail chế độ sửa | **hàng riêng ngay dưới `PageHeader`**                                                             | Rail là "câu chuyện của màn"; nó ở một chỗ cố định thì mắt học một lần.                                                       |
| vạch kẻ              | `border-b-white/6` — data-table:77,158                                            | `h-px bg-white/8` — separator:13, timeline:40; `border-t-white/12` ×6, `/10` ×1 — kit                                                                         | **`Separator`, mức `/8`**                                                                         | Timeline đã chốt lý do (borderless, `timeline.tsx:16`); bảng là chỗ duy nhất còn dùng border.                                 |
| nền lồng             | `/5` (23), `/9` (14), `/8` (12)                                                   | `/6 /7 /10 /12 /16 /24 /28 /14`                                                                                                                               | **4 mức có tên** (§8)                                                                             | Hover cùng một loại control đang là `/8`, `/9`, `/10` ở ba file khác nhau.                                                    |
| mặt kính             | `glass-b` đứng cấp một — plan:234, performance:526                                | `glass-b` lồng trong `glass-a` — sales-config ×6                                                                                                              | **A**                                                                                             | §2 xếp `glass-b` là mặt ĐỤC HƠN; đặt nó bên trong `glass-a` đọc ra như một cái hố.                                            |
| điểm gãy             | `lg:` (104 lượt)                                                                  | `sm:` (12), `md:` (6), `xl:` (5)                                                                                                                              | **base · `md:` · `lg:`**                                                                          | Luật 3 có đúng ba thiết bị; `sm:`/`xl:` là hai vai không tồn tại trong hệ.                                                    |
| ngôn ngữ             | tiếng Việt — 8 màn                                                                | tiếng Anh — `home.tsx`                                                                                                                                        | **tiếng Việt**                                                                                    | Luật 14; docblock của chính home:13 đã ghi nợ này.                                                                            |

---

## §3 · Trục 3 — spacing (ĐỀ XUẤT, chưa quyết)

Đo lại bằng chính luật của `tools/eslint-plugin-aurora/rules/spacing-scale.js`:
**108** chỗ ngoài thang, **25** file. `eslint-suppressions.json` ghi 115 ở 27 file —
chênh vì 2 file trong suppressions đã bị xoá (`organisms/app-sidebar.tsx` 5,
`organisms/top-bar.tsx` 1). Chạy `pnpm lint:prune` là hết 6 lượt ma.

### 3.1 · Ai đang nợ

| File                                                                                                                                                                               | Nợ         | Ghi chú                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `apps/web/src/kit/zone-foundations.tsx`                                                                                                                                            | 22         | Chrome của trang tài liệu, không phải màn sản phẩm                         |
| `apps/web/src/kit/zone-atoms.tsx`                                                                                                                                                  | 15         | như trên                                                                   |
| `apps/web/src/kit/theme-kit.tsx`                                                                                                                                                   | 9          | như trên                                                                   |
| `apps/web/src/kit/zone-templates.tsx`                                                                                                                                              | 7          | `zone-templates.tsx:15` tự khai là bản vẽ tỉ lệ — **xin miễn trừ cả file** |
| `apps/web/src/kit/zone-molecules.tsx`                                                                                                                                              | 7          |                                                                            |
| `packages/ui/src/organisms/order-lifecycle-card.tsx`                                                                                                                               | 6          | **hàng thật, ưu tiên cao**                                                 |
| `packages/ui/src/organisms/kiosk-tile.tsx`                                                                                                                                         | 6          |                                                                            |
| `packages/ui/src/patterns/ai-action.tsx`                                                                                                                                           | 4          |                                                                            |
| `patterns/search-field.tsx` · `patterns/nav-item.tsx` · `organisms/brief-card.tsx` · `organisms/approval-card.tsx` · `kit/chrome/zone.tsx` · `kit/chrome/spec-card.tsx`            | 3 mỗi file |                                                                            |
| `ui/button.tsx` · `patterns/approval-chain.tsx` · `organisms/bottom-nav.tsx`                                                                                                       | 2 mỗi file |                                                                            |
| `ui/input.tsx` · `ui/chip.tsx` · `ui/badge.tsx` · `patterns/stat-card.tsx` · `patterns/scan-field.tsx` · `patterns/context-rail.tsx` · `pages/home.tsx` · `kit/zone-organisms.tsx` | 1 mỗi file |                                                                            |

Tin tốt: **`apps/web/src/pages` gần như sạch** — chỉ `home.tsx:28` (`mt-1.5`).
Nợ nằm ở `@pv/ui` (39) và trang kit (63).

### 3.2 · Giá trị lệch → bậc thay thế

| Giá trị                                                                                                                        | Số lượt | px          | Bậc đề xuất                           | Rủi ro thị giác                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `py-[18px]`                                                                                                                    | 16      | 18          | `py-4` (16)                           | Thấp — `stat-card.tsx:73` đã trả nợ đúng kiểu này và không ai thấy khác                                                                                                |
| `gap-2.5`                                                                                                                      | 15      | 10          | `gap-2` (8)                           | Thấp ở hàng icon+chữ; ở `approval-chain.tsx:15` (chấm ↔ đường nối) nên lên `gap-3` để chấm không dính                                                                  |
| `gap-3.5`                                                                                                                      | 9       | 14          | `gap-3` (12)                          | Thấp                                                                                                                                                                   |
| `mt-2.5` / `-mt-2.5`                                                                                                           | 7       | 10          | `mt-2` (8)                            | Thấp                                                                                                                                                                   |
| `pt-10`, `pb-10`, `pt-9`, `gap-10`, `mb-7`, `gap-7`, `pt-14`                                                                   | 11      | 40/36/28/56 | `*-8` (32) hoặc `*-12` (48)           | **Chỉ ở trang kit** — nhịp giữa các zone rộng ra/hẹp lại, không ảnh hưởng màn                                                                                          |
| `gap-1.5`, `pr-1.5`, `mt-0.5`                                                                                                  | 6       | 6/2         | `*-1` (4)                             | Thấp                                                                                                                                                                   |
| `py-3.5`, `pt-3.5`, `px-3.5`, `py-2.5`, `p-2.5`, `pb-2.5`, `mb-2.5`                                                            | 10      | 14/10       | `*-3` (12) / `*-2` (8)                | Thấp                                                                                                                                                                   |
| `mt-1.5`                                                                                                                       | 3       | 6           | `mt-1` (4)                            | Thấp — đây là khe tiêu đề↔phụ đề, và 6 màn kia đã dùng `mt-1`                                                                                                          |
| `px-[18px]` (Button md), `px-[14px]` (Input, SearchField)                                                                      | 4       | 18/14       | `px-5` (20) / `px-4` (16)             | **Cần quyết** — `button.tsx:10` khai rằng thang 8 bậc không áp cho padding ngang của control. Nếu chấp nhận lời khai đó thì bổ sung ngoại lệ vào rule, đừng để nợ treo |
| `px-[11px]` (Badge), `px-[10px]` (Chip), `px-[7px]`, `px-[5px]` (badge số)                                                     | 4       | 11/10/7/5   | `px-3` (12) / `px-2` (8) / `px-1` (4) | Trung bình — tag hẹp lại/rộng ra 1–2px mỗi bên, đọc được ngay ở hàng chip dày                                                                                          |
| `p-[22px]`, `px-[22px]`, `py-[22px]`                                                                                           | 4       | 22          | `p-5` (20)                            | Thấp                                                                                                                                                                   |
| `px-[26px]`, `px-[15px]`, `py-[13px]`, `py-[11px]`, `py-[9px]`, `mx-[18px]`, `mt-[7px]`, `mt-[5px]`, `gap-[9px]`, `gap-[11px]` | 15      | —           | bậc gần nhất                          | Thấp — phần lớn ở kit                                                                                                                                                  |
| `py-px`                                                                                                                        | 2       | 1           | giữ, hoặc `py-1` + `leading` chặt     | Cao nếu đổi thẳng: badge số trong nav cao thêm 6px và đội cả hàng                                                                                                      |
| `pb-[110px]`                                                                                                                   | 1       | 110         | `pb-12` (48) ×…                       | Chỉ ở `theme-kit.tsx:36`; thang tối đa 48 nên số này không biểu diễn được — **cần một quyết định về padding trang**                                                    |

**Đề nghị chốt trước khi đụng code:** (a) miễn trừ cả `apps/web/src/kit/**` vì đó
là trang tài liệu, không phải màn sản phẩm — 63/108 nợ biến mất bằng một dòng
config; (b) quyết dứt điểm câu "padding ngang của control có thuộc thang 8 bậc
không" (`button.tsx:10`); (c) 39 lượt còn lại trong `@pv/ui` dọn theo bảng trên.

---

## §4 · Trục 4 — layout và mật độ

### 4.1 · Từng màn

| Màn                  | Khung           | Nhịp             | Cột                                   | Khối cấp một         | Cuộn ước tính | Nên còn                                                                                                          |
| -------------------- | --------------- | ---------------- | ------------------------------------- | -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `home`               | AppShell        | `gap-5 lg:gap-6` | bento `2 → lg:4`, `auto-rows-[150px]` | 3                    | ~700 px       | 3 — đã lean, chỉ thiếu rail (G-23) và state AI (G-02)                                                            |
| `campaigns` (list)   | AppShell        | `gap-4 lg:gap-6` | KPI `2 → lg:3 → xl:6`                 | 3                    | ~900 px       | 3                                                                                                                |
| `campaigns` (create) | AppShell        | `gap-4 lg:gap-6` | form `lg:2 → xl:3`                    | 2                    | ~1.500 px     | 2                                                                                                                |
| `campaign-detail`    | AppShell        | `gap-4 lg:gap-6` | `lg:[1.6fr_1fr]`; score `2 → xl:4`    | 4 ngoài + 6 trong    | ~1.500 px     | 4 + 5                                                                                                            |
| `leads` (sổ)         | AppShell        | `gap-4 lg:gap-6` | phễu `2 → sm:3 → lg:6`                | **9**                | ~1.100 px     | **6** — bỏ pager trên (`:369`), gộp hai ghi chú (`:349`, `:588`), đưa hàng "N dòng khớp" vào `SectionTitle.hint` |
| `leads` (việc)       | AppShell        | `gap-4 lg:gap-5` | kanban `1 → sm:2 → lg:3 → xl:6`       | 3                    | ~800 px       | 3                                                                                                                |
| `lead-detail`        | AppShell        | `gap-4 lg:gap-6` | `lg:[1.6fr_1fr]`                      | 6 ngoài + **7 thẻ**  | ~2.200 px     | 6 + 5 — gộp `PeopleCard` (`:554`) vào `SlotsCard`, `ExitPanel` (`:594`) xuống chân `HistoryCard`                 |
| `performance`        | AppShell        | `gap-5 lg:gap-6` | bento `2 → lg:3 → xl:4`               | 5 ngoài + **13 thẻ** | ~1.950 px     | 5 + 10 — `FunnelHero` (`:475`) và `GaugeBlock` fallback (`:824`) vẽ **cùng một phễu hai lần**                    |
| `performance` drawer | Drawer `lg` 760 | `gap-5`          | `sm:` 2 cột                           | 4                    | ~1.400 px     | 4                                                                                                                |
| `plan`               | AppShell        | `gap-5 lg:gap-6` | `lg:[1.6fr_1fr]`; stats `2 → lg:4`    | 5                    | ~1.600 px     | 4 — mỗi `AiAction` kèm một đoạn 2 dòng, ba đề xuất là ba đoạn nói cùng ý (`:216–227`)                            |
| `sales-config`       | AppShell        | `gap-5 lg:gap-6` | 1 cột                                 | **11**               | **~3.600 px** | **5** — xem 4.2                                                                                                  |
| `sign-in`            | AuroraField     | `gap-5`          | 1 cột, `max-w-md`                     | 1                    | 1 màn         | 1                                                                                                                |

### 4.2 · Ba chỗ nói cùng một chuyện hai lần

| Chỗ                                                                                   | Trùng gì                                                                                    | Vá                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `sales-config.tsx:116` "Ba luật của màn này" vs docblock `:25–34` vs 7 `Section.hint` | Luật 2 ("phải qua {HEAD_OF_SALES} gật") lặp lại nguyên văn ở `:123`, `:270`, `:299`, `:485` | Giữ thẻ "Ba luật", bỏ 3 lần nhắc trong hint                               |
| `performance.tsx:501` (`FunnelHero`) và `:835` (`GaugeBlock` fallback)                | Cùng `data.funnel`, cùng `orientation="bar"`, cùng nhãn "của bậc trên"                      | Trong drawer, thay phễu bằng một dòng link "xem phễu của phòng ở đầu màn" |
| `leads.tsx:349` (SLA chưa có ngưỡng) và `:588` (phễu luỹ kế vs bậc hiện tại)          | Hai đoạn cùng nói "hai chỗ ra số khác nhau, đúng như vậy"                                   | Một chú thích chung dưới phễu                                             |

### 4.3 · Chỉ tiêu lean cho `sales-config` (3.600 → ~1.400 px)

| Đổi                                                                             | Tiết kiệm                  |
| ------------------------------------------------------------------------------- | -------------------------- |
| Bỏ `GlassCard variant="b"` lồng (G-26): `Section` chứa bảng thì chính nó là `b` | 6 × 32px padding = ~190 px |
| Gộp 5.1 + 5.5 (cùng nói "cổng và ngưỡng")                                       | ~270 px                    |
| Gộp 5.3 + 5.4 + 5.7 thành một `Section` "Danh sách đóng" với 3 tab              | ~700 px                    |
| 10 đoạn giải thích → 5 (một đoạn/`Section`, phần còn lại về docblock)           | ~250 px                    |
| Bảng 5.1 (10 dòng ô bắt buộc) chuyển sang `DataTable` thay `ul` thủ công        | ~120 px                    |

---

## §5 · Trục 5 — chữ và nội dung

### 5.1 · Cỡ chữ

Thang chuẩn khai ở `kit/zone-foundations.tsx:28`: **42 · 28 · 22 · 15 · 13 · 12,5 · 11,5**
(+ mono 12,5). Thực tế:

| Nơi                                 | Cỡ đang dùng                                                                                                    | Ngoài thang                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/ui/src`                   | 9,5 · 10 · 10,5 · 11 · 11,5 · 12 · 12,5 · 13 · 13,5 · 14 · 15 · 16 · 17 · 18 · 20 · 22 · 26 · 28 · 30 · 36 · 42 | **14 cỡ**                        |
| `apps/web/src/pages` + `components` | 10,5 · 11 · 11,5 · 12 · 12,5 · 13 · 13,5 · 15 · 16 · 20 · 22 · 26                                               | **7 cỡ**                         |
| `apps/web/src/kit`                  | thêm 7,5 · 9 · 40 · 104                                                                                         | 4 cỡ (chấp nhận: trang tài liệu) |

Ba việc:

1. **Thang thiếu bậc thật.** 10,5 (kicker, nhãn phụ trong bảng) và 11 (nhãn ô nhập)
   dùng 43+13 lần — chúng là bậc có thật, phải vào thang chứ không phải vi phạm.
   Đề xuất thang **9 bậc**: 42 · 26 · 22 · 15 · 13 · 12,5 · 11,5 · 11 · 10,5.
2. **Bậc thừa cần gộp:** 14→13,5 · 16→15 · 17→15 · 18→22 · 20→22 · 28→26 · 30→26 · 36→26 · 9,5→10,5.
3. **11,5px là cỡ body mặc định trên thực tế** (83 lượt trong pages) trong khi
   thang gọi nó là "text-xs". Màn đang đọc bằng cỡ nhỏ nhất của hệ — đây là gốc
   của cảm giác dày. Đổi thân đoạn giải thích lên **12,5px** và bù bằng cách cắt
   số đoạn (§5.2).

### 5.2 · Văn xuôi trong JSX

| Màn               | Đoạn giải thích ≥2 dòng | Ngoài ra                                          |
| ----------------- | ----------------------- | ------------------------------------------------- |
| `campaign-parts`  | 14                      | 4 `SectionTitle.hint` + 3 mục "Cố tình không làm" |
| `sales-config`    | 10                      | 7 `Section.hint`                                  |
| `performance`     | 7                       | 8 `SectionTitle.hint`                             |
| `plan`            | 6                       | 4 mục "Cố tình không làm"                         |
| `lead-detail`     | 5                       | 3 hint                                            |
| `campaign-detail` | 4                       | 2 hint                                            |
| `leads`           | 4                       | —                                                 |
| `assign-menu`     | 2                       | —                                                 |
| **Tổng**          | **53**                  | **+23 hint**                                      |

Nguyên tắc cắt: **một khối được một câu.** Câu đó trả lời "con số này đọc thế nào",
không phải "vì sao chúng tôi dựng như vậy". Câu thứ hai trở đi về docblock. Ba ví dụ:

| Hiện                                                  | Cắt còn                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `sales-config.tsx:268` (3 dòng về cột "Lead cả kỳ")   | "Đếm cả lead đã rơi và đã ký."                  |
| `leads.tsx:588` (4 dòng về phễu luỹ kế)               | "Phễu đếm luỹ kế; ô lọc Bậc đếm bậc đang đứng." |
| `plan.tsx:309` (2 dòng lặp lại nhãn nút ngay trên nó) | bỏ hẳn                                          |

### 5.3 · Bảng từ vựng chốt — một khái niệm, một cách gọi

| Khái niệm                                 | **Chốt**           | Đang gọi lẫn                                                                                                                   |
| ----------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| dòng trong sổ khách tiềm năng             | **lead**           | "lead" · "đầu mối" (`leads.tsx:542` tự thừa nhận trùng tên)                                                                    |
| bậc thấp nhất của lead                    | **lead mới**       | "Đầu mối" (`LEAD_TIERS`), "dau-moi", trùng tên bậc phễu                                                                        |
| chiến dịch hoặc sự kiện sinh ra lead      | **nguồn**          | "nguồn" · "chiến dịch" · "sự kiện" · "sổ nguồn" · "hồ sơ nguồn" (4 tên cho 1 vật)                                              |
| một lần gửi trong chuỗi của nguồn         | **đợt**            | "đợt" · "wave" (chỉ trong code — giữ nguyên)                                                                                   |
| số ô của bộ 10 câu đã moi được            | **ô bắt buộc**     | "ô bắt buộc" · "bộ 10 câu" · **"cổng init data"** (`campaign-detail.tsx:438` — tiếng Anh trên màn, luật 14) · "cổng MQL → SQL" |
| người ký duyệt cuối                       | **người gật**      | "người gật" (18) · "người duyệt" · "chuỗi duyệt" · "gửi duyệt"                                                                 |
| khoảng dữ liệu của kịch bản (01/05→17/08) | **kỳ dữ liệu**     | "kỳ" — `leads.tsx:237`, `campaigns.tsx:174`                                                                                    |
| khoảng người dùng chọn để xem             | **kỳ xem**         | "kỳ" — `performance.tsx:293`; **hai nghĩa, một từ, hai màn cạnh nhau**                                                         |
| chưa có nguồn số                          | **chưa đo được**   | "chưa đo được" · "chưa chấm" (`performance.tsx:737`) · "không đặt" (`:880`) · "chưa có lead tốt" (`:1121`)                     |
| không áp dụng cho loại này                | **—**              | lẫn với trên tại `performance.tsx:413` vs `:590`                                                                               |
| thước đo hiệu suất                        | **thước**          | "thước" (11) · "KPI" (16) · "chỉ số" · "Chỉ số tổng quan"                                                                      |
| việc kế tiếp trên một lead                | **việc tiếp theo** | "next action" (docblock) · "hành động" · "việc"                                                                                |
| người chịu trách nhiệm một lead           | **người giữ**      | "người giữ" · "chủ lead" · "owner" · nhãn khối "Đang làm"                                                                      |
| người được giao việc trên lead            | **được giao**      | "giao việc" · "đề nghị giao" · "Đã giao · N người"                                                                             |

Còn treo, cần người quyết: **MQL · SQL · SLA · BD · KPI** là viết tắt tiếng Anh
đang hiện trên màn. Luật 14 chỉ điểm danh HR/DMS/BI/OEE, nhưng tinh thần là nhãn
tiếng Việt. Chúng đã nằm trong fixture (`LEAD_TIERS`) nên đổi là đụng dữ liệu —
**hỏi trước, đừng tự đổi.**

---

## §6 · Trục 6 — luật người phải gác

### 6.1 · Luật 12 · nền đúng 4 lớp

| Chỗ                                          | Nghi vấn                                                                                                                                                                                                 | Kiểm bằng                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `layout/aurora-field.tsx:60`                 | `.aurora-vignette` là lớp thứ **5**. Luật 12 liệt kê đúng 4: quầng → lưới 32 → lưới 160 → hạt nhiễu. `globals.css:344` còn ghi rõ đã bỏ hai lớp hạt "vì chúng là lớp thứ 5 và 6" — nhưng bỏ sót vignette | Đếm `<div>` con của `AuroraField`: 2 blob + 4 lớp phủ                          |
| `sales-config.tsx:523` bọc `:163`            | `glass-a` → `glass-b` → `bg-white/5`: ba mặt kính chồng bên trong 4 lớp nền                                                                                                                              | Mở DevTools, đếm background chồng nhau tại một dòng của mục 5.1                |
| `lead-detail.tsx:700`, `assign-menu.tsx:128` | Hai chỗ thêm `backdrop-blur-xl` lên `glass-b` — `globals.css:240` chốt "glass-b KHÔNG backdrop-filter". Cả hai đều có comment giải thích ngoại lệ, nhưng ngoại lệ đang là **hai** chứ không phải một     | Đọc lại hai comment, quyết một luật chung cho "glass-b nổi trên nội dung trôi" |

### 6.2 · Luật 13 · tương phản ≥ 4,5:1

Tính trên nền hiệu dụng thật (`--background #0B1220` + các lớp trắng chồng lên):

| Chỗ                                                                              | Chữ / nền                                          | Tỉ lệ      | Kết                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `organisms/app-header.tsx:94,273`                                                | `--muted-foreground` @ `opacity-45` trên `glass-a` | **2,29:1** | **Trượt.** 8/9 mục tầng 2 và các mục Core khoá đều nằm ở đây                    |
| `patterns/rich-text.tsx:57`, `ui/segmented-control.tsx:71`, `ui/checkbox.tsx:42` | `--muted-foreground` @ `opacity-55`                | **2,77:1** | **Trượt**                                                                       |
| `patterns/data-table.tsx:169`                                                    | cả dòng "ẩn theo quyền" @ `opacity-55`             | **~2,8:1** | Trượt — nhưng đây có thể là chủ ý; nếu vậy phải nói bằng nhãn, không bằng độ mờ |
| chồng 3 lớp trắng: `glass-a` → `bg-white/5` → `bg-input`                         | `--muted-foreground`                               | **4,19:1** | Trượt. Chỉ `rich-text.tsx:164` đã xử lý; công thức đó phải thành luật           |
| `glass-a` → `bg-white/5`                                                         | `--muted-foreground`                               | 5,03:1     | Đạt                                                                             |
| `glass-a` → `bg-input`                                                           | `--muted-foreground` (placeholder)                 | 4,89:1     | Đạt sát nút                                                                     |
| `glass-b` → `bg-input`                                                           | `--muted-foreground`                               | 5,98:1     | Đạt                                                                             |

**Luật rút ra:** không bao giờ đặt `opacity` lên chữ. Trạng thái tắt đọc bằng nền
(`bg-white/5`) + ổ khoá, đúng như `patterns/nav-item.tsx:10` đã chốt — `AppHeader`
thay chỗ `AppSidebar` nhưng không mang theo luật này.

### 6.3 · Luật 13 · nút tablet ≥ 48px

| Chỗ                                    | Cao thật         | Kết                                                                          |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `ui/button.tsx:26` `size="lg"`         | 48px             | Có định nghĩa, **0 màn dùng**                                                |
| nút nghiệp vụ trên màn (`size="md"`)   | 40px             | Trượt. 28 lượt                                                               |
| nút phụ (`size="sm"`)                  | 32px             | Trượt. 41 lượt                                                               |
| `campaign-parts.tsx:522` nút chọn kênh | `min-h-8` = 32px | Trượt — comment ngay đó nói "iPad dọc 768px bấm bằng ngón tay" rồi chốt 32px |
| `layout/drawer.tsx:149` nút đóng       | `size-8` = 32px  | Trượt                                                                        |
| `leads.tsx:664` nút ghim trong ô bảng  | `size-8` = 32px  | Trượt                                                                        |
| `organisms/bottom-nav.tsx:46`          | 48px             | Đạt                                                                          |
| `organisms/kiosk-tile.tsx:50,74`       | 48px             | Đạt                                                                          |

Hiện **không có điểm gãy tablet nào** trong app (`md:` chỉ dùng 6 lần, toàn cho
ẩn/hiện chữ). Vá: `Button` nhận `size="md"` và tự nâng lên 48px từ `md:` trở lên,
hoặc thêm biến thể `touch` — quyết một cách, đừng để mỗi màn tự nhớ.

### 6.4 · Ngoài hai luật, ba thứ mắt phải bắt

| Chỗ                            | Vấn đề                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell.tsx:51–52`          | `onOpenAssistant` và `onNavigate` **chưa màn nào truyền** → BottomNav 4 mục, `AssistantFab`, nút "Trợ lý" ở header: bấm không ra gì. Trên `< lg` toàn bộ điều hướng dưới màn là chết   |
| `app/chrome.tsx:87–89`         | "Phê duyệt", "Thông báo", "Quản trị & ghi vết" không có `path` nhưng `locked: false` → hiện ra như nút bình thường, bấm không đi đâu. Ba mục này nên `locked: true` cho tới khi có màn |
| `organisms/app-header.tsx:210` | `SearchField` không nhận `value`/`onChange` từ app → gõ được, không tìm được. Ô tìm chiếm chỗ rộng nhất tầng 1 trên **mọi** màn                                                        |

---

## §7 · Trang `/kit` — bốn chỗ nói dối

| Chỗ                                                                    | Sai                                                                                                | Vá                                                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/index.ts:58–68`                                       | `AppShell`, `OrderLifecycleCard`, `BottomNav`, `AssistantFab` xuất khẩu nhưng không có trên `/kit` | Thêm 4 `SpecCard` (T-05 · O-02 · O-07 · A-20)                                                                |
| `kit/theme-kit.tsx:16–21`                                              | Mục lục đếm 9/14/11/5/3; thật là 9/**19**/**12**/**4**/**4**                                       | Suy `count` từ chính số `SpecCard` render ra, đừng gõ tay                                                    |
| `kit/zone-templates.tsx:140`                                           | Ghi "md 480 / lg 640"; `layout/drawer.tsx:130` là 560/760, và footer ngay dưới lại ghi 560         | Sửa `note`                                                                                                   |
| `organisms/order-lifecycle-card.tsx:7` và `organisms/app-header.tsx:9` | Cả hai mang mã **O-06**                                                                            | `AppHeader` giữ O-06 (đã lên kit), `OrderLifecycleCard` lấy O-02 (chỗ trống sau khi O-01 `AppSidebar` bị bỏ) |

---

## §8 · Hợp đồng nhất quán

Dán vào `.github/pull_request_template.md`. Câu nào cũng kiểm được bằng mắt trong
mười giây.

### 8.1 · Mọi màn PHẢI…

1. …mở bằng `<PageHeader>` — không màn nào tự gõ `<h1>`/`<h2>` cho tiêu đề màn.
2. …đặt `<ContextRail>` thành **một hàng riêng ngay dưới** `PageHeader`, kể cả màn form và kể cả chế độ sửa.
3. …dùng nhịp dọc `gap-4 lg:gap-6` ở khung ngoài cùng của nội dung.
4. …đệm thẻ theo đúng ba bậc: cấp một `p-5 lg:p-6` · thẻ lồng `p-4` · ô lồng cấp hai `p-3`.
5. …chỉ dùng ba điểm gãy: base (mobile) · `md:` (tablet) · `lg:` (desktop). Không `sm:`, không `xl:`.
6. …hiện tiền bằng `<Money>`; số trong ô bảng và mọi mã dùng **mono**; `font-num` chỉ cho số hero, KPI, gauge.
7. …hiện ngày bằng `dm()`/`dmy()` của `@/lib/date`. Không màn nào tự cắt chuỗi ISO.
8. …nói "không có số" theo đúng ba mức: **`0`** = đã đo, bằng không · **`—`** = không áp dụng cho loại này · **`chưa đo được`** (màu warning) = chưa có nguồn số. Không có mức thứ tư.
9. …có state rỗng bằng `<EmptyState>`; không màn nào tự dựng icon + câu + nút.
10. …có state chờ bằng `<LoadingBlock>`/`<TableSkeleton>`; khung chờ cao xấp xỉ nội dung thật.
11. …đặt mọi bảng và danh sách dài trên `glass-b` **cấp một** — không `glass-b` lồng trong `glass-a`.
12. …vẽ vạch kẻ bằng `<Separator>` (`bg-white/8`). Không `border-*`.
13. …lấy nền lồng từ đúng bốn mức có tên (8.2). Không gõ `bg-white/7`, `/12`, `/14`, `/28`.
14. …giữ mọi cỡ chữ trong thang 9 bậc (8.3). Cỡ ngoài thang phải có comment nêu lý do.
15. …viết tiếng Việt. Không thuật ngữ Anh trên nhãn ("init data", "Basis", "next action").
16. …cho một khối đúng **một** câu giải thích. Câu thứ hai về docblock.
17. …**không bao giờ** đặt `opacity` lên chữ. Trạng thái tắt = nền `bg-white/5` + ổ khoá.
18. …dùng `<Button size="md">` cho nút nghiệp vụ và để `Button` tự nâng lên 48px ở `md:`.
19. …nối `onNavigate` cho `AppShell` và truyền đúng `activeNav` của mình. **`onOpenAssistant` chỉ nối khi màn 04 · Trợ lý AI đã có route** — sửa 20/08.
    Bản đầu của điều này đòi nối cả hai. Nó viết trước luật mới 6 của `01-ban-giao.md` (_"không nút nào hứa một màn không tồn tại"_): màn 04 chưa dựng, nên nối `onOpenAssistant` là vẽ ra một nút FAB bấm vào không đi đâu. `app/chrome.tsx` **cố tình** để trống prop này và có chú thích tại chỗ; `app-shell.tsx` không vẽ `AssistantFab` khi không có người nhận. Đừng "sửa" chỗ đó cho đủ hai prop.
20. …đi theo bảng từ vựng §5.3. Một khái niệm, một cách gọi.

### 8.2 · Bốn mức nền có tên (thêm vào `packages/tokens/globals.css`)

| Token                     | Giá trị                 | Dùng cho                                                                 |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `--surface-inset`         | `rgba(255,255,255,.05)` | ô lồng trong thẻ                                                         |
| `--surface-control`       | `rgba(255,255,255,.09)` | nút ghost, chip object                                                   |
| `--surface-control-hover` | `rgba(255,255,255,.16)` | hover của trên                                                           |
| `--surface-active`        | `rgba(46,99,230,.24)`   | chip nguồn, control đang chọn (đã có `--accent`, đổi tên cho thống nhất) |

### 8.3 · Thang chữ 9 bậc (thay bảng ở `kit/zone-foundations.tsx:28`)

`42` hero · `26` số thẻ compact · `22` tiêu đề màn · `15` tiêu đề thẻ · `13` thân
đậm · `12,5` thân · `11,5` phụ · `11` nhãn ô nhập · `10,5` kicker và nhãn phụ trong bảng.

### 8.4 · Component phải thêm vào `@pv/ui` **và** trang `/kit`

| Component                        | Zone        | Thay cho                                          | Ưu tiên |
| -------------------------------- | ----------- | ------------------------------------------------- | ------- |
| `PageHeader`                     | `layout/`   | 7 bản chép tiêu đề màn (G-01)                     | 1       |
| `InsetPanel`                     | `ui/`       | 13 bản chép `bg-white/5` (G-03)                   | 1       |
| `LoadingBlock` + `TableSkeleton` | `patterns/` | 6 hình khung chờ (G-05)                           | 1       |
| `StatRow`                        | `patterns/` | 4 công thức cột KPI (G-32)                        | 2       |
| `TabRow`                         | `patterns/` | 12 cặp nút default/ghost (G-08)                   | 2       |
| `FilterBar`                      | `patterns/` | hàng lọc của leads + campaigns (G-11)             | 2       |
| `NotDoingList`                   | `patterns/` | 2 bản "Cố tình không làm" (G-04)                  | 2       |
| `Pager`                          | `patterns/` | `leads.tsx:892` (G-09)                            | 3       |
| `ActionOrDone`                   | `patterns/` | 3 cặp Badge↔Button (G-13)                         | 3       |
| `FactTile`                       | `ui/`       | 3 bản "số to + nhãn" (G-14)                       | 3       |
| `BackLink`                       | `ui/`       | 2 bản "← Sổ X" (G-10)                             | 3       |
| `ClickableSurface`               | `ui/`       | logic dòng bấm được chép ở `leads.tsx:824` (G-12) | 3       |

Sửa hợp đồng của component đã có:

| Component     | Sửa                                       | Vì                                                                        |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `AiAction`    | thêm prop **bắt buộc** `empty: ReactNode` | Luật 9 đòi state "Chưa tạo gì cả"; hiện 5 màn tự dựng và home quên (G-02) |
| `EmptyState`  | `message: string` → `ReactNode`           | Bỏ bản chép `EmptyLead` (G-06)                                            |
| `Money`       | thêm `scale="auto"` (tự chọn tr/tỷ)       | Xoá `money()` riêng của performance (G-19)                                |
| `Separator`   | thêm `orientation: 'h' \| 'v'`            | Sửa chấm 1×1px ở `lead-detail.tsx:319` (G-42)                             |
| `Button`      | `size="md"` tự nâng 48px từ `md:`         | Luật 13 (G-38)                                                            |
| `AuroraField` | gộp/bỏ `.aurora-vignette`                 | Luật 12 (G-36)                                                            |

---

## §9 · Thứ tự dọn đề xuất

### Vòng 1 · sai luật cứng, người dùng gặp thật (1 PR/việc, không gộp)

| #   | Việc                                                              | Gap  | Đụng                                     |
| --- | ----------------------------------------------------------------- | ---- | ---------------------------------------- |
| 1   | Nối `onNavigate` + `onOpenAssistant`; khoá 3 mục Core chưa có màn | G-41 | `app/chrome.tsx`, 9 màn                  |
| 2   | Bỏ `opacity` khỏi chữ ở `AppHeader` (2,29:1)                      | G-37 | `organisms/app-header.tsx`               |
| 3   | Bỏ lớp vignette hoặc gộp vào `.aurora-field`                      | G-36 | `layout/aurora-field.tsx`, `globals.css` |
| 4   | `AiAction` nhận `empty` bắt buộc; home có state "Chưa tạo gì cả"  | G-02 | `patterns/ai-action.tsx`, 6 màn          |
| 5   | ContextRail cho home và cho chế độ sửa của campaign-detail        | G-23 | 2 màn                                    |
| 6   | Xoá `lg:flex-1/min-h-0/overflow-y-auto` chết ở form chiến dịch    | G-31 | `campaign-parts.tsx`                     |
| 7   | Dịch `home.tsx` sang tiếng Việt                                   | G-28 | `pages/home.tsx`                         |

### Vòng 2 · nền móng — làm trước thì vòng 3 rẻ đi một nửa

| #   | Việc                                                                                                | Gap                    |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| 8   | Chốt hợp đồng §8, dán vào PR template                                                               | —                      |
| 9   | Thêm 4 mức nền có tên vào token                                                                     | G-25                   |
| 10  | Thang chữ 9 bậc; sửa `zone-foundations`                                                             | G-34                   |
| 11  | Dựng `PageHeader` · `InsetPanel` · `LoadingBlock`/`TableSkeleton` + đưa lên `/kit`                  | G-01, G-03, G-05       |
| 12  | Nới `EmptyState.message`; thêm `Money scale="auto"`; `Separator.orientation`; `Button` 48px ở `md:` | G-06, G-19, G-42, G-38 |
| 13  | Bốn component thiếu lên `/kit`; sửa mục lục, T-04, mã O-06                                          | G-43, G-44             |

### Vòng 3 · quét nhất quán, một trục một PR

| #   | Việc                                                                                      | Gap                    |
| --- | ----------------------------------------------------------------------------------------- | ---------------------- |
| 14  | Thay 7 tiêu đề màn bằng `PageHeader`, 13 ô lồng bằng `InsetPanel`, 8 khung chờ            | G-01, G-03, G-05, G-15 |
| 15  | Nhịp: `gap-4 lg:gap-6` mọi màn, đệm 3 bậc, bỏ `sm:`/`xl:`                                 | G-16, G-17, G-27       |
| 16  | Số và ngày: mono trong ô bảng, `<Money>` mọi nơi, xoá `vn()`                              | G-18, G-19, G-20       |
| 17  | Ba mức rỗng; quét lại 6 cách nói hiện có                                                  | G-21                   |
| 18  | Bảng từ vựng §5.3 quét toàn bộ nhãn trên màn                                              | §5.3, luật 14          |
| 19  | `Separator` thay 4 giá trị vạch kẻ                                                        | G-24                   |
| 20  | Bỏ `opacity` chữ ở 3 component còn lại; luật hoá "quá 2 lớp trắng → `--glass-foreground`" | G-39, G-40             |

### Vòng 4 · lean — cắt khối, cắt chữ

| #   | Việc                                                                          | Gap              |
| --- | ----------------------------------------------------------------------------- | ---------------- |
| 21  | `sales-config` 11 khối → 5, bỏ `glass-b` lồng, ~3.600 → ~1.400 px             | G-26, G-30       |
| 22  | `lead-detail` 7 thẻ → 5; `leads` 9 khối → 6; `performance` bỏ phễu vẽ hai lần | G-33, §4.2       |
| 23  | 53 đoạn giải thích → ~20; nâng thân đoạn lên 12,5px                           | G-35             |
| 24  | Ba component còn lại: `TabRow`, `FilterBar`, `StatRow`                        | G-08, G-11, G-32 |

### Vòng 5 · món nợ phải HỎI trước

| #   | Câu hỏi phải có người quyết                                                                | Gap  |
| --- | ------------------------------------------------------------------------------------------ | ---- |
| 25  | Miễn trừ `apps/web/src/kit/**` khỏi `spacing-scale`? (xoá 63/108 nợ bằng một dòng config)  | G-29 |
| 26  | Padding **ngang** của control có thuộc thang 8 bậc không? (`button.tsx:10` nói không)      | G-29 |
| 27  | `MQL · SQL · SLA · BD · KPI` có phải đổi sang tiếng Việt không? (đụng fixture)             | §5.3 |
| 28  | Dòng "ẩn theo quyền" của `DataTable` được phép mờ dưới 4,5:1 không?                        | G-39 |
| 29  | Sau khi có hai câu trả lời trên: dọn 39 lượt spacing trong `@pv/ui`, rồi `pnpm lint:prune` | G-29 |
