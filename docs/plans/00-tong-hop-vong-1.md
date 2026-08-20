# Tổng hợp vòng 1 — prospect · chi phí nguồn · nhất quán giao diện

Viết 20/08 bởi agent điều phối, trên bài nộp của bốn agent chuyên môn. Chưa
viết dòng code nào. Trạng thái: **§4 đã gật 20/08** — bốn quyết định chặn việc đã có trả lời.

Bản này là **mục lục và sổ quyết định**. Chi tiết nằm ở bốn file:

| File                      | Nội dung                                                                | Dòng  |
| ------------------------- | ----------------------------------------------------------------------- | ----- |
| `ban-do-nguon-lead.md`    | bản đồ mã nguồn: đường đi của lead, mọi hàm đụng chi phí, số bị khoá    | —     |
| `prospect-nhap-vao-he.md` | tầng prospect: vòng đời, kiểu, định dạng file nhập, cấu hình, luồng màn | 1.176 |
| `chi-phi-nguon-lead.md`   | sáu loại chi phí, phân bổ Apollo, bộ chỉ số, thống kê cỡ mẫu nhỏ        | —     |
| `so-gap-giao-dien.md`     | 44 gap nhất quán trên 10 màn + `@pv/ui`                                 | 473   |

Bản kế hoạch 19/08 `ke-hoach-va-cau-hinh.md` (dựng lại module 4 + 5) vẫn là
**nháp chưa thực thi** — `git log` xác nhận `plan.tsx` và `sales-config.tsx`
chưa đổi từ commit dựng đầu tiên. Mô hình chi phí ở đây đổ thẳng vào §5.4 của
bản đó, nên hai bản phải gật cùng nhau hoặc gật theo thứ tự.

---

## §1 · Ba câu trả lời cho ba câu hỏi

### 1.1 · Prospect — tầng này không thiếu dữ liệu, nó thiếu một cái tên

Sổ lead hôm nay bắt đầu từ đầu mối. Trước đầu mối là một khoảng trống: đợt gửi
ghi `sent: 1.200` mà không object nào nói 1.200 người đó ở đâu ra, ai mua, giá
bao nhiêu, khử trùng thế nào.

Nhưng dữ liệu đóng băng **đã ngầm mô tả tầng đó rồi**. Bằng chứng kiểm được, bốn
trên bốn chuỗi, không sai một đơn vị:

```
CD-0101   đợt 1 gửi 1.200 · 41 người trả lời   →  đợt 2 gửi 1.159 = 1.200 − 41
          đợt 2 gửi 1.159 · 22 người trả lời   →  đợt 3 gửi 1.137 = 1.159 − 22
CD-0105   đợt 1 gửi   310 · 17 người trả lời   →  đợt 2 gửi   293 =   310 − 17
          đợt 2 gửi   293 · 11 người trả lời   →  đợt 3 gửi   282 =   293 − 11
```

**Người trả lời rời khỏi khán giả của đợt sau.** Đó là một luật nghiệp vụ đã
nằm trong số liệu mà chưa ai viết ra thành chữ. Dựng tầng prospect phần lớn là
việc **đặt tên cho thứ đã có**, không phải bịa thêm.

Hệ quả thứ hai, và là chỗ giữ cho cổng init data không có đường vòng:

> **Nhập 1.200 dòng vẫn ra 0 lead.** Không nhà cung cấp nào bán được ô 6 — "đau
> ở đâu, việc khách muốn giải". File đầy đủ nhất chỉ chắc chắn điền được ô 1·2·3.
> Prospect chỉ thành lead khi có **tín hiệu**: trả lời đợt · đăng ký/quét mã ·
> BD gọi được · điền form.

Và tín hiệu ≠ lead: SK-0103 có 120 đăng ký, 78 check-in, mà chỉ 16 lead. Ba sự
kiện cộng lại 349 tín hiệu ra 39 lead.

Truy nguồn 100 dòng sổ: **61 lead về thẳng từ một lô · 17 qua một bước đăng ký ·
22 không có lô nào** (15 từ reach nền tảng của CD-0102, 7 từ giới thiệu). Tám lô
giải thích được cả 20 con số `sent`, tổng **6.818 dòng thô − 424 trùng − 641
loại = 5.753 hợp lệ**, và tiền danh sách **31 tr nằm TRONG 300 tr** của kỳ.

### 1.2 · Chi phí — câu hỏi "Apollo 1.000 lead bao nhiêu tiền" sai đơn vị

Apollo bán **dòng dữ liệu**, không bán lead. Chuỗi quy đổi phải đi qua bốn bậc,
mỗi bậc một tỉ lệ:

```
1.000 dòng mua       × 1.000 đ/dòng      =  1.000.000 đ mua danh sách
                     × 300 đ/dòng xác minh =    300.000 đ
                                           =  1.300.000 đ tiền dữ liệu
   − 12% hỏng        → 880 dòng gửi được
   × tỉ lệ ra lead   → 18,3 đầu mối
                     =     70.909 đ/đầu mối  ← phần TIỀN DỮ LIỆU
   nhưng CPL đầy đủ của CD-0101 = 818.182 đ/đầu mối
```

**Tiền danh sách chỉ chiếm 8,7% giá thật của một đầu mối.** Phần còn lại là kênh,
nội dung, công cụ và nhân công. Đây là con số đắt nhất của cả vòng khảo sát: nó
nói rằng tối ưu chỗ mua danh sách gần như không đổi được gì.

Muốn **1.000 đầu mối** cần 54.545 dòng = 70,9 tr tiền dữ liệu nhưng ~818 tr tổng
chi. Muốn **1.000 lead tốt** cần 133.333 dòng ≈ 2 tỷ.

Phân rã 300 triệu của kỳ, cộng khớp tuyệt đối:

| Mã  | Loại                           | Tiền          | Tỉ trọng               |
| --- | ------------------------------ | ------------- | ---------------------- |
| L1  | Dữ liệu & danh sách            | 4,58 tr       | 1,5%                   |
| L2  | Kênh (ads · ZNS · ESP)         | 24,48 tr      | 8,2%                   |
| L3  | Nội dung                       | 48,90 tr      | 16,3%                  |
| L4  | Sự kiện (gian hàng · hội thảo) | **196,10 tr** | **65,4%**              |
| L5  | Công cụ                        | 25,94 tr      | 8,6%                   |
|     | **Tổng**                       | **300,00 tr** | ✔                      |
| L6  | Nhân công _(lớp thứ hai)_      | 80,82 tr      | → chi đầy đủ 380,82 tr |

### 1.3 · Thống kê — phần lớn so sánh giữa các nguồn hôm nay là nói quá

Đây là kết quả có răng nhất của cả vòng:

> **χ² đồng nhất tám nguồn = 3,7539 · 7 bậc tự do · p ≈ 0,81.**
> Không có bằng chứng nào cho thấy tám nguồn có tỉ lệ lead tốt khác nhau. Tám
> khoảng Wilson chồng nhau hết, giao chung `[23,26% ; 43,50%]`. Ước lượng
> phương sai giữa nhóm ra **âm** — tức co ngót hoàn toàn về trung bình phòng.

Trong 15 cặp nguồn có tiền, **chỉ 5 cặp được phép nói "rẻ hơn"**:
CD-0101 < SK-0103 · CD-0101 < SK-0106 · CD-0102 < SK-0103 · CD-0102 < SK-0106 ·
SK-0104 < SK-0106.

**SK-0103 vs SK-0106 không tách được** — không được nói gian hàng 145 tr đắt hơn
hội thảo 84 tr, dù điểm là 14,0 tr vs 48,3 tr.

Cỡ mẫu cần để phân biệt 40% với 25% là **152 lead một nguồn**. Nguồn lớn nhất có 22. Cả sổ có 100.

Lý do phép này vẫn cho nói được 5 cặp: **chi phí là số đã biết chắc** (145 tr là
145 tr), chỉ mẫu số — số lead tốt — mới là biến ngẫu nhiên. Kể cả kịch bản xấu
nhất cho CD-0101 và tốt nhất cho SK-0106, hai bên vẫn chênh 6,3 lần.

### 1.4 · Nhất quán — bốn trong mười lăm luật cứng đang bị vi phạm trong code đã chạy

44 gap, và phần nặng nhất không phải chuyện thẩm mỹ. Bốn cái tôi đã tự kiểm lại
bằng mã nguồn:

| Gap  | Luật | Sự thật kiểm được                                                                                                                                                                 |
| ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-41 | —    | `onNavigate`/`onOpenAssistant` chỉ tồn tại bên trong `@pv/ui`; **không màn nào truyền**. Dưới `lg`, BottomNav 4 mục và FAB Trợ lý bấm không ra gì.                                |
| G-37 | 13   | `opacity-45` phủ lên **cả chữ** ở mục nav khoá → đo 2,29:1, ngưỡng là 4,5:1. `nav-item.tsx:10` đã chốt "chỉ mờ icon" nhưng `AppHeader` thay `AppSidebar` mà không mang luật theo. |
| G-36 | 12   | `.aurora-vignette` là **lớp nền thứ năm**. `globals.css:344` đã bỏ hai lớp hạt "vì là lớp 5 và 6" nhưng sót cái này.                                                              |
| G-02 | 9    | Khối AI màn 01 **không có state "Chưa tạo gì cả"**. Bốn màn kia tự dựng bằng tay vì `AiAction` không có slot.                                                                     |

Thêm: `Button size="lg"` (48px, luật 13 cho tablet) tồn tại và **0 màn dùng** —
bốn chỗ `size="lg"` trong màn thật đều là `SectionTitle`. Không có điểm gãy
tablet nào trong app.

"Lean" xếp sau bốn cái trên. Khi tới lượt: `sales-config` cuộn ~3.600px với 11
thẻ cấp một và 6 lần lồng `glass-b` **trong** `glass-a` — đảo chiều độ sâu mà
`docs/luat-thiet-ke.md §2` quy định.

---

## §2 · Phát hiện xuyên suốt — một nhãn, ba định nghĩa

Không agent nào được giao việc này; nó lòi ra khi ghép bài của A1 với A3.

**"Giá mỗi lead tốt" đang được ba màn tính trên ba tập nguồn khác nhau:**

| Màn           | Hàm                                | Lọc nguồn bằng        |
| ------------- | ---------------------------------- | --------------------- |
| `plan`        | `paidSourceCosts` · `plan.ts:151`  | `cost > 0`            |
| `campaigns`   | `fetchCampaignTotals` · `:282,295` | `waves.length > 0`    |
| `performance` | `marketingReadings` · `:452,467`   | `owner === Marketing` |

Hôm nay cả ba tình cờ ra **cùng 6 nguồn** nên cùng ra 10,0 tr, và không ai thấy.
Thêm một nguồn trả tiền mà chủ không phải Marketing — đúng thứ tầng prospect sắp
tạo ra — là ba màn hiện ba con số dưới cùng một nhãn. **Không test nào đỏ.**

Thêm một tầng lệch nữa trong chính `marketingReadings`: số lead cắt theo kỳ
(`inPeriod`), còn `sourceStats()` trả chi phí **cả kỳ**, không cắt. Tử số và mẫu
số không cùng một khoảng thời gian.

> **Việc số 0, làm trước mọi việc khác:** đưa "giá mỗi lead tốt" về **một hàm,
> một định nghĩa**, đặt ở tầng fixture/engine, ba màn cùng gọi. Làm việc này
> trước khi thêm bất kỳ dòng chi phí nào — nếu không, phân rã chi phí sẽ biến
> một lỗi ngủ yên thành ba con số mâu thuẫn trên ba màn.

---

## §3 · Hàng rào — cái gì không được vỡ

Chạy `pnpm test` trước khi bắt đầu: **17 file · 209 ca · xanh · 6,4s.**

| Hàng rào                                                | Khoá ở đâu                          |
| ------------------------------------------------------- | ----------------------------------- |
| Sổ đúng 100 dòng · phễu `100·44·30·19·11·6`             | `scenario.test.ts:139,145,289`      |
| 8 nguồn, Σ`leads` = 100, Σ`wave.leads` = `Source.leads` | `:211,216,222`                      |
| `opened ≤ sent` · `replied ≤ sent` · `leads ≤ replied`  | `:229`                              |
| `6 + 42 + 52 = 100`                                     | `:151`                              |
| Chuỗi "88/101 lead từ các đợt"                          | `campaigns.test.tsx:72`             |
| **Không assertion nào chạm `cost`**                     | — đây là cửa mở cho phân rã chi phí |

Ba rủi ro A1 cảnh báo, giữ nguyên văn vì chúng đúng:

1. Ba mẫu số "giá mỗi lead tốt" — xem §2.
2. Chạm `buildHistory` là chạm năm thứ cùng lúc (trục tháng module 3,
   `leadTranscript`, số phiên bản `leadResearch`, ba ca test). **Không thêm mốc
   prospect vào timeline lead ở vòng này.**
3. Chi phí không có trục thời gian còn màn Performance thì có.

---

## §4 · Sổ quyết định — mười hai chỗ, bốn chỗ chặn việc

Bốn dòng **CHẶN** đã có trả lời ngày 20/08, ghi ở cột cuối. Tám dòng còn lại đi theo cột đề xuất.

| #    | Quyết định                                                         | Đề xuất                                                 | Chặn việc?                                                         |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| D-01 | Thứ tự thi công ba luồng                                           | luật cứng → chi phí → prospect → lean                   | **CHỐT: làm theo đề xuất**                                         |
| D-02 | Nhân công 80,82 tr: trong hay ngoài 300 tr                         | ngoài, gọi là "chi đầy đủ" lớp hai                      | **CHỐT: KHÁC — chưa đưa L6 vào vòng này, chỉ 5 loại chi tiền mặt** |
| D-03 | Xếp hạng nguồn theo cận trên Wilson hay theo điểm + dải tin cậy    | điểm + dải, chặn _câu khẳng định_ chứ không chặn thứ tự | **CHỐT: làm theo đề xuất**                                         |
| D-04 | 4,12 tr credit Apollo mua rồi không dùng                           | ngoài 300 tr; "300 tr = phần gán được cho nguồn"        | không                                                              |
| D-05 | Prospect đứng ngoài `FUNNEL`, không thành bậc thứ bảy              | đồng ý                                                  | không                                                              |
| D-06 | `OriginKind` giữ đúng bốn giá trị, lô đi bằng `LeadOrigin.batch`   | đồng ý                                                  | không                                                              |
| D-07 | Thêm `'CD'`/`'SK'`/`'DS'` vào `ObjectKind` của E1                  | thêm cả ba một lượt — chiến dịch đang mượn rail sẵn rồi | không                                                              |
| D-08 | Chi phí lô nằm TRONG `Source.cost`                                 | đồng ý — gật ngược lại thì kỳ thành 331 tr              | không                                                              |
| D-09 | 9 số ĐẶT chưa ai ký tên (tỷ giá · đơn giá dòng · giờ công · prior) | Trần Thu Hà đặt, ngày 20/08                             | không                                                              |
| D-10 | Miễn trừ `kit/**` khỏi `aurora/spacing-scale` (xoá 63/108 nợ)      | miễn trừ — trang kit tự khai là bản vẽ tỉ lệ            | **CHỐT: KHÁC — dọn hết 108 chỗ, không miễn trừ ai**                |
| D-11 | Dịch `MQL · SQL · SLA · BD · KPI` sang tiếng Việt (luật 14)        | giữ nguyên, chúng nằm trong fixture                     | không                                                              |
| D-12 | Bản 19/08 dựng lại module 4 + 5 — chạy cùng hay park               | park, làm sau vòng chi phí                              | không                                                              |
| D-13 | Quầng aurora đẩy tương phản xuống dưới 4,5:1 trên mọi màn          | hạ độ đậm quầng                                         | **CHỐT 20/08: azure .30 → .20 · blue .58 → .28**                   |
| D-14 | Thước "giá mỗi lead tốt" lật nhãn của Vũ Minh Châu ở T8 và Q3      | hiện số, hoãn nhãn ở kỳ chưa đóng                       | **CHỐT 20/08: cờ `settlesLate` + trạng thái `chua-chot`**          |

**D-13 · số đo.** Không quầng: 5,79 (đỉnh gradient) · 4,63 (đáy) — đạt. Quầng
azure .30 · blue .58: 4,11 · 3,95 — trượt. Quầng azure .20 · blue .28: 4,64 ·
4,55 — đạt. Ba luật không cùng đúng được (12 đòi hai quầng · 2 chốt chữ phụ là
`#93A1B8` · 13 đòi ≥ 4,5:1); chỗ nhường là độ đậm quầng, vì nó là thứ duy nhất
không có con số nào trong hiến pháp gọi đích danh.

**D-14 · vì sao không chấm.** `costLines[].day` cho phép cắt chi phí theo kỳ,
sửa được phép tính vốn vô nghĩa (lead cắt theo tháng ÷ chi phí cả kỳ). Nhưng
gian hàng 145 tr của SK-0106 rơi trọn vào tháng 8 trong khi đợt mới đi 17/31
ngày, nên T8 đọc ra 72,5 tr và Q3 — **kỳ mặc định của màn** — đọc ra 23,7 tr.
Số đúng; chấm điểm trên nó là chấm độ trễ kế toán. Kỳ **đã đóng** vẫn chấm bình
thường, có test khoá (T7 phải ra `dat`).

Phạm vi: thước này thuộc **lớp chất lượng**, mà lớp chất lượng đã bị loại khỏi
phép chấm nhãn tổng của một người (`performance.ts:797`). Nên nhãn tổng của Vũ
Minh Châu không đổi trong cả hai kịch bản — chỉ đồng hồ riêng của thước đổi.

---

## §5 · Việc phải làm, xếp theo thứ tự đề xuất

**Vòng 0 · một việc, làm trước tất cả**

| #   | Việc                                                        | File                                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| 0   | Một hàm, một định nghĩa "giá mỗi lead tốt"; ba màn cùng gọi | `das-vina.ts` · `plan.ts` · `campaigns.ts` · `performance.ts` |

**Vòng 1 · sai luật cứng, người dùng gặp thật** (7 việc — chi tiết `so-gap-giao-dien.md §9`)

nối nav → bỏ `opacity` trên chữ → bỏ lớp nền thứ năm → `AiAction.empty` bắt buộc
→ rail cho `home` và chế độ sửa → xoá layout chết ở form → dịch `home`.

**Vòng 2 · chi phí** (chi tiết `chi-phi-nguon-lead.md §7`)

`Source.costLines` · `packages/engines/src/stats.ts` (hàm thuần: `wilson`,
`shrink`, `chiSquareHomogeneity`, `costBand`) · `sourceStats` mở rộng ·
`sourceRanking()` là nơi duy nhất sinh thứ hạng · `<CostBand>` ở `@pv/ui` ·
15 ca test khoá mới.

**Vòng 3 · prospect** (chi tiết `prospect-nhap-vao-he.md §8`)

`PROSPECT_BATCHES` + `prospectStats` + `LeadOrigin.batch` → test khoá bốn phép
cân → mục 5.8 cấu hình → `data/prospects.ts` → màn `prospect-lists.tsx` ở
**module 1** → lối vào từ màn Chiến dịch → dòng "về từ lô nào" ở hồ sơ lead.

**Vòng 4 · nền móng nhất quán** — hợp đồng §8 vào PR template · 3 component ưu
tiên 1 (`PageHeader` · `InsetPanel` · `LoadingBlock`+`TableSkeleton`) · dọn `/kit`.

**Vòng 5 · lean** — `sales-config` 11 khối → 5 · `lead-detail` 7 thẻ → 5 ·
`leads` 9 khối → 6 · 53 đoạn giải thích → ~20 · bảng từ vựng một-khái-niệm-một-tên.
