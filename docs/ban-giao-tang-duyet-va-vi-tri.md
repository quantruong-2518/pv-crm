# Bàn giao — mười một lượt của §9: tầng duyệt, cạnh lúc chạy, vị trí pipeline

Mười một lượt trong `tam-nhin-pipeline-toan-he.md` §9 đã chạy hết, 14/09/2026.
**Trạng thái, việc còn lại và tám câu treo ở chính bản đó** (§6 · §8 · §9, đã
cập nhật).

Bản này chỉ giữ ba thứ không nằm ở đâu khác: mở file nào theo việc, ba cái bẫy đã
dính, và cách kiểm mà không chạm production.

| Lượt  | Việc                                                | Commit                |
| ----- | --------------------------------------------------- | --------------------- |
| 0 · 1 | Hai đầu của một lần giao · `FlowVector` nửa trái    | `04ee059`             |
| 2 · 3 | `platform.approval` + Hộp duyệt + nối gate cấu hình | `44566c5`             |
| 4     | E1 ghi cạnh lúc chạy                                | `15a0f18`             |
| 5     | Màn A — thiết lập luồng, mọi ô trống                | `d020bad`             |
| 6     | `pipelinePosition` + hạn chặng hết mang tên Sales   | `2688e49` · `b02c534` |
| 7–10  | Màn cấu hình hết diễn · vị trí thật · vector đủ ba  | lượt này              |

---

## §1 · Mở file nào theo việc

| Cần gì                                | Mở ở đâu                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Luật duyệt, thuần, hai đầu dùng chung | `packages/engines/src/e3-approvals.ts`                                      |
| Chỗ cất yêu cầu duyệt                 | `apps/api/src/platform/approval/`                                           |
| Nhánh cắm vào E3                      | `branches/sales/config/config.approval.ts`                                  |
| Hộp duyệt trên màn                    | `apps/web/src/pages/approvals.tsx` · route `/duyet`                         |
| Cạnh đồ thị lúc chạy                  | `platform/graph/object-mirror.ts` — `link` · `linkMany`                     |
| Chuỗi người giữ một object            | `packages/ui/src/patterns/flow-vector.tsx` · `data/touches.ts#stepsOf`      |
| Chuỗi OBJECT của một bản ghi          | `platform/graph/graph.service.ts#storyFor` → `chain` trên hai cửa hồ sơ     |
| Rail vẽ chuỗi ấy                      | `data/opportunities.ts#railOf` · hồ sơ lead và hồ sơ đơn                    |
| Sáu luồng lead khai gì                | `branches/sales/config/motion.schema.ts` · màn: mục **5.9** `/sales/config` |
| Object đang ở đâu, chờ ai             | `packages/engines/src/pipeline-position.ts`                                 |
| Dòng cấu hình ↔ khoá của thang        | `branches/sales/ladder.ts` — một rào cho cả `STAGE` lẫn `TIER`              |
| Màn cấu hình gửi đề nghị thật         | `data/sales-config.ts#useProposeConfigEdits` · `pages/sales-config.tsx`     |
| Hạn cột mà màn lead đang xử           | `data/sales-config.ts#useStageLimits` — KHÔNG phải `PIPELINE_STAGES`        |

Migration thêm trong đợt này: `0033` · `0035` · `0036` · `0037` · `0038` · `0039`
(`0034` của phiên khác).

**Lượt 7–10 đổi bốn thứ đáng nhớ khi đọc code:** dòng sổ cơ hội chở `position`
(hai lượt đọc cho CẢ TRANG, không phải mỗi dòng một câu) · `isRottingOp` thôi tra
hằng số fixture · hồ sơ lead có vị trí trên thang `TIER` với đồng hồ `null` ·
`sales.touch.to_role` chụp vai lúc ghi. Lý do từng cái nằm tại chỗ.

**Quyết định không được lật thì đọc tại chỗ**, không chép lại ở đây: vì sao một
lần giao là MỘT dòng (`touch.schema.ts`) · vì sao bảng duyệt ở `platform` và
`payload` là hộp đen (`approval.schema.ts`) · vì sao gật và áp dụng nằm chung một
transaction (`approval.service.ts`) · vì sao mọi ô luồng để `NULL`
(`motion.schema.ts`) · vì sao `phase` mang khoá pipeline (`pipeline-position.ts`).

---

## §2 · Ba cái bẫy đã dính — đừng dính lại

**1 · Doc tầm nhìn có thể mô tả code cũ.** Bản viết 14/09 nói lượt 0 chưa làm,
trong khi `setOwner` đã ghi `giao` từ 29/08 (`cf97f78`) — doc tin vào ghi chú
`"No door writes this yet"` còn sót trong `TouchKind`. Trước khi làm theo một
lượt, grep code xác minh tiền đề của nó, và dọn ghi chú cũ luôn khi thấy.

**2 · `ADD CONSTRAINT ... CHECK` kiểm cả dòng ĐÃ CÓ.** Một mệnh đề trong `0033`
sẽ giết migration trên mọi database từng bấm "Giao"; bài thử trên database
dựng-từ-số-không không bắt được. Nay mệnh đề đó là ràng buộc riêng khai
`NOT VALID`. Thêm CHECK vào bảng đang có dữ liệu thì phải thử đúng kịch bản: chạy
tới migration trước, cắm một dòng kiểu cũ, rồi mới chạy cái mới.

**3 · Một chữ tiếng Việt trong comment mới làm đỏ cả file.**
`eslint-suppressions.json` khoá số vi phạm theo file, nên thêm một khối comment
tiếng Việt vào file đã có nợ là vượt số và eslint báo đỏ **cả những khối cũ**.
Dính sáu lần trong một phiên, kể cả khi chỉ trích một cái tên (`"Hộp duyệt"`,
`"HĐ → SO"`) bên trong comment tiếng Anh. Chuỗi hiển thị thì vẫn tiếng Việt.

Lượt 7–10 dính lại đúng thế: 12 khối mới làm 127 lỗi trên 8 file, và một chữ như
`lượt` hay `luật biên giới package` nằm giữa một comment tiếng Anh cũng đủ. Kèm
hai biến thể mới:

- **Đổi tên file là mất suppression.** Khoá của `eslint-suppressions.json` là
  ĐƯỜNG DẪN, nên `git mv` một file có nợ làm mọi vi phạm cũ của nó hiện ra dưới
  tên mới. Dọn comment của file đó trước khi chuyển, hoặc chuyển xong thì dọn.
- **Ít vi phạm hơn số đã khoá cũng đỏ.** Dịch một khối cũ sang tiếng Anh làm số
  thật tụt xuống dưới `count`, và eslint thoát mã 2 với _"suppressions left that
  do not occur anymore"_. `pnpm lint:prune` là đường đúng — xem diff trước khi
  commit, nó chỉ được chạm file mình vừa sửa.

Kèm một chuyện không phải bẫy: **cây làm việc có thể đang bị phiên khác sửa song
song** — phiên này gặp hơn 20 file lạ giữa chừng, và `_journal.json` là file dùng
chung. `git status` trước khi commit, stage theo đường dẫn.

---

## §3 · Kiểm mà không chạm production

`apps/api/.env` trỏ Neon thật và `guard-db.mjs` chặn `db:push`/`db:seed`. Ba cách
đã dùng, không cách nào chạm database thật:

1. **Migration** — dựng PGlite trong thư mục tạm, chạy hết `_journal.json` theo
   thứ tự, rồi bắn những câu INSERT/UPDATE cố tình sai để xem CHECK có bắt không.
2. **Khởi động thật** — `DATABASE_URL=pglite://<tạm> node -r ts-node/register
src/main.ts`. `RouteAudit` in "N đường dữ liệu, đều đã khai quyền": cách nhanh
   nhất biết cửa mới khai `@Need` đúng chưa.
3. **Trọn vòng nghiệp vụ** — `NestFactory.createApplicationContext(AppModule)`
   rồi gọi thẳng service. Cách duy nhất kiểm được "đề nghị → chưa ghi gì → người
   không đến lượt bị chặn → gật → ghi → từ chối thì không ghi" mà không cần phiên
   đăng nhập. Script để ngoài repo, chạy xong xoá.

Không cái nào là test tự sinh — luật repo vẫn nguyên.
