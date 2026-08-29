# Bàn giao — cửa gửi email

Lát cắt **27/08/2026**, nhánh `develop`. Tiếp nối
[`ban-giao-db.md`](./ban-giao-db.md): file đó vẽ cụm B ("MAS mail") ở dạng kế
hoạch, file này ghi phần **đã dựng thật** — đường ống giao dịch, một mail nội
bộ khi landing page nhận được lead.

Cách kiểm tay và cách xử lý khi hỏng nằm ở [`van-hanh-mail.md`](./van-hanh-mail.md).
File này trả lời câu **vì sao nó có hình dạng này**.

---

## Phạm vi — một lá thư, không hơn

Phase 1 làm đúng một việc: `POST /sales/leads/intake` nhận lead thật thì bộ
phận sales được báo bằng email. **Không** gửi khi trùng email, khi dính
honeypot, hay khi transaction hỏng.

Chưa làm: mail xác nhận cho khách (phase 2), và toàn bộ cụm chiến dịch
(`campaign` · `campaign_member` · `mail_template` · `campaign_run`). Sổ gửi
dựng sẵn cho cả hai — xem quyết định #1.

---

## Luồng

```
landing page ──POST /sales/leads/intake──> MỘT transaction:
                                             platform.object          dòng gương
                                             sales.lead               lead thật
                                             sales.lead_intake        vết nộp
                                             platform.email_delivery  state=pending
                                           └─ commit ──> HTTP 202 ngay
                                                             │
     worker · mỗi PV_QUEUE_POLL_SECONDS ─── MailRelay quét dòng `pending` đến hạn
                                                             │
                                               pg-boss · email.transactional
                                                             │
       MailConsumer: claim → cổng nhịp → suppression → dựng thân → gửi
                                                             │
                                     Resend ──> provider_email_id ──> accepted
                                                             │
     POST /integrations/resend/webhooks ◄── svix ── delivered · bounced · complained
```

Nhánh Sales **phát sự kiện**, không chọn kênh và không gọi provider. Tiến trình
HTTP **không chạm pg-boss**.

---

## Bảy quyết định đã chốt

| #   | Quyết định                                                         | Lý do                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Một** bảng `platform.email_delivery`, không tách outbox/delivery | Sổ gửi dùng chung cho cả giao dịch lẫn MAS. `campaign_run_id` để sẵn, nullable. Hai bảng nhật ký gửi là hai chỗ trả lời cùng một câu, và có ngày lệch                                         |
| 2   | **Sổ gửi LÀ outbox**; relay trong worker biến dòng thành job       | Đưa pg-boss vào tiến trình HTTP là một kết nối thường trực mỗi máy API — trên Neon đó là compute không bao giờ ngủ. Và chiều phụ thuộc sẽ ngược: nhánh cần hàng đợi, hàng đợi cần module mail |
| 3   | **Poll 12s** (`PV_QUEUE_POLL_SECONDS`)                             | Chủ dự án chọn chịu trễ để bớt truy vấn. Đây là một khoản tiền, không chỉ là độ trễ                                                                                                           |
| 4   | **E4 thành bộ quyết định thuần** — `plan()` thay `emit()`          | Nhật ký chống trùng trong RAM chết theo tiến trình và hai máy là hai bản. Chống trùng chuyển xuống `UNIQUE(event_key)`, nơi nó giữ được                                                       |
| 5   | **Template ở package riêng `@pv/mail-templates`**                  | `eslint.config.js` khối 3b cấm `apps/api` import react. Package riêng giữ nguyên luật đó; máy chủ chỉ gọi một hàm thuần                                                                       |
| 6   | **Nhánh cấp hộp thư, E4 giữ kênh + template**                      | Engine không được đọc env, mà hộp thư là dữ liệu triển khai: staging và production chạy cùng bảng luật trên hai địa chỉ                                                                       |
| 7   | **Không file test; runbook thay thế**                              | Luật của repo, và chủ dự án chốt kiểm tay. 15 case nằm ở `van-hanh-mail.md`                                                                                                                   |

---

## Đã dựng

```
packages/mail-templates/         MỚI — chỗ duy nhất ở tầng máy chủ biết React
  src/lead-intake-internal.tsx   thân mail, màu lấy từ @pv/tokens
  src/index.ts                   renderLeadIntakeInternal → {subject, html, text}

packages/engines/src/
  e4-notifications.ts            VIẾT LẠI — plan(event) → NotificationIntent[]

apps/api/src/platform/mail/
  mail.contract.ts               hợp đồng chung: MailState + rank, MailPort,
                                 MailLedger, MailIntent, tên hàng đợi
  mail.schema.ts                 email_delivery · email_suppression · email_webhook_event
  mail.repository.ts             MailRepository implements MailLedger
  resend.driver.ts               MailPort thật + bảng phân loại lỗi
  console.driver.ts              MailPort khi PV_EMAIL_ENABLED=false
  mail-webhook.controller.ts     cửa svix + GET /healthz/email
  mail.module.ts                 ba token: MAIL_ENQUEUE · MAIL_LEDGER · MAIL_PORT

apps/api/src/platform/queue/
  boss.provider.ts               BOSS · vai sender/worker · chọn kết nối
  queue.module.ts                forSender() / forWorker({ imports })
  mail-relay.ts                  dòng `pending` → job
  mail.consumer.ts               chín bước, thứ tự là toàn bộ tính đúng đắn
  mail-queue.ts                  chỗ DUY NHẤT gọi boss.send
  mail-rate.ts                   cổng nhịp dùng chung qua Postgres + park hàng đợi
  mail-composer.ts               interface + MAIL_COMPOSER
  queue.schema.ts                platform.mail_gate

apps/api/src/branches/sales/lead/
  lead-mail.composer.ts          MỚI — dựng thân mail từ bảng của nhánh
  lead-intake.service.ts         notify() TRONG transaction
  lead-intake.repository.ts      + profileFor(leadCode)

drizzle/0005_empty_patriot.sql   ba bảng mail
drizzle/0006_black_lizard.sql    mail_gate
```

Sửa thêm: `env.ts` (+14 biến, 4 refine hỏng-sớm) · `.env.example` · `main.ts`
(`rawBody: true`) · `app.module.ts` · `worker.ts` · bốn tsconfig ·
`eslint.config.js` · `apps/api/package.json`.

---

## Ba lớp chống trùng

| Lớp           | Cơ chế                                                                        | Chặn được gì                                          |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1 · Postgres  | `UNIQUE(event_key)` · `UNIQUE(idempotency_key)` · `UNIQUE(provider_email_id)` | Nộp form hai lần · relay quét trùng · webhook replay  |
| 2 · `claim()` | `UPDATE … WHERE state IN ('pending','delayed')`                               | Job bị giao lại sau khi worker chết                   |
| 3 · Resend    | `Idempotency-Key = event_key`, hiệu lực 24 giờ                                | Worker chết SAU khi Resend nhận, TRƯỚC khi sổ kịp ghi |

`event_key` = `<luồng>/<người nhận>/v<n>/<mã>`, ví dụ
`lead-intake/internal/v1/LD-0233`. Một chuỗi, ba tầng dùng lại — và đó là lý do
nó không được sinh ở nơi nào khác ngoài `plan()`.

Trạng thái chỉ **tiến**, không lùi: `advances()` trong hợp đồng so rank trước
khi ghi, nên một `email.sent` phát lại sau `email.delivered` không kéo được
dòng về sau.

---

## Đã kiểm bằng gì

**Trên PGlite** — case 1 · 3 · 4 · 9. Ba lượt nộp (`accepted` · `duplicate` ·
`honeypot`) cho ra **một** dòng sổ; webhook không chữ ký trả 401 và không để
lại vết; relay quét sáu vòng, enqueue đúng một lần.

**Trên Neon**, branch `mail-check-2708` (`br-misty-recipe-azaep7rd`, tự hết hạn
29/08), `NODE_ENV=production`, API và worker chạy **song song**, API đi pooled
còn worker đi direct:

```
[db]     Driver: postgres
[queue]  pg-boss lên · vai worker · driver postgres · notify
[queue]  Relay: 1 thư vào hàng đợi.
[mail]   [console] → contact@pebblevina.com · "Lead landing page mới · Kiểm thử Neon · Trần Văn Kiểm"
```

Ba câu chỉ Neon trả lời được, nay đã có đáp án: **pooled cho API + direct cho
worker chạy được cùng lúc**; **pg-boss tự cài schema `pgboss`** qua direct,
không cần bước tay lúc deploy; và **`NODE_ENV=production` bắt buộc header
`fly-client-ip`** (`lead-intake.guard.ts:143`), thứ Fly Proxy đặt và `curl`
thẳng thì không có.

Chưa kiểm: case 5 · 6 · 7 · 8 · 10 · 11 (crash giữa chừng, 429, lỗi vĩnh viễn,
webhook có chữ ký thật) — chúng cần khoá Resend thật. `pnpm check` xanh toàn bộ.

---

## Tám ma sát đã vấp — đừng vấp lại

1. **`sql.raw` cho CHECK nhiều giá trị.** Nội suy chuỗi thường trong drizzle
   thành **tham số truy vấn**, nên migration sinh ra `CHECK (state IN ($1,…))`
   — SQL không chạy được ngoài prepared statement. Theo mẫu `noBlank` trong
   `lead.schema.ts`.
2. **pg-boss v12 là ESM-only.** `require()` được nhờ Node ≥ 22.12, mức repo đã
   yêu cầu sẵn. Bản build không dính; đường dev qua ts-node là chỗ cần thử
   trước.
3. **`ts-node.moduleTypes` phải phủ CẢ `@pv/tokens`.** Template đọc bảng màu từ
   đó, và thiếu dòng ấy thì `pnpm dev` vỡ `ERR_REQUIRE_ESM` ngay lần render đầu
   — bản build vẫn xanh, nên nó chỉ hiện ra lúc chạy.
4. **SDK Resend không bao giờ `throw`.** Mọi lỗi mạng, timeout và HTTP không-2xx
   đều thành `{ data: null, error }`, riêng ca không có phản hồi thì
   `statusCode: null`. Bộ phân loại lỗi viết theo sự thật đó, không theo
   `try/catch`.
5. **`@react-email/render` tự VIẾT HOA `<h1>/<h2>`** khi dựng bản plain-text —
   đúng thứ "chữ in hoa nhồi" mà luật nội dung cấm. Dùng `<Text>` có style.
   Cũng vậy: `display:block` sập thành `"Công tyCông ty TNHH…"` ở bản text, vì
   bản text dựng theo thẻ chứ không theo CSS.
6. **`updateQueue` ném lỗi nếu payload có khoá `policy`**, mà kiểu lại cho qua.
   Tách `policy` ra, chỉ truyền lúc `createQueue`. Dead-letter queue phải được
   tạo **trước** hàng đợi trỏ vào nó.
7. **`boss.on(...)` không typecheck ở repo này** (`EventEmitter` có kiểu là
   default export của `node:events`, mà repo không bật `esModuleInterop`). Đi
   qua `NodeJS.EventEmitter`. Thiếu listener `error` thì một trục trặc nền giết
   cả worker.
8. **Raw body cho webhook: dùng `NestFactory.create(…, { rawBody: true })`**,
   đừng tự `addContentTypeParser` — parser của Fastify là toàn cục, scope theo
   path sẽ phá mọi route khác.

---

## Biên giới: giữ được gì, nới chỗ nào

Giữ nguyên: `platform/` không import `branches/` · engine không I/O ·
repository không quyết định · `apps/api` không biết React · nhánh phát sự kiện
chứ không chọn kênh.

Nới đúng **một** chỗ, có ghi lý do tại chỗ: `tsconfig.api.json` bật `jsx` cho
riêng `packages/mail-templates`. Nó không kéo DOM vào — `lib` vẫn là `ES2022`.

Chỗ chiều phụ thuộc chạy ngược, và vì sao: **`MAIL_COMPOSER` do nhánh Sales
cung cấp**. Dựng thân mail phải đọc `sales.lead` và `sales.lead_intake`, mà
platform không được biết bảng của nhánh — nên worker hỏi qua token và không bao
giờ biết nhánh nào trả lời. Hôm nay đúng một composer; nhánh thứ hai cần
template sẽ biến chỗ này thành registry theo `delivery.template`.

---

## Nợ đang có

Danh sách đầy đủ kèm cách xử lý ở
[`van-hanh-mail.md`](./van-hanh-mail.md#nợ-đã-biết). Ba cái nặng nhất:

1. **Không có reaper cho dòng kẹt `sending`.** Worker bị `kill -9` giữa chừng
   để lại dòng ở `sending`, mà `claim()` chỉ nhận `pending`/`delayed` — nên
   không ai nhặt nữa. Cần một câu quét dòng `sending` cũ hơn 5 phút.
2. **Chưa có metrics.** 12 chỉ số và 7 alert trong bản yêu cầu chưa dựng;
   `/healthz/email` cộng vài câu SQL là mức hiện có.
3. **Mật khẩu role Neon lại đi qua một phiên chat** ngày 27/08 — cùng loại nợ
   với mục 7 của `ban-giao-db.md`.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
db:migrate lên branch CHÍNH ──> deploy Fly (hai process đã có sẵn trong fly.toml)
        │                              │
        └── DNS: SPF · DKIM · DMARC ───┤
                                       ▼
                        canary: MỘT lead thật vào hộp thư của chính mình
                                       │
                        PV_EMAIL_ENABLED=true cho landing page thật
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
              reaper `sending`                     phase 2 · mail cho khách
                    │                                     │
                    └──────────> touch + suppression ─────┴──> cụm chiến dịch (MAS)
```

1. **`pnpm db:migrate` lên branch chính.** `0005`/`0006` mới chỉ nằm ở branch
   kiểm thử. Chỉ `CREATE TABLE`, không đụng bảng đang có.
2. **Deploy.** `fly.toml` đã có process group `worker`; chưa từng chạy thật.
3. **Canary rồi mới bật cờ.** Thứ tự ở `van-hanh-mail.md`.
4. **Trả nợ reaper** trước khi lưu lượng thật đủ lớn để một dòng kẹt biến thành
   một lead không ai được báo.
5. **`touch` + `suppression` đã có nửa sau** — bảng suppression dựng rồi, còn
   `touch` thì chưa. Đó là chỗ nối sang cụm chiến dịch mà `ban-giao-db.md` đã
   vẽ, và cũng là lúc `lead.score`/`last_touch_at` hết là `0`/`NULL`.

FE của cụm chiến dịch đã có một bản demo (Quick MAS ở Sổ lead, 28/08) trước cả
DB; cửa gửi thật dựng xong ngay sau đó:
[`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md).
