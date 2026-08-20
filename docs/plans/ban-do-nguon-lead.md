# Bản đồ "nguồn → lead" và mọi chỗ đụng chi phí

Trạng thái: **KHẢO SÁT, không phải kế hoạch.** Viết 20/08. Không sửa dòng code nào.

Dựng cho hai thiết kế sắp tới: (a) tầng **prospect** nằm TRƯỚC sổ lead, (b) mô
hình **dòng chi phí** phân rã `Source.cost`. Mục đích duy nhất: biết cắm vào đâu
mà không làm đỏ hàng rào đã có.

Kịch bản: DAS Vina · lát cắt 17/08 09:10 · 100 lead · phễu 100·44·30·19·11·6 ·
8 nguồn · tổng chi 300 triệu.

---

## §1 · Vòng đời một dòng lead

Một đoạn: `ROWS[i]` (dòng thô, 10 cột) **ghép chỉ số** với `SOURCE_PLAN[i]` (mã
nguồn) → `buildBook()` tính `bornDay` từ `Source.startDay`, gắn `dealCode` cho
10 chỉ số đầu và `contractCode` cho 6 chỉ số kế, dựng `filled` từ hai con số
`req`/`opt` → `buildHistory()` đẻ timeline từ chính các trường đó → `LEADS`
đóng băng ở tầng module → `fetchLeadBook()` trả nguyên mảng → màn lọc bằng
`isRunning` · `isOverSla` · `canPromoteToSql`, và đọc ngược về nguồn bằng
`leadOrigin` · `sourceStats`.

### 1.1 · Hằng và hàm trên đường đi

| #   | Tên                                          | Chữ ký / hình dạng                                                                    | Ở đâu                     | Ai gọi                                                                                              |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `PERIOD_START_UTC` · `DAY_MS` · `DAY_FROZEN` | `Date.UTC(2026,4,1)` · `86_400_000` · `108`                                           | `das-vina.ts:14-16`       | `dayISO`, `buildBook`, `buildHistory`                                                               |
| 2   | `dayISO`                                     | `(offset: number, hhmm = '09:00') => string`                                          | `das-vina.ts:20`          | fixture, `campaigns.ts:259`, `campaign-model.ts:69`                                                 |
| 3   | `PIPELINE_STAGES`                            | 5 cột `{key,label,limitDays}`                                                         | `das-vina.ts:108`         | `isRotting`, `isOverSla`, `WORK_COLUMNS`, `performance.ts:72`                                       |
| 4   | `stageLimit`                                 | `Map<StageKey, number>`                                                               | `das-vina.ts:222`         | `isRotting:225`, `isOverSla:1507`                                                                   |
| 5   | `FUNNEL` · `EXIT_REASONS` · `BOOK_SPLIT`     | 6 bậc · 6 lý do · `{signed:6,running:42,exited:52}`                                   | `das-vina.ts:234·253·265` | `buildBook` (exitReason), test, `plan.ts`, `performance.ts`                                         |
| 6   | `INIT_DATA_QUESTIONS` → `REQUIRED_SLOTS`     | 10 câu → `6`                                                                          | `das-vina.ts:339·358`     | cổng, `sourceStats`, mọi màn                                                                        |
| 7   | `REQUIRED_KEYS` · `OPTIONAL_KEYS`            | `QuestionKey[]`                                                                       | `das-vina.ts:360-361`     | `buildBook:1476` dựng `filled`                                                                      |
| 8   | `Wave` · `Source`                            | xem §2                                                                                | `das-vina.ts:625·654`     | `SOURCES`, `sourceByCode`                                                                           |
| 9   | `SOURCES`                                    | `Source[]`, 8 phần tử                                                                 | `das-vina.ts:691`         | 6 file app + fixture                                                                                |
| 10  | `sourceByCode`                               | `Map<string, Source>`                                                                 | `das-vina.ts:1055`        | `buildHistory`, `buildBook`, `primaryChannel`, `leadOrigin`, `sourceStats`                          |
| 11  | `Row`                                        | tuple 10 phần tử, cột thứ 10 là **chỉ số** `EXIT_REASONS` (-1 = còn chạy)             | `das-vina.ts:1118`        | `ROWS`                                                                                              |
| 12  | `OPEN_ROWS` · `WON_ROWS`                     | `OPEN_DEALS.length` (10) · `6`                                                        | `das-vina.ts:1133-1134`   | `buildBook:1463-1465`                                                                               |
| 13  | `ROWS`                                       | `Row[]`, **100 dòng**, thứ tự có nghĩa                                                | `das-vina.ts:1136`        | `buildBook`                                                                                         |
| 14  | `SOURCE_PLAN`                                | `string[]`, **100 mã**, khớp chỉ số với `ROWS`                                        | `das-vina.ts:1260`        | `buildBook:1458`                                                                                    |
| 15  | `buildHistory`                               | `(lead: Omit<Lead,'history'>, bornDay: number) => LeadEvent[]`                        | `das-vina.ts:1375`        | `buildBook:1488`                                                                                    |
| 16  | `buildBook`                                  | `() => Lead[]`                                                                        | `das-vina.ts:1451`        | đúng một chỗ: `LEADS`                                                                               |
| 17  | `LEADS`                                      | `Lead[]`, 100                                                                         | `das-vina.ts:1493`        | 8 file                                                                                              |
| 18  | `isOverSla`                                  | `(lead: Lead) => boolean` — **chỉ bậc SQL**, đo bằng `daysHere` vs hạn cột            | `das-vina.ts:1507`        | `leads.ts:170·279·330`, `leads.tsx:148·421`, `lead-detail.tsx:205·275`, `plan.ts:242`               |
| 19  | `isRunning`                                  | `(lead: Lead) => boolean` — chưa rơi, chưa ký                                         | `das-vina.ts:1513`        | `sourceStats:1545`, `leads.ts:289`, `leads.tsx:116·482`, `plan.ts:243`, `sales-config.ts:131`, test |
| 20  | `canPromoteToSql`                            | `(lead) => { ok: boolean; reason?: string }`                                          | `das-vina.ts:1521`        | `leads.ts:118·327`, `lead-detail.tsx:505`, test                                                     |
| 21  | `sourceStats`                                | `(code: string) => { source, leads, good, signed, running, cost, costPerGood }`       | `das-vina.ts:1533`        | `campaigns.ts:226·294`, `plan.ts:156`, `performance.ts:455`, `campaigns.test.tsx:68`                |
| 22  | `leadContact`                                | `(lead) => LeadContact \| null` — `null` khi chưa điền ô 4                            | `das-vina.ts:1636`        | `leads.ts:119`, màn chi tiết                                                                        |
| 23  | `primaryChannel`                             | `(sourceCode: string) => WaveChannel \| undefined` — đợt nhiều lead nhất              | `das-vina.ts:1675`        | `leadContact:1641`, `leadOrigin:1735`                                                               |
| 24  | `leadOrigin`                                 | `(lead: Lead) => LeadOrigin` — **ném lỗi** nếu `lead.source` không có trong `SOURCES` | `das-vina.ts:1708`        | `leads.tsx:604`, `lead-detail.tsx:160·285`                                                          |
| 25  | `leadTranscript` · `leadResearch`            | `(lead) => TranscriptTurn[]` · `LeadResearch`                                         | `das-vina.ts:1812·1884`   | màn chi tiết lead                                                                                   |
| 26  | `leadMilestones`                             | `(lead) => { vaoSo, mql?, sql?, ky?, roi?, bdCham? }`                                 | `das-vina.ts:1961`        | `performance.ts:82`, test                                                                           |
| 27  | `daysBetween`                                | `(from?, to?) => number \| null`                                                      | `das-vina.ts:1979`        | `performance.ts` (SLA bàn giao), test                                                               |

### 1.2 · Ba bất biến ngầm của `buildBook`

| Bất biến                                    | Chỗ cưỡng chế                                     | Vỡ thì sao                     |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| `ROWS.length === SOURCE_PLAN.length`        | ném lỗi tại `das-vina.ts:1452`                    | app chết ngay lúc import       |
| 10 dòng đầu ↔ `OPEN_DEALS` theo đúng thứ tự | `das-vina.ts:1463`, khoá ở `scenario.test.ts:165` | lead nối nhầm đơn              |
| 6 dòng kế sinh `HĐ-27{11+i}`                | `das-vina.ts:1464-1465`                           | số hợp đồng lệch bậc cuối phễu |

`bornDay = min(src.startDay + (i % 9), DAY_FROZEN - daysHere)` (`das-vina.ts:1462`)
— **ngày vào sổ phụ thuộc `Source.startDay`**. Đổi `startDay` của một nguồn là
đổi ngày vào sổ của mọi lead nguồn đó, tức đổi cả trục tháng của module 3.

---

## §2 · Nguồn — `Source` và `Wave`

### 2.1 · Mọi trường

| Trường                                         | Kiểu                                      | Ghi chú                                                                 | Dòng    |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------- |
| `Source.code`                                  | `string`                                  | `CD-01xx` · `SK-01xx` · `GT` · `TM`. **Không phải `ObjectKind` của E1** | 655     |
| `Source.kind`                                  | `'chien-dich' \| 'su-kien' \| 'tu-nhien'` |                                                                         | 618·656 |
| `Source.label` · `owner`                       | `string`                                  | `owner` phải có trong `actors`                                          | 657-658 |
| `Source.followers?`                            | `string[]`                                | chủ KHÔNG nằm trong đây                                                 | 667     |
| `Source.startDay`                              | `number`                                  | ngày kể từ 01/05                                                        | 669     |
| `Source.leads`                                 | `number`                                  | tổng 8 nguồn = 100                                                      | 671     |
| `Source.waves`                                 | `Wave[]`                                  | tự nhiên = `[]`                                                         | 672     |
| `Source.venue?` · `registered?` · `checkedIn?` | chỉ sự kiện                               | ba con số trần                                                          | 674-676 |
| `Source.cost`                                  | `number` (đồng)                           | **một số duy nhất, không kỳ, không hạng mục**                           | 678     |
| `Wave.no` · `label` · `channel` · `day`        |                                           | `day` kể từ 01/05                                                       | 626-630 |
| `Wave.sent`                                    | `number`                                  | "số người nhận / tiếp cận được"                                         | 632     |
| `Wave.opened` · `replied` · `leads`            | `number`                                  | `leads` cộng mọi đợt = `Source.leads`                                   | 634-638 |
| `Wave.expected`                                | `number`                                  | đặt TRƯỚC khi chạy; tổng 20 đợt = 101, về 88                            | 651     |

### 2.2 · `sent` đến từ đâu — **không có object nào mô tả danh sách người nhận**

Đã quét toàn repo (`\bsent\b`, `audience`, `danh sách`, `người nhận`): `sent`
chỉ tồn tại dưới hai dạng.

| Dạng                  | Ở đâu                                 | Là gì                                    |
| --------------------- | ------------------------------------- | ---------------------------------------- |
| Số trần trong fixture | 20 lần trong `das-vina.ts:708 … 1021` | con số gõ thẳng, không tham chiếu tới ai |
| Số cộng lại           | `campaigns.ts:227·245·289·313·344`    | `sum(waves, w => w.sent)`                |

Hệ quả đã được chính code thừa nhận:

- `campaigns.tsx:209-210` — nhãn phải là **"lượt tiếp cận"** chứ không phải
  "người", vì cùng một danh sách bị gửi lại ở đợt nhắc.
- `SK-0103` đợt 2·3·4 đều `sent: 120` = đúng `registered: 120`; `SK-0106` đợt
  2·3 đều `sent: 143` = `checkedIn = registered = 143`. Cùng một nhóm người bị
  đếm ba lần trong tổng `sent`.
- `campaigns.ts:344 manualSent` — hơn nửa `sent` của kỳ là **số người tự nhập**,
  không phải số hệ đo.
- `registered`/`checkedIn` cũng là số trần: không có bảng người đăng ký, không
  có bản ghi check-in nào, dù mục 1.3 của docs nói "danh sách đăng ký, check-in".

**Kết luận cho thiết kế (a):** chỗ trống cho `ProspectRow` đang há sẵn ở đúng
chỗ này. `sent` hôm nay là **`ProspectBatch.size` viết dưới dạng số nguyên**.

### 2.3 · Ai đọc nguồn

| Nơi đọc                              | Đọc gì                                                                                   | Dòng                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------- |
| `sourceByCode`                       | tất cả                                                                                   | `das-vina.ts:1055`           |
| `buildHistory`                       | `owner`, `kind`, `code`, `label`                                                         | `das-vina.ts:1376·1394-1397` |
| `buildBook`                          | `startDay`                                                                               | `das-vina.ts:1462`           |
| `primaryChannel`                     | `waves[].channel`, `waves[].leads`                                                       | `das-vina.ts:1676-1681`      |
| `leadOrigin`                         | `kind`,`code`,`label`,`owner`,`venue`,`checkedIn`,`registered`,`startDay`,`waves.length` | `das-vina.ts:1708-1742`      |
| `sourceStats`                        | `cost`                                                                                   | `das-vina.ts:1538`           |
| `campaigns.ts · rowOf`               | toàn bộ + 4 tỉ lệ + `value`                                                              | `campaigns.ts:225-267`       |
| `campaigns.ts · fetchCampaignTotals` | 6 nguồn có đợt, 2 sự kiện, 2 tự nhiên                                                    | `campaigns.ts:281-355`       |
| `campaigns.ts · DRAFT_TEMPLATE`      | nguồn mẫu = nguồn có đợt, nhiều lead nhất                                                | `campaigns.ts:163·188`       |
| `plan.ts · paidSourceCosts`          | `cost > 0`                                                                               | `plan.ts:151-168`            |
| `performance.ts · MKT_SOURCES`       | `owner === MARKETING`                                                                    | `performance.ts:84-85`       |
| `sales-config.ts`                    | `waves` theo kênh, nguồn tự nhiên                                                        | `sales-config.ts:88·147·164` |
| `leads.tsx`                          | dropdown lọc theo mã nguồn                                                               | `leads.tsx:326`              |

### 2.4 · Màn hiển thị nguồn

| Màn                      | Khối                                                                                            | Dòng                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/sales/campaigns`       | 6 StatCard cả kỳ; dòng chênh 88 ↔ 100; bảng 7 cột (Mã·Tên·Kênh·Bắt đầu·Lead·MQL·Giá trị đơn mở) | `campaigns.tsx:192-250` · `295-360`       |
| `/sales/campaigns/:code` | 4 StatCard của nguồn; timeline từng đợt (`gửi / mở / trả lời`); nút Sửa·Đóng·Theo dõi           | `campaign-detail.tsx:145-170` · `303-353` |
| `/sales/leads`           | dropdown lọc nguồn; chip xuất xứ mỗi dòng                                                       | `leads.tsx:319-327` · `604-614`           |
| `/sales/leads/:code`     | `OriginCard` — mã, kiểu, chủ, kênh, venue, người đến                                            | `lead-detail.tsx:284-333`                 |
| `/sales/performance`     | drawer Marketing → `SourcesTable` (Mã·Lead·Lead tốt·Giá mỗi lead tốt)                           | `performance.tsx:1091-1131`               |
| `/sales/plan`            | đề xuất "dồn ngân sách" nêu 2 mã nguồn                                                          | `plan.ts:220-234`                         |
| `/sales/config`          | 5.7 kênh: số mẫu đợt + lead theo kênh; chỗ chênh nguồn tự nhiên                                 | `sales-config.ts:147-167`                 |

---

## §3 · Chi phí — mọi nơi đọc `Source.cost`

### 3.1 · Nguồn duy nhất

`Source.cost` khai ở `das-vina.ts:678`, gán 8 lần: `18tr` (CD-0101, L701) ·
`26tr` (CD-0102, L749) · `84tr` (SK-0103, L814) · `21tr` (SK-0104, L881) ·
`6tr` (CD-0105, L935) · `145tr` (SK-0106, L985) · `0` (GT, L1040) · `0` (TM,
L1050). **Tổng 300.000.000.**

### 3.2 · Bốn công thức phái sinh, viết bằng chữ

| #   | Tên                                     | Công thức                                                                                                                               | Mẫu số là gì                              | Dòng                             |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| 1   | `sourceStats().costPerGood`             | `cost ÷ số lead của nguồn có requiredFilled ≥ 6`, `null` khi mẫu = 0, có `Math.round`                                                   | lead tốt **của cả kỳ**, kể cả lead đã rơi | `das-vina.ts:1536·1548`          |
| 2   | `fetchCampaignTotals().costPerGood`     | `Σcost(6 nguồn CÓ ĐỢT) ÷ Σgood(6 nguồn đó)`                                                                                             | lead tốt của nguồn có đợt                 | `campaigns.ts:294-295·327`       |
| 3   | `plan.ts` khối ROI                      | `paidSourceCosts()` = nguồn `cost > 0` **và** `costPerGood ≠ null`, sắp tăng dần; `times = round(dear.costPerGood ÷ cheap.costPerGood)` | từng nguồn                                | `plan.ts:151-168·221-234`        |
| 4   | `plan.ts` StatCard `gia-lead-tot`       | `Σcost(nguồn trả tiền) ÷ Σgood(nguồn trả tiền)`                                                                                         | như (3)                                   | `plan.ts:246-248·278`            |
| 5   | `performance.ts` KPI `gia-moi-lead-tot` | `Σcost(nguồn owner = Marketing) ÷ Σgood(nguồn đó)`                                                                                      | **không cắt theo kỳ** dù cả thẻ đang cắt  | `performance.ts:454-467·492-495` |

Giá trị hôm nay (tính lại từ fixture): lead tốt cả sổ **34**; theo nguồn
CD-0101 **9** · CD-0102 **7** · SK-0103 **6** · SK-0104 **4** · CD-0105 **1** ·
SK-0106 **3** · GT **3** · TM **1**.

| Nguồn   | Chi   | Lead tốt | Giá mỗi lead tốt         |
| ------- | ----- | -------- | ------------------------ |
| CD-0101 | 18tr  | 9        | **2,0tr** ← rẻ nhất      |
| CD-0102 | 26tr  | 7        | 3,71tr                   |
| SK-0104 | 21tr  | 4        | 5,25tr                   |
| CD-0105 | 6tr   | 1        | 6,0tr                    |
| SK-0103 | 84tr  | 6        | 14,0tr                   |
| SK-0106 | 145tr | 3        | **48,3tr** ← đắt nhất    |
| GT · TM | 0     | 3 · 1    | bị loại khỏi bảng so giá |

Ba mẫu số (2)(4)(5) **hôm nay ra cùng một con số 10,0tr** vì `300tr ÷ 30`, và
ba tập nguồn đó tình cờ trùng nhau: nguồn có đợt = nguồn trả tiền = nguồn của
Marketing. Đây là **trùng của fixture, không phải trùng của định nghĩa** — xem
§6.1.

### 3.3 · Chi phí lên màn ở đâu

| Màn                      | Ô                                                                               | Chữ hiện                                | Dòng                                 |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| `/sales/campaigns`       | StatCard "Chi phí mỗi lead tốt"                                                 | `hint: đã tiêu {millions(totals.cost)}` | `campaigns.tsx:232-238`              |
| `/sales/campaigns/:code` | StatCard "Chi phí mỗi lead tốt"                                                 | `hint: đã tiêu {millions(source.cost)}` | `campaign-detail.tsx:326-332`        |
| `/sales/performance`     | cột "Giá mỗi lead tốt" + hint "chi phí của một nguồn không chia được theo ngày" |                                         | `performance.tsx:1096·1119-1124`     |
| `/sales/plan`            | StatCard "Giá mỗi lead tốt" + đề xuất ngân sách                                 |                                         | `plan.ts:276-281`, `plan.ts:226-233` |

**Không có màn nào cho phép NHẬP chi phí.** `CampaignDraft`
(`campaign-model.ts:98-104`) có `name · kind · venue · audience · waves`, không
có ô tiền; `DraftWave` (`campaigns.ts:168-180`) có `label · channel · afterDays
· expected · content`, cũng không. Chiến dịch tạo mới ra đời với chi phí không
xác định.

---

## §4 · Số bị khoá — hàng rào `scenario.test.ts`

Chỉ liệt kê phần liên quan sổ lead / nguồn / chi phí. Không assertion nào nhắc
tới `cost`.

| #   | Assertion                                                                                           | Giá trị bị khoá                             | Dòng                  |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------- |
| 1   | `dasVina.frozenAt`                                                                                  | `2026-08-17T09:10:00+07:00`                 | `scenario.test.ts:48` |
| 2   | `FUNNEL[0]` · `FUNNEL[cuối]` · đơn điệu giảm                                                        | `100` · `6` · giảm nghiêm ngặt              | 115-121               |
| 3   | `EXIT_REASONS` số phần tử và tổng                                                                   | `6` lý do · tổng = `BOOK_SPLIT.exited` = 52 | 123-127               |
| 4   | `signed + running + exited`                                                                         | `6 + 42 + 52 = 100`                         | 131-135               |
| 5   | `LEADS.length`, mã và **tên công ty** không trùng                                                   | `100` dòng, 100 mã, 100 tên                 | 139-143               |
| 6   | số dòng từ MQL trở lên / từ SQL trở lên                                                             | `44` · `30`                                 | 145-149               |
| 7   | ba phần đếm lại từ chính `LEADS`                                                                    | `{signed:6, running:42, exited:52}`         | 151-157               |
| 8   | mỗi lý do rơi khớp `count` của nó                                                                   | 21·10·8·6·4·3                               | 159-163               |
| 9   | 10 dòng có `dealCode` khớp **thứ tự** `OPEN_DEALS`, và `company/owner/stage/daysHere` khớp từng đơn | 10 cặp                                      | 165-177               |
| 10  | mọi dòng `sql` có `requiredFilled === 6`; `answered === req + opt`; `filled.length === answered`    | với cả 100 dòng                             | 179-185               |
| 11  | `INIT_DATA_QUESTIONS` 10 câu · `REQUIRED_SLOTS === 6` · cổng hoạt động hai chiều                    | `10` · `6`                                  | 187-199               |
| 12  | mọi lead có timeline, không mốc nào vượt `dayISO(108)`                                              |                                             | 201-207               |
| 13  | **`SOURCES` đúng 8 nguồn, tổng `leads` = 100**                                                      | `8` · `100`                                 | 211-214               |
| 14  | **số dòng sổ mang mã nguồn X = `X.leads`** (cả 8 nguồn)                                             | 22·18·16·12·9·11·7·5                        | 216-220               |
| 15  | **Σ`wave.leads` = `Source.leads`** với mọi nguồn có đợt                                             | 6 nguồn                                     | 222-227               |
| 16  | **`opened ≤ sent`, `replied ≤ sent`, `leads ≤ replied`** với mọi đợt                                | 20 đợt                                      | 229-237               |
| 17  | sự kiện: `checkedIn ≤ registered`, `venue` không rỗng                                               | 3 sự kiện                                   | 239-244               |
| 18  | mọi thước `CREDIT_RULES` có mặt trong `ROLE_KPI_MODEL` đúng vai                                     | gồm "Giá mỗi lead tốt"                      | 248-260               |
| 19  | mỗi vai đúng 1 thước chính; thước `paced` không được là `ty-le`                                     |                                             | 262-278               |
| 20  | 4 mốc đời cộng cả kỳ = 4 bậc phễu                                                                   | `100 · 44 · 30 · 6`, và `roi` = 52          | 289-300               |
| 21  | thứ tự mốc: `vào sổ ≤ MQL ≤ SQL ≤ ký`; có `sql` thì phải có `mql`                                   |                                             | 302-309               |
| 22  | mọi mốc nằm trong `[dayISO(0), dayISO(108)]`; có ít nhất một `bdCham`                               |                                             | 311-323               |
| 23  | `HANDOFF_SLA` đúng hai chặng `['mkt-bd','bd-sale']`; mọi chặng đo được ≥ 0 ngày                     |                                             | 325-334               |

Hàng rào phụ ở tầng app (cũng đỏ được):

| Test                       | Khoá gì                                                                                                                                                           | Dòng    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `campaigns.test.tsx`       | chuỗi `"{88}/{101} lead từ các đợt"`; `Σleads(6 nguồn có đợt) < 100`; `"{8} nguồn cả kỳ · {3} sự kiện"`; đủ 8 mã trên bảng; sắp xếp mặc định theo `startDay` desc | 62-144  |
| `campaigns.test.tsx`       | form tạo chép đúng `sent`/`day`/`expected` của **nguồn mẫu** (nguồn có đợt, nhiều lead nhất = CD-0101)                                                            | 202-247 |
| `campaign-detail.test.tsx` | mỗi đợt hiện `"{leads} lead trên kỳ vọng {expected}"`                                                                                                             | 52-73   |
| `plan.test.tsx`            | khối "Căn cứ" phải nêu mã khớp `SOURCES`                                                                                                                          | 70-79   |
| `sales-config.test.tsx`    | `"{12} lead"` và `"{2} nguồn tự nhiên"` ở mục 5.7                                                                                                                 | 211-222 |

---

## §5 · Điểm cắm đề xuất

### 5.a · Tầng `ProspectBatch` / `ProspectRow` trước sổ lead

| Chỗ cắm                                                                                                                                                         | Làm gì                                                       | Đụng file                                           | Làm đỏ test nào                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 · thêm `Wave.batch?: ProspectBatch`** giữ nguyên `sent` như trường suy ra (`batch.rows.length`)                                                            | rẻ nhất, dây nối một chiều                                   | `das-vina.ts:625-652`                               | không — miễn giữ `opened ≤ sent`, `replied ≤ sent` (test #16)                                                                                                                                                     |
| **A2 · mảng `PROSPECTS` đặt cạnh `ROWS`/`SOURCE_PLAN`, cùng kiểu "mảng song song theo chỉ số"** — `ProspectRow` mang `sourceCode`, `waveNo`, `becameLeadIndex?` | chép đúng nhịp đang có; `buildBook` đọc thêm một mảng thứ ba | `das-vina.ts:1136-1368`, `buildBook:1451`           | phải mở rộng guard `ROWS.length !== SOURCE_PLAN.length` (L1452) thành ba vế; không test nào đỏ nếu 100 dòng lead không đổi                                                                                        |
| **A3 · sự kiện đời lead thứ 10: `'tu-prospect'`** thêm vào `LeadEventKind` và vào `buildHistory` TRƯỚC mốc `vao-so`                                             | prospect có mặt trên timeline lead                           | `das-vina.ts:1061-1070`, `1375-1449`                | **rủi ro cao** — test #12 (mốc ≤ ngày đóng băng) và #21 (thứ tự mốc) chạy trên `history`; `leadTranscript` (`TURN_KINDS`, L1797) và `leadResearch.version` đếm theo mốc, nên thêm mốc là đổi số phiên bản báo cáo |
| **A4 · hàm tra `prospectStats(code)` đặt cạnh `sourceStats`**                                                                                                   | màn đọc qua một cửa, không tự lọc                            | `das-vina.ts:1533` (thêm hàm mới, không sửa hàm cũ) | không                                                                                                                                                                                                             |
| **A5 · `ObjectKind` thêm `'PB'`/`'PR'`** để prospect vào đồ thị E1                                                                                              | gỡ luôn đường vòng `anchorDeal` của `campaigns.ts:102`       | `packages/engines/src/types.ts:11-24`               | không, nhưng `scenario.test.ts:40` kiểm mã không trùng giữa hai kịch bản                                                                                                                                          |

**Khuyến nghị:** A1 + A2 + A4. Tránh A3 ở vòng đầu — timeline lead là chỗ ba
test và hai hàm phái sinh cùng bám vào.

### 5.b · Tầng "dòng chi phí" phân rã `Source.cost`

Ràng buộc cứng: **tổng vẫn phải bằng đúng số cũ** (18·26·84·21·6·145, tổng 300tr),
vì bốn công thức ở §3.2 đọc thẳng `Source.cost`.

| Chỗ cắm                                                                                               | Làm gì                                                           | Đụng file                                                                           | Làm đỏ test nào                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1 · `Source.costLines?: CostLine[]`, `cost` giữ nguyên là con số CHỐT**                            | thêm chi tiết, không đổi tổng; một test mới khoá `Σlines = cost` | `das-vina.ts:654-679`, dữ liệu ở `691-1053`                                         | không, nếu `cost` không đổi                                                                                                                                       |
| **B2 · `cost` thành getter suy từ `costLines`**                                                       | một nguồn sự thật                                                | như trên                                                                            | không đỏ ngay, nhưng mất chỗ để test khoá tổng — **không khuyến nghị**                                                                                            |
| **B3 · gắn `CostLine.waveNo?` và `CostLine.day`** để chi phí có trục thời gian                        | gỡ đúng lỗ hổng `performance.tsx:1096`                           | `das-vina.ts`, `performance.ts:492-495`, `performance.tsx:1091-1131`                | không đỏ; nhưng đổi `snapshot: true` của thước `gia-moi-lead-tot` (`das-vina.ts:462`) là đổi hành vi màn, cần gật                                                 |
| **B4 · một hàm `costOf(code, period?)` đặt cạnh `sourceStats`**, mọi chỗ đọc `s.cost` đổi sang gọi nó | bốn công thức hết đọc trường thô                                 | `das-vina.ts:1533`, `campaigns.ts:295`, `plan.ts:155·161`, `performance.ts:462·467` | không, nếu `period` mặc định = cả kỳ                                                                                                                              |
| **B5 · thêm ô ngân sách vào `CampaignDraft`** (`budget` ở cấp chiến dịch, `cost` ở cấp đợt)           | chiến dịch mới có tiền                                           | `campaign-model.ts:98-104`, `campaigns.ts:168-205`, `campaign-parts.tsx` form       | `campaigns.test.tsx:202-247` kiểm form theo nhãn, thêm ô mới không đỏ; nhưng nếu ô mới **bắt buộc** thì ca "nút gửi duyệt bật lên sau khi điền tên" (L249-278) đỏ |

**Khuyến nghị:** B1 + B4, rồi B3 khi có người gật việc bỏ cờ `snapshot`.

---

## §6 · Lỗ hổng thật trong code hôm nay

### 6.1 · Ba mẫu số "giá mỗi lead tốt" khác định nghĩa, trùng số do may

| Nơi                    | Tập nguồn             | Định nghĩa              |
| ---------------------- | --------------------- | ----------------------- |
| `campaigns.ts:294-295` | `waves.length > 0`    | nguồn **có đợt**        |
| `plan.ts:151-155`      | `cost > 0`            | nguồn **trả tiền**      |
| `performance.ts:84`    | `owner === MARKETING` | nguồn **của Marketing** |

Ba tập này trùng nhau đúng bằng 6 nguồn trong fixture hôm nay. Cho một nguồn
trả tiền mà chủ là BD, hoặc một nguồn tự nhiên có chi phí, là ba màn hiện ba con
số khác nhau dưới cùng một cái nhãn "Chi phí mỗi lead tốt" — và không test nào
đỏ.

### 6.2 · Thẻ Marketing trộn hai loại mẫu số trên cùng một khối

`performance.ts:446-497`: `lead-keo-ve`, `lead-tot`, `ty-le-lead-tot`,
`lead-tot-moi-dot` đều lọc theo kỳ (`inPeriod`), riêng `gia-moi-lead-tot` dùng
`sourceStats` **cả kỳ** (L455·467-468). Chọn tháng 7 thì "Lead tốt" đổi còn
"Giá mỗi lead tốt" đứng yên. Cờ `snapshot` (`das-vina.ts:462`) và hint
`performance.tsx:1096` nói ra chuyện đó bằng chữ, nhưng hai con số vẫn nằm cạnh
nhau trên một thẻ và cùng đọc là "của kỳ này".

### 6.3 · Bảng bằng chứng của Marketing không cắt kỳ

`performance.ts:454-465` dựng `sources` từ `sourceStats` — không nhận `p:
Period`. Bảng ở `performance.tsx:1091` luôn hiện số cả kỳ, kể cả khi bộ chọn kỳ
đang ở một tháng. Đây là lỗ hổng gốc mà dòng `performance.tsx:1096` đang che.

### 6.4 · "Lead tốt" đếm cả lead đã rơi

`sourceStats` (`das-vina.ts:1536`) lọc `requiredFilled >= REQUIRED_SLOTS` và
không loại `exitReason`. 14 dòng SQL đã rơi (`das-vina.ts:1158-1171`, req = 6)
vẫn tính là lead tốt. Vậy "giá mỗi lead tốt" đang chia tiền cho cả những lead đã
ra khỏi luồng.

### 6.5 · Chi phí không có trục thời gian trong khi mọi thứ khác đều có

`Wave.day` có, `Lead.createdAt` có, `leadMilestones` có 5 mốc — riêng
`Source.cost` là một số không ngày tháng. Hệ quả dây chuyền: thước
`lead-tot-moi-dot` chia được theo đợt nhưng **không có `cost` theo đợt** để làm
"giá mỗi lead tốt của một đợt", tức đợt đắt nhất của kỳ (SK-0106 đợt 2, đặt 12
về 6) không quy được ra tiền.

### 6.6 · `sent` là số chồng lặp, và không có khái niệm "người"

Xem §2.2. Ba đợt của SK-0103 cùng gửi cho đúng 120 người đã đăng ký; tổng `sent`
của nguồn là 1.000 trong khi số người thật nhiều nhất là 640. Test #16 chỉ khoá
`opened ≤ sent` trong PHẠM VI MỘT ĐỢT nên không phát hiện được.

### 6.7 · Không có đường nhập chi phí

Không màn nào, không form nào có ô tiền (§3.3). `campaign-detail.tsx:259-261`
ghi comment "đóng chiến dịch thì chi phí đã tiêu chốt sổ" — nhưng chi phí đó
không ai nhập được, và không có trường `budget` để so với `cost`.

### 6.8 · Hai kiểu cùng tên `SourceRow`

`campaigns.ts:82` (14 trường) và `performance.ts:136` (7 trường) là hai kiểu
khác nhau, cùng tên, cùng nói về một nguồn. Chưa gây lỗi vì hai file không import
lẫn nhau, nhưng thêm tầng chi phí vào một bên mà quên bên kia thì không compiler
nào nhắc.

### 6.9 · `campaignTotals.leads` = 88 ≠ `bookLeads` = 100

Có chủ ý và đã nói ra (`campaigns.ts:273-280`, `campaigns.tsx:243-246`). Ghi vào
đây vì tầng prospect sẽ đẻ ra **con số thứ ba** — số người được chạm mà chưa
thành lead — và cả ba phải nằm cùng một chỗ chứ không rải ra ba màn.

### 6.10 · Nguồn chưa có mặt trong đồ thị E1

`ObjectKind` (`types.ts:11-24`) không có tiền tố nào cho chiến dịch. `campaigns.ts:86-102`
phải mượn một `dealCode` làm neo ContextRail, và ghi rõ chỉ **1 trong 8** nguồn
ra được chuỗi thật. Prospect thêm vào sẽ chịu đúng vấn đề này nếu không mở
`ObjectKind` trước.
