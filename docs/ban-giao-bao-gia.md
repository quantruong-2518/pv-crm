# Bàn giao — module 4 · Báo giá (BG)

Lát cắt **29/08/2026**, nhánh `feat/module-4-bao-gia`. Thi hành **lượt 1 và
lượt 2** của §8 trong [`tam-nhin-bao-gia-hop-dong.md`](./tam-nhin-bao-gia-hop-dong.md)
— bản thiết kế đã duyệt, và là nguồn sự thật duy nhất cho mọi quyết định kiến
trúc dưới đây. File này chỉ ghi **đã dựng tới đâu**, **chỗ nào tự quyết**, và
**chỗ nào sẽ va** khi gộp với nhánh Hợp đồng.

Nửa HỢP ĐỒNG của module 4 do một phiên khác dựng song song. Phiên này **không
chạm** `branches/sales/contract/*`, `contracts/src/sales/contract.ts`,
migration bồi cột `contract`, hay `pages/contracts.tsx`.

> **Nhánh gốc là `master`, không phải `develop`.** Repo này chỉ có `master` và
> `origin/master`; `develop` mà lệnh khởi tạo nhắc tới **không tồn tại**. Đã
> nhánh ra từ `master` và ghi lại đây thay vì tự dựng một `develop` — đặt tên
> nhánh tích hợp là quyết định của chủ dự án, không phải của một phiên.

---

## Đã dựng — bốn commit, mỗi commit để lại `pnpm check` XANH

| Lượt                      | Nội dung                                                                          |
| ------------------------- | --------------------------------------------------------------------------------- |
| **1** · quyền             | 5 quyền mới + `KIND_DOMAIN` cho `BG` và `HĐ` + ma trận vai                        |
| **2a** · hợp đồng dữ liệu | `packages/contracts/src/sales/quote.ts`, file LÁ, mang luôn công thức làm tròn    |
| **2b** · bảng             | `sales.quote` + `sales.quote_line` + dãy mã, migration `0024_quote_tables`        |
| **2c** · cửa              | `branches/sales/quote/` bốn file + sổ ràng buộc + `EdgeWriter` ở `platform/graph` |
| **2d** · màn              | `/sales/quotes`, modal soạn, `QuoteCard`, đánh số lại module                      |

### Quyền

Năm quyền: `báo-giá.xem` · `báo-giá.sửa` · `báo-giá.gửi` · `hợp-đồng.xem` ·
`hợp-đồng.sửa`. **Không có `báo-giá.chốt`** — ghi nhận khách chốt dùng
`cơ-hội.chốt` sẵn có, đúng §10 mục 4.

`KIND_DOMAIN` là phần **vá lỗ thật**, không phải dọn dẹp: object `BG` và `HĐ`
chưa có miền quyền nên `permissionFor()` trả `null` và `can()` bỏ qua **hoàn
toàn trục vai**, trong khi cửa ký đã ghi `amount` vào dòng gương
`platform.object` từ 26/08. Hai dòng đóng nó lại.

### Bảng

Đúng §3, không thêm không bớt. Ba hàng rào tiền bạc đều ở tầng bảng:

```
quote_one_accepted_idx   một cơ hội nhiều nhất MỘT bản khách chốt
quote_code_status_key    bệ cho khoá ngoại ghép của contract (nhánh kia dùng)
quote_sent_pair          (sent_at IS NULL) = (status = 'nhap')
```

`line_total` là cột **GENERATED**, làm tròn hai tầng mỗi tầng về đồng nguyên.
`lineTotalOf` bên `@pv/contracts` phải giữ **y hệt** biểu thức đó — nó tồn tại
vì modal soạn phải in tổng trước khi có dòng nào để đọc.

Bốn cột tổng do service ghi (SUM xuyên dòng thì GENERATED không làm được),
ghi **lúc chốt** chứ không tính lúc đọc.

### Bảy cửa

| Cửa                                | Quyền         | scoped               |
| ---------------------------------- | ------------- | -------------------- |
| `GET /sales/quotes`                | `báo-giá.xem` | có                   |
| `GET /sales/quotes/:code`          | `báo-giá.xem` | có                   |
| `POST /sales/quotes`               | `báo-giá.sửa` | **không — xem dưới** |
| `PATCH /sales/quotes/:code`        | `báo-giá.sửa` | có                   |
| `POST /sales/quotes/:code/replace` | `báo-giá.sửa` | có                   |
| `POST /sales/quotes/:code/send`    | `báo-giá.gửi` | có                   |
| `POST /sales/quotes/:code/decide`  | `cơ-hội.chốt` | có                   |

`POST /sales/quotes` **không scoped được** — mã cơ hội nằm trong thân, chưa có
`ref` cho guard soi. Service kiểm phạm vi của **cơ hội cha** qua
`OpportunityService.profile`. Bỏ chỗ này là một Sale `ownOnly` soạn được báo giá
trên đơn của người khác; **không cửa nào khác chặn**. Đã bấm thử: Sale khác nhận 403.

### Cạnh E1 — nối thành CHUỖI

`EdgeWriter` (`platform/graph/edge-writer.ts`) là **phương thức ghi
`platform.edge` đầu tiên của `apps/api`**. Đặt ở `platform/graph` đúng cảnh báo
mà docblock của `opportunity.service.ts` đã ghi sẵn — không viết tay trong nhánh.

Mỗi bản mới nối sau **bản mới nhất** của đơn; chỉ bản đầu nối về cơ hội. Nối
kiểu chùm thì luật hoà của `story()` vẽ ra bản **CŨ đã bị thay** (§2.1). Kiểm
thật trên pglite:

```
OP-0259 → BG-5001 → BG-5002 → BG-5003
```

### Màn

`/sales/quotes` là sổ, **không có hồ sơ báo giá riêng** — một dòng mở về hồ sơ
CƠ HỘI, nơi `QuoteCard` sống cạnh chỗ `ContractCard` sẽ đứng (§7). Modal soạn
dựng bằng `DataTable` sẵn có với ô nhập trong ô bảng, **không thêm component vào
`@pv/ui`**. Đổi thứ tự dòng bằng hai nút ↑↓.

Đánh số lại module đúng §1: Báo giá **4**, Hiệu suất **5**, Kế hoạch **6**,
Thiết lập **7** — sửa đúng hai chỗ bản thiết kế chỉ ra.

---

## Chỗ thiết kế không nói — đã chọn ÍT CODE NHẤT, ghi lại ở đây

1. **Công thức bốn cột tổng.** §3 gọi tên bốn cột, không cho công thức. Chọn:
   `subtotal` là tổng trước chiết khấu, `discountTotal` là phần chiết khấu lấy
   đi, `vatTotal` là phần VAT cộng vào, `total` là **tổng cột "Thành tiền"**.
   Đẳng thức `total = subtotal − discountTotal + vatTotal` đúng theo cấu tạo, và
   vế quan trọng nhất — `total` bằng tổng các `line_total` — là thứ §3 đòi:
   khách cộng tay ra đúng con số máy in.

2. **`account` thêm vào dòng sổ.** §4 không liệt kê nó. Sổ cắt ngang mọi cơ hội
   nên một dòng chỉ có mã là dòng không ai đọc được; sổ cơ hội đã chọn y vậy.

3. **`GET /sales/quotes/:code` trả `{ quote, versions }`**, `versions` chứa cả
   bản đang mở, sắp theo bản tăng dần.

4. **`QuoteDecision` chỉ có `outcome`, không có ghi chú.** Không có chỗ nào
   trung thực để cất lý do khách từ chối: cột `note` là chữ **in cho khách đọc**,
   còn một dòng `sales.touch` cần một `TouchKind` chưa tồn tại, mà nới CHECK đó
   là một migration lượt này không xin.

5. **Cửa `POST` thứ hai trên một đơn đã có báo giá cũng nối thành chuỗi.** §6 chỉ
   nói `OP → BG` cho bản đầu và `BG → BG` cho bản kế. Một `POST` thứ hai (không
   qua `replace`) không được bản thiết kế mô tả nhưng không có gì cấm — nó đi
   chung `writeNewVersion`, nên **không cửa nào đẻ ra chùm được**, kể cả vô ý.

6. **`OpportunityService.ensureMirror`.** `seed.ts` **không** ghi dòng gương
   `platform.object` cho 16 cơ hội (nó chỉ ghi cho `dasVina.objects` và cho
   lead). `platform.edge` có khoá ngoại hai đầu, nên cạnh đầu tiên trỏ vào một
   đơn cũ sẽ là `23503`. Đây là khoản nợ mà câu hỏi treo ở
   [`ban-giao-co-hoi.md`](./ban-giao-co-hoi.md) đã nêu — nó chỉ vô hình cho tới
   ngày có cửa ghi cạnh.

---

## Bốn lỗi chỉ lộ ra khi BẤM

Build xanh, lint xanh, `pnpm check` xanh — bốn lỗi này vẫn lọt tới lúc mở trình
duyệt thật (Chromium + Playwright, không phải test tự sinh).

1. **Treo VĨNH VIỄN, không lỗi, không log.** `ensureMirror` đọc qua pool trong
   lúc transaction của chính request đang giữ kết nối. **PGlite chỉ MỘT kết
   nối**, nên câu đọc chờ một kết nối mà transaction sẽ không nhả cho tới khi
   câu đọc trả lời. Sửa: `OpportunityRepository.byCode` nhận thêm `tx`, mặc định
   là pool. Trên Neon lỗi này núp sau pool mười kết nối cho tới khi có mười
   request cùng lúc.
2. **Hai cột không tiêu đề trùng khoá React.** `DataTable` khoá ô header bằng
   `col.header`, nên hai chuỗi rỗng là **một** khoá. Nay hai cột nút mang tên
   thật ("Thứ tự", "Xoá") — vừa hết lỗi vừa hết hai cột không ai giải thích được.
3. **Mở SỬA một bản nháp thì nút Lưu tắt ngóm.** `formOf` xoá trắng hạn hiệu
   lực. Ý định đó đúng cho đường **soạn bản mới** (chép hạn cũ sang bản mới là
   gửi khách tờ giấy có thể đã hết hạn) và sai cho đường **sửa**. Nay `formOf`
   giữ hạn cũ, còn đường bản mới tự ghi đè bằng hạn mới.
4. **`Money scale="hero"` in theo TỶ**, nên tổng 2.672.999 ₫ đọc ra "0,00 tỷ".
   Tổng cộng là con số khách cộng tay — chỗ duy nhất trên màn **không được** làm
   tròn. Thẻ báo giá cũng đổi từ `scale="card"` (triệu) sang đồng nguyên, cùng lý do.

---

## Chưa làm, và cố ý

- **Không lá mail nào.** Cửa `send` chuyển trạng thái, cho các bản cũ nghỉ, và
  đẩy `opportunity.state` — nhưng **không xếp hàng thư**. Lá ra ngoài
  (`quote-sent-customer`) đòi thứ mail nội bộ không đòi: kiểm `suppression` và
  `List-Unsubscribe`. Nửa vời sẽ là một cái nút trông như đã gửi thư mà không
  gửi gì. Sweeper `quote-expiring-internal` cũng chưa có. **Đây là nửa còn lại
  của lượt 3.**
- **Không dòng `sales.touch` nào.** Chưa có `TouchKind` hợp; nới CHECK là một
  migration lượt này không xin. Hệ quả nhìn thấy được: thẻ hoạt động của đơn
  không kể chuyện báo giá.
- **Không nút "In".** `@media print` + `window.print()` đi cùng lượt với lá thư
  (nợ #12, đường vòng ở §7).
- **Không ContextRail.** §11.5 đã chốt nó là **lượt 6 riêng**, phải sáng cùng
  lúc trên cả bốn màn Sales hoặc không sáng ở đâu. Cạnh thì nay đã có thật, nên
  lượt đó có thứ để vẽ.
- **Không thẻ điểm trên sổ báo giá.** Chưa có endpoint đếm bằng SQL, mà đếm trên
  TRANG đang mở là đúng cái lỗi `OpportunityScorecard` sinh ra để sửa.
- **Không test.** Đúng luật của `CLAUDE.md`; không thêm số mới nào vào fixture
  nên ngoại lệ "thêm số phải kèm test" không áp.

### Hai chỗ đáng biết

- **Hai kịch bản fixture không có báo giá nào.** `BG-1077` là một dòng gương E1,
  không phải dòng của `sales.quote`. Máy vừa seed xong thì sổ báo giá **rỗng** —
  sổ nói thật, không phải màn hỏng.
- **`OP-0288` có cạnh `OP-0288 → BG-1077` từ fixture.** Bản báo giá thật đầu
  tiên của đơn đó vẫn nối từ `OP-0288`, nên đơn đó có hai cạnh ra. Đó là dữ liệu
  demo mang một cạnh không có dòng bảng đứng sau, không phải cửa ghi sai:
  `newestVersion` chỉ nhìn `sales.quote`.

---

## Kiểm bằng gì

**KHÔNG chạm Neon.** Toàn bộ chạy trên pglite trong máy.

```bash
cd apps/api
rm -rf /tmp/pgl-bg
DATABASE_URL="pglite:///tmp/pgl-bg" npx drizzle-kit migrate
DATABASE_URL="pglite:///tmp/pgl-bg" node -r ts-node/register -r tsconfig-paths/register src/seed.ts
DATABASE_URL="pglite:///tmp/pgl-bg" node -r ts-node/register -r tsconfig-paths/register \
  src/seed-accounts.ts --password='…' --apply
DATABASE_URL="pglite:///tmp/pgl-bg" PORT=4123 PV_TRUST_ACTOR_HEADER=true \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts
cd ../web && npx vite --port 5175
```

**pglite chỉ một kết nối:** tắt máy chủ trước khi mở cùng thư mục đó bằng script
khác. Đọc song song trả về **ảnh chụp cũ** — đã mất một lượt đi tìm "cạnh bị
thiếu" hoá ra chỉ là lượt đọc thứ hai nhìn thấy trạng thái cũ.

CORS chỉ mở cho `http://localhost:<port>` ở `development`, nên vite phải mở bằng
`localhost`, không phải `127.0.0.1`.

| Kiểm                        | Kết quả                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| Cột sinh `line_total`       | 1.022.999 và 1.650.000 — đúng hai tầng làm tròn                          |
| `quote_one_accepted_idx`    | bản chốt thứ hai của một đơn bị từ chối                                  |
| `quote_sent_pair`           | `da-gui` mà `sent_at` NULL bị từ chối                                    |
| Vòng đời                    | soạn → sửa → gửi → soạn bản mới → gửi → khách chốt, cả sáu lượt đều xanh |
| Bản cũ thành `thay-the`     | **lúc bản mới được GỬI**, không phải lúc nó được tạo                     |
| Sửa bản đã gửi              | 409                                                                      |
| `opportunity.state` sau gửi | `gui-quotation` · cột `da-bao-gia` · dòng gương E1 theo kịp              |
| Chuỗi cạnh                  | `OP-0259 → BG-5001 → BG-5002 → BG-5003`                                  |
| presales                    | soạn được (201), **gửi 403**, chốt 403                                   |
| Sale khác (`ownOnly`)       | đọc 403 · soạn trên đơn người khác 403 · sổ trả `hidden 3 · rows 0`      |
| Trình duyệt thật            | sổ, modal, thẻ — vẽ đúng, **không một lỗi console**                      |

---

## SẼ VA khi gộp với nhánh Hợp đồng

Biết trước, không né bằng cách bỏ việc. Mỗi dòng kèm cách gỡ.

| File                                                 | Vì sao va                                                          | Gỡ thế nào                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engines/src/e2-access.ts`                  | cả hai thêm quyền và sửa `KIND_DOMAIN`                             | **Giữ cả hai bên.** Năm quyền và hai dòng miền là MỘT bộ — bên nào vào trước cũng đủ, bên vào sau chỉ việc bỏ phần trùng                       |
| `apps/web/src/routes.tsx`                            | cả hai thêm route và đánh số lại                                   | Sổ hợp đồng cũng là **module 4**; giữ nguyên 5·6·7 của ba module sau                                                                           |
| `apps/web/src/app/chrome.tsx`                        | cả hai thêm mục nav                                                | **Cần một quyết định**, xem mục ngay dưới                                                                                                      |
| `apps/api/drizzle/meta/_journal.json`                | cả hai thêm migration                                              | Migration bồi cột `contract` phải đánh số **SAU** `0024` — khoá ngoại của nó trỏ vào `quote(code, status)`, bảng chưa tồn tại thì migration đổ |
| `apps/api/src/branches/sales/sales.module.ts`        | cả hai đăng ký module + sổ ràng buộc                               | Cộng dồn, không loại trừ                                                                                                                       |
| `apps/api/.../opportunity/opportunity.service.ts`    | phiên này thêm 2 phương thức ở CUỐI lớp; phiên kia đổi thân `sign` | Hai vùng rời nhau — giữ cả hai                                                                                                                 |
| `apps/api/.../opportunity/opportunity.repository.ts` | thêm `markQuotationSent`, và `byCode` nhận thêm `tx`               | `tx` có mặc định nên mọi chỗ gọi cũ **không phải sửa**                                                                                         |
| `apps/web/src/pages/opportunity-detail.tsx`          | phiên này chèn `<QuoteCard>`; phiên kia chèn `<ContractCard>`      | Hai dòng cạnh nhau trong `DetailSidePanel`, thứ tự theo §7: Lead → Quote → Contract → People → Activity                                        |
| `packages/contracts/src/sales/index.ts`              | phiên này thêm `export * from './quote'`                           | Cộng dồn                                                                                                                                       |

### Một câu phải chốt: nav của module 4

Bản thiết kế §1 nói module 4 là **"Báo giá · Hợp đồng"** — một module, hai sổ.
Nhưng `useAppChrome` sáng mục nav bằng `inModule()`, tức **khớp theo tiền tố
đường dẫn**, nên một mục không sáng được cho cả `/sales/quotes` lẫn
`/sales/contracts`.

Phiên này để **một mục "Báo giá" → `/sales/quotes`**, và không tự quyết hộ nửa
kia. Ba đường ra, chọn lúc gộp:

1. **Hai mục nav, cùng số 4** — nav dài thêm một mục, không phải sửa gì.
2. **Một mục "Báo giá · Hợp đồng"**, và `SalesModule` mọc thêm một trường
   `extraPaths` để `inModule()` khớp cả hai tiền tố. Đúng chữ của bản thiết kế
   nhất, tốn một trường.
3. **Sổ hợp đồng dời xuống `/sales/quotes/hop-dong`** — cùng nước đi mà module 1
   đã dùng cho ba sổ chung tiền tố `/sales/campaigns`. Rẻ nhất về code, nhưng
   đường dẫn nói sai quan hệ: hợp đồng không phải con của báo giá.

Mặc định tôi sẽ lấy nếu không ai nói khác: **(2)**, vì nó là thứ §1 viết ra, và
tiền lệ `extraPaths` sẽ còn dùng lại ở module 5.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
lượt 0 · đếm trùng contract.opportunity_code trên Neon rồi áp UNIQUE
   │        (chạy ẩu là KHÔNG LÙI ĐƯỢC — đếm trước, có dòng trùng thì DỪNG và hỏi)
   ▼
lượt 3 · lá mail ra ngoài + sweeper hết hạn      ← nửa còn lại của lượt này
   │
   ▼
lượt 4 · sổ hợp đồng + đổi thân ContractSign + cạnh BG→HĐ   ← nhánh kia
   │
   ▼
lượt 5 · đợt thanh toán
   │
   ▼
lượt 6 · ContextRail trên cả bốn màn Sales cùng một lượt
```

Migration `0024` **chưa áp lên Neon**. Nhánh này chưa deploy gì.
