# Bản ghi liên hệ (comm) — kế hoạch dựng trọn từ nghiệp vụ đến màn (01/10/2026)

Phiên sau đọc file này trước, rồi mở `/build`. Thứ tự cứng: **nghiệp vụ → DB →
contract → BE → FE → review → check → ship**. Không nhảy bước.

Nguồn: ADR 0074 · canvas https://claude.ai/artifact/HKUoHYd5Wphy6bQ4mrDPBU (hàng
v2 và hàng "Bản ghi liên hệ sinh ra từ đâu" là bản đích; hàng đầu là bản không
AI, giữ để đối chiếu) · bộ nhớ `chot-comm`, `nhan-ui-khong-dung-van-noi`.

## 0 · Hiện trạng cây khi bàn giao

Xương sống backend **đã dựng, chưa commit**, trên `master`. `pnpm check` xanh đủ
cổng lúc 01/10. Review `rules-reviewer` đã chạy, bảy lỗi nó nêu đã sửa.

- ADR `docs/decisions/0074-every-customer-comm-closes-with-summary-evaluation-and-next-step.md` + dòng index
- Migration `apps/api/drizzle/0075_comm_debrief.sql` (journal idx 75). **Chưa ship.** Phiên `pv-crm-ee` đã ship 0074 một mình (Fly v77)
- Contract: `packages/contracts/src/comms/{debrief,thread}.ts`, `sales/{config,next-step,meeting}.ts`
- API comms: `apps/api/src/platform/comms/{comm-debrief.hook,debrief.controller,debrief.service,debrief.repository}.ts` + sửa `thread.service`, `comms.mapper`, `comms.constraints`, `comms.module`, `message-logged.hook`
- API sales: `branches/sales/next-step/{comm-debrief.hook,next-step.rules}.ts` + sửa next-step/config/meeting/lead-comms.hook; `config/config.constraints.ts`; cửa `GET /sales/comm-vocabulary`
- `app.module.ts` nối `debriefHook`; `seed-config.ts`; fixture `sao-do-journey.ts` (`kind: null`); `apps/web/src/data/comms.ts` (nhãn kênh "Gặp mặt")

**Bước đầu phiên sau:** `git status`, đối chiếu danh sách trên, hỏi user có commit
xương sống thành một commit riêng trước không (đã hỏi ba lần, chưa trả lời).
Cây có thể lẫn file của phiên khác: `ListAgents` trước, nhắn peer chia vùng.

## 1 · Nghiệp vụ đã chốt (đừng mở lại)

1. Cứ giao tiếp với khách là một comm. Comm thuộc **đúng một** lead hoặc cơ hội,
   **cố định từ lúc tạo** (không có ô "Đặt cho"). Comm gắn hợp đồng: chưa có bước tiếp theo.
2. Ba trạng thái, nhãn cố định: **Chưa điền nội dung** → **Chưa xác nhận** → **Đã hoàn thiện**.
   Nút hành động là **"Xác nhận"** (không dùng "Chốt").
3. Hoàn thiện = tóm tắt + đánh giá + bước tiếp theo bắt buộc. Đánh giá là câu trả
   lời **bằng chữ** admin đặt trong Thiết lập (không chấm điểm). Loại bước tiếp
   theo cũng từ Thiết lập. Hạn chọn bằng **datepicker**, không nút nhanh.
4. Chỉ người tạo comm được xác nhận. Trưởng phòng chỉ xem số tồn.
5. Bản ghi sinh từ: (a) nút **Gọi / Zalo / Gửi mail** → hộp xác nhận → tạo bản ghi
   "Chưa điền nội dung" → mở hành động; (b) lịch gặp hết giờ → tự tạo; (c) **Ghi
   liên hệ** thủ công trên điện thoại, 4 bước: lượt bán → phương thức (icon) → nội
   dung + đính kèm → bước tiếp theo. Mail BCC và bot chat: lượt sau.
6. Trên comm thả được ghi âm · transcript · biên bản (MM) · ảnh chat. AI (Gemini
   Flash, dùng lại `platform/ai`) điền sẵn tóm tắt, đánh giá, bước tiếp theo; người
   bấm Xác nhận (luật 9). Căn cứ của AI gom sau **một nút (i)**, không chen dòng.
7. Nhãn UI chính xác, không văn nói (bộ nhớ `nhan-ui-khong-dung-van-noi`).

## 2 · Còn mở — hỏi user ĐẦU phiên, gom một lượt

1. Ghi âm gốc giữ mãi, hay chép lời xong giữ N ngày rồi xoá (chỉ giữ lời chép)? N = ?
2. Giới hạn tóm tắt 4.000 ký tự (số tự đặt) — giữ hay đổi?
3. AI điền phiếu làm ngay lượt này hay tách lượt sau (chi phí Gemini, cần `GEMINI_API_KEY` trên Fly)?
4. Nút Gọi trên desktop: chỉ `tel:` (máy tính có softphone thì gọi được), hay ẩn nút Gọi trên desktop?
5. Hạn xác nhận comm (để tô "trễ"): có không, bao nhiêu ngày? Chưa có thì không tô màu trễ.

## 3 · Chỗ xương sống lệch với thiết kế v2 — phải sửa

| Lệch                                                                  | Sửa                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comm gắn nhiều đối tượng, `targets()` cho chọn nơi đặt bước tiếp theo | Debrief mang `subject_code` cố định = đối tượng gốc; `targets()` chỉ trả đối tượng đó (hoặc rỗng nếu đã đóng / hợp đồng); bỏ `subjectCode` khỏi body xác nhận |
| Trạng thái chỉ `open/closed`                                          | Thêm suy diễn "Chưa điền nội dung" = debrief open và lượt không có nội dung lẫn tệp; contract trả `state: empty \| unconfirmed \| done`                       |
| Không có tệp trên comm                                                | `platform.attachment` đã có (`owner_kind IN ('lead')`): nới thành `('lead','comm')`, owner_code = debrief id                                                  |
| Không có cửa tạo bản ghi từ nút                                       | Cửa mới tạo lượt rỗng + mở debrief, trả id; web mở `tel:` / Zalo / trình soạn thư **sau khi** cửa trả 201                                                     |
| Lịch gặp không tự sinh comm                                           | Job pg-boss hẹn giờ ở `meeting.at + duration`: tạo thread kênh `meeting` (đã có `meetingId`) + debrief cho người tạo lịch                                     |
| Màn đặt lịch còn ô transcript                                         | Server đã bỏ ghi `transcript` → **ô đó làm mất dữ liệu im lặng**. Phải gỡ ô và thay bằng comm, cùng commit với BE                                             |
| Chưa có cây comm theo lượt bán                                        | Cửa đọc: comm đang chờ của một lượt bán (cho bước 2 màn điện thoại)                                                                                           |

## 4 · Kế hoạch theo pha

Model/effort theo `/dispatch`. Mỗi pha xong mới sang pha sau; pha 3 chạy song song được.

**P0 · Nghiệp vụ** — `doc-keeper` (Sonnet). Viết ADR mới (số kế tiếp, kiểm lại vì
phiên khác cũng viết ADR) ghi các quyết định ở §1 mục 1, 2, 5, 6 và bảng §3, nói
rõ nó hẹp lại ADR 0074 §F (một comm một đối tượng). Ghi luôn câu trả lời §2.
Xong khi: ADR + dòng index, `pnpm ctx` không gãy.

**P1 · DB** — `migration-writer` (Opus). 0075 **chưa ship** → sửa thẳng trong 0075,
không mở 0076 (nếu lúc đó 0075 đã ship thì mới mở số mới). Nội dung:
`comms.debrief.subject_code` NOT NULL (FK `platform.object`); `attachment_owner_kind_known`
thêm `'comm'`; cột đề xuất AI trên debrief (`proposal jsonb`, `proposed_at`) nếu §2.3 = làm ngay.
Xong khi: mỗi CHECK/FK mới bị chứng minh từ chối dòng sai trên PGlite.

**P2 · Contract** — `contract-drafter` (Opus). `comms/debrief.ts`: `state` ba giá
trị, tệp đính kèm, bỏ `subjectCode` khỏi `DebriefStepInput`, đề xuất AI + căn cứ;
body tạo bản ghi từ nút (kênh, người liên hệ, đối tượng); cây comm theo lượt bán.

**P3 · BE** (song song hai agent, `api-builder` Opus):

- _comms_ (`platform/comms/**`): cửa tạo bản ghi từ nút; gắn/xoá tệp (dùng `platform/storage`, presigned PUT như lead-scan); trạng thái ba giá trị; job lịch gặp hết giờ (`platform/queue`); nếu làm AI: job đọc tệp → ghi `proposal`.
- _sales_ (`branches/sales/**`): `targets()` một đối tượng; cây comm theo lượt bán (`workstream/**`); meeting hẹn job khi tạo/sửa lịch.
  Xong khi: tsc 0 lỗi, eslint sạch, chạy thử PGlite từng cửa (mã trạng thái thật).

**P4 · FE** — `screen-builder` (Opus), chia hai agent theo vùng file:

- _A · trang lead/cơ hội_: hàng nút Gọi/Zalo/Gửi mail ở `contacts-card.tsx` + hộp xác nhận (bảng `Action` · `ActionMobile`); timeline ngang kéo được "Tiến trình liên lạc" thay `comms-card.tsx` (bảng `History`); gỡ ô transcript ở `meeting-schedule-drawer.tsx`, nút "Ghi biên bản" ở `meetings-card.tsx`; hiện loại việc ở `lead-next-action.tsx`.
- _B · màn mới_: trang "Comm của tôi" lưới 3:1 (bảng `V2Queue`), trang comm record (bảng `V2Record`: hai cột tệp, phiếu xác nhận), luồng "Ghi liên hệ" 4 bước cho điện thoại (bảng `V2Drop`), mục Thiết lập "Câu hỏi đánh giá" + "Loại bước tiếp theo" (bảng `Config`, file riêng — `sales-config.tsx` đã ~936 dòng).
- Vùng chung **xin qua `sharedRequests`**, context chính áp: `routes.tsx` (route `/comms`, `/comms/:id`), `app/chrome.tsx` (mục menu "Comm" + badge số chưa xác nhận).
- Kịch bản dữ liệu: màn đã cắt sang Neon đọc thật; nếu cần fixture thì đúng một kịch bản và có test khoá số (luật repo).
- Hiệu ứng card (nổi, card đang xem phóng to và viền sáng) phải tắt khi giảm chuyển động. Chấm sao chỉ trong khung timeline (luật 12).

**P5 · Review** song song: `rules-reviewer` + `aurora-reviewer`. Loop tới sạch.
`acceptance-runner` chạy kịch bản: bấm Gọi → bản ghi "Chưa điền nội dung" → thả
tệp → (AI điền) → Xác nhận → bước tiếp theo xuất hiện trên cơ hội.

**P6 · Đóng** — `/check` (nói rõ tầng đã chạy) → commit theo vùng → `/ship`:
0075 lên Neon trước, deploy sau; tự kiểm healthz + `drizzle.__drizzle_migrations`.
Nếu làm AI: `GEMINI_API_KEY` phải có trên Fly trước khi deploy.

## 5 · Bẫy đã biết

- `apps/api/.env` trỏ **Neon production**. Mọi lệnh db truyền `DATABASE_URL=pglite://…` tường minh. Không seed với `.env`.
- PGlite một kết nối: đọc pool phải xong **trước** giao dịch (lý do `prepare` / `apply` tách đôi).
- Kill tiến trình theo PID, không `pkill -f`. API dev chạy cổng khác 4199.
- Không có mã 422 trong repo (`problem.ts`); từ chối nghiệp vụ dùng 400 kèm khoá trường.
- `eslint-suppressions.json` bị cả hai phiên sửa: chỉ prune đúng file mình đụng (`eslint --prune-suppressions <file>`).
- Số ADR và số migration: kiểm lại ngay trước khi ghi, phiên khác có thể vừa lấy.
