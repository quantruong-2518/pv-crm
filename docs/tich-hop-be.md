# Tích hợp API — v1 · module Lead

Lát cắt **27/08/2026**, nhánh `develop`. Đi kèm
[`pv-one.postman_collection.json`](./pv-one.postman_collection.json) — nhập vào
Postman là gọi được ngay, không phải gõ lại gì.

|               |                                                                  |
| ------------- | ---------------------------------------------------------------- |
| Tại máy       | `http://127.0.0.1:4123` (xem "Chạy tại máy" cuối file)           |
| Production    | `https://pvone-crm-api.fly.dev` · Fly.io + Neon (ap-southeast-1) |
| Kiểu nội dung | `application/json` · lỗi là `application/problem+json`           |

---

## Xác thực — hôm nay là CỬA SAU, phải biết trước khi dựng

Chưa có auth thật. Máy chủ tin header:

```
X-PV-Actor-Id: u-ha
```

và chỉ tin khi `PV_TRUST_ACTOR_HEADER=true`; `env.ts` **từ chối khởi động** với
cờ này ở production. Auth thật (cookie + bảng `platform.session`) chưa dựng —
đừng xây tầng gọi API bám vào header này như một thứ vĩnh viễn. Chỗ nó sẽ biến
mất là interceptor `stampSession` bên `apps/web/src/app/api/client.ts`, đúng một
chỗ.

Bảy actor có sẵn để thử:

| id                            | Tên           | Vai          | Phạm vi                                   |
| ----------------------------- | ------------- | ------------ | ----------------------------------------- |
| `u-ha`                        | Trần Thu Hà   | trưởng-phòng | cả sổ · mọi quyền Sales                   |
| `u-nam`                       | Lê Hoàng Nam  | bd           | cả sổ                                     |
| `u-chau`                      | Vũ Minh Châu  | marketing    | cả sổ · không `lead.giao/chuyển-đổi/loại` |
| `u-anh`                       | Phạm Diệu Anh | presales     | cả sổ · chỉ đọc lead                      |
| `u-huy` · `u-binh` · `u-linh` | ba Sale       | sale         | **chỉ lead của mình**                     |

---

## Hình của lỗi — RFC 9457, một hình cho mọi lỗi

```jsonc
{
  "type": "invalid", // unauthenticated · forbidden · not-found · conflict · invalid · server
  "title": "Dữ liệu gửi lên không hợp lệ.", // câu NÓI ĐƯỢC với người dùng, tiếng Việt
  "status": 400,
  "instance": "/sales/leads?sort=xyz",
  "reason": "permission-denied", // chỉ khi forbidden/unauthenticated
  "errors": { "sort": ["…"] }, // lỗi theo TỪNG Ô — màn tô đỏ đúng chỗ
  "traceId": "…", // chính X-PV-Request-Id bạn gửi lên
}
```

**Bốn lý do từ chối không rút gọn được về hai mã HTTP**, nên `reason` chở phần
chênh. Đừng gộp: trộn `unauthenticated` với `permission-denied` là đá một người
**đã** đăng nhập về màn đăng nhập, và họ sẽ đăng nhập vòng vo mà không bao giờ
vào được.

| `reason`                    | Nghĩa                                       | Màn phải làm gì                                    |
| --------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `unauthenticated` (401)     | Chưa đăng nhập                              | Về màn đăng nhập                                   |
| `branch-not-licensed` (403) | Công ty **chưa mua nhánh**                  | "Không có nhánh Sales" — không phải lỗi người dùng |
| `permission-denied` (403)   | Vai không có quyền                          | Ẩn/mờ nút, đừng đá đi đâu                          |
| `out-of-scope` (403)        | Có quyền, nhưng không phải dữ liệu của mình | Như trên                                           |

Lỗi tầng bảng đã được dịch sẵn, **không trả 500 nữa**:

| Tình huống                         | Mã      | Câu người dùng thấy                                                          |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Email đã có một lead đang sống     | **409** | "Email này đã có trong sổ lead — một email không mở được hai lead cùng lúc." |
| `budget` không kèm `currency`      | **400** | lỗi gắn vào **cả hai** ô                                                     |
| Ô bắt buộc rỗng lọt xuống bảng     | **400** | gắn tên ô                                                                    |
| `owner_id` trỏ người không có thật | **400** | "Người phụ trách không có trong sổ nhân sự."                                 |
| Mất kết nối, lược đồ sai…          | **500** | "Máy chủ gặp sự cố." — nguyên nhân thật chỉ vào log                          |

---

## Endpoint đang chạy

| Đường                              | Quyền                        | Ghi chú                                        |
| ---------------------------------- | ---------------------------- | ---------------------------------------------- |
| `GET /healthz`                     | công khai                    | `{ status, db }`                               |
| `GET /sales/leads`                 | `lead.xem` · **cắt phạm vi** | sổ, lọc + phân trang **ở server**              |
| `POST /sales/leads`                | `lead.sửa`                   | nhập tay → `intake_channel = MANUAL`           |
| `POST /sales/leads/import/preview` | `lead.sửa`                   | chạy khô, **không ghi gì**                     |
| `POST /sales/leads/import`         | `lead.sửa`                   | chốt lô → `intake_channel = IMPORT`            |
| `GET /sales/config`                | `cấu-hình.xem`               | 6 danh mục, gọi **một lần** rồi cache          |
| `GET /sales/config/:list`          | `cấu-hình.xem`               |                                                |
| `POST · PATCH /sales/config/…`     | `cấu-hình.đề-nghị`           | **→ E3 duyệt · hôm nay trả 500, cửa chưa nối** |

### `GET /sales/leads`

Trả `{ rows, total, hidden }`.

`hidden` là **số dòng khớp bộ lọc nhưng bị phạm vi cắt đi** — con số màn phải
hiện thành "Bị ẩn theo quyền của bạn" (luật 7). Máy chủ đếm, vì màn không đếm
được thứ nó không nhận.

Ô lọc trên URL: `status` · `page` · `size` (≤200) · `sort` · `dir` · `q` ·
`stage` · `tier` · `category` · `source` · `owner` · `account`.

- **`status` có BỐN nhánh**: `running` (mặc định) · `signed` · `exited` · `all`.
  Không phải cờ boolean — "đã ký" không phải phủ định của "đang chạy".
- `owner=chua-ai-nhan` = lead còn ở kho chung, chưa ai nhận.
- `sort` ∈ `company · createdAt · daysHere`. Mọi thứ tự đều nối thêm `code` làm
  khoá phá hoà — không có nó thì một dòng xuất hiện ở cả trang 1 lẫn trang 2.

Một dòng chở đúng thứ bảng sổ cần. **20 trường hồ sơ cố tình vắng** — chúng
thuộc `GET /sales/leads/:code`, chưa dựng.

### Nạp tệp — hai bước, cùng một thân

`preview` **không ghi một byte nào**, kể cả một số của sequence sinh mã. Hai bước
dùng **chung một hàm kiểm**; hai bản kiểm là chuyện "xem trước bảo sạch, chốt
lại báo lỗi".

`import` là **một transaction**: cả lô vào hết hoặc không dòng nào vào.

Khử trùng theo `lower(email)` — trong chính lô, và với sổ (chỉ dòng chưa rơi).

---

## Từ vựng — thứ nào là mã cứng, thứ nào là dữ liệu

**Đây là chỗ dễ sai nhất khi ghép FE.**

| Nhóm                         | Ví dụ                                                                                                      | Ở đâu                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Enum trong code**          | `status` · `sort` · `dir` · `motion` (`INBOUND`…) · `intakeChannel` (`MANUAL·IMPORT·LANDING`) · `currency` | `@pv/contracts` — mỗi giá trị có một đường code phía sau |
| **ID của danh mục cấu hình** | `SR-09` · `ST-02` · `TR-01`                                                                                | `GET /sales/config` — người dùng tự nhập, tự đổi thứ tự  |

Danh mục cấu hình: **ID định danh · tên hiển thị · `ord` là thứ tự nhập.** Đổi
tên không đụng một dòng dữ liệu nào; đổi thứ tự không đụng ID. Đừng bao giờ so
sánh với ID cụ thể trong code (`if (stage.id === 'ST-05')`) — ngữ nghĩa nằm ở
**thuộc tính** (`limitDays`, `ownerId`) và ở **thứ tự** (`ord`).

⚠️ **Nợ đã biết**: `stage` · `tier` · `category` · `exitReason` · `contactChannel`
trên `LeadRow` hiện vẫn là **khoá chữ thường cũ** (`moi`, `dau-moi`, `chip`),
chưa phải ID của `config_entry`. Chúng sẽ đổi sang ID trong một đợt riêng. `source`
thì đã là mã (`SR-09`). Đừng hàn cứng bảng nhãn cho năm cái kia — chúng sắp đổi.

---

## Chưa có — đừng chờ

`GET /sales/leads/:code` (hồ sơ) · `PATCH` · promote · exit · assign · touch ·
`GET /sales/leads/export` · landing page công khai · auth thật · E3 duyệt ·
bảng `touch` (nên `score` và `lastTouchAt` còn `0`/`NULL`) · bảng `suppression`.

---

## Chạy tại máy

```bash
pnpm install
cd apps/api && PORT=4123 pnpm dev            # .env đang trỏ thẳng Neon
curl -H 'X-PV-Actor-Id: u-ha' 'http://127.0.0.1:4123/sales/leads?status=all&size=3'
```

Muốn chạy offline: bỏ dấu `#` ở dòng `pglite://` trong `apps/api/.env`, rồi
`pnpm db:migrate && pnpm db:seed`. **Cảnh báo:** với `.env` đang trỏ Neon thì
`pnpm db:seed` **xoá sạch Neon rồi nạp lại**.
