# Tìm kiếm toàn cục ở header — kế hoạch dựng

Ghi 08/10/2026. **Chưa duyệt, chưa dựng.** Những chỗ đánh dấu _(cần xác minh)_
là giả định chưa kiểm bằng code; lượt 0 kiểm trước khi viết dòng nào.

## 1 · Hiện trạng

`packages/ui/src/organisms/header-search.tsx` chỉ lọc **tên màn hình** bằng một
chuỗi không dấu. Không có tìm bản ghi, không có endpoint search ở `apps/api`,
không có `pg_trgm` hay `unaccent` trong migration nào. Ô tìm của từng sổ dùng
`ILIKE` qua `platform/db/like.ts`.

## 2 · Hành vi cần đạt

- **Tìm chung (mặc định):** gõ chữ là tìm trên lead, công ty, liên hệ, cơ hội,
  chiến dịch, hợp đồng — khớp ở tiêu đề hoặc ở contact gắn với bản ghi.
- **Tìm cụ thể:** chọn chip loại, hoặc gõ tiền tố (`lead:`, `cơ hội:`,
  `chiến dịch:`, `hợp đồng:`, `công ty:`, `liên hệ:`), thì chỉ tìm loại đó.
- **Fuzzy:** không dấu, gõ thiếu, gõ sai một hai ký tự vẫn ra.
- **Gần đây:** mở ô khi chưa gõ thì thấy các lượt tìm và bản ghi vừa mở.
- Tên màn hình ("ĐI TỚI") giữ nguyên, đứng nhóm đầu.

## 3 · Chọn công cụ

**Postgres `pg_trgm` ngay trên Neon, không thêm dịch vụ.**

| Phương án                         | Vì sao không / có                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Meilisearch · Typesense · Algolia | Thêm một hệ phải đồng bộ, phải lọc quyền lần hai ngoài E2, phải trả tiền. Dữ liệu CRM cỡ nghìn–chục nghìn dòng không cần |
| Postgres full-text (`tsvector`)   | Khớp theo từ, không chịu lỗi gõ, không có từ điển tiếng Việt                                                             |
| Fuse.js ở trình duyệt             | Phải tải cả sổ xuống máy khách — vỡ trục phạm vi `ownOnly`                                                               |
| **`pg_trgm` + hàm `fold` SQL**    | Fuzzy thật, lọc quyền và `leadLive` trong cùng câu SQL, luôn tươi, không hạ tầng mới                                     |

Hai quyết định đi kèm:

- **Bỏ dấu bằng `translate()`, không dùng `unaccent`.** `unaccent` không
  `IMMUTABLE` nên không đặt được vào index biểu thức. Một hàm SQL
  `sales.fold(text)` = `lower(translate(...))` thì đặt được, và khớp từng ký tự
  với `fold()` đang có trong `header-search.tsx`.
- **`UNION ALL` thẳng trên bảng gốc, không dựng bảng chỉ mục riêng.** Bảng
  `search_doc` buộc mọi đường ghi (tạo, sửa, nhập file, quét ảnh, vô hiệu hoá)
  phải nhớ đồng bộ — quên một đường là kết quả sai lặng lẽ. Index GIN trigram
  trên `sales.fold(cột)` cho cùng tốc độ ở cỡ dữ liệu này.

## 4 · Kiến trúc

### 4.1 Cơ sở dữ liệu (migration 0088)

- `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- Hàm `sales.fold(text)` `IMMUTABLE`.
- Index `GIN (sales.fold(col) gin_trgm_ops)` trên:
  - `lead`: `company`, `contact_name`, `email`, `phone`, `code`
  - `account`: `name`, `legal_name`, `tax_code`
  - `contact`: `name`, `email`, `phone`
  - `opportunity`: `name`, `code`
  - `campaign`: `name`
  - `contract`: `code`
- Bảng `platform.search_recent` (mục 4.5).

**Bẫy PGlite:** PGlite có sẵn `pg_trgm` trong `dist/contrib` nhưng phải nạp lúc
dựng client. `create-db.ts` chưa nạp, và driver `pglite` của `drizzle-kit` tự
dựng client nên **không nạp được** _(cần xác minh)_. Hướng xử lý: khối
extension + index trong migration bọc `DO $$ … $$` chỉ chạy khi
`pg_available_extensions` có `pg_trgm`; `create-db.ts` nạp extension cho
PGlite; module search chạy `CREATE EXTENSION IF NOT EXISTS` lúc khởi động khi
`kind === 'pglite'`. Kết quả: một đường SQL duy nhất trên cả hai máy.

### 4.2 Contract (`packages/contracts/src/sales/search.ts`)

```
SearchKind   = 'lead' | 'account' | 'contact' | 'opportunity' | 'campaign' | 'contract'
SearchQuery  = { q: string(2..120), kinds?: SearchKind[], limit?: 1..20 (mặc định 5) }
SearchHit    = { kind, code, title, subtitle?, matched: { field, text }, score }
SearchResult = { groups: { kind, hits: SearchHit[], more: boolean }[] }
```

`matched` nói vì sao dòng này ra ("Liên hệ: Nguyễn Văn A"). Hit loại `contact`
mang `code` của lead cha để bấm là mở đúng hồ sơ.

### 4.3 API (`apps/api/src/branches/sales/search/`)

`GET /sales/search` — bốn file theo đúng khuôn của nhánh.

- **Repository:** một câu `UNION ALL`, mỗi nhánh một loại. Điều kiện khớp:
  `fold(col) LIKE '%q%' OR fold(col) %> q`; xếp hạng theo khớp mã chính xác →
  khớp đầu chuỗi → `word_similarity`. Mỗi loại lấy `limit + 1` dòng để biết
  `more`. Tái dùng `contains()` cho phần `LIKE`.
- **Khớp qua contact:** lead khớp cả cột contact nội tuyến lẫn bảng
  `sales.contact`; cơ hội khớp qua `opportunity_contact`.
- **Nhận dạng ý định:** chuỗi toàn số → ưu tiên `phone`/`tax_code`; có `@` →
  `email`; đúng dạng mã → khớp mã chính xác lên đầu.
- **Quyền — phần rủi ro nhất:**
  - Mỗi loại có quyền riêng (`lead.view`, `account.view`, `opportunity.view`,
    `campaign.view`, `contract.view`). `@Need` chỉ khai được một quyền, nên
    service hỏi E2 từng loại và **bỏ hẳn nhánh `UNION`** của loại không được
    xem _(cần xác minh cách service gọi E2)_.
  - Trục 3: nhánh nào `scoped` thì thêm `leadScope` hoặc `owner_id` tương ứng.
  - `leadLive` trên mọi nhánh đọc hoặc join `sales.lead` (lead, liên hệ, cơ
    hội, hợp đồng).
  - Dòng bị trục 3 cắt là **vắng mặt**, không đếm vào `more`.

### 4.4 Cache

- **Máy khách (chính):** react-query, khoá `['search', q, kinds]`,
  `staleTime: 60_000` (ghi đè mặc định `Infinity` của app), `gcTime: 5 phút`,
  `placeholderData: keepPreviousData` để danh sách không nháy khi gõ tiếp.
  Debounce 200 ms, tối thiểu 2 ký tự, huỷ request cũ bằng `signal`.
- **Máy chủ: không cache ở vòng đầu.** Khoá cache phải mang cả actor lẫn quyền,
  và một lead vừa vô hiệu hoá sẽ còn hiện tới hết TTL. Với index trigram câu
  truy vấn đã nhanh. Nếu đo p95 > 150 ms thì dùng lại `platform/geo/ttl-cache.ts`
  với TTL 30 s, khoá theo `actorId`.
- Header trả về `Cache-Control: private, no-store`.

### 4.5 Lượt tìm gần đây

Lưu ở máy chủ (`platform.search_recent`), không ở `localStorage`: đi theo người
qua hai máy, và là nhật ký để biết người dùng tìm gì mà không ra.

```
id · actor_id · q · kinds text[] · picked_kind · picked_code · result_count · at
```

- **Ghi khi nào:** khi bấm chọn một kết quả, hoặc Enter. Không ghi theo từng
  phím. Lượt tìm 0 kết quả ghi khi ô đóng, để soát sau.
- **Giữ bao nhiêu:** 20 dòng mới nhất mỗi người; trùng `(actor, kind, code)`
  thì cập nhật `at`.
- **Đọc:** `GET /sales/search/recent` chỉ trả `kind + code`, rồi **dựng lại
  nhãn qua chính repository search** — lead đã vô hiệu hoá hoặc mất quyền thì
  tự rơi khỏi danh sách.
- `POST /sales/search/recent` ghi, `DELETE` xoá hết của mình.

### 4.6 Giao diện

- `HeaderSearch` vẫn ở `@pv/ui` và không biết app: thêm props `kinds`,
  `groups`, `recents`, `loading`, `onQueryChange`, `onPick`. Dữ liệu do
  `apps/web/src/app/chrome.tsx` nạp qua `data/search.ts`.
- Bố cục bảng thả: hàng chip loại → GẦN ĐÂY (khi ô rỗng) → ĐI TỚI → từng nhóm
  loại, mỗi nhóm tối đa 5 dòng + "Xem tất cả" mở sổ tương ứng với `q` đã điền.
- Mỗi dòng: icon loại · tiêu đề (tô đậm đoạn khớp) · dòng phụ nói lý do khớp.
- Bàn phím giữ ⌘K, ↑↓, ↵, esc; thêm Tab để đổi chip.
- Nhãn chính xác, trung tính; mỗi thông tin một chỗ.
- **Người gác:** luật 13 (tương phản trên `glass-overlay`, đoạn tô đậm) và nút
  tablet ≥ 48px — dòng hiện tại `h-11` là 44px, phải nâng.
- Thêm dòng vào kit `apps/web/src/kit/zone-*.tsx`.

## 5 · Các lượt

| Lượt | Việc                                                                                               | Agent                                |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 0    | Xác minh: PGlite nạp `pg_trgm`; cách service hỏi E2 nhiều quyền; `pnpm ctx` xem sổ nào còn fixture | `dataflow-tracer`                    |
| 1    | Contract `search.ts`                                                                               | `contract-drafter`                   |
| 2    | Migration 0088 + chứng minh index được dùng (`EXPLAIN`)                                            | `migration-writer`                   |
| 3    | Module `sales/search` + `search_recent`                                                            | `api-builder`                        |
| 4    | `HeaderSearch` mở rộng + kit + `data/search.ts` + nối `chrome.tsx`                                 | `screen-builder`                     |
| 5    | Soát                                                                                               | `rules-reviewer` + `aurora-reviewer` |
| 6    | Kịch bản nghiệm thu trên PGlite                                                                    | `acceptance-runner`                  |
| 7    | ADR 0080 + cập nhật docs                                                                           | `doc-keeper`                         |

Lượt 1 → 2 → 3 nối tiếp; lượt 4 chạy song song với 2–3 ngay khi contract xong.

## 6 · Nghiệm thu

- `nguyen van a`, `Nguyễn Văn A`, `nguyn van a` cùng ra một liên hệ.
- Gõ tên công ty ra lead, công ty, cơ hội và hợp đồng của công ty đó.
- Chip "Lead" bật thì chỉ còn nhóm lead.
- Người `ownOnly` không thấy lead của người khác, kể cả qua khớp contact.
- Lead đã vô hiệu hoá không ra ở nhóm nào, kể cả cơ hội và hợp đồng treo dưới.
- Người không có `campaign.view` không thấy nhóm chiến dịch.
- `100%` và `LD_0042` được đọc là chữ, không phải ký tự đại diện.
- Gõ lại cùng chuỗi trong 60 s không phát request mới.
- Mở ô rỗng thấy lượt gần đây; đăng nhập máy khác vẫn thấy.

## 7 · Đưa lên production

1. Migration 0088 lên Neon — chủ dự án chạy bằng `! …` (lệnh ghi production).
2. `/ship` API.
3. Push `master` (web tự build).

Sai thứ tự thì web gọi endpoint chưa có.

## 8 · Còn mở

- **Test:** luật repo là không tự sinh test. Đề nghị một ngoại lệ có xin phép:
  test khoá `sales.fold` (SQL) khớp `fold` (TS), vì lệch nhau là tìm sai lặng lẽ.
- **Điều kiện theo trường** (`email:`, `sđt:`, `mst:`, `phụ trách:`) để vòng 2.
- **Tìm trong nội dung** (ghi chú, comm, biên bản họp) để vòng 2 — cần
  `tsvector`, là bài khác.
- Nhật ký tìm giữ bao lâu, và ai được xem thống kê "tìm không ra".
