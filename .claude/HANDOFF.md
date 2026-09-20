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
