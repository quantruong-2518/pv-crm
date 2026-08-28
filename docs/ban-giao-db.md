# Bàn giao — lược đồ dữ liệu và tiến trình BE

Lát cắt **26/08/2026**, nhánh `develop`. Tiếp nối [`ban-giao-api.md`](./ban-giao-api.md):
file đó ghi khung `apps/api` đã dựng tới đâu, file này ghi **dữ liệu** — luồng
nghiệp vụ đã chốt, bảng đã có, bảng chưa có, và bốn chỗ chặn đường endpoint kế
tiếp.

> **Cập nhật 27/08:** bốn chặn ở cuối tài liệu đã được trả bằng
> `POST /sales/leads/intake`, migration `0003_futuristic_cerebro.sql`, limiter
> Postgres theo IP + landing page, honeypot và origin allowlist. Cách tích hợp:
> [`tich-hop-landing-page.md`](./tich-hop-landing-page.md).
>
> **Cập nhật 27/08 (2):** cụm B đã dựng phần giao dịch — `platform.email_delivery`
> (sổ gửi dùng chung, có sẵn `campaign_run_id` cho MAS), `email_suppression`,
> `email_webhook_event`, cộng hàng đợi pg-boss và cửa webhook Resend. Vì sao nó
> có hình dạng đó: [`ban-giao-mail.md`](./ban-giao-mail.md) · cách vận hành:
> [`van-hanh-mail.md`](./van-hanh-mail.md). `campaign*` và `touch` vẫn chưa dựng.
>
> **Cập nhật 28/08:** mục "Chưa dựng — 12 bảng" bên dưới liệt `mail_delivery`
> là một bảng riêng cho cụm B — đã LỖI THỜI, xem cập nhật ngay trên: cụm B dùng
> lại `email_delivery` + `campaign_run_id`, không tách bảng thứ hai. `suppression`
> ở mục A cũng lỗi thời cùng lý do — đã dựng, đọc cập nhật 27/08 (2). Còn thiếu
> gì để Quick MAS (Sổ lead) gửi được mail thật — không chỉ 12 bảng, còn endpoint,
> composer, quyền: [`ban-giao-quick-mas.md`](./ban-giao-quick-mas.md).

---

## Luồng chính — đã chốt lại, KHÁC bản đầu

Bản đầu hiểu sai chiều: tưởng chiến dịch **sinh ra** lead. Không phải. Chiến
dịch **tiêu thụ** lead có sẵn:

```
landing page ─┐
BD nhập tay  ─┼─> SỔ LEAD ──chọn──> CHIẾN DỊCH ──run #1 #2 #3 (schedule)──> mail ──┐
file import  ─┘       ▲                                                            │
                      └──────── TOUCH (open · click · reply · call) ◄──────────────┘
                                       │ đủ khả quan → promote
                                       ▼
                                    CƠ HỘI ──chốt──> HỢP ĐỒNG
```

Hệ quả kiến trúc của chiều này: `campaign` KHÔNG phải cha của `lead`; quan hệ
giữa chúng là **n:m** qua `campaign_member`, và một lead bị bắn nhiều đợt là
chuyện bình thường, không phải trùng lặp.

---

## Bảy quyết định đã chốt

| #   | Quyết định                                                  | Lý do quyết định                                                                                                                   |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Email nằm thẳng trên `lead`**, không tách `contact`       | Một lead = một người = một email. Đơn giản hơn hẳn; đổi lại ngày một công ty cần nhiều người nhận mail sẽ là một migration         |
| 2   | **`campaign_member` chốt cứng** lúc thêm                    | Bắn lại lần 2, 3 vẫn đúng danh sách đã chọn, và truy được ai từng nhận gì. Segment động thì hai lần bắn ra hai danh sách khác nhau |
| 3   | **Lead → cơ hội là 1-n**                                    | Một công ty mua nhiều lần. Cột `lead.deal_code` cũ ngầm định 1-1, tức khách mua lần hai phải tạo lead trùng công ty trùng email    |
| 4   | **Ba cột `NOT NULL`**: `company` · `contact_name` · `email` | Luồng chính là MAS mail; lead không email là lead không tham gia được luồng đó. Ép ở cột, không ở form — mỗi cửa vào một form      |
| 5   | **20 trường hồ sơ là cột thật**, không `jsonb`              | `budget`, `deadline`, `headcount`, `tax_code` đều sẽ bị lọc và bị báo cáo. JSONB làm index và ràng buộc kiểu biến mất đúng chỗ cần |
| 6   | **Giữ nguyên ma trận quyền E2**, không thêm quyền mới       | Ưu tiên dễ dùng và khớp hệ đang chạy. Hệ quả đã biết ghi ở mục "Nợ" bên dưới                                                       |
| 7   | **Neon là DB chính, kể cả lúc dev**                         | `apps/api/.env` trỏ thẳng Neon. `pglite://` vẫn còn ở dòng ngay trên, comment lại                                                  |

---

## Đã dựng — 7 bảng

```
platform   actor · object · edge · audit          (có từ trước)
sales      lead · opportunity · contract          (lead dựng LẠI 26/08, hai cái sau mới)
```

### `sales.lead` — 38 cột, sáu nhóm

> **Cập nhật 27/08** — migration `0002` thêm cột `motion`, đổi `intake_channel`
> sang `MANUAL · IMPORT · LANDING`, đưa `code` thành khoá ngoại vào
> `platform.object`, và đổi chỉ mục email sang `lower(email)`.
>
> **Cập nhật 27/08 (sau đó)** — migration `0004` tách nguồn thành hai nửa:
> `source` → `campaign_id` (id một dòng `config_entry` list `SOURCE`) và
> `intake_channel` → `source_kind` (enum `MANUAL · IMPORT · APOLLO ·
LANDING_PAGE`). RENAME chứ không drop/add, nên 119 dòng giữ nguyên dữ liệu;
> chỉ mục `lead_source_idx` đổi tên thành `lead_campaign_idx`. Trạng thái mới
> nhất của cả module: [`ban-giao-lead.md`](./ban-giao-lead.md).

```
key        code · created_at
info       company* · legal_name · tax_code · address · province · category
           · main_product · headcount · plants                          ← ô 1,2,3
contact    contact_name* · contact_title · email* · phone · contact_channel  ← ô 4,5
need       pain · current_stack · decision_maker · approver
           · budget · currency · deadline                               ← ô 6…10
owner      owner_id · bd_owner_id · marketing_owner_id
pipeline   tier · stage · stage_since · source_kind · campaign_id · score
           · last_touch_at · required_filled° · optional_filled°
exit       exit_reason · exited_at
```

`*` = `NOT NULL` · `°` = `GENERATED ALWAYS AS … STORED`

**Bốn ràng buộc ở tầng bảng**, không nhờ người nhớ:

```sql
lead_money_pair     ("budget" IS NULL) = ("currency" IS NULL)   -- nợ #7: tiền luôn mang đơn vị
lead_exit_pair      ("exit_reason" IS NULL) = ("exited_at" IS NULL)
lead_exit_no_stage  "exit_reason" IS NULL OR "stage" IS NULL    -- rơi rồi thì không ở cột nào
lead_no_blank       16 cột text <> ''                           -- nợ #5: chỉ NULL, không bao giờ ''
                                                                --        `contact_channel` vào ngày 27/08
lead_email_live_idx UNIQUE(lower(email)) WHERE exit_reason IS NULL  -- một hộp thư = một lead ĐANG SỐNG
lead_code_object_fk FOREIGN KEY (code) → platform.object(code)  -- dòng gương là bắt buộc, máy gác
```

### `sales.opportunity` · `sales.contract`

Dựng **tối thiểu** — đủ để `running` của sổ lead có nghĩa sau khi bỏ
`lead.contract_code`, và đủ để `contract` có đích khoá ngoại. Bồi thêm cột khi
tới lượt module Ops.

Hai điểm thiết kế không được bỏ khi bồi:

- **`opportunity` KHÔNG có trạng thái `'won'`.** "Đã thắng" = có dòng trong
  `contract`, suy ra chứ không lưu. Thêm `state='won'` là dựng nguồn sự thật
  thứ hai cho cùng một câu, và hai nguồn thì có ngày lệch.
- **`contract` mang `lead_code`** bên cạnh `opportunity_code`, neo bằng **khoá
  ngoại GHÉP** vào `opportunity(code, lead_code)`. Đó là denormalize KHOÁ (bất
  biến), và Postgres từ chối `INSERT` nếu hai cột lệch nhau — nên nó không thể
  trôi.

---

## Chưa dựng — 12 bảng

```
A · lead vào hệ    lead_intake      payload thô từ landing (utm · ip · state · lead_code?)
                   suppression      CHẶN BẮN Ở CẤP EMAIL — xem "Nợ" mục 1

B · MAS mail       campaign         code · name · owner_id · state · source
                   campaign_member  campaign_code + lead_code (PK cả hai) · added_at · state
                   mail_template    subject · body · biến thay thế
                   campaign_run     template · scheduled_at · started_at · state   ← bắn nhiều lần
                   mail_delivery    run × lead · state · provider_message_id
                                    UNIQUE(run_id, lead_code)                      ← chống bắn trùng
                   mail_event       delivery_id · open|click|reply|bounce|unsub · at · url

C · chạm           touch            lead_code · kind · at · by_actor_id? · delivery_id?
                                    kind = 10 LeadEventKind + mail-open|click|reply

D · luồng phụ      session · credential · reset_ticket      auth thật, bỏ PV_TRUST_ACTOR_HEADER
                   approval · approval_link                 E3
                   outbox                                   E4 + pg-boss
```

`lead.score` và `lead.last_touch_at` hiện luôn là `0`/`NULL` — hai cột đó chỉ
có nghĩa khi `touch` tồn tại.

---

## Bảy chỗ đã sửa so với bản nháp đầu

Ghi lại vì mỗi chỗ là một lỗi có thật, không phải ý kiến:

1. **`unsubscribed_at` đặt sai cấp.** Unsubscribe theo EMAIL, không theo lead —
   landing page nộp hai lần là hai lead cùng email, huỷ ở lead A thì lead B vẫn
   bị bắn. Đưa sang bảng `suppression` riêng.
2. **`days_here` là số đổi theo thời gian mà lại lưu thành cột.** Thay bằng
   `stage_since`, tính lúc đọc. Lead đã rơi thì đồng hồ dừng ở `exited_at`.
3. **Bỏ `contract_code` làm gãy `running`.** Định nghĩa mới hỏi thẳng bảng
   `contract` qua `lead_code`.
4. **`required_filled`/`optional_filled` thành denormalize lần hai** khi 20
   trường đã là cột thật. Đổi sang `GENERATED … STORED`.
5. **Chưa có luật khử trùng landing page.** Thêm unique index có điều kiện —
   khách rơi khỏi luồng năm ngoái quay lại năm nay vẫn là lead mới hợp lệ.
6. **"Trống" có ba quy ước** (nợ #5). Bảng chốt một: `NULL`, và `CHECK` từ chối
   `''`.
7. **`source` phải nullable.** Lead vào thẳng không thuộc chiến dịch nào; bịa
   một mã nguồn để lấp cột là dựng một nguồn không có trong sổ nguồn. Màn
   Performance cần nhóm **"Không nguồn"**.

---

## HAI CHỖ ENGINE ĐANG LỆCH BẢNG — phải chốt trước khi có lead thật

Cả hai hôm nay còn ra **cùng con số**, nên không có gì đỏ. Chúng sẽ tách nhau
đúng vào lúc có lead landing page đầu tiên.

### 1 · Luật đếm ô (`SLOT_FIELDS`)

`filledSlots()` bên engine đo ô 4 bằng `contactName` và ô 5 bằng `email`. Bảng
đo ô 4 bằng `contact_title` và ô 5 bằng `phone`/`contact_channel`.

Lý do bảng phải khác: `contact_name` và `email` nay là cột **bắt buộc**, nên nếu
vẫn đo chúng thì hai ô đó luôn đầy cho MỌI lead, cổng sáu ô thành cổng bốn ô.

Với dữ liệu hiện tại hai bên khớp (fixture chỉ sinh `title` khi có `name`, chỉ
sinh `phone` khi có `email`). **Một lead landing page — có email, chưa có điện
thoại — sẽ tách chúng ra.** Chốt luật cổng rồi sửa `SLOT_FIELDS`; đừng sửa một
bên.

### 2 · `isRunning()`

Engine vẫn là `!lead.exitReason && !lead.contractCode` trên kiểu `Lead` của
fixture. SQL đã đổi sang `NOT EXISTS (contract)`. Sửa cùng lúc với bước B (tách
domain khỏi fixture), vì đổi bây giờ là đổi fixture có test khoá số.

---

## Hạ tầng — trạng thái thật

- **Neon `pv-crm`** (`patient-mode-45261751`, `neondb`, region ap-southeast-1).
  Bảng nằm ở schema **`sales`** và **`platform`**, KHÔNG ở `public` — Neon
  console mặc định mở `public` nên trông như trống; đổi dropdown Schema.
- **Neon trước 26/08 chưa từng có bảng nào.** App đã deploy lên Fly hôm trước
  nhưng bước migrate lên Neon chưa bao giờ chạy. Không có dữ liệu nào bị mất khi
  dựng lại.
- **Migration đã RESET về một file `0000` duy nhất.** Bảng `lead` đổi quá lớn
  (thêm 20 cột, bỏ 3, hai cột thường thành cột sinh) nên `drizzle-kit generate`
  hỏi tương tác từng cột và treo. Lịch sử cũ nằm trong git.
- **Dữ liệu demo đã XOÁ SẠCH** (`TRUNCATE … CASCADE`) theo yêu cầu 26/08 — cả 7
  bảng đang rỗng, chờ logic thật đẩy vào.

### Dựng lại dữ liệu demo khi cần

```bash
pnpm db:seed      # nạp lại 100 lead · 16 cơ hội · 6 hợp đồng · 7 actor
```

**Cảnh báo:** `.env` đang trỏ Neon, nên lệnh này **xoá sạch Neon rồi nạp lại**.
Trước đây nó chỉ động tới một thư mục trên máy. Muốn chạy offline thì bỏ dấu `#`
ở dòng `pglite://` trong `apps/api/.env`.

Seed lấy `contact_name`/`email` cho cả 100 dòng bằng **chính bộ sinh tất định
của fixture** (`leadContact` trên bản sao đã đánh dấu đủ hai ô liên hệ) — không
có mẫu dữ liệu mới nào được bịa ra. `contact_title`/`phone`/`channel` vẫn theo
`filled` thật, nên phân bố cổng init data giữ nguyên.

### Con số phải khớp sau mỗi lần seed

```
BOOK_SPLIT        signed 6 · running 42 · exited 52 · total 100
required_filled   {0:10, 1:21, 2:15, 3:12, 4:4, 5:4, 6:34}
days_here         2 … 77
email             100 dòng · 100 địa chỉ khác nhau · 0 trống
```

Cả bốn đã kiểm trên PGlite lẫn trên chính Neon ngày 26/08.

---

## BỐN CHẶN của endpoint landing page

`POST /sales/leads/intake` chưa viết được cho tới khi giải xong bốn chỗ này:

1. **Không có cách sinh `code`.** PK là `text` không DEFAULT; `LD-0101…LD-0200`
   là mã fixture. Cần một sequence trong schema `sales` + hàm format `LD-%04d`.
2. **Email trùng trả 500, không phải 409.** `lead_email_live_idx` ném `23505`,
   mà `ProblemFilter` chỉ hiểu `PvError`/`HttpException` nên nó rơi vào nhánh
   "lỗi bất ngờ". Nộp lại form là chuyện thường ngày nhất của landing page.
3. **Unique index đang trên `email` thô, không phải `lower(email)`.**
   `An@x.vn` và `an@x.vn` lọt thành hai lead. Ép ở index thì không cửa vào nào
   quên được.
4. **Endpoint phải `@Public()`** — khách điền form chưa đăng nhập. Đó là **cái
   thứ ba** ngoài luồng auth và `/healthz`, mà `need.decorator.ts` ghi rõ: thấy
   mình sắp thêm cái thứ ba thì dừng lại và hỏi. Một endpoint ghi công khai
   không có chống lạm dụng là một cái bơm để bơm rác vào sổ lead. Tối thiểu:
   rate limit theo IP + honeypot field. **Chưa ai chốt mức này.**

Thêm hai chỗ không chặn nhưng nên làm cùng lúc: `lead_intake` (không có nó thì
submit trùng/spam không truy vết được và `utm_*` mất luôn), và zod phải đổi
`''` → `undefined` trước khi ghi, kẻo `CHECK lead_no_blank` biến một ô trống
thành 500.

---

## Nợ đang có

1. **Không có `chiến-dịch.bắn`.** Marketing có `chiến-dịch.sửa` là bắn được mail
   ra ngoài công ty — sửa nháp và bắn 500 mail đang cùng một quyền, mà cái thứ
   hai không rút lại được. Đã chốt giữ nguyên ma trận (quyết định #6);
   `platform.audit` là thứ duy nhất truy được ai bấm bắn. Nếu sau muốn siết,
   chỗ thêm là một `@Need` ở đúng một endpoint.
2. **Marketing không có `cơ-hội.xem`** → không đo được chiến dịch mình ra bao
   nhiêu cơ hội. Luồng mới đóng vòng ở đó, mà vòng đó đang bị cắt.
3. **`bd_owner_id` và `marketing_owner_id` không tính vào trục phạm vi.** E2
   `ownOnly` chỉ so `owner_id`; BD mang lead về rồi giao đi là mất tầm nhìn.
   Sửa thì sửa ở E2, không sửa ở SQL.
4. **Chiến dịch không phải `ObjectKind`** → không vào được `platform.object`,
   nên `E1.story()` không đi ngược từ lead về chiến dịch đã chạm nó. Cần kind
   `CP` nếu ContextRail phải hiện dây đó.
5. **`source_kind` seed để NULL** — fixture chưa có khái niệm loại xuất xứ.
   Đoán một giá trị ở đó thì màn Performance sẽ đọc nó như dữ liệu thật. Nửa
   kia — `campaign_id` — thì fixture CÓ, nên nó được điền đủ cho cả 100 dòng.
6. **Mã hợp đồng còn dấu** (`HĐ-2711`) — nợ #1 của `ban-giao-backend.md`. Đổi ở
   engine trước, rồi một migration đổi dữ liệu.
7. **Connection string Neon đã đi qua một phiên chat** ngày 26/08. Nếu cần chặt
   chẽ: reset mật khẩu role `neondb_owner` trên Neon console rồi cập nhật lại
   `apps/api/.env` và `fly secrets`.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
Bốn chặn của landing page ──> POST /sales/leads/intake ──> lead THẬT đầu tiên
        │                                                        │
        └── lead_intake ─────────────────────────────────────────┤
                                                                 ▼
                                              Chốt luật cổng (SLOT_FIELDS)
                                                    │ lead landing tách hai bên ra
                                                    ▼
touch + suppression ──> campaign + campaign_run + mail_delivery ──> MAS mail chạy được
                                     │
                                     └── E4 + outbox + pg-boss (worker.ts đã có chỗ)
```

1. **Chốt mức chống lạm dụng** cho endpoint công khai. Chặn mọi thứ sau nó.
2. **Sequence sinh mã + `lower(email)` + bắt `23505` → 409** — ba việc nhỏ, làm
   một lượt, đều nằm trong `platform/http` và migration.
3. **`lead_intake` + `POST /sales/leads/intake`.** Lead thật đầu tiên vào hệ.
4. **Chốt `SLOT_FIELDS`** ngay khi có lead landing đầu tiên — đó là lúc hai bên
   tách nhau, và cũng là lúc rẻ nhất để sửa.
5. **`touch` + `suppression`**, rồi cụm chiến dịch.
