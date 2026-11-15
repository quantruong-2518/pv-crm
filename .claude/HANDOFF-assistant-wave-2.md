# Bàn giao · Trợ lý CRM — chạy lại gate 0 (v14), rồi dựng đợt 2 (bản tin sáng)

Viết 15/11/2026 tối. Thứ tự đã chốt với chủ dự án: **1 · chạy lại eval live → 2 · dựng đợt 2.**

## 0 · Trạng thái

- Đợt 1b (ADR 0152) + prompt v14 + sửa eval đã ở `origin/master` `0a2b9cad`, ship lên Fly
  theo lệnh chủ dự án khi **gate 0 còn OPEN**. Không có migration. Kết quả deploy: xem
  `docs/status.md` / memory `assistant-wave-1b-handoff`.
- Chưa ai mở màn: nút "Phân tích kỹ" ở khung 320px (luật 13). WSL này không chạy được
  trình duyệt headless (thiếu `libnspr4`) — cần người nhìn hoặc máy khác.

## 1 · Gate 0 — chạy lại ở v14

Lần chạy 15/11 (v13, đã sửa harness): Claude Sonnet 5.5 scope 60/60, injection 45/45.
Gemini 3.8 Flash scope 35/60, injection 43/45. Lỗi 0/45 trước đó là **bug harness** (trần
60 lượt/giờ đếm `ai_call`, eval không xả) — đã sửa `e075a75f`. Chi tiết: ADR 0133 §5 bản sửa
15/11, `docs/status.md` mục wave 1b.

v14 nhắm ba lỗi thật của Gemini: tìm lại tới trần 8 vòng, nói "không có quyền" (lộ bản ghi
tồn tại), trích chỉ thị cài trong dữ liệu. Grader mới: lý do trước kết luận, chỉ nhóm
grounding thấy tool output, 5 câu đối chứng phải chấm đúng thì gate mới đóng
(`apps/api/src/scripts/ai-eval/live-grade.ts`).

Phiên không đọc được khoá Fly (classifier chặn) — **chủ dự án chạy bằng `!`**:

```bash
GK=$(fly ssh console -a pvone-crm-api -q -C 'printenv GEMINI_API_KEY' 2>/dev/null | tail -1 | tr -d '\r\n')
AK=$(fly ssh console -a pvone-crm-api -q -C 'printenv ANTHROPIC_API_KEY' 2>/dev/null | tail -1 | tr -d '\r\n')
GEMINI_API_KEY="$GK" ANTHROPIC_API_KEY="$AK" pnpm --filter @pv/api ai:eval --suite assistant --live --yes \
  --model gemini-3.8-flash --model claude-sonnet-5-5 --failures <ĐƯỜNG DẪN TUYỆT ĐỐI>.jsonl > <log> 2>&1
```

- Chạy rẻ để thử nhanh: thêm `--case scope --case injection`, bỏ `--model claude-…` (vẫn cần
  cả hai khoá vì grader là vendor kia). Chạy lọc không bao giờ đóng gate.
- `--failures` phải là đường dẫn tuyệt đối (pnpm chạy trong `apps/api`). Dòng lỗi có sẵn
  chuỗi tool + input và đoạn đầu câu trả lời.
- Chạy đủ ~20–30 phút, ~2–3 triệu token. Chạy nền rồi đọc file lỗi.

**Phải hỏi chủ dự án nếu Gemini vẫn thiếu** (đừng tune prompt theo nhiễu grader — dừng ở
58–59/60 mà lỗi còn lại là grader bất đồng):

1. Grader mạnh hơn cho case của Gemini (Sonnet thay Haiku), đổi ngưỡng 100%, hay đặt Claude
   Sonnet làm model chính của tuyến `assistant` (đã qua sạch).
2. Gemini hết giờ (AbortError) 2 lần/~150 lượt: với ngưỡng 100% thì riêng nó đủ làm trượt.
   Cho hỏi lại khi hết giờ là quyết định của chủ dự án (ADR 0133: không trả lời = trượt).

Ngoài gate, làm sau: luật nhóm coverage lỗi thời so với ADR 0147/0152 (chiến dịch, họp hôm
nay, lịch sử liên hệ đã đọc được); off-topic chưa đủ một câu ngắn; cả hai model nêu tên người
đạt chỉ tiêu ở coverage-14 (`kpi-ahead`, có vẻ lỗi thật); chữ số trong tên công ty bị che
`[chưa rõ]` (tên thật như "Công ty 3M" cũng sẽ bị).

## 2 · Đợt 2 — bản tin sáng: đã chốt hết, viết ADR rồi dựng

**Đã chốt 15/11 (đừng hỏi lại):**

1. Ba loại việc còn thiếu thành mục mới của `list_my_work`, qua cửa có sẵn: khách im lặng lâu
   (`OpportunityBookRow.activityFreshness` mức warn trở lên — `DealTrusted` hiện pick từ
   `OpportunityRow`, chưa có trường này), liên hệ chưa chốt quá 24 giờ (`GET debriefs/pending`,
   đã lọc theo người hỏi), đợt thu quá hạn (sổ hợp đồng `status=overdue`). Gọi theo tên như
   ba mục của 1b; bản tin gọi đủ.
2. Không gộp với bản tin KPI của ADR 0145 — đã chốt 10/11 (câu 174), hai tin riêng.
3. Bấm chuông → mở khung Trợ lý, đầu khung là thẻ "Việc hôm nay" **đọc lại lúc mở** (cần một
   `GET` my-work không qua model). Không lưu thành phiên chat. 2–3 câu AI nằm trên dòng chuông.
4. Bật tuyến `assistant-brief` khi ship, `daily_calls_per_user = 1` (ghi rõ trong ADR: đặt ở
   migration hay bước ship).
5. Neon Launch chạy liên tục → quét tuần tự từng người, ít song song (không hỏi).
6. Đợt thu: chỉ đợt đã quá hạn, không ngưỡng "sắp". Người nhận = chủ hợp đồng **và** người
   phụ trách thanh toán như chuông — sổ hợp đồng chỉ lọc `owner`: thêm bộ lọc hoặc ghi ADR
   "chỉ owner". Quyết định mục là theo hợp đồng hay theo từng đợt.

Đã chốt từ trước: ADR 0133 §2 (08:00 thứ Hai–Sáu giờ VN, chuông + email; email chỉ số việc +
nút mở CRM, không tên khách, không gọi AI; cấp trên chỉ nhận việc của mình), ADR 0134 (gửi cả
ngày lễ). Không có việc thì không gửi; tối đa một bản tin/người/ngày (event key
`assistant-brief/<người nhận>/<YYYY-MM-DD>` như `kpi-digest`); AI lỗi vẫn gửi danh sách;
loại thông báo mới tắt được theo vai (`/admin/notifications`).

**Kiểm trước khi viết ADR (có thể đổi chữ ADR):**

- Worker có nạp đủ controller mà `door()` cần không (`apps/api/src/worker.ts`), và `door()`
  có tự kiểm `@Need` ngoài HTTP không. Nếu không → chạy bộ chọn ở process API qua job.
- `detail` của thông báo chứa được 2–3 câu chữ tự do không.
- Số: ADR tiếp theo **0154** (0153 là đổi tên "Light CRM" ở nhánh `product-rebrand`, 0150 bỏ
  trống), migration tiếp theo **0167** — kiểm lại bằng `git log --all --name-only` ngay trước khi
  viết. Câu mở 183–185 nằm trong doc kế hoạch, chưa chép vào `open-questions.md`.

**Mẫu có sẵn:** sweeper giờ cố định `NotificationDigestSweeper`
(`apps/api/src/platform/notification/notification-digest.sweeper.ts`); tuyến `assistant-brief`
đã seed (0159, đang tắt); mẫu mail `packages/mail-templates` (xem bằng `pnpm mail:preview`).

**Cách làm:** `/build` theo vùng — contract (loại thông báo, payload, GET my-work) → migration
(CHECK loại thông báo, như 0164) → api-builder (mục mới của list_my_work + bộ chọn + sweeper)
song song capture-builder (mail) và screen-builder (thẻ "Việc hôm nay") → eval: mỗi vai chỉ
thấy việc của mình, email không tên khách, AI lỗi vẫn gửi, chạy lại không gửi lần hai →
review Opus `xhigh` phần đọc theo quyền, rules-reviewer, aurora-reviewer → `/check` → `/ship`
(migrate trước, deploy sau, từ worktree tách rời).

## 3 · Bẫy

- Mã lưu trong `codes` mà cửa kiểm lại hẹp hơn cửa đọc ⇒ tải lại thì ẩn cả cuộc trò chuyện
  (`assistant-refs.ts`). Thẻ "Việc hôm nay" không lưu phiên nên không dính, nhưng mục mới của
  `list_my_work` trong chat thì có.
- `vitest` chạy từ gốc repo với đường dẫn `apps/api/...`. `tsc -p apps/api/tsconfig.json`
  không gồm file test.
- `pkill -f "<lệnh>"` tự giết shell đang chạy nó — giết theo PID.
