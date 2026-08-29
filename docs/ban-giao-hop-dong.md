# Bàn giao — module 4 · Hợp đồng (HĐ)

Lát cắt **29/08/2026**, nhánh `feat/module-4-hop-dong`. Dựng theo
[`tam-nhin-bao-gia-hop-dong.md`](./tam-nhin-bao-gia-hop-dong.md) — bản thiết kế
đã duyệt, và là nguồn sự thật duy nhất cho mọi quyết định kiến trúc dưới đây.

Nhánh này làm **lượt 0**, **phần đọc của lượt 4**, **lượt 5**, và phần `e2-access.ts`
của **lượt 1**. Luồng BÁO GIÁ chạy song song trên `feat/module-4-bao-gia` —
mục [Merge](#merge--những-gì-sẽ-đụng-nhau) ở cuối nói rõ chỗ nào sẽ xung đột.

**Chưa deploy. Chưa chạm Neon. Chưa mở PR.** Mọi thứ dưới đây bấm thử trên
pglite tại máy.

---

## ⚠ Việc bạn phải làm TRƯỚC KHI migrate lên production

Migration `0024_contract_opportunity_once` áp `UNIQUE(contract.opportunity_code)`.
Thiết kế nói rõ lượt 0 **không lùi được nếu chạy ẩu**: nếu production đã lỡ có
một cơ hội hai hợp đồng thì migration gãy giữa chừng, và câu đếm đó **chưa ai
chạy** (nợ #10 của [`fix-later.md`](./fix-later.md) ghi đúng chỗ này).

Tôi **không được chạm Neon**, nên câu đếm nằm ở đây, chưa chạy:

```sql
-- Chạy trên Neon TRƯỚC khi `drizzle-kit migrate` chạm tới 0024.
SELECT opportunity_code, count(*) AS n, array_agg(code ORDER BY code) AS hop_dong
FROM   sales.contract
GROUP  BY opportunity_code
HAVING count(*) > 1
ORDER  BY n DESC;
```

**Không dòng nào** → migrate được, `UNIQUE` áp sạch.

**Có dòng** → **DỪNG, đừng migrate, đi hỏi.** Dọn trùng là việc nghiệp vụ —
phải có người quyết giữ hợp đồng nào, huỷ hợp đồng nào — chứ không phải việc một
migration được tự quyết. Một `DELETE` đoán mò ở đây là xoá một tờ hợp đồng đã ký.

Câu kiểm đi kèm, cho biết đang đứng ở đâu:

```sql
SELECT count(*) AS so_hop_dong,
       count(DISTINCT opportunity_code) AS so_co_hoi,
       count(*) FILTER (WHERE amount IS NULL) AS chua_co_tien
FROM   sales.contract;
```

Hôm nay trên fixture: 6 · 6 · 6. Hai số đầu bằng nhau nghĩa là không có trùng.

---

## Làm được gì

### Dữ liệu

| Migration                           | Áp được ngay? | Làm gì                                                    |
| ----------------------------------- | ------------- | --------------------------------------------------------- |
| `0024_contract_opportunity_once`    | có¹           | `UNIQUE(contract.opportunity_code)` — trả nợ #10          |
| `0025_contract_payment_term`        | có            | bảng `sales.contract_payment_term`                        |
| `sau-merge/contract_quote_link.sql` | **KHÔNG**     | `quote_code` · `quote_status` · khoá ngoại ghép → `quote` |

¹ sau khi chạy câu đếm ở trên.

**`sales.contract_payment_term`** — `(contract_code, term_no)` khoá chính,
`label`, `amount`, `due_date`, `paid_at`, `status`. Không phụ thuộc `quote` nên
áp được ngay.

**File thứ ba KHÔNG nằm trong `drizzle/meta/_journal.json`, và đó là chủ ý.**
Nó trỏ vào `sales.quote` — bảng agent kia đang dựng trên nhánh khác, chưa tồn
tại ở nhánh này. Để nó trong journal thì `drizzle-kit migrate` gãy ngay ở nhánh
này với `relation "sales.quote" does not exist`. Nó nằm ở
`apps/api/drizzle/sau-merge/contract_quote_link.sql`, kèm checklist trong chính
file, và **chỉ áp được sau khi hai nhánh merge**. Tôi **không dựng lại bảng
`quote`** để cho nó chạy — bảng đó có một chủ.

### Cửa máy chủ — bốn đường mới, cả bốn `scoped: true`

| Cửa                               | Quyền          |                                     |
| --------------------------------- | -------------- | ----------------------------------- |
| `GET /sales/contracts`            | `hợp-đồng.xem` | sổ, phân trang, ô tìm, ba khoá sắp  |
| `GET /sales/contracts/:code`      | `hợp-đồng.xem` | một hợp đồng kèm đợt thanh toán     |
| `POST .../contracts/:code/terms`  | `hợp-đồng.sửa` | thêm một đợt, máy chủ cấp `term_no` |
| `PATCH .../contracts/:code/terms` | `hợp-đồng.sửa` | sửa một đợt, `termNo` trong THÂN    |

`ContractModule` ra đời đúng ngày `OpportunityModule` đã hẹn trong docblock của
nó. `ContractRepository` vẫn là provider ở **cả hai** module — Nest cấp mỗi
module một thực thể, mà thực thể đó không giữ gì ngoài handle `DB`. Bắt
`OpportunityModule` nhập `ContractModule` là để sổ cơ hội phụ thuộc sổ hợp đồng
cho câu "đơn này ký chưa", tức mũi tên chỉ ngược chiều đường ghi.

### Quyền

Năm quyền mới trong `packages/engines/src/e2-access.ts`, cộng hai dòng
`KIND_DOMAIN` (`BG` và `HĐ`). Ma trận vai đúng §5: giám-đốc và TP nhận tự động
(hàng của họ viết `PERMISSIONS`), sale có cả năm, presales có xem/sửa báo giá mà
**không** có gửi và **không** có gì trên hợp đồng, bd và marketing không có gì.

Hai dòng `KIND_DOMAIN` là phần vá lỗ: trước đó `permissionFor()` trả `null` cho
object `HĐ` nên `can()` bỏ qua hẳn trục vai, trong khi cửa ký đã ghi `amount`
vào dòng gương `platform.object` từ 26/08.

### Màn

`/sales/contracts` — bảy cột trên `.glass-b`, bộ lọc trên địa chỉ, dòng mở về
**hồ sơ cơ hội**. `ContractCard` ở `apps/web/src/pages/opportunity-detail.tsx`,
hiện sau khi ký, kèm danh sách đợt thanh toán.

Đánh số lại module theo §1: Hợp đồng chen vào **4**, Hiệu suất → 5, Kế hoạch →
6, Thiết lập → 7. Sửa ở cả `routes.tsx` lẫn `SALES_MODULES` của `app/chrome.tsx`.

---

## Quyết định tôi tự lấy, và vì sao

Thiết kế không nói tới bảy chỗ dưới đây. Mỗi chỗ tôi chọn phương án ít code
nhất và ghi lại để ai muốn lật thì lật đúng chỗ.

**1 · Khoá ngoại tới `quote` dùng `MATCH FULL`.** Đây là chỗ duy nhất tôi đi xa
hơn bản thiết kế, và nó không phải trang trí. Mặc định `MATCH SIMPLE` nhận một
khoá ghép ngay khi MỘT cột NULL, nên `quote_code = 'BG-5001'` với
`quote_status = NULL` lọt qua mà `BG-5001` không cần tồn tại — đúng cái lỗ mà
khoá này sinh ra để bịt. `MATCH FULL` nói "cùng NULL hết hoặc không cột nào
NULL", tức đúng hai hình hợp lệ: hợp đồng cũ không có báo giá, hoặc hợp đồng
ghim vào một bản đã chốt.

**2 · `UNIQUE` trên `opportunity_code` một mình**, không trên cặp
`(opportunity_code, lead_code)`. Cặp đó tự duy nhất ngay khi một nửa duy nhất, và
một index rộng hơn vẫn cho hai hợp đồng dùng chung một đơn nếu `lead_code` khác
nhau — thứ `contract_opportunity_fk` vốn đã chặn. Index rộng không mua thêm gì
mà giấu mất cột nào đang mang luật.

**3 · `contract_payment_term.status` chỉ hai giá trị**, `cho-thu` và `da-thu`,
ghim vào `paid_at` bằng CHECK. Thiết kế liệt kê cột `status` nhưng không nói giá
trị nào. Không có "quá hạn" — quá hạn là `due_date < hôm nay`, tính lúc đọc,
cùng lý do bảng báo giá không có `het-han`. Cột này **suy được** từ `paid_at`,
và CHECK là thứ giữ cho nó không lệch; nó tồn tại vì §3 gọi tên nó, và vì nó là
chỗ nới ra khi có ai xin giá trị thứ ba. Nới một CHECK là một migration.

**4 · `due_date` NULL được.** "Đợt cuối khi nghiệm thu" là đợt có thật chưa có
ngày, và ép điền để lấp NOT NULL là mời người ta bịa một ngày mà cả sổ sẽ đi đòi
tiền theo. Cùng lý lẽ giữ sáu hợp đồng cũ ở `amount` NULL.

**5 · Cửa ghi đợt KHÔNG nhận `status`.** `paidAt` chở toàn bộ câu trả lời —
`null` xoá, một mốc ghi nhận, vắng mặt thì không đụng tới — và mapper là chỗ duy
nhất trong mã nguồn quyết định cặp `(status, paid_at)`. Thân request chở cả hai
nửa là thân request tự cãi được chính nó.

**6 · `ContractBookRow` chở thẳng mảng đợt**, không chở ba con số tóm tắt cộng
một cửa thứ hai cho phần chi tiết. Tóm tắt là ba trường máy chủ phải gộp bằng
SQL rồi màn vẫn phải suy lại để vẽ danh sách; mảng đợt là một truy vấn mỗi
TRANG, đọc theo đúng lối `OpportunityRepository.ownersOf`, và một hình thì không
lệch được với chính nó.

**7 · Trục phạm vi của sổ hợp đồng đọc người đứng CƠ HỘI, không đọc
`contract.owner_id`.** Cột đó nói hoa hồng về tay ai, và cửa ký cho phép nó rơi
vào người chưa từng đứng đơn. Dùng nó làm phạm vi thì hai sổ của cùng một người
hiện hai tập dòng khác nhau. Kiểm thật: `u-huy` (sale, `ownOnly`) thấy 2 dòng ·
`hidden` 4; `u-ha` thấy 6 · `hidden` 0; `u-anh` (presales) nhận 403 gọi tên
quyền.

---

## Cái gì CHƯA xong

- **`ContractSign` chưa bỏ `amount`/`currency`.** §2.2 đòi ký là chọn một bản
  báo giá đã chốt, tiền đọc từ bản đó. Không làm được ở nhánh này — cần một bản
  báo giá để trỏ vào, mà `sales.quote` chưa tồn tại; cắt hai ô đó bây giờ là để
  cửa ký không còn chỗ nào ghi số. Việc này làm ở **lượt merge**, và nó **cố ý
  breaking**: `pnpm check` phải ĐỎ ở mọi chỗ import hình đó. Xanh ngay mà không
  sửa gì nghĩa là có chỗ đang ép kiểu che mất — grep lại.
- **`ContractRow.quoteCode` luôn trả `null`.** Hình dây đã khai đúng, mapper
  (`contract.mapper.ts#toContract`) trả `null` cứng vì cột chưa có. Dòng đó có
  ghi chú trỏ ngược về file `sau-merge/`.
- **Hai cửa ghi đợt thanh toán chưa có màn nào gọi.** `ContractCard` vẽ kế hoạch
  chỉ đọc. Một hook không ai gọi là một hook không ai chạy, nên
  `apps/web/src/data/contracts.ts` cố tình không có nó.
- **Sổ hợp đồng chưa có thẻ điểm.** §7 nêu câu "tháng này ký bao nhiêu"; câu đó
  phải đếm CẢ SỔ bằng SQL như `GET /sales/opportunities/scorecard` làm, không
  phải cộng mười dòng đang hiện. Chỗ mở là một cửa `scorecard` mới cạnh
  `ContractController.book`, và `AMOUNT_VND` của `opportunity.repository.ts` là
  bản để chép.
- **Không có `SUM(đợt) = contract.amount` ở tầng bảng** — một CHECK không thấy
  dòng khác. Thiết kế gọi đây là nợ có tên. Service **chưa** kiểm; hôm nay chỉ
  `ContractCard` in ra khoảng lệch khi có. Chỗ trả nợ là `ContractService.addTerm`
  và `patchTerm`.
- **ContextRail vẫn chưa sáng ở đâu** — lượt 6, đúng §11.5. Sổ hợp đồng không có
  rail, cùng lý do sổ lead và sổ cơ hội không có: một SỔ không có object nào
  đang mở.
- **Chưa có cạnh E1 nào.** `BG → HĐ` là việc của cửa ký ở lượt 4 phần ghi, và
  phương thức ghi cạnh phải vào `platform/graph`, không viết tay trong
  `branches/sales`. `ContractModule` cố tình không nhập `GraphModule`.
- **Không có test.** Đúng luật của `CLAUDE.md`: không tự sinh test khi dựng màn.
  Không có số mới nào vào fixture nên ngoại lệ duy nhất không được kích hoạt.

---

## Merge — những gì sẽ đụng nhau

Bốn chỗ dưới đây agent kia cũng chạm. **Xung đột ở đây là xung đột CƠ HỌC, không
phải lỗi** — hai nhánh cố ý làm cùng một việc để cả hai đều biên dịch được.

| File                                  | Vì sao đụng                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `packages/engines/src/e2-access.ts`   | Cả hai thêm **y hệt** 5 quyền + 2 dòng `KIND_DOMAIN`. Giữ MỘT bản. |
| `apps/web/src/routes.tsx`             | Hai route mới cùng chèn ở module 4; cả hai cùng đẩy Hiệu suất → 5  |
| `apps/web/src/app/chrome.tsx`         | Hai mục nav mới; số `no:` của ba mục cuối phải đếm lại sau khi gộp |
| `apps/api/drizzle/meta/_journal.json` | Cả hai thêm migration; **số thứ tự sẽ trùng**, xem ngay dưới       |

**Migration trùng số là chỗ nguy hiểm nhất.** Nhánh này chiếm `0024` và `0025`.
Nếu nhánh báo giá cũng sinh `0024`, `0025` thì sau merge có hai file khác nội
dung mang cùng số, và journal chỉ chở được một. Cách xử:

1. Giữ nguyên file của một nhánh, **đổi tên** file của nhánh kia lên số kế tiếp
   (`0026`, `0027`…) và sửa `tag` tương ứng trong `_journal.json`.
2. **Sinh lại snapshot** — `drizzle/meta/0026_snapshot.json` phải là snapshot
   TÍCH LUỸ sau khi áp cả hai. Cách an toàn nhất: xoá các snapshot đụng nhau,
   rồi chạy `drizzle-kit generate` một lượt trên cây đã merge và đối chiếu SQL
   nó sinh với hai file gốc.
3. Áp thử trên pglite sạch trước khi nghĩ tới Neon:
   `rm -rf /tmp/pgl-merge && DATABASE_URL=pglite:///tmp/pgl-merge npx drizzle-kit migrate`.

**Rồi mới tới `sau-merge/contract_quote_link.sql`.** Checklist đầy đủ nằm trong
chính file đó; tóm tắt: khai `quoteCode`/`quoteStatus` cùng khoá ngoại ghép vào
`contract.schema.ts`, chạy `drizzle-kit generate`, **đối chiếu** SQL sinh ra với
file viết tay, giữ bản sinh ra, xoá file viết tay — journal phải sở hữu nó.
Cùng lượt đó: `ContractSign` mất `amount`/`currency`, và
`contract.mapper.ts#toContract` thôi trả `null` cứng cho `quoteCode`.

---

## Chạy tại máy

Không đụng Neon — pglite trong chính tiến trình Node:

```bash
cd apps/api
rm -rf /tmp/pgl-hd
DATABASE_URL="pglite:///tmp/pgl-hd" npx drizzle-kit migrate
DATABASE_URL="pglite:///tmp/pgl-hd" node -r ts-node/register -r tsconfig-paths/register src/seed.ts

# Đăng nhập bằng trình duyệt cần mật khẩu thật — script này chỉ UPDATE actor đã có
DATABASE_URL="pglite:///tmp/pgl-hd" node -r ts-node/register -r tsconfig-paths/register \
  src/seed-accounts.ts --password='…' --apply

DATABASE_URL="pglite:///tmp/pgl-hd" PORT=4123 PV_TRUST_ACTOR_HEADER=true \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts

cd ../web && npx vite --port 5175
```

**pglite chỉ MỘT kết nối, và nó cắn thật.** Chạy `seed-accounts.ts` trong lúc
`main.ts` đang mở cùng thư mục thì máy chủ không thấy mật khẩu mới — đăng nhập
trả 401 mà không có dòng log nào nói vì sao. Tắt máy chủ trước, hoặc dựng một
thư mục pglite khác.

Kiểm nhanh bằng header (chỉ chạy khi `PV_TRUST_ACTOR_HEADER=true`):

```bash
curl -s -H 'X-PV-Actor-Id: u-ha'  'localhost:4123/sales/contracts?size=3'
curl -s -H 'X-PV-Actor-Id: u-huy' 'localhost:4123/sales/contracts'   # ownOnly: 2 dòng, hidden 4
curl -s -H 'X-PV-Actor-Id: u-anh' 'localhost:4123/sales/contracts'   # presales: 403

curl -s -X POST -H 'X-PV-Actor-Id: u-ha' -H 'Content-Type: application/json' \
  -d '{"label":"Đợt 1 — tạm ứng","amount":540000000,"dueDate":"2026-08-25"}' \
  'localhost:4123/sales/contracts/H%C4%90-2711/terms'
```

Mã hợp đồng có dấu nên trên đường dẫn nó phải mã hoá: `HĐ-2711` → `H%C4%90-2711`.

---

## Đã bấm thử những gì

Trên pglite tại máy, không đụng Neon:

- migrate → seed → seed:accounts → boot `main.ts` → curl từng cửa.
- Sổ: `u-ha` 6 dòng · `hidden` 0; `u-huy` 2 dòng · `hidden` 4; `u-anh` 403 gọi
  tên `hợp-đồng.xem`.
- Đợt: tạo ba đợt (`term_no` 1·2·3 do máy chủ cấp), ghi thu, xoá thu, đợt không
  có trả 404 **gọi tên số đợt**, mã sai dạng 400, mã không có 404, hợp đồng của
  đơn người khác 403.
- Trình duyệt: đăng nhập thật, mở `/sales/contracts` và
  `/sales/opportunities/OP-2711`, chụp cả hai màn. Sáu hợp đồng cũ hiện "—" ở
  cột giá trị, **không hiện 0**.
- `pnpm check` xanh trước mỗi commit.

**Chưa kiểm bằng mắt:** luật 12 và 13 trên tablet/mobile — hai màn mới chỉ được
xem ở 1440px. Hai khối cần nhìn lại ở `sm` là hàng bảy cột (nó cuộn ngang, có
`min-w-[920px]`) và danh sách đợt trong `ContractCard` khi cột phụ hẹp lại.

---

## Nợ mới mà nhánh này đẻ ra

1. **`quoteCode` trả `null` cứng ở mapper** — trả ở lượt merge, có ghi chú tại
   chỗ.
2. **Service chưa kiểm `SUM(đợt) = contract.amount`** — thiết kế gọi tên nó là
   nợ, nhánh này chưa trả. Màn in ra khoảng lệch nhưng không cửa nào chặn.
3. **Cửa ghi đợt không có màn** — bốn đường máy chủ, hai đường chưa ai bấm được
   từ giao diện.
4. **Sổ hợp đồng chưa có thẻ điểm** — xem mục "Cái gì chưa xong".
