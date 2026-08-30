# Tầm nhìn — module 4 · Báo giá (BG) · Hợp đồng (HĐ)

Phác **30/08/2026**, nhánh `develop`. Chưa dòng code nào — đây là bản để gật hoặc
bác trước khi ai chạm file.

Tiếp nối [`ban-giao-co-hoi.md`](./ban-giao-co-hoi.md) (module 3 đã đi hết vòng),
[`ban-giao-db.md`](./ban-giao-db.md) (lược đồ), [`ban-giao-api.md`](./ban-giao-api.md).

---

## Ba thứ chủ dự án đã chốt trước khi phác

| Câu                    | Chốt                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| "Deal" là gì           | **Báo giá là đối tượng riêng**, có dòng hàng, có nhiều bản              |
| Module dừng ở đâu      | **Kéo tới bàn giao** — ký xong phải nối được sang đơn bán SO của Supply |
| Dòng hàng có cần không | **Có**, đủ để IN báo giá và hợp đồng                                    |

---

## §1 · Chuỗi đầy đủ và ranh giới

```
                                      ┌── MODULE 4 (bản này) ──┐
landing ─┐                            │                        │
gõ tay  ─┼─> LEAD ──> CƠ HỘI ────────>│ BÁO GIÁ ───> HỢP ĐỒNG  │──> ĐƠN BÁN ──> LỆNH SX ──> ...
tệp     ─┘   (M2)     (M3, xong)      │  BG-5001      HĐ-5001  │     SO           WO
                                      │  bản 1·2·3    ký       │   ← module 5, nhánh Supply
                                      └────────────────────────┘
                                        ▲                    │
                    "đã thắng" = có dòng│bên contract        │một cạnh E1 + một sự kiện
                    — suy ra, KHÔNG lưu │(giữ nguyên luật cũ)│là tất cả những gì M4 để lại
```

**Module 4 KHÔNG đẻ đơn bán.** Nó để lại đúng hai thứ cho Supply nhặt: một cạnh
`platform.edge` từ `HĐ` và một sự kiện `sales.contract.signed`. Ký mà tự tạo SO
là buộc nhánh Sales phải biết lược đồ của nhánh Supply — đúng thứ biên giới
package trong `CLAUDE.md` cấm.

**Chuỗi này khớp fixture đã đóng băng, không phải tưởng tượng:** `sao-do.ts` đã
có sẵn `LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`, và
`das-vina.ts:46,57` đã có cạnh `OP-0288 → BG-1077`. Object kind `BG` và `HĐ` đều
đã khai trong `packages/engines/src/types.ts`. Module 4 lấp phần giữa của một
chuỗi đã vẽ, không mở chuỗi mới.

### Đánh số lại module

`routes.tsx:186` đang gọi Performance là "Module 4", `:193` gọi Plan là "Module 5".
Chuỗi số bám hành trình bán (1 chiến dịch → 2 lead → 3 cơ hội) nên Báo giá·Hợp
đồng phải chen vào **4**, đẩy Performance → 5, Plan → 6, Thiết lập → 7. Phải sửa
hai chỗ: chuỗi `name` trong `routes.tsx` và `SALES_MODULES` trong `app/chrome.tsx`.

---

## §2 · Bốn quyết định xương sống

### 1 · MỖI BẢN MỘT MÃ RIÊNG — chủ dự án chốt 30/08

`BG-5001` bản đầu, khách xin giảm thì bản kế là `BG-5002`, mã mới hoàn toàn. Cột
`version` chỉ là số thứ tự để người đọc ("bản 2"), không phải khoá. Bản cũ
**không bao giờ được UPDATE**; nó ở lại nguyên trạng với trạng thái `thay-the`.

Vì sao không sửa đè: `BG-5001` đã rời khỏi hệ — nó nằm trong lá thư khách đang
cầm, trong cạnh E1, trong dòng `sales.touch`. Sửa tại chỗ nghĩa là tờ giấy khách
cầm và dòng trong máy lặng lẽ khác nhau, không ai commit gì cả.

Cái được của mã riêng, ngoài chuyện khách trích dẫn được đúng một con số cho đúng
một tờ giấy: **`event_key` của mail tự khác nhau**. Nếu một mã chở nhiều bản thì
khoá `<flow>/<audience>/v1/<mã>` trùng nhau giữa hai lần gửi, và
`onConflictDoNothing` **nuốt lá thứ hai trong im lặng** — không lỗi, không log,
khách không nhận được gì. Hình này giết cái bẫy đó mà không cần luật thêm.

Cái mất, chấp nhận có ý thức: dãy mã nhảy cóc theo số lần thương lượng — một đơn
qua ba vòng ăn hết ba số. Đây là điều `contract_code_seq` từng tránh khi tách khỏi
`opportunity_code_seq`, và ở đây thì đổi lấy tính bất biến của tờ giấy đã gửi.

**Hệ quả bắt buộc: cạnh E1 phải nối thành CHUỖI, không phải chùm anh em.**

```
đúng:  OP-5001 → BG-5001 → BG-5002 → HĐ-5001
sai:   OP-5001 → BG-5001
       OP-5001 → BG-5002 → HĐ-5001        (hai cạnh cùng xuất phát từ OP)
```

Lý do rất cụ thể, đọc từ `packages/engines/src/e1-object-graph.ts:76-84`:
`story()` trải mọi đường từ gốc, chọn đường **dài nhất** chứa mã đang mở, và hoà
thì **phân xử bằng thứ tự mã**. Nối kiểu chùm thì trước lúc ký, hai bản là hai lá
dài bằng nhau — luật hoà chọn mã nhỏ hơn, tức ContextRail vẽ **bản CŨ đã bị thay**
trong khi bản mới mới là bản đang sống. Nối thành chuỗi thì đường luôn dài dần về
bản mới nhất, rail tất định, và lịch sử thương lượng đọc được nguyên vẹn.

### 2 · Tiền hợp đồng KHÔNG gõ tay — neo vào bản báo giá khách đã chốt

`ContractSign` bỏ hẳn `amount`/`currency`. Ký là chọn một bản báo giá đang ở
trạng thái "khách chốt"; số tiền đọc từ bản đó. Muốn số khác thì làm bản kế và
chốt bản đó — mất hai mươi giây, đổi lại câu "hợp đồng này bao nhiêu tiền" chỉ
còn đúng một nguồn.

**Tôi đã bác cửa thoát "☑ Ký khác số báo giá" mà bản nháp màn đề nghị.** Một ô
tick cho phép lệch là đủ để lệch: nó sẽ được dùng đúng vào lúc gấp, và không màn
nào báo cho ai biết. Đây cùng loại lỗi mà repo đã từ chối một lần khi không cho
`opportunity` có `state='won'`.

### 3 · "Đã thắng" vẫn là dòng bên `contract` — không đổi

Luật cũ giữ nguyên. Module này chỉ bồi cột cho `sales.contract`, không thêm
trạng thái thắng nào lên `opportunity`.

### 4 · Cưỡng chế ở tầng BẢNG, không nhờ service nhớ

Ba bất biến tiền bạc đều có hàng rào Postgres, không phải kỷ luật code:
một cơ hội một hợp đồng · một cơ hội nhiều nhất một bản báo giá được chốt ·
hợp đồng chỉ trỏ được vào bản đã chốt và bản đó không rút lại được. Chi tiết ở §3.

---

## §3 · Dữ liệu

### `sales.quote` — một dòng, một mã, mỗi bản

```
key      code                                 PK · version chỉ là số thứ tự đọc
neo      opportunity_code · lead_code         FK GHÉP → opportunity(code, lead_code)
vòng đời status · sent_at · decided_at · valid_until
tiền     currency · subtotal · discount_total · vat_total · total
giấy     title · note                         chữ in ra cho khách đọc
vết      created_by → actor.id · created_at
```

`status`: `nhap` · `da-gui` · `khach-chot` · `khach-tu-choi` · `thay-the`.

**Bản cũ chuyển `thay-the` lúc bản mới được GỬI, không phải lúc nó được tạo.**
Soạn một bản nháp rồi bỏ dở mà đã kịp giết bản khách đang cầm thì đơn mất báo giá
sống trong khi không ai gửi gì cho khách cả.

**Không có trạng thái `het-han`.** Hết hạn là `valid_until < hôm nay` — tính lúc
đọc. Lưu nó thành trạng thái là dựng lại đúng lỗi `days_here` mà `ban-giao-db.md`
đã sửa một lần: một con số đổi theo thời gian mà lại đóng băng vào cột.

Ràng buộc:

```sql
UNIQUE (opportunity_code, version)                             -- bản mấy của đơn nào
UNIQUE INDEX ... ON quote(opportunity_code) WHERE status='khach-chot'
                                                               -- nhiều nhất MỘT bản chốt
UNIQUE (code, status)                                          -- bệ cho FK của contract, §dưới
CHECK  quote_status_known                                      -- như opportunity_state_known
CHECK  (sent_at IS NULL) = (status = 'nhap')
index  quote_opportunity_idx (opportunity_code)                -- Postgres không tự index FK
```

`version` **không suy ra từ mã** — `BG-5002` có thể là bản 2 của đơn này hoặc bản
1 của đơn khác, vì dãy mã là của cả hệ chứ không của từng đơn. Nó là
`max(version)+1` trong cùng `opportunity_code`, cấp lúc tạo, trong transaction.

**Dãy `sales.quote_code_seq` bắt đầu ở 5001**, và với hình "mỗi bản một mã" thì nó
tiêu số nhanh hơn mọi dãy khác trong hệ — càng phải bắt đầu đúng chỗ. Không phải 1: `seed.ts:488` nạp
`dasVina.objects` vào `platform.object`, mà danh sách đó chứa `BG-1077`
(`das-vina.ts:46`). Dãy từ 1 thì báo giá thứ 1077 đụng đúng dòng gương ấy — y hệt
lý do dãy mã cơ hội và mã hợp đồng đều bắt đầu ở 5001. Mã `BG` khớp `MaObject`
sẵn có, không cần primitive riêng (khác `MaHopDong`, phải tách vì chữ `Đ`).

### `sales.quote_line`

```
key    quote_code · line_no                          PK ghép
nội    description · unit
tiền   qty numeric(12,2) · unit_price · discount_pct · vat_pct · line_total
```

`line_total` là **cột GENERATED** — công thức chỉ đọc cột cùng dòng nên Postgres
làm được:

```sql
line_total bigint GENERATED ALWAYS AS (
  round(round(qty * unit_price * (1 - discount_pct/100)) * (1 + vat_pct/100))
) STORED
```

Làm tròn **hai tầng, mỗi tầng về đồng nguyên**: khách cộng tay cột "thành tiền"
in trên giấy, và tổng máy in ra phải khớp phép cộng tay đó. Cộng-rồi-mới-tròn thì
lệch vài đồng, và vài đồng trên giấy tờ tiền tỷ là một cuộc điện thoại.

**VAT theo DÒNG, không theo phiếu.** Giấy phép phần mềm chịu 10% trong khi đào
tạo có thể khác; cấp dòng bao được cấp phiếu (đặt cùng một % cho mọi dòng), cấp
phiếu thì không mở ngược lại được.

Bốn cột tổng của `quote` **do service ghi lại trong cùng transaction** mỗi lần một
dòng của bản `nhap` đổi — SUM xuyên dòng thì GENERATED không làm được. Không tính
lúc đọc: số trên hợp đồng phải là số đã đóng băng lúc chốt, không phải số được
tính lại mỗi lần ai đó mở màn.

### `sales.contract` — bồi cột

| Cột mới        | Kiểu                        | Null | Vì sao                                  |
| -------------- | --------------------------- | ---- | --------------------------------------- |
| `quote_code`   | text                        | có   | 6 hợp đồng cũ không có báo giá đứng sau |
| `quote_status` | text DEFAULT `'khach-chot'` | có   | cột ghim, xem ngay dưới                 |

```sql
FOREIGN KEY (quote_code, quote_status) REFERENCES quote (code, status)
CHECK  (quote_status IS NULL OR quote_status = 'khach-chot')
UNIQUE (opportunity_code)                    -- trả nợ #10 của fix-later.md
```

Mã báo giá là khoá chính đủ một mình nên khoá ngoại chỉ còn **hai** cột thay vì
ba — một trong những chỗ hình "mỗi bản một mã" trả lại cho thiết kế.

**Cột `quote_status` luôn mang đúng một giá trị — đó là chủ ý.** Nó biến "bản báo
giá đã ký thì không rút lại được" thành việc của Postgres: đổi `quote.status` rời
khỏi `khach-chot` trong khi có hợp đồng trỏ vào là `23503`, không phải một bug chờ
người phát hiện. Cái giá: một cột hằng. Đổi lại: đường tiền không còn chỗ nào
lệch được. Nếu muốn rẻ hơn thì bỏ cột và giao cho service — nhưng thế là dựng lại
đúng hình dạng của nợ #10, và lần này là trên số tiền.

**Ba cột đều nullable, cố ý.** Sáu hợp đồng cũ (`HĐ-2711…2716`) không có báo giá,
và `amount` của chúng **đang NULL thật trên Neon**. Dựng báo giá hồi tố với đơn
giá bịa ra để lấp NOT NULL là đúng thứ fixture đã từ chối bằng chữ: "bịa một giá
trị hợp đồng ở đây là bịa doanh số" (`das-vina.ts`). Hàng MỚI thì service luôn
điền đủ — schema cho phép NULL không có nghĩa cửa ghi được phép để trống.

`amount`/`currency` **giữ lại** trên `contract` như ảnh chụp lúc ký. Đây là bản
sao GIÁ TRỊ, thứ repo vốn cảnh giác — nhưng nó không trôi được, vì bản báo giá
nguồn đã bị FK ghim bất động và service chép trong cùng transaction. Nếu muốn
kiểm: `contract.amount ≠ quote.total` của bản đang trỏ là câu SELECT một dòng.

### `sales.contract_payment_term` — đợt thanh toán

```
key   contract_code · term_no
nội   label ("Đợt 1 — tạm ứng") · amount · due_date · paid_at · status
```

Lưu **số tiền, không lưu %** — % là thứ suy ra lúc in. Đây là _kế hoạch thu_ nằm
trong tờ hợp đồng, thuộc module 4; _việc thu tiền thật_ là của Finance, module sau.
Không CHECK `SUM(amount) = contract.amount` được (CHECK không thấy dòng khác) —
service kiểm, và đó là một khoản nợ có tên, không phải một chỗ quên.

---

## §4 · Hợp đồng zod

File mới `packages/contracts/src/sales/quote.ts`, cố ý là **lá**: chỉ import
`../primitives` và `./enums`. `contract.ts` sẽ import THÊM một chiều từ `./quote`.
Ngược lại là vòng chết lúc nạp module — đúng cái đã xảy ra thật với `MaHopDong`
và bắt nó phải dời sang `primitives.ts` (ghi ở `ban-giao-co-hoi.md`, vòng ba).

```ts
QuoteStatus  = z.enum(['nhap','da-gui','khach-chot','khach-tu-choi','thay-the'])
QuoteLineRow   { lineNo, description, unit, qty, unitPrice, discountPct, vatPct, lineTotal }
QuoteLineDraft = QuoteLineRow.omit({ lineTotal: true })   // server tính, client không gửi
QuoteRow       { code, version, opportunityCode, leadCode, status, currency, title, note,
                 validUntil, subtotal, discountTotal, vatTotal, total,
                 sentAt, decidedAt, createdAt, lines }
QuoteDraft     { title, note, validUntil, currency, lines: min(1) }

ContractRow   += quoteCode                        // nullable, chỉ NULL ở 6 dòng cũ
ContractSign   { signedAt?, ownerId? }            // MẤT amount/currency — §2.2
ContractTermRow / ContractTermDraft               // đợt thanh toán
```

---

## §5 · Cửa và quyền

### Cửa

| Cửa                                        | Quyền          | scoped | Ghi chú                                       |
| ------------------------------------------ | -------------- | ------ | --------------------------------------------- |
| `GET /sales/quotes`                        | `báo-giá.xem`  | có     | sổ, cắt ngang mọi cơ hội                      |
| `GET /sales/quotes/:code`                  | `báo-giá.xem`  | có     | một bản, kèm mọi bản cùng đơn để đối chiếu    |
| `POST /sales/quotes`                       | `báo-giá.sửa`  | **†**  | `opportunityCode` trong thân, không trên path |
| `PATCH /sales/quotes/:code`                | `báo-giá.sửa`  | có     | 409 nếu đã gửi — sửa đè lên thứ khách cầm     |
| `POST /sales/quotes/:code/replace`         | `báo-giá.sửa`  | có     | mồi từ bản này, **cấp mã mới**, nối cạnh      |
| `POST /sales/quotes/:code/send`            | `báo-giá.gửi`  | có     | 409 nếu liên hệ không có email                |
| `POST /sales/quotes/:code/decide`          | `cơ-hội.chốt`  | có     | khách chốt / từ chối — xem ghi chú quyền      |
| `GET /sales/contracts`                     | `hợp-đồng.xem` | có     | sổ hợp đồng                                   |
| `POST /sales/opportunities/:code/contract` | `cơ-hội.chốt`  | có     | **cửa cũ, đổi thân** — không nhận tiền nữa    |
| `POST · PATCH .../contracts/:code/terms`   | `hợp-đồng.sửa` | có     | đợt thanh toán                                |

**†** `POST /sales/quotes` không scoped được vì chưa có `ref` để soi — nhưng
**phải kiểm phạm vi của CƠ HỘI cha trong service**. Bỏ qua chỗ này là một Sale
`ownOnly` soạn được báo giá trên đơn của người khác; không cửa nào khác chặn.

### Quyền — năm cái mới, không phải sáu

`báo-giá.xem` · `báo-giá.sửa` · `báo-giá.gửi` · `hợp-đồng.xem` · `hợp-đồng.sửa`.

**Ghi nhận "khách đã chốt" dùng `cơ-hội.chốt` sẵn có, không đẻ `báo-giá.chốt`.**
Bàn tay chốt bản nào cũng chính là bàn tay quyết định số tiền sẽ được ký — buộc
hai việc vào một quyền là mô tả đúng thực tế, và bớt được một dòng trong ma trận.

| Vai            | báo-giá.xem/sửa | báo-giá.gửi | hợp-đồng.xem/sửa |
| -------------- | --------------- | ----------- | ---------------- |
| giám-đốc · TP  | có              | có          | có               |
| sale           | có              | có          | có               |
| presales       | **có**          | không       | không            |
| bd · marketing | không           | không       | không            |

Presales dựng số và chạy demo — chính docblock của `ContractSign` đã viết vậy —
nhưng không cầm việc gửi ra ngoài, đối xứng với việc họ không có `cơ-hội.chốt`.
Cặp `sửa`/`gửi` có tiền lệ sẵn: `chiến-dịch.sửa` và `chiến-dịch.bắn`.

### Một lỗ hổng đang mở, phải vá TRƯỚC khi sổ hợp đồng lên

`KIND_DOMAIN` trong `packages/engines/src/e2-access.ts` chỉ ánh xạ `LD→lead` và
`OP→cơ-hội`. `HĐ` không có miền nên `permissionFor()` trả `null`, và `can()` chỉ
còn kiểm license — **trục vai bị bỏ qua hoàn toàn cho object hợp đồng**, trong khi
cửa ký đã ghi `amount` vào dòng gương `platform.object` từ 26/08.

Hôm nay chưa ai khai thác được vì `GraphService` chưa nối controller nào. Nhưng
màn hợp đồng chính là cái sẽ nối. Vá bằng đúng hai dòng: `BG: 'báo-giá'`,
`HĐ: 'hợp-đồng'`.

Việc này **phá quyết định #6 của `ban-giao-db.md`** ("giữ nguyên ma trận quyền,
không thêm quyền mới"), và đáng phá: quyết định đó nói về lead/chiến dịch, nơi
thiếu quyền chỉ lộ thông tin nội bộ. Ở đây thiếu quyền là lộ **số tiền hợp đồng
đã ký của mọi đơn** cho vai không được biết.

---

## §6 · E1 và E4

### Đồ thị — module này là cửa ĐẦU TIÊN ghi `platform.edge`

Tới hôm nay chỉ `seed.ts` ghi cạnh; `ObjectMirror` chỉ viết bảng `object`. Nên
ContextRail (luật 10) đang đứt ngay tại hợp đồng.

- `OP → BG` — chỉ cho bản ĐẦU TIÊN của một đơn
- `BG → BG` — bản kế nối vào bản nó thay, **không** nối lại về `OP`; lý do ở §2.1
- `BG → HĐ` — ghi trong transaction ký, cạnh chỗ đang ghi dòng gương `HĐ`
- `HĐ → SO` — module 5

Kind cạnh dùng `'sinh-ra'` đã có. Phương thức ghi cạnh phải thêm vào
`platform/graph`, **không** viết tay trong `branches/sales` — đúng cảnh báo mà
docblock của `opportunity.service.ts` đã đặt sẵn. Xong việc này thì rail đọc được
`LD-0847 → OP-5001 → BG-5001 → BG-5002 → HĐ-5001` — cả lịch sử thương lượng, tất
định, không phụ thuộc luật hoà.

Rail dài ra theo số vòng thương lượng là cái giá của hình "mỗi bản một mã". Nếu
tới ngày một đơn có sáu bản mà dãy chip tràn, chỗ giải là **component rail** (thu
gọn khúc giữa), không phải bỏ bớt cạnh — bỏ cạnh là làm mất lịch sử ở tầng dữ liệu
để cứu một vấn đề bố cục.

### Mail

| Lá                         | Bắn từ                     | Nhận   |
| -------------------------- | -------------------------- | ------ |
| `quote-sent-customer`      | cửa `send`                 | KHÁCH  |
| `quote-expiring-internal`  | sweeper theo `valid_until` | Sale   |
| `contract-signed-internal` | cửa ký                     | nội bộ |

`event_key` giữ đúng hình đang dùng — `quote-send/external/v1/<mã>` — và **an
toàn nhờ chính quyết định §2.1**: mỗi bản một mã nên hai lần gửi không bao giờ
trùng khoá. Nếu ngày nào đó có ai gộp nhiều bản vào một mã, đây là chỗ vỡ trước
tiên: `onConflictDoNothing` nuốt lá thứ hai trong im lặng, không lỗi, không log,
khách không nhận được gì.

Lá đi ra ngoài đòi thứ mà mail nội bộ không đòi: kiểm `suppression`, có
`List-Unsubscribe` (composer MAS đã có, composer cơ hội thì không). Đính kèm PDF
thật vẫn là nợ #12, đi đường vòng ở §7.

---

## §7 · Màn

| Màn                          | Trạng thái | Quyền          | Câu nó trả lời                             |
| ---------------------------- | ---------- | -------------- | ------------------------------------------ |
| `/sales/quotes`              | MỚI        | `báo-giá.xem`  | bản nào sắp hết hạn, tổng đã báo tháng này |
| `/sales/contracts`           | MỚI        | `hợp-đồng.xem` | tháng này ký bao nhiêu, đợt nào tới hạn    |
| Modal "Soạn báo giá"         | MỚI        | `báo-giá.sửa`  | bán gì, giá bao nhiêu, tổng đúng chưa      |
| `/sales/opportunities/:code` | SỬA        | giữ nguyên     | đơn này báo giá tới bản mấy, ký chưa       |
| `SignDrawer`                 | SỬA        | giữ nguyên     | ký bằng đúng số bản khách đã chốt          |

**Không có hồ sơ báo giá riêng và chưa có hồ sơ hợp đồng riêng.** Dòng ở cả hai
sổ đều mở về hồ sơ CƠ HỘI — nơi thẻ báo giá và thẻ hợp đồng sống. Hồ sơ hợp đồng
tách route vào ngày nó có thứ để sống tiếp: đơn bán, tiến độ giao, thu tiền —
tức là module 5, không phải bây giờ.

```
/sales/opportunities/:code  — SỬA hai chỗ
┌─ GlassCard đầu trang ─────────────────────────────────────────┐  giữ nguyên
├─ main · DealCard ──────────┬─ side ──────────────────────────┤
│                             │ LeadCard            giữ nguyên  │
│                             │ QuoteCard  ← MỚI                │
│                             │   BG-5002 · bản 2 · Khách chốt  │
│                             │   ↳ BG-5001 · bản 1 · đã thay   │
│                             │   [Soạn bản mới] [In] [Gửi khách]│
│                             │ ContractCard ← MỚI, hiện sau ký │
│                             │   HĐ-5001 · 3 đợt · thu 30%     │
│                             │ PeopleCard · ActivityCard       │
├─────────────────────────────┴─────────────────────────────────┤
│ ToolsBar  [Gọi] [Hồ sơ lead] [Chốt thắng]        giữ nguyên   │
└───────────────────────────────────────────────────────────────┘

Modal "Soạn báo giá · BG-5002 · bản 2 của OP-5001"  (Modal xl, KHÔNG phải Drawer)
┌───────────────────────────────────────────────────────────────┐
│ Hạn hiệu lực [2026-09-15]   Tiêu đề [Factory MES + One Plus]  │
├─ Dòng hàng · DataTable + <Input> trong ô ─────────────────────┤
│  ↑↓ │ Mô tả │ ĐVT │ SL │ Đơn giá │ CK% │ VAT │ Thành tiền │ ✕ │
│  [+ Thêm dòng]                                                │
├─ Tổng kết · GlassCard variant=a ──────────────────────────────┤
│  Tạm tính · Chiết khấu · VAT ·  TỔNG CỘNG  (Money hero)       │
└─ [Lưu nháp] [Huỷ] ····························· [Gửi khách] ──┘
```

Bảng dòng hàng dựng bằng `DataTable` sẵn có nhét control vào ô (tiền lệ:
`Checkbox` trong `AudiencePicker` của `campaign-form.tsx`), **không thêm component
mới vào `@pv/ui`**. Đổi thứ tự dòng bằng hai nút ↑↓ chứ không kéo-thả: ít code
hơn, và bàn phím dùng được ngay. Mobile 440 bỏ bảng, mỗi dòng hàng thành một thẻ
dọc, khối tổng dính đáy màn.

**In và gửi.** Không có hạ tầng PDF nào trong repo, và `packages/mail-templates`
là React Email khổ 560px cho hộp thư — sai hình cho chứng từ A4. Nút "In" mở một
view `@media print` rồi `window.print()`, trình duyệt tự lưu PDF. Gửi thì dùng
lại `MasMailModal` mồi sẵn người nhận, Sale tải PDF lên Drive và dán link vào ô
CTA — **đúng đường vòng đã chốt ở nợ #12, không mở hạ tầng tạm thứ hai**.

**Trạng thái đơn phải tự đi theo báo giá.** Cửa `send` chuyển
`opportunity.state → gui-quotation` trong cùng transaction, và chỉ dí lại `stage`
khi `state` thật sự đổi — đúng bài học lỗi #3 của module 3 ("lưu một đơn làm nó
tự đổi cột"). Không làm thế thì Sale phải nhớ đổi trạng thái ở hai chỗ, và bảng
kanban nói dối ngay lần đầu ai đó quên.

---

## §8 · Lộ trình — bảy lượt, mỗi lượt để lại `pnpm check` xanh

| Lượt  | Làm gì                                                             | Vì sao đứng ở đây                                                   |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **0** | Đếm trùng trên Neon rồi áp `UNIQUE(contract.opportunity_code)`     | Sổ hợp đồng đọc thẳng bảng; đếm sai thì sổ sai từ ngày đầu          |
| **1** | `KIND_DOMAIN` + năm quyền + ma trận vai                            | Đóng lỗ tiền trước khi có màn mở nó ra                              |
| **2** | Bảng `quote`/`quote_line` + cửa đọc·tạo·sửa·bản mới + cạnh `OP→BG` | Cần lượt 1                                                          |
| **3** | Gửi · ghi quyết định khách + lá mail ra ngoài                      | Cần lượt 2                                                          |
| **4** | Sổ hợp đồng (chỉ đọc) + đổi thân `ContractSign` + cạnh `BG→HĐ`     | Cần lượt 0 và 3 — phải có bản chốt mới ký được                      |
| **5** | Đợt thanh toán                                                     | Cần lượt 4                                                          |
| **6** | Bật ContextRail trên cả bốn màn Sales cùng một lượt                | Cần cạnh của lượt 2 và 4; là quyết định bố cục xuyên màn, xem §11.5 |

Lượt 0 **không lùi được nếu chạy ẩu**: đếm
`SELECT opportunity_code, count(*) … HAVING count(*) > 1` trước. Có dòng thì
DỪNG và hỏi — dọn trùng là việc nghiệp vụ, không phải việc của migration.

Lượt 4 **là breaking**: `ContractSign` đổi hình, `pnpm check` phải đỏ ở mọi chỗ
import nó. Nếu xanh ngay mà không sửa gì thì có chỗ đang ép kiểu che mất — grep lại.

---

## §9 · Cố ý KHÔNG làm

- **Danh mục sản phẩm.** Công ty bán giải pháp theo dự án ("Factory MES + One
  Plus"), không có SKU, không có kho. Dòng hàng để mô tả tự do; dựng catalog bây
  giờ là dựng bảng cho thứ chưa ai xin.
- **Huỷ ký, sửa hợp đồng đã ký.** Ký là thứ đã sang tay kế toán và tay khách; gỡ
  nó phải là một đề nghị có người duyệt (E3), không phải một lượt gọi của người
  vừa lỡ tay. Luật cũ, giữ nguyên.
- **Sinh PDF ở máy chủ, kho đính kèm riêng.** Nợ #12 đang chờ AWS; mở kho tạm ở
  module này là chồng thêm một đường phải dọn.
- **Đơn bán SO, giao hàng, nghiệm thu, thu tiền thật.** Module 5 và Finance.
- **Bịa tiền cho 6 hợp đồng cũ.** Chúng ở lại NULL. Doanh số thật chảy từ ngày ký
  thật đầu tiên trở đi, không hồi tố.

---

## §10 · Bốn chỗ bản nháp sai, đã sửa

Ghi lại vì mỗi chỗ là một lỗi có thật, không phải ý kiến.

1. **Dãy `quote_code_seq` bắt đầu ở 1.** Lập luận "không mã `BG-` nào chạm
   Postgres" sai: `seed.ts:488` nạp `dasVina.objects` — có `BG-1077` — vào
   `platform.object`. Đã đổi sang 5001.
2. ~~**Mỗi bản báo giá một mã mới.**~~ Tôi từng bác chỗ này (mã nhảy cóc, rail mọc
   chip); **chủ dự án chốt giữ mã riêng ngày 30/08** và bản thiết kế đã dựng lại
   theo. Kiểm lại thì hình này còn trả về hai thứ tôi bỏ sót: khoá ngoại của
   `contract` bớt một cột, và `event_key` của mail tự khác nhau nên cái bẫy
   "nuốt lá thứ hai" biến mất không cần luật. Cái giá thật — rail dài ra — được
   xử ở §6 bằng cạnh nối chuỗi, và đó là chỗ **phải làm đúng**: nối kiểu chùm thì
   luật hoà của `story()` vẽ ra bản CŨ.
3. **Ô tick "Ký khác số báo giá".** Dựng lại đúng nguồn sự thật thứ hai mà cả
   thiết kế này sinh ra để giết. Đã bỏ.
4. **Sáu quyền mới.** `báo-giá.chốt` gộp được vào `cơ-hội.chốt` sẵn có vì cùng
   một bàn tay. Còn năm.

Một chỗ nữa hai bản nháp **cùng phát hiện độc lập** nên tôi giữ nguyên cả hai
cách diễn đạt: `opportunity.state='gui-quotation'` gõ tay được sẽ thành nguồn sự
thật thứ hai cạnh trạng thái báo giá. Cách trả ở §7.

---

## §11 · Năm câu treo — đã chốt 30/08

Chủ dự án uỷ quyền quyết. Ghi lại kèm lý do để sau này ai muốn lật thì lật đúng
chỗ, không phải lật cả bản thiết kế.

### 1 · Cột ghim `quote_status` — GIỮ

Một cột hằng và một unique index, đổi lấy việc đường tiền không có chỗ nào lệch
được. Bỏ nó thì bất biến "hợp đồng chỉ trỏ vào bản khách đã chốt" chỉ còn nằm
trong service — **đúng hình dạng của nợ #10**, thứ đang nghi làm sổ đếm sai trên
production ngay lúc này. Vừa bị bỏng vì một bất biến chỉ có ở tầng service thì
không dựng thêm cái thứ hai, nhất là trên đường tiền.

Không có rủi ro kỹ thuật: `contract.schema.ts` đã có sẵn một khoá ngoại GHÉP vào
cặp cột không phải khoá chính (`opportunity(code, lead_code)`), nên Drizzle diễn
đạt được hình này rồi, không phải thứ phải thử xem có được không.

### 2 · Sổ hợp đồng — LÊN Ở LƯỢT 4, và chỉ ĐỌC

Lên, vì lượt 4 là lúc đồng tiền thật đầu tiên tồn tại trong hệ:
`data/performance.ts` hôm nay ghi thẳng trong code rằng "fixture không ghi giá
trị hợp đồng đã ký nên không cộng vào đây". Sổ hợp đồng là chỗ đầu tiên câu
"tháng này ký được bao nhiêu" có câu trả lời thật thay vì số fixture.

Rẻ, vì khung sổ là bản sao của `opportunities.tsx` — một cửa đọc, một màn.
Nhưng **chỉ đọc**: không hồ sơ riêng, không sửa hợp đồng ở lượt này. Hồ sơ hợp
đồng tách route vào ngày nó có thứ để sống tiếp (đơn bán, giao hàng, thu tiền) —
tức module 5.

### 3 · Presales — SỬA ĐƯỢC, GỬI THÌ KHÔNG

`báo-giá.xem` + `báo-giá.sửa`, không `báo-giá.gửi`.

Ranh giới ở đây không phải "ai được tính toán" mà là **"ai được nói chuyện với
khách"**. Presales dựng số và chạy demo — chính docblock của `ContractSign` đã
viết vậy — còn quan hệ với khách là của người đứng đơn. Hình này khớp đúng chỗ
presales đã có `cơ-hội.sửa` mà không có `cơ-hội.chốt`, và cặp `sửa`/`gửi` có tiền
lệ sẵn là `chiến-dịch.sửa`/`chiến-dịch.bắn`.

### 4 · `opportunity.state` — VẪN GÕ TAY ĐƯỢC, và KHÔNG suy ra từ báo giá

Vẫn cho gõ tay: báo giá miệng qua điện thoại là chuyện có thật, và một cột không
gõ được thì người bán không ghi nổi thực tế.

Quan trọng hơn: **không được biến `state` thành cột suy ra từ trạng thái báo giá.**
Hai cột trả lời hai câu khác nhau — `state` là "người bán đang làm gì" (tự khai),
trạng thái báo giá là "tờ giấy đang ở đâu" (sự việc). Ép cái này suy ra cái kia
là dựng lại đúng lỗi mà module 3 đã tránh khi giữ `state` và `stage` thành hai
cột rời: năm trạng thái chỉ ánh xạ xuống ba trong năm cột, và một cột `GENERATED`
sẽ xoá mất vị trí của những đơn không khớp.

Cửa `send` đẩy `state` sang `gui-quotation` cho ca phổ biến — một người ghi tự
động, một người ghi tay, nhưng vẫn **chỉ một cột**. Hai người ghi vào một cột thì
không lệch được; hai cột cùng trả lời một câu mới lệch.

### 5 · ContextRail — KHÔNG ở lượt 4, làm thành LƯỢT 6 riêng

Lượt 4 không dựng rail, nhưng lý do cũ ("chờ người gật bố cục") nay hết hiệu lực
một nửa: sau lượt 2 và 4 thì cạnh E1 đã có thật, nên rail có thứ để vẽ lần đầu.

Nó thành lượt riêng vì nó là **quyết định bố cục xuyên màn**, không phải một tính
năng của module 4: rail phải sáng cùng lúc ở hồ sơ lead, hồ sơ cơ hội, sổ báo giá
và sổ hợp đồng, hoặc không sáng ở đâu cả. Nhét nó vào lượt 4 là để một màn có rail
còn ba màn kia không — luật 10 nói "bắt buộc trên mọi màn", nửa vời còn tệ hơn chưa làm.

---

## §12 · Đối chiếu sáu CRM lớn — soát 31/08/2026

Mục này trả lời câu sẽ bị hỏi lại mỗi lần có người cãi về phạm vi module 4:
"sau cơ hội thì thị trường còn những màn gì, mình bỏ cái nào và vì sao".

### Chuỗi sau Opportunity

| CRM                          | Chuỗi                                                                               | Hình đáng chú ý                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Dynamics 365 Sales**       | Opportunity → **Quote → Order → Invoice**                                           | "Revise" đẻ bản mới có revision number, bản cũ đóng băng             |
| **Zoho CRM**                 | Deal → **Quote → Sales Order → Invoice**                                            | Y hệt Dynamics, thêm Purchase Order phía mua                         |
| **Salesforce** (CPQ/Revenue) | Opportunity → **Quote → Contract → Order → Asset/Subscription → Invoice → Renewal** | Chuỗi dài nhất; Contract là object riêng CÓ KỲ HẠN, Order sinh Asset |
| **SugarCRM**                 | Opportunity → **Quote → Contract → Invoice**                                        | Contract đứng riêng, giống Salesforce                                |
| **HubSpot**                  | Deal → **Quote (ký điện tử + link thanh toán) → Invoice → Subscription**            | KHÔNG có Contract lẫn Order — quote gánh cả vai chứng từ             |
| **Odoo**                     | Opportunity → **Quotation → Sales Order → Delivery → Invoice**                      | Quotation và Sales Order là MỘT record đổi state, không phải hai     |

### PV One thuộc trường phái ERP sản xuất, không phải CRM nhẹ

Ba trường phái: **nhẹ** (HubSpot · Pipedrive — dừng ở quote rồi đẩy sang kế toán),
**B2B cổ điển** (Dynamics · Zoho · Sugar — quote → order → invoice trong cùng CRM),
**ERP sản xuất** (Odoo · SAP — đi tiếp tới sản xuất và giao hàng).

Dữ liệu tự khai chúng ta ở nhóm ba: `sao-do.ts` đã có
`LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`, và `ObjectKind`
trong `packages/engines/src/types.ts` đã đặt chỗ cho `SO`·`WO`·`PO`.

**Hệ quả cụ thể: đừng lấy HubSpot làm chuẩn.** Nó không có Contract lẫn Order —
đúng hai thứ chuỗi của chúng ta cần — nên mọi so sánh "HubSpot làm gọn hơn" là so
với một sản phẩm giải bài khác.

### Hai quyết định của bản này được thị trường xác nhận

- **Mỗi bản báo giá một mã riêng** (§2.1) trùng đúng cơ chế "Revise" của Dynamics,
  và ngược Odoo (một record đổi state). Cả hai trường phái đều tồn tại trong sản
  phẩm thật, nên đây là lựa chọn có tiền lệ chứ không phải sáng tạo riêng.
- **Module 4 không đẻ SO** (§1) là đúng ranh giới Odoo đặt: bên bán chốt chứng từ,
  bên cung ứng nhặt lấy.

### Sáu khối thị trường có mà bản này chưa nhắc

Xếp theo mức đáng làm với PV One, không theo mức phổ biến.

| #   | Khối              | Ai có                         | Quyết định                     |
| --- | ----------------- | ----------------------------- | ------------------------------ |
| 1   | Duyệt chiết khấu  | Salesforce · Dynamics · Zoho  | **Nhận — vào lượt 3**          |
| 2   | Kỳ hạn hợp đồng   | Salesforce · Dynamics · Sugar | **Nhận — bồi cột ở lượt 0**    |
| 3   | Ký điện tử        | HubSpot · Salesforce+DocuSign | Hoãn — chờ nợ #12              |
| 4   | Hoá đơn · công nợ | tất cả trừ Pipedrive          | Ngoài phạm vi — Finance        |
| 5   | Tài sản đã lắp    | Salesforce Asset · Odoo       | Ngoài phạm vi — module dịch vụ |
| 6   | Ticket sau bán    | Service Cloud · Zoho Desk     | Ngoài phạm vi — module dịch vụ |

**1 · Duyệt chiết khấu — đáng nhất, vì hạ tầng đã nằm sẵn không dùng.**
Approval Process trên Quote là ca dùng kinh điển nhất của Salesforce: giảm quá X%
thì tờ báo giá không gửi được cho tới khi có người gật. **E3 đã dựng xong và đang
ngồi không.** §11.3 đã chạm đúng ranh giới này rồi nhưng giải bằng phân quyền
tĩnh (presales `sửa` được, `gửi` thì không) thay vì bằng một lượt duyệt — mà phân
quyền tĩnh không phân biệt được "giảm 5%" với "giảm 40%". Ô `CK%` đã có trong
modal soạn báo giá (§7) mà không ai gác nó.

**2 · Kỳ hạn hợp đồng — `ContractRow` hôm nay chỉ biết ngày ký.**
Đủ trường hiện có: `code · opportunityCode · leadCode · amount · currency ·
signedAt · owner`. Không ngày hiệu lực, không ngày hết hạn, không kỳ hạn.
Salesforce Contract có `StartDate`·`EndDate`·`ContractTerm`·`OwnerExpirationNotice`.
Với MES bán kèm bảo trì hàng năm thì "hợp đồng nào sắp hết hạn" là câu có thật, và
hôm nay không cột nào trả lời được: sổ hợp đồng ở lượt 4 in được "tháng này ký bao
nhiêu" nhưng không in được "tháng sau hết hạn cái nào".

**3 · Ký điện tử.** Đường vòng in → PDF → Drive link đã chốt có ý thức ở §7 vì nợ
#12 chờ AWS. Không phải thiếu sót, nhưng đây là chỗ khoảng cách với thị trường rõ
nhất và là chỗ đầu tiên đáng đóng khi hạ tầng tệp về.

**4 · Hoá đơn và công nợ.** Ranh giới sang Finance là hợp lý. Chỉ cần đừng để ai
hiểu nhầm lượt 5: **"Đợt thanh toán" là mốc theo hợp đồng, KHÔNG phải hoá đơn.**

**5 · Tài sản đã lắp.** Với MES cài tại nhà máy khách thì "hệ thống nào đang chạy
ở đâu, phiên bản nào, hết bảo hành khi nào" là dữ liệu có thật và là cửa vào của
mảng dịch vụ sau bán. `ObjectKind` chưa đặt chỗ cho nó — ngày mở phải mở ở
`packages/engines/src/types.ts` trước.

**6 · Ticket sau bán.** Đứng cuối chuỗi, chưa ai vẽ. Module riêng, không phải việc
của module 4.

### Một khối cố ý bỏ và vẫn đúng sau khi đối chiếu

**Danh mục sản phẩm + bảng giá.** Mọi CRM đều bắt có Product/Price Book trước khi
quote được. §9 từ chối với lý do bán giải pháp theo dự án, không SKU — với
"Factory MES + One Plus" thì đó là lý do đứng vững, không phải né việc.

### Hai thay đổi đề xuất — và lộ trình §8 đã chạy trước chúng

**Đọc mục này cùng nhánh `feat/module-4`, đừng đọc cùng `develop`.** Câu "chưa
dòng code nào" ở đầu file chỉ còn đúng với `develop`: worktree
`../pv-crm-m4` đã đi hết lượt 0 · 1 · 2 · 4 · 5 — bảng `quote`/`quote_line`, bảy
cửa báo giá, sổ báo giá, modal soạn, sổ hợp đồng chỉ đọc, bảng `contract_term`.
Nên hai đề xuất dưới đây không còn chèn vào chỗ trống được.

- **Duyệt chiết khấu.** Vẫn chưa có trên nhánh đó: `quote.service.ts:342` mới chỉ
  có một dòng comment nói việc này "phải là một lượt duyệt", không có E3 nào được
  gọi. Đề xuất cũ là gộp vào lượt 3 cùng cửa `send`; lượt 3 chưa chạy nên chỗ đặt
  vẫn còn nguyên, và đây là lý do để làm lượt 3 trước khi gộp nhánh về `develop`.
- **Kỳ hạn hợp đồng.** Đề xuất cũ là bồi cột ở lượt 0 — **lỡ rồi**, lượt 0 đã ra
  ở `2f085e5`. Bảng `contract` trên nhánh đó vẫn đúng bảy cột cũ cộng `quoteCode`,
  không ngày hiệu lực, không ngày hết hạn, không kỳ hạn. Cái đã có là
  `contract_term` (đợt thanh toán, lượt 5) — trả lời "thu tiền đợt nào", KHÔNG
  trả lời "hợp đồng hết hạn khi nào". Giờ nó là một migration riêng, và càng để
  lâu càng đắt vì sổ hợp đồng đã có màn đọc bảng.

Bốn khối còn lại để nguyên ngoài module 4.
