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

## 2 · Sổ lead nuốt lỗi mạng, báo nhầm thành "không có dữ liệu"

**Triệu chứng:** tắt máy chủ rồi mở `/sales/leads` — màn hiện trạng thái rỗng
_"Không có lead nào khớp bộ lọc đang chọn"_ kèm nút "Bỏ hết bộ lọc", và
**console sạch trơn, không một dòng lỗi**. Người dùng sẽ đi sửa bộ lọc cho một
sự cố hạ tầng. Đã dựng lại được y hệt trong phiên 28/08.

**Ở đâu:** `apps/web/src/pages/leads.tsx:262`

```ts
const { data: bookPage, isPending } = useQuery(leadBookQuery(query))
const rows = bookPage?.rows ?? [] // lỗi → [] → trạng thái rỗng
```

**Sửa thế nào:** lấy thêm `isError` và `error`, tách một trạng thái lỗi riêng
có nút thử lại, phân biệt hẳn với trạng thái rỗng. `ApiError` ở
`app/api/errors.ts` đã chở đủ `kind` và `path` để nói đúng câu.

**Vì sao chưa sửa:** không nằm trong phạm vi buổi nối Neon. Sửa nhanh, nên làm sớm.

---

## 3 · Thẻ điểm Sổ lead đọc fixture — đã sai lộ liễu từ khi nối Neon

**Triệu chứng:** bảng nói 121 dòng, bốn ô thẻ điểm vẫn đứng `100 · 38% · 30% · 6%`.

**Ở đâu:** `apps/web/src/pages/leads.tsx` · `ScoreCards` đọc hằng `FUNNEL` và
`FIRST_MEETINGS` import thẳng từ `@pv/engines/fixtures/das-vina`, không qua
`useQuery` nào.

**Sửa thế nào:** `GET /sales/leads/scorecard` đếm thật từ DB, rồi bỏ hai import
kia khỏi màn.

**Vì sao chưa sửa:** trước 28/08 DB được seed từ chính fixture đó nên hai số
trùng nhau, không ai thấy. Nối Neon xong mới lệch. Cần chốt hình dạng endpoint
trước — riêng `FIRST_MEETINGS` không suy ra được từ `LeadRow` hiện tại, nó đếm
bằng điều kiện `hasFirstMeeting` trong fixture.

---

## 4 · Bốn màn còn ăn fixture vì máy chủ chưa có route

**Ở đâu:** các query còn truyền `load:` trong `apps/web/src/data/`

| Query                        | File                 | Route ở `apps/api` |
| ---------------------------- | -------------------- | ------------------ |
| `/sales/campaigns/sources`   | `campaigns.ts:620`   | chưa có            |
| `/sales/campaigns/totals`    | `campaigns.ts:626`   | chưa có            |
| `/sales/ops`                 | `ops.ts:41`          | chưa có            |
| `/sales/plan`                | `plan.ts:360`        | chưa có            |
| `/sales/performance/:period` | `performance.ts:946` | chưa có            |
| `frozenLeadBookQuery`        | `leads.ts:158`       | dùng bởi 3 màn     |

**Sửa thế nào:** dựng endpoint từng nhánh một, rồi bỏ dòng `load:` của query đó —
đúng nghi thức đã ghi ở docblock đầu `app/api/client.ts`.

**Vì sao chưa sửa:** đây là dựng backend, không phải dọn dẹp. Gỡ `load:` mà chưa
có endpoint là năm màn chết trắng. Nên đi qua `sketch-first` trước khi chạm file.

**Hệ quả đang sống chung:** màn chiến dịch và màn cơ hội đếm lead theo sổ đóng
băng (100 dòng), Sổ lead đếm theo Neon (121). Hai số lệch nhau là **đúng thiết
kế đợt này**, không phải bug.

---

## 5 · CORS khớp tuyệt đối — mỗi domain mới là một lần gãy

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

## 6 · Hai dòng bản thử còn nằm trong Neon

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

## 7 · Nhãn bậc · ngành · lý do rơi vẫn đọc fixture

`LeadRow` trên dây còn chở khoá chữ thường cũ (`cho-ky`, `chip`) chứ chưa phải
ID cấu hình, nên màn phải tra nhãn từ fixture. Chỉ **Nguồn** đã nối được vào sổ
nguồn thật qua `salesCatalogQuery`. Nợ này đã ghi ở `docs/tich-hop-be.md`; chép
lại đây để danh sách đủ mặt.

---

## 8 · Hàng rào chống dò mật khẩu chỉ sống trong RAM của một tiến trình

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

## 9 · Thư đặt mật khẩu không hỏi sổ chặn

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

## 10 · Cây có HAI bản `fastify`

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

## 11 · `sales.contract` không gác "một đơn một hợp đồng" ở tầng bảng

**Triệu chứng:** chưa thấy được, và đó là lý do nó nằm đây. Bất biến "mỗi cơ hội
nhiều nhất một hợp đồng" hôm nay chỉ do cửa `POST /sales/ops/:code/contract`
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

## 12 · Vặt

- `docs/tich-hop-landing-page.md:198` — ví dụ `curl` còn dùng `localhost:3000`,
  trong khi cổng tại máy đã chốt **4123** ở `apps/api/.env`, `apps/web/.env`,
  `.env.example` và hai doc còn lại. Copy nguyên dòng đó ra chạy sẽ trượt.
- `apps/web/src/data/leads.ts` — docblock `leadFacetQuery` nói "sổ có 119 dòng";
  Neon nay 121, fixture vẫn 100. Con số trong văn xuôi sẽ còn trôi, đừng dựa vào nó.
- **Khối "một ô form" đã có NĂM bản**: `components/ops-fields.tsx:54` (đã export),
  `mas-mail-drawer.tsx:600`, `campaign-parts.tsx:92`, `auth-card.tsx:79`
  (`AuthField`), `pages/users-parts.tsx:652`. Nó KHÔNG thuộc `@pv/ui` — không
  phải atom, và `ops-fields.tsx:37-39` đã lập luận đúng biên giới package —
  nhưng nó nên là một bản ở `apps/web/src/components/`, có nhận `errors`.
- **Nút trong drawer là 40px, luật 13 đòi ≥ 48px trên tablet.** `size="lg"` tồn
  tại và các màn auth đang dùng đúng; drawer nghiệp vụ (`mas-mail-drawer`,
  `users-parts`) thì chưa. Kèm theo: `Drawer` footer
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
