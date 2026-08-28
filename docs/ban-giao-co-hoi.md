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

### 5 · Ba câu trả lời còn thiếu

| Câu hỏi                                                              | Vì sao cần bạn quyết                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nút "Nạp cơ hội từ tệp" có quay lại không?**                       | Tôi đã gỡ khỏi sổ. Nó ghi vào `useIntakeDesk` — chỉ sống trong trình duyệt; trên một cái bảng nay là dữ liệu thật, những dòng đó trông y hệt dòng máy chủ nhưng không ai khác thấy và vẫn được cộng vào thẻ điểm. Bộ đọc CSV (`OP_SPEC`, `rowsToOps` ở `data/intake.ts`) tôi giữ nguyên, chờ `POST /sales/ops/import`. |
| **`opportunity.code` có nên khoá ngoại về `platform.object` không?** | `lead.code` có, `opportunity.code` thì chưa — nên dòng gương E1 là kỷ luật của service chứ không phải hàng rào. Quên là ContextRail của đơn mới mở ra trống mà không có gì đỏ (luật 10 gãy im lặng). Thêm khoá cần kiểm 16 dòng production có đủ object row không.                                                     |
| **Đơn thắng ghi ở đâu?**                                             | Hôm nay "đã thắng" = có dòng trong `sales.contract`, suy ra chứ không lưu. Chưa có cửa nào tạo `contract`, nên chốt thắng chưa làm được từ giao diện.                                                                                                                                                                  |

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

|                          | quyền                 |                                       |
| ------------------------ | --------------------- | ------------------------------------- |
| `GET /sales/ops`         | `cơ-hội.xem` · scoped | sổ, phân trang, trả `hidden` (luật 7) |
| `GET /sales/ops/:code`   | `cơ-hội.xem` · scoped | 404 và 403 là hai câu khác nhau       |
| `POST /sales/ops`        | `cơ-hội.sửa`          | đổi lead thành cơ hội                 |
| `PATCH /sales/ops/:code` | `cơ-hội.sửa` · scoped | lưu phiếu ở hồ sơ                     |

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
