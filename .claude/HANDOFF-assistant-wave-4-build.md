# Bàn giao · Trợ lý CRM đợt 4 (làm hộ) — đã dựng, chưa ship

Viết 16/11/2026. Worktree `~/workspace/pv-crm-wave4`, nhánh `assistant-wave-4` (nền origin/master 0a00ed6f).

## Đã chốt

- Chủ dự án 16/11: chỉ bước tiếp (đặt, dời hạn, xong + đặt bước sau) trên lead và cơ hội; mọi vai theo quyền sửa; không hoàn tác; ghi dấu ở lịch sử bản ghi + sổ trợ lý. Tôi tự quyết: đề xuất sống 30 phút, giữ theo phiên; "Báo sai" áp cho đề xuất.
- Đặc tả: `docs/decisions/0162-the-assistant-proposes-next-steps-on-a-card-the-asker-presses.md`; câu hỏi mở 201–202; nợ ghi ở `docs/status.md`.

## Đã dựng

- Contract `packages/contracts/src/assistant-proposal.ts`; migration `apps/api/drizzle/0174_assistant_proposal.sql` (bảng `platform.assistant_proposal`, nới CHECK touch cho `assistant-applied`).
- Tool `propose_next_step` (`apps/api/src/branches/sales/assistant/propose-next-step.ts`); bấm qua `apps/api/src/platform/assistant/assistant-proposals.service.ts` → hook `apps/api/src/branches/sales/next-step/next-step-proposal.ts`, một transaction: giành đề xuất, khoá bản ghi, so bước đứng (`StepMoved` = cũ), ghi, ghi touch. Prompt v17.
- Web: `apps/web/src/components/assistant-proposal-card.tsx` trên `AiAction` (thêm Bỏ / pending / doneTone, nút 48px tablet), mẫu ở kit M-09.
- Kiểm: `pnpm check` xanh; eval scripted nhóm proposals 23/23, scope-matrix 184/184; reviewer luật + Aurora đã chạy, lỗi nên-sửa đã sửa.

## Chưa làm

- Chưa ai mở màn có đề xuất trên trình duyệt; chưa gọi HTTP thật tới `/assistant/proposals/:id/apply|dismiss` (chỉ thử qua service).
- Ship: migration 0174 lên Neon trước, rồi deploy API (`/ship`), web qua Vercel khi merge master. Kiểm `when` của 0174 vẫn cao nhất so với master lúc merge.
- Gate 0 OPEN; v15–v17 chưa chạy live. Thêm câu live cho propose (không nói "đã làm", không chép link vào bước).
- Danh sách đuôi tên miền trong bộ lọc link (agent tự thêm `cc gg uk us jp kr cn de fr ru tk edu gov`) chờ người xem.
