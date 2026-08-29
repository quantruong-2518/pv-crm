# Bàn giao — MAS mail (gửi hàng loạt)

Lát cắt **28/08/2026**, nhánh `develop`. Tiếp nối
[`ban-giao-mail.md`](./ban-giao-mail.md) (đường ống giao dịch đã dựng thật).
File này ghi **kiến trúc đã chốt và vì sao**, cộng phần đã dựng thật.

Cách vận hành và cách kiểm tay: [`van-hanh-mail.md`](./van-hanh-mail.md).
**Còn thiếu gì và ai phải làm**: [`con-thieu-mas-mail.md`](./con-thieu-mas-mail.md).

---

## Phạm vi

Bốn nhu cầu tối thiểu chủ dự án chốt ngày 28/08:

1. Sổ lead — chọn nhiều lead bằng checkbox, gửi nhanh, có mẫu mail dựng sẵn
2. Chi tiết lead — làm được y hệt, **dùng chung một modal stepper** ở mọi chỗ
3. Chiến dịch — gửi nhiều đợt có lịch chính xác, trạng thái hiện ở chi tiết
   lead dạng dòng thời gian
4. Đo được: đã mở chưa · mở ở đợt nào · chưa mở thì lỗi hay bounce

---

## Luồng

```
Sổ lead ─┐                                      ┌─ mail_run trần (Quick MAS)
         ├─ chọn N lead ──> modal stepper ──────┤
Chi tiết ┘                                      └─ mail_run + campaign_run (chiến dịch)
                                                         │
                              N dòng platform.email_delivery (state=pending,
                              mail_run_id, merge, next_attempt_at=scheduled_at)
                                                         │
                    worker · MailRelay quét dòng `pending` ĐẾN HẠN
                                                         │
             MailConsumer: claim → cổng nhịp → suppression → composer → gửi
                                                         │
                                Resend ──> accepted ──> delivered
                                                         │
        POST /integrations/resend/webhooks ◄── svix ─────┤
                                                         │
                    ┌────────────────────────────────────┴──────────────┐
                    ▼                                                    ▼
        email_delivery.state (thư CÓ TỚI KHÔNG)          platform.mail_event
        delivered · bounced · complained · failed        OPEN · CLICK · UNSUBSCRIBE
        — đi qua advances(), chỉ tiến                    — cộng dồn, KHÔNG đụng state
```

**Lịch gửi không cần bộ quét thứ hai.** `scheduled_at` của run được ghi xuống
`next_attempt_at` của từng dòng gửi, và relay vốn đã lọc
`next_attempt_at <= now`. Thêm một scheduler riêng là thêm một thứ nữa có thể
chết lúc 3 giờ sáng.

Nhưng **trạng thái của LÔ** thì vẫn cần người nâng, và đó là việc của
`MailRunSweeper` — chung nhịp với relay, không phải một đồng hồ thứ hai. Hai
chỗ sai trong lượt nâng đó đã bịt 29/08 (lô kẹt `SCHEDULED`, cầu dao gộp toàn
bảng), cùng bậc thứ ba `CampaignSweeper` đóng chiến dịch khi mọi đợt đã ngã
ngũ; xem `ban-giao-campaign.md` § "Lượt 29/08".

---

## Bảy quyết định đã chốt

| #   | Quyết định                                                                | Lý do                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Đơn vị gửi là `platform.mail_run`**, không phải `sales.campaign_run`    | `email_delivery` ở `platform` và cần khoá ngoại tới thứ gom nhóm nó. Trỏ sang bảng `sales` là đảo đúng chiều phụ thuộc repo giữ chặt nhất. Lint bắt được ở TypeScript, **không** bắt được ở DDL         |
| 2   | `sales.campaign_run` chỉ là **dây nối** campaign ↔ mail_run               | Nó trỏ sales → platform, chiều được phép. Quick MAS không có dòng nào ở đây                                                                                                                             |
| 3   | **Mọi lần gửi đều tạo `mail_run`**, kể cả Quick MAS                       | Timeline ở chi tiết lead đọc ĐÚNG MỘT bảng. Hai nguồn cho một câu hỏi là hai câu trả lời lệch nhau sau một quý                                                                                          |
| 4   | **`mail_event` riêng; open/click KHÔNG đụng `email_delivery.state`**      | Thang `advances()` trả lời "thư có tới không". Mở trả lời câu khác và trả lời yếu hơn nhiều. Gộp là vừa hỏng thang vừa để tín hiệu mềm đè tín hiệu cứng. `mail-webhook.controller.ts:65` đã từ chối sẵn |
| 5   | **Nội dung snapshot trên `mail_run`; biến trộn trên từng dòng gửi**       | Sửa mẫu không được viết lại thư đã gửi tuần trước. Còn `merge` phải nằm trên dòng vì composer ở `platform` không được đọc `sales.lead` — nhánh Sales điền sẵn lúc xếp hàng                              |
| 6   | **Hai quyền gửi**, không phải một                                         | `lead.gửi-mail` đi kèm `ownOnly` (Sale gửi cho lead mình giữ) · `chiến-dịch.bắn` là bắn cả tệp, nhiều đợt. Gộp lại thì hoặc Sale được bắn chiến dịch, hoặc nút ở Sổ lead xám vĩnh viễn với Sale và BD   |
| 7   | **`satisfies Record<…, true>` cho danh sách CHECK**, không đọc `.options` | `drizzle-kit generate` nạp `*.schema.ts` bằng bộ nạp CJS riêng, và barrel ESM của `@pv/contracts` không sống sót — import về `undefined`. Xem "Ma sát" #1                                               |

---

## AUP của Resend — và vì sao nó đổi thiết kế

Tra ngày 28/08, [AUP](https://resend.com/legal/acceptable-use) cập nhật
27/08/2026:

> "You are prohibited from sending unsolicited messages of any kind, including
> **cold outreach, purchased lists, or scraped contact data**."
> "All mail must be sent to recipients who have **explicitly opted in**."

Hai trần cứng: **bounce < 4%**, **complaint < 0,08%** — vượt thì "account may
be shut down **without warning**", và chế tài là **cấp tài khoản**, không phải
cấp domain.

Hệ quả với sổ lead hiện tại: nguồn **`APOLLO` là dữ liệu mua**.

**Chủ dự án đã cân nhắc và quyết định KHÔNG chặn cứng** — nhãn nguồn là dữ liệu
nội bộ, không đi trong thư. Ghi lại để người sau đọc đúng bối cảnh: Resend
không phát hiện bằng nhãn, họ đo bounce và complaint. Danh sách B2B mua về
thường có 10–30% địa chỉ đã chết, tức một lô 200 dòng có thể ra 20–60 bounce —
gấp 5–7 lần trần. Rủi ro không nằm ở chỗ "có ai biết không" mà ở chỗ **con số
tự nói ra sau đúng một lô**.

Nên thay vì cấm, dựng bốn hàng rào bằng máy:

| Hàng rào                   | Làm gì                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| Preflight **cảnh báo**     | Hiện "N/M lead nguồn Apollo". Không cấm bấm — quyết định là của người           |
| **Cầu dao** trong lúc chạy | Bounce vượt `PV_MAS_BOUNCE_CEILING_PERCENT` (mặc định 4,0) → run TỰ DỪNG        |
| `PV_MAS_RESEND_API_KEY`    | Để trống = dùng chung khoá hiện tại. Điền vào là tách tài khoản, không sửa code |
| Trần lô `PV_MAS_BATCH_MAX` | Mặc định 200                                                                    |

Cầu dao là cái quan trọng nhất khi còn dùng **một** tài khoản: nó là thứ duy
nhất chặn một danh sách xấu bắn hết 200 dòng trước khi có người nhìn màn hình.

**Còn treo, chưa quyết:** nguồn nào tính là đã đồng ý. `LANDING_PAGE` hôm nay
được coi là có — nhưng khách điền form liên hệ chỉ đồng ý _được trả lời_, chưa
đồng ý _nhận chuỗi marketing_; muốn chặt thì form phải có ô tick riêng. Và
`IMPORT` thì máy không phân biệt được file hội thảo với file mua — chặt thì cần
một cột `consent_at` trên `lead` do người nạp khai.

---

## Địa chỉ gửi — quy cách đầy đủ nằm trong `.env`

`apps/api/.env` có một khối bình luận dài giải thích từng phần của
`PV_EMAIL_MAS_FROM`. Tóm tắt bốn luật, chi tiết đọc ở đó:

```
notify.pebblevina.com   → transactional, đã warm-up, ĐỪNG đụng
go.pebblevina.com       → MAS (khuyến nghị, verify riêng trên Resend)
pebblevina.com          → TUYỆT ĐỐI KHÔNG bắn bulk — root chở Workspace của nhân viên
```

1. Subdomain marketing riêng, warm-up riêng, không thừa hưởng của `notify.`
2. Local part giống tên người (`quan@`), **không** `no-reply@`/`info@`/`marketing@`
3. Tên hiển thị: người + công ty — B2B thắng rõ so với tên thương hiệu trần
4. Domain phải đã verify trên Resend; kiểm bằng `dig`, đừng tin dashboard

Và: **giữ nguyên local part qua các đợt.** Đổi địa chỉ gửi liên tục là dấu hiệu
snowshoe spam, mỗi lần đổi là reset reputation về 0.

---

## Đã dựng

```
packages/contracts/src/sales/mail.ts       MỚI — hợp đồng zod của cả cụm
packages/engines/src/e2-access.ts          + 'chiến-dịch.bắn' · 'lead.gửi-mail'
packages/tokens/src/tokens.ts              + swatch 'Azure' #2E63E6 (mail template cần hex)
packages/mail-templates/src/mas-shell.tsx  MỚI — khung thư marketing
packages/ui/src/patterns/stepper.tsx       MỚI (M-14) — modal MAS dùng chung

apps/api/src/platform/mail/mail-run.schema.ts        MỚI — platform.mail_run
apps/api/src/platform/mail/mail.schema.ts            + mail_event · merge · mail_run_id (FK)
apps/api/src/branches/sales/campaign/campaign.schema.ts  MỚI — 4 bảng + sequence CP-nnnn

apps/api/drizzle/0007_mas_mail_run.sql     migration, đã chạy thật trên PGlite
apps/api/.env                              + khối MAS (8 biến, có quy cách địa chỉ)
```

**Chữ trong khung thư còn là `PLACEHOLDER_PARAGRAPHS`.** Nội dung thật của sản
phẩm chip bán dẫn AI ngoại biên chưa được cung cấp, và không được bịa — thông
số một con chip bịa ra trong thư gửi khách thật là loại sai đắt nhất. Comment
trong file ghi rõ: thay trước khi `PV_MAS_ENABLED=true`.

---

## Ba ma sát đã vấp — đừng vấp lại

1. **`*.schema.ts` không được import GIÁ TRỊ từ `@pv/contracts`.** Ba file đang
   import nó (`lead` · `config` · `contract`) đều chỉ import **kiểu**, bị xoá
   trước khi bộ nạp thấy. Import một giá trị thật (`MailRunState.options`) làm
   `drizzle-kit generate` chết với `Cannot read properties of undefined`. Cách
   vá: danh sách tại chỗ + `satisfies Record<Enum, true>` để thiếu/thừa thành
   lỗi biên dịch.
2. **Vòng import giữa hai file lược đồ.** `email_delivery` trỏ `mail_run`, còn
   `mail_event` trỏ ngược `email_delivery`. Vì thế `mail_event` nằm cùng file
   với sổ gửi, `mail-run.schema.ts` chỉ giữ `mail_run` — mũi tên một chiều.
3. **`drizzle-kit generate` hỏi tương tác khi đổi tên cột**, đúng bẫy
   `ban-giao-db.md` đã ghi. Thêm vào đó: nếu cây làm việc có lược đồ dở dang
   của phiên khác, prompt sẽ hỏi về bảng của họ và migration sinh ra sẽ gói cả
   việc chưa xong của họ. Cách xử: `git worktree` tách từ HEAD, chỉ chép lược
   đồ của mình vào, sinh ở đó rồi chép migration về.

---

## Nợ đang có

1. **Chưa quyết nguồn nào là "đã đồng ý"** — xem mục AUP ở trên. Đây là nợ
   nặng nhất vì nó quyết định tính hợp lệ của cả tính năng.
2. **Nội dung template chip AI ngoại biên chưa có.**
3. **`packages/contracts` không có rào `no-restricted-imports`** trong
   `eslint.config.js`, trong khi `apps/**`, `packages/ui/**`,
   `packages/engines/**`, `packages/mail-templates/**` đều có. Nghĩa là không
   gì chặn package này import `@api/*`. Nên đóng lại.
4. **`sales.campaign` không phải `ObjectKind`** nên `E1.story()` không đi ngược
   từ lead về chiến dịch — nợ #4 của `ban-giao-db.md`, chưa trả.
5. **Màn `/campaigns` vẫn đứng trên SOURCE (`SR-nn`), không phải `sales.campaign`.**
   Mô hình đã CHỐT 28/08 — tách riêng, không hợp nhất (D2 ở
   `con-thieu-mas-mail.md`) — và `sales.campaign` (`CP-nnnn`) đã có CRUD thật,
   xem [`ban-giao-campaign.md`](./ban-giao-campaign.md). Việc còn lại là FE:
   đổi tên màn cũ thành "Nguồn dẫn" và dựng Sổ chiến dịch mới đọc bảng thật —
   chưa làm.
6. ~~**Reaper cho dòng kẹt `sending`**~~ — **ĐÃ TRẢ.** `MailRelay.sweep()` gọi
   `reapStuckSending()` ở đầu mỗi nhịp: dòng `sending` quá 300s được trả lại
   hàng đợi, hết lượt thử thì parking. Doc này ghi thiếu, sửa 29/08.
7. **Đường lịch: bốn chỗ sai đã bịt 29/08** — lô `SCHEDULED` kẹt vĩnh viễn khi
   mọi thư đều bị chặn · `sales.campaign` không bao giờ thành `DONE` · cầu dao
   gộp toàn bảng mỗi 12 giây · `email_delivery.mail_run_id` không có index.
   Chi tiết, lý lẽ và bản ghi kiểm tay ở
   [`ban-giao-campaign.md`](./ban-giao-campaign.md) § "Lượt 29/08". Kèm ba
   hàng rào `env.ts` chặn bắn bulk từ domain transactional, chặn liên kết huỷ
   đăng ký trỏ localhost, chặn địa chỉ bưu chính giữ chỗ — đọc mục đó trước
   khi bật `PV_MAS_ENABLED` ở bất kỳ máy nào.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
hợp đồng + migration (XONG)
        │
   đường gửi platform (ledger · registry composer · MasComposer · token unsubscribe)
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
đường phản hồi                endpoint Sales
(open/click → mail_event ·    (preflight · tạo run · enqueue lô ·
 route huỷ đăng ký)            cảnh báo Apollo · cầu dao)
   └────────────┬─────────────────┘
                ▼
   FE: modal stepper dùng chung → timeline ở chi tiết lead → chuỗi đợt chiến dịch
                ▼
   soát 15 luật Aurora → migrate Neon → canary MỘT lô 20–30 địa chỉ
```

Canary của MAS **không** giống canary của transactional: gửi một lô nhỏ vào
hộp thư của chính mình chưa đủ, vì thứ cần đo là **bounce rate trên địa chỉ
thật**. Lô đầu 20–30 địa chỉ thật, xem số, rồi mới mở lô lớn.
