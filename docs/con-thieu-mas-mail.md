# Còn thiếu — MAS mail

Lát cắt **28/08/2026**, sau commit `ced17a7`. Đọc cùng
[`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md) — file đó ghi **đã dựng gì và
vì sao**, file này ghi **còn thiếu gì và ai phải làm**.

Mỗi mục ghi đủ bốn thứ: **cái gì · ở đâu · làm thế nào · vì sao chưa**. Làm
xong thì XOÁ mục đó, đừng đánh dấu ✅ — danh sách này chỉ có nghĩa khi nó ngắn.

---

## Trạng thái một dòng

Đường gửi **chạy thật** — một lô canary 4 địa chỉ đã đi qua Resend ngày 28/08,
cả bốn `accepted`. Nhưng nó chạy trên **PGlite cục bộ**: Neon chưa chạy
migration nào, Fly chưa deploy, và ba biến bắt buộc còn rỗng. Không có màn hình
nào gọi được vào đó.

Nói gọn: **backend xong, dữ liệu mồi và mặt tiền thì chưa.**

---

## A · BACKEND

### A1 · `GET /sales/leads/:code/mail` — CHẶN yêu cầu 4

**Cái gì.** Timeline mail của một lead: đã nhận đợt nào, mở lần nào, chưa mở thì
lỗi hay bounce.

**Ở đâu.** Hợp đồng đã viết đủ — `LeadMailTimelineRow` và
`LeadMailTimelineResponse` ở `packages/contracts/src/sales/mail.ts:562,629`.
**Không route nào trả chúng.** `mas.controller.ts` chỉ có `preflight` · `runs` ·
`GET runs` · `templates`.

**Làm thế nào.** Một `@Get(':code/mail')` ở `lead.controller.ts` (hoặc một
controller riêng), `@Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })`.
SQL: `email_delivery` join `mail_run` theo `mail_run_id`, lọc
`aggregate_id = :code`, left join `mail_event` gom `openCount`/`clickCount` và
mốc cuối. Sắp `mail_run.created_at DESC`.

**Vì sao chưa.** Lát 4 làm cửa GHI (tạo lô, xếp hàng); cửa ĐỌC theo-lead nằm ở
nhánh Lead chứ không nhánh Campaign, nên rơi giữa hai lát.

### A2 · `sales.mail_template` RỖNG — CHẶN yêu cầu 1

**Cái gì.** Ô "chọn mẫu mail" ở modal MAS sẽ **rỗng trơn**.

**Ở đâu.** Bảng dựng ở `campaign.schema.ts`, endpoint `GET /sales/mail/templates`
có, nhưng **không chỗ nào `INSERT`** — `seed.ts` không nhắc tới nó, grep toàn
repo không ra dòng nào.

**Làm thế nào.** Một migration nạp **một** mẫu `mas-edge-ai-intro`. Chọn
migration chứ không `seed.ts` vì hai lý do: mẫu mail là dữ liệu **cấu hình**,
không phải dữ liệu demo; và `pnpm db:seed` đang `TRUNCATE` sạch Neon nên không
ai dám chạy nó trên production.

**Vì sao chưa.** Nội dung thật của sản phẩm chip bán dẫn AI ngoại biên chưa
được cung cấp, và bịa thông số một con chip vào thư gửi khách là loại sai đắt
nhất có thể mắc ở đây. Cần bốn thứ từ chủ dự án: tên dòng sản phẩm · một câu
định vị · CTA dẫn đi đâu · số liệu nào được phép in.

### A3 · Không có cửa tạo chiến dịch — CHẶN yêu cầu 3

**Cái gì.** `POST /sales/campaigns` và `GET /sales/campaigns`.

**Ở đâu.** `sales.campaign` + `campaign_code_seq` đã dựng và **đang rỗng**.

**Làm thế nào.** Bốn file theo đúng khuôn `lead/`. Mã sinh từ sequence, format
`CP-%04d` (CHECK `campaign_code_shape` đã gác).

**Vì sao chưa.** Ngoài phạm vi bốn lát đã chạy. Xem thêm **D2** — có một quyết
định mô hình phải chốt trước, không chỉ là viết endpoint.

### A4 · Hai trạng thái của lô không tới được

`MailRunState` có `DRAFT` và `CANCELLED`, nhưng **không route nào** chuyển lô
sang chúng. Người dùng không huỷ được một lô đã hẹn giờ — chỉ cầu dao tự động
mới đặt `CANCELLED` được. Cần `PATCH /sales/mail/runs/:id` với `@Need('chiến-dịch.bắn')`.

### A5 · `PV_MAS_ENABLED` chưa gác cửa gửi

Docblock của nó (`env.ts`) nói nó "quyết định đường bulk có được dùng hay
không", nhưng **chưa nối vào đâu**. Đặt `false` hôm nay không chặn gì cả. Sửa
là hai dòng trong `MasService.send`, nhưng phải quyết trước: gác thì mọi máy dev
ăn 403.

### A6 · `PV_MAS_RESEND_API_KEY` bị bỏ qua lặng lẽ

Có trong `apps/api/.env`, **không có trong `env.ts`**. Ngày ai đó điền khoá
riêng cho MAS vào đấy, nó sẽ không có tác dụng gì và không có gì báo. Hoặc khai
vào `env.ts` và cho `MailModule` chọn driver theo luồng, hoặc bỏ khỏi `.env`.

### A7 · Bảy chỗ nhỏ hơn

|     | Vấn đề                                                    | Hệ quả                                                                                                                                                   |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `MasSendRequest` không có trường CTA                      | Nút trong thư chép từ mẫu; người bấm Gửi chưa bao giờ xác nhận nó                                                                                        |
| b   | Không lọc `exit_reason IS NOT NULL`                       | Lead đã rơi khỏi phễu vẫn nhận được mail chiến dịch                                                                                                      |
| c   | `MasPreflightResponse` không có `hidden`                  | Lead ngoài phạm vi **biến mất** khỏi danh sách, `sendable + blocked < leadCodes.length` mà không ai giải thích                                           |
| d   | `audienceCount` mâu thuẫn giữa hai file                   | Contracts nói "kể cả bị bỏ qua", schema nói "đã qua preflight". Code theo schema. Một trong hai docblock phải xoá                                        |
| e   | Chưa có reaper cho dòng kẹt `sending`                     | Nợ cũ của `ban-giao-mail.md`, **nay gấp hơn**: một lô 200 dòng kẹt là 200 lá thư không ai biết                                                           |
| f   | `packages/contracts` không có rào `no-restricted-imports` | `apps/**`, `packages/ui/**`, `packages/engines/**`, `packages/mail-templates/**` đều có rào; package này thì không, nên không gì chặn nó import `@api/*` |
| g   | `email_suppression.reason` không có CHECK ở DB            | Khác `email_delivery.state`. Giá trị rác vào được bảng                                                                                                   |

---

## B · CƠ SỞ DỮ LIỆU

### B1 · Neon CHƯA chạy migration nào — chặn mọi thứ

`0007` … `0011` mới chỉ chạy trên PGlite dùng một lần. Production vẫn là lược đồ
của `0006`.

**Cẩn thận:** `apps/api/.env` trỏ **thẳng Neon production**. Chạy `pnpm db:migrate`
là chạy trên dữ liệu thật. `0007` và `0010` chỉ `CREATE`, không đụng bảng đang
có — nhưng `0008`/`0009` (module cơ hội, của phiên khác) có `ALTER` và một bước
chuyển dữ liệu, đọc kỹ trước khi chạy.

### B2 · Migration `0010` chưa commit

Chuỗi đang đan xen giữa hai phiên: `0007` (MAS) → `0008`/`0009` (cơ hội) →
`0010` (MAS) → `0011` (cơ hội). Commit `ced17a7` chỉ mang tới `0007`, vì snapshot
của `0010` đã chứa cột của module cơ hội — commit nó mà không commit lược đồ cơ
hội thì lần `drizzle-kit generate` sau sẽ đòi **DROP** những cột đó.

**Làm thế nào.** Đợi phiên cơ hội commit xong, rồi commit `0010` + `0011` +
`_journal.json` đầy đủ trong một lượt phối hợp. Lược đồ TS đã mang chỉ mục
`mail_event_unsub_once` rồi, nên sinh lại được nếu file thất lạc.

### B3 · Hai bảng rỗng

`sales.mail_template` (xem **A2**) và `sales.campaign` (xem **A3**).

### B4 · `sales.campaign` không phải `ObjectKind`

Nên `E1.story()` không đi ngược từ lead về chiến dịch đã chạm nó, và ContextRail
không vẽ được dây đó. Nợ #4 của `ban-giao-db.md`, chưa trả. Cần thêm kind `CP`
vào `packages/engines/src/types.ts` và một dòng gương trong `platform.object`
mỗi lần tạo chiến dịch.

---

## C · FRONT-END — chưa động một dòng

Bản phác đã duyệt nằm trong lịch sử phiên 28/08; tóm tắt lại ở đây để không
phải đọc ngược.

### C1 · Tầng dữ liệu — `apps/web/src/data/mas.ts` (mới)

Bốn cửa, đi qua chuỗi interceptor `app/api` như mọi cửa khác, **màn không bao
giờ gọi thẳng `api`**:

```
masTemplatesQuery              GET  /sales/mail/templates
masPreflight(leadCodes)        POST /sales/mail/preflight
useMasSend()                   POST /sales/mail/runs
leadMailTimelineQuery(code)    GET  /sales/leads/:code/mail    ← chờ A1
```

`need: { branch: 'Sales', permission: 'lead.gửi-mail' }`. **Không** truyền
`load:` — bốn cửa này có route thật, khác năm query còn ăn fixture ở
`fix-later.md` mục 4.

### C2 · `components/mas-mail-drawer.tsx` (mới) — thay bản demo

Thay `apps/web/src/components/quick-mail-dialog.tsx` (bản demo chưa commit, bấm
Gửi chỉ hiện toast). `Drawer` + `Stepper`, ba bước cho gửi nhanh, bốn bước cho
chiến dịch (chèn bước "Lịch gửi").

```
Bước 1 · Người nhận   preflight trả về, hiện nhãn chặn + cảnh báo Apollo
Bước 2 · Nội dung     chọn mẫu → tự điền tiêu đề/nội dung, sửa tay được
Bước 3 · Lịch gửi     CHỈ mode campaign
Bước 4 · Xem lại      "thư đi ra ngoài và KHÔNG rút lại được"
```

Ba điều dễ làm sai:

- **Gửi là BẤT ĐỒNG BỘ.** Worker poll 12 giây. Panel phải nói **"đã xếp hàng N
  thư"**, không nói "đã gửi". Bản demo hiện đang nói sai.
- **Mở lại là một lần soạn mới** — giữ nội dung cũ cho một lô người nhận khác là
  cách chắc chắn nhất để gửi nhầm. Bản demo đã làm đúng chỗ này, giữ nguyên.
- **Đừng tin danh sách client.** Máy chủ chạy lại preflight; số ở bước 4 chỉ là
  ước lượng, con số thật nằm trong `MasSendResponse.queued`.

### C3 · Nối ba chỗ gọi

| Màn                         | Chỗ                            | Ghi chú                                                                 |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `pages/leads.tsx`           | thay `QuickMailDialog`         | chế độ chọn + checkbox **đã có sẵn**, chỉ đổi component                 |
| `pages/lead-detail.tsx`     | `ToolsBar`, cạnh nút "Gọi"     | lô một người; gác bằng `lead.email` như nút "Gọi" gác bằng `lead.phone` |
| `pages/campaign-detail.tsx` | nút "Thêm đợt vào chuỗi" đã có | mode campaign — chờ **A3**                                              |

Bọc nút bằng `Can` (`app/auth/guard.tsx`), **không** bằng `useCan` — `useCan`
hiện không có call site nào trong repo, và `can.ts` tự ghi rõ ẩn nút không phải
phân quyền. Hàng rào thật là `requireAccess` trong `app/api/client.ts`.

### C4 · `MailTimelineCard` ở chi tiết lead

Cột phụ (1fr) hiện có ba thẻ: `OriginCard` → `PeopleCard` → `ActivityCard`. Chèn
thẻ mới **trước** `ActivityCard` — nó cụ thể hơn, `ActivityCard` là dòng chảy
chung. Dựng bằng `Timeline` (M-10, đã có), mỗi mốc là **một `mail_run`**.

Map trạng thái sang `StatusDotState` có sẵn: `ok` (đã mở/click) · `current` (đã
tới) · `next` (đang xếp hàng) · `bad` (bounce/failed) · `warning` (bị chặn).

**Chữ trên màn phải trung thực.** Không bao giờ viết "chưa đọc" — viết **"chưa
có tín hiệu mở"**. Lý do dài ở docblock `mail_event` trong `mail.schema.ts`:
Apple Mail Privacy Protection tự tải ảnh nên đếm dư, Gmail cache ảnh nên giấu
lần mở sau, ai tắt ảnh thì đọc mà không đếm. `openCount` là **sàn dưới có
nhiễu**; `clickCount` mới là thứ đáng tin.

### C5 · `Stepper` + trang kit chưa commit

`packages/ui/src/patterns/stepper.tsx` (M-14) đã dựng và đã có mục trên trang
kit, nhưng **để ngoài commit `ced17a7`** vì trang kit đang bị phiên song song
sửa cùng lúc (refactor icon). Commit cùng lượt FE.

### C6 · Nhân tiện: `leads.tsx` nuốt lỗi mạng

`fix-later.md` mục 2. Tắt máy chủ thì màn hiện "Không có lead nào khớp bộ lọc"
kèm nút "Bỏ hết bộ lọc", console sạch trơn — người dùng sẽ đi sửa bộ lọc cho
một sự cố hạ tầng. Sửa lúc động vào file này thì gần như miễn phí.

---

## D · VẬN HÀNH · quyết định còn treo

### D1 · Ba biến bắt buộc còn rỗng

`env.ts` sẽ **chặn boot** nếu bật `PV_MAS_ENABLED=true` mà thiếu:

```bash
PV_UNSUBSCRIBE_SECRET=$(openssl rand -hex 32)
PV_API_PUBLIC_URL="https://<host API thật>"     # KHÔNG phải host web
PV_MAS_SENDER_POSTAL="Pebble Vina · <địa chỉ đầy đủ>"
```

`PV_API_PUBLIC_URL` phải là host **API**: một-chạm huỷ đăng ký là `POST` của
máy, không có session, không có trình duyệt. Trỏ nhầm sang web là mọi lượt huỷ
chết lặng — và người nhận tưởng đã thoát sẽ báo spam lá thư sau.

`PV_EMAIL_MAS_FROM` cũng đang rỗng. Quy cách đầy đủ nằm trong khối bình luận ở
`apps/api/.env`.

### D2 · "Chiến dịch" đang là hai thứ khác nhau

Màn `/campaigns` đứng trên **SOURCE** (mã `SR-`/`SK-`, fixture đóng băng). Bảng
`sales.campaign` mới dùng mã `CP-`. Hai khái niệm cùng gọi một tên trên giao
diện.

Phải chốt trước khi dựng FE cho yêu cầu 3: hợp nhất chúng, hay giữ hai thứ và
đặt lại tên một cái. Đây **không phải việc FE** — đổi ở màn trước khi chốt mô
hình là dựng lại hai lần.

### D3 · Subdomain marketing chưa có

`go.pebblevina.com` (hoặc `mas.`) chưa verify trên Resend. Lô canary 28/08 đi
nhờ `notify.pebblevina.com` — **chấp nhận được cho 4 địa chỉ của chính mình,
không chấp nhận được cho một đợt thật**: một lần complaint cao trên subdomain
đó sẽ kéo theo mail báo lead mới.

### D4 · Nguồn nào tính là "đã đồng ý"

Chưa quyết. Hôm nay `APOLLO` chỉ bị **cảnh báo**, không bị chặn — quyết định có
ý thức của chủ dự án, ghi ở `ban-giao-mas-mail.md`. Nhưng `LANDING_PAGE` cũng
chưa chắc: khách điền form liên hệ đồng ý _được trả lời_, chưa đồng ý _nhận
chuỗi marketing_. Muốn chặt thì form cần ô tick riêng, và `IMPORT` cần một cột
`consent_at` do người nạp khai — máy không phân biệt được file hội thảo với file
mua.

### D5 · Tài khoản Resend thứ hai

`PV_MAS_RESEND_API_KEY` đã để sẵn chỗ (xem **A6** — nó chưa được đọc). Chế tài
của Resend là khoá **cấp tài khoản**: tách domain cứu reputation, chỉ tài khoản
thứ hai mới cứu được đường transactional khỏi một lệnh khoá.

### D6 · Webhook chưa nhận được gì trên production

Cần `RESEND_WEBHOOK_SECRET` trong `fly secrets` **và** khai endpoint trên
dashboard Resend. Chưa có thì `mail_event` mãi rỗng, và toàn bộ yêu cầu 4 không
có dữ liệu dù code đã sẵn.

---

## Thứ tự chặn nhau

```
A2 nội dung mẫu ──┐
                  ├──> FE C1+C2+C3 (gửi nhanh)  ── yêu cầu 1 · 2
A1 endpoint ──────┴──> FE C4 (timeline)         ── yêu cầu 4
                              ▲
                              │ cần D6 mới có dữ liệu mở/click thật
D2 chốt mô hình ──> A3 cửa chiến dịch ──> FE chuỗi đợt ── yêu cầu 3

B1 migrate Neon ──> D1 khai biến ──> D3 subdomain ──> canary lô THẬT 20–30 địa chỉ
```

Canary của MAS **khác** canary của transactional: gửi vào hộp thư của chính mình
không đủ, vì thứ cần đo là **bounce rate trên địa chỉ thật**. Lô đầu 20–30 địa
chỉ, xem số, rồi mới mở lô lớn — trần Resend là bounce 4% và complaint 0,08%,
vượt là khoá tài khoản không báo trước.

---

## Đường ngắn nhất tới "dùng được"

Nếu chỉ muốn Sale gửi được mail cho lead mình giữ và xem được kết quả — **bỏ
hẳn yêu cầu 3** khỏi lượt này:

1. **A2** nạp một mẫu (cần nội dung từ chủ dự án)
2. **A1** endpoint timeline
3. **C1 + C2 + C3** hai chỗ gọi (Sổ lead, chi tiết lead) — bỏ chỗ thứ ba
4. **C4** timeline
5. **B1 + D1** migrate Neon, khai ba biến
6. Lô canary thật

Yêu cầu 3 tách ra lượt riêng, sau khi **D2** có câu trả lời.
