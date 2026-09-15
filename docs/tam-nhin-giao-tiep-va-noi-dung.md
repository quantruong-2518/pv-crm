# Tầm nhìn — Module Giao tiếp & Nội dung (`comms`)

Bản này đề xuất **một module, hai nửa dùng chung một xương sống**:

- **nửa VÀO** — giữ lại gần như toàn bộ dấu vết trao đổi giữa người của ta và
  khách: thư, chat, cuộc gọi, buổi họp, transcript, tệp đính kèm;
- **nửa RA** — thư viện nội dung, các cửa đẩy nội dung đi (plugin theo kênh),
  và số đo để biết nội dung nào ăn, gửi cho ai, cải tiến ở đâu.

Chúng là **một module** vì nửa RA không đo được nếu không có nửa VÀO: hôm nay
không cửa nào biết khách đã **trả lời** hay chưa, nên không nhịp gửi nào tự
dừng đúng lúc và không con số nào nói được "nội dung này đẻ ra hội thoại".

Đọc cùng [`tam-nhin-pipeline-toan-he.md`](./tam-nhin-pipeline-toan-he.md) (§1 ·
ba loại: pipeline · hàng chờ · **sổ cái** — module này đẻ ra hai sổ cái và đúng
một pipeline), [`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md) +
[`ban-giao-campaign.md`](./ban-giao-campaign.md) (đường gửi và sổ chiến dịch —
module này **không viết lại**, chỉ đứng lên trên), và
[`ban-giao-thong-ke-mail-status.md`](./ban-giao-thong-ke-mail-status.md) (§2 ·
ba trục số không được trộn — luật đó áp nguyên si ở §7 dưới đây).

---

## §1 · Hôm nay có gì, và bốn lỗ thủng

| Sổ đang có                               | Trả lời câu gì                                      | Không trả lời được                                    |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `sales.touch`                            | chuyện gì đã xảy ra với lead/cơ hội                 | nội dung — docblock ghi rõ "MAIL IS NOT IN HERE"      |
| `sales.meeting` + `meeting_attendee`     | đã gặp bao nhiêu lần, ai dự, cột `transcript` đã có | chưa đường nào đổ transcript vào; khách là chữ gõ tay |
| `platform.email_delivery` + `mail_event` | thư TA gửi đi, tới nơi chưa, mở/bấm                 | thư khách gửi đến, và thread                          |
| `platform.audit`                         | ai gọi route nào                                    | vết bảo mật, không phải giao tiếp                     |

Bốn lỗ, xếp theo thứ tự phải bịt:

1. **Phía khách chưa có định danh KÊNH** — dù sổ liên hệ thì có rồi. Pha 0 ngày
   14/09 đính chính chỗ này: `sales.contact` là bảng THẬT từ migration 0018
   (28/08), có `code` · `email` · `phone`, có khoá ngoại vào
   `platform.object`, có API và màn thật. Thứ còn thiếu hẹp hơn nhiều: (a) không
   bảng nào ánh xạ `địa chỉ → người`, nên một lá thư đến không nối vào đâu được;
   (b) `meeting_attendee` phía khách vẫn gõ tay, chưa có picker nối vào
   `sales.contact`. Ít nhất năm chỗ comment và `fix-later.md` §2c còn viết
   "phía khách chưa có bảng nào" — câu đó hết đúng từ 28/08 và phải sửa trong
   lượt 0.
2. **Một dòng chỉ treo được vào MỘT object.** `touch.subject_code` là một cột.
   Một chuỗi thư bàn về lead hôm nay và về cơ hội tháng sau thì phải chép — và
   bản chép sẽ lệch.
3. **Không có chỗ ở cho khối nặng.** Ghi âm, ghi hình, tệp đính kèm: nợ #12 chờ
   AWS. Trước khi có nó, mọi lời hứa về voice là lời hứa suông.
4. **Không có chiều NGƯỢC.** Mọi thứ hiện có là outbound. Không cửa nào biết
   khách đã trả lời.

---

## §2 · Xương sống: `comms.identity` — việc đầu tiên, không phải việc kèm theo

Một địa chỉ là thứ duy nhất nối một lá thư đến với một con người trong sổ.

```
comms.identity
  id            uuid
  channel       'email' | 'zalo-oa' | 'telegram' | 'phone' | 'in-app'   ← đúng union Channel của E4
  address       text        email thường hoá · số E.164 · zalo user id
  side          'member' | 'guest'                                       ← đúng cặp của meeting_attendee
  actor_id      text  → platform.actor          NULL khi là khách
  object_code   text  → platform.object(code)    NULL khi là người của ta
  verified_at   timestamptz
  UNIQUE (channel, address)
```

Ba điều bảng này quyết định, và đều là quyết định có giá:

- **`UNIQUE (channel, address)` là hàng rào chống trùng**, không phải chỉ mục
  cho nhanh. Một địa chỉ nối vào hai contact là gốc rễ của mọi con số sai ở §7.
- **`side` chép lại đúng cặp `host`/`guest`** của `meeting_attendee` chứ không
  đẻ từ vựng mới — bảng kia trỏ vào đây và hai buổi họp với cùng một người hết là
  hai chuỗi tên rời nhau.
- **Phía khách trỏ `platform.object`, KHÔNG trỏ thẳng `sales.contact`** — sửa
  ngày 14/09 sau pha 0. Lý do là một sự thật khó chịu mà pha 0 moi ra: **email của
  khách đang nằm ở HAI chỗ không đồng bộ**. `sales.lead.email` (`NOT NULL`) là
  địa chỉ MAS thật sự gửi tới; `sales.contact.email` là sổ nhiều người trên một
  lead và **không lượt gửi nào đọc nó**. Một `contact_code` đơn độc sẽ bỏ sót
  đúng cái địa chỉ mà mọi lá thư đang đi tới, tức mọi thread MAS rơi vào hàng chờ
  chưa nối. Cả `lead.code` lẫn `contact.code` đều đã có khoá ngoại THẬT vào
  `platform.object` (pha 0 xác nhận), nên một cột `object_code` phủ được cả hai
  bằng một khoá ngoại, không CHECK đa hình, và mở sẵn đường cho nhà cung cấp sau
  này. Đường thay thế — dựng một dòng `contact` gương cho mỗi `lead.email` — bị
  bỏ vì nó chép dữ liệu người vào hai bảng để chữa một chỗ thiếu khoá.
- **Không nối được thì KHÔNG VỨT.** Thư từ địa chỉ lạ vào `comms.inbox_unmatched`
  — một hàng chờ có màn, có nút "đây là ai". Vứt lặng lẽ là cách chắc nhất để
  không ai biết cửa nạp đang hỏng.

---

## §3 · Sổ giao tiếp: `comms.thread` · `comms.message` · `comms.link`

### 3.1 · Ba bảng, và vì sao không phải một

```
comms.thread                          comms.message                     comms.link
một cuộc trao đổi trên một kênh       một lượt trong đó                 thread ↔ object
  id                                    id                                thread_id
  channel                               thread_id                         object_code → platform.object(code)
  external_id   (Message-ID gốc)        external_id  UNIQUE(channel,·)    linked_by  'auto' | 'human'
  subject                               at                                PRIMARY KEY (thread_id, object_code)
  started_at                            direction  'in' | 'out'
  last_at                               from_identity_id
  state  'open' | 'archived'            body_text
                                        body_html_key   → comms.blob
                                        transcript_key  → comms.blob
                                        duration_sec
                                        capture_source  'sync' | 'manual' | 'webhook' | 'upload'
comms.message_party                   comms.blob
  message_id                            key  (S3)  ·  sha256  ·  bytes  ·  mime
  identity_id                           retention_until  ·  legal_hold
  role  'from' | 'to' | 'cc' | 'speaker'
```

- **`thread` tách khỏi `message`** vì câu hỏi "đã trao đổi bao nhiêu lượt, lần
  cuối khi nào" phải trả lời được mà không quét nội dung.
- **`message_party` là bảng nối** vì một cuộc họp bốn người không nhét vừa hai
  cột `from`/`to`, và vì transcript cần biết **ai nói câu nào** (`role: 'speaker'`).
- **`comms.link` là bảng nối, không phải một cột.** Đây là chỗ bản này **cố ý
  khác `touch`**: một chuỗi thư gắn đồng thời vào `LD-0334`, `AC-0142` và
  `OP-0781`, mỗi dòng một hàng. Đây cũng đúng hình mọi CRM lớn dùng
  (Salesforce _WhoId/WhatId_, HubSpot _associations_) — và lý do giống nhau: bản
  chép thứ hai của một hội thoại sẽ lệch khỏi bản thứ nhất.
- **`external_id` UNIQUE theo kênh** là thứ làm cửa nạp **idempotent**. Đồng bộ
  lại lần thứ ba không đẻ ra bản sao thứ ba.

### 3.2 · Đứng ở `platform`, không ở `sales`

`comms.link.object_code` trỏ **`platform.object(code)`** bằng khoá ngoại thật.
Đây chính là đường thứ hai mà docblock của `sales.touch` đã cân nhắc rồi bỏ, và
bỏ vì một lý do cụ thể: dòng gương của cơ hội hồi đó là **kỷ luật chứ chưa phải
hàng rào**. Với bảng MỚI thì phép tính đảo chiều — không có lượt ghi cũ nào để
làm đổ — nên khoá ngoại đặt được ngay, và nó buộc `opportunity.code` phải có
dòng gương thật. Nói thẳng: **module này ăn theo và ép trả một khoản nợ của
`platform.graph`.** Nếu không muốn trả khoản đó trong cùng lượt thì `comms` phải
lùi về `sales` và mất khả năng ghi hội thoại với nhà cung cấp sau này.

### 3.3 · Luật một-sự-thật-một-sổ

**Một tin nhắn KHÔNG đẻ ra một dòng `touch`.** Lý do y hệt lý do hợp đồng
`touch.ts` từ chối mail: hai bảng cùng chở một sự thật sẽ cãi nhau ngay lần đầu
một lượt ghi hỏng nửa chừng. Màn ghép hai luồng khi vẽ; sổ không ghép.

Đúng **hai** ngoại lệ, và cả hai là sự kiện chứ không phải nội dung:

| Sự kiện                                     | Dòng `touch`  | Vì sao                                       |
| ------------------------------------------- | ------------- | -------------------------------------------- |
| buổi họp đầu tiên với một lead              | `gap-lan-dau` | module `meeting` đã ghi từ trước, giữ nguyên |
| khách trả lời lần đầu sau im lặng ≥ 14 ngày | `cham`        | đây là mốc phễu, không phải một tin nhắn     |

---

## §4 · Bốn cửa nạp, xếp theo rẻ → đắt

Mọi cửa nạp là một **adapter cùng một interface**, chạy trên pg-boss đã có
(`platform/queue`), không phải bốn đường code rời:

```ts
type CaptureAdapter = {
  channel: Channel
  pull?(cursor: string | null): Promise<{ messages: RawMessage[]; cursor: string }>
  webhook?(payload: unknown): RawMessage[]
  normalize(raw: RawMessage): NormalizedMessage
}
```

| #   | Cửa nạp                 | Cách                                                               | Chặn bởi                       |
| --- | ----------------------- | ------------------------------------------------------------------ | ------------------------------ |
| 1   | **Email hai chiều**     | OAuth Gmail API / Microsoft Graph, đồng bộ theo hộp thư từng người | không gì — làm được ngay       |
| 2   | **Transcript buổi họp** | tải lên tệp / dán text; cột `meeting.transcript` đã sẵn            | không gì — rẻ nhất trong bốn   |
| 3   | **Zalo OA · Telegram**  | webhook Business API; `Channel` của E4 đã có sẵn hai giá trị này   | tài khoản OA + xác minh        |
| 4   | **Ghi âm cuộc gọi**     | CTI (Aircall · Twilio · tổng đài VN) đẩy call log + tệp            | nợ #12 (S3) **và** §5 (đồng ý) |

Cửa 1 là cửa đắt giá nhất về mặt dữ liệu và là cửa duy nhất mở ra chiều
**inbound** — nó phải đi trước.

---

## §5 · Minh bạch — bốn hàng rào, vì "lưu lại toàn bộ" là câu nói nguy hiểm

Đây là phần dễ bị bỏ nhất và là phần đắt nhất khi bỏ.

**a · Chỉ giữ thứ nối được vào sổ.** Cửa nạp email chạy trên hộp thư cá nhân của
nhân viên. Luật: **thư nào không có một `comms.identity` phía `guest` khớp thì
không lưu nội dung** — chỉ đếm một con số "đã bỏ qua N thư". Không danh sách
người gửi, không tiêu đề. Mọi CRM có sync hộp thư đều có bộ lọc này; không có nó
thì CRM trở thành kho thư riêng của nhân viên.

**b · Metadata và NỘI DUNG là hai quyền khác nhau.** "Đã trao đổi 14 lượt, lần
cuối 3 ngày trước" là câu hỏi quản lý. "Họ đã nói gì" thì không phải lúc nào
cũng vậy. Nên `comm.view` (dòng thời gian, số lượt, thời lượng) tách khỏi
`comm.view-content` (thân thư, transcript, bản ghi).

**c · Đọc nội dung của người khác thì ghi vết.** `comm.view-content` trên một
thread mình không sở hữu ghi một dòng `platform.audit`. Minh bạch có nghĩa là
**cả hai chiều đều nhìn thấy được**, không chỉ chiều sếp nhìn xuống.

**d · Đồng ý là một hàng, không phải một giả định.** `comms.consent
(identity_id, purpose, granted_at, source, revoked_at)` với `purpose ∈
{'recording', 'marketing'}`. Ghi âm không có `recording` là chặn ở cửa ghi.
Nghị định 13/2023/NĐ-CP đòi cơ sở pháp lý cho việc thu và xử lý dữ liệu cá nhân,
và một lượt ghi âm cuộc gọi khách hàng nằm gọn trong đó. Cơ chế đã có tiền lệ
trong nhà: `MasRecipientBlock` chặn người nhận **kèm lý do đọc được** thay vì bỏ
im — bốn giá trị, bốn hành động khác nhau. Làm y như vậy.

Thêm: `comms.blob.retention_until` + `legal_hold`, và một sweeper xoá theo hạn —
cùng bậc với `CampaignSweeper` đã có.

---

## §6 · Nửa RA — nội dung, cửa đẩy, và nhịp

### 6.1 · Ba bảng

```
content.asset                         content.share                    content.view_event
  code      TL-0042 (ObjectKind mới)    id                               share_id
  kind  'deck'|'one-pager'|'case'|      asset_id · version               at
        'video'|'spec'|'letter'         to_identity_id                   kind 'open'|'page'|'dwell'|'download'|'forward'
  title · owner_actor_id                by_actor_id                      page · seconds
  state 'draft'|'published'|'retired'   channel                          ip_hash
content.asset_version                   token   (link theo dõi, duy nhất)
  asset_id · version · blob_key         sent_at · first_view_at
  changelog                             expires_at · revoked_at
```

- **`asset` có mã object (`TL-`)**, vì người ta gọi tên nó ra miệng và vì luật 10
  đòi ContextRail vẽ được nó. Muốn vậy phải mở `ObjectKind` trong
  `packages/engines/src/types.ts` **trước**. Ngược lại `thread` **không** có mã —
  cùng lý do `MailRunId` là UUID chứ không phải `ObjectCode`: mã chỉ đúc cho thứ
  con người gọi tên.
- **`share` là một link theo dõi cho MỘT người nhận**, không phải một URL chung.
  Đó là cái làm cho §7 đo được, và là cái cho phép thu hồi (`revoked_at`) một tờ
  báo giá gửi nhầm.
- **`view_event` chỉ ghi thêm**, đúng hình `mail_event`.

### 6.2 · Plugin: một interface, N kênh

```ts
type OutboundPlugin = {
  channel: Channel
  render(asset: AssetVersion, merge: MergeValues): Promise<Rendered>
  send(rendered: Rendered, to: Identity): Promise<{ externalId: string }>
  capabilities: { tracksOpen: boolean; tracksClick: boolean; maxBytes: number }
}
```

Email plugin **gọi thẳng `MasService.send()`**, không viết lại hàng đợi,
suppression hay cầu dao bounce — đúng quyết định #4 của `ban-giao-campaign.md`.
Zalo OA và Telegram là hai plugin mới; `capabilities` khai thật thứ kênh đó đo
được, để màn số liệu không vẽ cột rỗng giả vờ là số 0.

### 6.3 · `content.sequence` — pipeline thứ 12, và là cái duy nhất bản này đẻ ra

Chiến dịch đã có = **một-tới-nhiều, theo đợt**. Cái còn thiếu là **nhịp theo từng
lead, tự thoát khi khách trả lời**:

```
content.sequence        tên · chủ · trạng thái · điều kiện thoát
content.sequence_step   thứ tự · chờ bao lâu · asset_id · channel · điều kiện bỏ qua
content.enrollment      lead_code · sequence_id · bước hiện tại · state
                        'running' | 'replied' | 'meeting-booked' | 'exited' | 'done'
```

Bốn luật §2 của `tam-nhin-pipeline-toan-he.md` áp đủ: mỗi bước có đồng hồ
(`limitDays` sống trong `config_entry`), và **danh sách lý do thoát là ĐÓNG** —
`replied` · `meeting-booked` · `unsubscribed` · `lead-exited` · `done`.
`replied` chỉ tồn tại được nhờ nửa VÀO. Đó là toàn bộ lý do hai nửa là một module.

---

## §7 · Đo — bốn trục, và cấm trộn

`ban-giao-thong-ke-mail-status.md` §2 đã cấm trộn ba trục của mail. Bản này thêm
trục thứ tư và giữ nguyên lệnh cấm:

| Trục          | Câu hỏi                        | Nguồn                                     |
| ------------- | ------------------------------ | ----------------------------------------- |
| **Gửi**       | thư/tin có rời hệ thống không  | `email_delivery.state` (10 giá trị)       |
| **Chạm**      | người nhận có động tĩnh gì     | `mail_event.kind` · `content.view_event`  |
| **Hội thoại** | họ có TRẢ LỜI không            | `comms.message` `direction='in'` ← MỚI    |
| **Kết quả**   | có đẻ ra buổi họp, cơ hội, đơn | `sales.meeting` · `touch` · `opportunity` |

Trục 3 là trục hôm nay không tồn tại, và là trục duy nhất phân biệt được "nội
dung được mở" với "nội dung có tác dụng".

**Ba thẻ điểm, ba mẫu số khác nhau — đừng đặt cạnh nhau nếu chưa nói rõ mẫu số:**

| Thẻ điểm          | Đơn vị    | Số                                                                                                           |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| **Theo nội dung** | `TL-xxxx` | gửi · mở · thời gian xem trung bình · trang xem lâu nhất · **tỷ lệ trả lời** · họp trong 14 ngày · cơ hội mở |
| **Theo kênh**     | `Channel` | tới nơi · chạm · trả lời · chi phí mỗi hội thoại                                                             |
| **Theo người**    | actor     | lượt gửi · lượt trả lời nhận được · thời gian phản hồi trung vị · số hội thoại đang mở                       |

Ba cảnh báo phải in ngay trên màn, không giấu trong doc:

1. **Mở ≠ đọc.** Doc thống kê mail đã chốt câu này; pixel bị chặn, Apple MPP mở
   hộ. Xếp hạng nội dung theo tỷ lệ mở là xếp hạng theo mức lọt lưới bộ lọc ảnh.
2. **Thẻ theo người không phải bảng xếp hạng nhân viên.** Nó là công cụ tự soi
   và là đầu vào coaching. Biến nó thành KPI thì đầu ra là hành vi tối ưu con số.
3. **Không chấm điểm cảm xúc cá nhân.** Tóm tắt hội thoại thì được; "điểm thái độ"
   gắn vào một người thì không.

**Vòng cải tiến** (thứ biến số đo thành việc): `content.variant` cho phép hai bản
của cùng một asset, chia ngẫu nhiên theo `enrollment`, cộng một **nhóm giữ trắng**
5–10% không nhận gì. Không có nhóm giữ trắng thì mọi so sánh là so với chính mình
mùa trước. Một digest hàng tuần qua E4 gửi cho chủ nội dung: ba asset lên, ba
asset xuống, một câu vì sao.

---

## §8 · AI đứng ở đâu

Trên đống transcript, AI làm được bốn việc, và **cả bốn đều chờ nút** (luật 9 —
tầng kiểu `AiActionProps.basis` + tầng engine `E3.proposeFromAi`):

| Việc                                     | Căn cứ in ra màn                     | Đi tiếp thành                      |
| ---------------------------------------- | ------------------------------------ | ---------------------------------- |
| tóm tắt buổi họp + việc phải làm         | transcript, có dấu thời gian         | dòng `touch` + việc trong kế hoạch |
| soạn thư theo dõi                        | ba lượt trao đổi gần nhất            | nháp trong `MasMailModal`          |
| gợi ý nội dung nên gửi tiếp              | asset đã gửi + trục 3 của lead giống | một `content.share`                |
| đánh dấu rủi ro ("khách nhắc giá 3 lần") | ba câu trích dẫn nguyên văn          | cảnh báo trên hồ sơ cơ hội         |

Không việc nào tự chạy. Không việc nào ghi thẳng vào sổ.

---

## §9 · Danh sách function

Quyền mới — **tám cái**, đặt tên theo đúng khuôn `noun.verb` của
`packages/contracts/src/auth.ts`:

| Quyền                 | Cho ai làm gì                                      |
| --------------------- | -------------------------------------------------- |
| `comm.view`           | dòng thời gian + metadata (scoped như `lead.view`) |
| `comm.view-content`   | thân thư · transcript · bản ghi — ghi vết audit    |
| `comm.connect`        | tự nối hộp thư của CHÍNH MÌNH                      |
| `comm.capture-manage` | bật/tắt cửa nạp cả phòng, xem hàng chờ chưa nối    |
| `content.view`        | thư viện nội dung                                  |
| `content.edit`        | tạo/sửa/xuất bản asset                             |
| `content.share`       | gửi asset cho khách (đẻ link theo dõi)             |
| `sequence.run`        | ghi lead vào nhịp, dừng nhịp                       |

Xuất dữ liệu dùng lại `data.export` đã có; thẻ điểm dùng lại `performance.view`.

### Cửa HTTP

| #   | Cửa                                                          | Quyền                                               |
| --- | ------------------------------------------------------------ | --------------------------------------------------- |
| C1  | `GET /comms/threads?object=LD-0334`                          | `comm.view` · scoped                                |
| C2  | `GET /comms/threads/:id/messages`                            | `comm.view` (metadata) / `comm.view-content` (thân) |
| C3  | `POST /comms/threads/:id/links`                              | `comm.view` + quyền sửa object đích                 |
| C4  | `POST /comms/messages` (ghi tay: gọi điện, gặp mặt)          | `comm.view`                                         |
| C5  | `POST /comms/messages/:id/transcript`                        | `comm.view-content`                                 |
| C6  | `GET /comms/unmatched` · `POST /comms/unmatched/:id/resolve` | `comm.capture-manage`                               |
| C7  | `POST /comms/connections` (OAuth) · `DELETE` ·`GET`          | `comm.connect`                                      |
| C8  | `POST /comms/webhooks/:channel`                              | chữ ký, không phiên                                 |
| C9  | `GET/POST/PATCH /comms/identities` · `POST …/merge`          | `comm.capture-manage`                               |
| C10 | `POST /comms/consent` · `DELETE /comms/consent/:id`          | `comm.capture-manage`                               |
| N1  | `GET/POST/PATCH /content/assets` · `/:code/versions`         | `content.view`/`content.edit`                       |
| N2  | `POST /content/assets/:code/publish`                         | `content.edit`                                      |
| N3  | `POST /content/shares` (gửi 1 asset cho n người)             | `content.share`                                     |
| N4  | `DELETE /content/shares/:id` (thu hồi link)                  | `content.share`                                     |
| N5  | `GET /v/:token` — trang xem, công khai có hạn                | không                                               |
| N6  | `POST /v/:token/events` — beacon xem/cuộn/tải                | không                                               |
| N7  | `GET/POST /content/sequences` · `/steps`                     | `content.edit`                                      |
| N8  | `POST /content/sequences/:id/enroll` · `/stop`               | `sequence.run`                                      |
| S1  | `GET /content/scorecard?by=asset\|channel\|actor`            | `performance.view`                                  |
| S2  | `GET /comms/scorecard?object=LD-0334`                        | `comm.view`                                         |

### Việc chạy nền (pg-boss)

`comms.sync.pull` (mỗi 5 phút, mỗi kết nối) · `comms.resolve` (nối địa chỉ →
identity) · `comms.transcribe` (khi có S3) · `sequence.tick` (đẩy bước tới hạn) ·
`comms.retention.sweep` · `content.digest.weekly`.

---

## §10 · Màn hình

| Màn                                          | Nội dung                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Dòng giao tiếp** (trong hồ sơ lead/cơ hội) | một luồng trộn `touch` + `comms.message`, lọc theo kênh; luật 8 — nằm trên `.glass-b`                           |
| **Hộp chưa nối**                             | hàng chờ, không phải pipeline. Nút "đây là ai" đẻ một `comms.identity`                                          |
| **Kết nối của tôi**                          | hộp thư đã nối, đồng bộ lần cuối, **và đúng thứ hệ đang giữ của tôi** — phần "minh bạch" nhìn từ phía nhân viên |
| **Thư viện nội dung**                        | asset · phiên bản · thẻ điểm mỗi tờ                                                                             |
| **Nhịp gửi**                                 | pipeline #12 — cột theo bước, mỗi thẻ là một `enrollment`                                                       |
| **Thẻ điểm nội dung**                        | ba bảng của §7, mỗi bảng in rõ mẫu số                                                                           |

ContextRail (luật 10) chạy được ngay khi `TL-` vào `ObjectKind` và `E1.story()`
nối `TL-0042 → LD-0334 → OP-0781`.

---

## §11 · Lộ trình — sáu lượt, lượt nào cũng tự đứng được

| Lượt | Giao được gì                                                              | Mở khoá cho                             |
| ---- | ------------------------------------------------------------------------- | --------------------------------------- |
| 0    | `comms.identity` + nối `meeting_attendee.actor_id` (đóng `fix-later` §2c) | tất cả                                  |
| 1    | Ba bảng §3 + C1–C4 + màn Dòng giao tiếp, **nạp tay trước**                | thấy giá trị trước khi tốn tiền hạ tầng |
| 2    | Đồng bộ email hai chiều (C7·C8) + Hộp chưa nối + trục 3 của §7            | mọi số về hội thoại                     |
| 3    | Thư viện nội dung + link theo dõi (N1–N6) + thẻ điểm theo nội dung        | vòng cải tiến                           |
| 4    | Nhịp gửi (N7·N8) — tự thoát khi có `direction='in'`                       | pipeline #12                            |
| 5    | S3 + transcript + ghi âm cuộc gọi + AI §8 (sau nợ #12 và §5d)             | voice                                   |

Lượt 1 nạp tay là có chủ ý: một sổ hội thoại gõ tay vẫn hơn hẳn hôm nay, và nó
kiểm chứng hình dữ liệu trước khi ai đó đi làm OAuth.

---

## §12 · Đối chiếu thị trường

| Sản phẩm                      | Cách họ giải                                                          | Ta lấy gì                              |
| ----------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| Salesforce (EAC + Task/Event) | sync hộp thư tự động, activity gắn `WhoId`/`WhatId`                   | bảng nối `comms.link`                  |
| HubSpot (Engagements)         | inbox nối, sequences tự thoát khi có reply, documents có tracking     | §6.3 và `content.share` là hình của họ |
| Gong · Chorus · Fireflies     | lớp RIÊNG: bot vào họp, transcript, tóm tắt, bắn activity mỏng về CRM | §8 — AI là lớp trên, không nhét vào sổ |
| DocSend · Seismic             | link theo dõi từng người nhận, đo thời gian xem theo trang            | `content.view_event`                   |
| Kommo · Bitrix24              | omnichannel Zalo/WhatsApp/Messenger trong một hộp                     | plugin §6.2 · Zalo OA là kênh VN thật  |
| Attio · Twenty                | timeline là first-class, không phải phụ lục của record                | màn Dòng giao tiếp                     |

**Hình chung của cả sáu:** không ai gộp _nội dung_ vào _sự kiện_, và không ai để
cửa nạp viết thẳng vào bảng nghiệp vụ. Cả hai luật đó bản này giữ.

---

## §13 · Bảy thứ cố ý KHÔNG làm

1. **Không lưu thư không nối được vào sổ** — §5a. Đây là CRM, không phải kho thư.
2. **Không đẻ dòng `touch` cho mỗi tin nhắn** — §3.3.
3. **Không dựng ứng dụng email.** Không soạn thư tự do, không hộp thư đến đầy đủ.
   Nạp và đọc; soạn đi qua đường mail đã có.
4. **Không bot tự vào phòng họp ở lượt đầu.** Tải transcript lên. Bot là chuyện
   sau khi §5d chạy thật.
5. **Không chấm điểm cảm xúc gắn vào cá nhân** — §7 cảnh báo 3.
6. **Không tự gửi bằng AI** — luật 9.
7. **Không đẻ pipeline thứ 13.** Nhịp gửi là một; thư viện nội dung là sổ cái;
   hộp chưa nối là hàng chờ. Đúng ba loại của `tam-nhin-pipeline-toan-he.md` §1.

---

## §14 · Ba chỗ cần chốt trước khi viết dòng code đầu tiên

1. **`comms` đứng ở `platform` hay `sales`?** (§3.2) — đứng ở `platform` thì phải
   trả nợ dòng gương `platform.object` cho cơ hội trong cùng lượt.
2. **Hộp thư nối ở cấp nào** — từng nhân viên tự nối (`comm.connect`), hay một
   hộp chung `sales@`? Câu trả lời đổi cả §5a lẫn khối lượng OAuth.
3. **Nợ #12 (S3) bao giờ về?** Nó chặn lượt 5 và chỉ lượt 5. Năm lượt trước
   chạy được mà không cần nó.

---

## §15 · Cây module — file nào mọc ở đâu

Tên file theo đúng khuôn đang có (`*.schema` · `*.mapper` · `*.repository` ·
`*.service` · `*.controller` · `*.constraints` · `*.module`). Không zone nào mới:
`comms` vào `platform` (§3.2), `content` vào nhánh Sales vì nó phục vụ bán hàng.

```
QUYỀN MỚI KHÔNG CẦN MIGRATION (pha 0 đính chính §9). Đường thật, ba bước:
  1. thêm key vào Permission ở CẢ HAI chỗ, khớp từng ký tự —
     packages/contracts/src/auth.ts VÀ packages/engines/src/types.ts (PERMISSIONS).
     auth.mapper.ts assert hai union bằng nhau; lệch là build đỏ.
  2. thêm vào DEFAULT_ROLE_PERMISSIONS trong packages/engines/src/e2-access.ts.
  3. hết. RolePermissionSeeder tự gieo quyền mới cho đúng vai ở lần boot sau;
     platform.role_permission là bảng text trần, không CHECK enum.
  Viết một file SQL cấp quyền là viết một file vô nghĩa, tệ hơn là bị
  permission_seed chặn gieo trùng rồi im lặng không có tác dụng.

packages/contracts/src/
  comms/
    index.ts
    identity.ts          Channel · Side · IdentityRow · IdentityCreate · IdentityPatch
    thread.ts            ThreadRow · MessageRow · MessageParty · Direction · CaptureSource
    connection.ts        ConnectionRow · ConnectionCreate (OAuth) · SyncState
    consent.ts           ConsentPurpose · ConsentRow
    unmatched.ts         UnmatchedRow · UnmatchedResolve
  content/
    index.ts
    asset.ts             AssetKind · AssetState · AssetRow · AssetVersion · AssetCreate/Patch
    share.ts             ShareCreate · ShareRow · ViewEventKind · ViewEvent
    sequence.ts          SequenceRow · StepRow · EnrollmentState · EnrollRequest
    scorecard.ts         ContentScorecard · ChannelScorecard · ActorScorecard
  auth.ts                + 8 quyền mới (§9)

packages/engines/src/
  types.ts               ObjectKind += 'TL'
  comms-rollup.ts        MỚI · hàm thuần: gộp message → bốn trục của §7
  sequence.ts            MỚI · hàm thuần: bước kế tiếp · điều kiện thoát · hạn mỗi bước
  e4-notifications.ts    + rule "khách trả lời" · "asset xem > 2 phút"

apps/api/src/platform/comms/
  comms.schema.ts        identity · thread · message · message_party · link · blob
                         · consent · unmatched · connection
  comms.constraints.ts   CHECK: direction · side · capture_source · consent purpose
  comms.mapper.ts
  identity.repository.ts · identity.service.ts · identity.controller.ts
  thread.repository.ts   · thread.service.ts   · thread.controller.ts
  link.service.ts        gắn/gỡ thread ↔ object, kiểm quyền object đích
  resolve.service.ts     address → identity; không khớp thì đẩy vào unmatched
  consent.repository.ts  · consent.service.ts · consent.controller.ts
  retention.sweeper.ts   xoá blob quá hạn, trừ legal_hold
  capture/
    capture.adapter.ts   interface (§4)
    gmail.adapter.ts · graph.adapter.ts · zalo-oa.adapter.ts
    telegram.adapter.ts · cti.adapter.ts
    connection.repository.ts · connection.service.ts · connection.controller.ts
    capture.consumer.ts  pg-boss: comms.sync.pull · comms.resolve · comms.transcribe
    webhook.controller.ts  chữ ký, không phiên — khuôn của mail-webhook.controller.ts
  comms.module.ts

apps/api/src/branches/sales/content/
  asset.schema.ts · asset.mapper.ts · asset.repository.ts
  asset.service.ts · asset.controller.ts
  share.schema.ts · share.repository.ts · share.service.ts · share.controller.ts
  share-token.ts         đúc/verify token — khuôn của unsubscribe-token.ts
  view.controller.ts     GET /v/:token + beacon · công khai, có hạn
  sequence.schema.ts · sequence.constraints.ts · sequence.repository.ts
  sequence.service.ts · sequence.controller.ts
  sequence.consumer.ts   pg-boss: sequence.tick
  scorecard.repository.ts · scorecard.controller.ts
  plugins/
    outbound.plugin.ts   interface (§6.2)
    email.plugin.ts      gọi MasService.send() — KHÔNG viết lại hàng đợi
    zalo-oa.plugin.ts · telegram.plugin.ts
  content.module.ts

apps/api/drizzle/
  <n+1>_comms_identity.sql       lượt 0 — ĐÁNH SỐ LÚC TẠO, sau file cao nhất
  <n+2>_comms_thread.sql         lượt 1   đang có. Không đặt số trước: phiên
  <n+3>_comms_capture.sql        lượt 2   song song đã lấy tới 0038 (14/09)
  <n+4>_content_library.sql      lượt 3
  <n+5>_content_sequence.sql     lượt 4
  <n+6>_comms_blob.sql           lượt 5
  KHÔNG có migration cấp quyền — xem ghi chú ngay dưới
  00xx_grant_comms_perms.sql     8 quyền vào ma trận vai (ma trận đã ở DB từ 11d97cb)

apps/web/src/data/
  comms-threads.ts · comms-identities.ts · comms-connections.ts
  comms-unmatched.ts · content-assets.ts · content-shares.ts
  sequences.ts · content-scorecard.ts

apps/web/src/pages/
  comms-unmatched.tsx      hàng chờ "chưa nối được"
  my-connections.tsx       hộp thư đã nối + hệ đang giữ gì của tôi
  content-library.tsx · content-asset-detail.tsx
  sequences.tsx · sequence-detail.tsx
  content-scorecard.tsx    ba bảng của §7

apps/web/src/components/
  comm-thread-card.tsx     dòng giao tiếp trong hồ sơ lead/cơ hội
  identity-resolve-dialog.tsx · share-dialog.tsx
  asset-picker.tsx · enroll-dialog.tsx · consent-badge.tsx

packages/ui/src/patterns/
  conversation-turn.tsx    MỚI — một lượt nói: phía · người · giờ · thân · đính kèm
                           (dùng lại timeline · channel-tag · rich-text · file-drop)
apps/web/src/kit/
  + conversation-turn vào zone patterns — không có mặt trên kit coi như chưa tồn tại
```

**Dùng lại, không dựng mới:** `MasService` (gửi · suppression · cầu dao bounce) ·
`platform/queue` (pg-boss) · `ObjectMirror` · `E2` scope · `E3` cho mọi đề xuất
AI · `Timeline` · `ChannelTag` · `FileDrop` · `BarChart` · `Sparkline` ·
`DataTable` · `StatCard`.

---

## §16 · Ta sẽ có những gì — bảng function đầy đủ

### A · Nạp (12)

| Mã  | Function                       | Ở đâu                                 | Quyền / cơ chế      |
| --- | ------------------------------ | ------------------------------------- | ------------------- |
| A1  | Nối hộp thư của chính mình     | `connection.service`                  | `comm.connect`      |
| A2  | Ngắt kết nối, xoá cursor       | `connection.service`                  | `comm.connect`      |
| A3  | Kéo thư mới theo cursor        | `capture.consumer`                    | nền · 5 phút        |
| A4  | Nhận webhook chat              | `webhook.controller`                  | chữ ký              |
| A5  | Nhận webhook cuộc gọi (CTI)    | `cti.adapter`                         | chữ ký              |
| A6  | Chuẩn hoá thư → message        | `*.adapter.normalize`                 | —                   |
| A7  | Chống trùng theo `external_id` | `thread.repository`                   | UNIQUE              |
| A8  | Nối địa chỉ → identity         | `resolve.service`                     | nền                 |
| A9  | Đẩy vào hàng chờ chưa nối      | `resolve.service`                     | nền                 |
| A10 | Lọc bỏ thư không nối được      | `resolve.service`                     | §5a · chỉ đếm       |
| A11 | Ghi tay một lần tiếp xúc       | `POST /comms/messages`                | `comm.view`         |
| A12 | Nạp transcript (dán/tải)       | `POST /comms/messages/:id/transcript` | `comm.view-content` |

### B · Đọc và nối (8)

| Mã  | Function                      | Cửa                               | Quyền                  |
| --- | ----------------------------- | --------------------------------- | ---------------------- |
| B1  | Dòng giao tiếp của một object | `GET /comms/threads?object=`      | `comm.view` · scoped   |
| B2  | Các lượt trong một thread     | `GET /comms/threads/:id/messages` | `comm.view`            |
| B3  | Xem thân thư / transcript     | cùng cửa, trường ẩn theo quyền    | `comm.view-content`    |
| B4  | Gắn thread vào object khác    | `POST /comms/threads/:id/links`   | `comm.view` + sửa đích |
| B5  | Gỡ gắn nhầm                   | `DELETE …/links/:code`            | như trên               |
| B6  | Lưu trữ một thread            | `PATCH /comms/threads/:id`        | `comm.view`            |
| B7  | Ghi vết mỗi lượt đọc nội dung | `platform.audit`                  | tự động · §5c          |
| B8  | Tìm trong nội dung đã lưu     | `GET /comms/search`               | `comm.view-content`    |

### C · Danh tính và đồng ý (6)

| Mã  | Function                     | Cửa                                 | Quyền                 |
| --- | ---------------------------- | ----------------------------------- | --------------------- |
| C1  | Xem hàng chờ chưa nối        | `GET /comms/unmatched`              | `comm.capture-manage` |
| C2  | "Đây là ai" → đẻ identity    | `POST /comms/unmatched/:id/resolve` | `comm.capture-manage` |
| C3  | Sổ định danh kênh            | `GET/POST/PATCH /comms/identities`  | `comm.capture-manage` |
| C4  | Gộp hai identity trùng       | `POST /comms/identities/merge`      | `comm.capture-manage` |
| C5  | Ghi/thu hồi đồng ý           | `POST/DELETE /comms/consent`        | `comm.capture-manage` |
| C6  | Chặn ghi âm khi thiếu đồng ý | `comms.constraints`                 | cửa ghi · §5d         |

### D · Thư viện nội dung (9)

| Mã  | Function                        | Cửa                                   | Quyền              |
| --- | ------------------------------- | ------------------------------------- | ------------------ |
| D1  | Sổ nội dung                     | `GET /content/assets`                 | `content.view`     |
| D2  | Tạo / sửa asset                 | `POST/PATCH /content/assets`          | `content.edit`     |
| D3  | Tải phiên bản mới + changelog   | `POST /content/assets/:code/versions` | `content.edit`     |
| D4  | Xuất bản / thu hồi              | `POST /content/assets/:code/publish`  | `content.edit`     |
| D5  | Xem lịch sử phiên bản           | `GET /content/assets/:code/versions`  | `content.view`     |
| D6  | Gửi cho n người → n link        | `POST /content/shares`                | `content.share`    |
| D7  | Thu hồi một link đã gửi         | `DELETE /content/shares/:id`          | `content.share`    |
| D8  | Trang xem của khách             | `GET /v/:token`                       | công khai · có hạn |
| D9  | Beacon xem/cuộn/tải/chuyển tiếp | `POST /v/:token/events`               | công khai          |

### E · Nhịp gửi (7)

| Mã  | Function                                 | Cửa                                  | Quyền          |
| --- | ---------------------------------------- | ------------------------------------ | -------------- |
| E1  | Tạo/sửa nhịp và các bước                 | `POST/PATCH /content/sequences`      | `content.edit` |
| E2  | Ghi lead vào nhịp                        | `POST /content/sequences/:id/enroll` | `sequence.run` |
| E3  | Dừng một lead khỏi nhịp                  | `POST /content/enrollments/:id/stop` | `sequence.run` |
| E4  | Đẩy bước tới hạn                         | `sequence.consumer`                  | nền            |
| E5  | **Tự thoát khi khách trả lời**           | `sequence.ts` (engine, thuần)        | nền · trục 3   |
| E6  | Tự thoát khi lead rời phễu / huỷ đăng ký | `sequence.ts`                        | nền            |
| E7  | Bảng nhịp theo bước                      | `GET /content/sequences/:id`         | `content.view` |

### F · Đo (6)

| Mã  | Function                          | Cửa                               | Quyền              |
| --- | --------------------------------- | --------------------------------- | ------------------ |
| F1  | Thẻ điểm theo nội dung            | `GET /content/scorecard?by=asset` | `performance.view` |
| F2  | Thẻ điểm theo kênh                | `?by=channel`                     | `performance.view` |
| F3  | Thẻ điểm theo người               | `?by=actor`                       | `performance.view` |
| F4  | Số hội thoại của một object       | `GET /comms/scorecard?object=`    | `comm.view`        |
| F5  | Thử nghiệm A/B + nhóm giữ trắng   | `content.variant` · `enrollment`  | `content.edit`     |
| F6  | Digest hàng tuần cho chủ nội dung | `content.digest.weekly` qua E4    | nền                |

### G · AI, tất cả chờ nút (4)

| Mã  | Function                         | Căn cứ in ra            | Đi tiếp thành       |
| --- | -------------------------------- | ----------------------- | ------------------- |
| G1  | Tóm tắt buổi họp + việc phải làm | transcript có dấu giờ   | dòng `touch` + việc |
| G2  | Soạn thư theo dõi                | ba lượt gần nhất        | nháp `MasMailModal` |
| G3  | Gợi ý nội dung gửi tiếp          | asset đã gửi + trục 3   | một `content.share` |
| G4  | Cảnh báo rủi ro                  | ba câu trích nguyên văn | cảnh báo trên hồ sơ |

**52 function · 22 cửa HTTP · 6 việc nền · 8 quyền · 9 bảng · 1 pipeline mới.**

---

## §17 · Bốn quyết định của §14 — chốt 14/09/2026

### 1 · `comms` đứng ở `platform`

Chủ dự án giao lại cho bên thi công chọn theo best practice; chọn **`platform`**.

Ba lý do, xếp theo sức nặng: hội thoại **không riêng của Sales** — ngày có nhánh
Supply thì thư với nhà cung cấp là cùng một bảng, và một sổ `sales.comms` sẽ phải
đẻ bản sao; `comms.link` trỏ `platform.object` là thứ **duy nhất** cho phép một
thread treo đồng thời vào lead, công ty và cơ hội; và mọi CRM lớn đều đặt sổ hoạt
động ở tầng nền chứ không trong một module bán hàng.

**Cái giá, nhận rõ:** khoá ngoại `comms.link.object_code → platform.object(code)`
chỉ đứng được khi **mọi** object được nối đều có dòng gương. Lead đã có khoá ngoại
thật; cơ hội hôm nay là **kỷ luật chứ chưa phải hàng rào**. Nên **lượt 0 gánh thêm
việc đóng khoản nợ đó** — `ObjectMirror` đã viết sẵn, việc còn lại là bắt
`opportunity.code` đi qua nó và thêm khoá ngoại. Đây là phần phải xác minh ở pha 0
trước khi viết dòng nào.

### 2 · Một hộp chung `contact@`, không nối hộp thư cá nhân

Bốn hệ quả, và cái thứ ba là cái phải làm thêm:

- **§5a nhẹ đi ở chỗ khó nhất.** Một hộp nghiệp vụ không chứa thư riêng của ai,
  nên không còn bài toán "CRM nuốt hộp thư cá nhân của nhân viên". Chỉ cần một
  kết nối, một lần OAuth, quyền `comm.capture-manage` — không cần `comm.connect`
  cho từng người ở lượt 2. **Quyền `comm.connect` hoãn**, không xoá khỏi danh sách:
  ngày mở hộp cá nhân là ngày cần nó.
- **Thư chưa nối được thì GIỮ, có hạn.** Khác với hộp cá nhân: người lạ viết vào
  `contact@` vẫn là việc của công ty. Nên hàng chờ chưa nối **giữ cả thân thư**,
  `retention_until` mặc định 30 ngày, và số ngày đó sống trong `config_entry`
  (quyết định 4).
- **Mất chiều thư cá nhân — và đây là lỗ có thật.** Sales viết cho khách từ hộp
  riêng thì hệ không thấy. Vá bằng đúng thứ Salesforce (_Email to Salesforce_) và
  HubSpot (_BCC address_) làm: **một địa chỉ hứng BCC** để nhân viên BCC vào khi
  viết từ hộp riêng. Cùng adapter, cùng đường chống trùng theo `Message-ID`; chỉ
  khác một luật nối: người **gửi** là `member`. Làm ở **lượt 2**, không phải lượt 0.
- **Không dựng hộp thư đến.** Vẫn giữ nguyên §13.3: nạp và đọc, không soạn.

### 3 · CÓ viết test cho hai file engine thuần

`packages/engines/src/comms-rollup.ts` và `sequence.ts` được viết test — chủ dự án
cho phép rõ ràng, nên đây là ngoại lệ **được cấp**, không phải agent tự cho mình.

Ranh giới của ngoại lệ, để nó không nở ra: **chỉ hai file này**, chỉ hàm thuần,
không React, không fixture, không HTTP. Test bám vào điều kiện thoát nhịp và phép
gộp bốn trục — hai chỗ hỏng im lặng. Mọi test UI vẫn bị cấm như cũ.

### 4 · Mọi ngưỡng sống trong `config_entry`

Không hằng số nào trong số này được viết cứng trong code, và số đầu tiên do người
chốt chứ không do agent chọn:

| Khoá                              | Là gì                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| `comms.reply.silence-days`        | im lặng bao nhiêu ngày thì lượt trả lời tính là mốc `cham` |
| `comms.unmatched.retention-days`  | thư chưa nối giữ bao lâu (mặc định đề xuất 30)             |
| `comms.blob.retention-days`       | ghi âm/ghi hình giữ bao lâu                                |
| `sequence.step.default-wait-days` | khoảng chờ mặc định giữa hai bước                          |
| `sequence.max-steps`              | trần số bước một nhịp                                      |
| `content.share.expires-days`      | link theo dõi hết hạn sau bao lâu                          |

`rules-reviewer` soi đúng chỗ này: một ngưỡng viết cứng là phát hiện mức **chặn**.

---

## §18 · Kết quả pha 0 — bốn chỗ bản này từng nói sai, 14/09

Xác minh bằng code thật trước khi viết dòng đầu tiên. Bốn phát hiện, đã sửa
ngược vào §1 · §2 · §15 ở trên; phần dưới ghi cái chưa sửa được vì cần người chốt.

| #   | Bản này từng nói                       | Code thật                                                                                                                                     |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "phía khách chưa có bảng nào"          | `sales.contact` là bảng thật từ 0018 (28/08), có `code`·`email`·`phone`, khoá ngoại vào `platform.object`, API và màn thật, không còn `load:` |
| 2   | `comms.identity.contact_code`          | phải là `object_code` — vì `lead.email` mới là địa chỉ MAS gửi tới, còn `contact.email` không lượt gửi nào đọc                                |
| 3   | cần `_grant_comms_perms.sql`           | không cần. `RolePermissionSeeder` tự gieo; đổi lại phải sửa `Permission` ở **hai** union và chúng bị assert bằng nhau                         |
| 4   | "mọi ngưỡng sống trong `config_entry`" | `config_entry` **không phải** kho khoá-giá trị — xem ngay dưới                                                                                |

### `config_entry` không chứa được một ngưỡng — và đây là quyết định còn treo

`config_entry` là registry của **tám danh mục có tên**: `STAGE` · `TIER` ·
`CATEGORY` · `EXIT_REASON` · `CHANNEL` · `SOURCE` · `PRODUCT` · `LOSS_REASON`.
Mỗi dòng là **một mục** có `id`·`name`·`ord` — từ vựng người dùng chọn từ danh
sách. Cột số duy nhất là `limitDays`, và CHECK `config_limit_only_ladder` khoá nó
cho đúng hai danh mục dạng bậc thang.

"Im lặng bao nhiêu ngày thì tính là trả lời lần đầu" không có `name` để hiển thị,
không có `ord`, không thuộc danh mục nào. Nhét nó vào đây phải mở một `list` thứ
chín và nới một CHECK đang neo có chủ đích — tức bẻ ngữ nghĩa của bảng để chứa
một thứ khác loại.

**Đề xuất: một bảng `platform.setting` riêng** — `key` · `value` · `unit` ·
`updated_by` · `updated_at`, một dòng một hằng số hệ thống, có màn admin và có
audit. Ranh giới sạch: `config_entry` giữ **từ vựng người dùng gõ**,
`platform.setting` giữ **hằng số hệ thống người vận hành chỉnh**. Đường thứ ba
(ENV) bị loại vì đổi một ngưỡng sẽ thành một lần deploy.

**Chưa chốt.** Không chặn lượt 0 (lượt 0 không cần ngưỡng nào), **chặn lượt 1–2**.

### Phạm vi nợ dòng gương — chốt hẹp lại

Pha 0 đếm ra bốn tình trạng khác nhau, không phải hai:

| Object                         | Dòng gương | Khoá ngoại | Xử ở đâu                                                                                    |
| ------------------------------ | ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| `lead` · `account` · `contact` | có         | **có**     | không nợ — lượt 0 chỉ nối vào đây                                                           |
| `opportunity`                  | có         | không      | trả ở **lượt 1**, khi thread cần nối vào `OP`                                               |
| `contract`                     | có         | không      | trả **cùng lượt 1** — cùng một migration, cùng một dạng nợ                                  |
| `campaign`                     | không      | không      | **ngoài phạm vi** — chưa có cả `ObjectKind`; ngày `comms` cần nối vào chiến dịch thì mở lại |

Nên **lượt 0 không gánh nợ dòng gương nào** — đính chính §17.1, vốn xếp việc đó
vào lượt 0. Nó chuyển sang lượt 1 và rộng hơn một object so với §17 đã viết.
