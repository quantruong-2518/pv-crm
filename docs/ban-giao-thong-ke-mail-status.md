# Bàn giao · Ghi nhận toàn bộ trạng thái email để thống kê

> Phạm vi: toàn bộ email đi qua mail ledger của PV CRM, gồm transactional và
> MAS. Tài liệu này không coi tín hiệu mở là bằng chứng người nhận đã đọc.

## 1. Bài toán và mục tiêu

### Business requirement

Hệ thống phải trả lời được, bằng dữ liệu lưu trong CRM:

1. Một email đang chờ, đang gửi, đã rời hệ thống, đã tới máy chủ nhận hay đã lỗi.
2. Nếu lỗi: lỗi ở đường gửi, bị máy chủ nhận từ chối, bị suppression hay hết retry.
3. Người nhận có phát sinh tín hiệu mở, bấm liên kết hoặc huỷ đăng ký hay không.
4. Một batch/campaign có bao nhiêu thư ở từng trạng thái và tỷ lệ tương ứng.
5. Mỗi trạng thái xảy ra lúc nào để tính thời gian xử lý và điều tra sự cố.

Nguồn: yêu cầu stakeholder “ghi lại toàn bộ mail status để thống kê”; mô hình hiện
có tại `mail.contract.ts`, `mail.schema.ts`, `mail-run.schema.ts` và
`packages/contracts/src/sales/mail.ts`.

## 2. Ba trục dữ liệu không được trộn

```text
mail_run.state                 email_delivery.state             mail_event.kind
Trạng thái CẢ BATCH            Trạng thái MỘT LÁ THƯ             Hành vi người nhận

DRAFT                          pending                           OPEN
SCHEDULED                      sending                           CLICK
SENDING                        accepted                          UNSUBSCRIBE
SENT                           delayed
CANCELLED                      delivered
                               bounced
                               complained
                               suppressed
                               failed_permanent
                               dead
```

- `mail_run.state` trả lời: batch đã bắt đầu hoặc kết thúc chưa.
- `email_delivery.state` trả lời: lá thư có đi tới nơi không.
- `mail_event.kind` trả lời: sau khi gửi, có tín hiệu hành vi nào không.
- OPEN/CLICK tuyệt đối không được cập nhật `email_delivery.state`.

Nguồn: `apps/api/src/platform/mail/mail.contract.ts`,
`apps/api/src/platform/mail/mail.schema.ts`,
`apps/api/src/platform/mail/mail-run.schema.ts`.

## 3. Hiện trạng đã có

| Thành phần          | Hiện trạng                                                      | Nguồn                        |
| ------------------- | --------------------------------------------------------------- | ---------------------------- |
| Mail ledger         | Có một dòng cho mỗi thư tại `platform.email_delivery`           | `mail.schema.ts`             |
| Batch               | Có `platform.mail_run` và các mốc scheduled/started/finished    | `mail-run.schema.ts`         |
| Trạng thái hiện tại | Có 10 trạng thái delivery và luật chỉ tiến `advances()`         | `mail.contract.ts`           |
| Webhook             | Có cửa `POST /integrations/resend/webhooks`, verify chữ ký Svix | `mail-webhook.controller.ts` |
| Replay protection   | Có `email_webhook_event.svix_id` và unique event                | `mail.schema.ts`             |
| Engagement          | Có `mail_event` cho OPEN/CLICK/UNSUBSCRIBE                      | `mail.schema.ts`             |
| Lỗi provider        | Có `last_error_code`, `last_error_summary`                      | `mail.schema.ts`             |
| Mốc gửi             | Có `accepted_at`, `delivered_at`                                | `mail.schema.ts`             |
| Batch counters      | Đếm động từ delivery/event, không lưu counter thủ công          | `mail-run.repository.ts`     |
| Timeline lead       | Có delivery state, open/click và thời gian gần nhất             | `LeadMailTimelineRow`        |

### Khoảng trống hiện tại

1. Production chưa khai webhook Resend và `RESEND_WEBHOOK_SECRET`.
2. API key đang có là send-only, không có quyền tạo webhook.
3. `email_delivery` chỉ giữ trạng thái hiện tại; chưa có lịch sử đầy đủ mọi lần
   chuyển trạng thái.
4. `email_webhook_event` chỉ chống replay envelope, không thay thế lịch sử trạng
   thái của delivery.
5. `mail_event` chỉ dành cho engagement, không được dùng chứa pending/sending/
   delivered/bounced.
6. Chưa có màn sổ batch thống kê đầy đủ các counter của `MailRunRow`.

Nguồn: kiểm tra production 29/08/2026; `docs/con-thieu-mas-mail.md` mục D6.

## 4. Mô hình đích

Giữ `email_delivery.state` làm snapshot hiện tại để truy vấn nhanh. Bổ sung một
ledger append-only cho mọi lần chuyển trạng thái:

### `platform.email_delivery_status_event`

| Trường             | Kiểu đề xuất         | Bắt buộc | Ý nghĩa                                             |
| ------------------ | -------------------- | -------- | --------------------------------------------------- |
| `id`               | uuid                 | Có       | Khoá chính                                          |
| `delivery_id`      | uuid FK              | Có       | Thư nhận trạng thái                                 |
| `from_state`       | mail state, nullable | Không    | Null với trạng thái đầu tiên                        |
| `to_state`         | mail state           | Có       | Trạng thái mới                                      |
| `occurred_at`      | timestamptz          | Có       | Thời điểm sự kiện thực sự xảy ra                    |
| `source`           | enum/text            | Có       | `system`, `worker`, `resend`, `sweeper`, `operator` |
| `source_event_key` | text, unique         | Có       | Chống ghi trùng                                     |
| `attempt_no`       | integer              | Không    | Lần thử gửi tương ứng                               |
| `reason_code`      | text                 | Không    | Mã lỗi ngắn                                         |
| `reason_summary`   | text                 | Không    | Câu lỗi đã giới hạn độ dài                          |
| `created_at`       | timestamptz          | Có       | Lúc CRM ghi nhận                                    |

`[ASSUMPTION/đề xuất]`: tên bảng và tên `source` chưa có trong code hiện tại.
Mục tiêu bắt buộc là ledger append-only; tên vật lý có thể đổi khi thiết kế migration.

### Luật ghi

Một transaction chuyển trạng thái phải thực hiện đồng thời:

1. Kiểm tra `advances(from, to)` hoặc luật terminal hợp lệ.
2. Ghi một dòng `email_delivery_status_event`.
3. Cập nhật snapshot `email_delivery.state` và timestamp tương ứng.
4. Commit cả hai hoặc rollback cả hai.

Webhook bị gửi lại phải va vào `source_event_key`/`svix_id` và không tạo event
thứ hai. Webhook đến sai thứ tự được lưu envelope nhưng không kéo snapshot lùi.

## 5. Mapping sự kiện Resend

| Sự kiện/nguồn                  | Snapshot delivery  | Status event                    | Ghi chú                          |
| ------------------------------ | ------------------ | ------------------------------- | -------------------------------- |
| Tạo delivery                   | `pending`          | `null → pending`                | Chưa được gọi là sent            |
| Worker claim                   | `sending`          | `pending → sending`             | Ghi `attempt_no`                 |
| Resend API nhận / `email.sent` | `accepted`         | `sending → accepted`            | Điền `accepted_at`               |
| `email.delivery_delayed`       | `delayed`          | trạng thái trước → `delayed`    | Chưa phải lỗi cuối               |
| `email.delivered`              | `delivered`        | trạng thái trước → `delivered`  | Điền `delivered_at`              |
| `email.bounced`                | `bounced`          | trạng thái trước → `bounced`    | Permanent bounce tạo suppression |
| `email.complained`             | `complained`       | trạng thái trước → `complained` | Tạo suppression complaint        |
| `email.suppressed`             | `suppressed`       | trạng thái trước → `suppressed` | Thư không rời hệ thống/provider  |
| `email.failed`                 | `failed_permanent` | trạng thái trước → lỗi          | Giữ reason của provider          |
| Hết retry                      | `dead`             | trạng thái trước → `dead`       | Cần người xử lý                  |
| `email.opened`                 | Không đổi          | Ghi `mail_event.OPEN`           | Tín hiệu nhiễu                   |
| `email.clicked`                | Không đổi          | Ghi `mail_event.CLICK`          | Tín hiệu mạnh hơn OPEN           |
| One-click unsubscribe          | Không đổi          | Ghi `mail_event.UNSUBSCRIBE`    | Đồng thời suppression            |

Nguồn: `mail-webhook.controller.ts`, `mail.repository.ts`,
`unsubscribe.controller.ts`, `mail.consumer.ts`.

## 6. Bộ chỉ số bắt buộc

Mọi counter phải tính từ hàng ledger tại thời điểm đọc; không duy trì counter
bằng phép cộng/trừ thủ công.

| KPI          | Công thức dữ liệu                                     | Diễn giải                       |
| ------------ | ----------------------------------------------------- | ------------------------------- |
| Audience     | `mail_run.audience_count`                             | Số người sống sót sau preflight |
| Queued       | Số `email_delivery` của run                           | Số thư đã ghi vào ledger        |
| In flight    | `pending + sending + delayed`                         | Còn đang xử lý                  |
| Sent         | Các state đã qua accepted, trừ suppressed/failed/dead | Provider đã nhận                |
| Delivered    | Đã có xác nhận receiving server                       | Không đồng nghĩa đã đọc         |
| Bounced      | State `bounced`                                       | Receiving server từ chối        |
| Failed       | `failed_permanent + dead`                             | Lỗi đường gửi/hết retry         |
| Suppressed   | State `suppressed`                                    | Bị giữ lại, không gửi           |
| Complained   | State `complained`                                    | Người nhận báo spam             |
| Opened       | Distinct delivery có event OPEN                       | Tín hiệu tracking, có nhiễu     |
| Clicked      | Distinct delivery có event CLICK                      | Tín hiệu hành động              |
| Unsubscribed | Distinct delivery có event UNSUBSCRIBE                | Yêu cầu ngừng nhận              |

### Tỷ lệ

- Delivery rate = `delivered / sent`.
- Bounce rate = `bounced / sent`.
- Failure rate = `failed / queued`.
- Suppression rate = `suppressed / audience`.
- Complaint rate = `complained / sent`.
- Open signal rate = `opened / delivered`; phải ghi rõ “tín hiệu mở”, không ghi
  “đã đọc”.
- Click rate = `clicked / delivered`.

⚠️CONFIRM: mẫu số của unsubscribe rate dùng `sent` hay `delivered`. Không chốt
trong nguồn hiện tại; dashboard không được tự chọn mà không ghi quyết định.

⚠️CONFLICT cần sửa khi triển khai: contract mô tả complaint là một thư đã
delivered, nhưng query hiện tại đếm `delivered` chỉ với state chính xác
`delivered`. Khi snapshot tiến tiếp thành `complained`, thư đó rơi khỏi counter
delivered. Status-event ledger phải cho phép tính “đã từng delivered” hoặc query
phải tính `delivered + complained` theo quyết định nghiệp vụ.

## 7. Báo cáo cần có

### 7.1 Sổ batch/run

Mỗi dòng hiển thị:

- Tên run, campaign, template, người tạo.
- Thời gian tạo, hẹn, bắt đầu, kết thúc.
- Audience, queued, in-flight, sent, delivered.
- Bounced, failed, suppressed, complained.
- Open signal, clicked, unsubscribed.
- Trạng thái run và cảnh báo khi còn pending lâu hoặc có dead letter.

### 7.2 Chi tiết một run

- Funnel trạng thái theo từng delivery.
- Danh sách recipient theo trạng thái hiện tại.
- Lịch sử trạng thái của từng thư.
- Lý do bounce/failure và số lần retry.
- Tín hiệu OPEN/CLICK/UNSUBSCRIBE nằm ở vùng riêng.

### 7.3 Timeline trên lead

- Vàng: đang gửi/hẹn gửi.
- Xanh: đã gửi/đã tới hộp thư, kèm timestamp thật.
- Đỏ: bounced/failed/suppressed/dead, kèm lý do.
- OPEN/CLICK là metadata phụ, không quyết định màu delivery.

## 8. Yêu cầu chức năng

| Mã       | MoSCoW | Yêu cầu                                                      | Nguồn                           |
| -------- | ------ | ------------------------------------------------------------ | ------------------------------- |
| FR-MS-01 | Must   | Nhận và verify webhook Resend bằng raw body + signing secret | Webhook hiện có                 |
| FR-MS-02 | Must   | Ghi idempotent mọi chuyển trạng thái delivery                | Yêu cầu stakeholder             |
| FR-MS-03 | Must   | Không cho trạng thái delivery đi lùi khi webhook sai thứ tự  | `advances()`                    |
| FR-MS-04 | Must   | Tách delivery status khỏi OPEN/CLICK/UNSUBSCRIBE             | Schema hiện có                  |
| FR-MS-05 | Must   | Giữ timestamp thực tế của từng status event                  | Yêu cầu thống kê                |
| FR-MS-06 | Must   | Giữ reason của bounce/failure/suppression                    | Timeline hiện có                |
| FR-MS-07 | Must   | Tính KPI từ ledger, không counter thủ công                   | `MailRunRepository`             |
| FR-MS-08 | Must   | Cho xem trạng thái hiện tại và lịch sử một email             | Yêu cầu stakeholder             |
| FR-MS-09 | Should | Lọc báo cáo theo run/campaign/template/khoảng thời gian      | Nhu cầu thống kê, implied       |
| FR-MS-10 | Should | Cảnh báo run có pending quá lâu/dead/bounce cao              | Health + bounce breaker hiện có |
| FR-MS-11 | Won't  | Khẳng định OPEN đồng nghĩa người nhận đã đọc                 | Cảnh báo tracking hiện có       |

## 9. Acceptance criteria

### AC-01 · Gửi thành công

Given một delivery đang `sending`  
When Resend nhận thư và trả `email.sent`  
Then hệ thống ghi status event `sending → accepted`, cập nhật `accepted_at` và
counter sent tăng đúng một.

### AC-02 · Delivered

Given delivery đã được provider chấp nhận  
When webhook `email.delivered` hợp lệ tới API  
Then snapshot thành `delivered`, `delivered_at` lấy từ thời gian provider và
timeline lead hiện màu xanh cùng timestamp.

### AC-03 · Bounce

Given delivery đã gửi  
When Resend phát `email.bounced`  
Then hệ thống ghi `bounced`, giữ nguyên reason, tăng bounced; nếu bounce permanent
thì địa chỉ được thêm vào suppression.

### AC-04 · Webhook replay

Given một webhook đã được xử lý  
When Resend gửi lại cùng `svix-id`  
Then không có status event, mail event hoặc counter nào tăng lần hai.

### AC-05 · Webhook sai thứ tự

Given delivery đã `delivered`  
When webhook `email.sent` tới muộn  
Then snapshot vẫn là `delivered` và hệ thống không ghi một bước lùi.

### AC-06 · Open tracking

Given delivery đã gửi  
When Resend phát `email.opened`  
Then hệ thống ghi `mail_event.OPEN`, không đổi delivery state và UI gọi đây là
“tín hiệu mở”, không phải “đã đọc”.

### AC-07 · Báo cáo đối soát

Given một run có delivery ở nhiều trạng thái  
When đọc báo cáo run  
Then từng counter truy vết được về đúng tập delivery/event và webhook replay
không làm tổng thay đổi.

## 10. NFR liên quan

- Bảo mật: webhook bắt buộc verify Svix signature; thiếu secret phải từ chối.
- Idempotency: `svix-id`, provider email id và source event key phải chống replay.
- Privacy: không lưu IP/user-agent của open/click; không log recipient/subject/body.
- Auditability: timestamp provider và timestamp CRM nhận phải phân biệt được.
- Reliability: webhook có thể tới nhiều lần và sai thứ tự.
- Retention: ⚠️CONFIRM thời hạn giữ status event và engagement event trong CRM.
- Performance: `[ASSUMPTION/đề xuất]` index tối thiểu theo `delivery_id`,
  `to_state`, `occurred_at`, `source_event_key`.

## 11. Việc triển khai theo thứ tự

1. Cấp Resend Full Access API key hoặc tạo webhook bằng Dashboard.
2. Đăng ký endpoint production với toàn bộ email events cần theo dõi.
3. Đặt `RESEND_WEBHOOK_SECRET` và send key lên Fly; bật mail/MAS đúng cấu hình.
4. Chạy canary và xác nhận event vào `email_webhook_event`, `email_delivery`,
   `mail_event`.
5. Thiết kế migration `email_delivery_status_event`.
6. Gom mọi lệnh chuyển state vào một hàm transaction duy nhất.
7. Backfill event đầu tiên từ snapshot hiện có và đánh dấu source `backfill`.
8. Mở API run list/detail và dựng dashboard thống kê.
9. Đối soát số CRM với Resend Dashboard trên cùng một run canary.

## 12. ⚠️CONFIRM trước khi chốt build

1. Mẫu số unsubscribe rate: sent hay delivered.
2. Thời hạn retention cho status history và engagement.
3. Có cần export CSV recipient-level hay chỉ aggregate.
4. Vai trò nào được xem địa chỉ email và lỗi chi tiết.
5. Tách tài khoản Resend MAS khỏi transactional trước run thật hay sau canary.
6. Complaint có được tính trong delivered theo lịch sử “đã từng delivered”.

## 13. Tham chiếu

- `apps/api/src/platform/mail/mail.contract.ts`
- `apps/api/src/platform/mail/mail.schema.ts`
- `apps/api/src/platform/mail/mail-run.schema.ts`
- `apps/api/src/platform/mail/mail-run.repository.ts`
- `apps/api/src/platform/mail/mail-webhook.controller.ts`
- `apps/api/src/platform/mail/mail.repository.ts`
- `packages/contracts/src/sales/mail.ts`
- `apps/web/src/pages/lead-parts.tsx`
- `docs/ban-giao-mas-mail.md`
- `docs/con-thieu-mas-mail.md`
- Resend webhook events: <https://resend.com/docs/webhooks/event-types>
- Resend open tracking: <https://resend.com/docs/dashboard/domains/tracking>
