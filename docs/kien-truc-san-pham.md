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

Trợ lý AI không phải engine thứ năm — nó là khách hàng của cả bốn: đọc qua E1,
bị chặn bởi E2, đề xuất hành động qua E3, báo kết quả qua E4. Vì vậy luật "AI
luôn chờ nút" thực thi được ở tầng E3 chứ không phải bằng thiện chí.

Bản cài đặt: `packages/engines/src/e1…e4`. Trên giao diện engine chỉ hiện dưới
dạng nhãn phụ: `E1 · Đồ thị object` · `E2 · Quyền & ghi vết` · `E3 · Quy trình
duyệt` · `E4 · Thông báo đa kênh`.

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

Đủ **10/10** ô thì mới thành **init data** — điều kiện duy nhất để dắt lead về
CRM thành cơ hội thật, và là toàn bộ đầu vào của agent thứ 2.

| Agent       | Việc                | Đầu vào → đầu ra                                                                                |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| **Agent 1** | Chạm lần đầu        | Nhắn/gọi ngay trên kênh khách vừa dùng, hỏi những ô còn trống → dắt lead về CRM, sinh init data |
| **Agent 2** | Dựng lần chạm thứ 2 | Đọc init data + nguồn công khai → phiếu tiếp cận: mở lời bằng câu gì, tránh câu gì, ai nên đi   |

Chưa đủ init data thì **agent 2 không chạy** — dựng phiếu trên dữ liệu thiếu sẽ
ra lời khuyên sai. Cả hai agent vẫn chịu luật "AI luôn chờ nút" (luật 9).

## Hoa hồng một đơn

Mở cửa **30** (BD) · chốt **60** (Sale ký) · đi cùng demo **10** (presales).
Đơn đổi tay giữa hai Sale thì chia lại 60 phần chốt theo số lần chạm; phần của
BD không đụng tới. Mã hoá ở `COMMISSION_SPLIT` trong
`@pv/engines/fixtures/das-vina`.

---

## Bộ màn Pebble Sales — thứ tự kể (CHỐT)

Bản vẽ đã xoá, thứ tự thì giữ. Chạy một chiều theo thời gian; đường demo 60 giây
là 3 → 1 → 5.

| #   | Màn                           | Lát cắt                    | Vai                                                                      |
| --- | ----------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| 1   | Ký xong đơn bán tự có         | 21/07 16:20                | **Màn showoff.** Một cú bấm sinh SO-0891 · WO-1180 · vật tư · 3 tin nhắn |
| 2   | Tháng này chốt được bao nhiêu | 10/08 07:58                | Màn của người ký hợp đồng — tiền                                         |
| 3   | Sổ khách hàng                 | 10/08 07:58                | Khoanh vùng ai đang trôi, gỡ chặn PO-0455                                |
| 4   | Thẻ chạm khách                | 10/08 09:38                | Cầm gì trước khi bấm gọi                                                 |
| 5   | Cổng khách hàng               | 10/08 07:58 · 08:04        | Khách của khách hàng nhìn                                                |
| 6   | Diagram luồng CRM             | 17/08 09:10 · DAS Vina     | Sơ đồ 6 bước × 7 vai — ai chịu trách nhiệm, ai chờ ai                    |
| 7   | Vòng đời object               | 17/08 09:10 · DAS Vina     | Hồ sơ nào sinh lúc nào, ai đứng tên, 7 trạng thái của OP                 |
| 8   | Bảng cơ hội đang mở           | 17/08 09:10 · sổ 10 cơ hội | Mười đơn song song, đơn nào đang mục                                     |
| 9   | Dòng thời gian một đơn        | 17/07 → 05/09 · DAS Vina   | 50 ngày vẽ đúng độ dài — 18 ngày gọi không ai nghe                       |
| 10  | Đơn tuột ở đâu                | 01/05 → 17/08              | 100 đầu mối → 6 hợp đồng, 6 lý do ra khỏi luồng                          |

Màn 06–10 là **năm góc nhìn của cùng một luồng**, không phải năm tính năng. Mỗi
màn trả đúng một câu hỏi: 06 ai làm gì · 07 hồ sơ nào tồn tại · 08 nhiều đơn cùng
lúc · 09 thật sự mất bao lâu · 10 tuột ở đâu. Không nhét câu trả lời của màn này
vào màn khác.

Màn 01–05 có đúng ba khối phụ, không thêm: **Màn này bán cái gì** (kèm câu chốt
deal) · **Số trên màn lấy từ đâu** · **Cố tình không làm**. Màn 06–10 là sơ đồ,
không có ba khối này — nhưng mỗi màn sơ đồ vẫn phải có khối **Cố tình không làm**.
Không viết lịch sử phiên bản lên màn.

Hai màn ngoài bộ mười, từng dựng rồi xoá: `POC - Bản đồ hệ sinh thái`,
`POC - Walkthrough Sao Đỏ`, và một màn Supply `ERP Kho - Tablet Nhập kho`.

---

## Kịch bản dữ liệu

Có đúng **hai kịch bản**, không thêm kịch bản thứ ba, và **không trộn hai kịch
bản trên cùng một màn**.

Toàn bộ số liệu đã mã hoá trong `@pv/engines/fixtures` và bị
`packages/engines/src/fixtures/scenario.test.ts` khoá — đổi số nào phải sửa test,
test đỏ là lời nhắc đúng lúc.

| Kịch bản                                            | Import từ                       | Đóng băng     |
| --------------------------------------------------- | ------------------------------- | ------------- |
| **Sao Đỏ** — khách đã mua, dùng cho màn One 01–05   | `@pv/engines/fixtures/sao-do`   | 10/08 · 07:58 |
| **DAS Vina** — khách chưa mua, dùng cho Sales 06–12 | `@pv/engines/fixtures/das-vina` | 17/08 · 09:10 |

Sao Đỏ có hai lát cắt ngoại lệ: màn ký hợp đồng ở **21/07 · 16:20** (nguồn gốc
của SO-0891), và thẻ chạm khách ở **10/08 · 09:38** (ngay trước cuộc gọi). Đầu
mối bên Sao Đỏ chỉ có một người: **Nguyễn Văn Đạt · Phó giám đốc kỹ thuật**.

DAS Vina: nhà máy đóng gói chip · Bắc Ninh · 1.400 người. Giám đốc bên Hàn Quốc
ký cuối; trên 3 tỷ phải xin công ty mẹ.

Rule lint `aurora/no-scenario-mix` chặn một file import từ cả hai.
