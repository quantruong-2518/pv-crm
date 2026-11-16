# Bàn giao — seed một quý hoạt động lên Neon production

Lập 16/11/2026. Mới là kế hoạch, chưa có dòng code nào.

## Đã chốt với chủ dự án (đừng hỏi lại)

1. **Đích:** Neon production. Xoá toàn bộ dữ liệu nghiệp vụ thật, chỉ giữ tài khoản, vai trò và quyền. Cấu hình cũng giữ lại (xem bước 1).
2. **Người đóng vai:** dùng các tài khoản thật đang có. Vai nào thiếu người để đủ 2 team thì thêm tài khoản demo, email đuôi `.example`.
3. **Thời gian:** từ 01/08/2026 tới ngày chạy seed, theo ngày lịch thật. Tháng 08, 09, 10 trọn tháng và đã chốt KPI. Tháng 11 đang chạy, có họp hôm nay, việc chờ duyệt, kỳ thu trễ.
4. **Quy mô:** dày, khoảng 150 công ty, 800 lead, 250 cơ hội, 80 hợp đồng.
5. **Worker:** seed xong bật lại toàn bộ. Thư thật chỉ đi tới đúng một hộp thư chủ dự án chỉ định, vài lá để trình diễn. Địa chỉ này đặt trong Fly secret, **không ghi vào repo vì repo đang public**. Số liệu thư (gửi, mở, bấm, trả lời, huỷ đăng ký, trả về) thì seed dày trong database.

## Thiết kế

- Bộ seed mới đặt ở `apps/api/src/seed-quarter/`, theo mẫu `seed-kpi/`. Nó chỉ thêm dòng mới và gắn dấu riêng `[DEMO QUÝ]` vào mọi dòng trồng. Mã lấy từ sequence thật. Có bốn chế độ: xem trước, `--apply`, `--report`, `--purge`. Đích không phải PGlite thì bắt `--password=…`.
- Dữ liệu sinh theo hai lớp:
  - 30–40 kịch bản viết tay, có tên. Mỗi kịch bản bảo đảm phủ một trạng thái hoặc một bước chuyển.
  - Lớp số đông do máy sinh với hạt ngẫu nhiên cố định, nên chạy lại ra đúng bộ số cũ.
- Phạm vi phủ lấy từ mọi enum trạng thái trong `packages/contracts`. Mỗi giá trị trạng thái và mỗi bước chuyển hợp lệ phải có ít nhất một dòng.
- `--report` đếm số dòng theo cặp (bảng, trạng thái), tách theo lớp và theo kịch bản. Trạng thái nào đã hứa phủ mà ra 0 dòng thì báo đỏ.
- Mọi dòng thư, chiến dịch, job AI và hàng đợi đều ở trạng thái đã kết thúc. Mọi cảnh báo trước hôm nay được ghi sẵn dấu "đã báo", để khi bật lại worker không bắn dồn.
- Ngày nào có tiền phát sinh thì phải có `fx_rate` của ngày đó (ADR 0149).
- Bảng dẫn xuất gồm `notification`, `audit`, `kpi_month_value`/`kpi_month_basis`, `kpi_counter`, `contract_participant`, `customer_temperature` và bản đồ `pv_change`. Mỗi bảng tính bằng hàm engine/service thật, hoặc để trống và ghi rõ là để trống. Số lưu ở tháng đã chốt phải khớp với số tính lại.
- Mặc định của tôi, chủ dự án chưa hỏi:
  - Có seed sổ chi phí AI và lịch sử trợ lý, nhưng không gọi vendor nào.
  - Họp seed ra không đẩy lên Google Calendar.

## Các bước

0. **Chủ dự án chạy:** tạo branch Neon từ production làm bản lưu. Hạ số máy worker trên Fly về 0.
1. **Code, làm và deploy trước:**
   - Thêm `PV_EMAIL_ALLOW_TO`. Cả `apps/api/src/platform/mail/resend.driver.ts` lẫn `apps/api/src/platform/mail/gmail.driver.ts` đều kiểm danh sách này. Địa chỉ ngoài danh sách thì thư ghi sổ là đã chặn, không gửi. Biến để trống thì chạy như hiện nay.
   - Mở rộng danh sách `KEEP` trong `apps/api/src/reset-data.ts`. Hiện nó xoá cả sơ đồ tổ chức (migration 0140), `ai_route`/`ai_price` (0151, 0153, 0158, 0159, 0161), cấu hình và team KPI, `google_link`, `user_pin`.
2. **Kiểm kê:** một agent `dataflow-tracer` lập bảng màn → cửa API → bảng → trạng thái. Dùng `pnpm ctx` để lọc ra các màn còn đọc fixture, vì seed không hiện ở đó.
3. **Kịch bản:** đọc danh sách người thật trên Neon (chỉ đọc), rồi viết danh sách kịch bản có tên và tham số cho lớp số đông. **Duyệt với chủ dự án trước khi viết code.**
4. **Dựng `seed-quarter/` theo vùng:**
   - phễu: nguồn, chiến dịch, thư;
   - lead, cơ hội, báo giá;
   - hợp đồng, kỳ thu, chấm dứt, hậu mãi;
   - giao tiếp: họp, biên bản;
   - duyệt, tạm hoãn, chuông, audit;
   - KPI và chốt tháng;
   - quản trị.
5. **Chạy thử trên PGlite** cho tới khi `--report` xanh. Chạy `pnpm check`, mở bản build production trong trình duyệt để soát.
6. **Lên production, chủ dự án chạy lệnh xoá:**
   1. `db:reset:data --apply`
   2. `db:seed:quarter --password=… --apply`
   3. `--report`
   4. Đặt secret `PV_EMAIL_ALLOW_TO`.
   5. Bật worker.
   6. Theo dõi 24 giờ: thư đi đâu, chuông có dồn không.

## Bẫy

- `apps/api/.env` trỏ thẳng vào Neon production. Mọi lệnh chạy thử phải truyền `DATABASE_URL=pglite://…` một cách tường minh.
- Hook gác database chặn agent chạy script xoá. Bước 0 và bước 6 do chủ dự án chạy.
- Phiên khác có thể thêm migration hoặc ADR song song. Kiểm lại số thứ tự ngay trước khi viết.

## Trạng thái 16/11 — phiên bị cắt vì hết hạn mức

Worktree `~/workspace/pv-crm-quarter-seed`, nhánh `quarter-seed`. CHƯA commit, chưa review Opus, chưa `pnpm check`.

Đã xong:

- **Thư — chủ dự án đổi ý:** không chặn theo danh sách nữa mà CHUYỂN HƯỚNG. Mọi lá đổi đích về một hộp thư của chủ dự án, người gửi giữ nguyên, trần `PV_EMAIL_REDIRECT_DAILY_CAP` lá/ngày (mặc định 20).
  - Code: `apps/api/src/platform/mail/mail-redirect.ts` (+ test), nối vào `mail.module.ts`, env `PV_EMAIL_REDIRECT_TO`.
  - Typecheck, test mail và eslint đều xanh.
- **Lệnh xoá dữ liệu** (`apps/api/src/reset-data.ts`): danh sách giữ lại thêm org__, kpi_team_, kpi_role_metric, kpi_funnel_target, ai_route, ai_price, google_link, mail_gate. Đã kiểm 219 khoá ngoại: không bảng giữ lại nào trỏ vào bảng bị xoá.
- **`apps/api/src/seed-quarter/story.types.ts`:** hợp đồng Knobs → Story → Beat, để lớp kịch bản và lớp số đông dùng chung một bộ sinh.

Quyết định mới, thay phần thiết kế ở trên:

- **Bỏ chế độ gỡ (`--purge`) và dấu hiển thị.** Production đã xoá sạch, nên dọn lại thì dùng lệnh xoá dữ liệu.
  - Dòng kpi_team* do seed thêm sẽ không bị xoá, vì các bảng này đang trong danh sách giữ lại.
  - Seed từ chối chạy nếu database đã có dữ liệu seed (email hoặc website đuôi `.example`).
- **Chốt tháng 08, 09, 10:** chủ dự án bấm "Chốt tháng" trên app sau khi seed. Cổng chốt không chặn gì (`kpi-close.service.ts`), nên không phải viết bước hoàn tất riêng.
- **Người đóng vai** là 8 tài khoản thật:
  - giám đốc: u-quantb
  - trưởng phòng: u-grace
  - marketing/bd: u-vita, u-vivian
  - marketing/bd/sale: u-test1, u-test2
  - presales/sale/AE: u-nari
  - sale/AE: u-sale1

  Production hiện có 21 lead, 13 cơ hội, 9 hợp đồng thật. Sơ đồ tổ chức chỉ có kỳ 2026-12, chưa có team KPI nào.

Còn lại:

1. **`params.ts` và `scenarios.ts` (việc của Opus, chưa làm).**
   - `params.ts`: mọi tỉ lệ, chốt quanh 150 công ty, 800 lead, 250 cơ hội, 80 hợp đồng.
   - `scenarios.ts`: 30–40 Knobs cố định, mỗi cái ghi rõ cặp (bảng, trạng thái) nó bảo đảm.
2. **Gói lõi (Sonnet).**
   - Lệnh vào `db:seed:quarter`, có các chế độ xem trước, `--apply`, `--report`, `--today`; bắt `--password` khi đích không phải PGlite.
   - Đồng hồ, bộ ngẫu nhiên hạt cố định, plan, world.
   - Ghi theo thứ tự khoá ngoại, chia lô 500 dòng.
   - Bộ chạy thử: chép một PGlite đã migrate, trồng 8 actor vào bản chép, build rồi ghi trong một transaction, rollback, in số dòng theo bảng.
3. **Bộ sinh và emitter (Sonnet, chạy song song).** Bộ sinh biến Knobs thành Story. Các emitter:
   - công ty, liên hệ, đối tác
   - phễu, chiến dịch, thư
   - lead
   - cơ hội, báo giá, duyệt
   - hợp đồng, kỳ thu, chấm dứt, hậu mãi
   - giao tiếp, họp
   - KPI: chỉ tiêu 08–11, ngày vắng, team, bộ giao 2026-12
   - quản trị: chuông, ai_call, trợ lý, fx_rate nhập tay (set_by u-quantb)

   Một emitter xong khi bộ chạy thử chạy sạch, typecheck và eslint đều xanh.

4. **Khoá admission (ADR 0084):** dùng `keysOf` và khoá số điện thoại như `seed.ts`, hoặc chạy backfill admission-keys sau khi seed.

**Mốc chặn worker.** Mọi event_key phải dựng bằng hàm sẵn có của repo, không gõ tay chuỗi.

- email_delivery: không dòng nào ở trạng thái pending. mail_run chỉ ở SENT hoặc CANCELLED, có finished_at. Đợt có cổng phải có released_at.
- Chiến dịch RUNNING phải còn một đợt DRAFT, nếu không sweeper chuyển nó sang DONE và rung chuông.
- Thư gửi qua Gmail trong 30 ngày gần nhất: provider_thread_id để NULL.
- meeting: calendar_dirty_at và google_event_id để NULL, không có dòng meeting_calendar_drop.
- Tạm hoãn đang mở: đặt cả reminded_soon_at lẫn reminded_due_at.
- Kỳ thu quá hạn chưa trả: trồng notification key `contract-installment-overdue/<code>/<no>/<due UTC>` cho owner và collector.
- Hậu mãi: trồng key `customer-recare-due/<ws>/<baseDay>:<cycleDays>:<cycle>` cho mỗi người chăm.
- Debrief chưa đóng: không tạo trong khoảng 24–48 giờ trước lúc bật worker.
- Thông báo đã đọc trước khoảng 18/08 sẽ bị xoá lúc boot, vì hệ thống chỉ giữ 90 ngày.
- Job AI và scan chỉ ở trạng thái đã kết thúc. Attachment phải có owner_code.
- Bản tin trợ lý (08–11 giờ) sẽ gọi AI và gửi thư, thư đi qua cơ chế chuyển hướng.
- Chuông KPI tháng 11 rung một lần lúc bật worker (từ ngày 16 trong tháng). Chấp nhận.
- **Bom hẹn giờ:** từ 21/11, `KpiAssignmentSweeper` tự viết bộ giao 2026-12 kèm chuông nếu chưa có.

## Cập nhật 16/11 chiều — seed đã dựng xong, đang review

Mọi mục "Còn lại" ở trên đã xong.

- `apps/api/src/seed-quarter/` gồm: lõi, bộ sinh (Knobs → Story), 9 emitter (công ty, lead, phễu, cơ hội, hợp đồng, giao tiếp, KPI, quản trị) và bộ chạy thử `harness.ts`.
- Chạy đủ trên PGlite với `--today=2026-11-16`:
  - ghi 58.492 dòng theo plan, cộng các dòng ghi ở `afterWrite` (KPI, chuông, AI, tỷ giá);
  - báo cáo xanh: 138 mục kiểm, gồm cả các mục an toàn phải bằng 0;
  - FK order ok; typecheck và eslint sạch.
- Lệnh chạy thử (đứng ở `apps/api`): `TS_NODE_TRANSPILE_ONLY=true node -r ts-node/register -r tsconfig-paths/register src/seed-quarter/harness.ts --base <pglite đã migrate> --today=YYYY-MM-DD --keep <thư mục trống>`.

Lỗi thật trên production tìm ra khi seed:

- `ContractSign` từ chối mọi lần ký không chia công, vì `creditIssues([])` báo sai tổng.
- Đã sửa một dòng trong `packages/contracts/src/sales/contract.ts`. Nên ship riêng, sớm.

Đã chọn:

- Chốt tháng KPI do chủ dự án bấm trên app.
- Bản tin 08:00 được để chạy.
- Chuông KPI tháng 11 rung một lần.
- Không seed attachment hay scan, vì cần file thật trong bucket.
- `lead_ai_job` chỉ gồm 12 job kết thúc trong 20 giờ gần nhất, vì sweeper xoá job cũ hơn 24 giờ.

Còn mở:

- Kết quả hai review Opus (an toàn worker và thư; khớp với cách các cửa API ghi).
- `pnpm check`, commit.
- Xem trước trên Neon (không `--apply`).
- Chủ dự án chạy bước 0 và bước 6.

## Cập nhật 16/11 tối — code xong, chờ chủ dự án chạy

- Chuyển hướng thư đã đủ: thư đặt lại mật khẩu/thư mời đi thẳng (`MAIL_PORT_DIRECT`); khi bật chuyển hướng, không chỗ nào chặn hay đánh dấu địa chỉ gốc (webhook, Gmail sweeper, gửi thất bại, huỷ nhận); lịch Google `sendUpdates=none`; env sai thì không khởi động, trần rỗng → 20. Dòng khởi động `mail redirect ON · cap N/day` (không in địa chỉ) ở cả API lẫn worker.
- Review Opus xhigh lần hai: ship-safe, với điều kiện deploy + secret và thấy dòng `mail redirect ON` trên Fly TRƯỚC khi reset. Test chặn thất bại đã thử đột biến, thấy đỏ.
- `pnpm check` xanh (trước bốn việc nhỏ cuối; bốn việc đó đã qua typecheck, vitest, eslint, prettier).
- Xem trước trên Neon (chỉ đọc): không cảnh báo mã cấu hình; 58.008 dòng, 3.143 mã.
- Còn để ngỏ (chấp nhận cho demo): đừng trả lời lá chuyển hướng (bị ghi thành khách trả lời); đừng bấm spam (Resend chặn hộp đích); trần đếm theo tiến trình, khởi động lại là được thêm N; bounce Gmail khi chuyển hướng không đổi trạng thái lá; các guard đọc env lúc nhận tín hiệu, tắt chuyển hướng mà không xoá dữ liệu thì tín hiệu muộn vẫn có thể chặn địa chỉ gốc.
