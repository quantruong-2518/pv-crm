# Bàn giao · Trợ lý CRM — đợt 2 (bản tin sáng) đã dựng, chưa ship

Viết 15/11/2026 tối. Nhánh `assistant-wave-2` ở worktree `/home/quantruong/workspace/pv-crm-brief`
(đi từ `origin/master` 9418ddfe). Chưa push, chưa merge, chưa ship.

## 0 · Trạng thái

- Đợt 2 dựng xong theo ADR 0154
  (`docs/decisions/0154-the-assistant-sends-a-morning-brief-of-a-persons-own-work-by-bell-email-and-a-live-card.md`),
  `pnpm check` xanh trên nhánh. Migration 0169: CHECK loại thông báo + bật tuyến `assistant-brief`, trần 1.
- Gate 0 của đợt 1b (eval live ở v14) chưa chạy: phiên này không chạy, chủ dự án cũng chưa chạy.
  Cách chạy: bàn giao cũ trong `git show 9418ddfe:.claude/HANDOFF-assistant-wave-2.md` §1.
- Chưa ai nhìn trên trình duyệt: thẻ "Việc hôm nay", dòng chuông, mail (`pnpm mail:preview`).
  WSL này thiếu `libnspr4` nên không chạy headless được.

## 1 · Đã dựng gì

- `list_my_work` thêm `stale-deal`, `late-debrief`, `overdue-contract`, trả `workItems` / `workCut`
  (không tới model). Sổ hợp đồng thêm bộ lọc `collector` (người phụ trách thanh toán).
- `MyWorkService` — một bộ chọn cho chat, thẻ và bản tin, đi qua cổng tool — và `GET /assistant/my-work`.
- `AssistantBriefSweeper`: 08:00–11:00 giờ VN thứ Hai–Sáu, tuần tự từng người giữ `assistant.use`,
  tối đa một bản tin/người/ngày (event key `assistant-brief/<người>/<ngày>`), không việc thì không
  gửi, AI lỗi vẫn gửi số, người lỗi được thử lại mỗi 5 phút trong cửa sổ.
- Mail chỉ có số theo mục + nút mở CRM. Nhãn mục một sổ: `MY_WORK_SECTION_LABEL` (contracts).
  Chuông tên "Việc hôm nay", trùng tên thẻ.
- Web: thẻ "Việc hôm nay" đầu khung Trợ lý, đọc lại mỗi lần mở; chuông, trang thông báo và toast
  đều mở khung Trợ lý.
- Review: Opus xhigh (đọc theo quyền), rules, aurora, Opus re-review. Không có lỗ quyền; mọi lỗi
  tìm được đã sửa, phần còn lại nằm ở §3.

## 2 · Trước khi ship — hỏi chủ dự án

1. **Nhìn màn và mail trước:** luật 13 ở khung 320px, chip tablet 48px, mail preview.
2. **Thứ tự migration với nhánh `kpi-finish`:** nhánh đó giữ migration 0167–0168 (chưa commit lúc
   viết). 0169 đặt `when` = 1795860220000, cao hơn 0168, để drizzle không bỏ qua. Ship nhánh nào
   trước cũng phải merge `_journal.json` đủ cả ba; nếu 0167/0168 viết lại CHECK loại thông báo
   thì danh sách phải giữ `assistant-brief`.
3. Ship xong vào ngày thường trước 11:00 thì bản tin gửi ngay trong cửa sổ đó — báo chủ dự án trước.
4. `/ship`: migrate trước, deploy sau, từ worktree tách rời.
5. Worker chưa từng khởi động với module mới (`AssistantModule` nay nạp mail, thông báo, vai, phiên;
   scripted eval có dựng Nest nhưng không dựng `WorkerModule`). Sau deploy đọc log worker trên Fly
   ở tick đầu: không lỗi resolve của Nest, và có lượt quét bản tin trong 08:00–11:00. `/healthz`
   không bắt được worker chết.

## 3 · Giới hạn đã biết (ghi trong ADR 0154)

- Người tắt chuông `assistant-brief` vẫn tốn một lần đọc + một lượt AI mỗi lần worker khởi động
  trong cửa sổ: hub không có hàm đọc công khai "loại này có kêu cho người này không". Ghi chuông
  lỗi trông như tắt chuông nên không thử lại.
- Bước tiếp theo chỉ đọc trong ngân sách bước của tool; vượt thì số là "ít nhất".
- Câu AI chỉ hiện ở tiếng Việt. Trần `daily_calls_per_user = 1` bị sweeper bỏ qua có chủ đích
  (trần đếm 24 giờ trượt sẽ chặn cách ngày); dòng chuông giữ một lần/ngày.
- Đồng hồ giờ VN đã gom cho hai sweeper; còn bản sao ở fx, kpi, meeting.

## 4 · Bẫy

- `vitest` chạy từ gốc repo với `--reporter=dot` (không có `-q`). `tsc -p apps/api/tsconfig.json`
  không gồm file test.
- Worktree có `apps/api/.env` rỗng và `.pglite` rỗng chỉ để `ctx` qua; mọi lệnh db truyền
  `DATABASE_URL=pglite://…` tường minh.
- `pkill -f "<lệnh>"` tự giết shell đang chạy nó — giết theo PID.
