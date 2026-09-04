# Bàn giao — Sổ chiến dịch (`sales.campaign`)

Lát cắt **29/08/2026**, nhánh `develop` (bản dựng CRUD: 28/08; vòng đời tự đóng
và ba hàng rào cấu hình: 29/08 — xem mục cuối). Đọc cùng
[`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md) (đường gửi — hàng đợi,
suppression, cầu dao bounce — mà module này KHÔNG viết lại, chỉ gọi tới) và
[`con-thieu-mas-mail.md`](./con-thieu-mas-mail.md) (đóng mục **A3** và **D2**
ở đó — hai mục nay đã bỏ, xoá theo quy ước ghi ở đầu file kia).

File này ghi **CRUD chiến dịch thật đứng trên bảng `sales.campaign`**: tạo,
sửa, thêm/bớt thành viên, bắt đầu chạy (bắn đợt), dừng (huỷ đợt chưa gửi).

---

## Phạm vi

Trả lời đúng ba câu chủ dự án hỏi:

1. **Lên lịch từng đợt** — `POST /sales/campaigns/:code/start` nhận một mảng
   đợt, mỗi đợt có `scheduledAt` riêng.
2. **Bắn MAS mail theo chiến dịch** — mỗi đợt là một lần gọi thẳng
   `MasService.send()` với `campaignCode`, tái dùng nguyên hàng đợi/suppression
   /cầu dao bounce đã có.
3. **Ghi nhận lead thuộc chiến dịch nào** — `campaign_member` (đã có sẵn ở
   schema, nay có cửa `POST /sales/campaigns/:code/members` để ghi).

---

## Tám quyết định đã chốt

| #   | Quyết định                                                                                 | Lý do                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tách riêng "Nguồn dẫn" (SOURCE) và "Chiến dịch" (`sales.campaign`)**, không hợp nhất     | Đóng D2. `sales.campaign` là đơn vị GỬI (comment sẵn trong schema: "CONSUMES LEADS, DOES NOT PRODUCE THEM"); SOURCE là nơi lead SINH RA. Hai định nghĩa đối lập nhau, không gộp được thành một bảng mà không phá một trong hai                                                                    |
| 2   | Contract đặt tên `campaign-book.ts`, KHÔNG phải `campaign.ts`                              | Xung đột file THẬT giữa hai phiên đang chạy song song: phiên kia đã nhận `campaign.ts` cho contract SOURCE trước. Ghi lại để người sau không đặt trùng tên lần nữa                                                                                                                                |
| 3   | `/start` và `/stop` là **hai đường riêng**, không phải `state` trên `PATCH`                | Chúng đòi `chiến-dịch.bắn` (bắn mail thật), còn sửa tên/chủ chỉ đòi `chiến-dịch.sửa`. Gộp vào một `PATCH` thì phải đọc thân trước khi biết quyền nào đúng — MasController đã phải làm vậy vì một lý do khác (một route phục vụ hai tầm với); ở đây không cần vì vốn đã là hai route               |
| 4   | `start()`/`stop()` **gọi thẳng** `MasService.send()`/`MasService.cancel()`, không viết lại | Toàn bộ suppression, hàng đợi, cầu dao bounce, quy tắc huỷ (A6) đã có. Viết lại là hai nơi cho một luật, và luật thứ hai trôi khỏi luật thứ nhất ngay lần sửa tiếp theo                                                                                                                           |
| 5   | Trạng thái nâng lên `RUNNING` **TRƯỚC** vòng lặp gửi từng đợt                              | Một đợt lỗi giữa chừng (mẫu sai, MAS đang tắt, vượt trần lô) thì chiến dịch vẫn đúng là ĐANG CHẠY với những đợt đã gửi thành công — không phải NHÁP giả vờ trong khi thư đã nằm hàng đợi. Đợt lỗi gửi lại từng cái qua `POST /sales/mail/runs` với `campaignCode`, không gọi lại `/start`         |
| 6   | Tái dùng `chiến-dịch.sửa` cho cả tạo lẫn sửa, không thêm quyền `chiến-dịch.tạo`            | Đúng khuôn `lead.sửa` (dùng chung tạo+sửa ở `LeadController`). Ma trận vai hiện tại: mọi vai có `chiến-dịch.sửa` cũng có `chiến-dịch.bắn` (marketing/director/head-of-sales/account-executive), nên `/start`/`/stop` khai thẳng `chiến-dịch.bắn`, không cần cơ chế nâng quyền như `MasController` |
| 7   | `campaign.sourceId`/`sourceName` có mặt trong contract NGAY, không đợi lượt sau            | Cột `campaign.source_id` do phiên xây SOURCE thêm cùng lượt (tham chiếu `config_entry.id`). Đưa luôn vào `CampaignCreate`/`Patch`/`Row` — không cần một migration riêng để gắn nhãn "chiến dịch này thuộc nguồn nào" cho báo cáo sau này                                                          |
| 8   | Chuỗi đợt của hồ sơ đọc qua `MailRunRepository.list()`, KHÔNG qua `byId()`                 | `byId()` trả hàng DB TRẦN của `mail_run` (đủ cho `stop()` chỉ cần `.state`/`.id`). Mười một con số của `MailRunRow` (`sent`/`delivered`/`opened`/…) chỉ `list()` mới gộp qua hai lượt đọc `email_delivery`/`mail_event` — vấp lỗi kiểu ở đây trước khi kịp lên `pnpm check`, xem mục "Kiểm tay"   |

---

## Đã dựng

```
packages/contracts/src/sales/campaign-book.ts   MỚI — hợp đồng zod
packages/contracts/src/sales/index.ts           + export * from './campaign-book'

apps/api/src/branches/sales/campaign/campaign.schema.ts       CampaignRow → CampaignRowDb (đổi tên,
                                                                tránh trùng với CampaignRow của contract)
apps/api/src/branches/sales/campaign/campaign.mapper.ts       MỚI
apps/api/src/branches/sales/campaign/campaign.repository.ts   MỚI
apps/api/src/branches/sales/campaign/campaign.service.ts      MỚI
apps/api/src/branches/sales/campaign/campaign.controller.ts   MỚI
apps/api/src/branches/sales/campaign/campaign.module.ts       + CampaignController/Service/Repository
```

Không có migration mới — bảng `sales.campaign`/`campaign_member`/`campaign_run`
đã tồn tại (xem `ban-giao-mas-mail.md`), CRUD này chỉ lấp đường HTTP còn thiếu.

### Đường HTTP

| Đường                                 | `@Need`                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `POST /sales/campaigns`               | `chiến-dịch.sửa`                                                 |
| `GET /sales/campaigns`                | `chiến-dịch.xem` · scoped                                        |
| `GET /sales/campaigns/:code`          | `chiến-dịch.xem` · scoped                                        |
| `PATCH /sales/campaigns/:code`        | `chiến-dịch.sửa` · scoped (tên/chủ/nguồn — KHÔNG đổi trạng thái) |
| `POST /sales/campaigns/:code/members` | `chiến-dịch.sửa` · scoped                                        |
| `GET /sales/campaigns/:code/members`  | `chiến-dịch.xem` · scoped — 30/08                                |
| `POST /sales/campaigns/:code/start`   | `chiến-dịch.bắn` · scoped — chỉ NHÁP chưa có đợt                 |
| `POST /sales/campaigns/:code/waves`   | `chiến-dịch.bắn` · scoped — đợt thứ hai trở đi, 30/08            |
| `POST /sales/campaigns/:code/stop`    | `chiến-dịch.bắn` · scoped                                        |

---

## Đã kiểm tay

`pnpm typecheck:api`, `eslint`, `prettier --check` sạch trên mọi file đổi/mới.

Sống trên PGlite cục bộ (không đụng Neon — `.env` không sửa, chỉ override biến
môi trường cho riêng tiến trình `dev:api`, và **không** chạy `worker.ts` nên
không lá thư nào có cơ hội rời máy):

```
POST /sales/campaigns                          → CP-0001, DRAFT
POST /sales/campaigns/CP-0001/members           → add 2 lead, audienceCount=2
PATCH /sales/campaigns/CP-0001                  → đổi tên, giữ audienceCount
POST /sales/campaigns/CP-0001/start             → 1 đợt hẹn giờ +1h → RUNNING,
                                                    mail_run SCHEDULED, queued=2
GET /sales/campaigns/CP-0001                    → hồ sơ có đúng đợt vừa tạo,
                                                    11 con số MailRunRow đầy đủ
GET /sales/mail/runs?campaign=CP-0001           → CÙNG lô hiện ra — xác nhận
                                                    dây nối campaign_run đúng
POST /sales/campaigns/CP-0001/stop              → huỷ đợt chưa gửi, held=2,
                                                    STOPPED
```

Đúng luồng "lên lịch một đợt → thấy trong sổ lô gửi chung → huỷ trước giờ gửi"
— ba câu hỏi ở mục Phạm vi đều có đường thật để trả lời.

---

---

## Lượt 29/08 — vòng đời tự đóng, và ba lỗ hổng đã bịt

Soát lại đường lịch trước khi dựng FE. Bốn chỗ sai, mỗi chỗ chỉ lộ ra khi đọc
SQL cạnh nhau chứ không lộ khi chạy một lô mẫu.

### 1 · `DONE` có trong hợp đồng, có trong CHECK, KHÔNG AI GHI

`start()` nâng `RUNNING`, `stop()` hạ `STOPPED`, hết. Một chiến dịch bắn xong
đủ ba đợt đứng `RUNNING` vĩnh viễn — sai trên mọi bộ lọc "đang chạy" và mọi
báo cáo đếm theo trạng thái.

Không sửa được bằng một dòng trong `start()`: lúc đó chưa có gì xong, đợt cuối
có thể hẹn tuần sau. Cũng không đặt được ở `MailRunSweeper` — `platform` không
được biết `sales.campaign` tồn tại. Nên nó thành **`CampaignSweeper`**, bậc thứ
ba của cùng một vòng quét, chạy trên nhịp `PV_QUEUE_POLL_SECONDS` của worker:

```
MailRelay        một LÁ THƯ đến hạn chưa      → thành job
MailRunSweeper   một LÔ còn thư nào chờ không → đóng, hoặc cầu dao ngắt
CampaignSweeper  một CHIẾN DỊCH còn đợt nào   → XONG          ← MỚI
                 chưa ngã ngũ không
```

`CampaignRepository.closeFinished()` là một câu UPDATE, cùng lý lẽ "vị ngữ nằm
trọn trong WHERE" của `sweepStates()`. Hàng rào quan trọng nhất trong nó là
`EXISTS` một đợt: `/start` nâng `RUNNING` **trước** vòng lặp gửi (quyết định #5
ở trên), nên có một khoảnh khắc chiến dịch đã `RUNNING` mà chưa đợt nào kịp
ghi — lượt quét chạy đúng vào đó mà thiếu `EXISTS` sẽ đóng ngay một chiến dịch
chưa gửi lá thư nào, và `DONE` không có đường về.

### 2 · Lô `SCHEDULED` kẹt vĩnh viễn khi mọi thư đều bị chặn

`sweepStates()` nâng `SCHEDULED → SENDING` khi có ≥1 dòng ở `SENT_STATES`. Ba
trạng thái nghĩa là "worker đã chạm tới thư nhưng KHÔNG có gì rời máy" —
`suppressed`, `failed_permanent`, `dead` — đều không nằm trong đó. Một đợt mà
mọi người nhận đều huỷ đăng ký trong khoảng giữa lúc xếp hàng và lúc tới giờ
(đúng hình dạng của chiến dịch nhiều đợt cách nhau vài ngày) không bao giờ vào
`SENDING`; mà pass đóng lô chỉ nhìn `SENDING`, nên nó đứng `SCHEDULED` mãi, màn
hiện "sẽ bắn lúc" một giờ đã qua. Lô 0 người nhận cũng vậy.

Câu hỏi đúng không phải "đã có thư nào rời máy chưa" mà **"worker đã chạm tới
lô này chưa"** — mọi trạng thái khác `pending` đều trả lời có. Kèm một nhánh
thứ hai cho lô không có dòng nào, và `COALESCE(scheduled_at, created_at)` để lô
`SCHEDULED` thiếu giờ vẫn thoát được.

Phụ phẩm: `sending` nay cũng tính là "đã bắt đầu", nên **cầu dao bounce thấy lô
sớm hơn một nhịp** — nó chỉ xét lô `SENDING`, và khe hở đúng bằng một vòng poll
đã đóng lại.

### 3 · Cầu dao gộp TOÀN BỘ sổ gửi, mỗi 12 giây

`tripBounced()` gộp `email_delivery` cả bảng rồi mới join `mail_run` để lọc lô
`SENDING`. Postgres không đẩy được điều kiện join vào một subquery đã `GROUP
BY`, nên đó là một lượt quét toàn bảng **mỗi nhịp worker**: 5 lần/phút, 7.200
lần/ngày, lớn dần theo bảng, và trả tiền theo phút trên một Postgres serverless
vốn cũng không được ngủ vì chính vòng poll đó.

Nay lô `SENDING` được kê ra trước (CTE `live`), phép gộp chỉ chạm dòng của
chúng — một tập rỗng gần như suốt ngày, vì một lô chỉ `SENDING` trong đúng mấy
phút nó đang bay.

### 4 · `email_delivery.mail_run_id` có khoá ngoại mà KHÔNG có index

Cột mà gần như mọi câu hỏi của cụm MAS lọc theo — và tất cả đều hỏi trên nhịp
của worker, không phải trên một request: `sweepStates()` (một EXISTS/NOT EXISTS
mỗi lô mỗi nhịp), cầu dao, `cancelUnsent()`, mười một con số của một trang sổ
lô. Tất cả seq-scan suốt tháng đầu.

`0020_mail_run_indexes.sql` thêm hai index, **không có `DROP`**:

| Index                          | Cho ai                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `email_delivery_run_state_idx` | `(mail_run_id, state)` — mọi câu hỏi theo LÔ                                         |
| `email_delivery_due_idx`       | `(next_attempt_at, created_at) WHERE state = 'pending'` — `pendingBatch()` của relay |

Cái thứ hai PARTIAL có chủ ý: `pending` là trạng thái thoáng qua nên index luôn
nhỏ dù sổ gửi lớn tới đâu, và lịch gửi chính là thứ làm khác biệt đó cắn —
một chiến dịch hẹn tuần sau để cả tệp nằm `pending` mà CHƯA đến hạn, tức khớp
index cũ (`state`) rồi mới bị WHERE loại.

### Đã kiểm — PGlite, không đụng Neon

17 khẳng định trên dữ liệu dựng tay, đúng thứ tự `MailRunSweeper.sweep()` (cầu
dao trước, trạng thái sau):

```
lô mọi thư bị chặn      → SENT      (trước: kẹt SCHEDULED)
lô không thư nào        → SENT      (trước: kẹt SCHEDULED)
lô SCHEDULED thiếu giờ  → SENT      (trước: kẹt SCHEDULED)
relay chưa chạm         → SCHEDULED (đúng: chưa bắt đầu)
chưa tới giờ            → SCHEDULED
đang bắn dở (1/2 thư)   → SENDING   (không đóng sớm)
bounce 5/30 = 17%       → CANCELLED, giữ lại 10 thư chưa gửi
CP mọi đợt ngã ngũ      → DONE
CP chưa đợt nào         → RUNNING   (hàng rào EXISTS)
CP còn một đợt chờ      → RUNNING
CP đã dừng tay          → STOPPED   (không đụng)
```

Cộng 7 khẳng định cho các hàng rào `env.ts` ở dưới. `pnpm check` xanh.

### Ba hàng rào cấu hình — và vì sao chúng phải là hàng rào

`.env` cục bộ đã ở trạng thái này: `DATABASE_URL` trỏ Neon **production**,
`PV_EMAIL_ENABLED=true`, `PV_MAS_ENABLED=true`, và:

- `PV_EMAIL_MAS_FROM` cùng domain `notify.` với `PV_EMAIL_FROM` — tức bắn hàng
  loạt từ subdomain đã warm-up của mail giao dịch, đúng thứ
  `ban-giao-mas-mail.md` viết hoa "ĐỪNG ĐỤNG". Hai biến tách nhau mà điền cùng
  một domain là dựng đủ hình thức và bỏ hết tác dụng.
- `PV_API_PUBLIC_URL=http://localhost:4123` — liên kết huỷ đăng ký trong thư
  thật trỏ về máy của **người nhận**. Một lượt huỷ chết lặng đổi thành một lượt
  báo spam, và trần complaint của Resend là 0,08%.
- `PV_MAS_SENDER_POSTAL="Pebble Vina · [địa chỉ bưu chính chưa khai]"` — chuỗi
  giữ chỗ in thẳng vào chân mọi thư marketing. `.refine` cũ chỉ đếm ký tự nên
  thấy đủ.

Cả ba lọt vì chúng là **giá trị hợp lệ về hình thức**. Nay `env.ts` từ chối
khởi động: cùng domain (khi cả hai cửa gửi cùng mở) · `PV_API_PUBLIC_URL`
localhost (cùng điều kiện) · địa chỉ bưu chính chứa dấu ngoặc vuông. Cộng một
hàng rào thứ tư không liên quan tới MAS nhưng cùng họ:
`PV_EMAIL_WORKER_CONCURRENCY ≤ PV_EMAIL_RATE_PER_SECOND`, vì thua cửa nhịp là
một lượt `retry` tiêu chung ngân sách với lỗi thật của Resend — nâng số luồng
để "chạy nhanh hơn" làm thư bị parking `dead` chứ không làm nhanh hơn.

`.env` đã hạ `PV_MAS_ENABLED=false` cho khớp; mail giao dịch không đổi. Bật lại
được ngay khi `go.pebblevina.com` verify DKIM xong và API có host công khai.

---

## Lượt 29/08 (phần hai) — FE: ba sổ, một tiền tố

Ba nhánh FE mà bản 28/08 liệt kê là "chưa làm" nay đã dựng, cộng lượt đổi tên
màn cũ. Migration `0020` **đã chạy trên Neon**, hai index xác nhận có thật
trong `pg_indexes`.

### Đường dẫn — mọi thứ dưới `/sales/campaigns`

```
/sales/campaigns                    Sổ chiến dịch    CP-nnnn   MỚI
/sales/campaigns/:code              Hồ sơ chiến dịch           MỚI
/sales/campaigns/nguon-dan          Nguồn dẫn        SR-nn     màn cũ, đổi tên
/sales/campaigns/nguon-dan/:code    Hồ sơ nguồn dẫn            màn cũ, đổi tên
/sales/campaigns/lo-gui             Sổ lô gửi                  MỚI
```

Một tiền tố vì `useAppChrome` sáng mục nav bằng `inModule()`, tức khớp theo
TIỀN TỐ: đặt Nguồn dẫn ở `/sales/sources` là mục nav tắt ngóm đúng lúc người
dùng đứng trên nó, hoặc phải đẻ module thứ 7 cho một sổ vốn thuộc module 1.
`components/module1-books.tsx` là dải chuyển giữa ba sổ, đọc sổ đang mở từ
đường dẫn nên không màn nào khai sai được chỗ nó đang đứng.

### File

```
apps/web/src/data/campaign-book.ts          MỚI — query/mutation CP
apps/web/src/data/mail-runs.ts              MỚI — sổ lô gửi + huỷ lô
apps/web/src/pages/campaigns.tsx            MỚI — Sổ chiến dịch
apps/web/src/pages/campaign-form.tsx        MỚI — stepper: tạo · sửa · xem
apps/web/src/pages/mail-runs.tsx            MỚI — Sổ lô gửi
apps/web/src/components/module1-books.tsx   MỚI — dải ba sổ

apps/web/src/pages/campaigns.tsx      → sources.tsx        (git mv)
apps/web/src/pages/campaign-detail.tsx → source-detail.tsx (git mv)
apps/web/src/pages/campaign-parts.tsx  → source-parts.tsx  (git mv)
apps/web/src/pages/campaign-model.ts   → source-model.ts   (git mv)

apps/web/src/components/mas-mail-modal.tsx  + ô "Gắn vào chiến dịch"
apps/web/src/data/mas.ts                    `useMasSend` chọn quyền theo thân
apps/web/src/routes.tsx                     5 route module 1
```

`data/campaigns.ts` **giữ nguyên tên** dù nó phục vụ màn Nguồn dẫn: đổi tên nó
kéo theo `data/leads.ts` và `data/performance.ts`, mà file đầu đang nằm trong
tay một phiên chạy song song. Ghi lại để người sau đổi nốt khi cây rảnh.

### Ba quyết định đáng biết

1. **`useMasSend` chọn quyền theo THÂN**, không khai cứng một quyền. Gửi lẻ là
   `lead.gửi-mail` (kèm `ownOnly`); gắn lô vào chiến dịch là `chiến-dịch.bắn`,
   đúng như `MasService.send()` phân nhánh ở đầu bên kia. Khai cứng thì hoặc
   Sale bị chặn oan lúc gửi lẻ, hoặc cửa client rộng hơn cửa thật và người dùng
   chỉ biết mình thiếu quyền sau khi đã soạn xong thư.
2. **Hộp gom người nhận CHỈ THÊM, không bớt** — `CampaignProfile` trả
   `audienceCount` chứ không trả danh sách thành viên, nên màn không biết ai
   đang ở trong tệp và một nút "bớt" sẽ phải đoán. Cần
   `GET /sales/campaigns/:code/members` để mở nút đó.
3. **Hộp "Bắt đầu chạy" gửi ĐÚNG MỘT đợt** dù `CampaignStart` nhận tới 20: đợt
   thứ hai được soạn sau khi nhìn số của đợt thứ nhất, và nó đi qua ô "Gắn vào
   chiến dịch" của modal MAS chứ không gọi lại `/start`.

### Đã nhìn bằng mắt

Chạy `pnpm dev` trên `.env` thật (Neon, chỉ ĐỌC — không tạo dòng nào):

- Sổ chiến dịch — ba ô số, hàng lọc, EmptyState đúng câu (sổ production rỗng)
- Sổ lô gửi — **ba lô THẬT** hiện đủ: badge "Đã gửi", bốn con số cộng đúng
  (4 thư), nút "Dừng" xám trên lô `SENT` như thiết kế
- Nguồn dẫn — màn cũ nguyên vẹn ở đường mới, nav vẫn sáng ở mục Chiến dịch

`pnpm check` xanh (trừ một file rác `apps/api/verify-0019-0020.mjs` của phiên
song song, không phải của lượt này).

---

## Lượt 30/08 — soát lại toàn cụm, và ba thứ bịt được nhờ soát chéo

Lượt này không thêm màn nào. Nó soát cụm đã dựng, rồi vá. Bốn nhánh dựng song
song trên bốn tập file rời, sau đó **hai lượt soát độc lập đọc code của người
khác** — và chính hai lượt đó tìm ra ba lỗi mà `pnpm check` xanh vẫn không thấy.

### 1 · `RUNNING` là trạng thái THOÁNG QUA — luật của `/waves` đã sai từ đầu

Bản đầu của `POST :code/waves` đòi `state === 'RUNNING'`. Nghe hợp lý cho tới
khi đọc `CampaignSweeper` cạnh nó: `closeFinished()` hạ `RUNNING → DONE` ngay
khi mọi `mail_run` đã ngã ngũ, trên nhịp `PV_QUEUE_POLL_SECONDS`. Một chiến
dịch một đợt, bắn ngay, vài phút sau đã `DONE` — **hôm sau không thêm đợt được
nữa**, tức cửa này không làm nổi đúng việc nó sinh ra để làm.

Cùng lúc, chiến dịch `DRAFT` đã có đợt (di sản của lỗ modal cũ) là ngõ cụt kín:
`/start` chỉ sang `/waves`, `/waves` chỉ về `/start`, `PATCH` không đổi state,
sweeper không chạm `DRAFT`.

Luật mới, và nó là **một** luật cho cả hai ca:

| `state`   | `waveCount` | `/waves`                                             |
| --------- | ----------- | ---------------------------------------------------- |
| `STOPPED` | bất kỳ      | 409 — dừng là quyết định có chủ ý                    |
| `DRAFT`   | `0`         | 409 — đợt ĐẦU đi qua `/start`, để log phân biệt được |
| `DRAFT`   | `> 0`       | CHO — đường duy nhất đưa ca di sản về bình thường    |
| `RUNNING` | bất kỳ      | CHO                                                  |
| `DONE`    | bất kỳ      | CHO — thêm đợt là MỞ LẠI chiến dịch                  |

Khi cho phép mà chưa `RUNNING` thì nâng lên `RUNNING` **trước** `mas.send()` —
cùng lý lẽ quyết định #5. Sweeper tự đóng lại về `DONE` khi đợt mới ngã ngũ;
vòng đời tự khép, không thêm cơ chế nào.

### 2 · `/start` nay là một câu lệnh, không phải đọc-rồi-ghi

`byCode()` → kiểm `state` → `setState('RUNNING')` là hai lệnh rời. Hai request
chồng nhau cùng thấy `DRAFT` và **cùng bắn thư thật**; `eventKey` chỉ chống
trùng TRONG một `mailRunId`, còn lượt hai sinh run mới nên sinh key mới.

`startIfDraft(code)` là `UPDATE … WHERE code = $1 AND state = 'DRAFT' RETURNING
code`; 0 dòng ⇒ 409. Cộng một hàng rào đọc trước đó: `waveCount > 0` thì từ
chối, vì chiến dịch đã bắn rồi mà vẫn `DRAFT` là đúng ca ngõ cụt ở mục 1.

### 3 · Trần người nhận nổ muộn, và báo bằng ngôn ngữ của máy

`/start` và `/waves` dựng `leadCodes` ở máy chủ nên **không đi qua cổng zod**
`MAS_MAX_RECIPIENTS`; trần thật là `PV_MAS_BATCH_MAX` bên trong `MasService`,
ném `invalid({ leadCodes })` = 400 gắn vào một ô không có trên màn chiến dịch.
Trong khi `POST :code/members` cho thêm 500 mỗi lượt và không có trần tổng —
nên dựng được chiến dịch 250 người rồi **không bao giờ bắn được**.

Nay cả hai cửa kiểm sớm ngay sau khi đọc tệp và ném 409 nói cả hai con số.
`MasService` vẫn giữ hàng rào cuối — đây là lượt kiểm sớm, không phải bản chép.

### 4 · Ngày tháng: `dm()` từng in sai NGÀY trên dữ liệu thật

`lib/date.ts` cắt `iso.slice(0, 10)`. Đúng hồi mọi mốc còn tới từ fixture viết
sẵn `+07:00`; máy chủ thật trả `toISOString()` tức UTC, nên ở +07 **mọi mốc
00:00–06:59 giờ VN in ra ngày hôm trước**. Hẹn đợt 31/08 06:00 thì chuỗi đợt ở
bước Soát lại hiện "Hẹn · 30/08".

Nay đọc bằng `Intl` theo múi giờ trình duyệt, thêm `dmhm` (có GIỜ — màn hẹn giờ
mà chỉ hiện ngày thì hai đợt cùng ngày không phân biệt được) và `localSlot` cho
ô `datetime-local`. Một cái bẫy đi kèm, đã bịt: ngày TRẦN `YYYY-MM-DD` (`Ngay`
trong contract) bị `new Date` đọc là nửa đêm UTC, nên phía tây UTC lệch một
ngày — `moment()` ép nó về nửa đêm giờ máy.

### 5 · Hai món BÀN GIAO, cố ý không tự sửa

Cả hai nằm trong file mà một phiên khác đang mở; sửa chồng là hỏng lượt của họ.

- **`POST /sales/mail/runs` không kiểm `campaign.state`.** `campaignExists()`
  chỉ hỏi có tồn tại không. Nên vẫn gắn được đợt vào chiến dịch `DRAFT` /
  `STOPPED` / `DONE` bằng một lệnh `curl` — hàng rào hiện tại chỉ là bộ lọc
  phía client trong modal MAS. Đây là **nửa còn lại** của lỗ gửi trùng mà lượt
  này đã bịt ở cửa mới.
- **`masPreview` khai `lead.gửi-mail`.** Nút "Xem trước" nay đứng trên màn
  chiến dịch vốn chỉ đòi `chiến-dịch.bắn`, nên một vai bắn được chiến dịch mà
  không có quyền gửi lẻ sẽ thấy lỗi ở chỗ đáng lẽ là lá thư. `useMasSend` đã
  tách quyền theo thân yêu cầu; `masPreview` cần tách y hệt.

### 6 · Đã ghi nhận, cố ý ĐỂ LẠI

- `stop()` bỏ sót lô từ đợt thứ 201 (`wavesOf` chặn `size: 200`) mà vẫn ghi
  `STOPPED`; và một lô bị bỏ qua vì out-of-scope cũng không hiện lên phản hồi.
  Ngưỡng xa thực tế, nhưng là lỗ thật.
- `POST :code/members` vẫn không có trần tổng — mới chỉ chặn ở lúc bắn.
- Danh sách thành viên chưa có pager (xem nợ #1).

## Nợ đang có

Năm mục đầu của bản 28/08 (`data/campaign-book.ts` · Sổ chiến dịch · đổi tên
màn cũ · bước Lịch gửi · Sổ lô gửi) đã TRẢ ở lượt hai ngày 29/08 — xem mục
trên. Còn lại:

1. ~~**Chưa gỡ được người khỏi tệp nhận**~~ — TRẢ 30/08:
   `GET /sales/campaigns/:code/members` đã có, hộp gom nay THÊM và GỠ được.
   Còn thiếu **pager**: danh sách nạp tối đa 200 dòng và chỉ nói ra điều đó
   bằng một dòng chữ, nên tệp lớn hơn 200 thì phần đuôi chưa gỡ được.
2. **Sổ chiến dịch đếm ba ô số bằng cách kéo 200 dòng về trình duyệt**
   (`campaignFacetQuery`) — cùng chắp vá với `opportunityFacetQuery`, và gãy ở
   chiến dịch thứ 201. Cách sửa thật là `GET /sales/campaigns/scorecard` đếm
   bằng SQL; dựng khi sổ chạm ngưỡng, đừng dựng trước.
3. **`data/campaigns.ts` vẫn mang tên cũ** dù nó phục vụ màn Nguồn dẫn — đổi
   tên nó kéo theo `data/leads.ts` và `data/performance.ts`. Đổi khi cây không
   có phiên nào khác đang giữ hai file đó.
4. **Sổ lô gửi cộng bốn con số theo TRANG**, không theo cả sổ — nhãn nói rõ
   "trang đang mở". Sổ này mọc thêm một dòng mỗi lần ai bấm gửi nên sẽ vượt
   trần 200 nhanh hơn sổ chiến dịch; đừng chắp vá kiểu facet ở đây.
5. **`sales.campaign` chưa phải `ObjectKind`** (nợ B4 cũ) — `E1.story()` /
   ContextRail chưa đi ngược được từ lead về chiến dịch đã chạm nó. Cần thêm
   kind `CP` vào `packages/engines/src/types.ts` + ghi dòng gương vào
   `platform.object` mỗi lần tạo chiến dịch. Đi sau việc FE, không chặn nó.
6. ~~**`CampaignPatch.ownerId`/`sourceId` không có cách CLEAR**~~ — TRẢ 30/08:
   bốn trường tuỳ chọn nay `.nullable()`, và ba trạng thái tách bạch — VẮNG là
   "giữ nguyên", `null` là "GỠ về NULL", có giá trị là "đặt".

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
CRUD backend (XONG 28/08)
        │
vòng đời tự đóng + index + hàng rào env (XONG 29/08, lượt một)
        │
   ba sổ FE + đổi tên màn cũ + ô chiến dịch trong modal (XONG 29/08, lượt hai)
        │
   ┌────┴────────────────────────────┬─────────────────────────────┐
   ▼                                  ▼                             ▼
GET :code/members                canary MỘT lô 20–30           nợ ObjectKind CP
(mở nút gỡ khỏi tệp)             địa chỉ THẬT, xem bounce       (B4, không chặn)
                                        │
                                        ▼
                        ba điều kiện bật PV_MAS_ENABLED:
                        go.pebblevina.com verify DKIM ·
                        PV_API_PUBLIC_URL có host thật ·
                        địa chỉ bưu chính đã khai
```

**Đường chặn thật bây giờ không còn là FE.** Ba màn đã đứng trên bảng thật và
bấm được; thứ chặn một đợt gửi thật là ba dòng cấu hình ở cuối nhánh phải, và
`env.ts` sẽ không cho khởi động cho tới khi đủ cả ba — xem mục "Ba hàng rào
cấu hình" ở trên.
