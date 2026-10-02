# Một khung cho mọi hồ sơ, workstream làm xương sống — kế hoạch nhiều phiên (02/10/2026)

Mỗi phiên đọc file này trước, rồi mở `/build` cho đúng phiên của mình. Thứ tự
cứng: **Đợt 0 → Đợt 1 → Đợt 2 → Đợt 3**. Trong cùng một đợt thì các phiên chạy
song song được, vì vùng file đã chia không chồng nhau.

Canvas thiết kế: https://claude.ai/artifact/EVS5wnsaiDpD1aVxXoU6L2. Mỗi khối trên
canvas có gắn nhãn Giữ nguyên / Chuyển chỗ / Mới / Bỏ.

## 0 · Vì sao làm

Business xoay quanh **lượt** (workstream): 1 lead, n cơ hội, n hợp đồng, comm gom
theo lượt (ADR 0062, 0075). UI thì xoay quanh từng đối tượng: mỗi màn tự vẽ lại một
mảnh của lượt theo cách riêng. Hiện trạng đo được lúc 02/10:

- **6 màn chi tiết có 5 kiểu header.**
  - Lead: `ScreenHeader` bọc trong glass.
  - Cơ hội, hợp đồng, công ty, người liên hệ: `ScreenHeader` trần.
  - Chiến dịch: thumbnail kèm nút quay lại riêng.
  - Workstream: `h2` viết tay.
- **3 kiểu skeleton, 3 kiểu báo lỗi.**
- **Trạng thái mỗi màn đặt một chỗ:** lead là badge trong tiêu đề, cơ hội là stepper tự vẽ, hợp đồng không hiện gì.
- **Thao tác mỗi màn một kiểu:**
  - Lead: thanh sticky.
  - Cơ hội, chiến dịch: thanh nổi, mỗi màn tự chèn spacer riêng (`h-56`, `h-12`).
  - Hợp đồng: nút trên header.
  - Workstream: chỉ có trong drawer.
- **Nút trùng chỗ:**
  - Lead: Mail có ở 3 nơi.
  - Cơ hội: Ký có ở 2 nơi.
- **Khối dùng chung bị phân mảnh:**
  - **Liên hệ có 3 bản:** `DealComms`, `ContractComms`, tab trong `LeadHistoryPanel`. Câu báo trống chép 3 lần.
  - **Người liên hệ có 4 bản.**
  - **Tệp có 2 bản.**
  - **Timeline có 2 kiểu,** dọc và ngang, ngay trong một thẻ ở lead.
- **6 chỗ `pages/` import chéo module.** `lead-next-action.tsx` và `workstream-drawers.tsx` thực chất là component dùng chung nhưng đang nằm trong `pages/`.
- **`StageTrack` của `@pv/ui` chưa màn thật nào dùng.**

Lời giải tương tự đã chạy được một lần: `components/book-page.tsx` gom 13 màn danh
sách về một khung. Kế hoạch này làm điều đó cho màn hồ sơ.

## 1 · Đích — canvas v2 đã duyệt 02/10 (hàng "v2" trên canvas)

```
┌ RunStrip (giống hệt ở LD / OP / HĐ / WS) ───────────────────────────────┐
│ Công ty · WS-xxx · [Lead ● → Cơ hội ○ → Hợp đồng ○ → Sau bán → Tăng trưởng] · Xem cây lượt │
├ RecordHeader: TIÊU ĐỀ + một dòng meta (mã · người phụ trách · nguồn · ngày) ┤  không chữ loại, không pill
├ Thân ──────────────────────────────────────┬ RunRail ───────────────┤
│ 1. Việc cần làm: stepper bậc (ngày từng    │ Liên hệ (cả lượt / chỉ │
│    bậc) + bước tiếp theo + NÚT CHÍNH       │   đối tượng này)       │
│ 2. Nội dung làm việc (giá trị, hợp đồng,   │ Người liên hệ          │
│    đợt thu, lịch gặp…)                     │ Tệp                    │
│ 3. Tham khảo, chữ nhạt (mô tả, form, AI)   │                        │
└────────────────────────────────────────────┴────────────────────────┘
 Thanh nổi: [Gọi][Zalo][Gửi mail] [Khác ▾]   — chỉ liên lạc; khung tự giữ spacer
```

Năm nguyên tắc. Reviewer chấm theo đúng năm điều này:

1. **Màn chỉ truyền nội dung, không truyền hình học.** Padding, lưới cột, điểm gãy,
   skeleton, báo lỗi và spacer của thanh nổi đều do khung quyết.
2. **Chính trước, phụ sau.** Thứ tự thân cố định: Việc cần làm → nội dung làm việc
   → tham khảo. Thẻ Việc cần làm là thẻ nặng nhất màn; thẻ tham khảo nhạt hơn.
3. **Mỗi dữ kiện đúng một chỗ.** Header không lặp thứ thanh lượt đã nói (loại, mã
   lượt, đối tượng nguồn). Không pill trạng thái khi màn đã có stepper. Người phụ
   trách/nguồn chỉ ở dòng meta (sửa qua "Khác"). Giao tiếp chỉ ở Liên hệ.
4. **Mỗi khối dùng chung chỉ có một bản,** nhận `{ kind, code }` hoặc `workstreamCode`
   rồi tự query. Màn chỉ gắn khối vào.
5. **Mỗi hành động một chỗ.** Nút chính nằm trong thẻ Việc cần làm, lấy từ verdict
   server (ADR 0076 §4) — không có verdict thì KHÔNG vẽ nút chính, không bịa.
   Thanh nổi chỉ Gọi/Zalo/Gửi mail + "Khác" (dừng, sửa phụ trách…).

Hợp đồng không có bước tiếp theo (ADR 0075): thẻ Việc cần làm hiện stepper bậc +
đợt thu sắp tới, **không nút chính** cho tới khi hành động theo bậc của hợp đồng được chốt (Postsale, chưa quyết).
Lead: nút chính chỉ khi verdict cho phép (BD: "Mở cơ hội"); Sale không có verdict
nào thì không vẽ nút.

Màn không thuộc lượt (chiến dịch, công ty, người liên hệ) vẫn dùng `RecordShell`
nhưng không có `RunStrip` và không có `RunRail`, chỉ có rail riêng của nó. Rail
của công ty là **danh sách các lượt** của công ty đó.

## 2 · Đã chốt 02/10 — user nhận toàn bộ khuyến nghị

1. Liên hệ ra rail cố định trên LD/OP/HĐ — thay một phần ADR 0077 §6 (ADR 0078).
2. Giữ màn workstream làm tổng quan (cây + cùng khung + cùng rail), bỏ `JourneyDrawer`.
3. Email (`LetterLines`) gộp vào Liên hệ, có lọc kênh.
4. Diễn biến của lead gộp vào ngày từng bậc trên stepper; lý do hoãn/dừng hiện trên bậc.
5. Tablet/điện thoại: rail xuống dưới thân, thanh nổi dính đáy.

## 3 · Kế hoạch theo đợt

Mỗi phiên làm theo `/build`: agent dựng → `aurora-reviewer` + `rules-reviewer`,
lặp tới khi sạch → `/check` → commit riêng file của mình. Model và effort chọn
theo `/dispatch`. Màn đã đổi thì phải nhìn bằng mắt luật 12/13 (bộ nhớ
`chay-app-de-nhin-bang-mat`).

### Đợt 0 — nền móng · 1 phiên · chặn mọi đợt sau

**Phiên S0 · Khung + thí điểm trên cơ hội.**

Rút khung ra từ màn cơ hội, vì đó là màn mới nhất và đã có thanh nổi lẫn cột phải
(giống cách `BookPage` lấy bản mới nhất làm bản duy nhất).

- `components/record/`:
  - `record-shell.tsx`: các ô header, strip, main, rail, actionBar. Gồm luôn skeleton và báo lỗi, dùng `EmptyState`.
  - `record-header.tsx`
  - `action-bar.tsx`: thanh nổi, tự giữ spacer.
  - `run-strip.tsx`: `StageTrack` + `ContextRail`, đọc `stand_*`/journey của lượt.
- Chuyển `pages/lead-next-action.tsx` → `components/run/next-step.tsx` và
  `pages/workstream-drawers.tsx` (phần dùng chung) → `components/run/`. Sửa luôn
  các import đang trỏ vào hai file đó.
- `pages/opportunity-detail.tsx` (+ `opportunity-parts`, `opportunity-moves`) chạy
  trên `RecordShell`:
  - Bỏ lưới `1fr_400px` tự vẽ và spacer `h-56`.
  - Ký chỉ còn một chỗ.
- `eslint.config.js`: thêm `no-restricted-imports` chặn file `pages/<module>-*`
  import `pages/` của module khác. Chỉ bật sau khi đã dời xong hai file kể trên.
- ADR 0078 (giao `doc-keeper`).
- **Xong khi:**
  - Cơ hội chạy trên khung.
  - Lint mới bật và xanh.
  - Không còn `pages/*` nào import chéo module.
  - `/check` xanh.
- **Sở hữu file chung cho cả kế hoạch:** `eslint.config.js`, `routes.tsx`, `app/**`,
  `@pv/ui`. Từ Đợt 1 trở đi, phiên nào cần đổi các file này thì ghi
  `sharedRequests`; S0 hoặc S7 áp.

### Đợt 1 — khối của rail · 2 phiên song song · sau khi S0 đã commit

Chỉ dựng khối và gắn vào màn **cơ hội**, màn đã chạy trên khung. Các màn khác để
Đợt 2.

**S1 · `CommJourney` + `NextStep`.**

- `components/run/comm-journey.tsx`, một bản duy nhất:
  - Nhận `workstreamCode`, có lọc theo đối tượng hoặc kênh.
  - Dùng một kiểu timeline (dọc, `@pv/ui Timeline`).
  - Câu báo trống chỉ viết một lần.
- Gộp Email vào nếu câu #3 chốt là có.
- Thay `DealComms` trên màn cơ hội.
- Vùng file: `components/run/comm-*`, `components/comms-card.tsx`,
  `components/comm-timeline.tsx`, `data/workstream-journey.ts`, `data/comms*.ts`.
- Kiểm: profile hợp đồng có trả `workstreamCode` chưa. Chưa có thì giao
  `api-builder` thêm field vào contract + mapper. Đây là việc BE duy nhất của cả kế hoạch.

**S2 · `RunContacts` + `RunFiles`.**

- `RunContacts`: danh bạ của lead, phủ thêm vai trò và người chính khi đứng trên cơ hội. Thay 4 bản hiện có.
- `RunFiles`: thay `LeadAttachmentsCard` và danh sách kẹp giấy ở cơ hội (bên cơ hội vẫn chỉ có tên, theo 0077).
- Gắn cả hai vào màn cơ hội.
- Vùng file: `components/run/contacts*`, `components/run/files*`,
  `components/contacts-card.tsx`, `components/open-deal-contacts.tsx`,
  `components/lead-attachments-card.tsx`, `pages/opportunity-contacts-edit.tsx`.
- **Đụng chung với S1:** cả hai cùng sửa `pages/opportunity-side.tsx` và
  `opportunity-main.tsx`. S2 chỉ sửa phần rail, S1 chỉ sửa phần liên hệ. Sửa từng
  dòng, đọc lại file ngay trước khi sửa.

### Đợt 2 — chuyển màn · 4 phiên song song

Mỗi phiên giữ trọn một cụm màn. Không phiên nào sửa `components/run/*` hay
`components/record/*`; cần đổi thì ghi `sharedRequests`, S7 áp.

| Phiên | Màn                                                                                        | Việc chính                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S3    | Lead: `lead-detail`, `lead-*`, `lead-tools-bar`, `lead-activity-card`, `lead-history-card` | Lên khung. Gắn RunStrip và rail. Thanh sticky đổi thành ActionBar, Mail còn một chỗ. "Hoạt động" thành "Diễn biến" trong thân. Bỏ tab liên hệ và email trong `LeadHistoryPanel`            |
| S4    | Hợp đồng + đợt thu: `contract-detail`, `contracts`, `installment-detail`, `contract-bits`  | Lên khung, thêm pill trạng thái. Thay `ContractComms` bằng rail. "Gửi email" lên ActionBar. `contracts.tsx` chuyển sang `BookPage`                                                         |
| S5    | Workstream: `workstream-detail`, `workstream-tree*`, `workstreams*`                        | Lên khung, thân là cây, có rail. Bỏ `JourneyDrawer` nếu câu #2 chốt thế. Màn cơ hội thôi gắn drawer                                                                                        |
| S6    | Ngoài lượt: `campaign-*`, `account-detail`, `contact-detail`                               | Lên khung, không strip. Rail của công ty là các lượt. Thanh nổi chiến dịch thay bằng ActionBar. Thanh nổi bỏ spacer `h-12`. `ContactsCard` cục bộ ở account dùng `RunContacts` bản chỉ đọc |

Trước khi bắt đầu, S5 phải hỏi phiên nào đang sửa `workstreams.tsx` và
`workstream-bits.tsx`. Hai file này đang có thay đổi chưa commit (lúc 02/10).

### Đợt 3 — dọn và gác · 1 phiên

**S7.**

- Áp các `sharedRequests` còn treo.
- Xoá code chết: `DetailSidePanel`, `LeadHistoryPanel`, `CommTimelineTrack`, các
  `*Comms` cũ, header và skeleton tự vẽ.
- Chuyển `approvals.tsx` và `comm-log.tsx` sang `BookPage`. Xem lại `/comms/log` có
  còn cần route không, vì hiện không có link nào trỏ tới.
- Chạy `aurora-reviewer` trên mọi màn hồ sơ và nhìn bằng mắt cả ba thiết bị.
- `pnpm ctx --strict` + `/check` + `/ship` nếu S1 có đổi BE.

## 4 · Đo "xong" bằng máy, không bằng cảm giác

Chạy sau Đợt 3. Mọi dòng phải ra đúng con số bên phải:

```bash
grep -lE "ScreenHeader|ScreenDetailGrid" apps/web/src/pages/*-detail.tsx | wc -l   # 0
grep -rlE "export function \w*Comms\b" apps/web/src | wc -l                        # 0
grep -rl "DetailSidePanel\|LeadHistoryPanel\|JourneyDrawer" apps/web/src | wc -l   # 0
grep -rnE "h-56|h-12\" />" apps/web/src/pages/*-detail.tsx | wc -l                  # 0 (spacer tự chèn)
grep -rl "<RecordShell" apps/web/src/pages | wc -l                                  # 8: LD OP HĐ đợt-thu WS CP công-ty người-LH
```

Thêm vào đó: lint chặn import chéo đã bật, `/check` xanh, và mỗi màn có ảnh chụp
desktop + tablet đã được user duyệt.

## 5 · Đừng làm

- Không thêm token hay hex mới. Thiếu token thì hỏi.
- Không viết test UI (luật repo). Chỉ fixture mới bắt buộc có test.
- Không đổi nghiệp vụ, trạng thái, nhãn đã chốt trong ADR 0058–0077. Đây là lượt
  **sắp xếp lại**, không phải lượt thay đổi hành vi.
- Không tự chế khối mới cho màn Sau bán và Tăng trưởng (chưa có sổ). `RunStrip` chỉ
  hiện chỗ trống cho hai màn này.
