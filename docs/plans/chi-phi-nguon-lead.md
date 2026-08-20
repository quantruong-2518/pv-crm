# Mô hình chi phí và đánh giá nguồn lead

Trạng thái: **NHÁP, chờ gật.** Viết 20/08/2026. Chưa sửa dòng code nào.

Câu người dùng đặt ra: _"lead đến từ đâu thì cũng có một chi phí tính ra được — ví
dụ lead từ prospect Apollo, 1000 lead là bao nhiêu tiền; mỗi nguồn lead phải có
đánh giá và chi phí THỰC TẾ được ghi nhận."_

Tài liệu này trả lời câu đó, và trả lời luôn một câu người dùng chưa hỏi nhưng
sẽ hỏi ngay sau: **con số đó có đủ chắc để xếp hạng nguồn không.** Câu trả lời
ngắn là **không** — và phần §5 chứng minh bằng số của chính fixture.

---

## §0 · Hai bệnh của mô hình hôm nay

`Source.cost` là **một cục tiền**. Chia cho `good` ra `costPerGood`. Hết.

| Bệnh                                                          | Bằng chứng                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Không có phân rã. Không ai biết 145 triệu của SK-0106 đi đâu  | `Source.cost: number` · `das-vina.ts:678`                                                                           |
| Không có chi phí nhân công. Hai nguồn "0 đồng" trông miễn phí | `GT` và `TM` đều `cost: 0` — trong khi TM là 60 giờ của BD                                                          |
| Không cắt được theo thời gian, và màn tự thú                  | `performance.tsx:1096` — _"chi phí của một nguồn không chia được theo ngày"_                                        |
| Xếp hạng bằng một số trung bình trên cỡ mẫu 5–22              | `plan.ts:151` `paidSourceCosts()` sort theo `costPerGood`; `plan.ts:228` sinh câu _"chênh 24 lần"_ từ mẫu số 3 và 9 |

Bệnh thứ tư là bệnh nặng nhất, vì nó không lộ ra: một bảng xếp hạng sai vẫn là
một bảng xếp hạng đẹp. §5 tính lại và cho thấy trong 15 cặp nguồn có tiền, **chỉ
5 cặp được phép nói ai rẻ hơn ai.**

---

## §1 · Sáu loại chi phí

| Mã     | Loại                | Gồm gì                                                                       | Cố định / biến đổi                                              | Gắn nguồn hay dùng chung                        | Phân bổ được không                                                  |
| ------ | ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| **L1** | Dữ liệu & danh sách | thuê bao Apollo, credit export, mua danh sách ngành, phí xác minh email      | thuê bao **cố định** theo tháng · credit **biến đổi** theo dòng | thuê bao dùng chung · credit gắn được vào nguồn | **Có** — khoá là credit tiêu (§2)                                   |
| **L2** | Kênh                | quảng cáo LinkedIn/Facebook, ZNS Zalo OA, gói gửi ESP                        | biến đổi theo lượt gửi / lượt hiển thị                          | gắn nguồn                                       | **Có** — hoá đơn nền tảng đã tách sẵn theo chiến dịch               |
| **L3** | Nội dung            | viết bài, thiết kế, quay dựng, chụp ảnh, dịch, landing                       | biến đổi theo số ấn phẩm; cố định nếu thuê agency theo tháng    | gắn nguồn — trừ ấn phẩm dùng lại                | **Có**, ấn phẩm dùng lại thì chia theo số đợt đã dùng (xem ghi chú) |
| **L4** | Sự kiện             | gian hàng, thi công, hội trường, ăn uống, đi lại, lưu trú, quà, máy check-in | phần lớn **cố định theo sự kiện**, không theo số người đến      | gắn đúng **một** nguồn                          | **Có**, hiển nhiên                                                  |
| **L5** | Công cụ             | ghế Sales Navigator, nền tảng webinar, bộ thiết kế, ghế CRM                  | cố định theo tháng                                              | **dùng chung cả phòng**                         | **Có nhưng bằng khoá quy ước** — chia theo số đợt (§2)              |
| **L6** | Nhân công           | giờ Marketing · BD · TP Kinh doanh × đơn giá giờ                             | cố định (lương) nhưng **đo được như biến đổi** (bảng giờ)       | gắn nguồn qua bảng giờ                          | **Có nếu có bảng giờ.** Hôm nay CHƯA CÓ → toàn bộ giờ là **số ĐẶT** |

**Ghi chú về L3 dùng lại.** Một video quay một lần rồi chạy ở ba đợt phải khấu
hao theo số đợt đã dùng, không gánh hết vào đợt đầu. Trong kỳ 01/05 → 17/08
**chưa có ấn phẩm nào dùng lại**, nên câu hỏi này chưa phát sinh — nhưng luật
phải có mặt trước, vì lần đầu tái sử dụng sẽ là lần đầu một nguồn bị chấm đắt oan.

**Ghi chú về L6 và con số 300 triệu.** L6 **KHÔNG** nằm trong 300 triệu. Xem §6.

---

## §2 · Phân bổ thuê bao → lô danh sách → nguồn

### 2.1 · Ba lựa chọn khoá phân bổ

| #   | Khoá                    | Nghĩa                                                            | Ưu                                      | Nhược                                                                                                              |
| --- | ----------------------- | ---------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| a   | **Theo credit tiêu**    | mỗi dòng export trừ 1 credit; đơn giá = giá gói ÷ credit của gói | khớp đúng đơn vị nhà cung cấp tính tiền | credit mua rồi không dùng không có chỗ đứng — phải xử riêng                                                        |
| b   | Theo dòng **dùng thật** | chỉ tính dòng thực sự vào chiến dịch, bỏ dòng export rồi loại    | nghe công bằng nhất                     | **chuyển chi phí chọn danh sách kém sang không ai cả.** Export bừa 5.000 dòng, dùng 500 → nguồn trông rẻ bằng 1/10 |
| c   | Chia đều theo kỳ        | giá gói ÷ số nguồn (hoặc số đợt) trong kỳ                        | không cần đo gì                         | nguồn không export dòng nào vẫn phải gánh                                                                          |

**Chọn (a) cho L1 · dữ liệu, chọn (c) theo số ĐỢT cho L5 · công cụ.**

Lý do (a) cho dữ liệu: credit là **thứ nhà cung cấp trừ**. Đo bằng bất cứ gì
khác thì tổng phân bổ không bao giờ khớp hoá đơn, và một mô hình chi phí không
khớp hoá đơn là một mô hình sẽ bị bỏ ngay lần đối chiếu đầu tiên.

Lý do bác (b): nó xoá mất chi phí của một quyết định sai. **(b) vẫn dùng — nhưng
làm CHỈ SỐ CHẤT LƯỢNG DANH SÁCH (`tỉ lệ dòng dùng được`), không làm khoá phân bổ.**

Lý do (c) cho công cụ: ghế Sales Navigator và nền tảng webinar tiêu theo **thời
gian**, không theo dòng. Chia theo dòng thì một chiến dịch email gánh hết tiền
ghế LinkedIn — sai hẳn nghĩa. Số đợt là thước gần nhất với "nguồn này chiếm bao
nhiêu công suất của bộ công cụ trong kỳ".

### 2.2 · Credit mua rồi không dùng — chi phí chìm đi đâu

Ba lựa chọn: (i) chia cho các nguồn đã dùng · (ii) treo ở một khoản của phòng ·
(iii) bỏ qua.

**Chọn (ii): treo ở khoản của phòng, tên là "Credit đã mua chưa dùng", KHÔNG
chia xuống nguồn.**

Vì credit thừa là kết quả của một quyết định **mua gói**, không phải của một
chiến dịch. Chia nó xuống nguồn thì nguồn bị chấm điểm vì một quyết định nó
không tham gia, và tệ hơn: **tháng nào phòng mua dư thì mọi nguồn tự dưng đắt lên
mà không ai làm gì sai.** Khoản đó là thước của người mua gói (TP Kinh doanh),
không phải của người chạy đợt.

(iii) bị bác thẳng: bỏ qua thì tổng phân bổ nhỏ hơn tiền thật ra khỏi tài khoản,
và CAC cấp phòng bị thổi đẹp.

Hệ quả phải nói ra: **khoản chìm nằm NGOÀI 300 triệu.** Xem §6.3 — đây là một
trong ba chỗ cần người gật.

### 2.3 · Đơn giá tra được, có nguồn

Tra ngày **20/08/2026**. Tỷ giá quy đổi: **26.400 đ/USD** — Vietcombank bán ra
18/08/2026 ([Báo Văn Hoá](https://baovanhoa.vn/kinh-te/ti-gia-usd-hom-nay-1882026-vietcombank-ban-ra-quanh-26400-dong-256922.html)).

**Apollo.io** — nguồn: [Saleshandy · Apollo.io Pricing 2026](https://www.saleshandy.com/blog/apolloio-pricing/)
(bảng giá chính thức trên apollo.io/pricing không đọc được bằng máy, trang tải
bằng JS — con số dưới đây lấy từ bài phân tích, cần đối chiếu lại khi mua thật).

| Gói              | Giá/ghế/tháng (trả năm)                | Export credit/tháng | Đồng/credit  | **Đồng/1.000 dòng** |
| ---------------- | -------------------------------------- | ------------------- | ------------ | ------------------- |
| Free             | 0                                      | 10                  | 0            | —                   |
| Basic            | $49                                    | 1.000               | **1.293,60** | **1.293.600**       |
| **Professional** | **$79**                                | **2.000**           | **1.042,80** | **1.042.800**       |
| Organization     | $119 (tối thiểu 3 ghế)                 | 4.000               | **785,40**   | **785.400**         |
| Mua lẻ (overage) | $0,20/credit, tối thiểu 250 credit/lần | —                   | **5.280,00** | **5.280.000**       |

Phép tính, kiểm được: `$79 × 26.400 = 2.085.600 đ/tháng ÷ 2.000 credit =
1.042,80 đ/credit`.

> **Con số đắt nhất của bảng này:** mua credit lẻ đắt **5,06 lần** gói
> Professional (5.280 ÷ 1.042,80) và **6,72 lần** gói Organization. Một mô hình
> chi phí không nhìn thấy chỗ này sẽ để phòng trả gấp năm lần mà không ai biết.

**LinkedIn Sales Navigator** — nguồn:
[Cleanlist · Sales Navigator Pricing 2026](https://www.cleanlist.ai/blog/2026-05-08-linkedin-sales-navigator-pricing-guide)
· [Overloop](https://overloop.com/blog/linkedin-sales-navigator-pricing).

| Gói           | Giá/ghế/tháng              | Export dòng?                        |
| ------------- | -------------------------- | ----------------------------------- |
| Core          | $99                        | **Không.** 0 email, 0 số điện thoại |
| Advanced      | $149                       | **Không**                           |
| Advanced Plus | ~$1.600/năm, báo giá riêng | **Không**                           |

**Không quy ra được đồng/1.000 dòng, và đó là kết luận chứ không phải chỗ
thiếu.** Sales Navigator bán **quyền tìm và xem**, không bán dòng dữ liệu. Vì thế
nó thuộc **L5 · công cụ** (phân bổ theo thời gian), không thuộc L1.

> **Không xác minh được:** giá Core dao động $89,99 – $119,99/tháng tuỳ nguồn tra
> và tuỳ vùng; LinkedIn không giữ một bảng giá công khai ổn định. Con số $99 dùng
> trong tài liệu này là **số ĐẶT**, phải đối chiếu bằng báo giá thật trước khi ký.

**Dữ liệu doanh nghiệp Việt Nam** — nguồn:
[Vietdata · Bảng giá dữ liệu](https://demo-macro.vietdata.vn/b%E1%BA%A3ng-gi%C3%A1-d%E1%BB%AF-li%E1%BB%87u)
· [Vietdata · Các gói dữ liệu lẻ](https://www.vietdata.vn/vi/data-sets).

| Gói                            | Giá                            | Số dòng doanh nghiệp |
| ------------------------------ | ------------------------------ | -------------------- |
| Báo cáo ngành (BC003)          | 5 triệu đ/năm                  | không công bố        |
| Truy cập dữ liệu (Account001)  | 7 triệu đ/năm                  | không công bố        |
| Dữ liệu + báo cáo (Account002) | 11 triệu đ/năm                 | không công bố        |
| Truy cập hệ thống (Account003) | 99 triệu đ/năm, tối đa 5 người | không công bố        |

> **KHÔNG XÁC MINH ĐƯỢC đồng/1.000 dòng cho nguồn dữ liệu VN.** Vietdata công bố
> giá gói nhưng không công bố số dòng doanh nghiệp mỗi gói cho phép lấy ra, nên
> phép chia không thực hiện được. Các nơi bán "file data doanh nghiệp" trên
> Google Sites không có bảng giá công khai và không có pháp nhân kiểm được — **không
> đưa vào mô hình.** Đây là một ô trống có chủ ý: cần một báo giá thật trước khi
> điền.

### 2.4 · Trả lời thẳng: "Apollo, 1.000 lead là bao nhiêu tiền"

Chuỗi sáu bước. Mọi số kiểm được.

```
  BƯỚC 1 · gói → credit
     $79/ghế/tháng × 26.400 = 2.085.600 đ ÷ 2.000 credit = 1.042,80 đ/credit
     làm tròn tới 100 đ → ĐƠN GIÁ DÙNG TRONG FIXTURE: 1.000 đ/dòng

  BƯỚC 2 · credit → dòng prospect        1 dòng export = 1 credit
     ►  1.000 dòng prospect = 1.000.000 đ

  BƯỚC 3 · dòng → dòng GỬI ĐƯỢC
     tỉ lệ hỏng/không xác minh được: 12%   (số ĐẶT, chưa ai đo)
     phí xác minh 300 đ/dòng → 1.000 × 300 = 300.000 đ
     ►  (1.000.000 + 300.000) ÷ 880 = 1.477,27 đ / dòng gửi được

  BƯỚC 4 · dòng → lead          tỉ lệ ĐO ĐƯỢC của CD-0101
     22 lead / 1.200 dòng danh sách lạnh = 1,8333%
     ►  1.000 dòng ra 18,3 lead

  BƯỚC 5 · chi phí DỮ LIỆU mỗi lead
     ►  1.300.000 ÷ 18,33 = 70.909 đ / lead

  BƯỚC 6 · chi phí ĐẦY ĐỦ mỗi lead của chính đường đó
     CD-0101: 18.000.000 ÷ 22 = 818.182 đ / lead
     ►  tiền dữ liệu chỉ chiếm 1.560.000 / 18.000.000 = 8,67% chi của nguồn
```

**Kết luận: "1.000 lead từ Apollo giá bao nhiêu" là câu hỏi sai đơn vị.** Apollo
không bán lead, nó bán **dòng**. Đổi sang đơn vị đúng:

| Muốn có             | Cần bao nhiêu dòng Apollo | Tiền DỮ LIỆU      | Tiền TẤT CẢ (theo CPL của CD-0101) |
| ------------------- | ------------------------- | ----------------- | ---------------------------------- |
| 1.000 dòng prospect | 1.000                     | 1.300.000 đ       | —                                  |
| **1.000 đầu mối**   | **54.545**                | **70.908.500 đ**  | **818.182.000 đ**                  |
| **1.000 lead tốt**  | **133.333**               | **173.333.000 đ** | **2.000.000.000 đ**                |

Phép tính: `1.000 ÷ 0,018333 = 54.545 dòng`; `54.545 × 1.300 = 70.908.500`;
`1.000 × 818.182 = 818.182.000`. Lead tốt: tỉ lệ qua cổng của CD-0101 là
`9/22 = 40,91%` → `1.000 ÷ 0,4091 = 2.444 lead` → `2.444 ÷ 0,018333 = 133.333 dòng`;
tiền tất cả `1.000 × 2.000.000 = 2 tỷ`.

Và một cái bẫy phải nói ra: **54.545 credit không mua lẻ được.** Mua lẻ ở
$0,20 thì `54.545 × 5.280 = 287.997.600 đ` — gấp **4,06 lần** con số 70,9 triệu ở
trên. Muốn đơn giá 1.000 đ/dòng thì phải mua **27,3 tháng-ghế** Professional, tức
phải trải chiến dịch ra hơn hai năm hoặc mua nhiều ghế cùng lúc.

> **Cảnh báo cỡ mẫu, bắt buộc hiện kèm ba con số trên.** Tỉ lệ 40,91% của CD-0101
> đứng trên 22 lead. Khoảng tin cậy 95% của nó là **[23,26% ; 61,27%]** (§5.2).
> Nên "1.000 lead tốt" thật ra cần từ **89.031 tới 234.548 dòng** — chênh nhau
> **2,63 lần**. Ba con số trong bảng là điểm giữa của một khoảng rất rộng, không
> phải một dự toán.

---

## §3 · Phân rã 300 triệu — cộng khớp từng nguồn

**Ràng buộc bất di bất dịch:** `Source.cost` của tám nguồn giữ NGUYÊN, tổng
**300.000.000 đ**. Mọi dòng chi tiết dưới đây cộng lại đúng bằng số cũ.
`scenario.test.ts` không đỏ một ca nào.

Ba đơn giá dùng chung cho cả bảng (**số ĐẶT** — xem §9):
`dòng Apollo 1.000 đ` · `xác minh email 300 đ/dòng` · `pool công cụ 940.000 đ/đợt`.

**Pool công cụ dùng chung: 18.800.000 đ**, chia cho **20 đợt** đã chạy trong kỳ.

| Dòng của pool                                 | Tiền              |
| --------------------------------------------- | ----------------- |
| Sales Navigator Core · 1 ghế × 4 tháng ($396) | 10.450.000 đ      |
| Bộ thiết kế · 4 tháng                         | 3.500.000 đ       |
| Ghế CRM cho Marketing · 4 tháng               | 4.850.000 đ       |
| **Tổng pool**                                 | **18.800.000**    |
| ÷ 20 đợt                                      | **940.000 đ/đợt** |

Apollo **không** nằm trong pool — nó tính thẳng vào L1 theo credit tiêu (§2.1),
để không tính hai lần.

### CD-0101 · Chuỗi email nhà máy điện tử Bắc Ninh · **18.000.000**

| Loại | Dòng                                         | Tính                 | Tiền             |
| ---- | -------------------------------------------- | -------------------- | ---------------- |
| L1   | Danh sách Apollo — đợt mở màn                | 1.200 dòng × 1.000 đ | 1.200.000        |
| L1   | Xác minh email                               | 1.200 dòng × 300 đ   | 360.000          |
| L2   | Gói gửi ESP · 3 tháng                        |                      | 3.300.000        |
| L2   | Gói ZNS Zalo OA · đợt 3                      | gói 2.000 tin        | 600.000          |
| L2   | Quảng cáo dẫn lại                            |                      | 3.000.000        |
| L3   | Nội dung 3 đợt · thư + bản so sánh + landing |                      | 6.720.000        |
| L5   | Công cụ dùng chung                           | 3 đợt × 940.000      | 2.820.000        |
|      | **Tổng**                                     |                      | **18.000.000** ✔ |

### CD-0102 · Bài đa nền tảng MES cho đóng gói chip · **26.000.000**

| Loại | Dòng                                                | Tính            | Tiền             |
| ---- | --------------------------------------------------- | --------------- | ---------------- |
| L1   | _(không mua dòng nào — chạy trên bài đăng)_         | 0 dòng          | 0                |
| L2   | Quảng cáo LinkedIn · reach 8.400                    |                 | 8.000.000        |
| L2   | Quảng cáo Facebook · reach 6.800                    |                 | 4.000.000        |
| L2   | Đẩy bài Zalo OA · 5.100                             |                 | 2.000.000        |
| L2   | ESP thư nhắc đợt 4 · 900 lượt                       |                 | 500.000          |
| L3   | Nội dung 4 ấn phẩm · bài dài, bài ngắn, bộ ảnh, thư |                 | 7.740.000        |
| L5   | Công cụ dùng chung                                  | 4 đợt × 940.000 | 3.760.000        |
|      | **Tổng**                                            |                 | **26.000.000** ✔ |

### SK-0103 · Hội thảo Số hoá nhà máy đóng gói · **84.000.000**

| Loại | Dòng                                  | Tính               | Tiền             |
| ---- | ------------------------------------- | ------------------ | ---------------- |
| L1   | Danh sách mời Apollo                  | 640 dòng × 1.000 đ | 640.000          |
| L2   | ESP + ZNS mời và nhắc                 |                    | 1.000.000        |
| L3   | Slide, thư mời, tài liệu phát tay     |                    | 6.000.000        |
| L4   | Thuê hội trường + âm thanh + màn hình | nửa ngày           | 28.000.000       |
| L4   | Ăn giữa giờ                           | 78 người × 250.000 | 19.500.000       |
| L4   | Quà + túi tài liệu                    | 120 bộ × 150.000   | 18.000.000       |
| L4   | Đi lại + dựng khu trưng bày tại chỗ   |                    | 7.100.000        |
| L5   | Công cụ dùng chung                    | 4 đợt × 940.000    | 3.760.000        |
|      | **Tổng**                              |                    | **84.000.000** ✔ |

### SK-0104 · Webinar Giá thành theo lệnh sản xuất · **21.000.000**

| Loại | Dòng                                    | Tính               | Tiền             |
| ---- | --------------------------------------- | ------------------ | ---------------- |
| L1   | Danh sách mời Apollo                    | 980 dòng × 1.000 đ | 980.000          |
| L2   | ESP mời + nhắc + gửi bản ghi            |                    | 700.000          |
| L2   | ZNS nhắc trước 1 giờ                    | 86 tin             | 100.000          |
| L3   | Slide + dựng lại bản ghi + ảnh bìa      |                    | 7.940.000        |
| L4   | Quà cho người dự                        | 51 phần × 60.000   | 3.060.000        |
| L5   | Nền tảng webinar · gói 3 tháng, 500 chỗ |                    | 5.400.000        |
| L5   | Công cụ dùng chung                      | 3 đợt × 940.000    | 2.820.000        |
|      | **Tổng**                                |                    | **21.000.000** ✔ |

### CD-0105 · Nuôi lại khách im quý 2 · **6.000.000**

| Loại | Dòng                                            | Tính            | Tiền            |
| ---- | ----------------------------------------------- | --------------- | --------------- |
| L1   | **Danh sách: 0 đ — sổ cũ của phòng, không mua** |                 | **0**           |
| L2   | ESP 3 đợt · 885 lượt                            |                 | 500.000         |
| L2   | ZNS đợt 3 · 282 tin                             |                 | 180.000         |
| L3   | 3 thư, viết trong nhà                           |                 | 2.500.000       |
| L5   | Công cụ dùng chung                              | 3 đợt × 940.000 | 2.820.000       |
|      | **Tổng**                                        |                 | **6.000.000** ✔ |

> Dòng đầu của bảng này là dòng đáng giá nhất cả §3: **CD-0105 rẻ vì nó không
> mua dữ liệu.** Hôm nay màn chỉ nói "6 triệu"; sau khi phân rã, nó nói được
> _vì sao_ 6 triệu — và nói luôn rằng đường đó **không nhân lên được**, vì sổ cũ
> của phòng chỉ có 310 người.

### SK-0106 · Triển lãm công nghiệp hỗ trợ · gian hàng · **145.000.000**

| Loại | Dòng                                          | Tính                 | Tiền              |
| ---- | --------------------------------------------- | -------------------- | ----------------- |
| L1   | Danh sách mời trước Apollo                    | 1.400 dòng × 1.000 đ | 1.400.000         |
| L2   | ESP thư mời + thư sau hội chợ                 |                      | 600.000           |
| L3   | Backdrop, standee, tờ rơi, video màn hình     |                      | 18.000.000        |
| L4   | Thuê gian hàng 18 m² (ban tổ chức)            |                      | 72.000.000        |
| L4   | Thi công gian + điện nước                     |                      | 26.000.000        |
| L4   | Vận chuyển + lưu trú 3 ngày · 3 người         |                      | 11.000.000        |
| L4   | Quà tại gian                                  | 143 phần × 80.000    | 11.440.000        |
| L5   | Máy quét mã + phần mềm check-in · thuê 3 ngày |                      | 1.740.000         |
| L5   | Công cụ dùng chung                            | 3 đợt × 940.000      | 2.820.000         |
|      | **Tổng**                                      |                      | **145.000.000** ✔ |

### GT · Khách cũ giới thiệu · **0** · TM · BD tự mở · **0**

Không có dòng L1–L5 nào. Tiền mặt bằng 0 là **đúng**. Nhưng cả hai đều có L6 —
xem §4, và đó là chỗ mô hình hôm nay nói sai.

### Cộng ngang cả kỳ

| Loại        | Tiền              | Phần      |
| ----------- | ----------------- | --------- |
| L1 Dữ liệu  | 4.580.000         | **1,5%**  |
| L2 Kênh     | 24.480.000        | 8,2%      |
| L3 Nội dung | 48.900.000        | 16,3%     |
| L4 Sự kiện  | **196.100.000**   | **65,4%** |
| L5 Công cụ  | 25.940.000        | 8,6%      |
| **Tổng**    | **300.000.000** ✔ | **100%**  |

> **Câu người dùng hỏi là về 1,5% ngân sách.** Chi phí dữ liệu — thứ ai cũng nghĩ
> tới đầu tiên khi nghe "lead từ Apollo giá bao nhiêu" — là dòng NHỎ NHẤT của cả
> bảng. Hai phần ba tiền của phòng nằm ở **sự kiện**, và 92% của khối đó
> (180,44/196,1 triệu) nằm ở đúng **hai** nguồn: SK-0103 và SK-0106. Bảng phân rã
> vừa trả lời câu hỏi vừa chỉ ra rằng nó không phải câu hỏi quan trọng nhất.

---

## §4 · Lớp L6 · nhân công — lớp THỨ HAI, không cộng vào 300 triệu

Đơn giá giờ (**số ĐẶT**, chi phí sử dụng lao động chứ không phải lương gross):

| Vai           | Người        | Đồng/giờ | Quy ra tháng (176 giờ) |
| ------------- | ------------ | -------- | ---------------------- |
| Marketing     | Vũ Minh Châu | 180.000  | 31.680.000             |
| BD            | Lê Hoàng Nam | 150.000  | 26.400.000             |
| TP Kinh doanh | Trần Thu Hà  | 300.000  | 52.800.000             |

Giờ theo nguồn (**số ĐẶT** — hôm nay chưa có bảng giờ nào trong hệ):

| Nguồn    | Giờ MKT | Giờ BD  | Giờ TP | L6 (đ)         | Tiền mặt (đ)    | **Chi đầy đủ (đ)** |
| -------- | ------- | ------- | ------ | -------------- | --------------- | ------------------ |
| CD-0101  | 24      | 11      | 0      | 5.970.000      | 18.000.000      | 23.970.000         |
| CD-0102  | 40      | 9       | 0      | 8.550.000      | 26.000.000      | 34.550.000         |
| SK-0103  | 64      | 16      | 8      | 16.320.000     | 84.000.000      | 100.320.000        |
| SK-0104  | 32      | 6       | 0      | 6.660.000      | 21.000.000      | 27.660.000         |
| CD-0105  | 18      | 0       | 4      | 4.440.000      | 6.000.000       | 10.440.000         |
| SK-0106  | 96      | 24      | 16     | 25.680.000     | 145.000.000     | 170.680.000        |
| **GT**   | 0       | 0       | 14     | **4.200.000**  | **0**           | **4.200.000**      |
| **TM**   | 0       | 60      | 0      | **9.000.000**  | **0**           | **9.000.000**      |
| **Tổng** | **274** | **126** | **42** | **80.820.000** | **300.000.000** | **380.820.000**    |

Kiểm: `274 × 180.000 = 49.320.000` · `126 × 150.000 = 18.900.000` ·
`42 × 300.000 = 12.600.000` → `80.820.000` ✔

**Vì sao L6 là lớp riêng chứ không khoét vào 300 triệu.** Con số 300 triệu đã bị
`scenario.test.ts` và cả `docs/plans/ke-hoach-va-cau-hinh.md §3` khoá; nó là
**tiền mặt đã ra khỏi tài khoản**. Khoét nhân công vào trong nghĩa là đổi định
nghĩa của một con số đã chốt mà không đổi con số — kiểu sai nguy hiểm nhất, vì
không test nào bắt được. Vì thế:

- `Source.cost` giữ nguyên tên, nguyên giá trị, **nghĩa là tiền mặt**.
- `labourCost` là trường MỚI, cộng vào ra `fullCost`.
- **Không nhãn nào được ghi "chi phí" trần trụi.** Phải là "chi tiền mặt" hoặc
  "chi đầy đủ", và hai chỉ số không bao giờ đứng cùng một cột.

**Hai con số L6 làm đổi câu chuyện ngay lập tức:**

> Hai nguồn "0 đồng" không miễn phí. **GT tốn 4,2 triệu · TM tốn 9 triệu.**
> Tính theo chi đầy đủ trên lead tốt: **GT là nguồn RẺ NHẤT cả sổ — 1.400.000 đ**
> (4.200.000 ÷ 3), rẻ hơn CD-0101 (2.663.333 đ). Còn **TM đắt hơn CD-0102**:
> 9.000.000 đ cho một lead tốt duy nhất.
> Mô hình hôm nay in "0 đồng" cho cả hai và không nói được điều nào trong hai
> điều đó.

CAC cả phòng: tiền mặt `300.000.000 ÷ 6 = 50.000.000 đ/hợp đồng`; đầy đủ
`380.820.000 ÷ 6 = 63.470.000 đ/hợp đồng`.

---

## §5 · Bộ chỉ số

### 5.1 · Bảng công thức

| Chỉ số                   | Công thức                                      | Đơn vị     | Mẫu số lấy ở đâu                            | Đo được hôm nay?                                                                                       |
| ------------------------ | ---------------------------------------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **CPP** chi phí/prospect | `Σ L1 của nguồn ÷ số dòng export`              | đ/dòng     | credit tiêu — trường `listRows` **CHƯA CÓ** | **Chưa.** Phải thêm `listRows` vào `Source`                                                            |
| **CPL** chi phí/đầu mối  | `cost ÷ leads`                                 | đ/lead     | `Source.leads`                              | **Được**                                                                                               |
| CPL đầy đủ               | `(cost + labourCost) ÷ leads`                  | đ/lead     | như trên                                    | **Được** sau khi thêm L6                                                                               |
| **Chi phí/MQL**          | `cost ÷ COUNT(lead của nguồn có tier ≥ mql)`   | đ/MQL      | `LEADS.tier` — 44 dòng cả sổ                | **Được**                                                                                               |
| **Chi phí/lead tốt**     | `cost ÷ COUNT(requiredFilled ≥ 6)`             | đ/lead tốt | `sourceStats.good` — 34 dòng                | **Được** (chính là `costPerGood` hôm nay)                                                              |
| **Chi phí/SQL**          | `cost ÷ COUNT(lead của nguồn có tier = 'sql')` | đ/SQL      | 30 dòng cả sổ                               | **Được**                                                                                               |
| **CAC** chi phí/hợp đồng | `cost ÷ COUNT(lead của nguồn có contractCode)` | đ/hợp đồng | `sourceStats.signed` — 6 dòng               | **Được về phép tính, VÔ NGHĨA về thống kê**: mẫu số là 0 hoặc 1 ở mọi nguồn                            |
| **ROAS**                 | `Σ giá trị hợp đồng từ nguồn ÷ cost`           | lần        | giá trị 6 hợp đồng                          | **KHÔNG.** `contractCode` có mã, không có tiền — `campaigns.ts` `OPEN_VALUE.signedHasAmount: false`    |
| **ROI**                  | `(doanh thu − chi) ÷ chi`                      | lần        | như trên                                    | **KHÔNG** — cùng lý do                                                                                 |
| **Thời gian hoàn vốn**   | `cost ÷ (doanh thu thu về mỗi tháng từ nguồn)` | tháng      | lịch thu tiền                               | **KHÔNG.** Hợp đồng chỉ có ngày ký, không có lịch thu                                                  |
| **LTV**                  | `giá trị hợp đồng × số kỳ gia hạn × biên gộp`  | đ          | lịch sử gia hạn                             | **KHÔNG.** DAS Vina là kịch bản khách **CHƯA MUA**; lấy LTV từ Sao Đỏ là phạm `aurora/no-scenario-mix` |

Bốn chỉ số cuối mở khoá cùng lúc, bằng đúng một việc: **`CONTRACTS` với giá trị
tiền**, đã xin gật ở `docs/plans/ke-hoach-va-cau-hinh.md §6.1`. Cho tới lúc đó
màn phải in "chưa đo được", **không in ROI ước lượng.**

### 5.2 · Số hiện tại của tám nguồn (tiền mặt)

| Nguồn     | Chi (đ)         | Lead    | CPL           | MQL+   | Chi/MQL       | SQL    | Chi/SQL        | Tốt    | **Chi/tốt**   | Ký    | CAC            |
| --------- | --------------- | ------- | ------------- | ------ | ------------- | ------ | -------------- | ------ | ------------- | ----- | -------------- |
| CD-0101   | 18.000.000      | 22      | 818.182       | 11     | 1.636.364     | 8      | 2.250.000      | 9      | 2.000.000     | 1     | 18.000.000     |
| CD-0102   | 26.000.000      | 18      | 1.444.444     | 9      | 2.888.889     | 6      | 4.333.333      | 7      | 3.714.286     | 1     | 26.000.000     |
| SK-0103   | 84.000.000      | 16      | 5.250.000     | 7      | 12.000.000    | 5      | 16.800.000     | 6      | 14.000.000    | 1     | 84.000.000     |
| SK-0104   | 21.000.000      | 12      | 1.750.000     | 6      | 3.500.000     | 4      | 5.250.000      | 4      | 5.250.000     | 1     | 21.000.000     |
| CD-0105   | 6.000.000       | 9       | 666.667       | 2      | 3.000.000     | 1      | 6.000.000      | 1      | 6.000.000     | 0     | —              |
| SK-0106   | 145.000.000     | 11      | 13.181.818    | 4      | 36.250.000    | 3      | 48.333.333     | 3      | 48.333.333    | 1     | 145.000.000    |
| GT        | 0               | 7       | 0             | 4      | 0             | 3      | 0              | 3      | 0             | 1     | 0              |
| TM        | 0               | 5       | 0             | 1      | 0             | 0      | —              | 1      | 0             | 0     | —              |
| **Phòng** | **300.000.000** | **100** | **3.000.000** | **44** | **6.818.182** | **30** | **10.000.000** | **34** | **8.823.529** | **6** | **50.000.000** |

Bốn cột `Lead · MQL+ · SQL · Tốt` cộng ra `100 · 44 · 30 · 34`, khớp đúng
`FUNNEL` và số lead tốt của `ke-hoach-va-cau-hinh.md §3`. Đã kiểm bằng cách đọc
lại `ROWS` + `SOURCE_PLAN`.

> Một phát hiện rơi ra từ chính bảng này: **chi/lead tốt (8.823.529) rẻ hơn
> chi/SQL (10.000.000)** vì lead tốt có 34 mà SQL chỉ có 30. **Bốn lead đã qua
> cổng mà chưa ai nhận vào sổ cơ hội** — LD-0131 Cơ khí Mai Linh · LD-0132 Điện tử
> Sao Việt · LD-0133 Dược Tân Phát · LD-0142 Điện tử Tân Cảng. Đó là tồn kho có
> tiền đứng sau, và hôm nay không màn nào đếm nó.

---

## §6 · Phần thống kê

Đây là phần trả lời câu "xếp hạng nguồn có đứng vững không".

### 6.1 · Cỡ mẫu — cần bao nhiêu lead mới được kết luận

Ba câu hỏi khác nhau, ba ngưỡng khác nhau.

**(1) Muốn biết tỉ lệ lead tốt của MỘT nguồn với sai số ±10 điểm phần trăm.**

```
   n ≈ z² · p(1−p) / e²  =  1,96² × 0,34 × 0,66 / 0,10²  =  3,8416 × 0,2244 / 0,01  =  86,2
   ► cần 87 lead từ một nguồn.
```

Kiểm bằng Wilson: ở `n = 87, p̂ = 0,34` nửa khoảng là **9,76 pp** ✔.
Ở `n = 22` (nguồn LỚN NHẤT của phòng) nửa khoảng là **18,4 pp**.

| Sai số muốn có | n cần |
| -------------- | ----- |
| ±20 pp         | 22    |
| ±15 pp         | 39    |
| ±10 pp         | 87    |
| ±5 pp          | 345   |

**(2) Muốn CHỨNG MINH nguồn A khác nguồn B.** Kiểm định hai tỉ lệ, 95%, lực 80%:

```
   n/nhóm = [ z_{α/2}·√(2p̄q̄) + z_β·√(p₁q₁+p₂q₂) ]² / (p₁−p₂)²
```

| So sánh              | n mỗi nguồn |
| -------------------- | ----------- |
| 40% vs 25%           | **152**     |
| 40% vs 20% (gấp đôi) | **82**      |

> **Đây là con số sắc nhất của cả tài liệu.** Để chứng minh một nguồn 40% khác
> một nguồn 25%, mỗi nguồn cần **152 lead**. Nguồn lớn nhất của phòng có **22**.
> Cả sổ có **100**. Nói cách khác: **cỡ mẫu để phân biệt hai nguồn lớn hơn cả sổ
> lead của cả kỳ.**

**(3) Muốn ĐƯA nguồn vào bảng xếp hạng giá.** Ngưỡng dùng độ giãn — xem §6.5.

### 6.2 · Khoảng tin cậy Wilson

**Công thức**, với `p̂ = x/n`, `z = 1,96`:

```
                p̂ + z²/(2n)                     z              ┌──────────────────┐
   tâm  =  ───────────────────      nửa  =  ───────────  · √   │ p̂(1−p̂)/n + z²/(4n²)
                1 + z²/n                     1 + z²/n          └──────────────────┘
```

**Vì sao không dùng Wald.** Wald là `p̂ ± z·√(p̂q̂/n)`. Trên cỡ mẫu nhỏ nó hỏng theo
hai cách, cả hai đều xảy ra trong fixture này:

| Bệnh của Wald                  | Ví dụ thật                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Cận dưới **âm**                | CD-0105 (1/9): Wald cho **[−9,42% ; 31,64%]** — một xác suất dưới không                                |
| Bề rộng **bằng 0** khi `x = 0` | Nguồn 0 lead tốt trên 9 lead: Wald cho **[0% ; 0%]**, tức "chắc chắn 0%". Wilson cho **[0% ; 29,92%]** |

Wilson không có hai bệnh đó vì nó giải phương trình theo `p` thật chứ không nhét
`p̂` vào chỗ của `p` trong sai số chuẩn.

**Ví dụ tính tay, CD-0101 (x = 9, n = 22):**

```
   p̂ = 9/22 = 0,409091
   z² = 3,8416       z²/n = 3,8416/22 = 0,174618       1 + z²/n = 1,174618
   z²/(2n) = 0,087309

   tâm  = (0,409091 + 0,087309) / 1,174618 = 0,496400 / 1,174618 = 0,422608

   p̂(1−p̂)/n = 0,409091 × 0,590909 / 22 = 0,241736 / 22 = 0,010988
   z²/(4n²)  = 3,8416 / (4 × 484) = 3,8416 / 1.936      = 0,001984
   tổng = 0,012972      √ = 0,113897
   z/(1+z²/n) = 1,96 / 1,174618 = 1,668627
   nửa = 1,668627 × 0,113897 = 0,190052

   ►  KTC 95% = [0,232556 ; 0,612655]  =  [23,26% ; 61,27%]
```

**Tám nguồn, Wilson 95% của tỉ lệ lead tốt:**

| Nguồn   | x/n    | p̂      | Cận dưới   | Cận trên   | Rộng    |
| ------- | ------ | ------ | ---------- | ---------- | ------- |
| CD-0101 | 9/22   | 40,91% | **23,26%** | 61,27%     | 38,0 pp |
| CD-0102 | 7/18   | 38,89% | 20,31%     | 61,38%     | 41,1 pp |
| SK-0103 | 6/16   | 37,50% | 18,48%     | 61,36%     | 42,9 pp |
| SK-0104 | 4/12   | 33,33% | 13,81%     | 60,94%     | 47,1 pp |
| CD-0105 | 1/9    | 11,11% | 1,99%      | **43,50%** | 41,5 pp |
| SK-0106 | 3/11   | 27,27% | 9,75%      | 56,57%     | 46,8 pp |
| GT      | 3/7    | 42,86% | 15,82%     | 74,95%     | 59,1 pp |
| TM      | 1/5    | 20,00% | 3,62%      | 62,45%     | 58,8 pp |
| _Phòng_ | 34/100 | 34,00% | 25,46%     | 43,72%     | 18,3 pp |

> **Tám khoảng này CHỒNG NHAU HẾT.** Cận dưới cao nhất là 23,26% (CD-0101), cận
> trên thấp nhất là 43,50% (CD-0105). Vì `23,26% < 43,50%`, tồn tại một dải
> **[23,26% ; 43,50%]** nằm trong cả tám khoảng. Không có cặp nguồn nào tách được
> nhau về tỉ lệ lead tốt ở mức tin cậy 95% — kể cả cặp cực đoan nhất, GT 42,86%
> và CD-0105 11,11%.

### 6.3 · Có sự khác biệt thật nào giữa tám nguồn không

Kiểm định đồng nhất, thống kê χ² có trọng số quanh trung bình phòng
`m = 34/100 = 0,34`:

```
   X² = Σ nᵢ(p̂ᵢ − m)² / [ m(1−m) ]
```

| Nguồn   | nᵢ  | p̂ᵢ       | (p̂ᵢ − 0,34) | nᵢ(p̂ᵢ−m)²    |
| ------- | --- | -------- | ----------- | ------------ |
| CD-0101 | 22  | 0,409091 | +0,069091   | 0,105019     |
| CD-0102 | 18  | 0,388889 | +0,048889   | 0,043022     |
| SK-0103 | 16  | 0,375000 | +0,035000   | 0,019600     |
| SK-0104 | 12  | 0,333333 | −0,006667   | 0,000533     |
| CD-0105 | 9   | 0,111111 | −0,228889   | 0,471511     |
| SK-0106 | 11  | 0,272727 | −0,067273   | 0,049782     |
| GT      | 7   | 0,428571 | +0,088571   | 0,054914     |
| TM      | 5   | 0,200000 | −0,140000   | 0,098000     |
|         |     |          | **Σ**       | **0,842381** |

```
   X² = 0,842381 / (0,34 × 0,66) = 0,842381 / 0,2244 = 3,7539       bậc tự do = 8 − 1 = 7
```

Kỳ vọng của χ² với 7 bậc tự do là **7**. Quan sát được **3,75** — **thấp hơn cả
nhiễu ngẫu nhiên thuần tuý.** Tra bảng χ²(7): phân vị 10% = 2,83, phân vị 25% =
4,26, nên 3,75 rơi giữa hai mốc đó và **p ≈ 0,81**.

> **Kết luận cứng: dữ liệu hôm nay KHÔNG có bằng chứng nào cho thấy tám nguồn
> khác nhau về tỉ lệ lead tốt.** Toàn bộ chênh lệch từ 11,1% tới 42,9% giải thích
> được bằng may rủi trên cỡ mẫu 5–22. Bảng xếp hạng hiện tại đang xếp hạng nhiễu.

Đây phải là **một ca test**, không phải một câu trong tài liệu — xem §8.

### 6.4 · Co ngót về trung bình phòng (Beta-Binomial / empirical Bayes)

Prior là chính trung bình phòng: `m = 0,34`. Sức mạnh prior là `k = α + β`.

```
   posterior mean:   p̃ᵢ = (xᵢ + k·m) / (nᵢ + k)        với  α = k·m,  β = k(1−m)
```

**Chọn k thế nào.** Ước lượng moment của phương sai giữa nhóm:

```
   τ̂² ∝ S − (G−1)·m(1−m)  =  0,842381 − 7 × 0,2244  =  0,842381 − 1,570800  =  −0,728419  < 0
```

Âm → `τ̂² = 0` → `k = m(1−m)/τ̂² = ∞` → **co ngót hoàn toàn**: mọi nguồn hiện đúng
34,0%. Về mặt thống kê đó là câu trả lời đúng, và §6.3 vừa nói y như thế bằng một
đường khác. Nhưng một bảng tám dòng cùng in "34,0%" thì không dùng được trên màn.

Vì thế `k` là một **quyết định sản phẩm**, không phải một ước lượng. Đề xuất
**k = 25** (`α = 8,5`, `β = 16,5` — prior nặng bằng 25 lead), lập luận ba bước:

1. Ước lượng ở biên nên không cho ra số; phải đặt.
2. `k` phải **≥ n lớn nhất (22)**, nếu không một nguồn duy nhất tự thắng chính
   prior của nó trong khi dữ liệu nói không có tín hiệu nào.
3. Số tròn ngay trên 22 là **25**.

`k = 25` là **số ĐẶT**, phải mang tên người đặt và ngày (§9).

| Nguồn   | Thô    | **Co ngót** | Hạng thô | Hạng co ngót | Đổi    |
| ------- | ------ | ----------- | -------- | ------------ | ------ |
| CD-0101 | 40,91% | **37,23%**  | 2        | **1**        | ▲1     |
| CD-0102 | 38,89% | 36,05%      | 3        | 2            | ▲1     |
| GT      | 42,86% | 35,94%      | **1**    | **3**        | **▼2** |
| SK-0103 | 37,50% | 35,37%      | 4        | 4            | —      |
| SK-0104 | 33,33% | 33,78%      | 5        | 5            | —      |
| SK-0106 | 27,27% | 31,94%      | 6        | 6            | —      |
| TM      | 20,00% | 31,67%      | 7        | 7            | —      |
| CD-0105 | 11,11% | 27,94%      | 8        | 8            | —      |

Phép tính mẫu, CD-0105: `(1 + 25×0,34) / (9 + 25) = 9,5 / 34 = 0,279412`.

Hai hiệu quả đúng như mong đợi:

- **Bề rộng bảng sụp từ 31,8 pp xuống 9,3 pp.** Bảng thô nói "nguồn tốt nhất gấp
  gần bốn lần nguồn tệ nhất"; bảng co ngót nói "chênh nhau một phần ba" — và đó
  mới là điều dữ liệu cho phép nói.
- **GT tụt từ hạng 1 xuống hạng 3.** Đúng thứ co ngót sinh ra để làm: GT dẫn đầu
  chỉ nhờ 3/7, cỡ mẫu nhỏ nhất cả bảng.

### 6.5 · Xếp hạng nguồn công bằng

**Quy tắc đề xuất — xếp theo CẬN TRÊN khoảng tin cậy của chi phí mỗi lead tốt.**

Chi phí `C` biết chính xác; thứ không chắc là số lead tốt, tức là `p`. Nên:

```
   chi/lead tốt  =  C / (n · p)

   ►  cận TRÊN của chi phí  =  C / (n · p_dưới)      ◄ số dùng để XẾP HẠNG
      cận DƯỚI của chi phí  =  C / (n · p_trên)
      điểm co ngót          =  C / (n · p̃)           ◄ số hiện cạnh bên
```

Xếp bằng cận trên vì đó là **số xấu nhất còn hợp lý** — một nguồn chỉ được gọi là
rẻ nếu nó rẻ cả trong trường hợp xui. Quy tắc này tự động phạt cỡ mẫu nhỏ, không
cần thêm luật nào.

**Cổng vào bảng: độ giãn `p̂ / p_dưới ≤ 3,0.** Vượt 3,0 nghĩa là cận trên cách
điểm hơn ba lần — một con số không quyết được việc gì. Cổng này phụ thuộc cả `n`lẫn`x`, nên nó đúng chỗ hơn một ngưỡng `n ≥ 10` cứng.

**Bảng xếp hạng sáu nguồn có tiêu tiền — tính tay, đơn vị đồng:**

| Hạng | Nguồn   | Chi         | n   | x   | p_dưới   | **n·p_dưới** | **Cận trên = C/(n·p_dưới)** | Điểm hôm nay | Cận dưới   | Co ngót    | Độ giãn  | Cổng |
| ---- | ------- | ----------- | --- | --- | -------- | ------------ | --------------------------- | ------------ | ---------- | ---------- | -------- | ---- |
| 1    | CD-0101 | 18.000.000  | 22  | 9   | 0,232556 | 5,1162       | **3.518.220**               | 2.000.000    | 1.335.469  | 2.197.403  | 1,76     | ✔    |
| 2    | CD-0102 | 26.000.000  | 18  | 7   | 0,203050 | 3,6549       | **7.113.741**               | 3.714.286    | 2.353.231  | 4.007.168  | 1,92     | ✔    |
| 3    | SK-0104 | 21.000.000  | 12  | 4   | 0,138118 | 1,6574       | **12.670.340**              | 5.250.000    | 2.871.760  | 5.180.000  | 2,41     | ✔    |
| 4    | SK-0103 | 84.000.000  | 16  | 6   | 0,184810 | 2,9570       | **28.407.581**              | 14.000.000   | 8.556.153  | 14.844.828 | 2,03     | ✔    |
| 5    | SK-0106 | 145.000.000 | 11  | 3   | 0,097459 | 1,0720       | **135.255.281**             | 48.333.333   | 23.303.830 | 41.264.822 | 2,80     | ✔    |
| —    | CD-0105 | 6.000.000   | 9   | 1   | 0,019890 | 0,1790       | **33.517.055**              | 6.000.000    | 1.532.545  | 2.385.965  | **5,59** | ✕    |

Phép tính mẫu, CD-0101: `22 × 0,232556 = 5,116232` → `18.000.000 ÷ 5,116232 =
3.518.220 đ`. Độ giãn `0,409091 ÷ 0,232556 = 1,759`.

**Hai nguồn 0 đồng nằm ở khối riêng** (đúng như `paidSourceCosts()` đang làm),
nhưng khi bảng chuyển sang **chi đầy đủ** thì chúng có giá thật và phải vào bảng:
GT `4.200.000 ÷ (7 × 0,158217) = 3.792.262 đ` cận trên, độ giãn 2,71 → qua cổng ·
TM `9.000.000 ÷ (5 × 0,036223) = 49.691.964 đ` cận trên, độ giãn 5,52 → **TM cũng
trượt cổng.**

**Thứ hạng đổi những gì so với hôm nay:**

| Hôm nay (điểm) | Quy tắc mới (cận trên)        |
| -------------- | ----------------------------- |
| 1 CD-0101      | 1 CD-0101                     |
| 2 CD-0102      | 2 CD-0102                     |
| 3 SK-0104      | 3 SK-0104                     |
| **4 CD-0105**  | **— CD-0105 · chưa xếp được** |
| 5 SK-0103      | 4 SK-0103                     |
| 6 SK-0106      | 5 SK-0106                     |

CD-0105 hôm nay đứng hạng tư với nhãn "6 triệu, rẻ thứ tư" và đang được đề xuất
cấp thêm ngân sách (`ke-hoach-va-cau-hinh.md §4.5`, dòng _"CD-0105 rẻ nhất (6 tr)
nhưng chỉ 1 lead tốt"_). Cận trên thật của nó là **33,5 triệu** — đắt thứ nhì cả
bảng. Nó rớt khỏi bảng, không phải rớt xuống hạng chót: **1 lead tốt không đủ để
nói bất cứ điều gì.**

### 6.6 · Cặp nào được phép nói "rẻ hơn"

Hai nguồn tách được khi khoảng `[cận dưới ; cận trên]` của chúng **rời nhau**.
Trong 15 cặp của sáu nguồn có tiền, **đúng 5 cặp tách được:**

| Cặp                   | Cận trên của bên rẻ | Cận dưới của bên đắt | Chênh chắc chắn ít nhất |
| --------------------- | ------------------- | -------------------- | ----------------------- |
| CD-0101 **<** SK-0103 | 3.518.220           | 8.556.153            | 2,43 lần                |
| CD-0101 **<** SK-0106 | 3.518.220           | 23.303.830           | **6,62 lần**            |
| CD-0102 **<** SK-0103 | 7.113.741           | 8.556.153            | 1,20 lần                |
| CD-0102 **<** SK-0106 | 7.113.741           | 23.303.830           | 3,28 lần                |
| SK-0104 **<** SK-0106 | 12.670.340          | 23.303.830           | 1,84 lần                |

Mười cặp còn lại **chồng nhau** → màn phải nói "chưa đủ dữ liệu để kết luận".
Trong đó có hai cặp gây bất ngờ:

- **CD-0101 vs CD-0105 không tách được** — dù điểm là 2,0 triệu so với 6,0 triệu.
- **SK-0103 vs SK-0106 không tách được** — 84 triệu ra 6 lead tốt so với 145
  triệu ra 3. Nghe chênh lệch rành rành, nhưng `[8,56 ; 28,41]` và
  `[23,30 ; 135,26]` chồng nhau ở dải 23,30–28,41 triệu. **Không được nói gian
  hàng đắt hơn hội thảo.**

**Hệ quả trực tiếp lên `plan.ts:228`.** Câu AI hôm nay:

> _"Dồn ngân sách sang CD-0101 và cắt SK-0106 — **chênh 24 lần** giá mỗi lead tốt."_

Cặp đó **tách được**, nên câu đề xuất sống. Nhưng con số phải đổi: `24 lần` là
`48.333.333 ÷ 2.000.000`, hai điểm đứng trên mẫu số 3 và 9. Câu đứng vững được là:

> _"Dồn ngân sách sang CD-0101 và cắt SK-0106 — SK-0106 đắt hơn **ít nhất 6,6
> lần** (khoảng tin cậy 95%)."_

Kiểm: `23.303.830 ÷ 3.518.220 = 6,624`.

### 6.7 · Quy tắc hiển thị

**Hiện "chưa đủ dữ liệu để kết luận" khi có BẤT KỲ điều nào:**

1. `good < 3` — dưới ba lead tốt thì mọi tỉ lệ là một câu chuyện về hai người.
2. Độ giãn `p̂/p_dưới > 3,0`.
3. `leads < 5`.

**Được nói "A rẻ hơn B" CHỈ KHI** hai khoảng `[cận dưới ; cận trên]` rời nhau. Số
đi kèm phải là **"ít nhất N lần"**, không bao giờ là tỉ số hai điểm.

**Bốn luật hiển thị nữa:**

- **Không hiện chi phí mỗi lead tốt trần trụi.** Luôn kèm khoảng. Chỗ chật thì
  hiện **cận trên**, vì đó là số dùng để quyết chi tiền.
- **Khi mọi khoảng chồng nhau thì bỏ số thứ tự,** hiện nhóm. Đánh số 1–8 lên tám
  con số không phân biệt được nhau là dựng một sự thật không có.
- **Nguồn 0 đồng tiền mặt ở khối riêng** khi bảng đo tiền mặt; **vào chung bảng**
  khi bảng đo chi đầy đủ.
- **Số co ngót là số HIỆN, số thô là số TRA.** Bảng hiện `p̃`, drawer hiện cả
  `p̂ · x/n · khoảng · p̃`. Không bao giờ hiện `p̂` một mình ở chỗ liếc.

**Một hệ quả phải nuốt.** Thước `gia-moi-lead-tot` của Marketing trong
`ROLE_KPI_MODEL` có `monthlyTarget: 12.000.000`, và `performance.ts` hôm nay tính
`300.000.000 ÷ 30 = 10.000.000` → chấm **Đạt**. Sáu nguồn của Marketing gộp lại
là `30/88`, Wilson `[25,04% ; 44,47%]`, nên cận trên của giá là
`300.000.000 ÷ (88 × 0,250390) = 13.615.131 đ` — **vượt ngưỡng 12 triệu**. Chấm
theo cận trên thì nhãn đổi từ **Đạt** sang **Cần cải thiện**. Đây là một quyết
định về con người, không phải một chi tiết kỹ thuật: **phải hỏi trước khi đổi.**

---

## §7 · Áp vào hàm nào

### 7.1 · Biên giới package

Mọi phép tính vào `@pv/engines`; `@pv/ui` chỉ nhận `CostBand` qua props.

**Không dựng engine mới.** Chi phí là **thuộc tính của object nguồn** — E1 sẽ giữ
khi chiến dịch có `ObjectKind`; ghi nhận chi phí là **hành động có ghi vết** (E2);
sửa số đã chốt là **duyệt** (E3); E5 (chiến dịch) sẽ làm chủ `costLines` khi nó có
bản cài đặt. Wilson và co ngót là **hàm thuần, không giữ trạng thái** → đặt ở
`packages/engines/src/stats.ts`, export qua `@pv/engines`. Gọi nó là "E6" thì phá
định nghĩa engine ở `kien-truc-san-pham.md`.

### 7.2 · Bảng đổi

| Hàm / trường hiện có                       | Ở đâu                     | Đổi thế nào                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Source.cost: number`                      | `das-vina.ts:678`         | **Giữ nguyên tên và giá trị.** Thêm chú thích: đây là **tiền mặt**, không gồm nhân công                                                                                                                                                     |
| —                                          | `das-vina.ts`             | **MỚI** `type CostCategory = 'du-lieu'\|'kenh'\|'noi-dung'\|'su-kien'\|'cong-cu'` — danh sách ĐÓNG, không có "khác"                                                                                                                         |
| —                                          | `das-vina.ts`             | **MỚI** `Source.costLines: CostLine[]` — `{category, label, qty?, unitPrice?, amount, incurredDay, bookedDay, docRef?}`                                                                                                                     |
| —                                          | `das-vina.ts`             | **MỚI** `Source.labourHours: { actor: string; hours: number }[]` và `HOURLY_RATE: Record<string, number>`                                                                                                                                   |
| —                                          | `das-vina.ts`             | **MỚI** `Source.listRows?: number` — số dòng danh sách đã export, mẫu số của CPP                                                                                                                                                            |
| —                                          | `das-vina.ts`             | **MỚI** `DEPT_COSTS` — khoản của phòng không gán được nguồn (credit Apollo chưa dùng, 4.122.400 đ)                                                                                                                                          |
| —                                          | `das-vina.ts`             | **MỚI** `DEPT_PRIOR = { mean: 0.34, k: 25 }` — số của KỊCH BẢN, không phải hằng toán                                                                                                                                                        |
| `sourceStats(code)`                        | `das-vina.ts:1533`        | **Giữ chữ ký, giữ mọi trường cũ** (`costPerGood` đang bị `performance.ts` và `plan.ts` đọc). Thêm: `mqlPlus` `sql` `costPerLead` `costPerMql` `costPerSql` `labourCost` `fullCost` `fullCostPerGood` `goodRate: {p, lo, hi, shrunk}` `band` |
| —                                          | `stats.ts` **(file mới)** | **MỚI** `wilson(x, n, z = 1.96): { lo, hi }` — hàm thuần, không biết kịch bản nào                                                                                                                                                           |
| —                                          | `stats.ts`                | **MỚI** `shrink(x, n, mean, k): number`                                                                                                                                                                                                     |
| —                                          | `stats.ts`                | **MỚI** `chiSquareHomogeneity(groups): { x2, df }`                                                                                                                                                                                          |
| —                                          | `stats.ts`                | **MỚI** `costBand(cost, x, n): { lo, point, hi, eb, stretch, gated }`                                                                                                                                                                       |
| —                                          | `das-vina.ts`             | **MỚI** `sourceRanking(): { rows: Ranked[]; separablePairs: [string,string][] }` — nơi DUY NHẤT sinh thứ hạng                                                                                                                               |
| `rowOf(s)` / `SourceRow`                   | `campaigns.ts:225`        | Thêm `costLines` `costByCategory` `labourCost` `fullCost` `band`                                                                                                                                                                            |
| `fetchCampaignTotals()`                    | `campaigns.ts:281`        | Thêm `costByCategory` (5 dòng của §3) · `labourCost: 80_820_000` · `fullCost: 380_820_000` · `unallocated: 4_122_400`                                                                                                                       |
| `SOURCE_SORTS`                             | `campaigns.ts:373`        | Thêm mục `gia-lead-tot`, `compare` đọc **`band.hi`**, KHÔNG đọc `costPerGood`                                                                                                                                                               |
| `SourceRow` (module 3)                     | `performance.ts:136`      | Thêm `band` và `gated`                                                                                                                                                                                                                      |
| `marketingReadings()` · `gia-moi-lead-tot` | `performance.ts:492`      | `value` giữ `band.point`; **`verdict` chấm theo `band.hi`** — §6.7, cần gật vì đổi nhãn của một người                                                                                                                                       |
| `SourcesTable` hint                        | `performance.tsx:1096`    | Đổi câu _"chi phí của một nguồn không chia được theo ngày"_ → giờ chia được, vì mỗi `CostLine` có `incurredDay`                                                                                                                             |
| `paidSourceCosts()`                        | `plan.ts:151`             | Sort theo `band.hi`; **lọc bỏ nguồn trượt cổng** (`gated`); trả thêm `band`                                                                                                                                                                 |
| `buildProposals()` · `don-ngan-sach`       | `plan.ts:221`             | `cheap`/`dear` phải là một **cặp tách được**; `times` đổi thành `ít nhất N lần` tính từ `dear.band.lo / cheap.band.hi`                                                                                                                      |
| `buildStats()` · ô `gia-lead-tot`          | `plan.ts:277`             | Hiện khoảng, không hiện điểm                                                                                                                                                                                                                |
| khối ROI                                   | `plan.ts`                 | **Chưa dựng.** ROI/ROAS/hoàn vốn/LTV bị chặn tới khi có `CONTRACTS` — xem `ke-hoach-va-cau-hinh.md §6.1`                                                                                                                                    |
| —                                          | `@pv/ui`                  | **MỚI** `<CostBand lo point hi label />` — thanh có ba vạch. Nhận số đã tính, **không** import engine. Thêm dòng ở `/kit`                                                                                                                   |

---

## §8 · Test khoá mới cho `scenario.test.ts`

| #   | Ca test                                                                                    | Vì sao                                                               |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | `costLines` mỗi nguồn cộng đúng `Source.cost`; tổng 8 nguồn = **300.000.000**              | Ràng buộc bất di bất dịch của §3                                     |
| 2   | Mọi `CostLine.category` thuộc đúng 5 loại — **không có loại thứ sáu, không có "khác"**     | Cùng luật với `EXIT_REASONS`                                         |
| 3   | Rollup theo loại = `4.580.000 · 24.480.000 · 48.900.000 · 196.100.000 · 25.940.000`        | Khoá bảng cộng ngang của §3                                          |
| 4   | `Σ hours × rate = labourCost`; tổng L6 = **80.820.000**; `fullCost` tổng = **380.820.000** | Khoá lớp thứ hai                                                     |
| 5   | `Source.cost` KHÔNG đổi giá trị nào so với hôm nay (8 con số khoá cứng)                    | Chống hồi quy — cả mô hình đứng trên chỗ này                         |
| 6   | `costPerGood` cũ trả đúng giá trị cũ cho cả 8 nguồn                                        | `performance.ts` và `plan.ts` đang đọc                               |
| 7   | Wilson: `0 ≤ lo ≤ x/n ≤ hi ≤ 1` với mọi `(x, n)` trong `n = 1..30, x = 0..n`               | Đúng thứ Wald sai — test này là lý do chọn Wilson                    |
| 8   | `wilson(9, 22)` = `[0,232556 ; 0,612655]` tới 6 chữ số                                     | Khoá ví dụ tính tay của §6.2                                         |
| 9   | Tám khoảng Wilson của tám nguồn **chồng nhau hết** — giao khác rỗng                        | Khoá phát hiện chính của §6.2                                        |
| 10  | `chiSquareHomogeneity` của tám nguồn = **3,7539** (4 chữ số), `df = 7`                     | **Ca test đắt nhất.** Nó nói "hôm nay chưa phân biệt được nguồn nào" |
| 11  | `shrink(x, n)` luôn nằm giữa `x/n` và `0,34`; `k = 25` khoá cứng                           | Co ngót sai chiều là lỗi im lặng                                     |
| 12  | `sourceRanking().separablePairs` có đúng **5** cặp, và đúng 5 cặp của §6.6                 | Nếu ai đổi `z` hay đổi cổng, số này đổi ngay                         |
| 13  | Nguồn trượt cổng (`stretch > 3`) không xuất hiện trong `paidSourceCosts()`                 | Chống CD-0105 lẻn lại vào đề xuất ngân sách                          |
| 14  | Mọi `CostLine.incurredDay` nằm trong `[0, DAY_FROZEN]`                                     | Cùng luật với timeline lead                                          |
| 15  | `Σ listRows` của 8 nguồn = **4.220**, và `Σ (dòng L1 dữ liệu) = 4.220.000`                 | Khoá dây nối credit ↔ tiền                                           |

Không ca nào trong 15 ca trên làm đỏ ca cũ.

---

## §9 · Số ĐẶT — chưa ai ký

Theo tiền lệ `ke-hoach-va-cau-hinh.md §2`: _số kế hoạch phải mang tên người đặt và
ngày đặt._ Chín con số dưới đây **là số ĐẶT, không phải số đo**, và **chưa có
người đặt**. Ô trống ở cột cuối là cố ý.

| #   | Số                              | Giá trị đề xuất       | Ở đâu ra                                                       | Người đặt · ngày |
| --- | ------------------------------- | --------------------- | -------------------------------------------------------------- | ---------------- |
| 1   | Tỷ giá quy đổi                  | 26.400 đ/USD          | Vietcombank bán ra 18/08/2026 — số ĐO, nhưng phải khoá một mốc | ____ · **/**     |
| 2   | Đơn giá dòng Apollo             | 1.000 đ/dòng          | 1.042,80 đ derived, làm tròn tới 100 đ                         | ____ · **/**     |
| 3   | Phí xác minh email              | 300 đ/dòng            | đặt                                                            | ____ · **/**     |
| 4   | Tỉ lệ dòng hỏng                 | 12%                   | đặt — **chưa ai đo**                                           | ____ · **/**     |
| 5   | Pool công cụ dùng chung         | 18.800.000 đ          | SalesNav $396 + thiết kế + ghế CRM, làm tròn                   | ____ · **/**     |
| 6   | Khoá phân bổ công cụ            | theo đợt (20)         | §2.1 lựa chọn (c)                                              | ____ · **/**     |
| 7   | Đơn giá giờ MKT · BD · TP       | 180 · 150 · 300 nghìn | đặt                                                            | ____ · **/**     |
| 8   | Giờ theo nguồn (274 · 126 · 42) | bảng §4               | đặt — **chưa có bảng giờ nào trong hệ**                        | ____ · **/**     |
| 9   | Sức mạnh prior `k`              | 25                    | §6.4, ba bước lập luận                                         | ____ · **/**     |

Giá LinkedIn Sales Navigator ($99/ghế/tháng) cũng thuộc nhóm này — nguồn tra
không thống nhất ($89,99 – $119,99).

---

## §10 · Luồng ghi nhận chi phí thực tế

### 10.1 · Bảy bước

| #   | Việc                         | Ai                   | Khi nào                                      | Chứng từ                                    | Engine                                       |
| --- | ---------------------------- | -------------------- | -------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| 1   | Đặt ngân sách ô việc         | TP Kinh doanh        | khi lập kế hoạch kỳ                          | không                                       | **E3** — duyệt cả kế hoạch                   |
| 2   | Cam kết chi (đặt hàng)       | Marketing            | trước khi chạy đợt                           | báo giá + đơn đặt hàng                      | **E3** nếu vượt ngưỡng ô việc                |
| 3   | **Ghi dòng chi thực tế**     | Marketing            | trong **3 ngày làm việc** kể từ ngày hoá đơn | hoá đơn/biên nhận: số + ngày + nhà cung cấp | **E2** ghi vết                               |
| 4   | Ghi giờ người                | mỗi vai tự ghi       | cuối mỗi tuần                                | bảng giờ                                    | **E2**                                       |
| 5   | Phân bổ thuê bao xuống nguồn | máy chạy             | ngày 1 tháng sau                             | sao kê nhà cung cấp                         | máy tính, **E2** ghi lại                     |
| 6   | Chốt kỳ                      | Kế toán + TP KD      | ngày 5 tháng sau                             | đối chiếu sao kê ↔ dòng chi                 | **E3**                                       |
| 7   | **Sửa số đã chốt**           | ai cũng đề xuất được | bất kỳ lúc nào                               | chứng từ mới                                | **E3 BẮT BUỘC** — người gật là TP Kinh doanh |

**Ranh giới E2 / E3, viết một lần cho hết cãi:**

- **Chưa chốt kỳ → E2.** Ghi, sửa, xoá tự do, nhưng mọi thao tác có dấu tay.
- **Đã chốt kỳ → E3.** Vì lúc đó con số đã đi vào báo cáo, đã đi vào KPI của một
  người, và có thể đã đi vào một quyết định chi tiền. Sửa nó là sửa lịch sử.
- Mỗi chỉ số dẫn xuất từ một dòng bị sửa sau khi chốt phải mang dấu **"đã sửa"**
  cho tới hết kỳ kế tiếp. Sửa lặng lẽ thì lần sau không ai tin bảng nào.

### 10.2 · Chi phí muộn — hoá đơn về sau khi kỳ đã đóng

**KHÔNG mở lại kỳ đã chốt.** Mỗi `CostLine` mang **hai ngày**:

| Trường        | Nghĩa                        | Chỉ số nào đọc                                                      |
| ------------- | ---------------------------- | ------------------------------------------------------------------- |
| `incurredDay` | ngày phát sinh — thuộc kỳ CŨ | **giá mỗi lead tốt của nguồn** — phải khớp với lead nguồn đó kéo về |
| `bookedDay`   | ngày ghi sổ — thuộc kỳ MỚI   | **chi trong kỳ** · ngân sách còn lại · thanh tiến độ tiền           |

Hai chỉ số đọc hai trường khác nhau là **chủ ý**. Trộn làm một thì hoặc kỳ đã
chốt tự đổi số dưới chân người đọc, hoặc giá của nguồn sai vì tiền tính vào tháng
mà nguồn đã ngừng chạy.

**Ngưỡng 60 ngày.** Hoá đơn về muộn quá **60 ngày** kể từ `incurredDay` **không
được gắn vào nguồn nữa** — chỉ vào `DEPT_COSTS`. Nếu không, một hoá đơn về sau
nửa năm sẽ làm một nguồn đã đóng đội giá, và mọi bảng đã in thành sai mà không ai
biết. 60 ngày là **số ĐẶT** — thêm dòng thứ 10 vào §9.

**Trên màn.** Nguồn có dòng chi muộn hiện chấm cảnh báo và một câu:
_"Chi phí của nguồn này đã đổi ngày **/** vì một hoá đơn về muộn. Giá mỗi lead
tốt tính lại từ __ triệu thành __ triệu."_ Không giấu, không im.

---

## §11 · Ba chỗ cần gật trước khi code

1. **§4 — 80,82 triệu nhân công là LỚP THỨ HAI, nằm ngoài 300 triệu.**
   Chọn một: (a) giữ 300 triệu là **tiền mặt**, nhân công là lớp riêng — khuyến
   nghị, vì nó không đụng con số đã khoá; hoặc (b) 300 triệu đã bao gồm nhân
   công, lúc đó mọi dòng chi tiết của §3 phải khoét lại và **nghĩa** của
   `Source.cost` đổi trong khi **giá trị** không đổi — không test nào bắt được
   kiểu đổi đó, nên nó phải là một quyết định có chữ ký.

2. **§2.2 — 4.122.400 đ credit Apollo mua rồi không dùng nằm NGOÀI 300 triệu.**
   Tiền thật ra khỏi tài khoản kỳ này là **304.122.400 đ**, không phải 300 triệu.
   (Kiểm: thuê bao Professional 4 tháng `$316 × 26.400 = 8.342.400`; gán xuống
   nguồn `4.220 dòng × 1.000 = 4.220.000`; chênh `4.122.400`, gồm 3.780 credit
   chưa dùng ở đơn giá thật `3.941.784` và chênh làm tròn đơn giá `180.616`.)
   Gật cho "300 triệu = phần gán được cho nguồn" — khuyến nghị — hay nhét khoản
   chìm vào một nguồn nào đó? Nếu nhét thì nguồn đó bị chấm điểm vì một quyết
   định mua gói nó không tham gia.

3. **§6.5 + §6.7 — bỏ xếp hạng theo điểm, xếp theo cận trên khoảng.**
   Ba hệ quả thấy được ngay trên màn, phải chấp nhận cả ba:
   - **CD-0105 rơi khỏi bảng giá** (từ hạng 4 xuống "chưa xếp hạng được"), và
     kéo theo dòng đề xuất ngân sách cho nó ở `ke-hoach-va-cau-hinh.md §4.5`.
   - **Câu AI ở `plan.ts:228` đổi từ "chênh 24 lần" xuống "ít nhất 6,6 lần"** —
     đúng hơn, và nghe yếu hơn.
   - **Thước "giá mỗi lead tốt" của Vũ Minh Châu đổi từ Đạt sang Cần cải thiện**
     (cận trên 13.615.131 đ vượt ngưỡng 12.000.000 đ). Đây là nhãn gắn lên một
     người — không đổi lặng lẽ được.

   Nói thẳng cái giá: **màn sẽ trông kém dứt khoát hơn.** Đổi lại, nó thôi nói
   những câu mà dữ liệu không đỡ nổi. Nếu người gật không muốn trả giá đó thì
   phương án còn lại là **tăng cỡ mẫu** — và §6.1 đã cho biết con số: 152 lead
   mỗi nguồn, tức nhiều hơn cả sổ 100 dòng của cả kỳ.
