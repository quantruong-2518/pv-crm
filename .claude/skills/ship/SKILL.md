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

**`apps/api/.env` trỏ vào Neon production.** Ba lệnh dựng lại database từ đầu bị
hook `tools/scripts/guard-db.mjs` chặn và không được đi vòng — nếu một kịch bản
có vẻ cần một trong ba, dừng lại và nói ra. Lệnh migrate thì được phép, nhưng
**đọc file SQL và xác nhận không có `DROP` trước khi chạy**.

## Bước 2 · Chạy migration

```bash
pnpm db:migrate
```

Rồi kiểm bằng mắt: bảng/cột mới có thật, và **bản đang chạy vẫn sống** —
migration cộng thêm mà làm app cũ đỏ nghĩa là nó không phải cộng thêm.

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
