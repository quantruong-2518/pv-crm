# Bàn giao — Quick MAS (Sổ lead → gửi mail hàng loạt)

Lát cắt **28/08/2026**, nhánh `develop`. Tiếp nối
[`ban-giao-mail.md`](./ban-giao-mail.md) (đường ống giao dịch đã dựng thật) và
[`ban-giao-db.md`](./ban-giao-db.md) (cụm B "MAS mail" ở dạng kế hoạch). File
này ghi khoảng cách THẬT giữa hai bên: FE đã dựng một demo đầy đủ luồng thao
tác, BE thì chưa có cửa nào để demo đó gọi vào.

**Sửa một chỗ lệch trong chính bộ docs này**: `ban-giao-db.md` mục "Chưa dựng —
12 bảng" liệt `suppression` là chưa có. Sai — nó đã dựng và đã NỐI DÂY thật từ
27/08 (`email_suppression`, kiểm tra trong `mail.consumer.ts` trước mỗi lần
gửi). Đừng đọc lại danh sách 12 bảng đó mà tưởng suppression còn thiếu.

> **Cập nhật 28/08 — mục "Chưa có" bên dưới ĐÃ LỖI THỜI ở một chỗ quan trọng.**
> File này vẽ `campaign_run` là ĐƠN VỊ GỬI và `email_delivery.campaign_run_id`
> trỏ vào đó. Bản dựng thật không làm vậy: đơn vị gửi là **`platform.mail_run`**
> (một bảng của platform, không biết campaign là gì), còn `sales.campaign_run`
> chỉ là dây nối. Lý do — `platform/` không được phụ thuộc `branches/`, và một
> khoá ngoại từ `platform` sang `sales` đảo đúng chiều đó ở tầng DDL, nơi lint
> không với tới. Cột nay tên `mail_run_id`.
>
> Kiến trúc đã chốt, bảy quyết định kèm lý do, AUP của Resend và quy cách địa
> chỉ gửi: [`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md).

---

## Phạm vi

`apps/web/src/pages/leads.tsx` + `apps/web/src/components/quick-mail-dialog.tsx`
dựng đủ: nút Quick MAS bật chế độ chọn dòng, checkbox giữ lựa chọn qua nhiều
trang, thanh "Đã chọn N lead" mở panel soạn mail, panel có chọn mẫu (3 mẫu demo
khai cứng trong file) + tiêu đề/nội dung sửa tay. Bấm Gửi hiện toast rồi đóng —
**không có lời gọi mạng nào cả**, xem docblock đầu `quick-mail-dialog.tsx`.

Tài liệu này trả lời: từ đây đến lúc nút Gửi đó gọi một API thật, còn thiếu
đúng những gì.

---

## Đã có sẵn — dùng lại được, không phải dựng lại

| Mảnh                                                | Ở đâu                                                                                                                  | Dùng lại được cho MAS thế nào                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sổ gửi dùng chung                                   | `platform.email_delivery` (`platform/mail/mail.schema.ts`)                                                             | Cột `campaign_run_id` đã để sẵn (nullable, chưa FK) — MAS ghi vào ĐÚNG bảng này, không tạo bảng gửi thứ hai (quyết định #1, `ban-giao-mail.md`)                                                         |
| Chặn địa chỉ đã rơi                                 | `platform.email_suppression`                                                                                           | Khoá theo `recipient` (email thường hoá), KHÔNG theo lead/campaign — MAS gọi thẳng, không cần viết lại                                                                                                  |
| Hàng đợi + relay + retry                            | `platform/queue/` (pg-boss, `PV_QUEUE_POLL_SECONDS`)                                                                   | Cùng cơ chế `enqueue()` chống trùng qua `event_key`, cùng vòng retry — MAS chỉ cần enqueue nhiều dòng hơn                                                                                               |
| Cửa soạn thân mail, đã tính trước cho nhánh thứ hai | `MAIL_COMPOSER` (`platform/queue/mail-composer.ts`) + `LeadMailComposer` (`branches/sales/lead/lead-mail.composer.ts`) | Hiện là MỘT provider, ném lỗi nếu `delivery.template !== 'lead-intake-internal'` — đúng như docblock đã nói trước: "nhánh thứ hai cần template sẽ biến chỗ này thành registry theo `delivery.template`" |
| Webhook nhận trạng thái                             | `platform.email_webhook_event` + `mail-webhook.controller.ts`                                                          | Chỉ là chặn phát lại của Svix (`svix_id`), KHÔNG phải nhật ký mở/click theo lead — xem mục Chưa có                                                                                                      |
| Driver gửi thật                                     | Resend (`platform/mail/*.driver.ts`)                                                                                   | Không đổi gì, MAS đi qua cùng driver                                                                                                                                                                    |

---

## Chưa có

**1 · Năm bảng DB** (không phải sáu — `mail_delivery` trong kế hoạch gốc của
`ban-giao-db.md` đã BỊ THAY bằng cách dùng lại `email_delivery` + `campaign_run_id`,
xem "Đã có sẵn" ở trên; đừng dựng lại nó):

```
campaign         code · name · owner_id · state · source
campaign_member  campaign_code + lead_code (PK cả hai) · added_at · state
mail_template    subject · body · biến thay thế
campaign_run     template · scheduled_at · started_at · state   ← một chiến dịch bắn nhiều lần
mail_event       delivery_id · open|click|reply|bounce|unsub · at · url
```

`mail_event` KHÔNG trùng `email_webhook_event` — cái sau chỉ giữ `svix_id` để
chặn phát lại, không lưu nội dung sự kiện theo lead. Muốn biết "lead X có mở
mail lần bắn thứ 3 không" vẫn cần bảng này.

**2 · Endpoint.** Không có `POST` nào nhận "N mã lead + tiêu đề + nội dung +
mẫu (tuỳ chọn)" rồi enqueue. Cần một route mới trong `branches/sales`, kèm
service tạo một `campaign_run` + N dòng `email_delivery` (mỗi dòng một
`recipient`, `campaignRunId` trỏ vào run vừa tạo).

**3 · Composer cho nội dung tự do.** `LeadMailComposer.compose()` chỉ biết một
template cố định dựng bằng `@pv/mail-templates` (React → html/text). Quick MAS
cho Sale gõ tay tiêu đề/nội dung, nên nhánh mới KHÔNG cần render React — chỉ
cần một provider thứ hai bọc nội dung đã có sẵn thành `MailMessage`, đăng ký
vào cùng `MAIL_COMPOSER` registry theo `delivery.template` (đúng hướng docblock
đã vạch, chưa ai làm). Ba "mẫu" demo ở FE (Giới thiệu dịch vụ · Mời demo ·
Nhắc lịch hẹn) chỉ là gợi ý điền sẵn tiêu đề/nội dung phía client — không cần
một template package riêng cho chúng.

**4 · Quyền.** Chưa có quyền `chiến-dịch.bắn` tách khỏi `chiến-dịch.sửa` —
nợ đã ghi ở quyết định #6, mục "Nợ đang có" #1 của `ban-giao-db.md`. Sửa nháp
và bắn thật ra ngoài công ty đang cùng một quyền; thứ duy nhất truy được ai bấm
là `platform.audit`. Trước khi nút Gửi này thật, nên quyết có tách quyền hay
chấp nhận rủi ro như đã chốt.

**5 · FE rewiring.** `QuickMailDialog.submit()` hiện toast ngay, không đợi
mạng. Nối dây thật thì gửi là BẤT ĐỒNG BỘ (worker poll 12s, không phải phản hồi
tức thì của HTTP) — panel cần đổi từ "Đã gửi" sang "Đã xếp hàng, N lead", và có
lẽ cần một chỗ xem lại kết quả (bao nhiêu dòng `delivered`/`bounced`/`suppressed`
sau đó), theo đúng tinh thần "trả BÁO CÁO CỦA MÁY CHỦ" mà `ImportZone` đã làm
cho luồng nạp lead.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
migration 5 bảng (campaign · campaign_member · mail_template · campaign_run · mail_event)
                              │
              composer thứ hai (đăng ký MAIL_COMPOSER theo delivery.template)
                              │
        endpoint POST tạo campaign_run + N dòng email_delivery (campaignRunId nối)
                              │
              quyết định quyền chiến-dịch.bắn (tách hay giữ nguyên, có ý thức)
                              │
        FE: QuickMailDialog gọi endpoint thật, đổi thông báo sang "đã xếp hàng"
                              │
                    (không chặn nhưng nên làm cùng đợt)
                    ├── reaper dòng `sending` kẹt (nợ đã ghi ở ban-giao-mail.md)
                    └── mail_event + trang xem kết quả một run
```

Việc migration + endpoint + composer là việc backend, không phải việc màn hình
— xem `apps/api/CLAUDE.md` cho ranh giới `platform/` vs `branches/sales/` và
bốn file một feature (`*.controller.ts` · `*.service.ts` · `*.repository.ts` ·
`*.schema.ts`).
