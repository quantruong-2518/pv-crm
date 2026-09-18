# Runbook — giảm Neon CU mà không làm hỏng worker và tác vụ theo lịch

Ngày rà soát: 18/09/2026.

Runbook này xử lý ba vấn đề đang đi cùng nhau:

1. worker hỏi Neon mỗi 4 giây dù không có việc;
2. Fly gọi `/healthz` mỗi 15 giây và endpoint này chạy `SELECT 1`, vì vậy
   riêng health check đã đủ giữ compute thức;
3. khi Neon từ chối kết nối vì quota, worker thoát 10 lần rồi nằm `stopped`,
   trong khi health check vẫn trả HTTP 200 và Fly tiếp tục báo xanh.

Mục tiêu không phải là giảm query bằng mọi giá. Sau thay đổi, các bất biến sau
phải còn nguyên:

- `platform.email_delivery` vẫn là outbox và nguồn sự thật;
- `event_key`, `idempotency_key` và `provider_email_id` vẫn chống gửi trùng;
- một lỗi DB/queue không làm mất mail: repair pass phải nhặt lại được;
- mail hẹn giờ, đóng `mail_run`, đóng campaign và cầu dao bounce vẫn chạy;
- HTTP API và worker vẫn là hai process của cùng modular monolith;
- không đưa tiến trình nghiệp vụ vào browser polling;
- không xoá ledger hay job để “làm sạch” backlog.

## Quyết định vận hành trước khi sửa

Có hai profile hợp lệ. Không được trộn nửa profile này với nửa profile kia.

### Profile A — production cân bằng, khuyến nghị

- Neon Launch, compute `0.25–1 CU` lúc đầu.
- Không scale-to-zero cho production endpoint.
- Một worker active, một standby dừng.
- Fast path bằng `LISTEN/NOTIFY`; poll chỉ là repair/backstop.
- API dùng pooled endpoint; queue dùng direct endpoint.

Profile này giữ mail và tác vụ theo lịch dưới một phút kể cả khi không có request
HTTP. Ở 0,25 CU chạy 24/7, ngân sách compute khoảng `180 CU-hours/tháng`, tương
đương khoảng `$19,08/tháng` theo đơn giá Launch `$0,106/CU-hour`. DB hiện chỉ
khoảng 12,2 MB nên storage gần như bằng không.

Đây là lựa chọn mặc định cho production. Chi phí khoảng 19 USD/tháng là giá của
việc có một scheduler/queue luôn sẵn sàng, không phải lỗi cần né bằng một cơ chế
khó phục hồi hơn.

### Profile B — ưu tiên Free quota/scale-to-zero

Chỉ chọn khi business chấp nhận cold start và đã có **tác nhân bên ngoài Neon**
đánh thức công việc:

- API liveness tuyệt đối không chạm DB;
- không giữ `LISTEN`, logical replication hoặc heartbeat DB dài hạn;
- tác vụ tức thời phải được đánh thức bằng external queue hoặc một lời gọi đã ký;
- tác vụ repair chạy bằng Fly Cron Manager/one-off Machine;
- không dựa vào poll trong chính Postgres để đánh thức Postgres đang ngủ.

Một worker hỏi DB mỗi 10 phút vẫn làm compute hoạt động gần 5 phút sau mỗi lần
hỏi; tiết kiệm có giới hạn và latency có thể tới 10 phút. Không dùng profile này
cho mail giao dịch hay campaign có SLO dưới một phút nếu chưa đưa wake-up ra
ngoài DB. Fly Scheduled Machines nguyên bản chỉ có nhịp fuzzy
`hourly/daily/weekly/monthly`, không đủ cho lịch mail chính xác; nếu cần cron chi
tiết, dùng Cron Manager hoặc một external scheduler.

Phần còn lại của runbook triển khai **Profile A**. Profile B phải có ADR riêng.

## 0. Trạng thái gốc và ngân sách lỗi

Trước khi thay đổi, ghi lại trạng thái để rollback có số đối chiếu:

```bash
fly status --app pvone-crm-api
fly secrets list --app pvone-crm-api
fly logs --app pvone-crm-api --no-tail
```

Trong Neon Console, chụp lại cho project production:

- plan và spending limit;
- CU-hours của tháng hiện tại;
- autoscaling min/max;
- scale-to-zero;
- storage, data transfer và restore history;
- danh sách branch/compute đang tồn tại.

Không tiếp tục deploy nếu Neon vẫn đang hard-stop vì quota. Với production,
chuyển sang Launch hoặc nâng spending limit trước, rồi xác nhận kết nối lại được.

Kiểm tra backlog chỉ đọc:

```sql
SELECT state, count(*)
FROM platform.email_delivery
GROUP BY state
ORDER BY state;

SELECT count(*) AS pending_due
FROM platform.email_delivery
WHERE state = 'pending'
  AND COALESCE(next_attempt_at, created_at) <= now();

SELECT id, event_key, recipient, attempt_count, next_attempt_at,
       last_error_code, updated_at
FROM platform.email_delivery
WHERE state IN ('pending', 'sending', 'dead')
ORDER BY updated_at
LIMIT 100;

-- Nhóm có nguy cơ gửi trùng vì idempotency window của provider đã hết.
SELECT id, event_key, recipient, provider_email_id, attempt_count, updated_at
FROM platform.email_delivery
WHERE state = 'sending'
  AND updated_at < now() - interval '24 hours'
ORDER BY updated_at;

SELECT state, count(*)
FROM platform.mail_run
GROUP BY state
ORDER BY state;

SELECT state, count(*)
FROM sales.campaign
GROUP BY state
ORDER BY state;
```

Nếu có `sending` cũ hơn 5 phút nhưng chưa quá 24 giờ, không sửa tay: sau khi
khởi động, để `reapStuckSending()` quyết định requeue/parking theo retry budget.
Nếu có `sending` cũ hơn 24 giờ, **chưa được start worker**; tra trạng thái bên
Resend trước vì idempotency window đã hết và requeue mù có thể gửi bản thứ hai.
Nếu có `dead`, đi theo
[`mail-dead-letter-recovery.md`](./mail-dead-letter-recovery.md).

## 1. Khôi phục worker an toàn

Production hiện phải có đúng **một worker active**. Standby có thể tồn tại nhưng
phải ở trạng thái stopped.

```bash
fly status --app pvone-crm-api
fly machine status <worker-machine-id> --app pvone-crm-api
fly machine start <worker-machine-id> --app pvone-crm-api
fly logs --app pvone-crm-api --machine <worker-machine-id>
```

Chỉ start sau khi `/readyz` hoặc một truy vấn trực tiếp xác nhận DB hoạt động.
Không start cả worker và standby: queue claim chống trùng, nhưng các sweep toàn
bảng sẽ bị nhân đôi và không mua thêm độ tin cậy tương ứng.

Worker hiện dùng restart policy mặc định `on-failure`, tối đa 10 lần; đó là lý
do nó nằm `stopped` sau sự cố quota. Sửa theo thứ tự:

1. worker phải retry kết nối DB bằng exponential backoff có jitter, tối đa 5
   phút, thay vì để lỗi `boss.start()` giết process;
2. log một dòng trạng thái, không log stack mỗi vài giây;
3. sau khi đã chứng minh không boot-loop, thêm vào `apps/api/fly.toml`:

```toml
[[restart]]
policy = "always"
processes = ["worker"]
```

Không đặt `always` trước khi có backoff: khi Neon hard-stop, Fly sẽ biến lỗi quota
thành một vòng reconnect nóng.

## 2. Tách liveness khỏi readiness

### Hình dạng endpoint đích

`GET /livez`

- không đọc DB, Redis, Resend hay bất kỳ dịch vụ ngoài process nào;
- trả HTTP 200 khi event loop và Nest app còn phục vụ được;
- đây là endpoint duy nhất Fly gọi mỗi 15 giây.

`GET /readyz`

- chạy `SELECT 1` với timeout ngắn;
- DB tốt: HTTP 200 `{ "status": "ok", "db": true }`;
- DB lỗi/quota: HTTP 503 `{ "status": "degraded", "db": false }`;
- dùng cho deploy verification và external alert, không dùng làm poll 15 giây
  nếu mục tiêu là scale-to-zero.

`GET /healthz/email`

- giữ nguyên vai trò kiểm tra ledger/queue/mail gate;
- không ghép vào liveness vì Resend/queue hỏng không có nghĩa HTTP process cần
  bị restart.

Đổi Fly check:

```toml
[[http_service.checks]]
grace_period = "20s"
interval = "15s"
method = "GET"
path = "/livez"
timeout = "3s"
```

Giữ `/healthz` tạm thời như alias có cảnh báo deprecation nếu còn monitor cũ,
nhưng nó phải trả 503 khi DB hỏng. Xoá alias sau khi đã đổi toàn bộ monitor.

Kiểm chứng:

```bash
curl -i -sS https://pvone-crm-api.fly.dev/livez
curl -i -sS https://pvone-crm-api.fly.dev/readyz
fly checks list --app pvone-crm-api
```

Acceptance:

- `/livez` không tạo session/query mới trong `pg_stat_activity`;
- `/readyz` trả 503 khi cố ý trỏ staging vào DB không tồn tại;
- Fly không còn báo xanh cho một response `degraded`;
- production traffic chỉ được mở sau khi deploy probe `/readyz` thành công.

## 3. Nối đúng hai endpoint Neon

API tiếp tục dùng pooled endpoint:

```text
DATABASE_URL=postgresql://...@ep-...-pooler.<region>.aws.neon.tech/neondb
```

Queue/worker dùng direct endpoint cùng project, branch và database:

```text
PV_QUEUE_DATABASE_URL=postgresql://...@ep-....<region>.aws.neon.tech/neondb
```

Lấy cả hai URL từ Neon Console; không tự sửa hostname bằng tìm/thay. Đặt direct
URL thành Fly secret:

```bash
fly secrets set --app pvone-crm-api \
  PV_QUEUE_DATABASE_URL='postgresql://<user>:<password>@<direct-host>/neondb?sslmode=require'
```

Sau deploy, worker log phải có `· notify`. Nếu chỉ có `driver postgres` mà không
có `notify`, `PV_QUEUE_DATABASE_URL` chưa được nhận hoặc vẫn là pooled URL.

Direct và pooled endpoint vẫn trỏ vào **một compute/storage**, không tạo database
thứ hai. Direct chỉ dành cho session state của pg-boss (`LISTEN`, advisory lock);
API request vẫn qua PgBouncer.

Connection budget hiện tại:

- API application pool: tối đa 10;
- worker application pool: tối đa 10;
- pg-boss worker pool: concurrency 2 + headroom 3 = tối đa 5;
- tổng lý thuyết 25, thấp hơn nhiều so với trần hiện tại.

Thêm `application_name` riêng cho API DB pool và worker DB pool để
`pg_stat_activity` không còn hai dòng tên rỗng. Đặt `connectionTimeoutMillis`,
`idleTimeoutMillis` và listener `pool.on('error')`; đây là resilience, không phải
cách giảm CU.

## 4. Hạ polling theo hai lượt, không nhảy thẳng

### Lượt 1 — thay đổi cấu hình, chưa đổi kiến trúc

Đặt `PV_QUEUE_POLL_SECONDS=30` trong `[env]` của `fly.toml` và deploy. Đây là
bước ít rủi ro: latency outbox tối đa tăng từ khoảng 4 lên 30 giây, nhưng
pg-boss có direct `LISTEN/NOTIFY` sẽ thức ngay khi relay đã enqueue job.

Theo dõi ít nhất một ngày:

- lead-intake mail đến trong 35 giây;
- mail hẹn giờ bắt đầu trong 35 giây;
- `sending` không kẹt quá 5 phút;
- `mail_run` và campaign về terminal trong 60 giây;
- không có duplicate theo `event_key`/`provider_email_id`.

Nếu bất kỳ tiêu chí nào sai, rollback `PV_QUEUE_POLL_SECONDS=4`; không sửa
ledger.

Lượt này giảm round trip nhưng **không giảm CU-hours** của Profile A vì compute
được chủ ý giữ online.

### Lượt 2 — fast path theo sự kiện, poll chỉ để sửa sai

Không dùng một biến 4 giây chung cho năm trách nhiệm. Tách thành:

| Trách nhiệm            | Fast path                                                   |                  Repair/backstop |
| ---------------------- | ----------------------------------------------------------- | -------------------------------: |
| Delivery mới đến hạn   | PostgreSQL `NOTIFY` sau commit                              |                          60 giây |
| pg-boss job mới        | pg-boss `LISTEN/NOTIFY`                                     |                          60 giây |
| Delivery kẹt `sending` | không cần fast path                                         | 60 giây; ngưỡng kẹt vẫn 300 giây |
| Đóng `mail_run`        | gọi reconcile theo đúng `run_id` sau khi delivery đổi state |                          60 giây |
| Cầu dao bounce         | kiểm tra theo đúng `run_id` sau webhook/send result         |                          60 giây |
| Đóng campaign          | reconcile theo campaign liên quan sau khi run terminal      |                           5 phút |

`NOTIFY` phải phát từ cùng transaction ghi `email_delivery`; PostgreSQL chỉ
phát notification sau commit. Payload chỉ cần ID, không đưa recipient hay nội
dung mail vào channel/log.

Scheduled delivery cần một trong hai cách chuẩn:

1. enqueue pg-boss job với `startAfter` ngay khi tạo delivery; hoặc
2. giữ `next_attempt_at` là nguồn sự thật và để repair pass 60 giây nhặt nó.

Ưu tiên cách 1 cho latency; vẫn giữ cách 2 làm repair nếu process chết giữa
commit ledger và enqueue. Không được xoá repair pass chỉ vì NOTIFY đã chạy tốt:
NOTIFY là tín hiệu không bền, outbox mới là dữ liệu bền.

Các repository reconcile nên nhận `runId`/`campaignCode` ở fast path thay vì
quét mọi run/campaign. Bản toàn bảng vẫn tồn tại cho repair, chạy thưa hơn.

Sau lượt này, tải idle mục tiêu là dưới 10 statement/phút thay vì khoảng
120 statement/phút. Không dùng số query làm điều kiện duy nhất; kiểm tra cả CPU,
CU-hours và query latency trong Neon Console.

## 5. Giữ ranh giới kiến trúc

Luồng đúng sau thay đổi:

```text
HTTP transaction
  -> ghi dữ liệu nghiệp vụ + email_delivery (cùng transaction)
  -> COMMIT
  -> NOTIFY delivery id

worker MailRelay
  -> đọc delivery từ ledger
  -> enqueue pg-boss bằng singleton/idempotency key

pg-boss consumer
  -> claim atomically
  -> rate gate trong Postgres
  -> Resend với Idempotency-Key = event_key
  -> cập nhật delivery
  -> reconcile đúng mail_run/campaign liên quan

repair timers
  -> nhặt notification bị mất, process crash và trạng thái kẹt
```

Không làm các “tối ưu” sau:

- gửi Resend trực tiếp trong HTTP transaction;
- coi NOTIFY là queue bền;
- chuyển source of truth từ ledger sang RAM;
- bỏ `reapStuckSending`, singleton hoặc unique constraint;
- để browser quyết định lúc campaign/run hoàn tất;
- chạy hai worker active chỉ để chữa việc một worker hay chết;
- dùng pooled URL cho `LISTEN`;
- dùng health check 15 giây để giám sát DB trong profile scale-to-zero.

## 6. Index và truy vấn trước khi lên tải

Các index chính đã có:

- `email_delivery_due_idx` cho delivery `pending` đến hạn;
- `email_delivery_run_state_idx` cho reconcile/bounce theo run;
- `mail_run_due_idx` cho run hẹn giờ.

Không thêm index theo cảm giác. Trên staging có dữ liệu gần production, chạy:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM platform.email_delivery
WHERE state = 'pending'
  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
ORDER BY created_at
LIMIT 100;
```

Với query thật do repository sinh, mục tiêu là index/bitmap scan trên tập
`pending`, không sequential scan toàn ledger. `EXPLAIN ANALYZE` có thực thi
câu lệnh; không dùng nó trực tiếp trên câu `UPDATE` production.

Theo dõi autovacuum và WAL. Empty `UPDATE` không tạo thay đổi row đáng kể,
nhưng queue stats/maintenance và delivery lifecycle có thể tạo WAL; restore
history được tính theo lượng dữ liệu thay đổi, không theo kích thước DB hiện tại.

## 7. Bộ kiểm chứng bắt buộc trước khi kết thúc rollout

Chạy lại toàn bộ [`mail-verification.md`](./mail-verification.md), cộng thêm các
case sau:

1. **Idle 10 phút:** worker sống, không spam log, query rate đạt mục tiêu.
2. **Mail tức thời:** ghi một delivery, đúng một mail rời máy, latency đạt SLO.
3. **Mail hẹn giờ:** hẹn `now()+3 phút`, không gửi sớm, trễ không quá 60 giây.
4. **Mất NOTIFY:** tạm tắt listener ở staging; repair pass vẫn gửi trong 60 giây.
5. **Worker chết sau commit:** ledger còn `pending`; restart worker phải nhặt lại.
6. **Worker chết sau Resend accept:** idempotency không cho gửi bản thứ hai.
7. **Neon restart:** pool reconnect, worker không thoát vĩnh viễn.
8. **Quota/credential sai ở staging:** `/livez` xanh, `/readyz` 503, alert đỏ,
   worker backoff thay vì crash-loop.
9. **Bounce ceiling:** run bị `CANCELLED`, pending delivery về `dead` đúng lý do.
10. **Campaign nhiều wave:** wave cuối terminal thì campaign về `DONE` trong 5
    phút kể cả notification cuối bị mất.
11. **Deploy rolling:** chỉ một worker active xử lý tại một thời điểm hoặc hai
    worker overlap ngắn vẫn không gửi trùng.
12. **Shutdown:** SIGTERM chờ job đang chạy, rồi mới đóng pg-boss và DB pool.

Các truy vấn chấp nhận cuối rollout:

```sql
-- Không có delivery đến hạn bị bỏ quên quá hai repair cycle.
SELECT id, event_key, next_attempt_at, updated_at
FROM platform.email_delivery
WHERE state = 'pending'
  AND COALESCE(next_attempt_at, created_at) < now() - interval '2 minutes';

-- Không có sending vượt ngưỡng reaper mà vẫn không được xử lý.
SELECT id, event_key, attempt_count, updated_at
FROM platform.email_delivery
WHERE state = 'sending'
  AND updated_at < now() - interval '6 minutes';

-- Không có run sending đã hết việc nhưng chưa đóng.
SELECT r.id
FROM platform.mail_run r
WHERE r.state = 'SENDING'
  AND NOT EXISTS (
    SELECT 1
    FROM platform.email_delivery d
    WHERE d.mail_run_id = r.id
      AND d.state IN ('pending', 'sending', 'delayed')
  );
```

Mọi câu trên phải trả 0 dòng sau khi chờ đủ repair window.

## 8. Quan sát chi phí sau rollout

Trong 7 ngày liên tục, ghi mỗi ngày:

- CU-hours;
- compute active hours;
- kích thước CU trung bình và đỉnh;
- query rate và top slow queries;
- storage, WAL/restore history và egress;
- số delivery sent/delivered/bounced/dead;
- số lần worker reconnect/restart.

Mức chấp nhận cho Profile A ở tải hiện tại:

- idle compute giữ ở 0,25 CU;
- không có autoscale kéo dài nếu không có campaign;
- forecast khoảng 180–200 CU-hours/tháng;
- idle DB statements dưới 10/phút;
- worker restart ngoài deploy bằng 0;
- `pending_due` và `stuck_sending` bằng 0;
- storage vẫn thấp hơn nhiều so với 0,5 GB;
- không có mail trùng.

Nếu CU vẫn cao hơn forecast, tìm theo thứ tự:

1. compute min có lớn hơn 0,25 không;
2. query nào làm autoscaling tăng CPU/RAM;
3. có hơn một worker active không;
4. browser tab nào còn poll 60 giây hoặc màn mail poll 5 giây;
5. external integration/BI/SQL editor nào giữ workload;
6. branch/read replica nào đang có compute riêng.

## 9. Rollback

Giữ đường polling cũ qua ít nhất một tuần ổn định. Khi cần rollback:

1. đặt lại `PV_QUEUE_POLL_SECONDS=4`;
2. deploy code trước event fast path nhưng **không** gỡ unique constraint,
   ledger hoặc direct queue URL;
3. xác nhận một worker active;
4. chạy canary một mail;
5. kiểm tra backlog và ba truy vấn chấp nhận ở trên.

Không rollback `/livez` về một DB query 15 giây. Nếu cần readiness chặt hơn cho
deploy, thêm deploy probe riêng; không biến liveness thành nguồn đốt CU và cũng
không trả HTTP 200 cho trạng thái degraded.

## Nguồn giá và hành vi nền tảng

- Neon compute và scale-to-zero: <https://neon.com/docs/manage/endpoints/>
- Neon Free 100 CU-hours/project và 0,5 GB: <https://neon.com/blog/building-patterns-unlocked-by-scale-to-zero>
- Launch `$0,106/CU-hour`: <https://neon.com/blog/major-compute-price-reduction-on-neon>
- Storage, branch-hour và restore history: <https://neon.com/blog/new-usage-based-pricing>
- Fly restart policy: <https://fly.io/docs/machines/guides-examples/machine-restart-policy/>
- Fly process groups: <https://fly.io/docs/launch/processes/>
- Fly scheduling options: <https://fly.io/docs/blueprints/task-scheduling/>
