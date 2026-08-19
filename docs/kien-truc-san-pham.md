# Cấu trúc sản phẩm PV One (CHỐT)

Cứu ra từ `project/CLAUDE.md` trước khi thư mục `project/` bị xoá 18/08.
Thay thế mọi mô tả cấu trúc sản phẩm trong tài liệu concept cũ.

---

## Năm nhánh

| #   | Sản phẩm            | Gồm                                                                                                                          | Người ký hợp đồng mua |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | **Pebble Vina One** | Trang chủ · Tìm · Duyệt · Thông báo · Trợ lý AI · Nhân sự · Tài liệu & quy trình · Công việc · Báo cáo · Quản trị · Tích hợp | Giám đốc              |
| 2   | **Pebble Sales**    | CRM · Portal khách hàng · Field service                                                                                      | TP Kinh doanh         |
| 3   | **Pebble Factory**  | MES · Quality · Maintenance                                                                                                  | Giám đốc sản xuất     |
| 4   | **Pebble Supply**   | ERP·Kho · Purchasing · Logistics                                                                                             | TP Mua hàng / Thủ kho |
| 5   | **Pebble Finance**  | Giá thành · Công nợ · eSign · Hóa đơn điện tử                                                                                | Kế toán trưởng        |

Docs không còn tồn tại — mọi tài liệu về Tài liệu & quy trình nằm trong One.
Công việc và Báo cáo không phải sản phẩm, là năng lực của One. Portal khách hàng
đi kèm Sales, không bán rời.

Kiểu `Branch` trong `@pv/engines/src/types.ts` là bản mã hoá của bảng này.

## Hai tầng license bên trong One

| Tầng         | Gồm                                                                                                                                        | Vai trò thương mại                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **One Core** | Trang chủ · Tìm toàn cục · Hộp duyệt · Thông báo đa kênh · Danh bạ & sơ đồ tổ chức · Quản trị người dùng/phân quyền/ghi vết · Hub tích hợp | Nền bắt buộc. Mọi nhánh vệ tinh đều cần. Giá thấp hoặc kèm theo — nhiệm vụ là kéo người vào hệ, không phải thu tiền. |
| **One Plus** | Nhân sự (chấm công · phép · ca kíp · năng lực) · Tài liệu & quy trình · Công việc · Báo cáo · Trợ lý AI                                    | Thu tiền theo đầu người. Bán được cho công ty **chưa mua vệ tinh nào** — cửa vào rẻ nhất của hệ sinh thái.           |

Luật: một năng lực chỉ nằm ở đúng một tầng. Không có tính năng "có ở Core nhưng
giới hạn".

---

## Luật engine thuộc platform

**Engine là của platform, không của nhánh nào.** Nhánh tiêu thụ engine qua hợp
đồng chung; nhánh không được tự dựng bản riêng, không fork, không giữ trạng thái
mà engine đã giữ. Nếu một nhánh cần hành vi mới, sửa engine cho cả hệ — không
thêm nhánh rẽ cục bộ.

| Engine                     | Giữ cái gì                                                                                          | Nhánh dùng thế nào                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **E1 · Đồ thị object**     | Mã, kiểu, chủ sở hữu, quan hệ, vòng đời của mọi object (`SO-0891 → WO-1180 → PO-0455 → L-2608-042`) | Nhánh tạo và cập nhật object của mình; đọc object nhánh khác qua đồ thị. ContextRail dựng thẳng từ đây. |
| **E2 · Quyền & ghi vết**   | Vai trò, phạm vi dữ liệu, nhật ký mọi hành động và mọi lần AI đọc                                   | Nhánh không tự kiểm quyền. Kết quả "Bị ẩn theo quyền của bạn" do E2 trả về.                             |
| **E3 · Quy trình duyệt**   | Định nghĩa chuỗi duyệt, trạng thái, người đang chờ, hạn, uỷ quyền                                   | Nhánh khai báo loại yêu cầu + điều kiện; E3 lo phần còn lại. Mọi yêu cầu đổ về Hộp duyệt của One.       |
| **E4 · Thông báo đa kênh** | Quy tắc sự kiện → điều kiện → kênh (Zalo OA · Telegram · Email · trong app), lịch gửi, chống trùng  | Nhánh phát sự kiện, không tự gọi Zalo API.                                                              |

Trợ lý AI không phải engine — nó là khách hàng của tất cả: đọc qua E1, bị chặn
bởi E2, đề xuất hành động qua E3, báo kết quả qua E4. Vì vậy luật "AI luôn chờ
nút" thực thi được ở tầng E3 chứ không phải bằng thiện chí.

### E5 · Chiến dịch (thêm 19/08)

| Engine              | Giữ cái gì                                                                              | Nhánh dùng thế nào                                                         |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **E5 · Chiến dịch** | Khán giả, chuỗi đợt, nội dung mẫu, lịch chạy, điều kiện dừng, và **dây nối lead ↔ đợt** | Nhánh khai báo chiến dịch; E5 bung ra từng đợt rồi **bắn xuống E4** để gửi |

**Vì sao là engine mới chứ không phải mở rộng E4.** E4 mô tả _"sự kiện xảy ra →
báo cho ai đó trong công ty"_: một lần bắn, một người nhận, chống trùng 15 phút.
Chiến dịch là _"một kế hoạch nhiều đợt, gửi ra người ngoài, dừng khi khách trả
lời"_. Nhét kế hoạch vào bảng quy tắc của E4 sẽ làm hỏng cả hai. Chia việc:

- **E5 giữ kế hoạch** — đợt nào, gửi cho ai, nội dung gì, khi nào, dừng khi nào.
- **E4 vẫn là cửa duy nhất để gửi** — mọi đợt của E5 rốt cuộc gọi `emit`. Nhật ký
  gửi và luật chống trùng **chỉ có một bản**, nằm ở E4. Không nhánh nào, kể cả
  E5, được tự gọi API nền tảng.

Kênh của E4 phải mở thêm cho nền tảng đăng bài ra ngoài — đó là nợ treo số 2.

> **E5 mới có hợp đồng, CHƯA có bản cài đặt.** `packages/engines/src/` hiện chỉ
> có `e1…e4`. Module 1 đang dựng chiến dịch ở tầng fixture (`SOURCES` + `waves`
> trong `das-vina`) và tầng màn, đúng hình dạng E5 sẽ nhận — nhưng chừng nào
> chưa có `e5-campaigns.ts` thì kế hoạch chiến dịch chưa phải của platform.
> Dựng E5 trước khi nhánh thứ hai cần tới chiến dịch, đừng để hai nhánh tự dựng
> hai bản.

Bản cài đặt: `packages/engines/src/e1…e4`. Trên giao diện engine chỉ hiện dưới
dạng nhãn phụ: `E1 · Đồ thị object` · `E2 · Quyền & ghi vết` · `E3 · Quy trình
duyệt` · `E4 · Thông báo đa kênh` · `E5 · Chiến dịch`.

## Chủ của ba đường nối

Đường nối liên nhánh luôn có **đúng một chủ**. Chủ định nghĩa hợp đồng dữ liệu,
chịu trách nhiệm khi lệch, và là nơi ghi bug.

| Đường nối             | Chuyện gì đi qua                                                                                                 | Chủ         | Lý do                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sales → Supply**    | Hợp đồng ký xong sinh đơn bán (`HĐ-2607 → SO-0891`)                                                              | **Supply**  | SO là object của Supply. Sales bàn giao rồi buông; nếu để Sales làm chủ, giá và điều khoản sẽ có hai nguồn sự thật.                                     |
| **Supply ↔ Factory**  | Định mức vật tư, thiếu hàng sinh yêu cầu mua, nhập kho gỡ chặn lệnh (`WO-1180 ↔ PR-0231 ↔ PO-0455 ↔ L-2608-042`) | **Factory** | Factory biết _cần gì, khi nào, bao nhiêu_. Supply đáp ứng. Hai chiều nhưng nhu cầu luôn phát từ Factory.                                                |
| **Factory → Finance** | Giờ máy, giờ công, vật tư tiêu hao, phế phẩm → giá thành theo lệnh                                               | **Finance** | Finance định nghĩa cần đo gì để tính đúng giá thành; Factory chỉ ghi nhận. Nếu để Factory làm chủ, số liệu sẽ tối ưu cho tiến độ chứ không cho giá vốn. |

---

## Pebble Sales — vai người (CHỐT)

Một người một vai, không ai kiêm hai vai trên cùng màn.

| Vai                     | Người                                                                                   | Làm gì                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Trưởng phòng Kinh doanh | **Trần Thu Hà**                                                                         | Người gật: phân công · giảm giá · đổi nhịp chạm. **Không giữ khách nào.** |
| Marketing               | Vũ Minh Châu                                                                            | Kéo khách về, nuôi lại khách im                                           |
| BD                      | Lê Hoàng Nam                                                                            | Mở khách mới, lấy đủ 10 thông tin                                         |
| Sale                    | **Đỗ Quang Huy** (chip) · **Đặng Thanh Bình** (cơ khí, ô tô) · Nguyễn Khánh Linh (dược) | Chốt hợp đồng                                                             |
| Presales                | Phạm Diệu Anh                                                                           | Đi cùng ở demo, soi phần kỹ thuật                                         |

Bảng này đã mã hoá trong `@pv/engines/fixtures/das-vina` (`actors`).

## Transcript

**Mọi cuộc nói chuyện với khách lưu nguyên văn dạng transcript, ngôn ngữ lưu là
tiếng Anh** — chat, tin nhắn, cuộc gọi, buổi gặp mặt. Một ngôn ngữ duy nhất để
phân tích được cả sổ: đếm câu khách hay hỏi, tìm chỗ mất đơn, so giữa các ngành.

Bộ 10 câu là phần **rút ra** từ transcript, không thay thế transcript. Giao diện
vẫn tiếng Việt — transcript tiếng Anh là dữ liệu lưu, không phải thứ hiển thị
mặc định.

## Bộ 10 câu và hai agent

**Bộ 10 câu là của hệ, không của vai nào.** Ai chạm khách cũng điền vào cùng một
bộ: Marketing điền trong chat, BD điền lúc gặp mặt, AI điền qua tin nhắn và cuộc
gọi. Điền dần qua nhiều lần chạm; ô đã có thì không hỏi lại — khách không bao
giờ phải trả lời hai lần cùng một câu cho hai người. Không vẽ 10 câu như form
riêng của BD.

### Cổng là ô BẮT BUỘC, không phải 10/10

> **Đổi 19/08.** Trước đó cổng là _"đủ 10/10 ô mới thành init data"_. Bốn ô cuối
> — tiền, mốc, người ký, đang dùng gì — thường chỉ moi ra được **sau** khi Sale
> đã ngồi với khách; bắt đủ mười trước khi giao là khoá cửa từ bên trong, lead
> tốt nằm chết ở kho chung chờ một ô không ai lấy được. Bản cũ: `git show
055b483:docs/kien-truc-san-pham.md`.

| #     | Câu                                       | Bắt buộc |
| ----- | ----------------------------------------- | -------- |
| **1** | Công ty là ai — tên pháp nhân, mã số thuế | ✔        |
| **2** | Ngành và sản phẩm chính                   | ✔        |
| **3** | Quy mô — số người, số nhà máy             | ✔        |
| **4** | Người liên hệ và chức danh                | ✔        |
| **5** | Kênh liên lạc gọi lại được                | ✔        |
| **6** | Đau ở đâu — việc khách muốn giải          | ✔        |
| 7     | Đang dùng gì                              |          |
| 8     | Ai ký cuối, ai duyệt tiền                 |          |
| 9     | Khoảng tiền                               |          |
| 10    | Khi nào cần xong                          |          |

Đủ **sáu ô bắt buộc** → **init data** → lead chạy được vào pipeline, và agent 2
chạy được. Bốn ô còn lại làm dày hồ sơ, thiếu thì không chặn — nhưng vẫn đếm và
vẫn hiện, vì đó là thước đo công trạng của BD.

**Ô nào bắt buộc là CẤU HÌNH, không phải hằng số của màn.** Bảng trên là giá trị
mặc định; chỗ sửa nằm ở module 5. Màn hỏi engine _"lead này qua cổng chưa"_ và
hiện đúng câu engine trả về — màn không tự đếm ô, không tự chế câu từ chối.

| Agent       | Việc                | Đầu vào → đầu ra                                                                                |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| **Agent 1** | Chạm lần đầu        | Nhắn/gọi ngay trên kênh khách vừa dùng, hỏi những ô còn trống → dắt lead về CRM, sinh init data |
| **Agent 2** | Dựng lần chạm thứ 2 | Đọc init data + nguồn công khai → phiếu tiếp cận: mở lời bằng câu gì, tránh câu gì, ai nên đi   |

Chưa đủ init data thì **agent 2 không chạy** — dựng phiếu trên dữ liệu thiếu sẽ
ra lời khuyên sai. Cả hai agent vẫn chịu luật "AI luôn chờ nút" (luật 9).

## Hoa hồng và công trạng — hai thứ khác nhau

Hoa hồng chỉ chia được **khi có đơn**. Nhưng phần lớn việc của phòng xảy ra
_trước_ khi có đơn, và ai làm tốt phần đó thì hôm nay không có gì ghi lại. Tách
đôi:

|            | Hoa hồng           | Công trạng                         |
| ---------- | ------------------ | ---------------------------------- |
| Khi nào có | Đơn đã ký          | Mọi lần chạm                       |
| Đo cái gì  | Tiền               | Việc đã làm đúng vai               |
| Chốt ở đâu | `COMMISSION_SPLIT` | `CREDIT_RULES` — module 5 sửa được |

**Hoa hồng một đơn.** Mở cửa **30** (BD) · chốt **60** (Sale ký) · đi cùng demo
**10** (presales). Đơn đổi tay giữa hai Sale thì chia lại 60 phần chốt theo số
lần chạm; phần của BD không đụng tới.

**Công trạng theo vai** — mỗi vai ghi bằng đúng thứ vai đó làm, không ép chung
một thước:

| Vai           | Ghi công bằng                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------- |
| Marketing     | Lead kéo về · trong đó bao nhiêu lead **tốt** (qua được cổng init data) · giá mỗi lead tốt    |
| BD            | Số ô bắt buộc moi được · lead xác minh là công ty thật · **phản hồi trả ngược cho Marketing** |
| Sale          | Đơn chốt · giá trị · tốc độ qua từng cột của sổ cơ hội                                        |
| Presales      | Buổi demo đi cùng · demo nào ra được báo giá                                                  |
| TP Kinh doanh | **Không tính công trạng cá nhân** — vai này phân công, số của phòng chính là số của họ        |

Vòng **BD → Marketing** là đường nối bắt buộc, không phải tính năng phụ: BD là
người duy nhất sờ được lead đủ lâu để biết đợt nào nhắm trúng. Không có đường
này thì Marketing chỉ đếm được số lead, không bao giờ biết lead nào tốt.

Cả hai bảng mã hoá trong `@pv/engines/fixtures/das-vina`.

---

## Năm module Pebble Sales (CHỐT)

> **Đổi ngày 19/08 · bản hai.** Sáng 19/08 chỗ này chốt _bốn module_ và module 1
> tên là **Thị trường**, đang bị chặn vì không có dữ liệu thị trường. Chiều 19/08
> đổi hai chỗ: module 1 định nghĩa lại thành **Chiến dịch & Sự kiện**, và thêm
> **module 5 · Cấu hình**. Bản trước: `git show 055b483:docs/kien-truc-san-pham.md`.
> Bộ 10 màn kể chuyện bỏ từ trước đó: `git show 8c714c8:...`.

Bốn module đầu là **một vòng khép kín**, không phải bốn tính năng rời:
nguồn → chia việc → đo → chỉnh. Module 5 **không nằm trong vòng** — nó là thứ
định hình cái vòng.

| #   | Module                       | Trả câu hỏi gì                    | Trạng thái                               |
| --- | ---------------------------- | --------------------------------- | ---------------------------------------- |
| 1   | **Chiến dịch & Sự kiện**     | Khách ở đâu ra, đợt nào ra khách  | nguồn của vòng — dựng cùng module 2      |
| 2   | **Lead**                     | Ai đang trong tay ai              | sổ chính — mọi module khác trỏ về đây    |
| 3   | **Performance**              | Ai đang làm được, ai đang tắc     | có trục tháng · quý · năm · khoảng ngày  |
| 4   | **Số liệu & kế hoạch (AI+)** | Tháng tới phòng nên làm gì        | làm cuối — ăn đầu ra của 1 + 2 + 3       |
| 5   | **Cấu hình**                 | Dữ liệu của phòng có hình dạng gì | làm sớm — bốn module kia đọc hình từ đây |

### Module 1 · Chiến dịch & Sự kiện

**Tại sao đổi tên.** Module 1 từng là _bản đồ thị trường ngành_ và bị chặn vì
cần dữ liệu ngoài, tức cần kịch bản thứ ba. Nhưng câu hỏi chốt của nó luôn là
**"khách ở đâu ra"** — và chiến dịch trả lời đúng câu đó bằng dữ liệu của chính
phòng, nằm gọn trong DAS Vina. Nợ treo số 1 tan theo cách đổi này, không cần
thêm khách thứ ba nào.

**Chủ màn là vai Marketing** (Vũ Minh Châu) — màn đầu tiên trong hệ không đứng ở
góc Sale. Người gật vẫn là TP Kinh doanh.

| Mục | Việc                                        | Ràng buộc đã có                                                                            |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1.1 | Tạo chiến dịch: khán giả · kênh · chuỗi đợt | Mọi lần gửi đi qua **E4**. Nhánh phát sự kiện, không tự gọi API nền tảng nào               |
| 1.2 | Nội dung soạn sẵn cho từng đợt              | AI soạn được, nhưng chịu luật 9: có "Căn cứ:", có nút, không đợt nào tự gửi                |
| 1.3 | Sự kiện có mặt người thật                   | Hội thảo · webinar · triển lãm: có địa điểm, danh sách đăng ký, check-in                   |
| 1.4 | Theo dõi chiến dịch đã chạy                 | Đo bằng **lead đổ về**, không đo bằng lượt xem. Số đo đóng băng 17/08, không vẽ đường cong |
| 1.5 | Lead đổ về → giao chủ → tạo phiếu việc      | **Đã dời sang module 2** — xem ghi chú ngay dưới bảng                                      |
| 1.6 | Sửa · đóng · theo dõi một chiến dịch        | Sửa dùng ĐÚNG màn tạo, không dựng màn thứ hai. Đóng và theo dõi nối E3/E4 khi có backend   |
| 1.7 | Kỳ vọng lead của từng đợt                   | Số đặt TRƯỚC khi chạy (`Wave.expected`). Timeline đo đạt/hụt theo nó, không tự chấm điểm   |

> **Đổi ngày 19/08 · bản ba — mục 1.5 rời khỏi module 1.** Bản hai để bảng lead
> đổ về ngay trên màn Chiến dịch, kèm hai nút "giao chủ" và "tạo phiếu việc".
> Người dùng bỏ nó khỏi màn: _"bỏ phần lead list đi, nó thuộc lead"_. Lý do
> đứng vững — cùng một dòng lead mà thao tác được ở hai màn thì không màn nào là
> nơi đúng để tra, và module 2 đã có đủ cả ba việc (2.1 danh sách · 2.2 giao/nhận
> · 2.3 report). Màn Chiến dịch giờ chỉ còn **một con số** "bao nhiêu lead của
> nguồn này đã qua cổng" kèm lối sang Sổ lead. Ràng buộc cũ không đổi: cổng init
> data vẫn là luật, và "phiếu việc ≠ cơ hội" (dưới) vẫn đúng — nó chỉ được thi
> hành ở module 2.

**Hai loại, một khung.** _Chiến dịch_ (chạy trên kênh, nhiều đợt) và _sự kiện_
(có ngày, có chỗ, có người đến) dùng chung bảng và chung cách đo — chỉ khác ở
khối giữa. Lọc riêng từng loại được, nhưng không tách thành hai màn: cả hai đều
trả lời cùng một câu "đợt này ra bao nhiêu khách".

**Phiếu việc ≠ cơ hội.** Lead vừa điền form giỏi lắm có ba ô. Bấm "tạo phiếu
việc" sinh ra **việc đi lấy nốt ô còn thiếu** — đúng việc của agent 1 — chứ
không đẩy lead sang SQL. Cổng init data không có đường vòng. Và phiếu việc khác
**phiếu tiếp cận**: phiếu tiếp cận là thứ agent 2 dựng _sau khi_ đã qua cổng.

### Module 2 · Lead

| Mục | Việc                                           | Ràng buộc đã có                                                                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Danh sách lead, lọc theo MQL/SQL + ngành + SLA | SLA = `daysInStage` vượt `limitDays` của `PIPELINE_STAGES`. Không đẻ khái niệm quá hạn thứ hai                      |
| 2.2 | Giao lead / nhận lead vào sale pipeline        | Cổng MQL→SQL là bộ 10 câu (xem dưới). Người gật là TP Kinh doanh. Đổi tay thì `COMMISSION_SPLIT` chia lại phần chốt |
| 2.3 | Report lead có vấn đề                          | Đúng **6 lý do** của `EXIT_REASONS`, **không có ô "khác"**                                                          |

**MQL và SQL là hai bậc đã có sẵn trong `FUNNEL`, không phải nhãn mới:**

| Bậc     | `FUNNEL`            | Nghĩa                                                    |
| ------- | ------------------- | -------------------------------------------------------- |
| Đầu mối | `dau-moi` · 100     | Mới vào, chưa ai xác minh                                |
| **MQL** | `cong-ty-that` · 44 | Marketing xác nhận công ty có thật — **chưa đủ 10/10 ô** |
| **SQL** | `co-hoi` · 30       | **Đủ 10/10 init data**, Sale đã nhận                     |

Ranh giới MQL→SQL chính là hành động 2.2. Cổng đã là luật: **chưa đủ sáu ô bắt
buộc thì không được đẩy sang SQL**, và agent 2 không chạy. Không mở đường vòng.

**Sổ lead là sổ thật, không phải bảng mẫu.** Chốt 19/08:

- **100 dòng** — đúng bằng bậc đầu của phễu, không nhiều hơn, không ít hơn.
- **Phân trang**, không cuộn vô tận. Bảng dài vẫn nằm trên `.glass-b` (luật 8).
- **Mỗi dòng mở ra được** thành hồ sơ lead: mười ô, ai đang giữ, đến từ chiến
  dịch nào, và **timeline đầy đủ** — mọi lần chạm, mọi lần đổi tay, mọi lần điền
  thêm ô, theo thứ tự thời gian.
- **Kanban** cho phần đã vào sổ cơ hội: năm cột của `PIPELINE_STAGES`, không cột
  thứ sáu. Lead chưa qua cổng không có mặt trên kanban — nó chưa có cột nào để
  đứng.
- Lọc được **đang chạy / đã ra khỏi luồng**. Mặc định chỉ hiện lead đang chạy;
  lead đã rơi vẫn tra được, vì đó là nơi câu trả lời "vì sao mất" nằm.

### Module 3 · Performance

Chia theo chức năng, xem được theo từng người, và **có trục tháng · quý · năm ·
khoảng ngày tự chọn**.

> **Đổi ngày 19/08 — màn này giờ CÓ trục thời gian.** Bản trước cấm, với lý do
> "fixture là một lát cắt, dựng trục thời gian sẽ phải đẻ số không ai ký". Lý do
> đó sai ở một chỗ kiểm được: mỗi dòng sổ lead đã mang sẵn ngày của từng mốc đời
> nó — vào sổ, lên MQL, vào sổ cơ hội, ký, ra khỏi luồng. Cắt theo tháng là ĐỌC
> LẠI những ngày đã có. Bằng chứng nằm ở `scenario.test.ts`: cộng bốn mốc của cả
> kỳ ra đúng `100 · 44 · 30 · 6`, tức đúng bốn bậc của `FUNNEL`. Ca test đó là
> điều kiện để trục thời gian được phép tồn tại — bỏ nó là mở cửa cho số bịa.

**Hai mốc biên.** Lát cắt 17/08 09:10 là chỗ hết số đo; chân trời 31/08 (hết
tháng chứa lát cắt) là chỗ hết chỉ tiêu. Mục tiêu tính tới chân trời chứ không
tới lát cắt, nếu không tháng 8 chỉ được giao 17/31 chỉ tiêu và câu hỏi "còn bao
lâu nữa mới đạt" mất nghĩa.

**Hai cách cắt, mỗi con số khai một cách.**

| Cách cắt        | Dùng cho                                       | Đọc là                                                |
| --------------- | ---------------------------------------------- | ----------------------------------------------------- |
| **Lứa**         | phễu và ba tỷ lệ MQL · SQL · win rate          | "của lead VÀO SỔ trong kỳ, bao nhiêu đi tới bậc X"    |
| **Ngày xảy ra** | hợp đồng ký, lead rời luồng, thước hoạt động   | "trong kỳ này phòng làm được bao nhiêu"               |
| _(số chụp)_     | giá trị đơn đang mở, đơn mục, giá mỗi lead tốt | không có ngày để cắt — nhãn phải ghi "tính đến 17/08" |

Phễu đọc theo **lứa** vì chỉ có lứa mới giữ được tính lồng nhau: đếm theo ngày
xảy ra thì tháng 8 ra "2 SQL trên 2 MQL = 100%" chỉ vì hai lead đó lên MQL từ
tháng 6 — đúng phép tính, sai câu chuyện.

**Bốn khối:** bộ chọn kỳ kiêm thanh thời gian · bento chỉ số (một ô hero 2×2 là
phễu bốn bậc) · dòng chảy (lý do rời luồng + SLA bàn giao) · danh sách nhân sự.

**Người là một DANH SÁCH, không phải bảy thẻ chi tiết.** Bấm một dòng mở drawer
(T-04) chứa: đồng hồ KPI chính ở giữa với mục tiêu · đã đạt · còn thiếu · còn
mấy ngày vây quanh → nhịp "còn bao lâu nữa mới đạt" theo ngày · tháng · quý →
ba lớp thước của vai → bảng bằng chứng. Cùng một vai thì cùng một bộ thước.
Ai cũng mở được drawer của mọi người: KPI là thứ để phòng nhìn nhau mà chạy.

Đo mỗi vai bằng gì đã chốt ở `ROLE_KPI_MODEL` và bảng **công trạng** phía trên —
module 3 chỉ hiển thị, không tự định nghĩa thước đo. Thước đo và ngưỡng sửa ở
module 5. Ba lớp thước (hoạt động · chuyển đổi · chất lượng) lấy từ tài liệu
"Vòng đời khách hàng, KPI & thiết kế CRM"; **lớp chất lượng không dùng để xếp
Đạt / Cần cải thiện** — tài liệu để nó ở một cột riêng, và cho nó quyền đánh
trượt thì một Sale chốt đủ đơn vẫn bị gắn "Cần cải thiện" vì một đơn cũ quá hạn
cột.

### Module 5 · Cấu hình

Chỗ duy nhất định hình dữ liệu của phòng kinh doanh. Trước module này, mọi hằng
số đều nằm rải trong fixture và không ai ngoài lập trình viên đổi được.

| Mục | Cấu hình cái gì            | Hôm nay là hằng số nào                                 |
| --- | -------------------------- | ------------------------------------------------------ |
| 5.1 | Bộ 10 câu · ô nào bắt buộc | `INIT_DATA_QUESTIONS`                                  |
| 5.2 | Cột của sổ cơ hội + hạn    | `PIPELINE_STAGES`                                      |
| 5.3 | Ngành và Sale phụ trách    | `LEAD_CATEGORIES`                                      |
| 5.4 | Lý do ra khỏi luồng        | `EXIT_REASONS` — sửa được, nhưng **không có ô "khác"** |
| 5.5 | Ngưỡng SLA cho đầu mối/MQL | chưa có hằng số — nợ treo số 3 tan ở đây               |
| 5.6 | Hoa hồng và công trạng     | `COMMISSION_SPLIT` · `CREDIT_RULES`                    |
| 5.7 | Kênh và mẫu nội dung       | kênh của E4 + mẫu đợt gửi của module 1                 |

Ba luật của module này:

1. **Cấu hình là dữ liệu, không phải code.** Màn khác đọc cấu hình qua engine;
   không màn nào được giữ bản sao của một hằng số ở đây.
2. **Đổi cấu hình là hành động có ghi vết** (E2), và những mục đổi hình dữ liệu
   đã chạy — bỏ một cột của sổ, bỏ một lý do đang có lead đứng — phải qua **E3**,
   người gật là TP Kinh doanh.
3. **Không có ô "khác"** ở bất kỳ danh sách đóng nào. Thêm lý do thứ bảy là hành
   động cấu hình có chủ, không phải chỗ để người dùng gõ tự do.

### Luật chung năm module

- Mỗi màn dùng **đúng một kịch bản**, và năm module này đều là **DAS Vina**.
- Mỗi màn giữ khối **Cố tình không làm**. Không viết lịch sử phiên bản lên màn.
  **Ngoại lệ từ 19/08: màn Performance bỏ khối này** theo yêu cầu người dùng —
  những điều bị bỏ ở đó giờ nói tại chỗ ("chưa đo được" ngay trên thước, "kỳ này
  không lead nào rơi" ngay trong ô rỗng) thay vì gom vào một danh sách cuối màn.
  Bốn màn còn lại chưa đổi.
- Module 4 chịu luật 9 như mọi khối AI: có "Căn cứ:", có nút, không tự chạy.
- Module 1 và 5 cũng chịu luật 9 ở mọi khối AI soạn nội dung.

### Nợ đang treo — đừng tự quyết, hỏi

1. **Đường demo 60 giây** của bộ cũ (3 → 1 → 5) chưa có bản thay thế.
2. **Nền tảng đăng bài nào được hỗ trợ thật.** E4 hôm nay có bốn kênh
   (`zalo-oa · telegram · email · in-app`) và cả bốn đều là kênh báo cho **người
   trong công ty**. Đăng bài ra ngoài là hành vi khác — xem "E5 · Chiến dịch".
3. **Ngưỡng SLA cho đầu mối/MQL** chuyển từ nợ treo thành mục 5.5: nó là cấu
   hình, không phải hằng số ai đó phải nghĩ ra một lần cho xong. Giá trị mặc định
   vẫn cần một người đặt.

Đã gỡ khỏi danh sách này: nợ 1 cũ (module 1 không có dữ liệu) tan khi module 1
đổi thành Chiến dịch & Sự kiện; nợ 2 cũ (tiêu chí chấm vai) chốt ở bảng công
trạng.

Ba màn từng dựng rồi xoá, không thuộc bộ nào: `POC - Bản đồ hệ sinh thái`,
`POC - Walkthrough Sao Đỏ`, và một màn Supply `ERP Kho - Tablet Nhập kho`.

---

## Kịch bản dữ liệu

Có đúng **hai kịch bản**, không thêm kịch bản thứ ba, và **không trộn hai kịch
bản trên cùng một màn**.

Toàn bộ số liệu đã mã hoá trong `@pv/engines/fixtures` và bị
`packages/engines/src/fixtures/scenario.test.ts` khoá — đổi số nào phải sửa test,
test đỏ là lời nhắc đúng lúc.

| Kịch bản                                                    | Import từ                       | Đóng băng     |
| ----------------------------------------------------------- | ------------------------------- | ------------- |
| **Sao Đỏ** — khách đã mua, dùng cho màn One 01–05           | `@pv/engines/fixtures/sao-do`   | 10/08 · 07:58 |
| **DAS Vina** — khách chưa mua, dùng cho cả năm module Sales | `@pv/engines/fixtures/das-vina` | 17/08 · 09:10 |

Sao Đỏ có hai lát cắt ngoại lệ: màn ký hợp đồng ở **21/07 · 16:20** (nguồn gốc
của SO-0891), và thẻ chạm khách ở **10/08 · 09:38** (ngay trước cuộc gọi). Đầu
mối bên Sao Đỏ chỉ có một người: **Nguyễn Văn Đạt · Phó giám đốc kỹ thuật**.

DAS Vina: nhà máy đóng gói chip · Bắc Ninh · 1.400 người. Giám đốc bên Hàn Quốc
ký cuối; trên 3 tỷ phải xin công ty mẹ.

### Phép cân của sổ lead (sửa 19/08)

Bản cũ ghi _"`EXIT_REASONS` tổng đúng bằng 100 đầu mối trừ 6 hợp đồng"_ — tức 94.
**Sai**: phép trừ đó quên **10 đơn đang mở** của `OPEN_DEALS`, chúng chưa rơi mà
cũng chưa ký. 94 + 6 + 10 = 110 > 100.

Phép cân đúng, 100 dòng của sổ chia làm ba phần:

| Phần             | Số  | Là gì                                            |
| ---------------- | --- | ------------------------------------------------ |
| Đã ký            | 6   | bậc cuối của phễu                                |
| Đang chạy        | 42  | 20 đầu mối + 12 MQL + 10 SQL (đúng `OPEN_DEALS`) |
| Đã ra khỏi luồng | 52  | tổng của `EXIT_REASONS`                          |
| **Tổng**         | 100 | bậc `dau-moi` của `FUNNEL`                       |

Sáu bậc phễu **không đổi** (100 · 44 · 30 · 19 · 11 · 6) — đó là số hero đã chốt.
Sáu lý do rơi giữ nguyên thứ tự, chia lại cho tổng 52. Bậc của từng dòng cũng
phải khớp phễu: 44 dòng từ MQL trở lên, 30 dòng từ SQL trở lên.

Rule lint `aurora/no-scenario-mix` chặn một file import từ cả hai.
