# Kế hoạch dựng lại hai màn quản lý — `/sales/plan` và `/sales/config`

Trạng thái: **NHÁP, chờ gật.** Viết 19/08. Chưa viết dòng code nào.

Hai màn này là hai màn DUY NHẤT trong Pebble Sales mà một nước đi áp lên cả
phòng. Ba màn kia (Chiến dịch · Lead · Performance) là chỗ người ta _làm việc_;
hai màn này là chỗ người ta _đặt luật và đặt số_ cho việc đó. Hôm nay cả hai
đang bị dựng như hai trang cài đặt dài — `/sales/config` cuộn **3.845px**, gần
bốn màn hình, để nói bảy chuyện không liên quan nhau về mặt thị giác.

---

## §0 · Vì sao hai màn này quan trọng — và vì sao phải dựng cùng nhau

Bốn module đầu là một vòng khép kín: **nguồn → chia việc → đo → chỉnh**. Nhưng
vòng đó không có _đầu vào_. Không ai nói cho nó biết tháng này phòng muốn bao
nhiêu tiền, và không ai nói cho nó biết đo bằng thước nào.

Hai màn này chính là hai thứ đó, và chúng nối vào nhau bằng một sợi dây rất
ngắn:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  /sales/config          ĐỊNH NGHĨA THƯỚC                        │
  │  · cổng lead là mấy ô          → module 2 dùng để cho qua/chặn  │
  │  · tỉ lệ chuyển đổi dùng để    → module 4 dùng để CHIA NGƯỢC    │
  │    lập kế hoạch                   từ doanh thu xuống số lead    │
  │  · giá trị hợp đồng trung bình → module 4 dùng để ra số hợp đồng│
  │  · ngưỡng KPI từng vai         → module 3 dùng để chấm đạt/tắc  │
  └───────────────────────────┬─────────────────────────────────────┘
                              │  thước
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  /sales/plan            NHÂN THƯỚC VỚI THAM VỌNG                │
  │  doanh thu mục tiêu ÷ thước = số hợp đồng ÷ thước = SQL ÷ …     │
  │  … = số đầu mối cần → chia thành Ô VIỆC có chủ, có tiền         │
  └───────────────────────────┬─────────────────────────────────────┘
                              │  ô việc
                              ▼
  module 1 Chiến dịch · module 2 Lead — cá nhân NHẬN ô việc và tạo
  chiến dịch / sự kiện / lead trực tiếp THUỘC kế hoạch đó
                              │
                              │  số thật
                              ▼
  module 3 Performance — đo · rồi số đo quay lại làm THƯỚC cho kỳ sau
  (đóng vòng: /sales/config sửa tỉ lệ theo cái vừa đo được)
```

Đó là lý do phải dựng cùng nhau: sửa một màn mà không sửa màn kia thì sợi dây
đứt, và mỗi màn lại thành một trang cài đặt cô đơn.

---

## §1 · Bệnh của hai màn hôm nay

| Màn             | Bệnh                                                                                      | Bằng chứng                                     |
| --------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `/sales/config` | Bảy mục xếp dọc thành một cột dài. Không mục nào nhìn thấy mục nào.                       | cuộn 3.845px / màn 963px                       |
|                 | Không có phiên bản. Bộ 10 câu đổi cổng từ 10/10 xuống 6 ô mà màn không kể được là đã đổi. | `INIT_DATA_QUESTIONS` không có trục thời gian  |
|                 | Không có ngưỡng KPI. `CREDIT_RULES` chỉ có TÊN chỉ số, không con số nào để đạt hay trượt. | `metrics: string[]`                            |
|                 | Không trực quan: bảy bảng chữ, đúng một chỗ có màu (mục 5.6).                             |                                                |
| `/sales/plan`   | Không phải kế hoạch. Nó là ba gợi ý AI xếp dọc.                                           | `PlanProposal[]`, không có object kế hoạch nào |
|                 | Không có kỳ. Không nhìn được kỳ trước làm được đến đâu.                                   | `docs`: "không có trục thời gian"              |
|                 | Không có số từ trên xuống. Không ai trả lời được "tháng này cần bao nhiêu lead".          |                                                |
|                 | Không có chỗ cho cá nhân nhận việc. Kế hoạch không đẻ ra việc cho ai.                     |                                                |

---

## §2 · Mâu thuẫn phải giải trước: "không có trục thời gian"

`docs/kien-truc-san-pham.md` nói thẳng, hai lần: fixture là **một lát cắt đóng
băng 17/08**, dựng trục thời gian sẽ phải đẻ số không ai ký; màn `plan` hiện có
cả một khối _"Không dự báo doanh số tháng tới"_.

Yêu cầu mới đòi đúng thứ đó: kỳ trước · kỳ đang chạy · kỳ mới.

**Cách giải — và đây là điểm phải gật trước khi code:**

> Luật cũ cấm **bịa số ĐO**. Kế hoạch không phải số đo — nó là **số một người
> ĐẶT**, và số đặt thì bao giờ cũng có tên người đặt kèm ngày đặt. Vì thế trục
> thời gian được phép có, với đúng một điều kiện: **mọi con số kế hoạch phải
> mang tên người đặt và ngày đặt**, còn mọi con số thực tế vẫn phải suy ra từ
> sổ lead có sẵn, không thêm một dòng dữ liệu giả nào.

Hệ quả: khối _"Không dự báo doanh số"_ trên màn `plan` được thay bằng _"Kế
hoạch là số người đặt, không phải số máy đoán"_ — cùng một sự thành thật, nói ở
tầng đúng hơn.

**Không đẻ dòng lead nào mới.** Sổ vẫn đúng 100 dòng, phễu vẫn 100·44·30·19·11·6.

---

## §3 · Chia kỳ — cắt bằng dao có sẵn, không cắt bằng dao mới

Kỳ chia theo **ngày chạy đầu tiên của nguồn** (`Source.startDay`), không chia
theo ngày lead vào sổ. Lý do: `bornDay` của lead bị kẹp bởi `DAY_FROZEN -
daysHere` nên nó không nói đúng lead thuộc đợt nào; còn nguồn thì có ngày chạy
thật. Cắt như vậy cho ra một phép chia **sạch tuyệt đối**:

| Kỳ                     | Ngày                        | Nguồn                                                     | Đầu mối   | Chi          | Lead tốt | Hợp đồng |
| ---------------------- | --------------------------- | --------------------------------------------------------- | --------- | ------------ | -------- | -------- |
| **Kỳ trước** (đã đóng) | 01/05 → 31/07               | CD-0101 · CD-0102 · SK-0103 · SK-0104 · CD-0105 · GT · TM | **89**    | **155 tr**   | **31**   | **5**    |
| **Kỳ T8** (đang chạy)  | 01/08 → 31/08, băng ở 17/08 | SK-0106                                                   | **11**    | **145 tr**   | **3**    | **1**    |
| Tổng                   |                             | 8 nguồn                                                   | **100** ✔ | **300 tr** ✔ | **34** ✔ | **6** ✔  |

Cả bốn cột cộng lại khớp đúng số đã khoá trong `scenario.test.ts`. Không con
số nào bị đẻ thêm, không con số nào bị mất.

Và câu chuyện tự nó hiện ra, không cần ai kể:

> Kỳ trước chạy **7 nguồn, 155 tr, về 89 đầu mối** — 1,74 tr một đầu mối, 5,0 tr
> một lead tốt.
> Tháng 8 dồn gần hết tiền vào **một gian hàng triển lãm: 145 tr**, mới đi được
> **17/31 ngày** mà đã tiêu **76% ngân sách**, về **11/54 đầu mối (21%)**.
> Giá một lead tốt tháng này là **48,3 tr — gấp gần mười lần kỳ trước.**
> Nhưng nó cũng là chỗ ra **hợp đồng duy nhất của tháng, 700 tr.**

Đó là loại nội dung "đọc là hiểu ngay" mà màn phải bày ra trong một cái liếc.

---

## §4 · `/sales/plan` — kế hoạch từ trên xuống

### 4.1 · Thang kế hoạch — xương sống của màn

Một kế hoạch là một **cái thang sáu bậc**, đi từ tiền xuống lead. Mỗi bậc chia
cho một tỉ lệ, và tỉ lệ đó **lấy từ `/sales/config`**, không gõ vào màn.

```
   Doanh thu mục tiêu          3,20 tỷ      ← người đặt
        ÷ giá trị hợp đồng TB   800 tr      ← thước ở Cấu hình
   Hợp đồng cần                    4
        ÷ tỉ lệ SQL → hợp đồng     19%      ← thước
   Cơ hội (SQL) cần               22
        ÷ tỉ lệ MQL → SQL          68%      ← thước
   Công ty thật (MQL) cần         33
        ÷ tỉ lệ đầu mối → MQL      45%      ← thước
   ĐẦU MỐI CẦN                    74
        × giá mỗi đầu mối         1,8 tr    ← thước
   Ngân sách theo đơn giá        124 tr
   Ngân sách theo phân bổ thật    73 tr     ← cộng từ các ô việc bên dưới
```

Hai dòng ngân sách cuối cùng cố tình để cạnh nhau. Chỗ chênh giữa chúng là câu
trả lời cho _"tiền đang đi đúng chỗ không"_ — và ở kỳ T8 chỗ chênh đó chính là
cái gian hàng 145 tr.

### 4.2 · Ba kỳ, một màn, ba tab

Màn dùng `AppShell fill` — từ `lg` trở lên **không cuộn trang**, chỉ hai khối
chính tự cuộn bên trong, đúng như màn Chiến dịch đã làm.

| Tab                             | Trả câu hỏi                                          | Nội dung                                                                                        |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Kỳ trước · đã đóng**          | Kế hoạch vừa rồi ra sao, và thước mới là gì          | Thang: đặt vs đạt · bảng 7 nguồn · **tỉ lệ đo được → đây là thước cho kỳ sau**                  |
| **T8 · đang chạy** _(mặc định)_ | Đang thực hiện tới đâu                               | 5 ô tiến độ · thang đặt-vs-thực · **bảng ô việc** · chỉ tiêu chốt theo Sale · việc cần làm ngay |
| **T9 · nháp**                   | Kỳ tới cần bao nhiêu lead, tốn bao nhiêu, thu lại gì | Thang tính sống theo mục tiêu · đề xuất phân bổ có nút · gửi duyệt                              |

Mặc định mở tab **T8 · đang chạy** — người quản lý mở màn này để hỏi "đang tới
đâu" trước khi hỏi "tháng sau làm gì".

### 4.3 · Ô việc — chỗ kế hoạch đẻ ra việc cho cá nhân

Đây là cơ chế trung tâm, và là thứ hôm nay hoàn toàn không có.

Kế hoạch không chỉ là một cột số. Nó vỡ ra thành **ô việc** (`PlanSlot`): mỗi ô
có **loại** (chiến dịch · sự kiện · lead trực tiếp), **người nhận**, **kỳ vọng
bao nhiêu đầu mối**, **được tiêu bao nhiêu**. Ô việc bắt đầu **trống**. Cá nhân
_nhận_ ô bằng cách sang module 1 tạo một chiến dịch / sự kiện thật, hoặc mở lead
trực tiếp ở module 2 — và cái vừa tạo mang mã của ô việc.

Kế hoạch T8 · đặt 28/07 bởi Trần Thu Hà · **54 đầu mối · 190 tr**:

| Ô việc                                     | Loại           | Người nhận   | Kỳ vọng | Ngân sách  | Thực tế                                   |
| ------------------------------------------ | -------------- | ------------ | ------- | ---------- | ----------------------------------------- |
| Gian hàng triển lãm công nghiệp hỗ trợ     | sự kiện        | Vũ Minh Châu | 19      | 145 tr     | **SK-0106** · 11 đầu mối · tiêu đủ 145 tr |
| Chuỗi email — nhà máy dược & thiết bị y tế | chiến dịch     | Vũ Minh Châu | 15      | 20 tr      | **chưa ai tạo**                           |
| Webinar — truy xuất nguồn gốc theo lô      | sự kiện        | Vũ Minh Châu | 10      | 25 tr      | **chưa ai tạo**                           |
| BD tự mở — Quế Võ & Yên Phong              | lead trực tiếp | Lê Hoàng Nam | 6       | 0          | **chưa mở lead nào**                      |
| Khách cũ giới thiệu                        | lead trực tiếp | Trần Thu Hà  | 4       | 0          | **chưa có lead nào**                      |
|                                            |                |              | **54**  | **190 tr** | **11 · 145 tr**                           |

Ba ô trống là **nội dung**, không phải lỗi. Chúng nói ra điều đắt nhất trên màn:
_còn 14 ngày, 43 đầu mối chưa có đường nào về, và 45 tr chưa ai tiêu._ Ô trống
có nút **"Tạo chiến dịch cho ô này"** → sang `/sales/campaigns` ở chế độ tạo,
mang theo mã ô việc. Đó chính là câu "từ plan các cá nhân tạo events, campaign,
lead trực tiếp thuộc plan đó", dựng thành đường đi bấm được.

Kèm theo, **chỉ tiêu chốt chia cho từng Sale theo ngành** (kế hoạch xuống tới
người, không dừng ở phòng):

| Sale              | Ngành         | Hợp đồng | Doanh thu | Thực tế                     |
| ----------------- | ------------- | -------- | --------- | --------------------------- |
| Đỗ Quang Huy      | Chip          | 1        | 1,00 tỷ   | 0                           |
| Đặng Thanh Bình   | Cơ khí · Ô tô | 1        | 0,70 tỷ   | 0                           |
| Nguyễn Khánh Linh | Dược          | 1        | 0,70 tỷ   | **1 · HĐ-2716 · 0,70 tỷ** ✔ |

### 4.4 · Năm ô tiến độ — bài học nằm ở chỗ chúng lệch nhau

Hàng đầu tab "đang chạy", mỗi ô một thanh tiến độ:

| Thời gian            | Đầu mối         | Ngân sách            | Hợp đồng      | Doanh thu              |
| -------------------- | --------------- | -------------------- | ------------- | ---------------------- |
| 17/31 ngày · **55%** | 11/54 · **21%** | 145/190 tr · **76%** | 1/3 · **33%** | 0,70/2,40 tỷ · **29%** |

Năm con số này cạnh nhau nói được thứ mà năm cái bảng không nói được: **tiêu
nhanh hơn thời gian, ra lead chậm hơn thời gian.** Một cái liếc là xong.

### 4.5 · Tab "kỳ mới" — máy tính từ trên xuống

Mục tiêu doanh thu chỉnh theo bậc **800 tr = đúng một hợp đồng**, để người dùng
thấy ngay mô hình: 1,60 · 2,40 · **3,20** · 4,00 tỷ. Thang tính lại sống:

| Mục tiêu    | Hợp đồng | SQL    | MQL    | **Đầu mối cần** | Phân bổ đang có | Chênh       |
| ----------- | -------- | ------ | ------ | --------------- | --------------- | ----------- |
| 1,60 tỷ     | 2        | 11     | 17     | 38              | 69              | dư 31       |
| 2,40 tỷ     | 3        | 16     | 24     | 54              | 69              | dư 15       |
| **3,20 tỷ** | **4**    | **22** | **33** | **74**          | 69              | **thiếu 5** |
| 4,00 tỷ     | 5        | 27     | 40     | 89              | 69              | thiếu 20    |

Mặc định 3,20 tỷ → **thiếu 5 đầu mối**. Đó là chỗ màn dạy nghề: hoặc hạ tham
vọng, hoặc tìm thêm một đường. Một kế hoạch không bao giờ vừa khít.

Đề xuất phân bổ T9 — mỗi dòng là một khối AI có **"Căn cứ:"** rút từ số thật của
kỳ trước, có nút, không tự vào kế hoạch (luật 9):

| Ô việc đề xuất                             | Người        | Lead | Tiền  | Căn cứ                                                                      |
| ------------------------------------------ | ------------ | ---- | ----- | --------------------------------------------------------------------------- |
| Chuỗi email — nhà máy dược & thiết bị y tế | Vũ Minh Châu | 22   | 20 tr | CD-0101 chi 18 tr về 22 đầu mối — 0,82 tr/đầu mối, rẻ nhất kỳ               |
| Bài đa nền tảng — MES cho đóng gói chip    | Vũ Minh Châu | 18   | 26 tr | CD-0102 chi 26 tr về 18 đầu mối, 7 lead tốt                                 |
| Webinar — truy xuất nguồn gốc theo lô      | Vũ Minh Châu | 12   | 21 tr | SK-0104 là nguồn DUY NHẤT của kỳ vượt kỳ vọng (12 về / 11 đặt)              |
| Nuôi lại khách im — quý 3                  | Vũ Minh Châu | 9    | 6 tr  | CD-0105 rẻ nhất (6 tr) nhưng chỉ 1 lead tốt — lấy số lượng, đừng trông chất |
| BD tự mở — Quế Võ & Yên Phong              | Lê Hoàng Nam | 5    | 0     | TM kỳ trước về 5 đầu mối, 0 đồng                                            |
| Khách cũ giới thiệu                        | Trần Thu Hà  | 3    | 0     | GT về 7 đầu mối trong 3 tháng                                               |
| **Không đề xuất gian hàng triển lãm**      |              |      |       | SK-0106: 145 tr ra 3 lead tốt — **48,3 tr/lead tốt, gấp 9,7 lần kỳ trước**  |

Chọn hết: **69 đầu mối · 73 tr → ROI dự kiến 41 lần**, so với kế hoạch T8
12,6 lần và kỳ trước thực đạt 32,9 lần. Ba con số đó đứng cạnh nhau là toàn bộ
lý do màn này tồn tại.

Nút cuối cùng vẫn là **"Gửi Trần Thu Hà duyệt"**, không phải "chạy ngay" —
luật 9 không đổi.

---

## §5 · `/sales/config` — thước của cả phòng

### 5.1 · Từ bảy cột dọc thành bốn nhóm, mỗi nhóm một màn

Khung hai cột: rail trái liệt kê bốn nhóm (kèm chấm báo nhóm nào đang có thay
đổi chờ gửi), pane phải là nội dung nhóm đang chọn. `AppShell fill`, không cuộn
trang.

| Nhóm                          | Gom mục cũ            | Nội dung mới thêm                                   |
| ----------------------------- | --------------------- | --------------------------------------------------- |
| **A · Bộ câu hỏi lead**       | 5.1                   | **Phiên bản** + biểu đồ "chấm cả sổ bằng từng cổng" |
| **B · Ngưỡng & KPI theo vai** | 5.5 · 5.2 (hạn cột)   | **Toàn bộ bảng ngưỡng từng vai** — mới hoàn toàn    |
| **C · Tỉ lệ & con số**        | 5.6                   | **Tỉ lệ chuyển đổi dùng để lập kế hoạch** — sợi dây |
| **D · Hình dữ liệu**          | 5.2 · 5.3 · 5.4 · 5.7 | không thêm, chỉ nén lại                             |

Không mục nào bị bỏ. Mục 5.5 (ngưỡng SLA chưa ai đặt) **giữ nguyên ô trống có
chủ ý** — nó chuyển vào nhóm B, đứng cạnh những ngưỡng đã đặt, và như thế còn
nói to hơn.

### 5.2 · Nhóm A — bộ câu hỏi CÓ PHIÊN BẢN

Phiên bản dựng đúng theo lịch sử đã ghi trong `docs`, không bịa thêm bản nào:

| Bản                     | Hiệu lực      | Người đặt   | Cổng             | Đổi gì                                                                                                                                             |
| ----------------------- | ------------- | ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1**                  | 01/05 → 04/08 | Trần Thu Hà | đủ **10/10** ô   | Mở sổ. Đòi đủ mười ô mới cho lead vào pipeline.                                                                                                    |
| **v2** _(đang áp dụng)_ | từ 05/08      | Trần Thu Hà | **6 ô bắt buộc** | Bốn ô cuối — tiền · mốc · người ký · đang dùng gì — chỉ moi được sau khi Sale ngồi với khách. Bắt đủ mười trước khi giao là khoá cửa từ bên trong. |
| **v3** _(nháp)_         | chưa gửi      | —           | _tính sống_      | Chỉ xuất hiện khi có thay đổi đang chờ. Gửi duyệt = khai sinh v3.                                                                                  |

Con số làm cho phiên bản có nghĩa — **chấm lại cả sổ 100 dòng bằng từng cổng**:

```
   v1 · cổng 10/10 ô   ████                              16 lead qua
   v2 · cổng 6 ô       █████████                         34 lead qua   ← đang áp dụng
   v3 · nháp                          … tính sống khi người dùng lật ô …
```

Đây là thứ biến một trang cài đặt thành một quyết định: lật một ô là thấy ngay
bao nhiêu lead qua cổng hay rớt lại. Kèm câu hậu quả cụ thể theo ô vừa lật.

Mười câu, mỗi câu một **thanh tỉ lệ điền** — số có sẵn, chỉ chưa ai vẽ:

| #   | Câu                                       | Bắt buộc | Đã điền       |
| --- | ----------------------------------------- | -------- | ------------- |
| 1   | Công ty là ai — tên pháp nhân, mã số thuế | ✔        | ██████████ 90 |
| 2   | Ngành và sản phẩm chính                   | ✔        | ███████ 69    |
| 3   | Quy mô — số người, số nhà máy             | ✔        | ██████ 54     |
| 4   | Người liên hệ và chức danh                | ✔        | ████ 42       |
| 5   | Kênh liên lạc gọi lại được                | ✔        | ████ 38       |
| 6   | Đau ở đâu — việc khách muốn giải          | ✔        | ███ 34        |
| 7   | Đang dùng gì                              |          | ██████ **56** |
| 8   | Ai ký cuối, ai duyệt tiền                 |          | ███ 32        |
| 9   | Khoảng tiền                               |          | ██ 25         |
| 10  | Khi nào cần xong                          |          | ██ 16         |

Xếp cạnh nhau là lòi ra một điều không ai để ý: **ô 7 không bắt buộc mà 56 lead
đã điền — nhiều hơn cả ba ô bắt buộc cuối.** Đó đúng là loại phát hiện mà màn
cấu hình phải đưa lên tận mặt người quản lý.

### 5.3 · Nhóm B — ngưỡng KPI từng vai (phần mới nhất)

Hôm nay `CREDIT_RULES` chỉ có tên chỉ số. Thêm **ngưỡng đạt · ngưỡng cảnh báo ·
số đang là**, và vẽ mỗi dòng thành một thanh đo có hai vạch.

**Marketing · Vũ Minh Châu**

| Chỉ số                   | Đạt      | Cảnh báo dưới | Kỳ trước | T8 đang chạy  |
| ------------------------ | -------- | ------------- | -------- | ------------- |
| Đầu mối kéo về mỗi kỳ    | 50       | 35            | 89 ✔     | 11 ✕          |
| Tỉ lệ lead tốt           | 35%      | 25%           | 34,8% ~  | 27,3% ~       |
| Chi phí mỗi lead tốt     | ≤ 6,0 tr | > 10,0 tr     | 5,0 tr ✔ | **48,3 tr** ✕ |
| Đạt kỳ vọng lead của đợt | 90%      | 70%           | 109% ✔   | 58% ✕         |

**BD · Lê Hoàng Nam**

| Chỉ số                           | Đạt | Cảnh báo dưới | Đang là        |
| -------------------------------- | --- | ------------- | -------------- |
| Ô bắt buộc moi được mỗi lead     | 4,0 | 3,0           | 3,27 ~         |
| Lead xác minh là công ty thật    | 45% | 35%           | 44% ~          |
| Lead còn nằm kho chung           | ≤ 8 | > 15          | 12 ~           |
| Phản hồi trả ngược cho Marketing | 6   | 3             | _chưa đo được_ |

**Sale · ngưỡng chung, đo riêng ba người**

| Chỉ số                    | Đạt     | Cảnh báo | Huy     | Bình   | Linh       |
| ------------------------- | ------- | -------- | ------- | ------ | ---------- |
| Đơn ký mỗi kỳ             | 2       | 1        | 2 ✔     | 2 ✔    | 2 ✔        |
| Giá trị đơn ký            | 1,50 tỷ | 0,80 tỷ  | 3,15 ✔  | 1,07 ~ | 1,58 ✔     |
| Ngày trung bình ở một cột | ≤ 12    | > 20     | 8,5 ✔   | 11,7 ✔ | **18,7** ~ |
| Đơn đang mục              | 0       | > 1      | **2** ✕ | 1 ~    | 1 ~        |

**Presales · Phạm Diệu Anh** — hai chỉ số, cả hai _chưa đo được_: sổ chưa ghi
buổi demo như một sự kiện riêng. Đặt ngưỡng vẫn có nghĩa — nó là lời hứa của kỳ
sau và là lý do sổ phải ghi thêm. Nói thẳng, không giấu, không bịa số.

**TP Kinh doanh · Trần Thu Hà** — không có chỉ số cá nhân. Ô này hiện thẳng số
của phòng, đúng như bảng công trạng đã chốt.

Cuối nhóm B là **ngưỡng SLA**: năm cột của sổ cơ hội (đã có hạn) + hai bậc đầu
mối và MQL (**chưa ai đặt — ô trống có chủ ý**, 32 lead đang chạy không có hạn
nào để quá).

### 5.4 · Nhóm C — tỉ lệ & con số, sợi dây sang màn kế hoạch

| Thước                       | Đo được kỳ trước | Đang dùng để lập kế hoạch | Ghi chú                            |
| --------------------------- | ---------------- | ------------------------- | ---------------------------------- |
| Đầu mối → MQL               | 44,9%            | **45%**                   | kỳ trước đặt 47%, hụt, đã chỉnh    |
| MQL → SQL                   | 67,5%            | **68%**                   |                                    |
| SQL → hợp đồng              | 18,5%            | **19%**                   |                                    |
| Giá trị hợp đồng trung bình | 1,02 tỷ          | **800 tr**                | đặt thấp hơn có chủ ý — thận trọng |
| Giá mỗi đầu mối             | 1,74 tr          | **1,8 tr**                |                                    |

Ngay dưới bảng, một dòng chỉ đường: _"Năm con số này là thứ màn Số liệu & kế
hoạch dùng để chia ngược từ doanh thu xuống số lead. Đổi ở đây là đổi mọi kế
hoạch chưa gửi."_ Kèm phễu 100·44·30·19·11·6 vẽ thành hình phễu thật.

Và **hoa hồng 30/60/10** vẽ thành một thanh ba đoạn — tổng phải đúng 100, sai
thì chặn tại chỗ.

---

## §6 · Số phải thêm vào fixture

Đúng bốn nhóm, tất cả vào `packages/engines/src/fixtures/das-vina.ts` (một kịch
bản một file — đó là điều kiện để `aurora/no-scenario-mix` còn gác được), kèm
test khoá trong `scenario.test.ts`.

1. **`CONTRACTS`** — sáu hợp đồng đã ký, kèm giá trị. Hôm nay `contractCode` có
   mà tiền thì không, nên không màn nào nói được doanh thu.
   `HĐ-2711 1,25 tỷ · HĐ-2712 620 tr · HĐ-2713 880 tr · HĐ-2714 450 tr ·
HĐ-2715 1,90 tỷ · HĐ-2716 700 tr` → kỳ trước **5,10 tỷ**, T8 **0,70 tỷ**.
2. **`PLAN_PERIODS`** — ba kỳ, mỗi kỳ mang tên người đặt + ngày đặt + thang sáu
   bậc + danh sách ô việc. Số thực tế **không** nằm trong fixture: nó tính từ
   sổ lead bằng code, để không bao giờ lệch.
3. **`PLANNING_RATES`** — năm thước ở §5.4, có phiên bản.
4. **`QUESTION_SET_VERSIONS`** và **`ROLE_KPIS`** — §5.2 và §5.3.

---

## §7 · Việc phải làm, theo thứ tự

| #   | Việc                                                     | File                                         |
| --- | -------------------------------------------------------- | -------------------------------------------- |
| 1   | Thêm 4 nhóm dữ liệu vào fixture + test khoá              | `das-vina.ts` · `scenario.test.ts`           |
| 2   | Tầng dữ liệu màn kế hoạch: kỳ · thang · ô việc · tiến độ | `apps/web/src/data/plan.ts`                  |
| 3   | Tầng dữ liệu màn cấu hình: phiên bản · KPI · thước       | `apps/web/src/data/sales-config.ts`          |
| 4   | Component thiếu ở `@pv/ui` + trang kit                   | `packages/ui/src/**` · `apps/web/src/kit/**` |
| 5   | Dựng lại `/sales/plan` — 3 tab, fill layout              | `apps/web/src/pages/plan.tsx`                |
| 6   | Dựng lại `/sales/config` — 4 nhóm, hai cột               | `apps/web/src/pages/sales-config.tsx`        |
| 7   | Đường nối ô việc → màn Chiến dịch                        | `campaigns.tsx` · `routes.tsx`               |
| 8   | Viết lại test hai màn                                    | `plan.test.tsx` · `sales-config.test.tsx`    |
| 9   | `pnpm check` xanh · soát luật 12/13 bằng mắt · chụp màn  |                                              |

**Component có thể phải thêm vào `@pv/ui`** (quyết lúc dựng): thanh đo có hai
vạch ngưỡng, thanh nhiều đoạn cho hoa hồng, dải phiên bản, một bậc của thang kế
hoạch. Thêm cái nào thì thêm luôn một dòng trên `/kit` — component không có mặt
ở trang kit coi như chưa tồn tại.

---

## §8 · Ba chỗ cần gật trước khi code

1. **§2 — mở trục thời gian** với điều kiện "số kế hoạch phải mang tên người
   đặt". Đây là chỗ đi ngược `docs` hiện hành; `docs/kien-truc-san-pham.md` sẽ
   phải sửa theo.
2. **§3 — cắt kỳ theo ngày chạy của nguồn**, cho ra 89 + 11 = 100. Cách cắt
   khác (theo ngày lead vào sổ) cho ra 96 + 4, xấu và vô nghĩa.
3. **§6.1 — gán giá trị tiền cho sáu hợp đồng.** Đây là con số thật sự mới,
   không suy được từ gì đang có. Không có nó thì không màn nào nói được chữ
   "doanh thu", và cả kế hoạch từ trên xuống sụp mất bậc đầu tiên.
