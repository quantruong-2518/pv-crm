# Bàn giao · Trợ lý CRM — đóng đợt 1b, chuẩn bị đợt 2 (bản tin sáng)

Viết 15/11/2026. Phiên sau dùng để **làm đợt 2 thật kỹ**: chốt quyết định với chủ dự án
trước, rồi mới dựng.

## 1 · Đợt 1b — trạng thái

- Commit `d330c6d2` trên nhánh `assistant-wave-1b` (worktree chính). **Chưa push, chưa merge,
  chưa ship.** Không có migration. `pnpm check` xanh (871 test), eval kịch bản 0 lỗi.
- Quyết định + giới hạn đã biết: `docs/decisions/0152-*.md`. Nợ: `docs/status.md`, mục
  "CRM assistant wave 1b (ADR 0152), debt".
- **Gate 0 đang chạy dở lúc bàn giao** (Gemini đã qua smoke). Log ở scratchpad phiên cũ,
  có thể mất — chạy lại nếu không thấy kết quả:
  ```bash
  GK=$(fly ssh console -a pvone-crm-api -q -C 'printenv GEMINI_API_KEY' 2>/dev/null | tail -1 | tr -d '\r\n')
  AK=$(fly ssh console -a pvone-crm-api -q -C 'printenv ANTHROPIC_API_KEY' 2>/dev/null | tail -1 | tr -d '\r\n')
  GEMINI_API_KEY="$GK" ANTHROPIC_API_KEY="$AK" pnpm --filter @pv/api ai:eval --suite assistant --live --yes \
    --model gemini-3.8-flash --model claude-sonnet-5-5
  ```
  `tail -1` là bắt buộc: dòng đầu của `fly ssh` là "No machine…", dính vào khoá thì vendor trả 401.
  Live cần **cả hai** khoá trong một lần chạy. Eval tự ép PGlite trong bộ nhớ, không chạm Neon.
- Qua gate 0 → merge vào master → `/ship` (deploy từ worktree tách rời, memory
  `parallel-sessions-share-one-worktree`). Tuyến `assistant-deep` để **tắt** (Opus, đắt) tới khi
  chủ dự án quyết.
- Chưa ai mở màn: nút "Phân tích kỹ" ở panel hẹp 320px, tương phản ba theme (luật 13).

Kế hoạch tổng + ma trận 16 vùng: doc https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR, mục
"Kế hoạch phủ đủ sản phẩm". Câu 183–185 ở đó **chưa** chép vào `open-questions.md`.

## 2 · Đợt 2 — bản tin sáng: đã chốt gì, còn hở gì

**Đã chốt (đừng hỏi lại):** ADR 0133 §2 — 08:00 thứ Hai–Sáu giờ VN, chuông + email; email chỉ
có số việc và nút mở CRM, tên khách chỉ ở chuông; cấp trên chỉ nhận việc của chính mình.
ADR 0134 — vẫn gửi ngày lễ.

**Đề xuất chưa duyệt:** doc trên, mục "Nhắc chủ động" — bảng 7 loại việc, luồng 6 bước
(máy chọn việc theo luật, AI chỉ viết 2–3 câu mở đầu; AI lỗi vẫn gửi danh sách; không có việc
thì không gửi; tối đa một bản tin/người/ngày; loại thông báo mới tắt được theo vai).

**Đã có sẵn để dựa vào:**

- Tuyến `assistant-brief` đã seed (0159: gemini-3.8-flash, dự phòng claude-haiku-5-5, **tắt**).
- `list_my_work` sau 1b có `approval` / `parked` (hold của mình) / `meeting` — gọi theo tên.
- Mẫu chạy giờ cố định: `NotificationDigestSweeper` (`apps/api/src/platform/notification/notification-digest.sweeper.ts`,
  quét 5 phút từ 08:00, nhìn lùi 4 ngày; gọi ở `apps/api/src/worker.ts` ~dòng 223).
- Thông báo theo vai: ADR 0093 + `/admin/notifications`. Người gửi mail: ADR 0092.
  Mẫu mail: `packages/mail-templates` (không compiler nào render — `pnpm mail:preview` mà nhìn).

**Hở, phải chốt trước khi viết code (hỏi chủ dự án từng câu một, kèm khuyến nghị):**

1. Duyệt bảng 7 loại việc. Ba loại **chưa có nguồn đọc theo người**: "liên hệ chưa chốt quá
   24 giờ" (`comm-late`), "khách im lặng lâu" (`sales.activity.warn-days`,
   `apps/api/src/branches/sales/config/activity-freshness.ts`), "đợt thu tiền quá hạn"
   (`contract-overdue`). Chọn: thêm mục vào `list_my_work`, hay bộ chọn của bản tin đọc thẳng
   service (vẫn phải qua cửa có kiểm quyền như tool).
2. **Đụng ADR 0145:** đã có một bản tin sáng gom bốn chuông KPI nhẹ, gửi 08:00 thứ Hai–Sáu.
   Gộp thành **một** tin buổi sáng hay hai tin riêng? (Khuyến nghị: một tin, KPI là một mục.)
3. Chuông bấm vào mở khung Trợ lý với danh sách việc — dựng trên màn Trợ lý hiện có hay một
   khối riêng trên chuông? Bản tin có lưu thành phiên chat không (ảnh hưởng re-check, 0136)?
4. Bật tuyến `assistant-brief` + chi phí: mỗi người một lần gọi/ngày.
5. Tải Neon: job hằng ngày quét mọi tài khoản — đọc memory `neon-compute-quota-incident` trước.

## 3 · Cách làm đợt 2 (đề xuất)

1. `grilling` từng câu ở mục 2 → ghi ADR (số tiếp theo: kiểm `ls docs/decisions` và
   `git log --all --name-only -- 'docs/decisions/015*'`; 0150 không ai dùng nhưng có thể có
   phiên giữ) + chép câu mở vào `open-questions.md`.
2. `/build` theo vùng: contract (loại thông báo, payload bản tin) → migration nếu CHECK
   loại thông báo cần mở → api-builder (bộ chọn + sweeper + ghi chuông) song song capture-builder
   (mail) và screen-builder (chuông → danh sách) → eval: mỗi vai chỉ thấy việc của mình,
   email không có tên khách, AI lỗi vẫn gửi, chạy lại không gửi lần hai.
3. Review Opus `xhigh` cho phần đọc theo quyền (đợt 1b cần ba vòng mới sạch), rules-reviewer,
   aurora-reviewer + screen-inspector. Rồi `/check`, commit, `/ship`.

## 4 · Bẫy gặp ở đợt 1b

- **Mã lưu trong `codes` mà cửa kiểm lại hẹp hơn cửa đọc ⇒ tải lại thì ẩn cả cuộc trò chuyện**
  (`assistant-refs.ts`). Mỗi mã model thấy phải hoặc nằm trong `codes` với cửa kiểm lại không
  hẹp hơn, hoặc không xuất hiện. Áp y nguyên cho bản tin nếu nó lưu thành phiên.
- `vitest` chạy từ gốc repo với đường dẫn `apps/api/...`; không có cờ `-q`;
  `--filter @pv/api exec vitest` không tìm thấy file.
- Vài agent (contract-drafter, rules-reviewer, aurora-reviewer) có lúc không có Bash — tự chạy
  lại lệnh kiểm sau khi chúng về.
- Chia agent theo vùng file rời nhau chạy song song rất ổn; giao diện chung giữa hai agent thì
  viết sẵn chữ ký vào cả hai brief.

## 5 · Skill nên gọi

`grilling` (chốt quyết định) · `build` · `delegating-work` · `check` · `ship` ·
`anthropic-skills:docs` (đọc/sửa doc kế hoạch) · `writing-for-agents` (nếu sửa agent/skill).
