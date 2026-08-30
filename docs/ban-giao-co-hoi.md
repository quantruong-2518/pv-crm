# Bàn giao — module 3 · Cơ hội (Ops)

Lát cắt **28/08/2026**, nhánh `develop`. Tiếp nối [`ban-giao-db.md`](./ban-giao-db.md)
(lược đồ) và [`ban-giao-api.md`](./ban-giao-api.md) (khung `apps/api`).

Module Cơ hội đã đi hết một vòng: bảng → endpoint → màn → mail. Schema đã lên
production. **Code thì chưa** — và lý do nằm ở mục ngay dưới đây.

---

## Việc bạn phải làm — theo đúng thứ tự này

### 1 · Đợi `apps/api` biên dịch được

```
apps/api/src/branches/sales/campaign/mas.service.ts(372,5): error TS2741:
  Property 'hidden' is missing in type '{ … sendable; blocked; apolloCount }'
```

Code MAS mail đang viết dở. `apps/api` build bằng `tsc -p tsconfig.json`, nên
Docker image hỏng ngay ở bước đó — deploy bây giờ là build hỏng, không phải một
lượt deploy tệ.

Kiểm: `pnpm typecheck` phải sạch cả hai project.

### 2 · Cài `flyctl` (máy này chưa có)

`command -v flyctl` và `command -v fly` đều rỗng, `~/.fly/bin` không tồn tại.
Docker có nhưng không thay được.

```bash
curl -L https://fly.io/install.sh | sh
~/.fly/bin/flyctl auth login     # tương tác — phải tự chạy
```

### 3 · Cổng kiểm rồi deploy

```bash
pnpm check
pnpm fly:deploy                  # fly deploy . --config apps/api/fly.toml
```

Xác nhận bằng `healthz` THẬT, đừng tin dòng `deployed` của flyctl:

```bash
curl -s https://pvone-crm-api.fly.dev/healthz     # {"status":"ok","db":true}
```

### 4 · Khai hộp thư nhận mail cơ hội

```bash
fly secrets set PV_OPS_NOTIFICATION_TO=<địa-chỉ> -a pvone-crm-api
```

**Bỏ trống = KHÔNG có mail nào được xếp hàng.** E4 bỏ rule khi audience không có
địa chỉ — im lặng và đúng thiết kế, nhưng đừng đợi thư rồi thắc mắc.

Khoá này TÁCH khỏi `PV_LEAD_NOTIFICATION_TO` có chủ ý: báo lead mới là việc của
người trực form landing page, báo cơ hội là việc của người gật đơn. Cùng một hộp
thư hôm nay không có nghĩa là cùng một hộp thư mãi. Nếu hai luồng cùng về
`contact@pebblevina.com` thì đặt bằng nhau — vẫn là hai khoá.

### 5 · Câu trả lời còn thiếu

Hai trong ba câu của bản 28/08 nay đã có code trả lời — xem mục
["Vòng hai"](#vòng-hai--28082026-chiều) ở cuối file. Còn lại một:

| Câu hỏi                                                              | Vì sao cần bạn quyết                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`opportunity.code` có nên khoá ngoại về `platform.object` không?** | `lead.code` có, `opportunity.code` thì chưa — nên dòng gương E1 là kỷ luật của service chứ không phải hàng rào. Quên là ContextRail của đơn mới mở ra trống mà không có gì đỏ (luật 10 gãy im lặng). Thêm khoá cần kiểm 16 dòng production có đủ object row không. |

Hai câu đã trả lời, ghi lại để không ai đi hỏi lần nữa:

- **"Nạp cơ hội từ tệp" có quay lại không** — cửa máy chủ đã dựng
  (`POST /sales/opportunities/import` + `/import/preview`). Nút trên màn thì CHƯA gắn lại;
  đó là việc của `apps/web`, và `OP_SPEC`/`ImportZone` vẫn nguyên chờ nó.
- **Đơn thắng ghi ở đâu** — `POST /sales/opportunities/:code/contract`, quyền `cơ-hội.chốt`.
  Vẫn đúng nguyên tắc cũ: "đã thắng" là dòng bên `contract`, suy ra chứ không lưu.

---

## Đã lên production

**Neon đã áp 5 migration** (trước đó dừng ở 0006):

|                                  |                             |               |
| -------------------------------- | --------------------------- | ------------- |
| `0007_mas_mail_run`              | bảng MAS mail               | của phiên MAS |
| `0008_opportunity_columns`       | bồi cột + bảng nối + dãy mã | module này    |
| `0009_opportunity_drop_owner_id` | bỏ cột cũ                   | module này    |
| `0010_mas_unsub_once`            | index unsubscribe           | của phiên MAS |
| `0011_opportunity_stage_clock`   | `stage_since`               | module này    |

Không tách được: `drizzle-kit migrate` chạy mọi bản chưa áp theo thứ tự journal.
Hai bản MAS chỉ `CREATE TABLE`/`CREATE INDEX` trong schema `platform` — không xoá
gì, không đụng dữ liệu đang có.

Số liệu sau khi áp, đọc từ chính Neon:

```
sales.opportunity   16 dòng   sales.opportunity_owner  16 dòng (SALE ×16)
sales.lead         122 dòng   sales.contract            6 dòng
name trống 0 · attachments trống 0 · stage có mà stage_since trống 0
mã kế tiếp dãy sẽ cấp: OP-5001
```

Cả năm cột pipeline còn nguyên sau khi nạp `state` ngược từ `stage`:

| state           | stage          | n   |
| --------------- | -------------- | --- |
| `gui-quotation` | da-bao-gia     | 2   |
| `nego`          | (null · đã ký) | 6   |
| `nego`          | cho-ky         | 2   |
| `pending`       | da-demo        | 2   |
| `pending`       | moi            | 2   |
| `pending`       | tim-hieu       | 2   |

**API đang chạy trên Fly không việc gì.** Nó chạy image cũ, không biết bảng mới —
và an toàn vì một lý do cụ thể: không dòng code nào đang deploy TRUY VẤN
`sales.opportunity`. Ngoài module mới và `seed.ts`, bảng đó chỉ xuất hiện ở một
khai báo khoá ngoại trong `contract.schema.ts`. Drizzle chỉ sinh SQL cho query
thật sự chạy, nên `owner_id` biến mất không đụng đường nào đang sống.

---

## Đã dựng những gì

### Dữ liệu

`sales.opportunity` bồi thêm: `state` · `name` · `account_code` · `description`
· `attachments` (jsonb) · `lost_note` · `stage_since`. Bỏ `owner_id`.

Bảng nối `sales.opportunity_owner(opportunity_code, actor_id, role)` — khoá
chính ba cột (một người đứng được cả hai vai), FK hai đầu, index trên `actor_id`
cho câu "đơn của tôi".

Dãy `sales.opportunity_code_seq` bắt đầu ở **5001**, và con số đó không phải chọn
bừa: fixture rải mã cơ hội ở BA khoảng rời nhau — `OP-0201…02xx`, `OP-0248…0305`,
và **`OP-2711…2716`** (suy từ `contractCode`). Một dãy bắt đầu ở 401 không đụng gì
trong hai nghìn đơn đầu rồi đơn thứ ~2310 thua khoá chính.

### `state` và `stage` là HAI cột, không phải một

Đây là chỗ dễ hiểu sai nhất của module này.

- `state` — người bán ĐANG LÀM GÌ. Bốn giá trị: `gui-quotation` · `nego` ·
  `close-lost` · `pending`. **Không có `close-won`** — "đã thắng" là dòng bên
  `contract`, suy ra chứ không lưu.
- `stage` — đơn NẰM CỘT NÀO. Năm cột.

Năm trạng thái chỉ ánh xạ xuống BA trong năm cột; `moi` và `da-demo` không có
trạng thái nào trỏ tới. Nên `stage` **không suy được** từ `state`, và một cột sinh
(`GENERATED`) sẽ xoá mất cột của bốn đơn đang mở. Lúc tạo, `stage` lấy giá trị đầu
từ `stageOfState`; sau đó hai cột rời nhau hợp lệ.

`stage_since` chỉ được chạm khi cột THẬT SỰ đổi — sửa tên đơn mà cũng dí lại đồng
hồ thì mọi đơn đều "vừa mới vào cột" và tín hiệu mục không bao giờ bật nữa.

### Endpoint

|                                    | quyền                 |                                       |
| ---------------------------------- | --------------------- | ------------------------------------- |
| `GET /sales/opportunities`         | `cơ-hội.xem` · scoped | sổ, phân trang, trả `hidden` (luật 7) |
| `GET /sales/opportunities/:code`   | `cơ-hội.xem` · scoped | 404 và 403 là hai câu khác nhau       |
| `POST /sales/opportunities`        | `cơ-hội.sửa`          | đổi lead thành cơ hội                 |
| `PATCH /sales/opportunities/:code` | `cơ-hội.sửa` · scoped | lưu phiếu ở hồ sơ                     |

Cửa ghi đòi `cơ-hội.sửa` chứ **không** `cơ-hội.chốt`: mở một đơn thì đóng lại
được, ký thì không. Gộp vào `chốt` nghĩa là muốn cho BD mở đơn thì phải cho họ
luôn quyền ký.

Hợp đồng zod: `packages/contracts/src/sales/opportunity.ts`.
Module: `apps/api/src/branches/sales/opportunity/`.

### Màn

Cả bốn file đã cắt khỏi fixture, đọc/ghi máy chủ thật:

- `apps/web/src/data/ops.ts` — `opsBookQuery` bỏ `load` (nghi thức cắt duy nhất,
  xem `app/api/client.ts`), `opsProfileQuery`, helper hai vai, `isRottingOp`
- `apps/web/src/data/ops-write.ts` — hai cửa ghi + `draftOf`/`createBodyOf`/`updateBodyOf`
- `apps/web/src/pages/ops.tsx` · `ops-detail.tsx`
- `apps/web/src/components/convert-dialog.tsx` — POST thật, chỉ đóng khi máy chủ nhận

Phiếu vẫn cầm `OpportunityDraft` (14 ô) ở cả popup lẫn hồ sơ; `ops-write.ts` là
đường dịch duy nhất sang thân request.

### Mail

Hai template, nối vào trigger thật — không phải template chết:

- `opportunity-opened` — một lead vừa lên cơ hội, gửi hộp thư nội bộ
- `opportunity-lost` — một đơn vừa thua, chở LÝ DO lên đầu

Cả hai nghe cùng event E4 `sales.opportunity.opened`, tách nhau bằng `when(data.lost)`.
Composer ở `opportunity-mail.composer.ts`, đăng ký trong `worker.ts`. Xếp hàng
nằm TRONG transaction đã ghi cơ hội (`OpportunityService#notify`).

Đã bắn thử thật qua Resend, hai lá nhận được, có `provider_email_id`.

---

## Bốn lỗi chỉ lộ ra khi BẤM

Build xanh, lint xanh, smoke test API xanh — bốn lỗi này vẫn lọt. Ghi lại vì
chúng là bài học về chỗ nào tự kiểm không tới.

1. **Mọi `PATCH` chết ở preflight.** `enableCors` không khai `methods`, mặc định
   mở `GET · HEAD · POST`. Máy chủ **không có dòng log nào** vì request thật chưa
   từng được gửi; `curl` chạy ngon vì `curl` không preflight. Client đã ghi sẵn
   nguyên nhân trong docblock của `WriteOptions` từ trước — ghi chú đó nằm im tới
   khi có người bấm.
2. **Vá hỏng một nhịp:** siết `allowedHeaders` xuống hai cái làm chết cả `GET` —
   client còn gắn `X-PV-Request-Id`, mà request mang header lạ thì luôn preflight.
3. **Lưu một đơn làm nó tự đổi cột.** `fromUpdate` tính lại `stage` ở mọi lượt
   lưu, nên đơn ở "Đã demo" sửa cái tên là bị kéo về "Đang tìm hiểu". Sửa: `state`
   không đổi thì `stage` giữ nguyên.
4. **Phiếu hứa một mã nó không cấp được.** Ô "Mã cơ hội" bày `OP-0305` do trình
   duyệt tự đếm; máy chủ cấp `OP-5001`. Giờ ô đó ghi "cấp khi lưu".

---

## Chạy tại máy

Không đụng Neon — pglite trong chính tiến trình Node:

```bash
cd apps/api
DATABASE_URL="pglite:///tmp/pgl-ui" npx drizzle-kit migrate
DATABASE_URL="pglite:///tmp/pgl-ui" node -r ts-node/register -r tsconfig-paths/register src/seed.ts

DATABASE_URL="pglite:///tmp/pgl-ui" PORT=4123 PV_TRUST_ACTOR_HEADER=true \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts

cd ../web && npx vite --port 5175
```

Đăng nhập bằng bất kỳ email nào trong sổ nhân sự fixture (`sales@pebblevina.com`) và
một mật khẩu ≥ 6 ký tự — `data/auth.ts` cố tình không giữ mật khẩu ở đâu cả.

Muốn xem mail thật thì thêm `PV_EMAIL_ENABLED=true`, `RESEND_API_KEY=…`,
`PV_OPS_NOTIFICATION_TO=…` rồi chạy `src/worker.ts` cạnh `src/main.ts`.

---

## Nợ đã biết

- **Nhãn tiếng Việt có hai bản** — `opportunity-mail.composer.ts` (cho mail) và
  `components/ops-fields.tsx` (cho màn). Trả cùng lúc với bước tách fixture của
  [`ban-giao-backend.md`](./ban-giao-backend.md), không sớm hơn: hôm nay nhãn màn
  còn nằm trong fixture, mà `apps/api` chỉ được nhập fixture ở `seed.ts`.
- **`PeopleRow` vẫn đọc `dasVina.actors`** — chạy được vì `platform.actor` seed từ
  chính fixture nên id khớp. Đó là may, không phải đúng. Cần một endpoint sổ nhân
  sự thật.
- **`desk.deals` còn một người đọc duy nhất** — thẻ `ConvertedCard` ở hồ sơ lead.
  Biến mất ngày hồ sơ lead hỏi được máy chủ "lead này có cơ hội nào chưa".
- **`stage_since` của 16 dòng production là xấp xỉ** — nạp bằng `created_at` vì
  bảng chưa từng ghi lượt đổi cột nào. Cận DƯỚI, nên tín hiệu "mục" có thể báo
  sớm nhưng không bỏ sót. Từ lượt ghi tiếp theo là số thật.
- **`expected_close` của 16 dòng đó là NULL** — fixture chưa bao giờ có dữ liệu
  này. Hệ quả nhìn thấy được: cột "Close date" của chúng vẽ "—", và **không lưu
  được phiếu cho tới khi điền ngày** (hợp đồng đòi ô đó).

---

## Vòng hai · 28/08/2026 chiều

Bốn cửa máy chủ còn thiếu đã dựng xong, `pnpm check` xanh, và cả bốn đã bấm thử
thật trên pglite tại máy (migrate → seed → boot → curl). **Chưa deploy, chưa nối
màn nào.**

### Endpoint mới

|                                            | quyền                  |                                                  |
| ------------------------------------------ | ---------------------- | ------------------------------------------------ |
| `GET /sales/opportunities?leadCode=`       | `cơ-hội.xem` · scoped  | lọc sổ theo lead — giết lỗi đổi lead hai lần     |
| `GET /sales/opportunities/:code/touches`   | `cơ-hội.xem` · scoped  | dòng thời gian của một đơn                       |
| `GET /sales/leads/:code/touches`           | `lead.xem` · scoped    | dòng thời gian của một lead                      |
| `POST /sales/opportunities/import/preview` | `cơ-hội.sửa`           | chạy thử, không ghi gì                           |
| `POST /sales/opportunities/import`         | `cơ-hội.sửa`           | nạp thật, cả lô hoặc không dòng nào              |
| `POST /sales/opportunities/:code/contract` | `cơ-hội.chốt` · scoped | **ký** — đường ĐẦU TIÊN dùng quyền `cơ-hội.chốt` |

### Bảng mới · `sales.touch`

Migration `0016_contract_touch_sign`, kèm dãy `sales.contract_code_seq`
(bắt đầu 5001, cùng lý do với dãy mã cơ hội — fixture đã chiếm `HĐ-2711…2716`).

`subject_code` + `subject_kind` chứ không hai cột khoá ngoại: Postgres không có
khoá ngoại đa hình, và câu đọc duy nhất của bảng là "dòng thời gian của mã X".
Cái mất — một lần chạm trỏ vào mã không có thật thì bảng nhận — được đỡ bằng
việc MỌI chỗ ghi đều nằm trong transaction đã ghi chính dòng đó. Chi tiết ở
docblock của `touch.schema.ts`.

Ai ghi, hôm nay: mở đơn · đổi trạng thái đơn · ký · nạp lô cơ hội · lead vào sổ
(gõ tay, landing page, nạp tệp). `cham`, `giao`, `gap-lan-dau` có trong enum
nhưng **chưa cửa nào ghi** — chúng ở đó vì màn đã vẽ, và vì nới một CHECK sau
này là một migration.

**Mail KHÔNG đẻ dòng touch.** `GET /sales/leads/:code/mail` đã trả lời "đã viết
cho người này mấy lần" kèm số mở/click mà một dòng touch không chở nổi; ghi cả
hai là dựng hai nguồn sẽ lệch ngay lần đầu một lá xếp hàng rồi gửi hỏng.

### Thư "đơn thua" nay bắn từ đường sửa

Trước: chỉ cửa TẠO bắn thư, nên một đơn mở bình thường rồi thua sau đó không ai
được báo. Nay `PATCH` bắn khi `becameLost` — `state` MỚI là `close-lost` và
`state` CŨ thì không. `lost` một mình là sai: nó đúng ở mọi lượt lưu một đơn đã
thua, tức đúng cái bẫy "một lá mỗi lượt sửa".

**Không rule E4 nào được thêm.** `opportunity-lost-internal` đã có sẵn và
docblock của nó đã tính trước đường này; `flow` của nó khác `flow` của lá "đơn
mở" nên `UNIQUE(event_key)` không coi lá thứ hai là trùng.

Hệ quả cần biết: thua → mở lại → thua lần nữa chỉ bắn **đúng một lá, mãi mãi**
(`event_key` là `opportunity-lost/internal/v1/<mã>`, `enqueue` là
`onConflictDoNothing`). Đó là hành vi đúng, nhưng là một quyết định.

### Nhãn gộp còn hai bản

`STATE_LABEL`/`STAGE_LABEL` từng nằm trong `opportunity-mail.composer.ts`; nay ở
`opportunity.labels.ts`, dùng chung cho mail và cho câu của dòng thời gian. Bản
của MÀN (`ops-fields.tsx`) vẫn còn — vẫn là khoản nợ cũ, trả cùng bước tách
fixture. Hai bản là nợ; ba bản là một bản sẽ bị quên.

---

## Bàn giao phần FE — chưa làm, đã phác

**Trạng thái:** máy chủ xong và đã bấm thử thật; `apps/web` chưa gọi cửa nào
trong sáu cửa mới. Bản phác dưới đây đã dựng xong nhưng **chưa ai gật** — đọc
mục "Năm quyết định" trước khi chạm file.

### ⚠ Hai cảnh báo đọc trước

1. **Toàn bộ phần máy chủ đang NẰM TRONG CÂY LÀM VIỆC, chưa commit.** Gồm cả
   migration `0016_contract_touch_sign` và thư mục `branches/sales/touch/`.
   Mất cây làm việc là mất hết. Commit trước khi làm gì khác.
2. **Có phiên thứ hai sửa cùng repo hôm 28/08** — nó đụng `lead-detail.tsx`,
   `lead-parts.tsx`, `convert-dialog.tsx`, `ops-fields.tsx`, `assign-menu.tsx`,
   `leads.tsx`, `data/intake.ts`, và nhóm `campaign/`. Hai việc số 3 và 4 dưới
   đây nằm gọn trong `ops.tsx`/`ops-detail.tsx` nên an toàn; hai việc số 1 và 2
   đụng đúng nhóm file kia — **đọc lại file ngay trước khi sửa.**

### Bốn việc, theo đúng thứ tự chặn nhau

**1 · Bỏ `opportunityOfLead` của fixture** — `pages/lead-detail.tsx:270`

Đây là LỖI THẬT đang sống, không phải nợ thẩm mỹ: lead tạo sau khi fixture đóng
băng luôn trả `undefined`, nên nút "Đổi thành cơ hội" vẫn sáng và mở được đơn
thứ hai cho cùng một khách. Chống đỡ duy nhất hôm nay là `desk.deals` trong
localStorage — đổi máy là hết.

Đổi sang `opsBookQuery` có `leadCode`, rồi `desk.deals`/`convert`/`undoConvert`
xoá khỏi `app/desk.ts` cùng thẻ `ConvertedCard` ở `convert-dialog.tsx:312`.

**2 · Nối `ActivityCard`** — `pages/lead-detail.tsx`, `pages/ops-detail.tsx:221`

Cả hai đang nhận `NO_TOUCHES`/`NO_TRANSCRIPT` (hằng số rỗng ở
`data/lead-profile.ts:300`). Thêm `data/touches.ts` với hai query, và một hàm
dịch `TouchRow[]` → `LeadEvent[]`. Hình gần khớp sẵn: `TouchKind` cố tình được
đặt trùng mười giá trị của `LeadEventKind`, nên phép dịch là đổi tên trường
(`note` → `note`, `by` → `by`, `at` → `at`), không phải một bảng tra.

`turns` (transcript) vẫn `NO_TRANSCRIPT` — máy chủ không có và sẽ chưa có.

**3 · Gắn lại nút nạp tệp** — `pages/ops.tsx:213`

`<ScreenHeader title="Sổ cơ hội" />` hôm nay không có `actions`. Thêm
`actions={<ImportZone spec={OP_SPEC} existingKeys={NO_LOCAL_KEYS} … />}`, đúng
hình mà `leads.tsx:481` đang dùng. Cần thêm `data/opportunity-import-wire.ts`
(dịch thuần, đối xứng `lead-import-wire.ts`) và `data/opportunity-import.ts`
(hai lượt gọi, `preview` trước, dừng nếu `rows.length === 0`).

`existingKeys` để RỖNG: máy chủ dedupe theo mã lead, trình duyệt không biết mã
đó. `rowsToOps` ở `data/intake.ts` **không dùng lại** — bộ kiểm máy chủ thay nó.

**4 · Nút "Chốt thắng"** — `pages/ops-detail.tsx`, trong `ToolsBar`

Cửa `POST /sales/opportunities/:code/contract` chưa có ai bấm. Ba ô đều tuỳ chọn ở hợp
đồng, nên drawer chỉ để xác nhận + cho sửa: số tiền (mồi từ đơn), ngày ký (mồi
hôm nay), người ăn hoa hồng (mồi Sale đứng đơn đầu, chọn từ `/users/directory`).

### Sơ đồ đã phác

```
/sales/opportunities  — ĐỔI ĐÚNG MỘT HÀNG
┌─ ScreenHeader "Sổ cơ hội" ───────────────[ Nạp cơ hội từ tệp ]─┐  ← MỚI
├─ ScreenScoreGrid · 4 thẻ điểm ────────────────────────────────┤  giữ nguyên
├─ ScreenToolbar · ô tìm + 4 select ────────────────────────────┤  giữ nguyên
├─ "N dòng khớp · M bị ẩn"                          [ Pager ]   ┤  giữ nguyên
└─ GlassCard variant=b · DataTable 8 cột ───────────────────────┘  giữ nguyên

/sales/opportunities/:code  — ĐỔI ĐÚNG MỘT NÚT + MỘT DRAWER
┌─ ScreenHeader · tên đơn + hàng pill ──────────────────────────┐
├─ main (DealCard · phiếu 14 ô)  ─┬─ side ─────────────────────┤
│   … Lưu / Bỏ sửa                │ LeadCard · PeopleCard       │
│                                  │ ActivityCard ← việc 2       │
├──────────────────────────────────┴──────────────────────────────┤
│ ToolsBar  Ngày mở │ Sale │ [Gọi] [Hồ sơ lead] [Chốt thắng]     │  ← MỚI
└──────────────────────────────────────────────────────────────────┘
      đơn đã ký  → nút thành pill tĩnh "Đã ký · HĐ-5001"
      đơn đã thua → nút biến mất (máy chủ trả 409)

      [Chốt thắng] mở Drawer đè lên, cùng dáng ConvertDialog:
      ┌─ Chốt thắng · OP-5001 ─────────────────────────┐
      │ Số tiền ký   [1.800.000.000] [VND]  mồi từ đơn │
      │ Ngày ký      [2026-08-28]           mồi hôm nay│
      │ Hoa hồng về  [Đỗ Quang Huy ▾]       mồi Sale đầu│
      │ ⚠ Ký xong không gỡ được từ giao diện.          │
      │                        [Huỷ]  [Ký hợp đồng]    │
      └────────────────────────────────────────────────┘
```

| Khối                 | Câu nó trả lời                     | Nguồn dữ liệu                                | Sửa được? |
| -------------------- | ---------------------------------- | -------------------------------------------- | --------- |
| Nút nạp tệp (header) | "đưa pipeline Excel vào bằng gì"   | `POST /sales/opportunities/import[/preview]` | —         |
| Nút Chốt thắng       | "đơn này kết thúc thắng"           | `POST /sales/opportunities/:code/contract`   | —         |
| Drawer ký            | "ký bao nhiêu, ngày nào, ai hưởng" | `OpportunityRow` + `GET /users/directory`    | 3 ô       |
| ActivityCard         | "đơn/khách này đã đi qua những gì" | `GET /sales/{ops,leads}/:code/touches`       | không     |

### Năm quyết định còn treo

Mỗi mục kèm mặc định tôi sẽ lấy nếu không ai nói khác:

1. **Nút Chốt thắng đặt ở `ToolsBar`**, không cạnh nút "Lưu" của phiếu — ký
   không phải lưu form. _(mặc định: ToolsBar)_
2. **`OP_SPEC` còn ô chọn `motion`** mà máy chủ bỏ qua (deal không có cột đó).
   Gỡ `motions` khỏi `OP_SPEC` để không bày một ô không làm gì. _(mặc định: gỡ)_
3. **Đơn đã ký cần in mã hợp đồng**, mà `OpportunityRow` chưa chở nó. Cần một
   sửa BE nhỏ: thêm `contractCode` vào hợp đồng, đổi `EXISTS` thành `LEFT JOIN`
   ở `OpportunityRepository.signed()`. _(mặc định: thêm)_ — **đây là việc BE duy
   nhất còn thiếu; mọi thứ khác đã xong.**
4. **Nút ký chỉ hiện với vai có `cơ-hội.chốt`** — ẩn hẳn với presales, không
   hiện rồi mờ. _(mặc định: ẩn hẳn)_
5. **ActivityCard ở hồ sơ đơn đọc touches của ĐƠN**, ở hồ sơ lead đọc của LEAD,
   không trộn hai dòng thời gian. _(mặc định: như vậy)_

### Dựng lại môi trường để bấm thử

Không đụng Neon — pglite trong chính tiến trình Node:

```bash
cd apps/api
rm -rf /tmp/pgl-ops
DATABASE_URL="pglite:///tmp/pgl-ops" npx drizzle-kit migrate
DATABASE_URL="pglite:///tmp/pgl-ops" node -r ts-node/register -r tsconfig-paths/register src/seed.ts

DATABASE_URL="pglite:///tmp/pgl-ops" PORT=4123 PV_TRUST_ACTOR_HEADER=true \
  PV_OPS_NOTIFICATION_TO=ops@pebblevina.com \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts
```

`PV_TRUST_ACTOR_HEADER=true` cho phép đóng vai bằng header — `u-ha`
(trưởng phòng, thấy cả sổ), `u-huy` (sale, `ownOnly`), `u-anh` (presales, KHÔNG
có `cơ-hội.chốt` — dùng để kiểm nút ký phải ẩn).

pglite chỉ một kết nối: **tắt máy chủ trước khi mở cùng thư mục đó bằng script
khác**, nếu không câu truy vấn thứ hai treo.

### Vẫn chưa có, và cố ý

- **Đính kèm thật** — vẫn chỉ tên + cỡ. `apps/api` không có S3/R2/multer nào,
  Fly thì đĩa ephemeral. Chủ dự án chốt 28/08: chưa phát triển.
- **Huỷ ký** — không có `DELETE`. Ký là thứ đã sang tay kế toán và sang tay
  khách; gỡ nó phải là một đề nghị có người duyệt (E3), không phải một lượt gọi
  của người vừa lỡ tay.
- **Cạnh E1 giữa cơ hội và hợp đồng** — dòng gương `HĐ` đã ghi, cạnh thì chưa:
  chưa cửa nào trong `apps/api` ghi `platform.edge` (seed là chỗ duy nhất), nên
  mở quy ước đó phải mở ở `GraphModule`, không phải trong một cửa ký.

---

## Vòng ba · 29/08/2026 — bản phác đã được gật, và lượt A đã đóng

Chủ dự án **gật cả sơ đồ lẫn năm mặc định** ở mục "Năm quyết định còn treo".
Không mục nào bị đổi, nên đọc lại mục đó là đọc được thứ đã dựng.

### Thứ tự làm bị ĐẢO so với "bốn việc chặn nhau" — vì va chạm, không vì kỹ thuật

Cảnh báo #2 của mục trên ("có phiên thứ hai sửa cùng repo") **vẫn đúng và đang
xảy ra**: phiên đó giữ `lead-detail.tsx`, `lead-parts.tsx`, `assign-menu.tsx`,
`packages/ui/src/layout/drawer.tsx`, và đang dựng module `meeting`
(`sales.meeting` + `meeting_attendee`, migration `0017`) kèm
`components/meetings-card.tsx`. Việc 1 và nửa-lead của việc 2 đụng đúng nhóm
file đó; việc 3 và 4 thì không.

Nên bốn việc chia lại làm hai lượt theo TRỤC VA CHẠM chứ không theo thứ tự
chặn nhau ban đầu. Lượt A đã xong; lượt B chờ phiên kia commit.

Cảnh báo #1 ("phần máy chủ chưa commit") thì **hết hạn** — module `touch` và
migration `0016` đã vào `7aa12de`.

### Lượt A — xong

| Việc                    | Đã làm gì                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BE, quyết định #3**   | `OpportunityRow` mọc `contractCode?: MaHopDong`. Ba đường đọc (`book` · `byCode` · `forMail`) lấy `signed` VÀ mã từ **một** `LEFT JOIN`, nên hai trường không lệch được                                                                           |
| **Việc 3** · nạp tệp    | `ops.tsx` có `ImportZone`; thêm `data/opportunity-import-wire.ts` (dịch thuần) + `data/opportunity-import.ts` (preview → dừng nếu 0 dòng → import). `motions` đã gỡ khỏi `OP_SPEC` theo quyết định #2                                             |
| **Việc 2** · nửa ĐƠN    | `data/touches.ts` mới; `ops-detail.tsx` đọc `GET /sales/opportunities/:code/touches` thật. `turns` vẫn `NO_TRANSCRIPT` — máy chủ không có và sẽ chưa có                                                                                           |
| **Việc 4** · Chốt thắng | `components/sign-drawer.tsx` mới + nút trong `ToolsBar` + `useSignContract` ở `ops-write.ts`. Ba mặt: đã ký → pill tĩnh `Đã ký · HĐ-…`; đã thua → không vẽ gì; còn lại → nút, **ẩn hẳn** với vai không có `cơ-hội.chốt` (`useCan`, quyết định #4) |

### Bốn thứ phát hiện khi dựng, không có trong bản phác

1. **`MaHopDong` phải dời sang `primitives.ts`.** `sales/contract.ts` đã import
   `OpportunityRow` từ `./opportunity`; để `opportunity.ts` import ngược lại là
   **vòng tròn chết lúc nạp module** — CommonJS của `apps/api` cho ra
   `undefined.optional()` khi boot. Vẫn đúng một bản regex, `@pv/contracts` vẫn
   export như cũ.
2. **Cửa ký từng trả một đơn `close-won` KHÔNG có mã.** `opportunity.service.ts`
   lắp tay nửa `opportunity` của `ContractSignResponse` với `signed: true` mà
   thiếu `contractCode` — hình mà không lượt đọc nào sinh ra nổi. Màn nào tin
   vào bất biến "đã ký thì có mã" sẽ vỡ đúng một lần ngay sau cú bấm, rồi tự
   lành ở lượt đọc kế tiếp: đúng loại lỗi không ai tái hiện được. Đã vá.
3. **`sales.contract` không có `UNIQUE(opportunity_code, lead_code)`.** Bất biến
   "một đơn một hợp đồng" hôm nay chỉ do cửa `sign` giữ bằng 409. Ngày có hai
   dòng cho một đơn, `LEFT JOIN` nhân dòng trong `book()` trong khi `total`
   (đếm riêng trên `opportunity`) vẫn nói một. Chỗ trả nợ là một unique index,
   **không phải `DISTINCT`** — `DISTINCT` giấu triệu chứng và để lại hai dòng.
4. **`signedAt` không được gửi chuỗi ngày trần.** Cột là `timestamptz` và hợp
   đồng đòi `Moc`. Drawer gửi mốc thật khi ngày chọn là hôm nay, và **12:00 giờ
   địa phương** cho ngày khác — mốc duy nhất còn đọc ra đúng ngày đó ở mọi múi
   giờ từ UTC-11 tới UTC+12. Cắt ngày từ `toISOString()` thì ai bấm sau 17:00
   giờ Hà Nội mở ô ngày ra thấy ngày mai.

### Lượt B — xong

- **Việc 1** · `lead-detail.tsx` hỏi `opportunitiesOfLeadQuery` thay cho
  `opportunityOfLead` của fixture; `desk.deals`/`convert`/`undoConvert` và thẻ
  `ConvertedCard` đã rời hình. Lỗi "mở được đơn thứ hai cho cùng một khách" hết.
- **Việc 2** · nửa LEAD: `ActivityCard` ở `lead-detail.tsx` đọc
  `leadTouchesQuery` thật, đứng ngay sau `MailTimelineCard` trong cột tác vụ.
  `turns` vẫn `NO_TRANSCRIPT` — máy chủ không có transcript và sẽ chưa có.

Module `meeting` của phiên kia ghi dòng `gap-lan-dau` vào `sales.touch`, tức nó
đã lấp một trong ba loại mà mục "Vòng hai" ghi là "chưa cửa nào ghi". Dòng thời
gian của lead nay có loại đó — không phải lỗi.

**Sau lượt B, module Cơ hội hết việc FE.** Ba khoản còn treo đều nằm ở tầng
khác, ghi ở mục "Nợ đã biết" và "Bốn thứ phát hiện khi dựng":
`UNIQUE(opportunity_code, lead_code)` trên `sales.contract` · khoá ngoại
`opportunity.code` → `platform.object` (câu hỏi CHƯA ai quyết) · hai bản nhãn
tiếng Việt.

### Một nợ CŨ mà nút ký chạm vào, cố ý không sửa lệch

Nút "Chốt thắng" dùng `size="md"` (40px) chứ không `lg` (48px), vì cả hàng nút
của `ToolsBar` đều `md` và một nút cao hơn hẳn giữa hàng đọc ra như lỗi bố cục.
Luật 13 đòi ≥ 48px trên tablet, và chỗ lệch này **đã có tên** trong
[`fix-later.md`](./fix-later.md) như một khoản nợ toàn app, không riêng nút này.
Trả nó là một đợt quét, không phải một nút.
