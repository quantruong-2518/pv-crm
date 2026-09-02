# Tầm nhìn — Pipeline: MỘT trục vị trí cho cả hệ

Hệ hôm nay có **11 máy trạng thái rời** nằm trên ba trục khác nhau, và không
trục nào trả lời được câu người dùng thật sự hỏi: _việc này đang ở đâu, và đang
chờ ai._ Bản này không gộp 11 cái đó lại — nó thêm một trục thứ tư cắt ngang,
suy ra lúc đọc, và sửa đúng ba chỗ khiến trục ấy không tính được.

Đọc cùng `ban-giao-db.md` (bảng nào đã có), `tam-nhin-bao-gia-hop-dong.md`
(module 4), `ban-giao-api.md` (nợ đang có).

## Ba câu chủ dự án chốt 31/08

| Câu treo                             | Chốt                                          |
| ------------------------------------ | --------------------------------------------- |
| `waitingOn` lấy từ đâu               | **Nối E3** — không dựng máy trạng thái thứ 12 |
| Hai cột cơ hội không có đường đi tới | **Rút bảng còn 3 cột**                        |
| Báo giá (P5) có vào bản này không    | **Có** — vẽ đủ 8 phase, không chừa chỗ trống  |

---

## §1 · Chuỗi 8 phase, và phase KHÔNG phải module

```
P0 NGUỒN DẪN     SR-/SK-   ai kéo khách về            ─┐
P1 CHIẾN DỊCH    CP-       gửi gì · cho ai · đợt nào   ┴─ module 1
P2 VÀO SỔ        —         lead sinh ra, tin bao nhiêu ─┐
P3 NUÔI LEAD     LD-       lên bậc hoặc rơi            ┴─ module 2
P4 CƠ HỘI        OP-       ba cột, có tiền có ngày     ── module 3
P5 BÁO GIÁ       BG-       bản mấy, khách chốt bản nào ─┐
P6 HỢP ĐỒNG      HĐ-       ký = tồn tại dòng           ┴─ module 4
P7 BÀN GIAO      SO/WO/PO  ngoài biên Sales            ── nhánh Supply
```

Một lead đi hết chuỗi, nhưng **không tuần tự**: P1 lặp lại suốt P3 (mỗi đợt mail
là một vòng), còn P0 dính vào lead vĩnh viễn chứ không "qua".

Số module sau khi module 4 chen vào (đã chốt ở `tam-nhin-bao-gia-hop-dong.md`
§1): Hiệu suất → 5, Kế hoạch → 6, Thiết lập → 7.

---

## §2 · Bảng vị trí — phase · state · ai giữ · ai gật

| Phase   | State (nguồn chính thức)                                                                                              | Cửa đổi trạng thái                                     | Ai giữ                                  | Ai gật                     |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | -------------------------- |
| **P0**  | `SourceKind` = `chien-dich` · `su-kien` · `tu-nhien` — `campaign.ts:123`                                              | `config_entry` list `SOURCE`                           | marketing                               | E3 (`cấu-hình.đề-nghị`)    |
| **P1a** | `CampaignState` = `DRAFT` → `RUNNING` → `STOPPED` \| `DONE` — `campaign-book.ts:17`                                   | `POST /:code/start` · `/stop`                          | marketing (`chiến-dịch.bắn`)            | —                          |
| **P1b** | `CampaignMemberState` = `ACTIVE` ⇄ `REMOVED` — `:147`                                                                 | `POST /:code/members`                                  | marketing                               | —                          |
| **P1c** | `MailRunState` = `DRAFT` → `SCHEDULED` → `SENDING` → `SENT` \| `CANCELLED` — `mail.ts:58`                             | `POST /mas/runs` · `PATCH /mas/runs/:id`               | marketing                               | —                          |
| **P1d** | `MAIL_STATES` 10 giá trị, chỉ tiến — `platform/mail/mail.contract.ts:42`                                              | webhook Resend                                         | máy                                     | —                          |
| **P2**  | `LeadSourceKind` × `LeadMotion` ⇒ `IntakeTrust` = `XAC_MINH` · `KHAI_BAO` · `THO`                                     | `POST /sales/leads` · `/import` · `/intake`            | BD, marketing                           | —                          |
| **P3a** | `LeadTier` = `dau-moi` → `mql` → `sql` — `enums.ts:20`                                                                | **chưa có cửa** — nợ 2, §7                             | Sale, BD (`ownOnly`)                    | —                          |
| **P3b** | `LeadStatus` = `running` · `signed` · `exited` — `lead.ts:185`                                                        | `ExitDialog` → `PATCH /:code`                          | Sale (`lead.loại`)                      | **E3 — mới**               |
| **P3c** | chủ = `owner_id` \| `chua-ai-nhan`                                                                                    | `PATCH /:code/owner`                                   | TP                                      | **E3 — mới**               |
| **P4**  | `OpportunityState` = `gui-quotation` · `nego` · `close-lost` · `pending` (+ `close-won` suy ra) — `opportunity.ts:45` | `POST` · `PATCH /sales/opportunities`                  | `OpportunityOwnerRole` = `SALE` \| `BD` | —                          |
| **P5**  | `quote.status` = `nhap` → `da-gui` → `khach-chot` \| `khach-tu-choi` \| `thay-the`                                    | chưa dựng                                              | Sale; presales sửa được, gửi thì không  | **E3** khi giảm quá ngưỡng |
| **P6**  | không phải state — **tồn tại dòng `sales.contract`**                                                                  | `POST /:code/contract` (`cơ-hội.chốt`)                 | Sale, TP, GĐ                            | —                          |
| **P7**  | ngoài biên                                                                                                            | cạnh `platform.edge` + sự kiện `sales.contract.signed` | Supply                                  | —                          |

Ba trục cắt ngang chạy song song mọi phase: `TouchKind` (10 giá trị, dòng thời
gian), `ApprovalState` (E3), `MailEngagementKind` (`OPEN` · `CLICK` ·
`UNSUBSCRIBE` — độc lập hoàn toàn với `MAIL_STATES`).

---

## §3 · Quyết định 1 — bảng cơ hội rút còn BA cột

Năm cột hôm nay là năm cột trên màn, nhưng máy chủ ghi `stage` **chỉ** từ `state`
qua `stageOfState` (`opportunity.mapper.ts:99,150`). Bảng tra đó không bao giờ
trả về `moi` hay `da-demo`. Hai cột ấy không phải "ít dùng" — chúng **không có
đường nào đi vào**, và thứ còn nằm trong đó là dữ liệu seed cũ.

### Ba cột còn lại

| Cột           | Khoá         | Hạn     | State dẫn vào   |
| ------------- | ------------ | ------- | --------------- |
| Đang tìm hiểu | `tim-hieu`   | 14 ngày | `pending`       |
| Đã báo giá    | `da-bao-gia` | 30 ngày | `gui-quotation` |
| Chờ ký        | `cho-ky`     | 10 ngày | `nego`          |

### Cái mất, và chỗ nó đi về

**"Đã demo" là một tín hiệu thật.** Rút cột không được làm nó bốc hơi — nó đổi
chỗ: sự kiện demo đã có nơi lưu là `MeetingRow` (`meeting.ts`) và chạm
`gap-lan-dau`. Nên "đã demo" thành một **cờ suy ra** (`EXISTS(meeting)`) in cạnh
tên đơn, không phải một cột người ta kéo thả vào.

**Hạn của "Mới" là 2 ngày, của "Đang tìm hiểu" là 14.** Một đơn đang mục ở cột
Mới sẽ hết mục sau khi dồn. Đây là mất tín hiệu có thật, và cách trả nó là hạn
CHẶNG ĐẦU tính từ `created_at` chứ không từ `stage_since` — treo ở §8.

### Bề mặt phải sửa — 17 file, HAI bảng

`stage` là cột của cả `sales.lead:192` (có `lead_stage_idx`) lẫn
`sales.opportunity:99`. **Không có `CHECK` nào khoá giá trị `stage`** — chỉ
`opportunity_state_known` khoá `state`. Hệ quả: cơ sở dữ liệu sẽ không kêu một
tiếng nào; chỗ vỡ là zod lúc ĐỌC, tức màn trắng, không phải lỗi lúc ghi.

```
hợp đồng   contracts/sales/enums.ts:23        StageKey còn 3 giá trị
           contracts/sales/opportunity.ts     STAGE_OF_STATE bỏ 2 hàng
fixture    engines/fixtures/das-vina.ts:149   PIPELINE_STAGES · OPEN_DEALS · dòng lead
máy chủ    opportunity.{mapper,labels,schema} · lead.schema · seed.ts:361 STATE_OF_STAGE
màn        data/{opportunities,leads,performance,plan,sales-config,lead-form}.ts
           components/ops-fields.tsx · pages/{leads,lead-detail}.tsx
```

### Migration — ba câu SQL, không có `DROP`

```sql
UPDATE sales.opportunity SET stage = 'tim-hieu' WHERE stage IN ('moi','da-demo');
UPDATE sales.lead        SET stage = 'tim-hieu' WHERE stage IN ('moi','da-demo');
DELETE FROM sales.config_entry WHERE list = 'STAGE' AND key IN ('moi','da-demo');
```

`stage_since` **giữ nguyên** — đồng hồ đang chạy là đồng hồ có thật.

Bên cơ hội biết trước con số: fixture có đúng 2 đơn `moi` + 2 đơn `da-demo`
trong 10 đơn đang mở. Bên lead thì **phải đếm trên Neon trước khi chạy** — số
dòng không suy ra được từ fixture. `config.repository.ts:93` đang đếm số đơn mỗi
`STAGE` để chặn xoá dòng cấu hình đang có người dùng, nên câu `DELETE` phải chạy
SAU hai câu `UPDATE`, không được đảo.

---

## §4 · Quyết định 2 — nối E3, và ba bước chặn nhau

Chỗ nối đã có sẵn và đang cố ý để trống: `config.approval.ts` là một cửa DI đầy
đủ, từ chối to tiếng, kèm docblock viết rõ ba việc phải làm **đúng thứ tự**:

1. **Bảng `platform.approval` + `approval_link`** — `ban-giao-db.md` cụm D.
   Đặt ở `platform` chứ không `sales`: docblock của `config.approval.ts` viết
   `sales.approval`, và mâu thuẫn đó chốt về `platform` vì E3 là engine nền
   tảng, còn yêu cầu duyệt trỏ vào object của MỌI nhánh, không riêng Sales.
2. **`APPROVALS` thành provider thật** trong `platform/engines/engines.module.ts`
   — hôm nay module đó chỉ cấp `ACCESS`. Token đã khai sẵn ở `engines/tokens.ts`.
3. **`useClass` trong `config.module.ts`** trỏ vào bản nối thật, rồi
   `SalesConfigService.apply()` chạy khi `state === 'approved'`.

Bản `createApprovalEngine()` hiện tại giữ yêu cầu trong một `Map` sống theo tiến
trình. **Nối vào cái đó rồi trả 202 là nói dối người dùng** — một lần deploy là
mọi yêu cầu đang chờ biến mất. Bảng đi trước, không có đường tắt.

### Bốn loại yêu cầu, theo thứ tự lên

| Thứ tự | Loại           | Vì sao trước                                               | Chuỗi gật              |
| ------ | -------------- | ---------------------------------------------------------- | ---------------------- |
| 1      | `cấu-hình`     | Cửa đã dựng xong, chỉ thiếu chỗ lưu                        | TP                     |
| 2      | `đổi-chủ-lead` | Đổi chủ chia lại hoa hồng — `assign-menu.tsx` đã ghi lý do | TP                     |
| 3      | `giảm-giá`     | Đường tiền, và P5 sinh ra nó                               | TP → GĐ nếu quá ngưỡng |
| 4      | `loại-lead`    | Không quay lại được                                        | TP                     |

Quyền gật đã có: `phê-duyệt.duyệt`, chỉ `giám-đốc` và `trưởng-phòng` giữ.
`proposeFromAi` bắt buộc `basis` — luật 9 cưỡng chế ở tầng kiểu, không phải
thiện chí người viết màn.

### Hộp duyệt

Một màn mới ở One (`/hop-duyet`), đọc `E3.pending(actor)`. Không có màn này thì
`waiting` là một CÂU chứ không phải một trạng thái — đúng lỗi mà `assign-menu.tsx`
đã gỡ ra một lần và ghi lại lý do.

---

## §5 · Quyết định 3 — báo giá vào pipeline luôn

`quote.status` (đã chốt ở `tam-nhin-bao-gia-hop-dong.md`):

```
nhap ──> da-gui ──┬──> khach-chot
                  ├──> khach-tu-choi
                  └──> thay-the   (lúc bản MỚI được GỬI, không phải lúc tạo)
```

Không có `het-han` — hết hạn là `valid_until < hôm nay`, tính lúc đọc. Nhiều nhất
MỘT bản `khach-chot` mỗi cơ hội, cưỡng chế bằng unique index.

**Hệ quả lên P4, và nó là thứ làm ba cột chặt lại:** hôm nay `stage='da-bao-gia'`
chỉ có nghĩa "ai đó bấm nút Gửi quotation". Khi P5 có mặt, nó nên có nghĩa
`EXISTS(quote WHERE status='da-gui')` — cột khớp với giấy tờ thật thay vì khớp
với một cái nút. Câu treo §8, không tự quyết trong bản này.

---

## §6 · Hình cuối — `pipeline_position`

Một hàm thuần trong `@pv/engines` (không phụ thuộc React, backend dùng lại
được), tính lúc đọc, **không lưu** — cùng luật với `daysHere` đã sửa một lần ở
`ban-giao-db.md`.

```
{ phase, state, holder, waitingOn, overdueBy }
```

| Ô           | Tính từ                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `phase`     | P6 nếu `EXISTS(contract)` · P5 nếu `EXISTS(quote)` · P4 nếu có cơ hội chưa đóng · P3 nếu `tier ≠ dau-moi` và chưa rơi · P2 còn lại |
| `state`     | trạng thái của chính phase đó, đọc thẳng máy trạng thái của nó                                                                     |
| `holder`    | `lead.owner_id`, đổi sang `opportunity.owners[SALE]` từ P4 trở đi                                                                  |
| `waitingOn` | `approval_link` đầu tiên còn `waiting` trỏ vào mã này → người + hạn. Không có thì `null`, và câu trả lời là `holder`.              |
| `overdueBy` | `daysHere − config_entry.limitDays` của chặng hiện tại                                                                             |

Một endpoint `GET /sales/leads/:code/position`. Sổ lead, hồ sơ lead, Trang chủ,
Hiệu suất đọc **chung một câu trả lời** — không màn nào tự suy lại.

`limitDays` chuyển từ fixture sang `config_entry` cho cả 8 phase, không riêng 3
cột cơ hội: `config.schema.ts:84` đã có `CHECK config_limit_only_stage` buộc
"chỉ `STAGE` mới có `limitDays`", nên mở rộng ra phase là phải nới đúng ràng
buộc đó — một dòng, có chủ ý, không phải lách.

---

## §7 · Bảy nợ — bản này trả cái nào

| #   | Nợ                                                 | Bản này                                                                     |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Không có "chờ ai"                                  | **Trả** — §4                                                                |
| 2   | Lên bậc `dau-moi → mql → sql` không có cửa         | **Không trả** — cần luật lên bậc, treo §8                                   |
| 3   | Hai cột cơ hội chết                                | **Trả** — §3                                                                |
| 4   | SLA chỉ có ở P4                                    | **Trả** — §6, `limitDays` cho cả 8 phase                                    |
| 5   | Timeline thủng: `cham` · `gap-lan-dau` chưa ai ghi | **Không trả** — việc của module chạm                                        |
| 6   | Đổi tay ở P4 không ai thấy                         | **Trả một nửa** — `holder` in ra chỗ đổi, hai bảng vẫn không ràng buộc nhau |
| 7   | `DONE` của chiến dịch không có cửa                 | **Không trả**                                                               |

---

## §8 · Bốn câu còn treo

1. **Hạn chặng đầu tính từ đâu** — `created_at` hay `stage_since`? Rút cột "Mới"
   làm mất hạn 2 ngày; tính từ `created_at` là cách trả lại, nhưng nó là một
   phép đếm khác với ba cột kia.
2. **`stage='da-bao-gia'` neo vào nút hay vào giấy** — `state='gui-quotation'`
   hay `EXISTS(quote WHERE status='da-gui')`? Câu sau đúng hơn, và tốn một lượt
   sửa `stageOfState` sau khi P5 lên.
3. **Ngưỡng giảm giá nào thì phải gật** — chưa có con số, và không được bịa.
4. **"Đã demo" in ở đâu** — cờ cạnh tên đơn, hay một ô trong `pipeline_position`?

---

## §9 · Lộ trình — sáu lượt, mỗi lượt để lại `pnpm check` xanh

| Lượt | Việc                                                              | Chặn bởi  |
| ---- | ----------------------------------------------------------------- | --------- |
| 1    | Rút 3 cột: hợp đồng → fixture → máy chủ → màn; migration hai bảng | —         |
| 2    | `platform.approval` + `approval_link`, `APPROVALS` thành provider | —         |
| 3    | Nối `config.approval.ts`, Hộp duyệt lên                           | lượt 2    |
| 4    | `pipeline_position` — hàm thuần + endpoint, chưa có P5            | lượt 1, 3 |
| 5    | P5 báo giá: bảng · zod · cửa · màn                                | lượt 1    |
| 6    | `pipeline_position` nhận P5; `limitDays` sang `config_entry`      | lượt 4, 5 |
