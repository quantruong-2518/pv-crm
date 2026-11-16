# Bàn giao · Trợ lý CRM đợt 4 (làm hộ) — đã lên production

Viết 16/11/2026. Worktree `~/workspace/pv-crm-wave4`, nhánh `assistant-wave-4` (nền origin/master 0a00ed6f).

## Đã chốt

- Chủ dự án 16/11: chỉ bước tiếp (đặt, dời hạn, xong + đặt bước sau) trên lead và cơ hội; mọi vai theo quyền sửa; không hoàn tác; ghi dấu ở lịch sử bản ghi + sổ trợ lý. Tôi tự quyết: đề xuất sống 30 phút, giữ theo phiên; "Báo sai" áp cho đề xuất.
- Đặc tả: `docs/decisions/0162-the-assistant-proposes-next-steps-on-a-card-the-asker-presses.md`; câu hỏi mở 201–202; nợ ghi ở `docs/status.md`.

## Đã dựng

- Contract `packages/contracts/src/assistant-proposal.ts`; migration `apps/api/drizzle/0174_assistant_proposal.sql` (bảng `platform.assistant_proposal`, nới CHECK touch cho `assistant-applied`).
- Tool `propose_next_step` (`apps/api/src/branches/sales/assistant/propose-next-step.ts`); bấm qua `apps/api/src/platform/assistant/assistant-proposals.service.ts` → hook `apps/api/src/branches/sales/next-step/next-step-proposal.ts`, một transaction: giành đề xuất, khoá bản ghi, so bước đứng (`StepMoved` = cũ), ghi, ghi touch. Prompt v17.
- Web: `apps/web/src/components/assistant-proposal-card.tsx` trên `AiAction` (thêm Bỏ / pending / doneTone, nút 48px tablet), mẫu ở kit M-09.
- Kiểm: `pnpm check` xanh; eval scripted nhóm proposals 23/23, scope-matrix 184/184; reviewer luật + Aurora đã chạy, lỗi nên-sửa đã sửa.

## Tôi tự quyết

- Bộ lọc link: chặn `http(s)://`, `www.` và mọi tên miền có đuôi trong danh sách cố định ở `propose-next-step.ts` (gồm cả `cc gg uk us jp kr cn de fr ru tk edu gov`); giữ như vậy, `TP.HCM` hay `BaoGia.pdf` vẫn qua.

## Chưa làm

- Bản build production đã mở headless 16/11: `/`, `/assistant` (phiên giả), `/kit` không pageerror; mẫu M-09 trong kit đạt tương phản ≥ 6,39:1 và nút 48px trên tablet ở cả ba theme. Chưa ai thấy một đề xuất thật trong cuộc trò chuyện; chưa gọi HTTP thật tới `/assistant/proposals/:id/apply|dismiss` (chỉ thử qua service).
- Đã ship 16/11: master 3e709c80, Neon 0174 (ledger id 172), Fly v227, /healthz ok, api + worker started. Chưa ai bấm một đề xuất trên production.
- Gate 0 OPEN; v15–v17 chưa chạy live.
- 16/11 thêm nhóm live `propose` 7 câu (`eac1fd6a` trên origin/master, chỉ eval + docs, không cần deploy): ghế `cases-propose`, chuỗi `cases-propose` có lệnh cài trong `pain`; kiểm cố định ở `apps/api/src/scripts/ai-eval/cases-propose.ts`. Scripted 7/7. Nhóm được báo, không vào công thức gate. Chưa chạy live. Giới hạn: mỗi câu chạy 1 lần; không có câu "xong" khi đã có bước hay dời hạn (chưa seed `next_step`); propose-03 trượt nếu model thử link một lần rồi tự sửa.
- Chạy live phải từ worktree này (cây chính đang ở prompt v14), chủ dự án chạy bằng `!` vì phiên không đọc được khoá Fly.
