# Tầm nhìn — mười một pipeline của cả hệ

`tam-nhin-pipeline.md` trả lời "một việc đang ở đâu, chờ ai" cho **nhánh Sales**.
Bản này không đè lên nó — nó trả lời câu rộng hơn: **cả hệ nên có bao nhiêu
pipeline, và cái gì KHÔNG nên là pipeline.** Trục vị trí của bản kia là xương
sống; bản này là danh sách xương.

Đọc cùng `tam-nhin-pipeline.md` (trục vị trí, 8 phase P0–P7) và
`tam-nhin-bao-gia-hop-dong.md` §12 (đối chiếu sáu CRM lớn).

**Bảy lượt của §9 đã chạy hết 14/09** — cái gì nằm ở đâu, quyết định nào không
được lật, và ba cái bẫy đã dính: `ban-giao-tang-duyet-va-vi-tri.md`.

---

## §1 · Ba thứ khác nhau đang bị gọi chung một tên

| Loại         | Định nghĩa                                                                 | Ví dụ đang có                  |
| ------------ | -------------------------------------------------------------------------- | ------------------------------ |
| **Pipeline** | Object đi qua các chặng CÓ THỨ TỰ, mỗi chặng có hạn, và nó RỜI ĐI có lý do | cơ hội 3 cột · `MailRunState`  |
| **Hàng chờ** | Việc xếp theo NGƯỜI, không có chặng — vào rồi ra                           | `E3.pending(actor)` · `outbox` |
| **Sổ cái**   | Sự kiện chỉ ghi thêm, không có trạng thái để "đi tới"                      | `touch` · `mail_event`         |

Không phân biệt ba cái này thì "đưa mọi workstream vào quy củ" đẻ ra mười lăm
bảng kanban không ai kéo.

Điểm đáng lấy từ thị trường: màn hằng ngày của Margince **không phải** pipeline —
là `Morning brief · CRM updates · Approval inbox`. Người dùng không vào pipeline,
họ vào **hàng chờ**. Pipeline là thứ để đo và để báo cáo.

---

## §2 · Bốn luật làm nên "quy củ" — áp GIỐNG NHAU cho mọi pipeline

Không có bốn cái này thì thêm bao nhiêu pipeline cũng vô nghĩa.

1. **Mọi object phải đặt được lên đúng một pipeline.** `pipeline_position`
   (`tam-nhin-pipeline.md` §6) là hàm thuần, tính lúc đọc. Object nào hàm này
   không trả về vị trí thì object đó không tồn tại trong hệ. Đây là forcing
   function duy nhất.
2. **Mọi chặng phải có `limitDays`**, sống trong `config_entry`, không phải
   fixture. Chặng không có đồng hồ là chặng người ta đỗ xe.
3. **Mọi bước không quay lại được phải đi qua E3**, không qua một `PATCH` thẳng.
4. **Không rời pipeline nếu không có lý do**, và mỗi pipeline **khai rõ danh
   sách lý do của mình là ĐÓNG hay MỞ** — không pipeline nào dùng chung danh
   sách với pipeline khác. Hệ đang có đúng hai, cố ý khác loại: `EXIT_REASONS`
   6 giá trị **đóng** (lead chết trước khi thành cơ hội) và `LOSS_REASONS`
   7 giá trị **mở** (đơn đã báo giá thua). Hôm nay luật này **đang hỏng** — nhãn
   lý do rơi vẫn đọc fixture (`fix-later.md` §6).

---

## §3 · Mười một pipeline, chia theo đúng năm nhánh đã khai

`Branch = One | Sales | Supply | Factory | Finance`. Fixture `sao-do` đã vẽ đủ
chuỗi `LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PR-0231 → PO-0455 → L-2608-042`
cộng `CNC-03 → BT-0310`. **Danh sách dưới đây không mở chuỗi mới — nó đặt tên cho
thứ fixture đã tự khai.**

| #   | Nhánh   | Pipeline                | Object         | Tình trạng                                                               |
| --- | ------- | ----------------------- | -------------- | ------------------------------------------------------------------------ |
| 1   | Sales   | Chiến dịch & đợt gửi    | `CP` `MailRun` | sống · `DONE` chưa có cửa (`fix-later` nợ 7)                             |
| 2   | Sales   | Lead                    | `LD`           | sống · **thiếu cửa lên bậc** `dau-moi→mql→sql`                           |
| 3   | Sales   | Cơ hội                  | `OP`           | sống · đang rút 5 → 3 cột                                                |
| 4   | Sales   | Báo giá                 | `BG`           | nhánh `feat/module-4` · thiếu duyệt chiết khấu                           |
| 5   | Sales   | Hợp đồng                | `HĐ`           | sống · **thiếu kỳ hạn** — không trả lời được "tháng sau hết hạn cái nào" |
| 6   | Supply  | **Mua hàng**            | `PR → PO → L`  | chỉ trong seed                                                           |
| 7   | Factory | **Sản xuất & bàn giao** | `SO → WO`      | chỉ trong seed — chính là P7 "ngoài biên" của bản kia                    |
| 8   | Factory | **Thiết bị & bảo trì**  | `CNC → BT`     | chỉ trong seed · máy của TA, không phải tài sản đã lắp bên khách         |
| 9   | Finance | **Thu theo đợt**        | payment term   | màn đã có, **chưa có đường ghi** — xem §4                                |
| 10  | One     | **Hộp duyệt**           | `approval`     | chưa dựng · pipeline của NGƯỜI, không của object                         |
| 11  | One     | **Dữ liệu vào sổ**      | `lead_intake`  | `IntakeTrust` đã có · thiếu trùng lặp, thiếu ô, sổ chặn                  |

**5 sống · 4 chỉ trong seed · 2 cắt ngang chưa dựng.** Hai cái cắt ngang là thứ
làm cho chín cái kia có kỷ luật.

### Bốn thứ cố ý KHÔNG đếm vào

- **Gia hạn / tái ký** — không phải pipeline thứ 12. `ban-giao-db.md` đã chốt
  lead→cơ hội là **1-n** vì "một công ty mua nhiều lần", và fixture đã có
  `BG-0512 "Báo giá gia hạn"`. Hợp đồng sắp hết hạn **đẻ lead**, không đẻ kanban.
- **Trạng thái mail** (`MailState`, 10 giá trị) — sổ cái. Chỉ xử lý bounce /
  complaint mới là pipeline, và nó thuộc #11.
- **Dòng thời gian chạm** (`TouchKind`, 10 giá trị) — sổ cái.
- **Hàng chờ E4** (`outbox`) — hàng chờ.

---

## §4 · Ba chỗ bản này SỬA lại hiểu biết cũ

**1 · `CNC`/`BT` không phải "sau bán".** `CNC-03` mang `branch: 'Factory'`, và
trong `sao-do` thì Factory là nhà máy của CHÍNH MÌNH (tenant là Thắng Lợi
Engineering, Sao Đỏ mới là khách). Nên pipeline #8 là **bảo trì máy nội bộ**.
`tam-nhin-bao-gia-hop-dong.md` §12 nói đúng: **tài sản đã lắp bên khách vẫn chưa
có `ObjectKind`**, và mảng dịch vụ sau bán vẫn là ô trống hoàn toàn — không
object, không màn, không rule E4.

**2 · Pipeline thu tiền đã được thiết kế xong, chỉ chưa có đường ghi.** Ba route
đã sống trên `master`: `/sales/contracts`, `/:code`, và `/:code/dot/:no`. Fixture
`sao-do-contracts.ts` mô hình hoá rất sâu — mỗi đợt mang `conditions[]` có
`side: 'ta' | 'khách'` (luôn trả lời được đang tắc bên nào), `docs[]`,
`records[]` nhật ký đòi tiền, `notes[]`, cộng `DueLevel` 6 bậc. Thiếu đúng hai
thứ: cửa ghi (`contract` mới chỉ ĐỌC) và đúng nhánh. Đây là **pipeline rẻ nhất
để hoàn tất**, không phải đắt nhất.

**3 · `Branch = 'Finance'` đã khai nhưng không sở hữu `ObjectKind` nào.** Trong
khi cụm đợt thanh toán đang nằm dưới Sales. Đứng giữa là chỗ sinh nợ — xem §8.

---

## §5 · Tám đường đi hợp lệ qua pipeline Sales

`LEAD_MOTIONS` trong `engines/lead-intake.ts` là danh sách **đã đóng**, kèm lý do
viết thẳng trong code: một ô "khác" sau một quý sẽ thành thế lớn nhất bảng, và
lúc đó câu "kênh nào ra khách" hết trả lời được. **Sáu luồng của CRM là sáu cái
đó, không phải sáu cái ai đó nghĩ ra.**

| Luồng        | Vào bằng          | Mức tin           | Luật riêng                                                     |
| ------------ | ----------------- | ----------------- | -------------------------------------------------------------- |
| **inbound**  | `api·dong-bo·tay` | xác minh/khai báo | khách đang giơ tay → **SLA tính bằng phút**, chỉ trong giờ làm |
| **outbound** | `dong-bo·tay·tep` | khai báo/thô      | phải có cớ mở lời; `suppression` gác trước khi bắn             |
| **event**    | `quet·tep`        | xác minh/thô      | cùng một buổi mà `quet` với `tep` là hai mức tin khác nhau     |
| **referral** | **chỉ `tay`**     | khai báo          | **không được đẩy vào chiến dịch mail lạnh**                    |
| **partner**  | `tay·tep·api`     | cả ba             | công trạng chia khác — `CREDIT_RULES` phải biết luồng này      |
| **recycle**  | `tay·tep`         | khai báo/thô      | chỉ hồi sinh được nếu lý do rời cho phép — xem dưới            |

`MOTION_BY_INTAKE` đã chốt **14 cặp hợp lệ trên 30**. Cặp vắng mặt không phải
"chưa hỗ trợ" — nó là cặp KHÔNG XẢY RA.

**Luật `recycle` chưa có, phải thêm.** Trong 6 `EXIT_REASONS`, ba là _hết hẳn_
(không phải khách của mình · chọn bên khác · không gọi được ai) và ba là _chưa
tới lúc_ (năm nay không có tiền · người liên hệ nghỉ · im sau báo giá). Trong 52
lead đã rời, chỉ **17** là kho `recycle` hợp lệ. Không có luật này thì `recycle`
thành cái thùng để dọn sổ.

### Hai luồng quay lại — không qua lead, vào thẳng P4

| Luồng       | Bắt đầu    | Bỏ qua |
| ----------- | ---------- | ------ |
| **mở rộng** | P4 cơ hội  | P0–P3  |
| **gia hạn** | P5 báo giá | P0–P4  |

Cả hai **không đẻ lead mới**. Ép chúng qua sổ lead là làm hỏng mọi tỉ lệ chuyển
đổi — mẫu số phồng lên bằng khách đã mua rồi.

**Tổng: 8 đường hợp lệ. Mọi đường khác là lỗi dữ liệu, không phải ca lạ.**

### Vấn đề: luồng đang là NHÃN, chưa là hành vi

`LeadMotion` được ghi ở cửa vào (`import-zone.tsx` · `intake-desk.ts` ·
`lead-import-wire.ts`) rồi **không gì phía sau đọc nó nữa**:

- `HANDOFF_SLA` phẳng — đúng 2 chặng, mỗi chặng `targetDays: 3`, giống hệt nhau
  cho cả sáu luồng. Comment ngay tại chỗ tự khai thứ đã mất: _"Tài liệu đặt mục
  tiêu bằng PHÚT và GIỜ (≤ 30 phút cho lead mới, ≤ 24 giờ cho SQL). Sổ lead của
  kịch bản chỉ ghi tới ngày, nên mục tiêu quy về ngày."_ **SLA 30 phút của
  inbound đã bị fixture làm phẳng thành 3 ngày.**
- Không có luật giao việc theo luồng.
- `IntakeTrust` không chặn gì — `tho` và `xac-minh` chỉ khác nhau ở nhãn.

**Bốn thứ mỗi luồng phải khai** thì nó mới là luồng: chạm đầu trong bao lâu ·
ai nhận · được làm gì ngay và phải chờ gì · cổng lên `mql`
(`INIT_DATA_QUESTIONS` đã chốt "đủ 6 ô bắt buộc", nhưng chưa ai trả lời inbound
tự điền form thì đã qua cổng chưa).

---

## §6 · Màn — hai màn và một component, không phải một màn

|       | Cái gì           | Đặt ở đâu                                 |
| ----- | ---------------- | ----------------------------------------- |
| **A** | Thiết lập luồng  | tab mới trong `/sales/config`             |
| **B** | Vector luồng     | component, nhúng vào hồ sơ lead + cơ hội  |
| **C** | "Việc ở tay tôi" | tầng dưới Trang chủ — **đã có**, bồi thêm |

Tách vì A là **luật** (sửa hiếm, cả phòng chịu, phải qua E3), B là **sự thật về
một object**, C là **hàng chờ của một người**. Gộp lại thì màn thiết lập thành
dashboard và không ai dám sửa gì trên đó nữa.

### B · Vector luồng

```
  Châu ─────► Nam ─────► ●Huy ─────► Diệu Anh ┈┈┈┈► Hà
  marketing   BD          SALE         presales      duyệt
  12/08       15/08       từ 18/08     chưa tới      chưa tới
  đúng hạn    trễ 1 ngày  còn 2 ngày   hạn 3 ngày    —
  ──────── đã xảy ra ────────┤├──────── theo luật ─────────
```

**Luật xương sống: bên trái là SỰ THẬT, bên phải là LUẬT — không được vẽ giống
nhau.** Nửa trái đọc `sales.touch` (có `at` thật, `by` thật, `touchId` bấm được).
Nửa phải đọc định nghĩa luồng ở màn A: chỉ có **vai** và **hạn**, chưa có người
và chưa có ngày.

Cưỡng chế ở tầng kiểu, không nhờ người viết màn nhớ — cùng cách `AiActionProps.basis`
gác luật 9:

```ts
type VectorStep =
  | { kind: 'done'; at: Moment; by: string; actorId: string | null; touchId: string }
  | { kind: 'upcoming'; role: RoleId; dueInDays: number }
```

Union phân biệt → **không compile được** một bước tương lai có ngày giờ, và không
có chỗ nào để bịa tên người sẽ nhận.

**Đây KHÔNG phải ContextRail.** Luật 10 chốt `E1.story()` là đầu vào hợp lệ duy
nhất của ContextRail, và ContextRail vẽ **chuỗi object** (`HĐ → SO → WO`). Vector
vẽ **chuỗi người trên một object**. Hai thanh, hai câu hỏi. Nhét cái này vào
ContextRail là phá luật 10.

**Ba thiết bị:** desktop/tablet nằm ngang; mobile **xoay dọc**, mốc hiện tại neo
trên cùng. Tablet là hiện trường nên mỗi mắt ≥48px — ở 1024px chỉ đủ 3 mắt, phải
gập phần đã qua thành một mắt "3 bước trước". Chưa lên `/kit` thì coi như chưa
tồn tại.

### A · Thiết lập luồng — và màn `/sales/config` hôm nay đang ở đâu

Màn đã có: "Cấu hình phòng kinh doanh", 8 danh sách từ vựng. Phần chạm pipeline
là **mục 5.2 "Cột của sổ cơ hội và hạn từng cột"** — sửa được `limitDays` từng
cột, cạnh mỗi cột in "đang có bao nhiêu đơn".

Trong bốn thứ một màn config pipeline cần, **đã có hai** (cập nhật 14/09):

| Cần                                | Có chưa                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| chặng + hạn                        | ✅ mục 5.2 — đọc `config_entry` và SỬA được qua E3 (14/09)   |
| vai giữ mỗi chặng                  | ❌ — mục 5.9 khai vai theo LUỒNG, chưa theo chặng            |
| điều kiện chuyển                   | ❌                                                           |
| định nghĩa 8 luồng, SLA theo luồng | 🟡 **khung xong, số chưa có** — mục 5.9, mọi ô đang trống    |
| hạn từng BẬC lead                  | 🟡 **ô đã có** — mục 5.5, `TIER` là thang từ `0038`; số chưa |

**Ba tầng "chưa" nay còn một, và nó không phải tầng kỹ thuật:**

1. ~~Màn không gọi cửa nào~~ — **mục 5.9 gọi thật**: mỗi luồng tự đề nghị và
   nhận về một biên lai của Hộp duyệt. Tám mục còn lại vẫn gom vào mảng
   `changes` rồi xoá, tức vẫn đang DIỄN; nay chúng nối được, và đó là việc kế
   tiếp.
2. ~~Cửa server có nhưng từ chối~~ — `SalesConfigGateE3` thay bản từ chối, cộng
   hai cửa mới `GET/PATCH /sales/config/motions`.
3. ~~Gate từ chối vì chưa có bảng~~ — `platform.approval` có từ `0035`.
4. **Chưa ai chốt số.** §8.5 vẫn treo, và giờ nó là thứ duy nhất chặn: màn đã có
   đủ ô để nhập — sáu luồng × bốn ô ở mục 5.9, ba bậc lead ở mục 5.5 — và tất
   cả đang `NULL`.

~~Cộng thêm: `data/sales-config.ts` còn `load: fetchSalesConfig` cho tám mục
cũ~~ — **trả 14/09.** Hai khối rời khỏi fixture: mục 5.2 đọc
`ladderRows(catalog, 'STAGE')`, mục 5.5 đọc `'TIER'`, tức đúng những dòng mà nút
gửi của chúng sửa. `load:` còn lại đúng phần `config_entry` chưa chở được — bộ
mười câu, tỉ lệ hoa hồng, bảng kênh gửi. Nút gửi cũng hết ghi "Gửi TP Kinh doanh
duyệt": chuỗi duyệt là **Giám đốc**, và màn in tên VAI chứ không tên người.

Điểm đáng giữ của bản đang có: nó **được dựng sẵn theo hình propose-rồi-duyệt**,
không phải sửa-là-lưu. Docblock ghi _"người gật cần thấy hậu quả trước khi gật"_ —
màn tính sẵn cổng MQL sẽ thành bao nhiêu nếu yêu cầu được gật. Khi E3 có bảng,
đây là màn nối vào rẻ nhất, không phải viết lại.

**Ba điều kiện cứng của màn A:** (a) không có `config.edit` — mọi thay đổi luồng
là yêu cầu E3 loại `cấu-hình`, đúng loại số 1 trong thứ tự đã chốt; (b) hạn viết
bằng đơn vị thật, đây là chỗ trả lại mục tiêu 30 phút của inbound; (c) đổi luồng
**không** tô lại quá khứ — cùng lý do `touch.by` chép tên lúc ghi thay vì join
`actor`.

---

## §7 · Ba tầng chặn — và tầng 0 chưa ai nhắc

```
tầng 0   E1 ghi cạnh LÚC CHẠY       — không có thì không có chuỗi xuyên nhánh
tầng 1   E3 + platform.approval     — không có thì không có "đang chờ ai"
tầng 2   mười một pipeline          — mỗi cái đứng trên hai tầng trên
```

**Tầng 0 là thứ chưa bản nào ghi ra.** Đến hôm nay **chỉ `seed.ts` ghi
`platform.edge`**; `ObjectMirror` chỉ viết bảng `object`, `GraphService` chưa nối
controller nào. Nghĩa là chuỗi `LD-0334 → HĐ-2607 → SO-0891 → …` **chỉ sống
trong seed** — không cửa nào sinh cạnh lúc chạy thật. Module 4 để lại đúng hai
thứ cho Supply nhặt (một cạnh `platform.edge` và một sự kiện
`sales.contract.signed`) và **cả hai đều chưa có ai ghi**.

Làm Supply/Factory trước khi đóng tầng 0 là dựng nhà không móng.

~~Kèm theo, một lỗ quyền sẽ mở đúng lúc đó~~ — **vá 14/09**. `KIND_DOMAIN` vẫn
cố ý vắng tám kind (`BG · SO · WO · PR · PO · L · BT · CNC`; bản đầu đếm 7, quên
`PR`), vì gán miền cho chúng là phát minh luật quyền cho nhánh chưa ai dựng —
ma trận cũng không có `purchase.*` nào để gán. Nhưng sự vắng mặt đó **hết nghĩa
là "muốn làm gì thì làm"**: `check()` nay từ chối lượt GHI trên kiểu chưa khai
miền và giữ lượt ĐỌC (trục license đã trả lời câu đọc, và rail của luật 10 cần
nó). `export`/`approve` cũng hết lọt: chúng không phụ thuộc object nên được tra
trước bảng miền. Lập luận đầy đủ nằm tại chỗ từ chối ở `e2-access.ts`.

Vì thế ngày mở màn Supply đầu tiên, việc khai `KIND_DOMAIN` + khai quyền là
**điều kiện để cửa ghi chạy được**, không còn là một việc dễ quên.

### Cảnh báo về `pipeline_position`

`tam-nhin-pipeline.md` §6 khai `phase` lấy từ thang `P0…P7` của riêng Sales. Nếu
Supply · Factory · Finance vào sau, hàm đó hoặc phải viết lại, hoặc vĩnh viễn chỉ
phục vụ Sales — và khi đó Trang chủ vẫn phải tự suy vị trí cho 6 object kind còn
lại, đúng thứ §6 sinh ra để cấm.

Đề nghị: `{ branch, phase, state, holder, waitingOn, overdueBy }` **ngay từ lượt
4**, và `phase` là khoá của **pipeline**, không phải hằng số của Sales. Thêm một ô
bây giờ rẻ hơn nhiều so với sửa sau khi bốn màn đều đã đọc nó.

**Đã làm xong 14/09**, đúng sáu ô ấy: `pipelinePosition()` ở `@pv/engines` (thuần,
đồng bộ, không con số ngày nào trong code — thang chặng đi vào bằng tham số).
Hồ sơ đơn là màn đầu tiên đọc nó; từ lượt 8 thì **dòng sổ cơ hội** và **hồ sơ
lead** cũng đọc, và hai thang khác nhau cùng đi qua một hàm — `STAGE` cho đơn,
`TIER` cho lead — vì `phase` mang khoá pipeline chứ không phải hằng số của Sales.
Chỗ ghép dòng cấu hình với khoá nằm đúng một nơi cho cả nhánh
(`branches/sales/ladder.ts`), có rào đếm như cũ. `since` nhận `null` được: một dòng có chặng mà
không có mốc vào chặng thì vị trí vẫn biết, còn đồng hồ thì không — trả `null`
chứ không lấy `created_at` thay, vì đó là §8.1 của bản kia và nó còn treo.

~~Kèm theo: `CHECK config_limit_only_stage` buộc "chỉ `STAGE` mới có
`limitDays`".~~ **Xong 14/09**: ràng buộc nay tên là `config_limit_only_ladder`
và nói về một TẬP — `LADDER_LISTS` ở `@pv/contracts`, hôm nay đúng một thành
viên. Cùng những dòng ấy vẫn qua, cùng những dòng ấy vẫn hỏng; cái đổi là luật
thôi mang tên Sales, nên thang chặng của Supply chỉ tốn một dòng chứ không tốn
một lượt viết lại.

---

## §8 · Tám câu còn treo

1. **Finance có thật trong phạm vi không?** `tam-nhin-bao-gia-hop-dong.md` §12
   xếp "hoá đơn · công nợ" là _ngoài phạm vi_, nhưng `Branch` đã khai `Finance`
   và cụm đợt thanh toán đã có ba màn. Hoặc rút `Finance` khỏi `Branch`, hoặc
   nhận pipeline #9 về đúng nhánh.
2. **"Sau bán" có `ObjectKind` mới không?** Tài sản đã lắp bên khách + yêu cầu
   dịch vụ. `BT` đã có chủ (máy của ta), không mượn được.
3. **Supply và Factory làm thật hay chỉ để E1 vẽ chuỗi?** Câu này gắt hơn vẻ
   ngoài — vì tầng 0 chưa đóng nên hôm nay câu trả lời **trên thực tế** đang là
   "chỉ để vẽ", dù ContextRail in ra như thể chúng sống.
4. ~~**`giao` ghi một dòng hay hai?**~~ **Đã chốt 14/09 — MỘT dòng**, mang cả
   hai đầu trong bốn cột mới của `sales.touch`
   (`from_actor_id`/`from_name` · `to_actor_id`/`to_name`, migration `0033`).
   Hai dòng đếm một việc thành hai ở mọi phép đếm lần chạm, cùng mang một `at`
   (Postgres đóng băng `now()` theo transaction) nên không đọc ra thứ tự giữa
   chúng, và "luôn hai dòng" gãy ngay ở hai nước đi thường nhất: nhận từ kho
   chung không có người cũ, trả về kho chung không có người mới. `by` không
   phải đầu nào cả — trưởng phòng chuyển tay giữa hai Sale là người thứ ba.
   Lý do đầy đủ nằm cạnh cột, ở `touch.schema.ts`.
5. **SLA chạm đầu của từng luồng, hạn từng bậc lead, và luật giao việc.** Chưa
   có con số, và không được bịa. Từ 14/09 nó **hết chặn việc dựng** và chỉ còn
   chặn chính nó — mục 5.5 cũng đã có ô cho ba bậc (`dau-moi` · `mql` · `sql`),
   và hồ sơ lead in vị trí mà không in đồng hồ đúng vì ba ô ấy trống. Mục
   5.9 của `/sales/config` đã có đủ ô cho sáu luồng — chạm đầu (phút · giờ ·
   ngày), người nhận, được vào chiến dịch mail lạnh không, form khách tự điền có
   tính là đủ ô — và tất cả đang `NULL`. Điền vào là xong, và mỗi ô đi qua Hộp
   duyệt như mọi thay đổi cấu hình khác.
6. **`BG` là pipeline riêng hay một chặng của cơ hội?** §3 xếp nó là pipeline #4;
   `tam-nhin-pipeline.md` §6 lại đặt báo giá ở P5 của chuỗi Sales. Hai bản mâu
   thuẫn nhau, và `pipelinePosition` hiện theo §3.
7. **Ai khai thang chặng cho `HĐ`?** §3 #5 nói pipeline hợp đồng còn thiếu kỳ
   hạn, nên hôm nay `phases` của nó rỗng và hàm trả `null` — tức theo luật 1 của
   §2, hợp đồng "không tồn tại trong hệ". Hoặc khai thang, hoặc sửa luật 1.
8. **`SO`/`WO` chung một thang hay mỗi kind một thang?** Hiện đang chung
   (`production`), `PR`/`PO`/`L` cũng chung (`purchasing`). Nếu mỗi kind một
   thang thì bảng tra phải khoá theo kind, không theo pipeline.

---

## §9 · Thứ tự đề nghị

`tam-nhin-pipeline.md` §9 đặt "rút 3 cột" ở lượt 1 và E3 ở lượt 2–3. Bản này đề
nghị **đảo**, và chen tầng 0 lên trước:

| Lượt | Việc                                                                                  | Vì sao                                                                                             |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0    | ~~Ghi `giao` + `cham` vào `sales.touch`~~ — **xong 14/09**                            | cửa ghi đã có sẵn từ 29/08; phần còn thiếu là hai đầu của lần giao, nay là cột. Nửa trái vector mở |
| 1    | ~~Component Vector nửa trái~~ — **xong 14/09**                                        | `FlowVector` (M-16) · `/kit` · nhúng hồ sơ lead. Chưa in vai, chưa bấm được — xem dưới             |
| 2    | ~~`platform.approval` + `approval_link`~~ — **xong 14/09**                            | migration `0035`, hai bảng ở `platform`, luật E3 tách thành hàm thuần dùng chung hai đầu           |
| 3    | ~~Nối `config.approval.ts`, Hộp duyệt~~ — **xong 14/09**                              | cửa `/approvals`, màn `/duyet`, mục nav "Phê duyệt" hết trống đường                                |
| 4    | ~~E1 ghi cạnh lúc chạy~~ — **xong 14/09**                                             | `ObjectMirror.link/linkMany` + 6 cửa ghi cạnh trong đúng transaction đang có                       |
| 5    | ~~Màn A định nghĩa luồng (qua E3)~~ — **xong 14/09**                                  | mục 5.9 + bảng `motion_policy` (`0036`); sáu luồng × bốn ô, **mọi ô trống chờ §8.5**               |
| 6    | ~~`pipeline_position` có `branch`; `limitDays` sang `config_entry`~~ — **xong 14/09** | hàm thuần + hồ sơ đơn đọc nó thật; `limitDays` hết đóng đinh vào `STAGE` (`0037`)                  |

**Bảy lượt đã xong cả bảy** (14/09). Bốn lượt tiếp theo không mở tính năng mới —
cả bốn đều là **dọn chỗ hệ đang nói hai câu khác nhau về một sự thật**, xếp theo
thứ tự chỗ nào nói dối to nhất trước. **Cả bốn cũng đã chạy, 14/09**, và ba câu
hỏi chặn chúng đã có người trả lời:

| Lượt | Việc                                                  | Đã chốt gì                                                               |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| 7    | ~~Nối `/sales/config` vào E3~~ — **xong**             | một lần gửi, **N yêu cầu** — mỗi thay đổi một dòng, gật/từ chối từng cái |
| 8    | ~~`pipelinePosition` thay chỗ tự suy vị trí~~ — _gần_ | sổ đơn + hồ sơ lead xong; **trang chủ để lại**, lý do ở dưới             |
| 9    | ~~Vector đủ ba thứ~~ — **xong**                       | `to_role` (`0039`) · `ActivityCard` khoá bằng `touchId` · hồ sơ cơ hội   |
| 10   | ~~Cạnh sắc `seed-accounts.ts`~~ — **xong**            | đòi `--password=` ngoài pglite, VÀ thôi xoá `disabledAt`                 |

**Một quyết định thứ tư, nảy ra giữa chừng và đã chốt:** `TIER` vào
`LADDER_LISTS` thì `config_limit_only_ladder` — vốn là một đẳng thức — sẽ **bắt
buộc** mọi bậc lead phải có hạn, mà §8.5 nói chưa ai chốt số. Ràng buộc nay chạy
MỘT CHIỀU (`0038`): đồng hồ chỉ có trên thang, nhưng thang không bắt buộc có đồng
hồ. Lead có vị trí ngay hôm nay; đồng hồ bật lên đúng ngày có người cho số, và
không con số nào bị bịa ra làm giá vé. Cùng hình với `motion_policy`.

### Ba thứ đổi hình mà đáng nhớ

1. **`/sales/config` hết diễn.** Mục 5.2 (hạn cột) và 5.5 (hạn bậc lead) đọc
   `config_entry` và gửi `PATCH /sales/config/:list/:id` thật; 5.4c có ô thêm
   sản phẩm (`POST`). Màn **không vẽ lại dòng** sau khi gửi — thay đổi xảy ra
   lúc Giám đốc gật, ở màn khác. Nút gửi thôi ghi "TP Kinh doanh".
2. **Dòng sổ cơ hội chở `position`.** Hai lượt đọc cho CẢ TRANG (thang chặng +
   một câu `IN (…)` lấy yêu cầu duyệt treo), nên `isRottingOp` và bốn bản chép
   `STAGE_LIMIT` hết đọc fixture. Hai màn lead đọc hạn thật qua `useStageLimits`.
3. **Hồ sơ lead có vị trí trên thang bậc**, và in được "đang chờ ai". Đồng hồ
   `null` vì §8.5 — đúng câu trả lời, không phải chỗ thiếu.

### Cố ý để lại, nói ra chứ không giấu

- **Trang chủ vẫn tự dựng cạnh.** `deskStory` dựng chuỗi từ chính dòng hợp đồng
  rồi gọi `E1.story()` — chuỗi ĐÚNG, chỉ là dựng bằng tay thay vì đọc
  `platform.edge`. Đọc từ máy chủ cần một cửa `platform` mới, mà cửa nào cũng
  phải khai `@Need`, và **không quyền nào trong ma trận hợp với một rail xuyên
  nhánh**. Phát minh `graph.view` là phát minh luật quyền cho nhánh chưa ai
  dựng — đúng thứ §7 vừa cảnh báo. Để lại tới ngày có nhánh thật đòi nó.
- **Mục 5.1 đọc được, chưa sửa được.** Bộ mười câu cần một danh mục thứ chín và
  một cột `required`; mười khoá ấy đang là KIỂU của phiếu lead. Nút lật "bắt
  buộc" đã gỡ: nó vẽ một cổng MQL mới mà không cửa nào ghi được.
- **Xoá hẳn một hạn đã đặt thì chưa có đường.** `ConfigEntryPatch.limitDays`
  không nhận `null` — hạ được, nâng được, gỡ thì không. Bảng cho phép từ `0038`;
  hợp đồng chưa.
- **Bước `vao-so` do trình nạp tệp ghi không có vai.** Đường nạp giải tên chủ
  qua `ActorLite` (`{ id, name }`), nên thêm vai là nới một kiểu đi khắp module
  kiểm để lấy một cái nhãn trên một mắt. Vắng đọc ra là "không ghi lại", đúng sự
  thật về những dòng đó.

**Ba chỗ lượt 0–4 để lại — hai đã trả, 14/09:**

- ~~Vector chưa in **vai**~~ — `to_role` là cột thật (`0039`), chụp lúc ghi.
  `setOwner` và cửa tạo lead điền nó; join `actor` lúc đọc vẫn cấm như cũ.
- ~~Mắt vector chưa **bấm được**~~ — `ActivityCard` khoá dòng bằng `touchId`,
  và `onOpen` cuộn dòng thời gian tới đúng mốc ấy. Hai hồ sơ đều có.
- Hộp duyệt **vẫn chưa** dùng `ApprovalCard` (O-04) vì tổ chức đó đòi `amount`
  và in số tiền lên nút chính — đúng cho chiết khấu và đơn mua, sai cho một
  thay đổi từ vựng vốn không có số nào.

**Sửa lại một chỗ bản này đọc sai code (14/09).** `giao` và `cham` KHÔNG thiếu
cửa ghi: `setOwner` ghi `giao` từ `cf97f78` (29/08) và sổ cuộc họp ghi
`gap-lan-dau`/`cham` từ `d80c034` (cùng ngày). Ghi chú _"No door writes this
yet"_ trong `TouchKind` là ghi chú cũ chưa ai dọn — nay đã dọn. Thứ thật sự
thiếu là thứ §8.4 hỏi: một lần giao chỉ nói được hai đầu bằng câu tiếng Việt
trong `note`, nên nửa trái vector muốn dựng chuỗi người phải đi bóc câu văn.
Lượt 0 vì thế là **bốn cột + một CHECK**, không phải một cửa ghi mới.

Hai loại vẫn chưa có cửa, và đó là sự thật hôm nay: `len-bac` và
`ra-khoi-luong` — không cửa nào đổi bậc hay cho lead rời phễu, vì cả hai hợp
đồng cố ý giữ lại hai cột đó ("gates, not fields").

`vao-so` cũng chở `to_*` khi lead vào sổ đã có người giữ — cùng chỗ `to_tier`
đã chở bậc cho lead vào sổ đã có bậc, để bước đầu tiên của vector là một mốc
**được ghi** chứ không phải suy từ `lead.owner_id`, thứ chỉ biết ai giữ HÔM NAY
và không có ngày để đứng.
