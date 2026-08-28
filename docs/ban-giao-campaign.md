# Bàn giao — Sổ chiến dịch (`sales.campaign`)

Lát cắt **28/08/2026**, nhánh `develop`. Đọc cùng
[`ban-giao-mas-mail.md`](./ban-giao-mas-mail.md) (đường gửi — hàng đợi,
suppression, cầu dao bounce — mà module này KHÔNG viết lại, chỉ gọi tới) và
[`con-thieu-mas-mail.md`](./con-thieu-mas-mail.md) (đóng mục **A3** và **D2**
ở đó — hai mục nay đã bỏ, xoá theo quy ước ghi ở đầu file kia).

File này ghi **CRUD chiến dịch thật đứng trên bảng `sales.campaign`**: tạo,
sửa, thêm/bớt thành viên, bắt đầu chạy (bắn đợt), dừng (huỷ đợt chưa gửi).

---

## Phạm vi

Trả lời đúng ba câu chủ dự án hỏi:

1. **Lên lịch từng đợt** — `POST /sales/campaigns/:code/start` nhận một mảng
   đợt, mỗi đợt có `scheduledAt` riêng.
2. **Bắn MAS mail theo chiến dịch** — mỗi đợt là một lần gọi thẳng
   `MasService.send()` với `campaignCode`, tái dùng nguyên hàng đợi/suppression
   /cầu dao bounce đã có.
3. **Ghi nhận lead thuộc chiến dịch nào** — `campaign_member` (đã có sẵn ở
   schema, nay có cửa `POST /sales/campaigns/:code/members` để ghi).

---

## Tám quyết định đã chốt

| #   | Quyết định                                                                                 | Lý do                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tách riêng "Nguồn dẫn" (SOURCE) và "Chiến dịch" (`sales.campaign`)**, không hợp nhất     | Đóng D2. `sales.campaign` là đơn vị GỬI (comment sẵn trong schema: "CONSUMES LEADS, DOES NOT PRODUCE THEM"); SOURCE là nơi lead SINH RA. Hai định nghĩa đối lập nhau, không gộp được thành một bảng mà không phá một trong hai                                                                  |
| 2   | Contract đặt tên `campaign-book.ts`, KHÔNG phải `campaign.ts`                              | Xung đột file THẬT giữa hai phiên đang chạy song song: phiên kia đã nhận `campaign.ts` cho contract SOURCE trước. Ghi lại để người sau không đặt trùng tên lần nữa                                                                                                                              |
| 3   | `/start` và `/stop` là **hai đường riêng**, không phải `state` trên `PATCH`                | Chúng đòi `chiến-dịch.bắn` (bắn mail thật), còn sửa tên/chủ chỉ đòi `chiến-dịch.sửa`. Gộp vào một `PATCH` thì phải đọc thân trước khi biết quyền nào đúng — MasController đã phải làm vậy vì một lý do khác (một route phục vụ hai tầm với); ở đây không cần vì vốn đã là hai route             |
| 4   | `start()`/`stop()` **gọi thẳng** `MasService.send()`/`MasService.cancel()`, không viết lại | Toàn bộ suppression, hàng đợi, cầu dao bounce, quy tắc huỷ (A6) đã có. Viết lại là hai nơi cho một luật, và luật thứ hai trôi khỏi luật thứ nhất ngay lần sửa tiếp theo                                                                                                                         |
| 5   | Trạng thái nâng lên `RUNNING` **TRƯỚC** vòng lặp gửi từng đợt                              | Một đợt lỗi giữa chừng (mẫu sai, MAS đang tắt, vượt trần lô) thì chiến dịch vẫn đúng là ĐANG CHẠY với những đợt đã gửi thành công — không phải NHÁP giả vờ trong khi thư đã nằm hàng đợi. Đợt lỗi gửi lại từng cái qua `POST /sales/mail/runs` với `campaignCode`, không gọi lại `/start`       |
| 6   | Tái dùng `chiến-dịch.sửa` cho cả tạo lẫn sửa, không thêm quyền `chiến-dịch.tạo`            | Đúng khuôn `lead.sửa` (dùng chung tạo+sửa ở `LeadController`). Ma trận vai hiện tại: mọi vai có `chiến-dịch.sửa` cũng có `chiến-dịch.bắn` (marketing/giám-đốc/trưởng-phòng), nên `/start`/`/stop` khai thẳng `chiến-dịch.bắn`, không cần cơ chế nâng quyền như `MasController`                  |
| 7   | `campaign.sourceId`/`sourceName` có mặt trong contract NGAY, không đợi lượt sau            | Cột `campaign.source_id` do phiên xây SOURCE thêm cùng lượt (tham chiếu `config_entry.id`). Đưa luôn vào `CampaignCreate`/`Patch`/`Row` — không cần một migration riêng để gắn nhãn "chiến dịch này thuộc nguồn nào" cho báo cáo sau này                                                        |
| 8   | Chuỗi đợt của hồ sơ đọc qua `MailRunRepository.list()`, KHÔNG qua `byId()`                 | `byId()` trả hàng DB TRẦN của `mail_run` (đủ cho `stop()` chỉ cần `.state`/`.id`). Mười một con số của `MailRunRow` (`sent`/`delivered`/`opened`/…) chỉ `list()` mới gộp qua hai lượt đọc `email_delivery`/`mail_event` — vấp lỗi kiểu ở đây trước khi kịp lên `pnpm check`, xem mục "Kiểm tay" |

---

## Đã dựng

```
packages/contracts/src/sales/campaign-book.ts   MỚI — hợp đồng zod
packages/contracts/src/sales/index.ts           + export * from './campaign-book'

apps/api/src/branches/sales/campaign/campaign.schema.ts       CampaignRow → CampaignRowDb (đổi tên,
                                                                tránh trùng với CampaignRow của contract)
apps/api/src/branches/sales/campaign/campaign.mapper.ts       MỚI
apps/api/src/branches/sales/campaign/campaign.repository.ts   MỚI
apps/api/src/branches/sales/campaign/campaign.service.ts      MỚI
apps/api/src/branches/sales/campaign/campaign.controller.ts   MỚI
apps/api/src/branches/sales/campaign/campaign.module.ts       + CampaignController/Service/Repository
```

Không có migration mới — bảng `sales.campaign`/`campaign_member`/`campaign_run`
đã tồn tại (xem `ban-giao-mas-mail.md`), CRUD này chỉ lấp đường HTTP còn thiếu.

### Đường HTTP

| Đường                                 | `@Need`                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `POST /sales/campaigns`               | `chiến-dịch.sửa`                                                 |
| `GET /sales/campaigns`                | `chiến-dịch.xem` · scoped                                        |
| `GET /sales/campaigns/:code`          | `chiến-dịch.xem` · scoped                                        |
| `PATCH /sales/campaigns/:code`        | `chiến-dịch.sửa` · scoped (tên/chủ/nguồn — KHÔNG đổi trạng thái) |
| `POST /sales/campaigns/:code/members` | `chiến-dịch.sửa` · scoped                                        |
| `POST /sales/campaigns/:code/start`   | `chiến-dịch.bắn` · scoped                                        |
| `POST /sales/campaigns/:code/stop`    | `chiến-dịch.bắn` · scoped                                        |

---

## Đã kiểm tay

`pnpm typecheck:api`, `eslint`, `prettier --check` sạch trên mọi file đổi/mới.

Sống trên PGlite cục bộ (không đụng Neon — `.env` không sửa, chỉ override biến
môi trường cho riêng tiến trình `dev:api`, và **không** chạy `worker.ts` nên
không lá thư nào có cơ hội rời máy):

```
POST /sales/campaigns                          → CP-0001, DRAFT
POST /sales/campaigns/CP-0001/members           → add 2 lead, audienceCount=2
PATCH /sales/campaigns/CP-0001                  → đổi tên, giữ audienceCount
POST /sales/campaigns/CP-0001/start             → 1 đợt hẹn giờ +1h → RUNNING,
                                                    mail_run SCHEDULED, queued=2
GET /sales/campaigns/CP-0001                    → hồ sơ có đúng đợt vừa tạo,
                                                    11 con số MailRunRow đầy đủ
GET /sales/mail/runs?campaign=CP-0001           → CÙNG lô hiện ra — xác nhận
                                                    dây nối campaign_run đúng
POST /sales/campaigns/CP-0001/stop              → huỷ đợt chưa gửi, held=2,
                                                    STOPPED
```

Đúng luồng "lên lịch một đợt → thấy trong sổ lô gửi chung → huỷ trước giờ gửi"
— ba câu hỏi ở mục Phạm vi đều có đường thật để trả lời.

---

## Nợ đang có

1. **`data/campaigns.ts` vẫn đọc fixture `Source`** — chưa cắt sang
   `GET /sales/campaigns` thật. Không màn nào ở `apps/web` gọi CRUD này.
2. **Không có "Sổ chiến dịch" trên UI** — `pages/campaigns.tsx` /
   `campaign-detail.tsx` / `campaign-parts.tsx` vẫn đứng trên `Source`/`Wave`
   (mã `SR-`/`SK-`). Mọi nút ghi (Lưu nháp, Bắt đầu chạy, Dừng) vẫn chỉ
   `setState` cục bộ — xem `con-thieu-mas-mail.md` mục C2.
3. **Màn fixture cũ chưa đổi tên "Nguồn dẫn"** — D2 đã CHỐT mô hình, nhưng đổi
   `path`/nhãn trên `routes.tsx` và `app/chrome.tsx` là việc FE riêng, chưa
   làm. Reclaim path `/sales/campaigns` cho Sổ chiến dịch thật là một phần của
   việc đó.
4. **`MasMailDrawer` chưa có bước "Lịch gửi"** — payload `campaignCode`/
   `scheduledAt` đã có ở contract (`MasSendRequest`), nhưng component chưa có
   state/UI để chọn chiến dịch + đặt giờ cho một đợt gửi thêm sau `/start`.
5. **`GET /sales/mail/runs` chưa có màn đọc** (Sổ lô gửi, C1 của
   `con-thieu-mas-mail.md`) — không đổi bởi lượt này, nhưng giờ CÓ dữ liệu
   thật để đọc (đợt của chiến dịch chạy qua đây), nên càng đáng dựng sớm.
6. **`sales.campaign` chưa phải `ObjectKind`** (nợ B4 cũ) — `E1.story()` /
   ContextRail chưa đi ngược được từ lead về chiến dịch đã chạm nó. Cần thêm
   kind `CP` vào `packages/engines/src/types.ts` + ghi dòng gương vào
   `platform.object` mỗi lần tạo chiến dịch. Đi sau việc FE, không chặn nó.
7. **`CampaignPatch.ownerId`/`sourceId` không có cách CLEAR** — trường vắng =
   "không đổi", nên hiện không có API để gỡ chủ/nguồn đã gán về rỗng. Chưa gặp
   nhu cầu thật, ghi lại để không quên nếu có.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
CRUD backend (XONG)
        │
   data/campaign-book.ts (query/mutation thật, khuôn data/mas.ts)
        │
   ┌────┴──────────────────────────────┬──────────────────────────┐
   ▼                                    ▼                          ▼
Sổ chiến dịch thật              Sổ lô gửi (C1)              Bước "Lịch gửi"
(reclaim /sales/campaigns,      GET /sales/mail/runs         trong MasMailDrawer
CampaignForm ghi thật)          + nút huỷ (A6)                (C2)
   └────────────────┬───────────────────┴──────────────────────────┘
                     ▼
      đổi tên màn cũ → "Nguồn dẫn" (copy/path, không qua sketch-first)
                     ▼
          nợ ObjectKind `CP` (B4, tuỳ chọn, không chặn)
```

Ba nhánh FE (Sổ chiến dịch / Sổ lô gửi / bước Lịch gửi) độc lập với nhau, làm
song song được. Mỗi màn mới đi qua `/sketch-first` trước khi chạm file, đúng
luật ở `CLAUDE.md` gốc.
