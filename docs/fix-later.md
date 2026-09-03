# Nợ đã biết — sửa sau

Những thứ đã tìm ra nguyên nhân nhưng cố ý chưa sửa. Mỗi mục ghi đủ bốn thứ:
**triệu chứng · nằm ở đâu · sửa thế nào · vì sao chưa sửa**. Sửa xong thì xoá mục
đó khỏi file, đừng đánh dấu ✅ — danh sách này chỉ có nghĩa khi nó ngắn.

Ghi ngày 28/08/2026, trong phiên nối máy chủ tại máy vào Neon.

---

## 1 · `leadFacetQuery` gãy khi sổ vượt 200 lead — Neon đang ở 121

**Triệu chứng (chưa xảy ra, sẽ xảy ra):** hai ô lọc "Lead PIC" và "Account"
lặng lẽ thiếu giá trị. Người dùng không tìm thấy người hoặc công ty họ biết
chắc là có, và không có gì trên màn nói vì sao.

**Ở đâu:** `apps/web/src/data/leads.ts` · `leadFacetQuery` — gọi
`GET /sales/leads?status=all&size=200` chỉ để dựng danh sách chọn. `size=200`
là trần cứng của `PageQuery` trong `@pv/contracts`, nâng trần chỉ dời ngày gãy.

**Sửa thế nào:** thêm `GET /sales/leads/facets` trả owner và account đã
`SELECT DISTINCT` ở SQL, kèm số dòng mỗi giá trị. Một câu truy vấn trên cột đã
có index, thay cho việc kéo cả sổ về trình duyệt.

**Vì sao chưa sửa:** hôm 22/08 sổ mới có 100 dòng nên chưa ai thấy. Nay Neon có
**121** và mỗi lead nhập tay lại cộng một. Còn **79 dòng nữa là hỏng**, và nó
hỏng thầm lặng — đây là mục gấp nhất trong file này.

Cùng lượt gọi đó còn nuôi dải "Ghim của tôi" và khoá chống trùng của panel nạp
tệp; ngày có endpoint facet thì hai chỗ đó chuyển sang đường riêng, đừng kéo
chắp vá đi theo.

---

## 2 · Sổ cuộc họp còn thiếu ba việc

Mục "thẻ điểm đọc fixture" đã trả ngày 29/08 và xoá theo quy ước ở đầu file:
`GET /sales/leads/scorecard` đếm thật, `ScoreCards` hết import `FUNNEL` và
`FIRST_MEETINGS`. Thứ mở khoá được nó là `sales.meeting` — `FIRST_MEETINGS` nay
là "số lead có ít nhất một buổi họp", định nghĩa duy nhất suy được từ cột thật.

Ba việc còn lại của chính lượt đó:

**a · `PATCH` chưa có mặt tiền.** `useEditMeeting` đã viết, cửa
`PATCH /sales/leads/:code/meetings/:id` đã chạy, nhưng không nút nào gọi — thẻ
mới chỉ có ghi và xoá. Sửa một buổi ghi nhầm giờ phải xoá rồi ghi lại, và thao
tác đó mất luôn dòng `touch` cũ.

**b · Không xoá được `link` bằng `PATCH`.** `textNhapTuyChon` biến chuỗi rỗng
thành vắng mặt, mà vắng mặt nghĩa là "không đụng tới" — nên không có đường nào
gỡ một link dán nhầm. Cần một quy ước cho "xoá ô này" (`null` tường minh trên
dây) trước khi làm **a**.

**c · Khách vẫn là chữ gõ tay.** `meeting_attendee.actor_id` NULL với mọi khách
vì phía khách chưa có bảng nào — `LeadContact` còn sinh từ fixture. Ngày có sổ
liên hệ thật thì đây là chỗ đầu tiên mọc thêm khoá ngoại, và hai buổi họp với
cùng một người sẽ hết là hai chuỗi tên rời nhau.

---

## 3 · Ba màn còn ăn fixture vì máy chủ chưa có route

**Ở đâu:** các query còn truyền `load:` trong `apps/web/src/data/` — và `load:`
CHÍNH LÀ dấu hiệu, theo nghi thức ở docblock đầu `app/api/client.ts`: còn `load`
là còn đọc fixture, vắng `load` là đã đi HTTP thật. Không có cờ nào khác.

| Query                        | File                  | Route ở `apps/api` |
| ---------------------------- | --------------------- | ------------------ |
| `/sales/plan`                | `plan.ts:362`         | chưa có            |
| `/sales/config`              | `sales-config.ts:186` | chưa có            |
| `/sales/performance/:period` | `performance.ts:948`  | chưa có            |
| `frozenLeadBookQuery`        | `leads.ts:196`        | dùng bởi 3 màn     |

Ba dòng đã RỤNG khỏi bảng này vì endpoint đã lên và `load:` đã bỏ: chiến dịch
(`/sales/campaigns/{sources,totals}`, lượt 2 của đợt bỏ mock), sổ cơ hội
(`/sales/opportunities`, cắt 28/08 rồi mở rộng lọc/sắp/thẻ điểm 29/08) và sổ
hợp đồng (`/sales/contracts{,/:code,/summary}`, cắt 03/09 — cả ba màn của chuỗi
drill, và `TODAY` đóng băng theo đó mà đi).

**Sửa thế nào:** dựng endpoint từng nhánh một, rồi bỏ dòng `load:` của query đó.

**Vì sao chưa sửa:** đây là dựng backend, không phải dọn dẹp. Gỡ `load:` mà chưa
có endpoint là màn chết trắng.

**Hệ quả đang sống chung:** ba màn còn lại đếm theo sổ đóng băng (100 dòng),
Sổ lead đếm theo Neon (121). Hai số lệch nhau là **đúng thiết kế đợt này**,
không phải bug. Màn chiến dịch, sổ cơ hội và sổ hợp đồng đã ra khỏi diện này —
cả ba đếm theo Neon.

**Nợ còn lại của lượt cắt hợp đồng (03/09):** cột "Đang chặn" đã gỡ khỏi sổ và
chưa có đường trả lại. `GET /sales/contracts` gửi `InstallmentSummaryRow` — bản
gọn, CỐ Ý không chở `conditions` — nên `blocking` trên một dòng sổ luôn là `null`
về mặt cấu trúc. Giữ cột lại là in "Không tắc việc nào" cho mọi hợp đồng, tức là
một lời khẳng định chứ không phải một ô trống. Trả lại được bằng hai cách, cả hai
đều ở máy chủ: bồi `conditions` vào dòng sổ (đắt, và đúng thứ bản gọn tránh), hoặc
thêm một phép đếm điều kiện trễ theo từng hợp đồng vào chính lượt đọc sổ.

Hai nợ kia của lượt đó đã trả trong ngày: `ContractRow` nay chở `customer`
(repository vốn đã select `lead.company`, chỉ mapper vứt đi), và `ContractSummary`
nay đếm điều kiện trễ theo bên nên thẻ "Việc đang trễ" đã về lại hàng KPI.

---

## 4 · CORS khớp tuyệt đối — mỗi domain mới là một lần gãy

**Triệu chứng:** landing page ở origin mới bị chặn ở preflight, thông báo
_"No 'Access-Control-Allow-Origin' header is present"_. Gặp thật ngày 28/08 với
`https://web-delta-lilac-19.vercel.app`.

**Ở đâu:** hai cổng, đọc chung biến `PV_CORS_ORIGINS`, cùng so khớp nguyên chuỗi

- `apps/api/src/main.ts` — `configuredOrigins.has(origin)`
- `apps/api/src/branches/sales/lead/lead-intake.guard.ts:115` — `.includes(origin)`

Nên `pebblevina.com` ≠ `www.pebblevina.com` ≠ `http://pebblevina.com`, và mỗi
URL preview Vercel là một origin mới. Nhánh regex `localhost:<port>` chỉ sống
khi `NODE_ENV=development`.

**Sửa thế nào — ba đường, khuyên đường đầu:**

1. Gắn **domain cố định** cho landing page (`landing.pebblevina.com`), khai một
   lần rồi quên. Không sửa code, không nới cửa.
2. Cứ khai thêm mỗi lần có domain mới. Ổn nếu danh sách ngắn và ít đổi.
3. Sửa code cho khớp theo mẫu (`*.vercel.app`). **Phải sửa cả hai chỗ cùng lúc** —
   sửa một chỗ thì qua được CORS rồi ăn 403 ở guard. Và phải cân nhắc: cửa
   `intake` là cửa ẩn danh, mở cho cả dải `*.vercel.app` nghĩa là bất kỳ ai
   deploy một trang lên Vercel cũng gửi lead vào CRM được.

**Đừng tin CORS như một hàng rào:** curl không gửi header `Origin` thì
`assertOrigin` cho qua thẳng (`lead-intake.guard.ts:111`), mọi client không phải
trình duyệt đều đi lọt. Thứ thật sự giữ cửa là rate limit theo IP và theo trang,
trần body 16 KB, và ô honeypot `website`.

**Cách khai:** `fly secrets set` **ghi đè** cả biến chứ không cộng thêm — phải
liệt kê lại mọi origin đang chạy, thiếu một cái là nó chết theo. Dò danh sách
hiện tại bằng preflight (`OPTIONS` trả 204 kèm `access-control-allow-origin` =
origin đó đang được phép); tính đến 28/08 chỉ có `https://pebblevina.com`.

---

## 5 · Hai dòng bản thử còn nằm trong Neon

```
LD-0233  Pebble Vina Mail Pipeline Check  ·  "Claude Pipeline Check 2026-08-28"
LD-0232  Pebble Vina API Smoke Test       ·  "Codex Smoke Test 2026-08-27 15:34"
```

Hai bản thử đi qua cửa `intake` công khai và ở lại, đứng đầu Sổ lead vì mới nhất.

**Sửa thế nào:** script `apps/api/scrub-smoke-rows.mjs` đã viết sẵn — chạy
không cờ thì chỉ soi và ghi bản sao, `--apply` mới xoá, tất cả trong một
transaction. Lượt soi cho thấy đúng 6 dòng dính: 2 `sales.lead` · 2
`platform.object` · 2 `sales.lead_intake`; không dính opportunity, edge, audit.

Thứ tự xoá không tuỳ tiện: `sales.lead.code` vừa là khoá chính vừa
`references platform.object.code`, phải xoá con trước cha.

**Vì sao chưa sửa:** phiên 28/08 bị harness chặn lệnh xoá dữ liệu production.
Cần người chạy tay.

**Lưu ý ngược dòng thiết kế:** `lead.schema.ts:132` viết rõ _"leads leave the
funnel through `exit_reason`, they are not deleted"_ và cố ý không đặt
`ON DELETE CASCADE`. Hard delete là ngoại lệ mở riêng cho hai dòng bản thử —
**đừng dùng lại script này cho lead thường.**

---

## 6 · Nhãn bậc · ngành · lý do rơi vẫn đọc fixture

`LeadRow` trên dây còn chở khoá chữ thường cũ (`cho-ky`, `chip`) chứ chưa phải
ID cấu hình, nên màn phải tra nhãn từ fixture. Chỉ **Nguồn** đã nối được vào sổ
nguồn thật qua `salesCatalogQuery`. Nợ này đã ghi ở `docs/tich-hop-be.md`; chép
lại đây để danh sách đủ mặt.

---

## 7 · Hàng rào chống dò mật khẩu chỉ sống trong RAM của một tiến trình

**Triệu chứng (chưa xảy ra):** ai đó dò mật khẩu một hòm thư đã biết. Sau 5 lần
sai, tiến trình đang phục vụ họ bắt đầu chờ 30 giây rồi nhân đôi. Nhưng phanh
đó là một `Map` trong RAM — thêm một máy API là thêm một ngân sách 5 lần nữa,
và một lần deploy là bộ đếm về không.

**Ở đâu:** `apps/api/src/platform/auth/attempt-throttle.ts`, dùng ở
`auth.service.ts` cho cả `/auth/sign-in` lẫn `/auth/forgot-password`.

**Sửa thế nào:** chuyển sang Postgres, đúng hình `sales.lead_intake_rate` đang
dùng cho cửa intake công khai — cùng vấn đề, đã có lời giải trong repo.

**Vì sao chưa sửa:** Fly đang chạy `min_machines_running = 1` cho process `api`,
nên hôm nay một tiến trình đúng là toàn bộ hệ. Ngày `fly scale count` lên 2 là
ngày con số 5 thành 10 mà không ai đổi dòng nào — **scale trước, sửa mục này
trước.** scrypt (~100 ms mỗi lần thử) vẫn là tầng phanh dưới cùng và nó không
phụ thuộc tiến trình.

---

## 8 · Thư đặt mật khẩu không hỏi sổ chặn

**Triệu chứng:** một địa chỉ đã hard-bounce hoặc đã huỷ đăng ký vẫn được gửi
thư đặt mật khẩu. Thư trượt, và ngoài một dòng log thì không ai biết.

**Ở đâu:** `apps/api/src/platform/auth/password-reset.mailer.ts` — gửi thẳng
qua `MAIL_PORT`, không đi qua `MailLedger.isSuppressed` như mọi lá thư khác.

**Sửa thế nào:** không hiển nhiên, và đó là lý do mục này là một câu hỏi chứ
không phải một việc. Chặn thật thì một người có địa chỉ trong sổ chặn **không
bao giờ đặt lại được mật khẩu** — tệ hơn hẳn cái đang có. Đường đúng nhiều khả
năng là vẫn gửi, nhưng báo cho màn Quản trị biết địa chỉ đó đang bị chặn để
người quản lý đưa link tận tay.

**Vì sao chưa sửa:** tiêm `MAIL_LEDGER` vào module xác thực là trao luôn cả
`claim`/`markAccepted`/`suppress` — một quyền rộng hơn hẳn thứ cần dùng. Cần
quyết hình dạng trước, không phải viết code trước.

---

## 9 · Cây có HAI bản `fastify`

**Triệu chứng:** `app.register(cookie)` không biên dịch được — TS so một
`FastifyInstance` đã được plugin augment với một bản chưa augment.

**Ở đâu:** `@nestjs/platform-fastify` kéo `fastify` 5.11.3, `apps/api` khai
5.12.1. `declare module 'fastify'` của `@fastify/cookie` chỉ bám vào 5.12.1.

**Sửa thế nào:** một bản duy nhất — khớp version, hoặc `pnpm.overrides`.

**Vì sao chưa sửa:** đã đi vòng bằng `adapter.getInstance<FastifyInstance>()`
nên cookie chạy đúng. Sửa thật là đụng lockfile, và bất kỳ plugin Fastify nào
sau này cũng vấp lại đúng chỗ này — nên nó là bẫy còn nằm đó, không phải lỗi
đang cháy.

---

## 10 · `sales.contract` không gác "một đơn một hợp đồng" ở tầng bảng

**Triệu chứng:** chưa thấy được, và đó là lý do nó nằm đây. Bất biến "mỗi cơ hội
nhiều nhất một hợp đồng" hôm nay chỉ do cửa `POST /sales/opportunities/:code/contract`
giữ, bằng cách trả 409 khi đơn đã ký. Không có ràng buộc nào ở bảng.

**Nằm ở đâu:** `apps/api/src/branches/sales/contract/contract.schema.ts` —
không có `uniqueIndex` nào trên `(opportunity_code, lead_code)`. Chỗ bị đau là
`OpportunityRepository`: từ 29/08 ba đường đọc (`book` · `byCode` · `forMail`)
lấy `signed` và `contractCode` bằng `LEFT JOIN` sang `contract`. Hai dòng hợp
đồng cho một đơn thì `book()` **nhân đôi dòng đó**, trong khi `total` đếm riêng
trên `opportunity` vẫn nói một — sổ hiện 17 dòng và chú thích bảo 16.

**Sửa thế nào:** một unique index. **KHÔNG phải `DISTINCT`** ở câu truy vấn:
`DISTINCT` làm triệu chứng biến mất và để nguyên hai dòng trong bảng, tức lần
sau nó lộ ra ở một câu khác mà không ai nối được về đây.

**Vì sao chưa sửa:** thêm unique index là một migration, mà `.env` đang trỏ
thẳng Neon production và luật hiện hành chỉ cho `db:migrate` khi file SQL không
có `DROP`. Index thì không `DROP` gì, nên việc này **làm được** — nhưng phải
đếm trước: nếu production đã lỡ có một đơn hai hợp đồng thì migration gãy giữa
chừng, và câu đếm đó chưa ai chạy.

---

## 11 · Vặt

- `docs/tich-hop-landing-page.md:198` — ví dụ `curl` còn dùng `localhost:3000`,
  trong khi cổng tại máy đã chốt **4123** ở `apps/api/.env`, `apps/web/.env`,
  `.env.example` và hai doc còn lại. Copy nguyên dòng đó ra chạy sẽ trượt.
- `apps/web/src/data/leads.ts` — docblock `leadFacetQuery` nói "sổ có 119 dòng";
  Neon nay 121, fixture vẫn 100. Con số trong văn xuôi sẽ còn trôi, đừng dựa vào nó.
- **Khối "một ô form" đã có NĂM bản**: `components/ops-fields.tsx:51` (đã export),
  `mas-mail-modal.tsx:699`, `pages/source-parts.tsx:92`, `auth-card.tsx:79`
  (`AuthField`), `pages/users-parts.tsx:655` (`FormField`). Nó KHÔNG thuộc
  `@pv/ui` — không phải atom, và `ops-fields.tsx:37-39` đã lập luận đúng biên
  giới package — nhưng nó nên là một bản ở `apps/web/src/components/`, có nhận
  `errors`.
- **Nút trong drawer · modal nghiệp vụ là 40px, luật 13 đòi ≥ 48px trên tablet.**
  `size="lg"` tồn tại và các màn auth đang dùng đúng; `mas-mail-modal` và
  `users-parts` thì chưa. Kèm theo: `Drawer` footer
  (`packages/ui/src/layout/drawer.tsx:157`) chưa chừa `env(safe-area-inset-bottom)`,
  nên dưới `sm` nút "Lưu" nằm chồng vạch home indicator 34px của iPhone —
  `AppShell` đã chừa đúng chỗ này, `Drawer` thì chưa.
- **`Skeleton` bỏ qua class chiều cao**: nó ghi `height` vào `style` nên `h-12`
  không có tác dụng, và `leads.tsx:602` · `ops.tsx:295` đang render thanh 11px
  thay cho dòng bảng 48px. `pages/users.tsx` đã dùng `height={48}`; hai màn kia
  chưa. Sửa gốc là bỏ `height` khỏi `style` trong atom rồi dọn cả ba.
- **Ô email trong dòng sổ bị chép sang màn thứ ba**: `pages/users.tsx` in lại
  đúng chuỗi class của `components/table-bits.tsx:70` (`PicCell`) thay vì gọi
  nó — đúng thứ docblock của `table-bits.tsx:4-15` viết ra để ngăn.

---

## 12 · Mail cho lead không có file đính kèm — tạm đi bằng link Drive

**Triệu chứng:** BD cần gửi kèm hồ sơ năng lực công ty và không có chỗ nào để
đính tệp. Cách đang dùng: tự tải file lên Google Drive rồi dán link chia sẻ vào
ô **"Nút trong email"** của modal soạn mail.

**Ở đâu:** không tầng nào của đường gửi có đính kèm, và thiếu ở đây là cả tầng
chứa bytes chứ không phải một ô input:

- `packages/contracts/src/sales/mail.ts` · `MasSendRequest` — chỉ có
  `label` · `templateCode` · `subject` · `body` · `cta` · `scheduledAt` · `campaignCode`.
- `apps/api/src/platform/mail/mail.contract.ts` · `MailMessage` — `from` · `to`
  · `replyTo` · `subject` · `html` · `text` · `headers`.
- `platform.mail_run` không có cột nào cho tệp; `apps/api` không có nơi nhận
  upload nào (`multer` · `@aws-sdk` · presigned đều không tồn tại trong cây).

Đây cũng là lý do đính kèm ở form cơ hội (`apps/web/src/components/ops-fields.tsx`
· `AttachmentsField`) chỉ giữ `{ name, size }` — cùng một chỗ trống, hai màn.

**Sửa thế nào:** bốn tầng, theo thứ tự — chỗ chứa file trên S3 + endpoint phát
presigned URL → trường `attachments` trên `MasSendRequest` và cột trên
`mail_run` → `MailMessage`/`MailPort` + `resend.driver.ts` truyền attachments
xuống Resend → ô chọn tệp trong `mas-mail-modal.tsx`. Cân nhắc chỉ mở đính kèm
cho thư 1-1 từ màn lead và giữ link cho lô MAS: một lô tới 200 người
(`PV_MAS_BATCH_MAX`), nhân một PDF vài MB vào đó vừa tốn quota vừa đẩy
spam-score, mà trần bounce đang đặt 4% (`PV_MAS_BOUNCE_CEILING_PERCENT`) và
vượt là chặn lô.

**Vì sao chưa sửa:** AWS chưa setup xong, và không có nó thì ba tầng đầu không
có chỗ đứng. Chốt 30/08/2026: chờ AWS, không dựng kho tạm.

**Trong lúc chờ, ba điều đường vòng bắt buộc phải biết:**

- **Link phải nằm ở ô CTA, không nằm trong thân thư.** `MailCta.url` nhận mọi
  URL `http/https`, không allowlist. Còn thân thư thì `splitParagraphs`
  (`apps/api/src/platform/mail/mas.composer.ts`) cắt thành các `<Text>` đã
  escape — URL trần **không** thành `<a>`. Gmail thường tự bắt link, Outlook
  desktop thì không.
- **Mỗi lá chỉ có một nút.** Mẫu nào đã dùng CTA cho việc khác thì hồ sơ không
  còn chỗ. Nếu chuyện này thành thường xuyên, việc rẻ nhất **không phải** chờ
  AWS mà là cho autolink URL trong thân thư ở composer — hàng chục dòng, độc
  lập hoàn toàn với đính kèm thật.
- **Link Drive phải để "Bất kỳ ai có đường liên kết".** Để `Restricted` là
  khách bấm vào gặp màn xin quyền, mà thư đã đi thì không sửa lại được.

Bù lại, đặt ở CTA thì đo được: webhook `email.clicked` vào
`mail-webhook.controller.ts` và cộng vào cột `clicked` của lô — link trong thân
thư mất luôn số này.

---

## 13 · File migration 0018 không còn trong cây, nhưng bảng nó tạo vẫn sống

**Triệu chứng:** `sales.contact` có thật trên Neon với 123 dòng — mọi dòng mang
`by = 'backfill 0018'` — trong khi không migration nào trong `apps/api/drizzle/`
tạo bảng đó. Snapshot của drizzle vì thế không biết bảng tồn tại, nên lượt
`pnpm db:generate` ngày 03/09 sinh ra một migration tạo lại nó lần thứ hai; chạy
nguyên bản ấy thì Postgres từ chối "already exists" và cả migration rollback.

Bảng `drizzle.__drizzle_migrations` đếm 27 dòng đã chạy trong khi cây có 27 file,
và đúng một hash không khớp file nào:

```
5051232f806237b168f38946cc872f32c7d8c8e21cbd722a2fa4db952c1de4a3
   đã chạy 2026-08-28T17:33:48Z
```

**Ở đâu:** file rụng lúc gỡ va chạm hai migration cùng số 0024 trong lượt gộp
master vào develop (`91bd9a0`). Ba chỗ còn dấu vết:

- `apps/api/drizzle/meta/_journal.json` — không có mục nào cho 0018.
- `apps/api/src/branches/sales/contact/contact.schema.ts` — khai lại BẰNG TAY
  theo hình đang sống, kể cả tên ràng buộc (`contact_no_blank`,
  `contact_channel_known`, `contact_primary_idx`) và index trên `lower(email)`.
  Đổi một tên ở đây là lượt `db:generate` sau phát ra một câu `ALTER` lên bảng
  thật mà chẳng để làm gì.
- `apps/api/drizzle/0026_crazy_mariko_yashida.sql` — khối contact bọc trong
  `DO $$ IF to_regclass('sales.contact') IS NULL THEN … END IF $$`.

**Sửa thế nào:** dựng lại file `0018_*.sql` từ hình đang sống rồi chèn vào
journal đúng vị trí cũ. Cái không làm được là khớp lại HASH — drizzle băm nội
dung file, nên chỉ một byte lệch là dòng cũ vẫn mồ côi và bản dựng lại bị coi là
migration chưa chạy. Muốn sạch hẳn thì phải sửa thẳng
`drizzle.__drizzle_migrations` trên Neon, tức viết lại lịch sử của một bảng đang
chạy.

**Vì sao chưa sửa:** hậu quả thực tế đã bị vô hiệu hoá. Database sạch dựng từ
migration nay vẫn có `sales.contact` — khối idempotent trong 0026 dựng nó ở
nhánh "chưa có" (đã chạy thử trên pglite trống, cả 27 migration xanh), còn Neon
đi nhánh "đã có" và không bị chạm. Thứ còn lại chỉ là một dòng mồ côi trong bảng
migration và một khoảng trống trong lịch sử — không cản gì, nhưng đủ để lần soát
sau mất một buổi điều tra nếu không có mục này.

**Hai điều phải biết khi đụng vào contact:**

- **Đừng chạy `pnpm db:generate` rồi commit thẳng bản sinh ra.** Bản sinh luôn
  chứa `CREATE TABLE "sales"."contact"` cho tới khi có ai đó vá journal; khối
  idempotent trong 0026 phải được chép lại bằng tay, cùng khoản nợ mà
  `config_ord_uniq` (DEFERRABLE) đã ghi ở `config.schema.ts`.
- **`created_by` rỗng ở cả 123 dòng cũ**, và đó là câu trả lời đúng chứ không
  phải dữ liệu thiếu: lượt backfill không có người nào để ghi công. Cột đó
  nullable vĩnh viễn vì lý do ấy, còn `by` chở tên chụp lại.
