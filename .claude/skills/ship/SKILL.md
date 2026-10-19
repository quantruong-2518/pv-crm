---
name: ship
description: Đẩy apps/api lên Fly.io + Neon ở pv-crm — chốt thứ tự migration so với deploy trước, rồi giao phần bấm nút cho agent deploy-guardian và xác nhận healthz thật. Dùng khi được bảo "deploy BE", "đẩy lên production", "ship đi", hoặc sau khi đổi thứ gì trong apps/api cần lên Fly.
---

# Đưa một thay đổi lên production

Hai máy chạy chung một image (`api` và `worker`, đổi `CMD` chứ không đổi image).
`fly.toml` **không có** `release_command` và image **không chạy migration lúc
boot** — nghĩa là schema không tự đi theo code. Thứ tự là việc của người bấm, và
đó chính là chỗ hỏng lặng lẽ.

## Bước 1 · Lượt này có đụng schema không

Không đụng → nhảy thẳng bước 3.

Có đụng → phân loại migration, chỉ có hai loại:

**Cộng thêm** (thêm cột nullable, thêm bảng, thêm index, nới một `CHECK`) — code
cũ vẫn chạy được trên schema mới. **Migrate TRƯỚC, deploy SAU.**

**Phá đi** (xoá cột, đổi tên, siết `CHECK`, thêm `NOT NULL` không default) — code
cũ **không** chạy được trên schema mới, nên không có thứ tự nào an toàn trong một
lượt. Tách thành **hai lần ship**: lần một cộng thêm phần mới và deploy code đọc
được cả hai dạng; lần hai, sau khi bản cũ hết chạy, mới phá phần cũ.

> Quy ước này mới chốt 15/09 và chưa từng ghi ở đâu trước đó — trước đây thứ tự
> tuỳ tay người bấm. Chủ dự án muốn quy ước khác thì đây là chỗ sửa.

**`apps/api/.env` là file riêng từng máy (gitignore) — đừng đoán nó trỏ đi đâu.**
Trên máy WSL nó là `pglite://`, còn URL Neon production nằm ở `.env` gốc repo; máy
khác có thể ngược lại. `drizzle.config.ts` đọc `DATABASE_URL` của `apps/api`, nên
xem dòng đó trước khi chạy bất cứ lệnh `db:*` nào. Các lệnh dựng lại database từ
đầu bị hook `tools/scripts/guard-db.mjs` chặn và không được đi vòng — nếu một kịch
bản có vẻ cần một trong số đó, dừng lại và nói ra. Lệnh migrate thì được phép,
nhưng **đọc file SQL trước khi chạy**: `DROP` duy nhất chấp nhận được là
`DROP CONSTRAINT` đi liền với `ADD` lại bản rộng hơn.

## Bước 2 · Chạy migration

```bash
pnpm db:migrate
```

**Lệnh này xanh không chứng minh production đã có migration.** Hai lý do, cả hai
đã gặp thật (09/10, migration 0092):

- `DATABASE_URL` đang là PGlite thì nó chỉ migrate database trên máy.
- Drizzle không so hash. Nó chỉ chạy những mục trong `drizzle/meta/_journal.json`
  có `when` **lớn hơn** `created_at` mới nhất của `drizzle.__drizzle_migrations`.
  Một migration có `when` thấp hơn mốc đó bị bỏ qua vĩnh viễn mà không báo gì.

Nên kiểm **trên chính Neon**, không kiểm bằng mã thoát: đọc `pg_constraint` /
`information_schema` xem bảng, cột, `CHECK` mới có thật chưa. Migration bị bỏ qua
thì **dừng và hỏi chủ dự án** trước khi chạy tay SQL vào production — chạy tay thì
gói trong một transaction và ghi thêm một dòng vào sổ migration.

Cuối cùng xác nhận **bản đang chạy vẫn sống** — migration cộng thêm mà làm app cũ
đỏ nghĩa là nó không phải cộng thêm.

## Bước 3 · Giao cho deploy-guardian

Gọi agent `deploy-guardian`. Brief phải nói rõ: lượt này **đã migrate hay chưa**,
và nếu có thì loại nào. Agent đó giữ chuỗi build → deploy → xác nhận, ba lỗi thật
đã gặp, và danh sách việc phải hỏi trước khi làm.

**Không tự gõ `fly deploy`.** Có script riêng vì build context phải nhìn thấy
`packages/engines` và `packages/contracts`.

## Bước 4 · Xong nghĩa là gì

Chưa có `{"status":"ok","db":true}` thật từ `/healthz` thì **chưa xong**. Dòng
"Visit your newly deployed app" là DNS tự khen nó, không phải bằng chứng app
sống. Cả hai process `api` và `worker` phải `STATE=started`.

Deploy hỏng: đọc **cả** log build, không chỉ dòng cuối — lý do thật luôn nằm vài
dòng phía trên. `pnpm fly:logs` cho lỗi lúc chạy (build xanh, chết lúc boot).
