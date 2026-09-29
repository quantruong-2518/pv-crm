# Hành trình lặp lại — thiết kế lại màn hành trình (27/09/2026)

**Web đã dựng xong trên mock (28/09), BE chưa làm gì** — xem "Trạng thái" ngay
dưới. Chưa có ADR, migration hay API cho luồng này. Bản thiết kế nằm
trên canvas https://claude.ai/artifact/GWVAqJSDxm87NwbgT6eGB5 — hàng A là màn
đang chạy (dựng lại để đối chiếu), B·C·D đã bị thay, **hàng E là bản hiện hành**:
`E-Model` (luật), `E-Main` (màn, bấm được), `E-Deal` và `E-Fall` (drawer). Đọc
nguồn bằng Artifact `read` với path `project/E-Main.dc.html`. Dữ liệu trên canvas
là mẫu MES ("Nhựa Tân Á"), không phải WS-0007 thật.

## Presale — tích hợp thật (28/09/2026)

Kế hoạch đầy đủ (luồng đích, 13 luật cũ phải lật, 6 đợt, 12 kịch bản nghiệm
thu): https://claude.ai/artifact/Ho7qfF1zV5M93Tv5x5LSXV. UI hành trình đã commit
(`ec150fe`).

- D1–D11 (chủ dự án chốt 28/09) đã ghi thành ADR:
  `docs/decisions/0067-park-every-presale-stop-and-wake-into-a-new-journey.md`.
- Chốt tiếp 29/09, sửa lại một phần 0067: `docs/decisions/0068-lead-loops-until-a-person-stops-caring.md`.
  Gửi mail (kể cả gửi loạt/hẹn giờ) tự đẩy sang "Tình trạng chăm sóc" khi thư đi;
  "Nhóm chờ chăm sóc" quay vòng trên CÙNG lead (giữ mã, hành trình, người giữ),
  không mở lead mới; "Ngừng chăm sóc" (`disqualified`) là điểm kết riêng, chỉ vào
  khi có người bấm.
- Còn mở: SDR (câu mở #23) · trả lời trên cơ hội/hợp đồng (#27).
- Đã commit (28/09), qua `pnpm check` và nhìn trên PGlite: làn I (việc tiếp
  theo lên máy chủ — bảng `sales.next_step`, 4 cửa `/sales/leads/:code/next-step`,
  thẻ trên chi tiết lead) và làn II (convert xét phạm vi lead, comms chỉ đẩy bậc
  khi có `lead.edit`, landing qua `bear()`, gắn công ty trỏ lại cạnh, một người
  ghi trường liên hệ). Chưa lên Neon: migration `0066` đi cùng lần `/ship` sau.
- **Tiền trạm `/ship`:** migration `0067` (đưa các lead `archived` cũ về
  `nurturing`) văng lỗi `23505` nếu một lead `archived` trùng email với một
  lead còn sống trên Neon — đếm số lead trùng trước khi chạy migration.
- Còn nợ nhỏ: E2 so người giữ bằng tên (`packages/engines/src/e2-access.ts`);
  bước dừng/đóng cơ hội chưa xoá việc tiếp theo của cơ hội (chưa có cửa OP).
- Việc tiếp: W1 contract + W1b mock (màn mới chạy trên mock trước).

## Trạng thái — 28/09/2026

Đã có (chưa commit lúc viết — cây làm việc lẫn file của phiên làm mail/lead,
commit phải chọn đúng file):

- Contract đọc `WorkstreamJourneyResponse` —
  `packages/contracts/src/sales/workstream-journey.ts`. Tách riêng khỏi
  `WorkstreamProfileResponse`; API vẫn trả hình cũ.
- Mock sao-do bốn hành trình + test khoá số —
  `packages/engines/src/fixtures/sao-do-journey.ts`. WS-0088 là bản đủ nhất
  (lead → 3 cơ hội: 1 dừng, 1 ra 1 hợp đồng, 1 ra 2 hợp đồng).
- Màn thay hẳn màn cũ: `apps/web/src/pages/workstream-detail.tsx` +
  `workstream-tree*.ts(x)` + `workstream-drawers.tsx`. Query ở
  `apps/web/src/data/workstream-journey.ts` còn `load:`; mã ngoài mock → 404,
  nên sổ hành trình thật bấm vào đều "Không có hành trình này".
- Chủ dự án đã duyệt UI. Drawer chỉ xem, chưa có nút ghi nào.

Quyết định đã chốt trong lượt: mock ở kịch bản sao-do (không thêm kịch bản thứ
ba); mức trễ của bậc do bên gửi tính (`JourneyDealRung.dueLevel`, luồng G3);
bậc Thu tiền của hợp đồng chỉ chạy khi tới lượt, đợt tạm ứng đã thu chỉ hiện
trong danh sách đợt; pill trạng thái đầu màn đặt trên mặt kính (pill xanh
không đạt 4.5:1 trên nền sáng trần).

## Các cấp logic đã chốt với chủ dự án

1. **Công ty lặp lại mãi, mỗi hành trình là một lượt bán.** Các hành trình của
   một công ty nối nhau bằng cạnh "nối từ" trong E1.
2. **Phase chỉ là nhãn gom**, không phải state: Presale (lead) · Sale (cơ hội,
   báo giá, ký) · Postsale (hợp đồng) · Tiếp nối (Tăng trưởng, Nhóm chờ chăm sóc).
3. **Số lượng:** 1 hành trình : 1 lead : n cơ hội : n hợp đồng mỗi cơ hội. Mỗi
   hợp đồng có một loại (bản quyền, triển khai, đào tạo…).
4. **State dùng đúng nhãn product** (`packages/contracts/src/sales/enums.ts`,
   `apps/web/src/data/intake.ts`), không đặt từ mới:
   - Lead: Khởi tạo lead · Nhận PIC · Tạo chiến lược chăm sóc · Tình trạng chăm sóc · Đổi thành Opp.
   - Cơ hội: Khởi tạo opp · Nhận PIC · Sample (tuỳ) · POC (tuỳ) · Quotation → Thành hợp đồng.
     Không có state Đàm phán hay Chờ ký riêng (`docs/decisions/0064-opportunity-state-follows-milestones-and-care-list.md`).
   - Báo giá (BG, đã chốt, chưa code): nháp → đã gửi → khách chốt · từ chối · thay bản mới
     (`docs/decisions/0020-quote-is-a-separate-versioned-object.md`).
   - Hợp đồng (**mới**): Đã ký · Triển khai · Nghiệm thu · Thu tiền · Hoàn tất. Một
     thang cho mọi loại, bậc loại đó không dùng thì bỏ qua (bản quyền bỏ Triển khai, Nghiệm thu).
   - Hành trình: mở → tới Tăng trưởng khi mọi hợp đồng Hoàn tất → đóng Thắng · Thua · Rời bỏ
     (ba lý do đóng đã có sẵn).
5. **Bậc con chỉ hiện trong drawer:** các lần gửi báo giá, chờ duyệt chiết khấu,
   chờ duyệt ký; bước POC; mốc triển khai MES (Khởi động · Cấu hình và tích hợp ·
   Chạy thử UAT · Go-live); biên bản nghiệm thu; từng đợt thu (chưa đến hạn · đến
   hạn · đã xuất hoá đơn · đã thu · quá hạn theo DueLevel).

## Luật

- Dừng ở bất kỳ bậc nào, phase nào → lead chuyển **Nhóm chờ chăm sóc**, lưu ngày,
  bậc, lý do, người kết luận. Kể cả "không phù hợp" — chiến dịch lọc theo lý do.
- **Đánh thức lại** hoặc **Tăng trưởng** luôn mở lead mới, hành trình mới, nối về
  hành trình cũ. Ai quyết định (hoặc ai đánh thức) thì người đó giữ lead.
- Nhu cầu nảy ra khi khách đang triển khai hoặc đang dùng → hành trình mới, kể
  cả thay đổi nhỏ. Nhu cầu trong lượt bán đang chạy → thêm cơ hội cùng hành trình.
- Hành trình đóng Thắng khi đã tới Tăng trưởng và đã có hành trình sau; Thua khi
  chưa ký gì mà mọi thứ đã dừng; Rời bỏ khi đã ký rồi khách bỏ.
- Hoá đơn chỉ **ghi nhận** (số, ngày hoá đơn; ngày, số tiền đã thu), không phát
  hành. Đây là lựa chọn "đúng logic" chủ dự án giao, trả lời câu mở #21
  (`docs/decisions/open-questions.md`) — cần ghi vào ADR.

## Màn E

- Đầu màn: "Tên công ty · hành trình N", badge "Đang chạy", ContextRail (hành
  trình trước → này, lead, công ty → hành trình sau). Không có dải số tóm tắt.
- Cây 4 làn có nền riêng; thanh phóng to, thu nhỏ 40–200% và "Vừa khung" (mặc định).
- Thẻ: lead · cơ hội đang mở (mã, giá trị, ngày chốt, người giữ, dải bậc, pill
  trạng thái, việc tiếp và ngày) · cơ hội đã xong thu gọn (tên, mã, trạng thái) ·
  hợp đồng (loại, giá trị, mã, trạng thái, dải 5 bậc riêng) · lối tiếp nối đặt đúng
  hàng đối tượng sinh ra nó.
- Mỗi loại thông tin một kiểu: mã là pill xám chữ đơn cách, bấm sang trang chi
  tiết đang có (leads, opportunities, contracts, workstreams, accounts); giá trị
  là pill vàng; trạng thái là pill màu tình trạng; ngày có icon lịch; người giữ là avatar.
- Drawer 4 loại: bậc lead/cơ hội · bậc hợp đồng · Nhóm chờ chăm sóc · Tăng trưởng.
- Nút ≥ 48px (pill có vùng bấm mở rộng), khoảng cách 8 bậc, không chữ nào bị cắt "…".

## Phải đổi khi làm thật

- Ký hợp đồng đang **đóng** hành trình (`syncClosed`, gọi từ
  `apps/api/src/branches/sales/opportunity/opportunity-sign.service.ts`) → bỏ,
  hành trình đi tiếp sang Postsale.
- Cơ hội vào Danh sách chăm sóc rồi kích hoạt lại tại chỗ (ADR 0064) và lead Chờ
  thời điểm quay về bậc cũ (`docs/decisions/0058-lead-gets-a-stored-lifecycle-state.md`)
  → đổi thành: dừng thì sang Nhóm chờ chăm sóc, kéo lại là hành trình mới.
- "Không theo nữa", "Lưu trữ" đang là điểm kết → sang Nhóm chờ chăm sóc, có lý do.
- Mỗi cơ hội chỉ có một `contractCode` (`packages/contracts/src/sales/workstream.ts`)
  → danh sách hợp đồng; cửa ký phải cho ký thêm trên cơ hội đã thắng.
- Thêm mới: danh mục loại hợp đồng, state hợp đồng và mốc triển khai, mốc hoá
  đơn và đã thu cho từng đợt, bản ghi chuyển Nhóm chờ chăm sóc, cạnh "nối từ" giữa
  các hành trình, trường "bước tiếp theo" trên cơ hội.
- Cửa `GET /sales/workstreams/:code` phải trả `WorkstreamJourneyResponse`
  (hình đã chốt, kể cả `dueLevel` từng bậc do engine tính). Query web đã gắn
  `schema`, nên bỏ `load:` trước khi cửa đổi hình là lỗi "không khớp hợp đồng",
  không phải màn vẽ dở.
- Cột "Rơi" của `WORKSTREAM_JOURNEY_STEPS` đổi nhãn cho khớp từ product.
- Màn đã dựng lại (cây 4 làn, đọc mock sao-do): `apps/web/src/pages/workstream-detail.tsx`,
  `apps/web/src/pages/workstream-tree.tsx`, `apps/web/src/pages/workstream-tree-model.ts`.
  Server đánh dấu bậc bỏ qua là "done" không ngày (`apps/api/src/branches/sales/workstream/workstream-lanes.ts`).

## Còn mở

- SDR có phải vai riêng không (câu mở #23).
- `--brand-gold` (màu logo, `packages/tokens/globals.css`) có được dùng làm màu
  giá trị tiền không — nếu có thì cần token chính thức.
- Nhãn cơ hội đang mở "Đang triển khai" dễ nhầm với bậc hợp đồng "Triển khai".
- Pill giá trị tiền đang trung tính (`bg-surface-ink/9`) chờ câu trên.
- Nhãn "xong" của thang hạn đã chốt "Đã xong" (ADR 0067 §7, câu mở #24) nhưng
  `DUE_LABEL.done` vẫn là "Đã thu" — drawer đang không in pill cho mốc đã xong.
- Mock chưa có cửa Nhóm chờ chăm sóc do máy kết luận (C5) hay mang cờ Không liên
  hệ (C4) — code có nhánh, chưa màn nào hiện ra để nhìn.
- Mã hợp đồng không bấm được: `chainPath` chưa có `HĐ` vì module hợp đồng đang gác.

## Việc tiếp theo, theo thứ tự

1. Commit phần web + contract + mock (chọn file, xem "Trạng thái").
2. ADR "Hành trình lặp lại" qua `doc-keeper` — thay một phần ADR 0058 và 0064,
   ghi luôn quyết định hoá đơn.
3. Migration qua `migration-writer` — danh sách ở "Phải đổi khi làm thật".
4. API qua `api-builder`: cửa đọc trả `WorkstreamJourneyResponse`; đổi hành vi
   ký/dừng; rồi các cửa ghi (dừng, đánh thức, tăng trưởng, ghi đợt thu, việc
   tiếp theo) — contract ghi chưa có, soạn qua `contract-drafter` trước.
5. Web: bỏ `load:` (và `journeyNow()` về đồng hồ thật), gắn nút ghi vào drawer.
6. Ngăn Dòng hoạt động và Tài liệu cạnh cây (F-Model) — cần mock/API trước.
   Gom cả chuỗi bằng `/build`.

---

# Luồng chung — chốt với chủ dự án (27/09/2026)

Trước năm luồng dọc, chốt các luồng mọi luồng đều dùng lại. **Quyền (B) và duyệt
(F) để sau.** Thứ tự: C → A → D → E → G. Chốt xong kế hoạch thì dựng lên canvas
Claude Design đang có (link ở đầu file) rồi mới làm code.

## C · List Nhóm chờ chăm sóc và Đánh thức lại — ĐÃ CHỐT

1. **Tái khởi động ngay khi lead được đưa vào chiến dịch**: mở lead mới + hành
   trình mới, nối về hành trình cũ.
2. **Mọi điểm dừng về Nhóm chờ chăm sóc + lý do.** "Không theo nữa" gộp vào; bỏ
   "Lưu trữ" tự động sau 6 tháng — lead nằm chờ không hạn.
3. **Một danh mục lý do chung** (cấu hình, admin sửa), mỗi lý do ghi nó dùng được
   ở luồng/bậc nào. Thay 6 `ExitReason` của lead + 17 lý do chăm sóc của cơ hội.
4. **Lý do có cờ "không liên hệ"**: lead dừng với lý do đó vẫn nằm trong list
   (để thống kê) nhưng không bao giờ được bốc vào chiến dịch hay nhận mail. Chặn
   theo địa chỉ (bounce, huỷ đăng ký) vẫn chạy song song như hiện tại.
5. **Hết chiến dịch mà lead được đánh thức vẫn chưa có trao đổi thật** → máy tự
   chuyển Nhóm chờ chăm sóc, lý do "Không phản hồi chiến dịch", hành trình đóng Thua.
6. **Người giữ:** nằm chờ thì không ai giữ (về pool). Đánh thức qua chiến dịch →
   lead mới ở Khởi tạo lead, không PIC, vào pool, ai nhận trước giữ. Bấm tay
   "Đánh thức lại" → người bấm giữ. (Thay luật 3 trên canvas cho trường hợp
   chiến dịch; luật "người quyết định tăng trưởng giữ" không đổi.)

## A · Gửi mail — ĐÃ CHỐT

Dùng **modal gửi mail đang có** — không thiết kế lại phần chọn người nhận (chủ dự án: "đã có modal rồi, đừng hỏi lại").

1. **Một modal, hai kiểu gửi**: gửi loạt (mỗi người một thư riêng, trộn tên — đang
   có) và gửi nhóm (một thư To/CC nhiều người cùng thấy — chưa có).
2. **Khách trả lời thư hoặc đặt lịch từ thư = trao đổi thật**, tự đẩy lead sang
   "Tình trạng chăm sóc", ghi dòng hoạt động, báo người giữ. Mở thư/bấm link KHÔNG
   tính. Lead đã phản hồi thì hết chiến dịch không bị trả về list (luật C5).
   Chi tiết cần dựng rõ trên canvas: lead còn ở pool (chưa PIC) mà khách phản hồi.
3. **Mở được modal ở bất kỳ màn nào có nguồn người nhận** — không giới hạn danh
   sách màn; modal là component dùng chung.
4. **Mẫu thư gắn mốc**: mỗi mẫu có thể gắn một mốc của luồng ("Báo giá" →
   Quotation…). Thư dùng mẫu đó rời hệ thống thành công thì máy ghi mốc. Thư
   thường chỉ ghi vào dòng hoạt động.

## D · Người giữ và bàn giao — ĐÃ CHỐT

1. **Mỗi đối tượng có người giữ, con kế thừa cha lúc tạo** (lead → cơ hội → báo
   giá → hợp đồng), sau đó giao riêng được. Hành trình không có người giữ riêng —
   hiển thị người giữ lead. Công ty có người phụ trách riêng (account owner).
2. **Hợp đồng hai vai**: người giữ (kế thừa cơ hội — thu tiền, hoa hồng, quan hệ
   khách) + "người triển khai" chọn khi hợp đồng sang bậc Triển khai; loại không
   triển khai (bản quyền) không có vai này.
3. **Bàn giao: hỏi, mặc định kéo theo.** Drawer liệt kê con đang mở mà người cũ
   đang giữ, đánh dấu sẵn, bỏ chọn được. Con do người khác giữ và con đã xong
   không đổi. Mỗi lần đổi người ghi dòng hoạt động — trên mọi đối tượng.
4. **Người nghỉ / bị khoá tài khoản**: mọi thứ đang mở họ giữ tự chuyển cho
   trưởng phòng kinh doanh giữ tạm, trưởng phòng chia lại.

## E · Dòng hoạt động — ĐÃ CHỐT

1. **Mỗi đối tượng một dòng, cha gộp con.** Việc ghi vào đúng đối tượng xảy ra;
   hành trình xem gộp lead + mọi cơ hội, báo giá, hợp đồng của nó; công ty xem gộp
   mọi hành trình. Có lọc theo đối tượng và loại việc. (Sửa luôn lỗi thư gửi từ cơ
   hội bị rơi khỏi lịch sử; gộp `opportunity_stage_event` vào cùng một dòng.)
2. **Nội dung**: luôn có đổi bậc, dừng/đánh thức, đổi người giữ, thư gửi/nhận
   (từ C, A, D) — cộng thêm cả bốn: cuộc gọi · cuộc gặp · tin nhắn ghi được trên
   MỌI đối tượng (không chỉ lead) · ghi chú tay (sửa/xoá được ghi chú của mình) ·
   sửa trường quan trọng (cũ → mới, ai sửa; trường nào thì chốt ở từng luồng dọc) ·
   mở thư / bấm link.

## G · Việc tiếp theo và hạn — ĐÃ CHỐT

1. **Một việc + ngày trên mỗi đối tượng đang mở**: nội dung ngắn + ngày + người
   làm (mặc định người giữ), lưu ở máy chủ (bỏ bản localStorage của lead). Bấm xong
   → ghi dòng hoạt động + hỏi việc kế.
2. **Tuỳ chọn**: có thì hiện, không có thì thôi, không cảnh báo.
3. **Một thang hạn cho mọi thứ có hạn** — 6 mức `DueLevel` hiện có, nhãn product
   `DUE_LABEL` (`apps/web/src/data/contracts.ts`): Đã thu · Chưa tới · Gần hạn · Đến
   hạn · Quá hạn · Quá hạn lâu — "Đã thu" chỉ hợp cho tiền, mức xong của việc cần
   nhãn chung (canvas tạm dùng "Đã xong", CHƯA DUYỆT). Cùng màu pill, cho:
   việc tiếp theo, đợt thu, mốc triển khai, thời gian nằm ở một bậc quá giới hạn.
   Ngưỡng ngày khác nhau theo loại, nằm trong cấu hình (hiện là hằng số trong
   `packages/engines/src/contract-due.ts`).

## H · Thông báo — ĐÃ CHỐT

1. **Chỉ chuông trong app** — bỏ mail nội bộ (3 mail E4 hiện có: lead intake,
   opportunity opened, opportunity lost). Chuông có số chưa đọc, bấm mở đúng đối tượng.
2. **Bốn sự kiện bật chuông**: khách phản hồi (báo người giữ; lead còn ở pool thì
   báo trưởng phòng) · được giao (đối tượng, việc tiếp theo, vai người triển khai,
   nhận tạm từ người nghỉ) · đến hạn / quá hạn / quá hạn lâu của việc, đợt thu, mốc
   triển khai của tôi · lead mới vào pool (gộp theo đợt, không báo từng lead).

## I · Liên kết — ĐÃ CHỐT

1. **Hành trình nối theo cây**: mỗi hành trình mới nối về đúng MỘT hành trình
   trước; một hành trình sinh được NHIỀU hành trình sau chạy song song (vd gia hạn
   bản quyền + mở rộng xưởng 2). Màn công ty vẽ cây; ContextRail 1 chip trước, n chip sau.
2. Mặc định (không hỏi): ContextRail trên mọi màn chi tiết; một bộ sinh mã chung
   thay cho `NEXT_CODE` chép ở từng repository, thêm mã `BG-`.

## J · Tài liệu — ĐÃ CHỐT

1. **Mọi đối tượng có ngăn Tài liệu** để tải file lên; màn cha gộp tài liệu của
   con (như dòng hoạt động). **Báo giá: máy sinh PDF từ dòng hàng**, mỗi phiên bản
   một file. Hợp đồng đã ký, biên bản nghiệm thu, hoá đơn: tải bản đã ký/đã xuất lên.
2. **Đính kèm trong mail chỉ ở kiểu gửi nhóm**, chọn từ ngăn Tài liệu của đối
   tượng nguồn; mẫu "Báo giá" tự đính PDF bản mới nhất. Gửi loạt không đính kèm.

## K · Nhập/xuất — ĐÃ CHỐT (chọn cả bốn)

- **Xuất Excel từ mọi sổ**, đúng bộ lọc đang xem, trong phạm vi người dùng được thấy.
- **Nhập khách đang dùng**: hợp đồng cũ (công ty, loại, giá trị, ngày ký, trạng
  thái) → máy dựng sẵn hành trình ở đúng bậc (thường là Tăng trưởng).
- **Nhập công ty + liên hệ** riêng, không kèm lead.
- **Nhập thẳng vào list Nhóm chờ chăm sóc** kèm lý do dừng.
- Nhập lead, nhập cơ hội giữ như hiện tại.

## Còn để sau

- B · Quyền và F · Duyệt — chủ dự án: "tạm thời chưa làm tới".
- Năm luồng dọc (Lead · Cơ hội · Báo giá · Hợp đồng · Hành trình) — chuẩn sau
  khi luồng chung đã lên canvas.

## Canvas — hàng F đã dựng (27/09/2026, version 16)

Sáu board hàng F trên canvas (link ở đầu file): `F-Model` (luật chín luồng + hàng E
phải sửa + đổi gì so với code) · `F-Wait` (C, K) · `F-Mail` (A, J2 — dựng lại từ
`mas-mail-modal.tsx`, phần mới gắn badge "Mới") · `F-Handover` (D) · `F-Trail`
(E, G, H) · `F-Company` (I, J, K). Hàng E CHƯA sửa theo luồng chung — danh sách
chỗ phải sửa nằm trên `F-Model`.

Bốn điểm hở lộ ra khi dựng board đã vào `docs/decisions/open-questions.md`
#24–#27 (nhãn "xong" của thang hạn · gửi loạt với mẫu có file · lý do mang cờ
Không liên hệ · khách trả lời trên cơ hội/hợp đồng). Ghi chú thêm:

- Pool dùng chữ product "kho chung" / "Về kho" (`assign-menu.tsx`).
- F-Company có WS-0024 (LD-0205 đánh thức 25/09) là hành trình sau thứ hai của
  WS-0007; E-Main vẫn vẽ LD-0205 đang chờ và chỉ một hành trình sau.
