# Bàn giao — module Lead, scope 1 đã chạy thật

Lát cắt **27/08/2026**, nhánh `develop`, `pnpm check` **xanh**. Tiếp nối
[`ban-giao-db.md`](./ban-giao-db.md) (lược đồ) và [`ban-giao-api.md`](./ban-giao-api.md)
(khung `apps/api`). Hợp đồng gọi API để ghép FE nằm ở
[`tich-hop-be.md`](./tich-hop-be.md) + [`pv-one.postman_collection.json`](./pv-one.postman_collection.json).

---

## Đã dựng — 11 đường dữ liệu, tất cả chạy thật trên Neon

| Đường                                           | Quyền                    | Trạng thái                             |
| ----------------------------------------------- | ------------------------ | -------------------------------------- |
| `GET /healthz`                                  | công khai                | ✅                                     |
| `GET /sales/leads`                              | `lead.xem` · cắt phạm vi | ✅ lọc + sắp + phân trang **ở server** |
| `GET /sales/leads/:code`                        | `lead.xem` · cắt phạm vi | ✅ hồ sơ · ngoài phạm vi là **403**    |
| `POST /sales/leads`                             | `lead.sửa`               | ✅ 201 · nhập tay                      |
| `POST /sales/leads/import/preview`              | `lead.sửa`               | ✅ 200 · **không ghi gì**              |
| `POST /sales/leads/import`                      | `lead.sửa`               | ✅ 201 · một transaction               |
| `GET /sales/config` · `GET /sales/config/:list` | `cấu-hình.xem`           | ✅ 6 danh mục                          |
| `POST · PATCH /sales/config/…` (3 đường)        | `cấu-hình.đề-nghị`       | ⚠️ **500 — cửa E3 chưa nối**           |

`RouteAudit` lúc khởi động: _11 đường dữ liệu, đều đã khai quyền._

### Kiểm bằng số thật, không suy luận

| Kiểm                                     | Kết quả                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `status=running · signed · exited · all` | **42 · 6 · 52 · 100** — khớp `BOOK_SPLIT` đóng băng            |
| Trục phạm vi (Sale `u-huy`, `ownOnly`)   | `total 10 · hidden 90`                                         |
| Phân trang 4 trang × 30                  | 100 mã, **0 dòng trùng** — tiebreaker `code` làm việc          |
| `sort=daysHere&dir=desc`                 | 77 · 74 · 73 — khớp `days_here 2…77`                           |
| Email trùng khác hoa thường              | **409**, và mã đã cấp bị rollback sạch                         |
| Lead thiếu dòng gương                    | **409/400** — khoá ngoại chặn                                  |
| `contact_channel = ''`                   | **400** — CHECK chặn                                           |
| Preview 5 dòng, 4 loại lỗi               | đúng 4 loại · **DB không đổi một dòng, sequence không đốt mã** |
| Commit 2 dòng                            | lead +2 · object +2 · audit +1 · `codes` theo thứ tự tệp       |

---

## Lược đồ cuối — `sales.lead` 38 cột

Migration `0001` (config) và `0002` (nền ghi lead) **đã áp lên Neon**.

`0002` mang sáu thứ:

1. **`sales.lead_code_seq`** (START 201, tránh vùng `LD-0101…0200` của fixture) +
   `LeadRepository.nextCode()` sinh `LD-%04d`. **Không** đặt DEFAULT trên cột —
   dòng gương `platform.object` phải ghi TRƯỚC, nên người gọi phải biết mã trước
   khi INSERT; giữ DEFAULT thì phải làm khoá ngoại `DEFERRABLE`, tức làm yếu một
   ràng buộc để đổi lấy một tiện lợi.
2. **`intake_channel` → `source_kind`** — migration `0004`, giá trị
   `MANUAL · IMPORT · APOLLO · LANDING_PAGE` (`UPPER_SNAKE`). Đi cặp với
   **`source` → `campaign_id`**: xuất xứ của một lead là HAI nửa — một nửa
   enum (thêm giá trị là migration), một nửa là dòng danh mục người dùng tự
   thêm. Trên dây chúng đi chung một object `source`, kèm cả `campaignName`
   để không màn nào phải in mã `SR-…` ra cho người đọc.
3. **Cột `motion`** — 6 thế, `UPPER_SNAKE`.
4. **`lead_email_live_idx` → `lower(email)`**.
5. **`lead.code` → khoá ngoại vào `platform.object(code)`.**
6. **`contact_channel` vào `lead_no_blank`** (16 cột).

### Khoá ngoại `code → platform.object` là bất biến số một

Không có nó, một endpoint ghi lead mà quên dòng gương tạo ra lead **hợp lệ, tra
được, có trong sổ — và vô hình với `E1.story()`**. ContextRail trống, luật 10 gãy,
không có gì đỏ ở đâu cả. Giờ Postgres từ chối.

Giá phải trả là một **nghĩa vụ thứ tự vĩnh viễn**, áp cho mọi người ghi kể cả
`seed.ts`: ghi `platform.object` TRƯỚC, `sales.lead` SAU, trong **một transaction**.
`ObjectMirror` (`platform/graph/object-mirror.ts`) là chỗ duy nhất làm việc đó, và
nó **cố tình không tự mở transaction** — người gọi cầm.

---

## Dữ liệu đang có trên Neon

```
sales.lead          119   (100 fixture + 19 Apollo)
platform.object     123   0 lead nào thiếu dòng gương
platform.audit        4
sales.config_entry   34   6 danh mục · SR-09 "Apollo — danh sách mua" là dòng mới
sales.lead_code_seq 224   (có vài mã bị đốt — nextval cố tình không theo transaction)
```

Bốn con số của fixture vẫn khớp sau seed: `signed 6 · running 42 · exited 52`,
`required_filled {0:10,1:21,2:15,3:12,4:4,5:4,6:34}`, `days_here 2…77`, 100 email
khác nhau.

---

## Lô Apollo — 19 lead thật, `LD-0201`…`LD-0219`

Tệp `LEAD APOLLO.xlsx`: **71 cột, 19 dòng**, khách Hàn Quốc. Nạp qua đúng endpoint
thật (`preview` rồi `import`), nguồn `SR-09`, `motion=OUTBOUND`, `intake=IMPORT`.

**Kết quả đáng chú ý: cả 19 dừng ở `required_filled = 4/6`** — thiếu đúng ô 2
(sản phẩm chính) và ô 6 (nỗi đau). Không dòng nào tự qua cổng init data, và đó là
kết quả _đúng_: hai ô đó chỉ ra từ một cuộc nói chuyện, không có trong danh sách
mua nào.

### 10 trường lấy được

| Apollo                   | → cột                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| First Name + Last Name   | `contact_name` (phải nối)                                                       |
| Title                    | `contact_title`                                                                 |
| Company Name             | `company`                                                                       |
| Email                    | `email` (hạ hoa)                                                                |
| Corporate Phone          | `phone` (7/19)                                                                  |
| Person Linkedin Url → có | `contact_channel = linkedin`                                                    |
| Company Address          | `address`                                                                       |
| Company State ?? City    | `province`                                                                      |
| # Employees              | `headcount`                                                                     |
| _(chọn lúc nạp)_         | `campaign_id=SR-09` · `source_kind=IMPORT` · `motion=OUTBOUND` · `tier=dau-moi` |

### 6 nhóm cột KHÔNG hiểu được — mỗi nhóm là một quyết định còn treo

1. **Ba mã Apollo** (`Contact Id · Account Id · Record Id`, 19/19) — **thiếu sót
   nặng nhất**. Không có cột mã ngoài ⇒ khử trùng chỉ dựa vào email ⇒ Apollo đổi
   email một người là **đẻ ra lead thứ hai cho cùng người đó**. Cách sửa:
   `external_source` + `external_id` + `UNIQUE(external_source, external_id)`.
   **Đã soạn rồi HOÀN TÁC** theo yêu cầu chủ dự án ("lấy schema đang có làm chuẩn").
2. **Cụm xác minh email** (9 cột) — 19/19 là `Verified`, ta vứt hết. Sai độ hạt:
   `CHANNEL_TRUST` gán mức tin theo **cửa vào**, Apollo gán theo **từng dòng**.
3. **`Do Not Call`** — không có cột, không có bảng `suppression`. Hôm nay cả 19 đều
   `False` nên chưa mất gì; ngày một tệp có dòng `True` thì ta gọi đúng người đã
   từ chối. Đây là chuyện pháp lý.
4. **Năm cột tương tác** (`Email Sent/Open/Bounced/Replied/Demoed`) — chính là dữ
   liệu `touch`, bảng chưa dựng.
5. **Sáu cột tài chính công ty** — ⚠️ **đừng ánh xạ `Annual Revenue` vào `budget`**:
   doanh thu công ty không phải ngân sách khách định chi cho mình.
6. **Bảy cột phân loại** (`Industry · SIC · NAICS · Seniority`…) — `Industry` có 4
   giá trị, danh mục ngành của ta là chip·cơ khí·ô tô·dược. `category` để **NULL**.

Thêm ba chỗ: `Stage = "Cold"` là phễu của **Apollo**, không phải 5 cột sổ của ta —
**không map**. `Contact Owner = vannt@pebblevina.com` là địa chỉ Pebble Vina thật
nhưng actor trong hệ dùng đuôi `@pebblevina.com` ⇒ cả 19 lead **chưa ai nhận**.
Không có cột quốc gia ⇒ "Seoul" nằm trong cột tên là `province`.

### Luật rút ra: CHỌN NGUỒN TRƯỚC

Đoán cột theo bí danh (`guessMapping`) là công cụ sai cho một tệp 71 cột. Quy trình
đúng: **chọn nguồn → nạp hồ sơ ánh xạ của nguồn đó → mới đọc tệp**. Hồ sơ ánh xạ là
**dữ liệu cấu hình**, không phải code — thêm ZoomInfo/Lusha sau là nhập một hồ sơ,
không phải một lần deploy. Việc này nằm ở **bước khớp cột phía FE**, không đụng API.

---

## Bốn lỗi thật đã bắt trong phiên này

Ghi lại vì mỗi cái là một loại lỗi sẽ quay lại:

1. **`motion` không được ghi xuống cột.** Response _echo lại_ `motion` client gửi
   lên nên nhìn từ ngoài tưởng đã lưu; chỉ `SELECT` thẳng vào bảng mới lộ. **Bài
   học: một response echo lại thứ client gửi thì không chứng minh được gì về cột.**
2. **`signed()` trong `lead.repository.ts` trả `NOT EXISTS`** — tên nói ngược nội
   dung. Mọi lời gọi vẫn đúng vì mỗi chỗ tự phủ định lại một lần. Hành vi đúng, cái
   tên là cái bẫy cho người thêm lời gọi thứ năm. Đã đảo về `EXISTS`.
3. **`GraphModule` thiếu `imports: [EnginesModule]`** — lỗi **ngủ đông**: chưa module
   nào import nó nên Nest chưa bao giờ phải dựng `GraphService`. `imports: [GraphModule]`
   đầu tiên làm máy chủ chết lúc boot.
4. **`codes` trả về lộn xộn** — `Promise.all` giữ thứ tự kết quả nhưng không giữ thứ
   tự số sequence. Đã sắp tăng dần trước khi phát.

---

## Nợ có tên

1. **Năm enum chưa thành ID cấu hình.** `stage · tier · category · exitReason ·
contactChannel` trên `LeadRow` vẫn là khoá chữ thường cũ (`moi`, `dau-moi`,
   `chip`); chỉ `source` đã là mã (`SR-09`). Đợt đổi sang khoá ngoại `config_entry`
   là 1 migration + `lead.schema.ts` + `lead.mapper.ts` + seed. **Đừng hàn cứng bảng
   nhãn cho năm cái đó ở FE.**
2. **Cửa E3 trả 500.** `SalesConfigGate` là MỘT điểm nối. Cần: bảng `sales.approval`
   · `APPROVALS` thành provider · đổi một dòng `useClass`.
3. **`errors.ts:73` so nhầm khoá.** `apps/web` so `reason === 'thiếu-nhánh'`, máy chủ
   trả `branch-not-licensed`. **Nổ đúng hôm cắt dây.**
4. **`LEAD_SPEC` 16 cột không với tới 7 cột hồ sơ** (`main_product` · `current_stack`
   · `plants` · `decision_maker` · `approver` · `budget` · `deadline`). Hệ quả:
   `optionalFilled` luôn 0 và `requiredFilled` tối đa 5 cho dòng nạp tệp.
5. **Khoá chống trùng hai đầu khác nhau.** FE `mst:` rồi `ten:company|province`;
   máy chủ `email:lower(email)`. Một tệp FE bảo sạch vẫn có thể trùng ở máy chủ.
6. **`batchId` chưa xoá lô được** — `sales.lead` không có cột `batch_id`; danh sách
   `codes` đang nằm trong JSON của `platform.audit.note`. Chắp vá.
7. **`nextCode()` là một round-trip mỗi dòng.** Tệp 5.000 dòng tiêu 5.000 lượt. Sửa
   bằng `nextval(seq, n)` cấp cả khối.
8. **`tier` bất đối xứng**: dòng nạp tệp ghi `dau-moi`, cửa tạo tay để NULL.
9. **`intake_trust` theo dòng chưa có** — mức tin vẫn chỉ suy từ cửa vào.
10. **Đợt quét ngôn ngữ** — 179 file còn comment tiếng Việt. Luật đã chốt: code +
    comment tiếng Anh, doc + bàn luận tiếng Việt, **chuỗi hiển thị cho người dùng
    giữ tiếng Việt**. Làm thành một đợt riêng, chia theo package, diff phải **chỉ có
    comment**.

---

## Kế hoạch ghép FE — 5 đợt

### Đợt 1 · Tầng dây (chặn mọi màn) — Sonnet · medium

`VITE_API_URL` (FE **chưa có** biến base URL nào) · `fetch` vào `dispatch` tại điểm
cắt đã đánh dấu (`app/api/client.ts`) · `api.write` cạnh `api.read` **dùng chung
chuỗi interceptor** · đọc `Problem` thật trong `toApiError` · **vá nợ #3**.

`api.write` không thay TanStack Query — nó là hàm mà `mutationFn` gọi. Chỗ quan
trọng là tham số `need`: TanStack lo cache/dedupe/refetch, **nó không biết gì về
quyền**. Gọi thẳng `fetch` là bỏ qua `requireAccess`.

### Đợt 2 · Cache từ vựng — Sonnet · medium

`configQuery` gọi `GET /sales/config` **một lần** lúc khởi động, cache dài (chỉ đổi
khi TP gật một đề nghị). Mọi màn tra nhãn từ đây thay `LEAD_CATEGORIES`/`PIPELINE_STAGES`
của fixture. Nhớ nợ #1.

### Đợt 3 · Sổ lead cắt sang server — Opus · high

`data/leads.ts` bỏ `fetchLeadBook` fixture · `leads.tsx` bỏ `book.filter()` và cắt
`PAGE_SIZE` ở client · dựng **`app/url.ts`** (file này **chưa tồn tại** dù docblock
hợp đồng đã hứa tên nó). Cột đổi theo: `contactTitle` từ API thay `leadContact()`,
`ownerName`/`ownerEmail`, `signed` thay `contractCode`.

**Hai thứ là đổi bố cục → phải qua `sketch-first`:**

- Badge "Đã ký · **HĐ-2711**" mất mã (`signed` là boolean, và lead→hợp đồng nay 1-n).
- Dải "lead nạp trong phiên này" (`mergeLeadBook` + `useIntakeDesk`) phải **bỏ** —
  import đã ghi thật lên server, giữ lại là hiện đôi.

### Đợt 4 · Hai cửa ghi — Opus · high

Panel nạp tệp: bước 2 gọi `preview` thật, bước 3 gọi `import` · form nhập tay gọi
`POST /sales/leads` · **hồ sơ ánh xạ theo nguồn** (Apollo 71 cột là hồ sơ đầu tiên).

### Đợt 5 · Soát — `aurora-reviewer` · Opus · high

Luật 12 (nền 4 lớp) và 13 (tương phản ≥ 4.5:1, nút tablet ≥ 48px) — phần CI không gác.

### Một chỗ chưa có đường

`ScoreCards` đầu sổ đọc `FUNNEL` từ fixture — **điểm cả kỳ, cố tình không đổi theo
bộ lọc**. Không endpoint nào trả nó. Đề xuất giữ fixture tới khi làm module
Performance; nhét thống kê vào endpoint sổ là làm hỏng nghĩa của nó.

Và **24 thao tác ghi trong `desk.ts`** (ghim · ghi chú · việc · giao việc · chuyển
đổi) vẫn ở `zustand persist`, chưa có endpoint. Phải khoanh vùng rõ trên màn cái nào
đã lên server cái nào chưa — nếu không người dùng tưởng mọi thứ đã lưu.

---

## Chạy lại

```bash
pnpm install
cd apps/api && PORT=4123 pnpm dev
curl -H 'X-PV-Actor-Id: u-ha' 'http://127.0.0.1:4123/sales/leads?status=all&size=3'
```

Nhập `docs/pv-one.postman_collection.json` vào Postman là gọi được cả 14 request.
Xác thực hôm nay là **cửa sau POC** (`X-PV-Actor-Id`), `env.ts` chặn ở production.

⚠️ `apps/api/.env` đang trỏ **thẳng Neon**, nên `pnpm db:seed` **xoá sạch Neon rồi
nạp lại** — sẽ mất 19 dòng Apollo. Muốn chạy offline thì bỏ `#` ở dòng `pglite://`.
