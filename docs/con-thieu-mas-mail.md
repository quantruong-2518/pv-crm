# Còn thiếu — MAS mail

Lát cắt **28/08/2026**, sau lượt A+C+D (D = CRUD chiến dịch). Đọc cùng
[`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md) (đường gửi) và
[`ban-giao-campaign.md`](./ban-giao-campaign.md) (CRUD `sales.campaign`, đóng
A3+D2 bên dưới) — hai file đó ghi **đã dựng gì và vì sao**, file này ghi **còn
thiếu gì và ai phải làm**.

Mỗi mục ghi đủ bốn thứ: **cái gì · ở đâu · làm thế nào · vì sao chưa**. Làm
xong thì XOÁ mục đó, đừng đánh dấu ✅ — danh sách này chỉ có nghĩa khi nó ngắn.

---

## Trạng thái một dòng

Đường gửi **chạy thật và có mặt tiền**: Sổ lead soạn được một lô, xem trước
được ai bị chặn, bấm gửi ra `mail_run` thật; chi tiết lead có thẻ timeline đọc
`GET /sales/leads/:code/mail`. Lược đồ nay đã có trên Neon — `0000…0013` chạy
xong 28/08. Nhưng Fly vẫn là image cũ, năm biến bắt buộc còn rỗng, và nội dung
mẫu mail vẫn là một cái khung chưa duyệt, nên **chưa lá MAS nào rời khỏi máy**.

Nói gọn: **backend, mặt tiền và lược đồ xong; nội dung mồi và vận hành thì
chưa.**

---

## A · BACKEND

### A2 · Mẫu `mas-edge-ai-intro` mới là KHUNG, chưa có nội dung thật

**Cái gì.** Migration `0013_mas_template_seed.sql` đã nạp một mẫu vào
`sales.mail_template`, nên ô chọn mẫu không còn rỗng. Nhưng nội dung của nó là
một cái khung: mọi chỗ chưa biết nằm trong ngoặc vuông `[…]`.

**Ở đâu.** `apps/api/drizzle/0013_mas_template_seed.sql`. Ba lớp chặn đang dựa
vào chính ký hiệu ngoặc vuông đó — panel soạn mail **khoá nút gửi** khi tiêu đề
hoặc thân còn `[…]` (`unfilledSlots` ở `components/mas-mail-drawer.tsx`).

**Làm thế nào.** Chủ dự án cấp bốn thứ: tên dòng sản phẩm · một câu định vị ·
CTA dẫn đi đâu · số liệu nào được phép in. Rồi `UPDATE sales.mail_template SET
subject = …, body = …, cta_url = … WHERE code = 'mas-edge-ai-intro'` — một
migration nữa, hoặc một màn cấu hình mẫu mail nếu dựng.

**Vì sao chưa.** Bịa thông số một con chip bán dẫn AI ngoại biên vào thư gửi
khách là loại sai đắt nhất có thể mắc ở đây: người nhận sẽ hỏi lại đúng con số
đó.

> **A3 đã xong 28/08 (lượt D).** `POST/GET /sales/campaigns`,
> `GET/PATCH /sales/campaigns/:code`, `POST .../members`, `POST .../start`,
> `POST .../stop` — bốn file theo khuôn `lead/`, kiểm tay qua PGlite (tạo →
> thêm 2 thành viên → hẹn giờ một đợt → thấy ở `GET /sales/mail/runs?campaign=`
> → huỷ trước giờ gửi). `sales.campaign` hết rỗng. Chi tiết và tám quyết định
> đã chốt: [`ban-giao-campaign.md`](./ban-giao-campaign.md). Việc còn lại là
> FE — xem **C2**.

### A6 · Cửa huỷ lô chưa có màn nào gọi

`PATCH /sales/mail/runs/:id` đã dựng và chạy đúng (403 khi thiếu
`chiến-dịch.bắn`, 404 khi không có lô, `held` đếm số thư chưa gửi bị giữ lại,
bấm lần hai là idempotent). Nhưng **không màn nào gọi nó**: chỗ duy nhất gọi
được là một sổ lô gửi, mà chưa màn nào đọc `GET /sales/mail/runs`. Người dùng
vì thế vẫn chưa huỷ được một lô đã hẹn giờ bằng giao diện.

Dựng sổ lô gửi là việc tiếp theo, và nó cũng là chỗ duy nhất hiện được mười một
con số của `MailRunRow` (bounce · phàn nàn · huỷ đăng ký) — thứ quyết định có
được mở lô lớn hay không.

---

## B · CƠ SỞ DỮ LIỆU

> **B1 và B2 đã xong 28/08, xoá theo quy ước ở đầu file.** Cả chuỗi `0000…0013`
> đã áp lên Neon, và `0010`…`0013` đã commit cùng lược đồ module cơ hội trong
> `e210658` — hai phiên phối hợp trong một lượt, đúng như B2 đề nghị.
>
> Số liệu sau khi áp, đọc từ chính Neon: 16 cơ hội · 16 dòng `opportunity_owner`
> · 122 lead · 6 hợp đồng; `email_suppression` rỗng nên hai CHECK của `0012`
> không vướng dòng nào; `mail_template` nhận đúng một dòng `mas-edge-ai-intro`
> ở `active=true`. Chi tiết: [`ban-giao-co-hoi.md`](./ban-giao-co-hoi.md).
>
> **Hệ quả cần nhớ:** lược đồ production nay ĐI TRƯỚC code production. Fly vẫn
> chạy image cũ, chưa biết `sales.opportunity_owner` lẫn `sales.mail_template`.
> Deploy là bước kế tiếp, không phải migrate.

### B4 · `sales.campaign` không phải `ObjectKind`

Nên `E1.story()` không đi ngược từ lead về chiến dịch đã chạm nó, và ContextRail
không vẽ được dây đó. Nợ #4 của `ban-giao-db.md`, chưa trả. Cần thêm kind `CP`
vào `packages/engines/src/types.ts` và một dòng gương trong `platform.object`
mỗi lần tạo chiến dịch. Đi sau **A3**.

---

## C · FRONT-END

### C1 · Sổ lô gửi chưa có màn

`GET /sales/mail/runs` đã dựng, `MailRunRow` chở đủ mười một con số, nhưng
không màn nào đọc. Hệ quả cụ thể: không ai nhìn được tỉ lệ bounce và tỉ lệ phàn
nàn của một lô — hai con số quyết định tài khoản Resend còn sống hay không — và
cửa huỷ lô (**A6**) không có chỗ để bấm.

`data/mas.ts` cố tình CHƯA khai query cho hai cửa này: một query không màn nào
gọi là một khai báo quyền không ai bảo trì.

### C2 · Chuỗi đợt của chiến dịch — A3 và D2 đã xong, còn đúng phần FE

`pages/campaigns.tsx`/`campaign-detail.tsx`/`campaign-parts.tsx` vẫn đứng trên
fixture `Source`/`Wave` (mã `SR-`/`SK-`), chưa đọc `sales.campaign` thật —
mọi nút ghi (Lưu nháp, Bắt đầu chạy, Dừng, "Thêm đợt vào chuỗi") vẫn chỉ
`setState` cục bộ. Backend (**A3**) và mô hình (**D2**) không còn là lý do
chưa làm nữa — cái thiếu bây giờ đúng là ba việc FE độc lập: `data/campaign-book.ts`
đọc CRUD thật, một Sổ chiến dịch mới (reclaim path `/sales/campaigns`), và một
bước "Lịch gửi" trong `mas-mail-drawer.tsx` nhận `campaignCode`/`scheduledAt`
(cả hai đã có sẵn ở `MasSendRequest`). Việc tiếp theo theo thứ tự:
[`ban-giao-campaign.md`](./ban-giao-campaign.md).

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

**Mới:** `PV_MAS_ENABLED` nay **thật sự gác** cửa gửi (`MasService.send` trả 409
kèm câu nói rõ tên biến). Nghĩa là đặt `false` là dừng được chiến dịch mà không
đụng tới mail giao dịch — nhưng cũng nghĩa là mọi máy dev phải khai đủ bốn biến
trên mới bấm gửi được.

> **D2 đã chốt 28/08: tách riêng, đổi tên — không hợp nhất.** `sales.campaign`
> (mã `CP-`) là chiến dịch GỬI thật (module 5, xem
> [`ban-giao-campaign.md`](./ban-giao-campaign.md)); màn `/campaigns` cũ đứng
> trên **SOURCE** (mã `SR-`/`SK-`) đổi tên "Nguồn dẫn" — quyết định đã chốt,
> nhưng đổi `path`/nhãn trên UI CHƯA làm, xem **C2**. `campaign.source_id`
> (cột thêm cùng lượt) là dây nối báo cáo giữa hai bên, không phải một bước
> hợp nhất mô hình.

### D3 · Subdomain marketing chưa có

`go.pebblevina.com` (hoặc `mas.`) chưa verify trên Resend. Lô canary 28/08 đi
nhờ `notify.pebblevina.com` — **chấp nhận được cho 4 địa chỉ của chính mình,
không chấp nhận được cho một đợt thật**: một lần complaint cao trên subdomain
đó sẽ kéo theo mail báo lead mới.

### D4 · Nguồn nào tính là "đã đồng ý"

Chưa quyết. Hôm nay `APOLLO` chỉ bị **cảnh báo**, không bị chặn — quyết định có
ý thức của chủ dự án, ghi ở `ban-giao-mas-mail.md`, và panel soạn mail in cảnh
báo đó ra thành một đoạn đọc được. Nhưng `LANDING_PAGE` cũng chưa chắc: khách
điền form liên hệ đồng ý _được trả lời_, chưa đồng ý _nhận chuỗi marketing_.
Muốn chặt thì form cần ô tick riêng, và `IMPORT` cần một cột `consent_at` do
người nạp khai — máy không phân biệt được file hội thảo với file mua.

### D5 · Tài khoản Resend thứ hai

`PV_MAS_RESEND_API_KEY` nay **đã được đọc thật**: khai vào `env.ts`, và
`ResendMailDriver` chọn tài khoản theo `MailMessage.flow` (`transactional` vs
`mas`). Để trống = dùng chung `RESEND_API_KEY`, và log lúc khởi động nói rõ hai
đường đã tách hay chưa.

Việc còn lại là **mở tài khoản Resend thứ hai và điền khoá**. Chế tài của Resend
là khoá **cấp tài khoản**: tách domain cứu reputation, chỉ tài khoản thứ hai mới
cứu được đường transactional khỏi một lệnh khoá.

### D6 · Webhook chưa nhận được gì trên production

Cần `RESEND_WEBHOOK_SECRET` trong `fly secrets` **và** khai endpoint trên
dashboard Resend. Chưa có thì `mail_event` mãi rỗng, `openCount`/`clickCount`
trên timeline của lead mãi bằng 0, và thẻ đó nói "chưa có tín hiệu mở" cho mọi
lá thư — đúng về mặt dữ liệu, nhưng vì hạ tầng chứ không phải vì người nhận.

Kèm theo: `applyWebhook` nay ghi lại **câu giải thích của nhà cung cấp** vào
`email_delivery.last_error_summary` (trước đây nhận rồi vứt). Đó là thứ
`LeadMailTimelineRow.failReason` in ra, nên trước khi webhook chạy thì mọi lá
thư bounce vẫn chưa nói được vì sao.

---

## Thứ tự chặn nhau

```
A2 nội dung mẫu ──> gửi được lô THẬT có nội dung duyệt rồi
C2 chuỗi đợt (D2 + A3 đã xong, chỉ còn ba việc FE) ── yêu cầu 3
C1 sổ lô gửi ──> A6 có chỗ bấm huỷ ──> đo được bounce/complaint của lô

deploy Fly ──> D1 khai biến ──> D3 subdomain ──> canary lô THẬT 20–30 địa chỉ
                                D6 webhook ────> timeline mới có số mở/click
```

Canary của MAS **khác** canary của transactional: gửi vào hộp thư của chính mình
không đủ, vì thứ cần đo là **bounce rate trên địa chỉ thật**. Lô đầu 20–30 địa
chỉ, xem số, rồi mới mở lô lớn — trần Resend là bounce 4% và complaint 0,08%,
vượt là khoá tài khoản không báo trước.

---

## Đường ngắn nhất tới "dùng được ngoài đời"

Mặt tiền đã xong, nên phần còn lại là vận hành chứ không phải code:

1. **A2** — chủ dự án cấp nội dung, `UPDATE` một dòng
2. **Deploy Fly + D1** — lược đồ đã lên Neon rồi, còn thiếu image mới và năm
   biến (`PV_MAS_ENABLED` nay gác thật)
3. **D3** — verify subdomain marketing trên Resend
4. **D6** — khai webhook, để có số mở/click thật
5. Lô canary 20–30 địa chỉ thật, đọc số, rồi mới mở lô lớn

**C1 sổ lô gửi** nên chen vào trước bước 5: không có nó thì lô canary chạy xong
mà không ai đọc được bounce rate của nó — tức là canary không đo được thứ nó
sinh ra để đo.
