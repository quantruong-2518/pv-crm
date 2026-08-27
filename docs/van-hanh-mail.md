# Vận hành — gửi email khi có lead mới

Lát cắt **27/08/2026**, nhánh `develop`. Phase 1: **một** email nội bộ khi
`POST /sales/leads/intake` nhận được lead thật. Chưa có email cho khách, chưa
có chiến dịch.

Tiếp nối [`ban-giao-db.md`](./ban-giao-db.md) — cụm B của bảng "chưa dựng" đã
dựng một phần: sổ gửi có rồi, `campaign*` thì chưa.

---

## Đường đi của một lá thư

```
landing page ──POST /sales/leads/intake──> MỘT transaction:
                                             platform.object          (dòng gương)
                                             sales.lead               (lead thật)
                                             sales.lead_intake        (vết nộp)
                                             platform.email_delivery  (state=pending)
                                           └─ commit ──> HTTP 202 ngay
                                                             │
   worker · mỗi PV_QUEUE_POLL_SECONDS ── MailRelay quét dòng `pending` đến hạn
                                                             │
                                              pg-boss job (email.transactional)
                                                             │
     MailConsumer: claim → cổng nhịp → suppression → dựng thân → gửi
                                                             │
                                    Resend ──> provider_email_id ──> state=accepted
                                                             │
   POST /integrations/resend/webhooks ◄── svix ─── delivered · bounced · complained
                                                             │
                                    state tiến lên · suppression · (sau này) touch
```

**Tiến trình HTTP không chạm pg-boss.** Nhánh chỉ ghi một dòng sổ trong chính
transaction của nó; worker là nơi duy nhất có instance hàng đợi. Đổi lại độ trễ
bằng đúng một vòng poll — và mọi kiểu hỏng (hàng đợi chết, job mất, máy tắt
giữa chừng) đều tự lành, vì dòng vẫn `pending` và vòng quét sau nhặt lại.

---

## Ba lớp chống trùng

| Lớp           | Cơ chế                                                                        | Chặn được gì                                                        |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1 · Postgres  | `UNIQUE(event_key)` · `UNIQUE(idempotency_key)` · `UNIQUE(provider_email_id)` | Nộp form hai lần · relay quét trùng · webhook replay                |
| 2 · `claim()` | `UPDATE … WHERE state IN ('pending','delayed')`                               | Job bị giao lại sau khi worker chết — kẻ thua claim trượt, thoát êm |
| 3 · Resend    | `Idempotency-Key = event_key`, hiệu lực **24 giờ**                            | Worker chết SAU khi Resend nhận, TRƯỚC khi sổ kịp ghi               |

`event_key` dạng `lead-intake/internal/v1/LD-0201` — `<luồng>/<người nhận>/v<n>/<mã>`.

Quá 24 giờ thì cửa sổ của Resend đã đóng: dòng chuyển `dead`, **không tự thử
lại**. Người vận hành xem rồi mới quyết định.

---

## 15 case nghiệm thu — cách kiểm tay

Không có file test nào cho tính năng này (luật của repo). Đây là thứ thay thế.

### Dựng một database dùng một lần

```bash
cd apps/api
SCRATCH=/tmp/pv-mail-check && rm -rf $SCRATCH
DATABASE_URL="pglite://$SCRATCH" npx drizzle-kit migrate
```

`.env` đang trỏ **thẳng Neon production** — mọi lệnh dưới đây đều khai
`DATABASE_URL` inline. Bỏ sót một lần là ghi vào dữ liệu thật.

### Chạy máy chủ và worker

Hai lệnh, hai cửa sổ. Trên PGlite phải chạy **lần lượt** (một kết nối tại một
thời điểm); trên Postgres/Neon thì chạy song song được.

```bash
COMMON='NODE_ENV=development PV_INTAKE_LANDING_PAGES=lien-he
        PV_LEAD_NOTIFICATION_TO=contact@pebblevina.com PV_EMAIL_ENABLED=false'

# cửa sổ 1 — HTTP
env $COMMON DATABASE_URL="pglite://$SCRATCH" PORT=4223 \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts

# cửa sổ 2 — worker
env $COMMON DATABASE_URL="pglite://$SCRATCH" PV_QUEUE_POLL_SECONDS=3 \
  node -r ts-node/register -r tsconfig-paths/register src/worker.ts
```

`PV_EMAIL_ENABLED=false` cho driver console: đi hết đường ống, dừng đúng một
tấc trước khi rời khỏi máy.

### Bảng case

| #   | Case                               | Cách bắn                                    | Phải thấy                                                                   |
| --- | ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Lead mới → 202 ngay, đúng một mail | `curl` bên dưới                             | `{"accepted":true}` · sổ có **1** dòng · worker in **1** dòng `[console]`   |
| 2   | Resend chậm/chết → intake vẫn 202  | rút mạng rồi bắn                            | 202 như thường · dòng vẫn `pending`, `attempt_count` tăng dần               |
| 3   | Email trùng → KHÔNG mail mới       | bắn lại cùng `email`                        | `lead_intake.status='duplicate'` · sổ gửi **vẫn 1 dòng**                    |
| 4   | Honeypot → không mail              | `"website":"http://spam.io"`                | `status='honeypot'` · không dòng sổ nào                                     |
| 5   | Worker chết trước khi gọi Resend   | `kill -9` lúc đang chạy                     | job được giao lại, mail vẫn đi đúng một lần                                 |
| 6   | Worker chết SAU khi Resend nhận    | `kill -9` giữa `send` và `markAccepted`     | retry cùng `Idempotency-Key` → Resend trả kết quả cũ, **không** thư thứ hai |
| 7   | 429 → tôn trọng `Retry-After`      | ép `PV_EMAIL_RATE_PER_SECOND=1` rồi bắn dồn | log cổng đóng; không job nào gọi Resend trong khoảng đó                     |
| 8   | 400/401/403/422 → không thử mãi    | đặt `RESEND_API_KEY` sai                    | `state='failed_permanent'`, `attempt_count` **không** tăng tiếp             |
| 9   | Webhook sai chữ ký                 | `curl` không header svix                    | **401**, `platform.email_webhook_event` không có dòng                       |
| 10  | Webhook trùng `svix-id`            | gửi lại đúng payload cũ                     | lần hai `ignored-duplicate`, trạng thái không đổi                           |
| 11  | Bounce/complaint → suppress        | webhook `email.bounced` type `Permanent`    | `platform.email_suppression` có địa chỉ đó                                  |
| 12  | Backlog không làm chậm intake      | bắn 100 lead rồi đo `/healthz`              | thời gian trả lời không đổi — HTTP không chạm hàng đợi                      |
| 13  | DNS                                | `dig`, xem mục dưới                         | SPF · DKIM · DMARC đều trả bản ghi                                          |
| 14  | Worker restart không mất job       | `fly apps restart`                          | dòng `pending` được vòng quét sau nhặt lại                                  |
| 15  | Replay dead-letter có kiểm soát    | xem mục "Khi có dòng `dead`"                | đúng một mail đi ra, sau khi người xem xong                                 |

Câu `curl` của case 1 — chú ý `from` là **query**, không phải body:

```bash
curl -s -X POST 'http://127.0.0.1:4223/sales/leads/intake?from=landingpage&landingPage=lien-he&utm_source=google' \
  -H 'Content-Type: application/json' \
  -d '{"company":"Công ty A","contactName":"Nguyễn Văn A","email":"a@x.vn","website":""}'
```

Xem sổ bất cứ lúc nào:

```bash
curl -s http://127.0.0.1:4223/healthz/email
# {"status":"ok","ledger":true,"pending":0,"dead":0,"oldestPendingSeconds":null}
```

### Đã chạy thật ngày 27/08 — kết quả

**Trên PGlite** (bàn thử, một kết nối nên API và worker chạy lần lượt) —
case 1 · 3 · 4 · 9:

```
[queue] pg-boss lên · vai worker · driver pglite · notify
[queue] Relay: 1 thư vào hàng đợi.
[mail]  [console] → contact@pebblevina.com · "Lead landing page mới · Công ty TNHH Gạch Ống Sông Hồng · Nguyễn Văn A"
```

Sổ sau đó: **một** dòng `accepted`, `attempt_count=1`; ba lượt nộp
(`accepted`/`duplicate`/`honeypot`) nhưng chỉ một dòng gửi; webhook không chữ
ký trả **401** và không để lại vết. Relay quét sáu vòng, enqueue đúng một lần.

**Trên Neon** — nơi sản phẩm thật chạy. Branch `mail-check-2708`
(`br-misty-recipe-azaep7rd`, tự hết hạn 29/08), `NODE_ENV=production`, API và
worker chạy **song song**, API đi **pooled** còn worker đi **direct**:

```
[db]    Driver: postgres
[queue] pg-boss lên · vai worker · driver postgres · notify
[worker] Worker đã lên · email.transactional · 2 luồng · poll 5s · gửi thật: tắt
[queue] Relay: 1 thư vào hàng đợi.
[mail]  [console] → contact@pebblevina.com · "Lead landing page mới · Kiểm thử Neon · Trần Văn Kiểm"
```

`platform.email_delivery` trên Neon: một dòng `accepted`, `attempt_count=1`,
có `provider_email_id`. Bốn bảng mới (`email_delivery` · `email_suppression` ·
`email_webhook_event` · `mail_gate`) và schema `pgboss` do worker tự dựng.

Ba điều chỉ Neon mới trả lời được, nay đã có câu trả lời:

- **pooled cho API, direct cho worker chạy được cùng lúc**, đúng như
  `PV_QUEUE_DATABASE_URL` sinh ra để làm.
- **pg-boss tự cài schema `pgboss`** qua direct endpoint, không cần bước tay.
- **`NODE_ENV=production` bắt buộc header `fly-client-ip`** — `lead-intake.guard.ts`
  từ chối bằng 500 nếu thiếu. Fly Proxy đặt header đó; gõ `curl` thẳng vào máy
  thì phải tự thêm:

  ```bash
  curl … -H 'fly-client-ip: 203.0.113.44' -H 'Origin: https://…'
  ```

**Chưa chạy trên branch chính.** Migration `0005`/`0006` mới nằm ở branch kiểm
thử; production còn chờ `pnpm db:migrate` với `DATABASE_URL` thật.

---

## Trước khi bật `PV_EMAIL_ENABLED=true`

### DNS — kiểm bằng `dig`, đừng tin dashboard

```bash
dig +short TXT notify.pebblevina.com                      # SPF: v=spf1 include:… ~all
dig +short TXT resend._domainkey.notify.pebblevina.com    # DKIM
dig +short TXT _dmarc.pebblevina.com                      # DMARC: p=none → quarantine → reject
```

Ba luật: **một** bản ghi SPF cho mỗi hostname (đã có thì merge, đừng thêm cái
thứ hai); DMARC nâng dần, chỉ nâng khi alignment đã ổn; và Postmaster Tools
phải có **cả** `pebblevina.com` lẫn `notify.pebblevina.com` — spam rate giữ
dưới 0,10%, chạm 0,30% là hỏng.

### Secret trên Fly

```bash
fly secrets set --app pvone-crm-api \
  RESEND_API_KEY=re_xxx RESEND_WEBHOOK_SECRET=whsec_xxx
```

Địa chỉ và các trần thì để `[env]` trong `fly.toml` — ai đọc repo cũng nên
thấy. Chỉ hai khoá trên là secret thật.

### Canary

Bật cờ, bắn **một** lead thật vào hộp thư của chính mình, xem đủ bốn thứ: mail
tới, `state='delivered'`, webhook có dòng, và `/healthz/email` sạch. Rồi mới mở
cho landing page thật.

---

## Khi có dòng `dead`

```sql
SELECT event_key, recipient, attempt_count, last_error_code, last_error_summary
FROM platform.email_delivery WHERE state = 'dead' ORDER BY updated_at DESC;
```

Đọc `last_error_code` trước. Nếu là lỗi cấu hình (`401`, `403`, sai domain) thì
sửa cấu hình rồi mới thả. Thả bằng cách đưa dòng về `pending`:

```sql
UPDATE platform.email_delivery
SET state = 'pending', next_attempt_at = NULL, attempt_count = 0
WHERE event_key = 'lead-intake/internal/v1/LD-0233';
```

Vòng quét sau nhặt nó. **Cẩn thận với dòng quá 24 giờ:** cửa sổ idempotency của
Resend đã đóng, nên nếu lần trước Resend đã thật sự nhận thư thì thả lại là gửi
lần hai. Kiểm `provider_email_id` trước — có giá trị nghĩa là thư đã đi.

Địa chỉ bị chặn nhầm:

```sql
UPDATE platform.email_suppression SET released_at = now() WHERE recipient = 'a@x.vn';
```

Đừng thả một địa chỉ hard-bounce rồi gửi lại — bounce lặp là thứ làm xấu
reputation nhanh nhất.

---

## Nợ đã biết

1. **Không có reaper cho dòng kẹt `sending`.** Worker bị `kill -9` giữa chừng
   để lại dòng ở `sending`; `claim()` chỉ nhận `pending`/`delayed` nên dòng đó
   không ai nhặt nữa. `expireInSeconds=60` trả job về cho pg-boss, nhưng sổ mới
   là nguồn sự thật. Cần một câu quét dòng `sending` cũ hơn 5 phút đưa về
   `pending`.
2. **`markSuppressed(id, reason)` chưa trung thực** — `isSuppressed()` trả
   boolean, không mang theo lý do, nên worker ghi `'manual'`. Sửa là đổi
   `isSuppressed` trả lý do.
3. **Cửa webhook dựng client Resend bằng khoá giả** (`'resend-verify-only'`)
   khi máy chưa có khoá thật — `verify` là HMAC thuần, không đọc khoá, nên vẫn
   đúng. Sạch hơn thì thêm `standardwebhooks` làm dependency và gọi thẳng.
4. **`QueueModule.forSender()` chưa ai dùng.** Giữ lại cho ngày cần job ngay
   khi request commit, kèm cái giá đã ghi trong docblock của nó.
5. **Chưa có metrics.** 12 chỉ số và 7 alert trong bản yêu cầu chưa dựng —
   `/healthz/email` cộng vài câu SQL trên đây là mức hiện có.
6. **Mật khẩu role Neon lại đi qua một phiên chat** ngày 27/08, cùng loại nợ
   với mục 7 của [`ban-giao-db.md`](./ban-giao-db.md). Nếu cần chặt chẽ: reset
   mật khẩu `neondb_owner` trên console rồi cập nhật `apps/api/.env` và
   `fly secrets`.
7. **Phase 2 (mail xác nhận cho khách) chưa làm.** Khi làm: đó là mail
   transactional, không cần one-click unsubscribe, nhưng **không được** tự đưa
   địa chỉ vào chuỗi marketing nếu chưa có consent riêng.
