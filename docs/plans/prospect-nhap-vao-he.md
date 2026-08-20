# Tầng prospect — danh sách vào hệ trước khi thành lead

Trạng thái: **NHÁP, chờ gật.** Viết 20/08. Chưa viết dòng code nào.

Câu người dùng đặt ra, nguyên văn: _"prospect được sale lấy về từ đâu đó rồi đẩy
vào hệ thống thành lead"_. Hôm nay hệ **không có tầng đó**. Đợt mở màn của
CD-0101 ghi `sent: 1.200` và không có object nào trong repo trả lời được: 1.200
người đó ở đâu ra, ai bán, giá bao nhiêu, khử trùng thế nào, có được phép liên
hệ không.

Tài liệu này thiết kế trọn tầng còn thiếu. Nó **không** đẻ thêm dòng nào vào sổ
100 lead.

---

## §0 · Chỗ thủng, đo bằng chính fixture

| Câu hỏi                                     | Hôm nay trả lời được?                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Đợt CD-0101/1 gửi cho 1.200 ai?             | **Không.** `Wave.sent` là một số nguyên, không trỏ vào gì                    |
| Danh sách đó mua của ai, bao nhiêu tiền?    | **Không.** `Source.cost` là tổng của cả nguồn, không tách phần mua danh sách |
| Trong 1.200 có bao nhiêu dòng trùng?        | **Không.** Không có khái niệm khử trùng ở bất kỳ tầng nào                    |
| Được phép gửi thư cho họ theo căn cứ nào?   | **Không.** Không trường nào ghi căn cứ liên hệ                               |
| Lead LD-0103 truy ngược về danh sách nào?   | **Không.** `Lead.source` dừng ở mã nguồn (`SK-0103`)                         |
| BD Lê Hoàng Nam gọi 5 khách "tự mở" từ đâu? | **Không.** `TM` chỉ có `leads: 5`, `cost: 0`, `waves: []`                    |

Sáu ô "Không" ở trên là toàn bộ phạm vi của tài liệu này.

Điều **đã** có và không được đụng tới: sổ 100 dòng, phễu 100·44·30·19·11·6, tám
nguồn cộng đúng 100, và 20 đợt với `sent · opened · replied · leads · expected`.
`packages/engines/src/fixtures/scenario.test.ts` khoá tất cả.

---

## §1 · Ranh giới prospect ↔ lead

### 1.1 · Luận điểm

> **Prospect nằm ở KHO DANH SÁCH, không vào sổ lead.** Kho là một cái hộc tủ
> chứa dòng dữ liệu mua/xin/xuất về. Sổ lead là danh sách những công ty mà
> phòng kinh doanh **đang có việc phải làm**. Một dòng chỉ được rời hộc tủ và
> vào sổ khi bên kia **động đậy** — trả lời, đăng ký, quét mã, nhấc máy, điền
> form.

Ràng buộc cứng, không thương lượng:

| Ràng buộc                                      | Gác ở đâu                                                      |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Sổ lead vẫn đúng **100 dòng**                  | `expect(LEADS).toHaveLength(FUNNEL[0].count)`                  |
| Phễu vẫn **100·44·30·19·11·6**                 | `describe('Phễu 01/05 → 17/08')`                               |
| Tám nguồn cộng lead vẫn ra **100**             | `SOURCES.reduce((s, x) => s + x.leads, 0) === FUNNEL[0].count` |
| `FUNNEL` vẫn **sáu bậc**, không có bậc thứ bảy | không thêm `prospect` vào `FUNNEL` — xem 1.3                   |

### 1.2 · Phản biện: "tín hiệu" là điều kiện CẦN, không phải điều kiện ĐỦ

Đề bài viết: _"chỉ khi có TÍN HIỆU (trả lời, đăng ký, check-in, gọi được, điền
form) mới sinh một dòng sổ lead"_. Phần "chỉ khi" đúng. Phần ngầm hiểu "hễ có
tín hiệu là sinh một dòng" **sai**, và fixture chứng minh được:

| Nguồn   | Tín hiệu đã có                               | Lead thật | Chênh |
| ------- | -------------------------------------------- | --------- | ----- |
| SK-0103 | 120 người **đăng ký**, 78 người **check-in** | **16**    | −104  |
| SK-0104 | 86 đăng ký, 51 check-in                      | **12**    | −74   |
| SK-0106 | 143 người **quét mã tại gian**               | **11**    | −132  |
| CD-0101 | 41 + 22 + 14 = **77 người trả lời**          | **22**    | −55   |

Nếu tín hiệu tự sinh lead thì riêng ba sự kiện đã ra 349 dòng, và sổ 100 dòng
vỡ ngay. `scenario.test.ts` còn khoá thẳng bất đẳng thức
`w.leads <= w.replied` — tức fixture **đã** giả định có một bậc trung gian giữa
"trả lời" và "vào sổ", chỉ là chưa ai đặt tên cho nó.

**Vậy có ba tầng, không phải hai:**

```
  KHO DANH SÁCH                 TÍN HIỆU                       SỔ LEAD
  ProspectRow                   (đã có, dạng số đếm)           Lead
  ─────────────                 ────────────────────           ─────────────
  5.753 dòng hợp lệ    ──────▶  Wave.replied      = 865  ─┐
  · mua · xin · xuất            Source.registered = 349   ├──▶  100 dòng
  · quét tại chỗ                Source.checkedIn  = 272   │     đúng bậc
  · nội sinh từ click           (BD gọi được: chưa đếm)  ─┘     dau-moi
  KHÔNG có mặt trong sổ         KHÔNG có mặt trong sổ           CÓ mặt
```

Tầng giữa **đã tồn tại trong fixture dưới dạng số đếm trên `Wave` và `Source`**.
Tài liệu này **không** biến nó thành dòng: biến 865 lượt trả lời thành 865
object là đẻ ra 865 con số không ai ký. Tầng giữa giữ nguyên là số đếm.

Tầng dưới cùng thì **phải** có dòng — vì đó chính là thứ người dùng hỏi ("1.200
người đó ở đâu ra"), và vì không có nó thì bước khử trùng không có gì để khử.

### 1.3 · Vì sao KHÔNG thêm bậc "prospect" vào `FUNNEL`

Cám dỗ hiển nhiên: `FUNNEL` thành bảy bậc, bậc 0 là `prospect · 5.753`. Không
làm, ba lý do đo được:

1. **`FUNNEL[0]` là hằng số neo của cả repo.** Ba chỗ đọc nó làm "số dòng sổ":
   `LEADS.length`, tổng lead tám nguồn, và `BOOK_SPLIT`. Chèn một bậc mới lên
   đầu là đổi nghĩa `FUNNEL[0]` ở cả ba chỗ trong một lần sửa.
2. **Phễu là phễu của MỘT sổ.** Bốn mốc `vaoSo · mql · sql · ky` của
   `leadMilestones` đọc từ `history` của một dòng lead. Prospect không có
   `history`, không có mốc đời, không cắt được theo tháng — nó không có chỗ
   đứng trong ca test "bốn mốc cộng cả kỳ ra đúng bốn bậc của phễu".
3. **Tỉ lệ prospect→lead không phải một tỉ lệ chuyển đổi của phòng.** 5.753 →
   100 là 1,74%, và con số đó nói về **chất lượng danh sách mua được**, không
   nói về năng lực của ai. Trộn nó vào phễu là cho một Sale trượt vì Apollo bán
   email đoán.

**Prospect đứng TRƯỚC phễu, cạnh phễu, không trong phễu.** Trên màn nó là một ô
riêng có nhãn "trước phễu", không phải bậc thứ bảy của hình phễu.

### 1.4 · Bốn cửa để một dòng prospect thành một dòng lead

Bốn cửa, không có cửa thứ năm và **không có cửa nào tự mở**:

| #   | Cửa                                    | Ai bấm              | Sinh `LeadEvent`                    |
| --- | -------------------------------------- | ------------------- | ----------------------------------- |
| 1   | Trả lời một đợt gửi                    | Marketing / Agent 1 | `vao-so` — "Vào sổ từ chiến dịch …" |
| 2   | Đăng ký / quét mã một sự kiện          | Marketing           | `vao-so` — "Vào sổ từ sự kiện …"    |
| 3   | BD gọi được và bên kia chịu nói chuyện | BD                  | `vao-so` — "… tự mở"                |
| 4   | Điền form trên trang đích              | Agent 1             | `vao-so`                            |

Cửa 1 và 4 là chỗ **Agent 1** làm việc (docs · "Bộ 10 câu và hai agent"): nhắn
lại ngay trên kênh khách vừa dùng. Nhưng vẫn chịu luật 9 — agent đề xuất "đưa
dòng này vào sổ", người bấm.

**Một dòng prospect đi qua cửa thì bị đánh dấu `da-vao-so`, không bị xoá khỏi
kho.** Đó là điều kiện để truy ngược "lead này về từ lô nào" và để lô sau khử
trùng được với lô trước.

---

## §2 · Hai đường đi

### 2.1 · Đường A — lô prospect → khán giả đợt → người trả lời → lead

```
  ProspectBatch DS-0101                 Wave CD-0101/1
  1.480 dòng thô                        khán giả = 1.200 dòng hợp lệ của lô
   − 96 trùng                    ─────▶ sent 1.200 · opened 384 · replied 41
   − 184 loại                                            │
   = 1.200 hợp lệ                                        │ 41 người trả lời
                                                          ▼
                                        11 dòng được nhận vào sổ  ──▶ Lead
                                        30 người còn lại: chỉ là replied,
                                        KHÔNG vào sổ                   nguồn
                                                                     chien-dich
        │                                                                 ▲
        │  đợt 2: 1.200 − 41 = 1.159  (người đã trả lời rời khán giả)    │
        │  đợt 3: 1.159 − 22 = 1.137                            7 + 4 lead ┘
        ▼
  cùng MỘT lô nuôi cả ba đợt · 22 lead · `leadOrigin().kind = 'chien-dich'`
```

Phép trừ `1.200 − 41 = 1.159` và `1.159 − 22 = 1.137` **khớp đúng số đã có
trong fixture** — xem §7.2. Đây không phải một luật mới ai đó nghĩ ra: nó là
luật đã nằm sẵn trong con số, chỉ chưa ai viết ra thành câu.

### 2.2 · Đường B — lô prospect → BD gọi trực tiếp → lead nguồn `tu-mo`

```
  ProspectBatch DS-0108                 KHÔNG có đợt nào
  LinkedIn Sales Navigator              BD Lê Hoàng Nam mở danh sách,
  248 thô − 22 trùng − 46 loại   ─────▶ gọi từng dòng
  = 180 hợp lệ                                    │
  chi phí 0 đ (tài khoản trả theo tháng)          │ gọi được và bên kia
                                                   │ chịu nói chuyện
                                                   ▼
                                        5 dòng vào sổ  ──▶ Lead nguồn TM
                                        175 dòng còn nằm kho     'tu-mo'
```

Khác đường A ở đúng ba chỗ, và cả ba đều là hệ quả của "không có đợt":

| Chỗ khác | Đường A                   | Đường B                                |
| -------- | ------------------------- | -------------------------------------- |
| Khán giả | `Wave.sent` giữ con số    | không có `Wave` → **không có chỗ giữ** |
| Tín hiệu | `Wave.replied` giữ con số | **chưa có trường nào đếm "gọi được"**  |
| Chi phí  | nằm trong `Source.cost`   | `TM.cost = 0` — lô cũng 0 đ            |

Chỗ thủng của đường B: `TM` là `SourceKind = 'tu-nhien'`, `waves: []`, nên tỉ lệ
"gọi 180 dòng ra 5 lead = 2,8%" **không suy được từ fixture** — 180 là số phải
đặt (§7.4). Đó là cái giá của việc đường B không có đợt, và nói ra tốt hơn là
đẻ một `Wave` giả cho `TM` chỉ để có chỗ nhét số.

### 2.3 · `OriginKind` — KHÔNG thêm giá trị thứ năm

Đề nghị bị bác. Ba bằng chứng:

1. **Bốn giá trị hiện có trả lời câu "về bằng ĐƯỜNG nào", lô trả lời câu "danh
   sách của AI".** Hai câu khác nhau. Một lead của CD-0101 vừa về _bằng chiến
   dịch_ vừa _từ lô DS-0101_ — nhét cả hai vào một enum là làm bốn giá trị hết
   loại trừ nhau. Đây đúng là lỗi mà fixture đã tránh một lần rồi, ở docblock
   `Source.followers`: _"Chủ nguồn KHÔNG nằm trong đây… Trộn hai vai vào một
   danh sách thì mất luôn câu trả lời 'hỏi ai khi số hụt'."_
2. **`ORIGIN_FACE` ở `apps/web/src/data/leads.ts` là
   `Record<OriginKind, {label, icon, openLabel}>` — exhaustive.** Thêm giá trị
   thứ năm là lỗi kiểu ở mọi chỗ đọc bảng, và nhãn mới ("Nhập danh sách") sẽ
   đứng cạnh "Tạo trực tiếp" trên cùng một chip trong khi hai thứ đó mô tả cùng
   một lead của đường B.
3. **`leadOrigin()` suy `kind` từ `SourceKind` + mã nguồn.** Giá trị thứ năm cần
   một `SourceKind` thứ tư, tức đụng vào `Source` — mà `Source` là hình dạng E5
   sẽ nhận (docs · "E5 · Chiến dịch"). Sửa nó vì một chuyện của prospect là để
   tầng dưới ép hình tầng trên.

**Thay bằng một trục thứ hai, trực giao:**

```ts
export type LeadOrigin = {
  kind: OriginKind // KHÔNG ĐỔI — vẫn bốn giá trị
  code: string
  label: string
  owner: string
  channel?: WaveChannel
  venue?: string
  checkedIn?: number
  registered?: number
  startedAt: string
  note: string

  /** THÊM · Lô danh sách đứng sau lead này, nếu truy được.
   *
   *  Trục THỨ HAI, không phải giá trị thứ năm của `kind`: "về bằng đường nào"
   *  và "danh sách của ai" là hai câu hỏi khác nhau, và một lead của chiến dịch
   *  trả lời cả hai. Trộn vào `kind` là làm bốn giá trị hết loại trừ nhau.
   *
   *  `undefined` là câu trả lời hay gặp và hợp lệ: 22 trong 100 lead không có
   *  lô nào đứng sau — 15 lead về từ reach nền tảng (không ai gửi cho ai) và 7
   *  lead do khách cũ giới thiệu (gọi thẳng, không qua danh sách). Điền một mã
   *  lô cho đủ ô là phá đúng thứ trường này sinh ra để đo. */
  batch?: { code: string; supplier: string; importedAt: string }
}
```

**Hệ quả phải sửa kèm:** câu `note` của `tu-mo` hôm nay là
_"`${src.owner}` tự mở, tạo trực tiếp trong sổ — không đi qua đợt nào."_ Với
DS-0108 thì nửa sau sai: Lê Hoàng Nam không nghĩ ra công ty đó, anh gọi nó trên
một danh sách LinkedIn. Câu mới: _"Lê Hoàng Nam tự mở — gọi trực tiếp từ lô
DS-0108, không đi qua đợt gửi nào."_ Đây là thay đổi **chữ trong `leadOrigin()`**,
không phải thay đổi kiểu.

---

## §3 · Kiểu dữ liệu

Đặt trong `packages/engines/src/fixtures/das-vina.ts`, ngay trên khối
`// Module 1 · Chiến dịch & Sự kiện` — vì lô đứng **trước** nguồn về thời gian,
và `Source` sẽ trỏ ngược lên nó. Một kịch bản một file: đó là điều kiện để
`aurora/no-scenario-mix` còn gác được (tiền lệ: `ke-hoach-va-cau-hinh.md` §6).

### 3.1 · Danh mục đóng

```ts
// ---------------------------------------------------------------------------
// KHO DANH SÁCH — tầng prospect. Nằm TRƯỚC sổ lead và TRƯỚC phễu.
//
// Một dòng ở đây KHÔNG phải một lead: nó là một công ty mà chưa ai bên đó động
// đậy. Nó vào sổ lead khi và chỉ khi đi qua một trong bốn cửa của
// docs/plans/prospect-nhap-vao-he.md §1.4 — và cửa nào cũng cần một người bấm.
//
// Vì thế `PROSPECT_BATCHES` KHÔNG đẻ dòng nào vào `LEADS`: nó giải thích
// `Wave.sent` đã có, không thêm số mới vào phễu.
// ---------------------------------------------------------------------------

/** Danh sách này ở đâu ra. Quyết định luôn ba thứ khác: có tốn tiền không, khử
 *  trùng chặt tới đâu, và căn cứ liên hệ mặc định là gì.
 *
 *  Tách `noi-sinh` khỏi `tai-cho` dù cả hai đều là dữ liệu của chính mình: một
 *  đằng người tự bấm vào bài rồi để lại địa chỉ ở nhà họ, một đằng người đứng
 *  trước gian hàng đưa mã cho mình quét. Hai mức đồng ý khác nhau, và khi ai đó
 *  khiếu nại thì hai chỗ đó phải trưng ra hai loại bằng chứng khác nhau. */
export type ProspectSupplierKind =
  /** Mua của bên bán dữ liệu — Apollo.io, Sales Navigator, môi giới danh sách. */
  | 'mua'
  /** Xin/được cấp — danh bạ KCN, danh sách hội viên hiệp hội, khách mời BTC. */
  | 'hiep-hoi'
  /** Xuất từ chính hệ của mình — sổ cũ, khách im, danh sách đã thôi theo dõi. */
  | 'noi-bo'
  /** Người tự để lại thông tin trên trang đích của mình. */
  | 'noi-sinh'
  /** Thu tại chỗ — quét mã ở gian hàng, sổ ký tên ở cửa hội thảo. */
  | 'tai-cho'

/** Căn cứ để được phép liên hệ. Đây là RÀNG BUỘC SẢN PHẨM theo Nghị định
 *  13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân — không phải tư vấn pháp lý, và
 *  không phải thứ màn được để trống.
 *
 *  Điểm mấu chốt của cách chia này: dữ liệu PHÁP NHÂN (tên công ty, mã số thuế,
 *  tổng đài, hòm thư chung) không phải dữ liệu cá nhân; dữ liệu CÁ NHÂN (họ tên
 *  người, chức danh, di động, hòm thư đích danh) thì phải có căn cứ. Một lô chỉ
 *  có cột pháp nhân đi đường `cong-khai-phap-nhan`; hễ lô có một cột cá nhân
 *  thì căn cứ trở thành ô BẮT BUỘC ở bước 5 (§6.5). */
export type ProspectLegalBasis =
  /** Chỉ dùng dữ liệu pháp nhân công khai, liên hệ ở địa chỉ pháp nhân. */
  | 'cong-khai-phap-nhan'
  /** Người đó tự để lại thông tin và có dấu vết đồng ý (form, đăng ký, quét mã). */
  | 'dong-y-truc-tiep'
  /** Đã từng là khách hoặc đã từng làm việc với mình. */
  | 'quan-he-cu'

/** Vòng đời một lô. `het-han-luu` là trạng thái THẬT, không phải một cách nói
 *  "đã xoá": lô hết hạn lưu thì phần dòng chưa vào sổ bị xoá, còn phần đã vào
 *  sổ và phần số liệu tổng ở lại — nếu không thì mọi con số truy nguồn của các
 *  kỳ trước biến mất theo. */
export type ProspectBatchState =
  | 'nhap' // đang ở giữa luồng năm bước, chưa xác nhận
  | 'cho-duyet' // có dòng đè lên lead đang có chủ, hoặc chi phí vượt ngưỡng → E3
  | 'da-nhap' // đã vào kho, dùng làm khán giả được
  | 'tu-choi' // người gật bác
  | 'het-han-luu' // quá `retentionDays`, phần chưa vào sổ đã xoá

/** Vì sao một dòng bị loại. Danh sách ĐÓNG, không có ô "khác" — cùng luật với
 *  `EXIT_REASONS` (docs · module 5 · luật 3). Thêm lý do thứ tám là một hành
 *  động cấu hình có chủ, không phải chỗ để người nhập gõ tự do. */
export type ProspectRejectReason =
  | 'khong-dinh-danh-duoc' // không có cả tên công ty lẫn mã số thuế
  | 'khong-lien-he-duoc' // không email, không điện thoại, không website
  | 'email-sai-dinh-dang'
  | 'dien-thoai-khong-chuan-hoa-duoc' // không đưa được về +84
  | 'mst-sai-do-dai' // không phải 10 hoặc 13 chữ số
  | 'nam-trong-danh-muc-chan' // đã từ chối nhận liên hệ — chặn vĩnh viễn
  | 'thieu-can-cu-lien-he' // có cột cá nhân mà lô không khai căn cứ

/** Trạng thái một dòng sau bước soát. Bốn giá trị đầu là "không nhập", ba giá
 *  trị sau là "nhập, nhưng biết mình đang nhập cái gì". */
export type ProspectRowState =
  | 'trung-trong-file' // trùng một dòng khác của chính file này
  | 'trung-lo-cu' // trùng một dòng đã có trong kho
  | 'da-ky' // khớp một công ty đã ký hợp đồng — chặn cứng
  | 'bi-loai' // dính một `ProspectRejectReason`
  | 'da-co-chu' // khớp một lead đang chạy CÓ chủ — nhập nhưng không gửi
  | 'da-roi' // khớp một lead đã ra khỏi luồng — nhập, kèm lý do cũ
  | 'hop-le' // sạch, dùng làm khán giả được
```

### 3.2 · `ProspectBatch`

```ts
/** Bộ lọc đã dùng để lấy danh sách này — chép lại đúng thứ người mua đã gõ
 *  trên trang của nhà cung cấp.
 *
 *  Đây là trường đắt nhất của cả lô và là trường dễ bị bỏ nhất. Không có nó,
 *  một lô tốt là một lần may: sáu tuần sau không ai dựng lại được cùng bộ lọc
 *  để mua lô thứ hai, và không ai nói được vì sao lô kia tệ. Có nó thì "mua lại
 *  đúng như DS-0101" là một câu hỏi trả lời được.
 *
 *  Cố tình để dạng cặp nhãn–giá trị chứ không phải một cấu trúc truy vấn: mỗi
 *  nhà cung cấp có một ngôn ngữ lọc riêng, và ép cả ba vào một cú pháp chung là
 *  đúng cái sai mà bước KHỚP CỘT sinh ra để tránh (§4.4). */
export type ProspectFilter = { label: string; value: string }

export type ProspectBatch = {
  /** Mã lô, hệ cấp, `DS-01xx`. Đọc được trên giao diện và là khoá truy ngược từ
   *  một dòng lead về danh sách đã đẻ ra nó. */
  code: string
  /** Tên nhà cung cấp, chép đúng như trong danh mục ở module 5 · mục 5.8. */
  supplier: string
  supplierKind: ProspectSupplierKind
  /** Tên file gốc. Giữ nguyên cả phần mở rộng — ".xlsx" trong tên là lời nhắc
   *  rằng lô này người dùng đã phải chuyển sang CSV bằng tay (§4.1). */
  fileName: string
  /** Vân file (SHA-256, 12 ký tự đầu). Dùng để chặn nhập lại đúng một file lần
   *  hai — lỗi thật hay gặp nhất khi hai người cùng lo một chiến dịch. */
  fileHash: string

  /** Ngày nhập, tính bằng ngày kể từ 01/05 — cùng thang với `Source.startDay`.
   *
   *  Bất biến bắt buộc: lô phải được nhập TRƯỚC đợt đầu tiên nó nuôi. Không có
   *  ràng buộc này thì timeline nói ngược — gửi thư cho một danh sách chưa có.
   *  `scenario.test.ts` khoá. */
  importedDay: number
  /** Ai bấm nút nhập. Phải có tên trong `actors`. */
  importedBy: string

  /** Bộ lọc đã dùng. Rỗng là hợp lệ với lô nội sinh và lô thu tại chỗ — chúng
   *  không lọc gì, chúng nhận ai tới thì nhận. */
  filters: ProspectFilter[]

  // ---- bốn con số của bước soát · rowsRaw = valid + duplicate + rejected ----
  /** Số dòng trong file, không kể hàng tiêu đề. */
  rowsRaw: number
  /** Trùng — trong chính file này HOẶC với một lô đã có trong kho. */
  rowsDuplicate: number
  /** Bị loại vì một `ProspectRejectReason`. */
  rowsRejected: number
  /** Dòng dùng được. ĐÂY là con số bằng đúng `Wave.sent` của đợt mở màn dùng
   *  lô này — quan hệ đó là lý do cả tầng prospect tồn tại, và nó bị khoá bằng
   *  test chứ không bằng lời hứa. */
  rowsValid: number

  state: ProspectBatchState
  /** Chi phí mua lô, đồng.
   *
   *  ĐÂY LÀ MỘT PHẦN CỦA `Source.cost`, KHÔNG PHẢI KHOẢN CỘNG THÊM. Chi của cả
   *  kỳ vẫn là 300 triệu; con số này chỉ nói trong 18 triệu của CD-0101 thì 8
   *  triệu là tiền danh sách và 10 triệu là tiền soạn với gửi. Cộng nó vào tổng
   *  kỳ một lần nữa là đếm đôi, và màn kế hoạch sẽ thấy 331 triệu. */
  cost: number

  legalBasis: ProspectLegalBasis
  /** Lô có cột dữ liệu cá nhân (họ tên · chức danh · di động · hòm thư đích
   *  danh) hay không. `true` thì `legalBasis` là ô bắt buộc ở bước 5. */
  hasPersonalData: boolean
  /** Số ngày giữ dòng chưa vào sổ, kể từ `importedDay`. Hết hạn thì phần chưa
   *  vào sổ bị xoá; phần đã vào sổ ở lại vì nó đã có căn cứ riêng của nó. */
  retentionDays: number

  /** Lô này nuôi đợt nào. `waves` là SỐ THỨ TỰ đợt trong `Source.waves`.
   *
   *  Một lô nuôi được nhiều đợt của cùng một nguồn (CD-0101 gửi lại đúng danh
   *  sách đó ba lần), và một nguồn dùng được nhiều lô (SK-0106 mua danh sách
   *  khách mời cho đợt 1, rồi quét mã tại gian thành lô thứ hai cho đợt 2–3).
   *  Vì thế quan hệ là nhiều–nhiều và phải khai ở đây chứ không phải bằng một
   *  trường `batch` trên `Wave`.
   *
   *  Rỗng = lô chưa dùng cho đợt nào. Với đường B (§2.2) đó là trạng thái BÌNH
   *  THƯỜNG, không phải lô bị bỏ quên: BD gọi tay, không gửi đợt nào. */
  usedBy: { source: string; waves: number[] }[]

  /** Một câu nói rõ lô này là gì, viết cho người đọc bảng chứ không cho máy. */
  note: string
}
```

### 3.3 · `ProspectRow`

```ts
/** MỘT DÒNG của một lô.
 *
 *  Kịch bản đóng băng KHÔNG chép tay 5.753 dòng — nó chỉ chép các dòng mà màn
 *  nhập cần để bày ra được bước 3 và bước 4 (§6). Con số tổng của lô nằm ở
 *  `ProspectBatch`, và bốn con số đó là thứ `scenario.test.ts` khoá.
 *
 *  Đó không phải một lối tắt của POC: đây là hình dạng đúng cả khi có backend.
 *  Đầu lô là số liệu người quản lý đọc; dòng lô là dữ liệu nghiệp vụ mà E2 phải
 *  gác từng dòng và Nghị định 13 đòi xoá được từng dòng. Hai thứ đó có vòng đời
 *  khác nhau nên không nằm chung một object. */
export type ProspectRow = {
  /** `DS-0101/0007` — mã lô + số thứ tự dòng trong file gốc. Số thứ tự giữ
   *  nguyên kể cả khi dòng bị loại, để người dùng mở file gốc ra đối chiếu
   *  được đúng dòng đó. */
  id: string
  batch: string

  // ---- định danh pháp nhân · phải có ít nhất một trong hai --------------
  /** Tên như trong file, GIỮ NGUYÊN DẤU. Đây là chữ hiện lên màn. */
  companyRaw: string
  /** Tên đã chuẩn hoá — bỏ dấu, hạ thường, bỏ tiền tố loại hình, nén khoảng
   *  trắng. Chỉ dùng làm KHOÁ khử trùng, không bao giờ hiện lên màn. */
  companyKey: string
  /** Mã số thuế, chỉ còn chữ số (13 số viết `xxxxxxxxxx-xxx`). Khoá khử trùng
   *  mạnh nhất — một pháp nhân đúng một mã. */
  taxCode?: string
  province?: string

  // ---- liên hệ · đây là phần Nghị định 13 nói tới -----------------------
  contactName?: string
  contactTitle?: string
  /** Đã hạ thường và trim. */
  email?: string
  /** Tên miền của `email`, tách sẵn để khử trùng. `undefined` khi tên miền là
   *  tên miền công cộng (gmail.com, yahoo.com…) — hai người khác công ty cùng
   *  dùng Gmail không phải một công ty, và dùng nó làm khoá sẽ gộp nhầm cả một
   *  tỉnh vào một dòng. */
  emailDomain?: string
  /** Chuẩn hoá về `+84…`. Không chuẩn hoá được thì dòng bị loại, không giữ
   *  nguyên bản gốc: một số điện thoại nửa vời trên màn trông y hệt một số gọi
   *  được. */
  phone?: string
  website?: string

  // ---- các ô đọc thẳng được từ file, ánh xạ vào bộ 10 câu ---------------
  industryRaw?: string
  /** Ngành đã khớp về `LEAD_CATEGORIES`. `undefined` khi không khớp — KHÔNG ép
   *  về ngành gần nhất. Bốn ngành của phòng là bốn ngành có Sale phụ trách;
   *  gán bừa một dòng vào 'chip' là giao việc cho Đỗ Quang Huy bằng một phép
   *  đoán. */
  category?: LeadCategory
  headcount?: number
  plants?: number
  /** Cột ghi chú của nhà cung cấp. KHÔNG BAO GIỜ tự thành ô số 6 — xem §4.3. */
  note?: string

  // ---- kết quả bước soát -------------------------------------------------
  state: ProspectRowState
  rejectReason?: ProspectRejectReason
  /** Dòng/lead mà dòng này trùng vào. `DS-0101/0007` hoặc `LD-0142`. */
  matchedWith?: string
  /** Khoá nào bắt được trùng. Hiện thẳng lên bảng soát: người dùng phải thấy
   *  hệ khớp bằng mã số thuế hay khớp bằng tên — hai mức tin cậy rất khác nhau. */
  matchedBy?: 'mst' | 'ten-mien' | 'ten-tinh'

  /** Dòng này đã đi qua một trong bốn cửa và thành một dòng sổ lead.
   *
   *  Dòng KHÔNG bị xoá khỏi kho khi vào sổ — nếu xoá thì lô sau không khử trùng
   *  được với lead đã có, và câu "lead này về từ lô nào" mất câu trả lời. */
  leadCode?: string
}
```

### 3.4 · Ba trường thêm ở nơi khác

| File                         | Thêm gì                                                     | Vì sao                                                                                      |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `das-vina.ts` · `LeadOrigin` | `batch?: { code; supplier; importedAt }`                    | trục thứ hai, §2.3                                                                          |
| `das-vina.ts`                | `PROSPECT_BATCHES: ProspectBatch[]` · `prospectStats(code)` | tám lô của §7 + hàm đọc số, cùng hình với `SOURCES` / `sourceStats`                         |
| `engines/src/types.ts`       | `'DS'` vào `ObjectKind` — **cần gật**                       | để ContextRail vẽ được `DS-0102 → LD-0103 → OP-0288`; nhưng đây là **sửa engine cho cả hệ** |

Ghi chú về `'DS'`: chiến dịch cũng chưa có `ObjectKind` riêng — docblock
`SourceRow.anchorDeal` ở `apps/web/src/data/campaigns.ts` nói thẳng điều đó và
đang phải mượn một mã đơn để rail có cái mà vẽ. Thêm `'DS'` mà không thêm
`'CD'`/`'SK'` là vá nửa chỗ thủng. **Cần gật: thêm cả ba, hay chưa thêm cái nào
và lô cũng mượn rail như chiến dịch đang mượn.**

Trường **cố tình KHÔNG thêm**: `Lead.waveNo`. Nó sẽ cho phép nói "LD-0103 về từ
đợt 1 của SK-0103, tức từ lô DS-0102". Nhưng thêm nó là gán một đợt cho từng
dòng trong 100 dòng — 100 con số mới không ai ký, và `buildBook()` sẽ phải đoán.
Hệ quả chấp nhận được: **truy ngược lô chỉ tới mức NGUỒN, không tới mức DÒNG**,
trừ khi lô là lô duy nhất của nguồn (5 trong 8 lô rơi vào trường hợp đó). Xem
§7.3.

---

## §4 · Định dạng tài liệu đẩy vào

### 4.1 · Ba đường, hai đường bắt buộc ở POC

| Đường                | POC           | Vì sao                                                                                                                                                                              |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV UTF-8 có BOM** | **BẮT BUỘC**  | Định dạng chuẩn. Đọc được bằng `FileReader` + một hàm tách dòng ~40 dòng, không thư viện                                                                                            |
| **Dán trực tiếp**    | **BẮT BUỘC**  | Rẻ nhất và là **đường thoát cho .xlsx**: mở Excel → bôi đen → Ctrl+C → dán. Dán từ Excel ra TSV, tách bằng tab. Không thư viện, không upload                                        |
| **XLSX**             | giai đoạn hai | Đọc .xlsx là giải nén zip + đọc XML + bảng chuỗi dùng chung. Đó là một dependency thật (`xlsx`/`exceljs`, ~500 KB) cho một POC front-end đóng băng. Có "dán trực tiếp" thì chưa cần |

**Vì sao BOM là bắt buộc, không phải tuỳ chọn.** File mẫu hệ phát ra **phải** có
BOM (`EF BB BF`) ở đầu, vì người dùng thật mở CSV bằng Excel, và Excel bản Việt
mở CSV UTF-8 **không** BOM sẽ hiện `CÃ´ng ty TNHH DAS Vina`. Ở chiều ngược lại,
hệ đọc file vào thì **chấp nhận cả có lẫn không BOM** và tự bỏ ba byte đầu — bắt
người dùng tự thêm BOM là bắt họ làm việc của máy.

**Dấu phân tách phải tự dò, không được ép dấu phẩy.** Máy Việt Nam đặt _List
separator_ = `;`, nên Excel ở đó xuất CSV bằng dấu chấm phẩy. Hệ dò trên hàng
tiêu đề: đếm `,` · `;` · `\t`, lấy dấu ra nhiều cột nhất, rồi **nói ra đã chọn
dấu nào** ở bước 2 — im lặng đoán đúng vẫn tệ hơn đoán đúng và nói.

**Giới hạn POC — cần gật:** 5 MB · 5.000 dòng dữ liệu · 60 cột.

### 4.2 · Bảng đặc tả cột

15 cột. Cột nào cũng nhận **tên khác** ở bước khớp cột — bảng này là tên trong
**file mẫu của hệ**, không phải tên bắt buộc trong file người dùng.

| #   | Cột trong file mẫu | Kiểu     | Bắt buộc                 | Ví dụ                        | Chuẩn hoá                                                                         | Ánh xạ sang ô của bộ 10 câu                |
| --- | ------------------ | -------- | ------------------------ | ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | `ten_cong_ty`      | chuỗi    | **✔** (một trong 1 · 2)  | `Công ty TNHH DAS Vina`      | trim · nén khoảng trắng · giữ dấu để hiện; sinh thêm `companyKey` để khử trùng    | **ô 1** — nửa "tên pháp nhân"              |
| 2   | `ma_so_thue`       | chuỗi số | **✔** (một trong 1 · 2)  | `2300123456`                 | bỏ mọi ký tự không phải số; phải là 10 hoặc 13 chữ số, 13 viết `……-…`             | **ô 1** — nửa "mã số thuế"                 |
| 3   | `tinh`             | chuỗi    | **✔**                    | `Bắc Ninh`                   | khớp về danh mục tỉnh; không khớp thì **cảnh báo, không chặn**                    | — (vào `Lead.province`, không thuộc ô nào) |
| 4   | `nganh`            | chuỗi    | ✕                        | `Đóng gói chip bán dẫn`      | khớp về `LEAD_CATEGORIES`; không khớp thì để trống, **không ép**                  | **ô 2** — nửa "ngành"                      |
| 5   | `san_pham_chinh`   | chuỗi    | ✕                        | `Đóng gói và kiểm thử IC`    | trim                                                                              | **ô 2** — nửa "sản phẩm chính"             |
| 6   | `so_nguoi`         | số       | ✕                        | `1400`                       | bỏ dấu ngăn nghìn; nhận cả khoảng `501-1000` → lấy cận dưới, **gắn cờ ước lượng** | **ô 3** — nửa "số người"                   |
| 7   | `so_nha_may`       | số       | ✕                        | `1`                          | số nguyên ≥ 0                                                                     | **ô 3** — nửa "số nhà máy"                 |
| 8   | `nguoi_lien_he`    | chuỗi    | ✕                        | `Kim Dae-ho`                 | trim · **dữ liệu cá nhân**                                                        | **ô 4** — nửa "người liên hệ" ⚠ xem 4.3    |
| 9   | `chuc_danh`        | chuỗi    | ✕                        | `Giám đốc nhà máy`           | trim · **dữ liệu cá nhân**                                                        | **ô 4** — nửa "chức danh" ⚠                |
| 10  | `email`            | chuỗi    | ✕                        | `daeho.kim@dasvina.vn`       | hạ thường · trim · tách `emailDomain`; domain công cộng thì không làm khoá        | **ô 5** ⚠ xem 4.3                          |
| 11  | `dien_thoai`       | chuỗi    | ✕                        | `0912 300 391`               | bỏ khoảng trắng và dấu · `0…` → `+84…` · không chuẩn hoá được thì **loại dòng**   | **ô 5** ⚠                                  |
| 12  | `website`          | chuỗi    | ✕                        | `dasvina.vn`                 | bỏ `https://` · `www.` · hạ thường · bỏ đường dẫn sau tên miền                    | — (khoá khử trùng + căn cứ "công ty thật") |
| 13  | `nguon_goc`        | chuỗi    | ✕                        | `Danh bạ KCN Bắc Ninh 2026`  | trim                                                                              | — (ghi vào lô, không vào lead)             |
| 14  | `can_cu_lien_he`   | enum     | **✔ nếu có cột 8/10/11** | `cong-khai-phap-nhan`        | khớp về `ProspectLegalBasis`; không khớp → **loại dòng**                          | — (Nghị định 13, xem §5.6)                 |
| 15  | `ghi_chu`          | chuỗi    | ✕                        | `Đang mở dây chuyền thứ hai` | trim                                                                              | — **KHÔNG tự thành ô 6**, xem 4.3          |

### 4.3 · Vì sao nhập file KHÔNG tự động qua cổng init data

Đây là phần quan trọng nhất của §4.

Cổng init data là **sáu ô bắt buộc** (`REQUIRED_SLOTS = 6`). Nhìn cột ánh xạ ở
bảng trên, file giỏi nhất trên đời điền được **năm** ô: 1 · 2 · 3 · 4 · 5. Ô 6
_"Đau ở đâu — việc khách muốn giải"_ **không có nhà cung cấp nào bán**. Apollo
không bán nỗi đau. Ban quản lý KCN không phát nỗi đau kèm danh bạ. Ô 6 chỉ ra
khi có người hỏi khách và khách trả lời — nó là ô duy nhất bắt buộc phải đi qua
một cuộc nói chuyện.

Cột `ghi_chu` (#15) là chỗ cám dỗ: nhà cung cấp hay để một câu mô tả ở đó, và
đổ nó vào ô 6 thì mọi dòng nhập vào đều "đủ sáu ô". Không làm. `ghi_chu` là
**gợi ý cho người đi hỏi**, hiện ở hồ sơ lead dưới nhãn "ghi chú của nhà cung
cấp", và không bao giờ tính vào `requiredFilled`.

Còn hai ô nữa cũng không tính:

> **Ô 4 và ô 5 từ file là thông tin CHƯA XÁC MINH.** Ô 5 viết nguyên văn là
> _"Kênh liên lạc **gọi lại được**"_. Một địa chỉ thư mua của Apollo với cột
> `Email Status = guessed` chưa gọi lại được — chưa ai gửi thử. Nó chỉ thành ô 5
> khi có tín hiệu ngược: thư không dội, người nhấc máy, người trả lời.

Kết quả, và đây là con số phải in thẳng lên bước 5 của màn nhập:

| Nguồn của ô                       | Ô điền được từ file | Ô còn thiếu để qua cổng |
| --------------------------------- | ------------------- | ----------------------- |
| Chắc chắn (pháp nhân, công khai)  | **1 · 2 · 3**       | 4 · 5 · 6               |
| Có trong file nhưng chưa xác minh | 4 · 5               | vẫn tính là thiếu       |
| Không nhà cung cấp nào có         | —                   | **6**                   |

**Nhập một lô 1.200 dòng đầy đủ nhất vẫn ra 0 lead.** Đó không phải hạn chế —
đó là cổng đang làm đúng việc của nó. Nói thẳng câu này trên màn nhập, ở bước 5,
cạnh nút xác nhận: _"Nhập lô không sinh lead nào. Lead sinh khi bên kia trả lời."_

### 4.4 · File mẫu thật

Tên file: `mau-danh-sach-prospect.csv` · UTF-8 **có BOM** · dấu phẩy · một hàng
tiêu đề · ba dòng ví dụ. Nội dung dưới đây là nguyên văn (dòng đầu có BOM,
không nhìn thấy được):

```csv
ten_cong_ty,ma_so_thue,tinh,nganh,san_pham_chinh,so_nguoi,so_nha_may,nguoi_lien_he,chuc_danh,email,dien_thoai,website,nguon_goc,can_cu_lien_he,ghi_chu
Công ty TNHH DAS Vina,2300123456,Bắc Ninh,Chip,Đóng gói và kiểm thử IC,1400,1,Kim Dae-ho,Giám đốc nhà máy,daeho.kim@dasvina.vn,0912 300 391,dasvina.vn,Danh bạ KCN Quế Võ 2026,cong-khai-phap-nhan,Giám đốc bên Hàn Quốc ký cuối
Công ty CP Linh kiện Trường Sơn,2300987654,Bắc Giang,Chip,Linh kiện điện tử cho ô tô,620,1,,,lienhe@truongson-jsc.vn,0204 355 1188,truongson-jsc.vn,Danh bạ KCN Quế Võ 2026,cong-khai-phap-nhan,
Công ty TNHH Bán dẫn Nam Sơn,2300456789,Bắc Ninh,Chip,Wafer probe,880,2,Lê Minh Tuấn,Trưởng phòng sản xuất,tuan.le@namson-semi.vn,0912 344 507,namson-semi.vn,Hiệp hội DN điện tử,dong-y-truc-tiep,Đã ghé gian hàng triển lãm 2025
```

Ba dòng chọn có chủ ý, mỗi dòng dạy một chuyện:

| Dòng | Dạy gì                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | Dòng đầy đủ nhất có thể — **vẫn chỉ 5/6 ô**, thiếu ô 6                                                                     |
| 2    | Không có người liên hệ, chỉ có hòm thư chung + tổng đài → **không phải dữ liệu cá nhân**, ô 4 trống, ô 5 là kênh pháp nhân |
| 3    | `can_cu_lien_he` khác dòng trên → **một lô trộn được nhiều căn cứ**, và bảng soát phải tách ra                             |

Cột `so_nha_may = 2` ở dòng 3 và `1` ở dòng 1 để bước khớp cột có một cột số
thật mà đoán. Ba mã số thuế đều 10 chữ số, đúng dạng doanh nghiệp Bắc Ninh
(`2300…`).

> **Ba mã số thuế và hai địa chỉ thư ở dòng 2–3 là số CHỖ TRỐNG của file mẫu,
> không thuộc kịch bản đóng băng.** Kịch bản chưa bao giờ ghi mã số thuế của DAS
> Vina — transcript chỉ có câu _"I will send the tax code"_. File mẫu là nội
> dung dạy người dùng điền, nên nó được phép có số minh hoạ; nhưng nó nằm ở
> `data/prospects.ts`, **không** ở fixture, và `scenario.test.ts` không khoá nó.
> Đừng để ba con số này rò sang màn nào khác.

### 4.5 · Ba nhà cung cấp hay gặp, cột khác nhau ra sao

| Chuyện             | **Apollo.io** (CSV)                                                   | **LinkedIn Sales Navigator** (CSV)                                | **Danh bạ KCN / hiệp hội** (XLSX)                                               |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Một dòng là gì** | **một NGƯỜI**                                                         | **một NGƯỜI**                                                     | **một CÔNG TY**                                                                 |
| Tên công ty        | `Company`                                                             | `Company`                                                         | `Tên doanh nghiệp`                                                              |
| Mã số thuế         | **không có**                                                          | **không có**                                                      | `Mã số thuế` ✔                                                                  |
| Người liên hệ      | `First Name` + `Last Name` (**hai cột**)                              | `First Name` + `Last Name` (**hai cột**)                          | `Người đại diện` (một cột) hoặc không có                                        |
| Chức danh          | `Title`                                                               | `Title`                                                           | thường không có                                                                 |
| Email              | `Email` + `Email Status` (`verified`/`guessed`)                       | **KHÔNG CÓ**                                                      | `Email` (hòm thư chung)                                                         |
| Điện thoại         | `Work Direct Phone` · `Mobile Phone` · `Corporate Phone` (**ba cột**) | **KHÔNG CÓ**                                                      | `Điện thoại` · `Fax`                                                            |
| Quy mô             | `# Employees` (số, đôi khi khoảng)                                    | `Company Size` (**bậc**: `51-200`)                                | `Lao động` (số)                                                                 |
| Địa điểm           | `City` · `State` · `Country` (ba cột, `State` = `Bac Ninh` không dấu) | `Location` (**một chuỗi**: `Bắc Ninh, Vietnam`)                   | `Địa chỉ` (**một chuỗi đầy đủ**, phải tách tỉnh)                                |
| Ngành              | `Industry` (tiếng Anh, phân loại của Apollo)                          | `Industry` (phân loại của LinkedIn, **khác** Apollo)              | `Ngành nghề` (tiếng Việt, tự do)                                                |
| Cột thừa           | ~40 cột: `Technologies`, `Total Funding`, `SIC Codes`…                | `Connection Degree`, `Years in Role`, `Profile URL`               | `STT`, `Lô đất`, `Vốn đầu tư`, `Diện tích`                                      |
| Bẫy riêng          | `Email Status = guessed` — nửa số email là **đoán**                   | không có đường liên hệ nào → **lô không gửi được**, chỉ để BD gọi | file có **2–3 hàng tiêu đề trang trí** và **ô gộp** phía trên hàng tiêu đề thật |

**Vì sao phải có bước KHỚP CỘT thay vì ép một định dạng** — sáu lý do, mỗi lý do
lấy thẳng từ bảng trên:

1. **Đơn vị của một dòng khác nhau.** Apollo và Sales Navigator: một dòng một
   người, một công ty có ba dòng. Danh bạ KCN: một dòng một công ty. Ép một định
   dạng buộc phải chọn một đơn vị và làm hỏng nửa còn lại — hoặc mất người, hoặc
   nhân bản công ty ba lần rồi khử trùng lại chính mình.
2. **Khoá khử trùng mạnh nhất chỉ có ở một nguồn.** Mã số thuế chỉ có ở danh bạ
   KCN. Không có nó thì hệ phải tụt xuống khoá 2 (tên miền) hoặc khoá 3 (tên +
   tỉnh) — và người dùng **phải biết** là nó đang tụt, vì độ tin cậy khác hẳn.
   Chỉ sau khi khớp cột hệ mới biết mình có khoá nào.
3. **Cột phải ghép và cột phải tách.** `First Name` + `Last Name` → một ô 4.
   `Địa chỉ` → phải tách ra tỉnh. `Location` = `"Bắc Ninh, Vietnam"` → tách bằng
   dấu phẩy. Ba phép biến đổi khác nhau cho cùng một ô đích.
4. **Cùng một nghĩa, ba kiểu dữ liệu.** Quy mô: Apollo cho số, LinkedIn cho bậc
   `51-200`, KCN cho số. Ép một định dạng nghĩa là bắt người dùng tự đổi
   `51-200` thành một số — và họ sẽ đổi sai, ở ngoài hệ, không ai thấy.
5. **File Excel Việt có khối tiêu đề phía trên hàng tiêu đề thật.** Người dùng
   phải chỉ được _"hàng nào là hàng tiêu đề"_. Không có bước khớp cột thì không
   có chỗ nào để chỉ.
6. **Ép một định dạng đẩy việc sửa ra NGOÀI hệ.** Người dùng sẽ mở Excel, xoá
   cột, đổi tên cột, gộp tay — và mọi sai sót ở đó không có ghi vết, không ai
   soát được, không quay lại được. Bước khớp cột kéo đúng việc đó vào trong hệ,
   có E2 ghi vết, có chỗ để bấm quay lại.

---

## §5 · Cấu hình prospect — module 5 · mục 5.8 (mới)

Mục mới trong bảng module 5, đứng sau 5.7. Vào **nhóm D · Hình dữ liệu** của
bản dựng lại ở `ke-hoach-va-cau-hinh.md` §5.1.

Tiền lệ đặt nó ở đây, không ở module 1: **mục 5.7 (kênh và mẫu nội dung) đã làm
đúng thế** — kênh là cấu hình ở module 5, còn đợt dùng kênh thì chạy ở module 1.
Lô prospect có cùng hình: **danh mục và luật ở module 5, hành động nhập ở
module 1** (§6.7).

| Mục   | Cấu hình cái gì                    | Hôm nay là gì            |
| ----- | ---------------------------------- | ------------------------ |
| 5.8.1 | Danh mục nhà cung cấp              | **chưa có**              |
| 5.8.2 | Quy tắc khử trùng — thứ tự khoá    | **chưa có**              |
| 5.8.3 | Quy tắc chặn dòng                  | **chưa có**              |
| 5.8.4 | Chống nhập đè lên lead đang có chủ | **chưa có**              |
| 5.8.5 | Ai được nhập                       | E2, chưa khai luật riêng |
| 5.8.6 | Hạn lưu và căn cứ pháp lý          | **chưa có**              |

### 5.1 · Danh mục nhà cung cấp

Danh sách **mở** (thêm được), khác `EXIT_REASONS` là danh sách đóng — vì thế
giới có thêm nhà bán dữ liệu mà không xin phép ai. Mỗi mục:

| Trường                  | Ví dụ                                     | Ghi chú                                                     |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Tên                     | `Apollo.io`                               | duy nhất; trùng tên thì chặn ở bước 1                       |
| Kiểu                    | `mua`                                     | `ProspectSupplierKind`                                      |
| Căn cứ liên hệ mặc định | `cong-khai-phap-nhan`                     | điền sẵn ở bước 5, người nhập vẫn sửa được                  |
| Hạn lưu mặc định        | `365` ngày                                | **giá trị mặc định cần gật** — xem §9                       |
| Bộ khớp cột đã lưu      | bản khớp của lần nhập gần nhất            | đây là thứ làm lần nhập thứ hai mất 30 giây thay vì 10 phút |
| `usage`                 | số lô đã nhập · số dòng · số lead đã sinh | cùng hình với `usage` của mọi mục module 5 hôm nay          |

**Bộ khớp cột đã lưu là mục đáng giá nhất của cả 5.8.** Apollo xuất đúng một bộ
cột mỗi lần; khớp một lần rồi dùng lại là chỗ tiết kiệm thật.

Xoá một nhà cung cấp đang có lô đã sinh lead → **phải qua E3** (§5.5).

### 5.2 · Quy tắc khử trùng — theo thứ tự khoá

Ba khoá, chạy **theo thứ tự**, dừng ở khoá đầu tiên bắt được:

| Thứ tự | Khoá                               | Chuẩn hoá trước khi so                                                                                                                                                 | Độ tin |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **1**  | **Mã số thuế**                     | bỏ mọi ký tự không phải số; 13 số thì so cả 13 và cả 10 số đầu (chi nhánh cùng pháp nhân mẹ)                                                                           | chắc   |
| **2**  | **Tên miền email / website**       | hạ thường · bỏ `www.` · bỏ đường dẫn; **bỏ qua tên miền công cộng** (gmail · yahoo · outlook · hotmail · icloud)                                                       | khá    |
| **3**  | **Tên pháp nhân chuẩn hoá + tỉnh** | bỏ dấu · hạ thường · bỏ tiền tố loại hình (`công ty`, `cp`, `cổ phần`, `tnhh`, `mtv`, `jsc`, `co ltd`, `corp`) · bỏ dấu câu · nén khoảng trắng — **và tỉnh phải khớp** | tạm    |

**Vì sao khoá 3 bắt buộc kèm tỉnh.** "Cơ khí Đại Việt" là một cái tên xuất hiện
ở nhiều tỉnh. Không kèm tỉnh thì lô sau gộp nhầm hai công ty khác nhau thành
một, và một dòng thật biến mất mà không ai biết. Kèm tỉnh thì rủi ro đổi chiều:
bỏ sót một trùng — và bỏ sót một trùng chỉ tốn một lần gửi thư, còn gộp nhầm
làm mất một khách.

Khử trùng chạy **hai vòng**, và bảng soát ở bước 4 phải tách hai vòng ra:

1. **Trong chính file** → `trung-trong-file`. Giữ dòng đầu tiên, bỏ dòng sau.
2. **Với kho + với sổ lead** → `trung-lo-cu` · `da-co-chu` · `da-roi` · `da-ky`.

**Khử trùng chéo lô là bắt buộc, không phải tuỳ chọn.** Bằng chứng ở §7.1:
DS-0104 (khách mời triển lãm) có 188 dòng trùng — chủ yếu trùng ba lô trước, vì
cả bốn lô đều nhắm nhà máy phía Bắc. Chỉ khử trong file thì 188 công ty đó nhận
thư lần thứ hai trong ba tháng.

### 5.3 · Quy tắc chặn dòng

Bảy lý do của `ProspectRejectReason` (§3.1), mỗi lý do **bật/tắt được** trừ hai:

| Lý do                             | Tắt được?                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `khong-dinh-danh-duoc`            | **không** — dòng không có tên lẫn mã số thuế thì không phải một dòng                |
| `nam-trong-danh-muc-chan`         | **không** — chặn vĩnh viễn là lời hứa với người đã từ chối, không phải một tuỳ chọn |
| `khong-lien-he-duoc`              | có — lô của đường B (BD gọi tay) đôi khi chỉ cần tên + tỉnh                         |
| `email-sai-dinh-dang`             | có                                                                                  |
| `dien-thoai-khong-chuan-hoa-duoc` | có                                                                                  |
| `mst-sai-do-dai`                  | có                                                                                  |
| `thieu-can-cu-lien-he`            | **không** — xem §5.6                                                                |

**Danh mục chặn (opt-out)** là một danh sách riêng, chỉ thêm không bớt, chứa số
điện thoại và địa chỉ thư đã từ chối nhận liên hệ. Nó **thắng mọi luật khác**:
một dòng trong danh mục chặn bị loại kể cả khi lô mới, nhà cung cấp mới, căn cứ
mới. Đây là chỗ duy nhất trong module 5 mà một cấu hình không có nút tắt.

### 5.4 · Chống nhập đè lên lead đang có chủ

Bốn trường hợp khi một dòng prospect khớp một dòng sổ lead:

| Dòng sổ khớp vào                     | Kết quả                                                       | Vào khán giả đợt?                                  |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| Đang chạy, **có chủ**                | `da-co-chu` — nhập, **không ghi đè ô nào**                    | **KHÔNG** — Sale đang chăm, thư lạnh làm hỏng việc |
| Đang chạy, **kho chung** (không chủ) | `da-co-chu` — nhập, **bổ sung ô còn TRỐNG**, không đè ô đã có | có                                                 |
| Đã ra khỏi luồng                     | `da-roi` — nhập, **hiện lý do rơi cũ** ngay trên bảng soát    | có — đây chính là chiến dịch nuôi lại (CD-0105)    |
| **Đã ký hợp đồng**                   | `da-ky` — **chặn cứng**                                       | **KHÔNG** — khách đã mua thuộc kịch bản khác       |

Ba luật của cột giữa:

1. **Nhập không bao giờ đè lên ô đã có.** Ô số 4 của một lead do BD moi được từ
   một cuộc gọi thật đắt hơn cột `nguoi_lien_he` của Apollo. Nhập chỉ **điền vào
   ô trống**.
2. **Ghi đè là một hành động riêng, phải qua E3**, người gật là TP Kinh doanh.
   Nó không nằm trong luồng nhập; nó là một nút trên bảng soát, và bấm nút đó
   sinh một yêu cầu duyệt chứ không sửa gì ngay.
3. **Lead đang có chủ không bị lôi vào khán giả đợt.** Marketing nhìn thấy con
   số "N dòng đã có chủ" ở bước 4 và biết vì sao khán giả nhỏ hơn số dòng hợp
   lệ. Đây cũng là **vòng BD → Marketing** mà docs gọi là đường nối bắt buộc,
   chỉ ở chiều dữ liệu thay vì chiều lời nói.

### 5.5 · Ai được nhập (E2), và có phải qua E3 không

**Ai được nhập** — luật của phòng, khai ở 5.8.5, thi hành bằng `E2.can`:

| Vai                         | Nhập lô | Vì sao                                                                                                   |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| Marketing · Vũ Minh Châu    | **✔**   | chủ module 1, người mua danh sách                                                                        |
| BD · Lê Hoàng Nam           | **✔**   | đường B — lô của anh là lô anh gọi                                                                       |
| TP Kinh doanh · Trần Thu Hà | **✔**   | người gật, và là chủ lô nội bộ xuất từ sổ cũ                                                             |
| Sale (Huy · Bình · Linh)    | ✕       | `ownOnly: true` trong `actors`. Sale nhận SQL và chốt đơn — đi mua danh sách không phải việc của vai này |
| Presales · Phạm Diệu Anh    | ✕       | không chạm giai đoạn trước tín hiệu                                                                      |

Hai điểm về E2 phải làm cho đúng:

- **`Action` hiện có bốn giá trị `'xem' | 'sửa' | 'duyệt' | 'xuất'`.** Nhập là
  `'sửa'` trên một `ObjectRef` kiểu lô. **Không thêm action thứ năm** — thêm một
  action là sửa engine cho cả hệ vì một việc của một nhánh.
- **`'xuất'` là action phải ghi vết chặt nhất ở đây.** Xuất một lô ra file là
  đưa dữ liệu cá nhân ra khỏi hệ; Nghị định 13 đòi biết ai làm việc đó, lúc nào.
  `E2.log({ action: 'xuất', code: 'DS-0101' })`, và nhật ký này không xoá theo
  hạn lưu của lô.

**Có phải qua E3 không** — lập luận theo đúng luật 2 của module 5: _"những mục
đổi hình dữ liệu đã chạy — bỏ một cột của sổ, bỏ một lý do đang có lead đứng —
phải qua E3"_.

| Hành động                                         | E3?       | Lập luận                                                                                                                               |
| ------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Nhập một lô mới**                               | **KHÔNG** | Không đổi hình dữ liệu đã chạy, không đụng dòng nào đang có, không sinh lead nào. Chỉ ghi vết E2                                       |
| Nhập lô có dòng **ghi đè lead đang có chủ**       | **CÓ**    | Đụng thẳng vào dòng đang có chủ — đúng nghĩa "đổi dữ liệu đã chạy"                                                                     |
| Nhập lô có **chi phí vượt ngưỡng**                | **CÓ**    | Tiền của phòng. Tiền lệ đã có: SK-0103 84 triệu có TP Kinh doanh làm `followers` vì _"gật khoản 84 triệu"_. Ngưỡng cụ thể: **cần gật** |
| Đổi **thứ tự khoá khử trùng** (5.8.2)             | **CÓ**    | Đổi khoá là đổi cách cả kho tự nhận ra chính nó — mọi lô sau khử trùng khác đi                                                         |
| Tắt một **quy tắc chặn dòng** đang loại dòng thật | **CÓ**    | Cùng hình với "bỏ một lý do đang có lead đứng"                                                                                         |
| Thêm/sửa một **nhà cung cấp**                     | KHÔNG     | Danh mục mở, không dòng nào đang bám                                                                                                   |
| **Xoá** nhà cung cấp **đang có lô đã sinh lead**  | **CÓ**    | Y hệt bỏ một lý do đang có lead đứng                                                                                                   |
| **Xoá một lô** đã sinh lead                       | **CÓ**    | Xoá lô là cắt đường truy ngược của những lead đó                                                                                       |
| Thêm một dòng vào **danh mục chặn**               | KHÔNG     | Chặn thêm luôn là phía an toàn                                                                                                         |
| **Gỡ** một dòng khỏi danh mục chặn                | **CÓ**    | Gỡ chặn là liên hệ lại một người đã từ chối                                                                                            |

Người gật ở mọi dòng "CÓ": **Trần Thu Hà**. Mọi yêu cầu đổ về Hộp duyệt của One
(E3 · docs).

### 5.6 · Hạn lưu và căn cứ pháp lý

Nêu ở mức **ràng buộc sản phẩm**. Đây không phải tư vấn pháp lý; đây là danh
sách những thứ màn phải có ô để điền và engine phải có chỗ để gác.

Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân sinh ra bốn ràng buộc đọc
được ở tầng sản phẩm:

| #   | Ràng buộc sản phẩm                                                                                                                                      | Thi hành ở đâu                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | **Tách dữ liệu pháp nhân khỏi dữ liệu cá nhân.** Tên công ty · mã số thuế · tổng đài · hòm thư chung ≠ họ tên · chức danh · di động · hòm thư đích danh | `ProspectBatch.hasPersonalData`; bảng cột §4.2 đánh dấu **cá nhân** ở đúng 4 cột       |
| 2   | **Lô có dữ liệu cá nhân thì phải khai căn cứ**, và căn cứ là ô BẮT BUỘC ở bước 5                                                                        | `legalBasis` không `optional`; `thieu-can-cu-lien-he` là lý do chặn **không tắt được** |
| 3   | **Có hạn lưu, và hết hạn là xoá thật.** Dòng chưa vào sổ hết `retentionDays` thì xoá; số liệu tổng của lô ở lại                                         | `ProspectBatchState = 'het-han-luu'`; mặc định `retentionDays` **cần gật**             |
| 4   | **Rút lại được, và rút là vĩnh viễn.** Ai từ chối thì vào danh mục chặn, và danh mục chặn thắng mọi lô sau                                              | §5.3 — hai lý do không tắt được                                                        |

Ba thứ **cố tình không làm** ở POC, ghi ra để không ai tưởng đã có:

- Không có màn "yêu cầu của chủ thể dữ liệu" (xem · sửa · xoá dữ liệu của tôi).
- Không có bản ghi đồng ý dạng chứng cứ (dấu thời gian, IP, nội dung đã đồng ý)
  cho `dong-y-truc-tiep` — hôm nay chỉ có một chuỗi enum.
- Không có đường chuyển dữ liệu ra ngoài biên giới. Nhà cung cấp nước ngoài
  (Apollo, LinkedIn) đặt ra câu hỏi đó và POC không trả lời nó.

---

## §6 · Luồng màn — năm bước

### 6.0 · Khung chung

Một màn, năm bước, **một dải bước ở đầu màn** cho biết đang ở đâu. Không phải
năm route: nửa chừng bấm F5 thì mất bản nháp, và một luồng nhập file dở dang
không đáng để giữ ở URL.

`AppShell fill`, không cuộn trang từ `lg` trở lên — cùng khung với màn Chiến dịch.
Mọi bảng nằm trên `.glass-b` (luật 8). ContextRail có mặt ở **cả năm bước** (luật 10) — cùng lý do màn Chiến dịch giữ rail ở cả chế độ tạo.

**Đi lùi luôn được, đi tới thì phải qua cửa.** Mỗi bước dưới đây ghi rõ cửa của nó.

### 6.1 · Bước 1 · Chọn nguồn

|                          |                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Thấy gì**              | Lưới thẻ nhà cung cấp từ 5.8.1. Mỗi thẻ: tên · kiểu · lần nhập gần nhất · số dòng lần đó · **tỉ lệ loại lần đó**. Cuối lưới là thẻ "Nhà cung cấp mới". |
| **Vì sao có tỉ lệ loại** | Người dùng biết chất lượng **trước** khi tốn mười phút khớp cột. Apollo 18,6% loại nói nhiều hơn tên "Apollo.io".                                      |
| **Chặn ở đâu**           | Chưa chọn nhà → nút "Tiếp" mờ. Nhà mới → bắt buộc tên + kiểu + căn cứ mặc định; **tên trùng nhà đã có thì chặn tại chỗ** kèm nút "Dùng nhà đã có".     |
| **Rỗng**                 | Chưa có nhà nào → `EmptyState`: _"Chưa có nhà cung cấp nào. Lô đầu tiên bắt đầu bằng việc đặt tên chỗ mua nó."_ + nút.                                 |
| **Lỗi**                  | Chỉ một lỗi: trùng tên.                                                                                                                                |

### 6.2 · Bước 2 · Tải mẫu / Upload

|                                  |                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thấy gì**                      | Trái: nút **"Tải file mẫu (CSV UTF-8)"** + ba dòng hướng dẫn xuất CSV từ Excel. Phải: hai tab — **"Chọn file"** (vùng thả) và **"Dán trực tiếp"** (ô văn bản lớn).                                   |
|                                  | Chọn xong: tên file · dung lượng · **số dòng đọc được** · **dấu phân tách hệ đã tự nhận** · 5 dòng đầu dạng bảng thô.                                                                                |
| **Ba dòng hướng dẫn**            | _"File .xlsx thì mở bằng Excel → Lưu thành → CSV UTF-8. Hoặc nhanh hơn: bôi đen cả bảng, Ctrl+C, dán sang tab bên cạnh."_                                                                            |
| **Chặn ở đâu**                   | File > 5 MB · > 5.000 dòng · 0 dòng dữ liệu · không giải mã được UTF-8.                                                                                                                              |
| **Không chặn, chỉ báo**          | Dấu phân tách là `;` → dải thông báo: _"Excel máy này xuất bằng dấu chấm phẩy — hệ đã tự nhận. Kiểm lại năm dòng bên dưới."_                                                                         |
| **Chặn tới khi người dùng chọn** | Hàng 1 nhìn giống dữ liệu chứ không giống tiêu đề (mọi ô đều là số, hoặc trùng hệt hàng 2) → bắt chọn **hàng nào là hàng tiêu đề**. Đây là cửa cho file Excel Việt có khối tiêu đề trang trí (§4.5). |
| **Rỗng**                         | Chưa chọn gì → vùng thả + tên file mẫu, không có gì khác.                                                                                                                                            |
| **Lỗi**                          | Không phải UTF-8 → _"File này không phải UTF-8. Mở lại bằng Excel, Lưu thành → CSV UTF-8."_ **Chặn** — đoán bảng mã là cách chắc chắn để nhập vào 1.200 dòng chữ hỏng.                               |

### 6.3 · Bước 3 · Khớp cột

|                          |                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thấy gì**              | Bảng hai cột. Trái: tên cột trong file + **ba giá trị mẫu thật**. Phải: `Select` trỏ vào 15 ô đích của §4.2 hoặc **"Bỏ qua cột này"**. Trên cùng là **khối AI**.                                                                                                                                                        |
| **Khối AI (luật 9)**     | Đề nghị **cả bộ** ánh xạ một lần, có `basis`, có nút, có state rỗng. Ví dụ `basis`: _"12 trong 15 cột khớp từ điển Apollo.io; cột `# Employees` khớp vì 100/100 dòng mẫu là số; cột `Keywords` không khớp ô nào."_ Nút: **"Áp bộ ánh xạ này"**. Dưới nút, khi chưa bấm: **"Chưa áp bộ nào — bảng bên dưới còn trống."** |
|                          | Bảng mở ra ở trạng thái **chưa ánh xạ gì**. AI không tự điền — đúng luật 9, và ở đây nó còn là chuyện đúng sai: một bộ ánh xạ tự áp mà sai thì người dùng phát hiện ở bước 4, sau khi đã tin.                                                                                                                           |
| **Chặn ở đâu**           | Chưa ánh xạ được **cột định danh** (tên công ty HOẶC mã số thuế) → không sang bước 4, kèm câu vì sao.                                                                                                                                                                                                                   |
|                          | Hai cột file cùng trỏ vào một ô đích → chặn tại chỗ ở dòng thứ hai.                                                                                                                                                                                                                                                     |
|                          | Cột nào cũng phải **chọn một thứ**, kể cả "Bỏ qua" — để trống và bỏ qua là hai ý khác nhau, và phân biệt được thì lần nhập sau lưu lại được bộ khớp.                                                                                                                                                                    |
| **Cảnh báo, không chặn** | Cột ánh xạ vào `email` mà 0/3 giá trị mẫu chứa `@` → dải vàng. Người dùng biết file của họ rõ hơn hệ.                                                                                                                                                                                                                   |
| **Rỗng**                 | File một cột → vẫn khớp được nếu đó là tên công ty, kèm câu: _"Lô này định danh được nhưng không liên hệ được — sẽ không dùng làm khán giả đợt gửi, chỉ để gọi tay."_                                                                                                                                                   |
| **Lối tắt**              | Nhà cung cấp có bộ khớp đã lưu (5.8.1) → dải trên cùng: _"Lần trước nhà này khớp như thế này"_ + nút áp. Đây là nút, không phải tự áp.                                                                                                                                                                                  |

### 6.4 · Bước 4 · Soát & khử trùng

|                              |                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thấy gì**                  | Hàng bốn số lớn: **thô · hợp lệ · trùng · loại**. Dưới là bốn bảng trên `.glass-b`, mỗi bảng gập được:                                            |
|                              | 1 · **Trùng trong chính file** — cột "khớp với dòng nào" + "khớp bằng khoá nào"                                                                   |
|                              | 2 · **Trùng với lô đã có** — cột "lô nào" + khoá                                                                                                  |
|                              | 3 · **Bị loại** — **mỗi dòng nói LÝ DO NÀO**, không nói "không hợp lệ"                                                                            |
|                              | 4 · **Đã có trong sổ lead** — chia ba nhóm: đang có chủ (chặn gửi) · đã rơi (kèm lý do cũ) · đã ký (chặn cứng)                                    |
| **Vì sao bảng 4 tách riêng** | Ba nhóm đó có ba hành động khác nhau (§5.4), và gộp vào "trùng" thì Marketing không thấy được rằng lô này đang đâm vào khách của Sale.            |
| **Chặn ở đâu**               | 0 dòng hợp lệ → không sang bước 5, kèm nút "Quay lại khớp cột".                                                                                   |
| **Chặn có đường vòng**       | Người dùng chọn "ghi đè" trên một dòng `da-co-chu` → **không nhập ngay**, sinh yêu cầu E3 cho TP Kinh doanh, lô về trạng thái `cho-duyet`.        |
| **Cảnh báo lớn**             | Tỉ lệ loại > 30% → dải: _"Cứ ba dòng thì một dòng bỏ đi. Kiểm lại bước khớp cột trước khi nhập."_ + nút quay lại bước 3. Ngưỡng 30%: **cần gật**. |
| **Rỗng**                     | Không dòng nào trùng → **không để bảng câm**: _"Không dòng nào trùng. Đây là lô sạch nhất từ nhà này."_                                           |
|                              | Không dòng nào bị loại → _"Không dòng nào bị loại — file này đã sạch trước khi vào hệ."_                                                          |

### 6.5 · Bước 5 · Xác nhận nhập

|                          |                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thấy gì**              | Một thẻ tóm tắt lô: **mã DS-xxxx** (hệ cấp, hiện sẵn) · nhà cung cấp · số dòng hợp lệ · **bộ lọc đã dùng** (ô nhập, cặp nhãn–giá trị) · chi phí · căn cứ pháp lý · hạn lưu · người nhập · ngày. |
|                          | Dưới đó: ô **"Dùng lô này cho"** — để trống, hoặc trỏ vào một chiến dịch/sự kiện đang có.                                                                                                       |
|                          | Và một dòng in đậm, cạnh nút: **"Nhập lô không sinh lead nào. Lead sinh khi bên kia trả lời."** (§4.3)                                                                                          |
| **Chặn ở đâu**           | Lô có cột cá nhân mà chưa chọn căn cứ → không nhập được. **Đây là cổng Nghị định 13 ở tầng sản phẩm** (§5.6 · ràng buộc 2).                                                                     |
|                          | Vân file trùng một lô đã nhập → chặn: _"File này đã nhập ngày 25/06 bởi Vũ Minh Châu thành lô DS-0103."_                                                                                        |
| **Không chặn, phải bấm** | Chi phí để trống → hợp lệ (0 đ), nhưng phải tick **"Lô này không tốn tiền"**. Bỏ trống vì quên và bỏ trống vì đúng là hai chuyện, và cột chi phí sai làm hỏng giá mỗi lead tốt của Marketing.   |
| **Sau khi bấm**          | Ghi vết E2 (`'sửa'`, `code: 'DS-xxxx'`). Lô vào kho ở `da-nhap`. **Không đợt nào tự chạy** — gắn lô vào một đợt và bấm gửi là việc riêng ở màn Chiến dịch, đúng luật "mọi lần gửi đi qua E4".   |
| **Rỗng**                 | Sau khi nhập xong → về kho danh sách, dòng mới nổi lên đầu.                                                                                                                                     |

### 6.6 · Kho danh sách — màn đứng trước năm bước

Năm bước là luồng **tạo**. Chỗ đứng của nó là một màn danh sách: bảng tám lô,
cột `mã · nhà cung cấp · ngày nhập · thô/hợp lệ/trùng/loại · chi phí · lead đã
sinh · dùng cho nguồn nào · trạng thái`. Một nút **"Nhập danh sách"** mở luồng.

Cùng hình với màn Chiến dịch: `mode: 'list' | 'import'` trong một màn, không hai
route.

### 6.7 · Màn này thuộc module nào

**Module 1 · Chiến dịch & Sự kiện.** Ba lý do:

1. **Câu hỏi chốt của module 1 là _"khách ở đâu ra"_** (docs). Lô prospect là
   câu trả lời ở tầng sâu nhất — sâu hơn cả chiến dịch.
2. **Khán giả của đợt là khái niệm của module 1.** Mục 1.1 ghi thẳng
   _"Tạo chiến dịch: khán giả · kênh · chuỗi đợt"_. Hôm nay "khán giả" là một
   con số trong `DRAFT_TEMPLATE.audience`; lô prospect là thứ làm con số đó có
   nghĩa.
3. **Module 2 KHÔNG được nhận nó.** Tiền lệ 19/08 · bản ba, mục 1.5: bảng lead
   bị dời khỏi màn Chiến dịch với lý do _"cùng một dòng lead mà thao tác được ở
   hai màn thì không màn nào là nơi đúng để tra"_. Luật đó áp ngược ở đây:
   prospect **không phải** một dòng lead, nên nó không được có mặt trong sổ
   lead — kể cả dưới dạng một tab.

**Đường dẫn đề nghị:** `/sales/campaigns/kho-danh-sach`.

Chú ý một chỗ dễ vỡ: route `/sales/campaigns/:code` đã tồn tại. React Router v6
xếp hạng đoạn tĩnh cao hơn đoạn động nên `kho-danh-sach` thắng `:code`, nhưng đó
là thứ **phải có test khoá** — một ca `renderRoutes` cho
`/sales/campaigns/kho-danh-sach` phải ra màn kho, không ra hồ sơ nguồn. Lợi ích
của việc nằm dưới `/sales/campaigns`: nav hai tầng vẫn sáng đúng module 1, vì
`inModule` ở `app/chrome.tsx` dùng `pathname.startsWith`.

---

## §7 · Số cho kịch bản DAS Vina

### 7.1 · Tám lô

Cột **Hợp lệ** của bảy lô đầu **bằng đúng `Wave.sent`** của đợt chúng nuôi —
đó là toàn bộ điểm của tầng này.

| Mã          | Nhà cung cấp                                           | Kiểu     | Nhập        | Người nhập   | Thô       | Trùng   | Loại    | **Hợp lệ** | Chi phí    | Căn cứ              |
| ----------- | ------------------------------------------------------ | -------- | ----------- | ------------ | --------- | ------- | ------- | ---------- | ---------- | ------------------- |
| **DS-0101** | Ban quản lý các KCN Bắc Ninh — danh bạ doanh nghiệp    | hiep-hoi | 03/05 (d2)  | Vũ Minh Châu | 1.480     | 96      | 184     | **1.200**  | 8.000.000  | cong-khai-phap-nhan |
| **DS-0102** | Hiệp hội Doanh nghiệp điện tử — danh sách hội viên     | hiep-hoi | 27/05 (d26) | Vũ Minh Châu | 775       | 74      | 61      | **640**    | 6.000.000  | cong-khai-phap-nhan |
| **DS-0103** | Apollo.io — nhà máy dược & thiết bị y tế miền Bắc      | mua      | 25/06 (d55) | Vũ Minh Châu | 1.254     | 41      | 233     | **980**    | 5.000.000  | cong-khai-phap-nhan |
| **DS-0104** | BTC Triển lãm công nghiệp hỗ trợ — danh sách khách mời | mua      | 27/07 (d87) | Vũ Minh Châu | 1.700     | 188     | 112     | **1.400**  | 12.000.000 | cong-khai-phap-nhan |
| **DS-0105** | Sổ cũ của phòng — khách im từ quý 1                    | noi-bo   | 18/05 (d17) | Vũ Minh Châu | 310       | 0       | 0       | **310**    | 0          | quan-he-cu          |
| **DS-0106** | Trang đích — người bấm vào bài đăng                    | noi-sinh | 23/06 (d53) | Vũ Minh Châu | 900       | 0       | 0       | **900**    | 0          | dong-y-truc-tiep    |
| **DS-0107** | Quét mã tại gian hàng — ba ngày hội chợ                | tai-cho  | 07/08 (d98) | Vũ Minh Châu | 151       | 3       | 5       | **143**    | 0          | dong-y-truc-tiep    |
| **DS-0108** | LinkedIn Sales Navigator — Quế Võ & Yên Phong          | mua      | 01/05 (d0)  | Lê Hoàng Nam | 248       | 22      | 46      | **180**    | 0          | cong-khai-phap-nhan |
| **Tổng**    |                                                        |          |             |              | **6.818** | **424** | **641** | **5.753**  | **31 tr**  |                     |

Bốn phép cân, cả bốn khoá được bằng test:

- `6.818 − 424 − 641 = 5.753` ✔ (và đúng cho từng dòng)
- Tiền danh sách **31 triệu nằm TRONG 300 triệu của kỳ**, không cộng thêm:
  8 ≤ 18 (CD-0101) · 6 ≤ 84 (SK-0103) · 5 ≤ 21 (SK-0104) · 12 ≤ 145 (SK-0106).
- Mọi lô nhập **trước** đợt đầu nó nuôi: d2 < d11 · d26 < d32 · d55 < d61 ·
  d87 < d93 · d17 < d19 · d53 < d54 · d98 < d99 · d0 < d1.
- Giá một dòng hợp lệ của phần phải trả tiền: `31.000.000 ÷ 4.220 = 7.346 đ`.

Câu chuyện tự hiện ra, không cần ai kể:

> **Apollo loại 18,6%** (233 trên 1.254) — cao nhất, vì nửa số địa chỉ thư là
> đoán. **Danh sách khách mời triển lãm trùng 11,1%** (188 trên 1.700) — cao
> nhất về trùng, vì đó là lô thứ tư nhắm cùng một tệp nhà máy phía Bắc, và nếu
> không khử trùng chéo lô thì 188 công ty nhận thư lần hai trong ba tháng.
> **Hai lô nội bộ và nội sinh không có dòng rác nào** — dữ liệu của chính mình
> bao giờ cũng sạch hơn dữ liệu mua.

### 7.2 · Mỗi `sent` là ai — cả 20 đợt

Bốn kiểu khán giả, không có kiểu thứ năm:

| Nguồn   | Đợt | Kênh     | `sent`    | Khán giả là ai                                     | Lô          |
| ------- | --- | -------- | --------- | -------------------------------------------------- | ----------- |
| CD-0101 | 1   | email    | **1.200** | lô prospect                                        | DS-0101     |
| CD-0101 | 2   | email    | **1.159** | chính lô đó, **trừ 41 người đã trả lời đợt 1**     | DS-0101     |
| CD-0101 | 3   | zalo-oa  | **1.137** | trừ tiếp **22 người trả lời đợt 2**                | DS-0101     |
| CD-0102 | 1   | linkedin | **8.400** | reach nền tảng — **không ai gửi cho ai**           | —           |
| CD-0102 | 2   | zalo-oa  | **5.100** | người theo Zalo OA của công ty                     | —           |
| CD-0102 | 3   | facebook | **6.800** | người theo trang                                   | —           |
| CD-0102 | 4   | email    | **900**   | người bấm vào ba bài trên, để lại thư ở trang đích | DS-0106     |
| SK-0103 | 1   | email    | **640**   | lô prospect                                        | DS-0102     |
| SK-0103 | 2   | zalo-oa  | **120**   | người **đã đăng ký** (`registered`)                | qua DS-0102 |
| SK-0103 | 3   | in-app   | **120**   | người đã đăng ký — check-in tại cửa                | qua DS-0102 |
| SK-0103 | 4   | email    | **120**   | người đã đăng ký                                   | qua DS-0102 |
| SK-0104 | 1   | email    | **980**   | lô prospect                                        | DS-0103     |
| SK-0104 | 2   | zalo-oa  | **86**    | người đã đăng ký                                   | qua DS-0103 |
| SK-0104 | 3   | email    | **86**    | người đã đăng ký                                   | qua DS-0103 |
| CD-0105 | 1   | email    | **310**   | lô nội bộ — khách im, xuất từ sổ cũ                | DS-0105     |
| CD-0105 | 2   | email    | **293**   | trừ **17 người trả lời đợt 1**                     | DS-0105     |
| CD-0105 | 3   | zalo-oa  | **282**   | trừ **11 người trả lời đợt 2**                     | DS-0105     |
| SK-0106 | 1   | email    | **1.400** | lô prospect — khách mời của ban tổ chức            | DS-0104     |
| SK-0106 | 2   | in-app   | **143**   | quét mã tại gian — **thu tại chỗ**                 | DS-0107     |
| SK-0106 | 3   | email    | **143**   | chính 143 người đã quét mã                         | DS-0107     |

**Luật "người trả lời rời khán giả" không phải phát minh — nó đã nằm sẵn trong
số:**

| Chuỗi   | Đợt n `sent` | Đợt n `replied` | Đợt n+1 `sent` | Phép trừ       |
| ------- | ------------ | --------------- | -------------- | -------------- |
| CD-0101 | 1.200        | 41              | 1.159          | `1.200 − 41` ✔ |
| CD-0101 | 1.159        | 22              | 1.137          | `1.159 − 22` ✔ |
| CD-0105 | 310          | 17              | 293            | `310 − 17` ✔   |
| CD-0105 | 293          | 11              | 282            | `293 − 11` ✔   |

Bốn trên bốn, không sai một đơn vị. Đây là **luật đã tồn tại trong fixture mà
chưa ai viết ra thành câu**: người trả lời rời khán giả, vì họ đã sang một cuộc
nói chuyện. Ca test cho nó là ca test rẻ nhất và đáng nhất của cả §7.

Và ba đợt của CD-0102 là chỗ **không** có lô nào, có chủ ý: `sent` của một bài
đăng là **reach**, không phải người nhận. Docblock màn Chiến dịch đã cảnh báo
đúng chỗ này (_"`totals.sent` là LƯỢT GỬI, không phải người"_); tầng prospect
nói tiếp nửa còn lại — với ba đợt đó thì **không có danh sách nào cả**, và mua
8.400 địa chỉ nhà máy chip Bắc Ninh là chuyện không có thật.

### 7.3 · Lead truy về lô

Cộng bằng `Wave.leads` của các đợt lô nuôi. **Không con số nào mới.**

| Lô       | Nuôi đợt              | Lead trực tiếp                      |
| -------- | --------------------- | ----------------------------------- |
| DS-0101  | CD-0101 · đợt 1, 2, 3 | 11 + 7 + 4 = **22**                 |
| DS-0102  | SK-0103 · đợt 1       | **6** _(+10 gián tiếp qua đăng ký)_ |
| DS-0103  | SK-0104 · đợt 1       | **5** _(+7 gián tiếp)_              |
| DS-0104  | SK-0106 · đợt 1       | **3**                               |
| DS-0105  | CD-0105 · đợt 1, 2, 3 | 4 + 3 + 2 = **9**                   |
| DS-0106  | CD-0102 · đợt 4       | **3**                               |
| DS-0107  | SK-0106 · đợt 2, 3    | 6 + 2 = **8**                       |
| DS-0108  | — (BD gọi tay)        | **5** = `TM.leads`                  |
| **Tổng** |                       | **61**                              |

Phép cân của cả sổ:

| Phần                                     | Số        |
| ---------------------------------------- | --------- |
| Lead **truy thẳng** về một lô            | **61**    |
| Lead truy về lô **qua một bước đăng ký** | **17**    |
| Lead **không có lô nào** đứng sau        | **22**    |
| **Tổng**                                 | **100** ✔ |

22 lead không có lô chia làm hai, và cả hai đều là câu trả lời đúng:
**15 lead** về từ ba đợt reach nền tảng của CD-0102 — không ai gửi cho ai;
**7 lead** của `GT` — khách cũ giới thiệu, gọi thẳng, không đi qua kho danh sách.
Đó là lý do `LeadOrigin.batch` phải `optional` (§2.3).

**Chỗ hụt phải nói ra:** "lead **tốt**" (qua cổng init data) chỉ tính được ở mức
**NGUỒN**, không mức lô, vì `Lead` không ghi mình về từ đợt nào. Với năm lô là
lô duy nhất của nguồn (DS-0101 · DS-0103 · DS-0105 · DS-0106 · DS-0108) thì
lead tốt của nguồn = lead tốt của lô; ba lô còn lại (DS-0102 · DS-0104 ·
DS-0107) chia nhau một nguồn nên không tách được. Không thêm `Lead.waveNo` để
lấp — xem §3.4.

Cuối cùng, con số cho một cái liếc:

> **5.753 dòng prospect → 100 dòng sổ lead = 1,74%.**
> Riêng phần phải trả tiền: **4.220 dòng · 31 triệu → 36 lead trực tiếp**
> (DS-0101 22 + DS-0102 6 + DS-0103 5 + DS-0104 3) = **861 nghìn một lead**,
> trước khi tính một đồng tiền gửi nào.

### 7.4 · Số ĐẶT và số suy ra

Theo tiền lệ `ke-hoach-va-cau-hinh.md` §2: _"số một người ĐẶT thì bao giờ cũng
có tên người đặt kèm ngày đặt"_.

**SUY RA — không ai phải đặt, khoá được bằng test:**

| Con số                                                               | Suy từ                              |
| -------------------------------------------------------------------- | ----------------------------------- |
| `rowsValid` của bảy lô (1.200 · 640 · 980 · 1.400 · 310 · 900 · 143) | `Wave.sent` của đợt mở màn          |
| 1.159 · 1.137 · 293 · 282                                            | `sent − replied` của đợt liền trước |
| Lead của từng lô (22 · 6 · 5 · 3 · 9 · 3 · 8 · 5)                    | cộng `Wave.leads`                   |
| 61 · 17 · 22 và tổng 100                                             | như trên                            |
| Chặn dưới của mọi ngày nhập                                          | `Source.startDay` / `Wave.day`      |
| `143` của DS-0107                                                    | `SK-0106.checkedIn`                 |

**ĐẶT — phải mang tên người đặt và ngày đặt:**

| #   | Số / quyết định                                                                                                                                                           | Người đặt đề nghị | Ngày             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------- |
| 1   | Tên tám nhà cung cấp và kiểu của chúng                                                                                                                                    | Vũ Minh Châu      | 20/08            |
| 2   | `rowsDuplicate` + `rowsRejected` của tám lô (16 số tự do)                                                                                                                 | Vũ Minh Châu      | 20/08            |
| 3   | Chi phí bốn lô mua: **8 · 6 · 5 · 12 triệu**, và khẳng định chúng **nằm trong** `Source.cost`                                                                             | Trần Thu Hà       | 20/08            |
| 4   | **`rowsValid` của DS-0108 = 180** — số đặt DUY NHẤT không suy được từ đâu, vì `TM` không có đợt nào để có `sent`. Kéo theo tỉ lệ đường B: **5 lead trên 180 dòng = 2,8%** | Lê Hoàng Nam      | 20/08            |
| 5   | Ngày nhập chính xác của tám lô (chỉ bị chặn trên)                                                                                                                         | Vũ Minh Châu      | 20/08            |
| 6   | `retentionDays` mặc định · ngưỡng chi phí phải qua E3 · ngưỡng cảnh báo tỉ lệ loại                                                                                        | Trần Thu Hà       | **chưa có** — §9 |

Số 4 là chỗ mỏng nhất của cả §7 và tài liệu không giấu: đường B không có đợt nên
không có gì để neo. Nếu người đặt thấy 180 sai thì đổi 180 — đổi nó **không kéo
theo con số nào khác**, vì `TM.leads = 5` đã khoá và không phụ thuộc vào 180.

---

## §8 · Việc phải làm, theo thứ tự

| #   | Việc                                                                                                                                                                                | File                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Chốt sáu chỗ gật ở §9 **trước khi gõ dòng đầu tiên**                                                                                                                                | —                                                                                  |
| 2   | Thêm kiểu §3.1–3.3 + `PROSPECT_BATCHES` (§7.1) + `prospectStats(code)`                                                                                                              | `packages/engines/src/fixtures/das-vina.ts`                                        |
| 3   | Thêm `LeadOrigin.batch` và sửa câu `note` của `tu-mo` (§2.3)                                                                                                                        | `packages/engines/src/fixtures/das-vina.ts`                                        |
| 4   | Test khoá: bốn phép cân §7.1 · bảy `rowsValid === Wave.sent` · `importedDay <` đợt đầu · **bốn phép trừ §7.2** · 61+17+22 = 100 · `LEADS` vẫn 100 dòng · chi phí lô ≤ chi phí nguồn | `packages/engines/src/fixtures/scenario.test.ts`                                   |
| 5   | Mục 5.8 vào cấu hình: danh mục nhà cung cấp · khoá khử trùng · quy tắc chặn · hạn lưu · danh mục chặn, mỗi mục kèm `usage`                                                          | `apps/web/src/data/sales-config.ts`                                                |
| 6   | Tầng dữ liệu kho danh sách: hàng lô · tổng của kỳ · dò dấu phân tách · tách CSV/TSV · chuẩn hoá 15 cột · ba khoá khử trùng · bảy luật chặn                                          | `apps/web/src/data/prospects.ts` _(mới)_                                           |
| 7   | Nội dung file mẫu §4.4 dạng hằng chuỗi có BOM + hàm phát file                                                                                                                       | `apps/web/src/data/prospects.ts`                                                   |
| 8   | Component thiếu ở `@pv/ui` + **một dòng trên `/kit` cho mỗi cái**: dải năm bước · vùng thả file · bảng khớp cột hai cột                                                             | `packages/ui/src/patterns/**` · `packages/ui/src/index.ts` · `apps/web/src/kit/**` |
| 9   | Màn kho + luồng năm bước, một màn hai chế độ (§6.6)                                                                                                                                 | `apps/web/src/pages/prospect-lists.tsx` _(mới)_                                    |
| 10  | Route `/sales/campaigns/kho-danh-sach` + **test khoá thứ tự với `:code`** (§6.7)                                                                                                    | `apps/web/src/routes.tsx` · `apps/web/src/pages/prospect-lists.test.tsx`           |
| 11  | Lối vào: nút trên màn Chiến dịch; ô "Khán giả" của form tạo trỏ vào lô thay vì một số trần                                                                                          | `apps/web/src/pages/campaigns.tsx` · `apps/web/src/pages/campaign-model.ts`        |
| 12  | Hồ sơ lead hiện dòng "về từ lô nào" khi `origin.batch` có                                                                                                                           | `apps/web/src/pages/lead-detail.tsx`                                               |
| 13  | Mục 5.8 lên màn Cấu hình, nhóm D                                                                                                                                                    | `apps/web/src/pages/sales-config.tsx`                                              |
| 14  | Ghi mục 5.8 và tầng prospect vào hiến pháp                                                                                                                                          | `docs/kien-truc-san-pham.md`                                                       |
| 15  | `pnpm check` xanh · soát luật 12/13 bằng mắt · soát luật 9 ở khối AI khớp cột                                                                                                       | —                                                                                  |

Việc 2–4 làm được **một mình, không đụng màn nào** — nếu chỉ chọn một việc để
làm trước thì chọn ba việc đó: chúng biến toàn bộ §7 từ một tài liệu thành một
thứ CI gác được.

---

## §9 · Sáu chỗ cần gật trước khi code

1. **§1.3 — prospect đứng NGOÀI `FUNNEL`, không thành bậc thứ bảy.** Đây là chỗ
   dễ bị lật nhất khi ai đó nhìn thấy hình phễu và muốn thêm một tầng cho đẹp.
2. **§2.3 — `OriginKind` giữ đúng bốn giá trị**, lô đi bằng trục thứ hai
   `LeadOrigin.batch`. Gật cái này là gật luôn việc `ORIGIN_FACE` không đổi.
3. **§3.4 — có thêm `'DS'` (và `'CD'`/`'SK'`) vào `ObjectKind` không.** Thêm là
   **sửa engine cho cả hệ** vì một việc của một nhánh; không thêm thì lô mượn
   rail y như chiến dịch đang mượn. Không tự quyết.
4. **§7.4 số 3 — chi phí lô nằm TRONG `Source.cost`.** Nếu gật ngược lại (chi
   phí lô là khoản cộng thêm) thì chi cả kỳ thành 331 triệu và mọi con số của
   `ke-hoach-va-cau-hinh.md` §3 lệch theo.
5. **§7.4 số 4 — `rowsValid` của DS-0108 = 180**, tức đường B là "gọi 180 ra 5".
   Số đặt duy nhất không neo được vào đâu.
6. **Bốn ngưỡng chưa ai đặt:** `retentionDays` mặc định (đề nghị 365) · ngưỡng
   chi phí lô phải qua E3 · ngưỡng cảnh báo tỉ lệ loại (đề nghị 30%) · giới hạn
   file POC (đề nghị 5 MB · 5.000 dòng · 60 cột). Cả bốn thuộc module 5, và
   module 5 sinh ra để chấm dứt việc lập trình viên tự chế ngưỡng — nên không
   tự chế ở đây.
