# Bàn giao · Trợ lý CRM — chuẩn bị đợt 4 (làm hộ)

> **16/11/2026: sáu câu ở mục 3 đã được trả lời và đợt 4 đã dựng.** Đọc `.claude/HANDOFF-assistant-wave-4-build.md` thay cho file này.

Viết 16/11/2026. Thay cho `HANDOFF-assistant-wave-2.md` (đợt 2 đã ship 16/11, Fly v224).

## 0 · Trạng thái

- **Đã ship:** đợt 1b (prompt v14), đợt 2 (bản tin sáng, ADR 0154, migration 0169, Fly v224;
  sáng 16/11 gửi 5 bản tin), prompt v15 và đợt 3 (ADR 0161, prompt v16): master d4a1bedb, Fly v226 ngày 16/11, /healthz ok, không migration.
- **Gate 0 vẫn OPEN.** Lần chạy live gần nhất là ở v14 (16/11, tốn 3,16 triệu token): Gemini
  scope 48/60, injection 42/45 (chép PWNED 3 lần); Claude injection 45/45 nhưng bộ chấm Gemini
  trượt câu mẫu. Chủ dự án giữ Gemini làm model chính vì chi phí và cho thêm luật (v15). v15 và
  v16 **chưa từng chạy live**. Lệnh chạy rẻ (chỉ Gemini, scope + injection), chủ dự án gõ bằng `!`:
  script `gate0-v15.sh` trong scratchpad của phiên 15e92073 (có thể đã mất — nội dung: lấy
  `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` bằng `fly ssh console -a pvone-crm-api -C printenv …`, rồi
  `DATABASE_URL=pglite://memory pnpm --filter @pv/api ai:eval --suite assistant --live --yes
--case scope --case injection --model gemini-3.8-flash --failures <file>`). Lượt lọc không
  bao giờ đóng gate; đóng gate cần chạy đủ cả hai model trong một lần.
- **Chưa ai nhìn trên trình duyệt:** thẻ "Việc hôm nay", dòng chuông, mail bản tin, nhãn chờ của
  hai tool đợt 3 (KO do agent dịch, cần người đọc tiếng Hàn).
- **Dùng thật rất ít:** 96 lượt gọi `assistant` trong 14 ngày (đo 16/11 trên `ai_call`). Cache
  Gemini 5,4% nhưng tổng chỉ ~211 nghìn token vào — chưa đáng bật cache chủ động; đo lại khi
  lên vài trăm lượt/ngày.

## 1 · Đợt 3 đã làm gì (ADR 0161)

- `get_performance` (figures / exits / money / industries) qua đúng cửa màn Tổng quan;
  `count_records` (leads / deals / journeys / lead-sources) chỉ qua cửa đã lọc theo người hỏi.
  Không bọc bảng xếp hạng từng người, danh sách khoản thu, thẻ toàn sổ.
- Câu trả lời đã lưu kiểm lại quyền theo input (`reveals` là hàm), và câu tiền / số đếm của
  người khác bị ẩn với người duyệt chỉ xem của mình (`scopeCut`, cờ `foreign` theo từng dòng).
- Binder: khoá `…Vnd`, `…Percent`, nhãn kỳ (`tháng 11/2026`). Prompt v16.
- Eval scripted: scope-figures 234/234, scope-counts 72/72, coverage 22/22.
- Ship 16/11 từ worktree `~/workspace/pv-crm-brief` (nhánh `assistant-wave-3`, nền master có
  KPI v225): master d4a1bedb, Fly v226, không migration. Chưa gọi thử hai tool trên production.

## 2 · Đợt 4 — đã chốt gì (đọc trước khi hỏi)

Doc kế hoạch: https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR, phần "Làm hộ" và "Kế hoạch phủ
đủ sản phẩm". ADR 0133 §1–3.

- Model không bao giờ gọi cửa ghi. Nó dựng **thẻ đề xuất** (`propose_*`); người bấm thì việc ghi
  chạy qua đúng cửa màn đang dùng, bằng tài khoản người bấm (luật 9, `AiActionProps.basis`).
- Thẻ: việc sẽ làm trong một câu, trước/sau từng ô, căn cứ, hai nút Làm / Bỏ.
- Ba loại: việc của mình không cần duyệt (tạo bước tiếp, ghi liên hệ, lưu nháp mail) → cửa ghi
  sẵn có; việc vốn cần duyệt (chuyển lead, sửa giá trị cơ hội) → `E3.proposeFromAi` vào Hộp
  duyệt; hàng loạt → một thẻ liệt kê từng dòng, bỏ tích được, tối đa 20 dòng.
- Mỗi thẻ có mã chống lặp, hết hạn 30 phút; bấm thì máy chủ đọc lại bản ghi, đã đổi thì báo và
  không ghi. Màn có Hoàn tác thì thẻ cũng có. Mail chỉ ra nháp, không có tool gửi.

## 3 · Đợt 4 — phải hỏi chủ dự án (một câu một lượt, có đề xuất)

1. Danh sách việc làm hộ đợt đầu (đề xuất: chỉ việc của mình — tạo bước tiếp, ghi một lần liên
   hệ, dời hạn bước tiếp; chưa làm việc cần duyệt và hàng loạt).
2. Vai nào được thẻ đề xuất (đề xuất: mọi vai, theo đúng quyền ghi của cửa).
3. Thẻ hết hạn / chống lặp lưu ở đâu (bảng mới → migration) và giữ bao lâu.
4. Hoàn tác: chỉ khi màn có sẵn, hay mọi thẻ đều phải hoàn tác được.
5. Ghi audit: một dòng "do Trợ lý đề xuất, X bấm" trên bản ghi hay chỉ trong sổ trợ lý.
6. Đo: thước "dưới 15% lượt bị báo sai" có áp cho thẻ không.

## 4 · Nợ đã biết

- Người duyệt chat của người khác (`assistant.review`, mặc định chỉ giám đốc) vẫn đọc được câu
  `get_my_kpi` (thẻ KPI, pipeline của người khác) và mục duyệt / biên bản trễ của `list_my_work`
  (không có mã, không `reveals`). Cần một luật "người đọc khác chủ" riêng. Chưa ai lọt vì mặc
  định chỉ giám đốc có quyền này.
- `count_records` không đếm theo người phụ trách, tháng, ngành (cho người chỉ xem của mình), hợp
  đồng theo trạng thái: không có cửa đã lọc.
- Đợt 2: người tắt chuông vẫn tốn một lần đọc + một lượt AI mỗi lần worker khởi động trong cửa
  sổ; câu AI bản tin chỉ hiện tiếng Việt.
- Hai mail bản tin bị trả về sáng 16/11 (Resend báo `bounced`, `suppression.added`) — chưa kiểm
  có phải mail bản tin không.

## 5 · Bẫy

- Số ADR và số câu hỏi: nhánh song song hay lấy trùng (đợt 3 phải đổi 0155 → 0161, câu 183–185 →
  198–200). Đọc `docs/decisions/` và `open-questions.md` trên `origin/master` ngay trước khi đặt số.
- Hook mới (`.claude/hooks/`, master `ef031c23`): spawn `general-purpose` phải ghi `model`;
  agent dựng chạy opus cần dòng `Why opus:`; subagent không commit ở cây chính trừ `worker`.
- `pnpm fly:deploy` ship cả cây làm việc: deploy từ worktree sạch đã chứa mọi commit đang chạy
  trên Fly (16/11 KPI lên v225 trước đợt 3 vài phút).
- Phiên này không đọc được khoá Fly hay Neon production (auto mode chặn): đưa chủ dự án lệnh `!`.
- `vitest` chạy từ gốc với `--reporter=dot`; eval scripted: `cd apps/api && DATABASE_URL=pglite://memory pnpm ai:eval --suite assistant`.
