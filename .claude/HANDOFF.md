# Handoff — phễu bán hàng (17/09/2026)

Hai commit: `c925084` (ADR 0057, ký qua duyệt, rời phễu, cổng stage) và commit
ngay sau nó (sửa tiền đơn đã ký cần `opportunity.close`, chặn tự duyệt ký).
Quyết định nằm ở `docs/decisions/0057-seven-sales-pipeline-decisions.md`. File
này chỉ giữ việc CÒN THIẾU — xong mục nào thì xoá dòng đó.

## Production

- **API chưa có commit thứ hai.** Fly đang chạy v58 = `c925084`. Commit sau
  (quyền `opportunity.close`, chặn tự duyệt) chưa deploy, không cần migration.
  Đừng `pnpm fly:deploy` từ cây đang có việc dở của phiên khác — Fly build từ
  thư mục local. Deploy từ `git worktree` sạch của master, hoặc chờ cây sạch.
- **Web trên Vercel chưa xác nhận.** Máy này không có `gh`, Vercel CLI chưa
  đăng nhập. Mở dashboard, xem có bản build cho hai commit trên không.
- **Chưa smoke test production:** gửi đề nghị ký → giám đốc duyệt → hợp đồng
  sinh; rời phễu rồi mở lại một lead; sửa tiền đơn đã ký → hợp đồng đổi theo.
- Cổng stage đã bị bỏ hẳn (ADR 0060) — không còn cổng nào để chặn chuyển
  stage hay ký hợp đồng, ngoài quyền/scope/E3 như mọi cửa ghi khác.

- **Commit `bf0a667` (Drawer mức xl, nạp lead) đã rơi khỏi lịch sử master** do
  một lần `update-ref` không so-và-đổi của phiên khác. Object vẫn còn trong
  reflog; ba file của nó vẫn đang sửa dở trong cây làm việc. Người quyết khôi
  phục — đừng gộp vào commit khác.

## Chưa kiểm

- Chưa ai mở các màn đã sửa trên trình duyệt. Người phải nhìn (luật 13): nhãn
  vàng "Còn thiếu" / "Chờ duyệt ký" ở theme stone; nút toolbar trên tablet.
- Khoá hàng chống đua (sửa đơn ↔ duyệt ký, rời phễu ↔ tạo đơn) chưa thử dưới
  tải đồng thời thật — chỉ thử tuần tự trên PGlite.
- Luồng đầu-cuối có seed chưa chạy: hook `tools/scripts/guard-db.mjs` chặn agent
  seed. Người tự seed vào một thư mục PGlite riêng (xem `apps/api/CLAUDE.md`).

## Nợ đã biết (chưa ai nhận)

- `packages/ui`: tone warning của Badge/MetaPill dưới 4.5:1 ở theme stone; nút
  `size="md"` (40px) trên toolbar hồ sơ lead/cơ hội và chân drawer, tablet cần 48px.
- Màn cấu hình còn ô hạn cho thang TIER (0057 §4 hoãn hạn ngoài 5 stage); không
  xoá được hạn đã đặt về "không hạn"; không có ô đổi tên stage/tier.
- `ContractSignResponse` trong `packages/contracts/src/sales/contract.ts` không
  còn ai dùng. `OPPORTUNITY_WRITE_NEED` ở web thiếu `scoped`.
- `OpportunityRepository.lockDeal` đọc thẳng bảng `platform.approval` vì
  `ApprovalService.pendingOn` không nhận transaction handle.
- Người gửi đề nghị ký bị gỡ khỏi đơn trước khi duyệt vẫn được ghi là người ký.
- Sửa trường thường của cơ hội không để lại vết touch/audit.
- Vai không có `config.view` thấy khoá lý do rời phễu thay vì nhãn ở timeline.
- `apps/web/src/data/performance.ts` và `apps/web/src/data/plan.ts` còn đọc nhãn
  lý do rời phễu từ fixture.
- Lệch ADR từ đợt audit, chưa quyết: 0032 (bảng 3 cột, code vẫn 5); câu hỏi mở
  Q4/Q5/Q7 bị code tự chọn đáp án; làn Account "Đã mua" chỉ tính lượt hiện tại;
  `apps/api/src/branches/sales/config/config.repository.ts` còn định nghĩa "đã ký" cũ.
- `CLAUDE.md` gốc còn ghi repo nằm trong WSL — máy hiện tại là macOS.

---

# Kanban hành trình — bàn giao (21/09/2026)

Kế hoạch 20/09 đã thi công xong; phần thiết kế code nói rồi, file này chỉ giữ
việc CÒN THIẾU — xong mục nào thì xoá dòng đó. Quyết định của lượt nằm ở
`docs/decisions/0062-workstream-stand-is-a-stored-column.md`.

## Đã xong

- Contract mở rộng: `standKind`/`standKey`, `contact`, `priority`, cột board.
- Thang ưu tiên khai ở `packages/engines/src/workstream-priority.ts`, có test cạnh nó.
- Migration `apps/api/drizzle/0056_workstream_stand.sql` — cột `stand_*`, hàm, trigger.
- Door board + lọc/đếm theo cột + biểu thức `stand` cắt lại theo người đọc.
- Màn `apps/web/src/pages/workstreams-board.tsx` + `-parts.tsx`, công tắc `?view=kanban`.
- ADR 0062. Glyph `Kanban` vào `packages/ui/src/icons.ts`. `CLOSE_REASON_LABEL`
  chuyển về `@pv/contracts`, web chỉ re-export.

## Chưa chạy, chưa ai nhìn

- **`pnpm db:migrate` chưa chạy ở máy.** `apps/api/.pglite` chưa có `0056`, nên
  sổ hành trình trên API cục bộ (4123) đang 500. Mọi phép chứng minh của lượt
  này chạy trên một bản sao trong scratchpad, không phải trên DB của repo.
- **Thứ tự ship**: `0056` lên Neon TRƯỚC khi deploy API, rồi mới đẩy web.
  Migration không re-runnable (`CREATE FUNCTION`, không `OR REPLACE`).
- **Chưa ai mở màn trên trình duyệt**, kể cả ở theme Đá mịn. Người phải nhìn:
  chip HĐ và OP lúc chạm/rê (số đo lúc nghỉ đạt, hover đã sửa nhưng chưa ai
  thấy); cột "chưa dựng" có tách khỏi nền ở Đá mịn không; `clipPath` của thẻ
  bước có cắt vùng bấm ở hai mép không; rail sáu bước ở 768px và 360px; mũi tam
  giác dưới bước đang xem có bị `overflow-x-auto` cắt không; dải bóng inset đáy
  cột đè lên chữ thẻ cuối; bấm đổi view rồi Tab xem focus rơi đâu.

## Nợ của lượt này (chưa ai nhận)

- `sort=lastContactedAt` trả **400, không phải 422**. Door từ chối đúng (thân có
  `errors.sort`), nhưng 422 cần một `ProblemKind` mới ở `packages/contracts` và
  một hàm xưởng ở `apps/api/src/platform/http/problem.ts` — `STATUS_OF` dịch
  kind → status nên không truyền tay status trong một nhánh được.
- `standKind` mang giá trị `'HĐ'` đi vào URL và access log
  (`?standKind=H%C4%90`). Nợ của ADR 0012, cố ý không sửa lượt này: thêm một
  khoá ASCII song song là đẻ ra chính tả thứ hai.
- **Thang ưu tiên còn hai bậc chưa có cột** — `waitingOverdue` và
  `lastContactedAt` (lý do ở ADR 0062 §5). `sort=priority` hiện là: hạn của rung
  (ngày lịch) → mở lâu nhất.
- **`hidden` là một con số trộn hai phép cắt** — nửa SQL tính trên cả sổ, nửa E2
  tính trên riêng trang đó (`apps/api/src/branches/sales/workstream/workstream.service.ts:79`).
  Vì thế chân cột chỉ in một câu, không in số. Door tách được hai nửa thì con số
  quay lại ngay, màn đã giữ đủ mọi trang.
- Cặp ordinal ladder tồn tại hai bản (SQL và TS) — xem ADR 0062.
- CHECK của `stand_key` nhận đủ tám `LeadState`, trigger chỉ ghi năm bậc xương
  sống. Nêu rồi, chưa quyết siết hay không.
- Thẻ đã rơi về rung lead vẫn in `overdueBy` của cái hạn mà người đọc không
  thấy. Cố ý: số trên thẻ đúng bằng số máy chủ dùng để sắp. Muốn giấu thì phải
  giấu ở cả `ORDER BY`, tức thêm một `CASE` nữa — chưa quyết.
- Chip OP màu hổ phách, canvas vẽ teal. Aurora không có cặp token teal cho chữ,
  và luật cấm bịa hex. Chủ dự án chốt giữ hổ phách — **code là bản đúng**, đừng
  ai "sửa lại cho khớp canvas".
- Đã hoãn ở web: dời `ViewSwitch` sang `components/`; nút thử lại ở lỗi mức cột;
  `COLUMN_PAGE_SIZE = 20` khai ở web chứ chưa khai cạnh `PageQuery`.

## Không phải của lượt này, nhưng lượt này nhìn thấy

- Một deal không có dòng `opportunity_owner` nào thì E2 cho qua trong khi
  `OpportunityRepository.scopeOf` vẫn giấu nó — hai định nghĩa "đơn của tôi" nói
  ngược nhau, và bên cho qua là bên fail-open.
- `footprint` đếm qua mọi object của run, kể cả deal đã bị cắt.
- Nợ token của cả hệ: `bg-primary` + `text-primary-foreground` đo 4,46:1 ở theme
  Aurora — dưới ngưỡng cho chữ nhỏ. Không phải của màn này, nhưng màn này chạm
  vào nó ở badge số của bước đang xem.

## Chi phí ghi, để người vận hành biết

Sửa một hạn ở màn cấu hình làm mọi run đang đứng ở rung đó tính lại — tuyến tính
theo kích thước sổ, đo được ~0,12 ms mỗi run trên PGlite/WASM, nằm trong chính
request lưu cấu hình. Đọc như một tỉ lệ, không phải độ trễ Neon.
