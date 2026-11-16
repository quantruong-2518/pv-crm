# Bàn giao: KPI đợt 3, đợt 4, bố cục theo vai, canvas v2 (16/11/2026)

Worktree `/home/quantruong/workspace/pv-crm-kpi-finish`, nhánh `kpi-finish`, HEAD `27b995c1` (2c + 2d đã commit,
chưa push). Mọi việc dưới đây **chưa commit**: khoảng 99 file sửa hoặc mới trong cây. `apps/api/.env` của worktree
cố ý để rỗng; không bao giờ trỏ nó vào Neon, không chạy reset hay seed.

## Đã xong (chưa commit)

- ADR 0159 (một mục KPI, ba thẻ Của tôi / Đơn vị của tôi / Toàn công ty, server quyết thẻ qua `GET :period/desk`).
  Chủ dự án duyệt canvas bằng "ok tiếp tục" ngày 16/11. ADR 0158 đã thêm các mặc định không phải của chủ dự án.
- Migration `0170_kpi_forecast_commit_and_one_on_one.sql`: dự báo tuần theo người và theo đơn vị, 1:1 cùng việc
  cần làm, kiểu chuông `kpi-one-on-one`, các key `kpi.score.grade-*`. Danh sách CHECK kiểu chuông có cả
  `assistant-brief` của nhánh `assistant-wave-2`, để merge theo thứ tự nào cũng không rơi kiểu chuông nào.
- API mới trong `apps/api/src/branches/sales/kpi/`:
  - kế hoạch và độ phủ: `kpi-plan.*`;
  - gợi ý số khi giao: `kpi-assignment-suggest.ts`;
  - dự báo tuần: `kpi-forecast-commit.*`, đường dẫn `:period/commit/me` và `:period/units/:unitId/commit`, vì
    `forecast/me` đã có chủ;
  - độ chính xác: `kpi-accuracy.ts`;
  - điểm: `kpi-score.ts` và `kpi-score.reader.ts`;
  - 1:1: `kpi-one-on-one.*`;
  - thẻ theo vai: `kpi-desk.*` và `kpi-company-desk.service.ts`;
  - xem theo năm: `kpi-year.controller.ts`.

  Tất cả đã đăng ký trong `kpi.module.ts`. API khởi động sạch trên một bản sao PGlite.

- Web:
  - menu còn một mục "KPI";
  - thanh ba thẻ: `components/kpi-tabs.tsx`;
  - các trang mới: `kpi-me-*`, `kpi-unit*`, `kpi-one-on-one*`;
  - viết lại `kpi-company*`;
  - thêm cột gợi ý trên `kpi-assign*`;
  - route mới `/sales/kpi/unit` và `/sales/kpi/one-on-one`.
- Đã soát ba lượt: đúng sai API (Opus), luật nghiệp vụ, Aurora. Danh sách lỗi đã giao cho hai agent sửa (mục dưới).

## Sửa lỗi soát: cả hai phía đã xong

Hai agent sửa lỗi soát đã báo xong trước khi đóng phiên. API: `pnpm typecheck:api` sạch, 0170 chạy hai lần sạch trên
bản sao PGlite. Có thêm `kpi-score-basis.ts`; `kpi-rules.ts` thêm `holdsSigned` và `monthEnded`. Việc đã giao:

1. **API: ĐÃ XONG.** Các việc đã làm:
   - khoá dự báo khi tháng hết hoặc đã chốt, từ chối chốt dự báo ở nút công ty;
   - bản tin sáng đếm 1:1;
   - điểm đọc dòng chỉ số cấp phòng (`actor_id IS NULL`);
   - bỏ hẳn setting `kpi.score.primary-weight-percent`;
   - thêm cột `score_basis jsonb` trên `kpi_month_close`, đóng băng danh mục và bậc xếp loại lúc chốt;
   - độ phủ = null cho tháng đã qua; đích đơn vị = null khi có người thiếu chỉ tiêu; kế hoạch = null khi không có
     chỉ tiêu;
   - độ chính xác chỉ lấy một dòng mỗi người;
   - khoá dòng 1:1 khi đánh dấu xong;
   - gom luật `holdsSigned` về một chỗ;
   - bổ sung ADR 0158.
2. **Web: ĐÃ XONG** (typecheck:web, i18n:check và eslint trên các file đã sửa đều sạch). Thêm
   `apps/web/src/lib/kpi-paths.ts` và `apps/web/src/lib/scroll.ts`. Các việc đã làm:
   - route `/sales/kpi/company` về `kpi.view` (ghế công ty bấm được thẻ);
   - bốn lỗi chặn Aurora;
   - cuộn trang theo reduced motion;
   - thẻ và nút quay lại của trang 1:1 chọn theo vai;
   - gom `MONTH_PARAM` và các đường dẫn KPI về `apps/web/src/lib/`;
   - sửa chữ trên màn;
   - bỏ ô trọng số chỉ số chính trên trang cấu hình.

Còn lại sau khi sửa:

- `KpiLeading.coverage.low` (`packages/contracts/src/sales/kpi-plan.ts`) chưa cho null. Tháng đã qua, kế hoạch
  gửi `low: false` thay vì null; cần sửa contract cho nullable.
- Thẻ Toàn công ty: `forecastCommitted` vẫn ra false cho tuần chưa bắt đầu, phải là null.
- Từ ngày 1 tới thứ Hai đầu tháng không có tuần nào ghi được dự báo, vì tuần thuộc tháng của ngày thứ Hai. Đây là
  hệ quả của quy tắc trong ADR 0158; cân nhắc có cần hỏi chủ dự án không.
- `KpiCloseService.close` ghi `score_basis` mới chỉ kiểm kiểu, chưa chạy thật lần nào.

Mở phiên mới: chạy `git status --short`, `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check` cho chắc, rồi vào bước 1.

## Bước tiếp theo, theo thứ tự

1. Chạy `pnpm check` đầy đủ, rồi **commit một điểm lưu** trên `kpi-finish`. Chưa push: push và ship cần chủ dự
   án.
2. Viết **ADR 0160**: canvas v2 cùng 8 quyết định chủ dự án chốt ngày 16/11 (mục dưới). Ghi thêm trong ADR:
   - ADR 0159 §6 sửa lại: có bảng xếp hạng toàn công ty theo % chỉ số chính;
   - câu nhận xét trên màn chỉ dựng từ mẫu câu trên số thật, không đọc như lời khuyên của AI.
3. Dựng canvas v2. Đọc lại canvas qua Artifact `read`:
   - URL: https://claude.ai/artifact/TPUpwR7Yv5Ci8gUMShbfW6
   - bản `1794792698-bd0e`; chủ dự án đã sửa MeSale, MeSimple, Company và Assign;
   - bản đọc ngày 16/11 nằm ở
     `/tmp/claude-1000/-home-quantruong-workspace-pebble-vina-pv-crm/39547078-6605-4323-ac93-30510a16003d/scratchpad/artifact-files/d5b11de6-c372-47f3-be9c-4faf4cd86bdf/project/`.
4. Chạy app thật, đăng nhập từng vai, chụp màn và làm trang trình bày cho chủ dự án. Phần này **đã hứa**.

## Quyết định canvas v2 của chủ dự án (16/11, không hỏi lại)

1. Thêm chỉ số mới ngay đợt này.
2. MQL tính cho người Marketing đưa lead về (`lead.marketing_owner_id`). Đếm lead lần đầu lên mức `mql` trong
   tháng, gồm cả lead tạo sẵn ở mức `mql`. Nâng, hạ rồi nâng lại không đếm lần hai.
3. Ngân sách Marketing tháng là một số cho mỗi đơn vị có người Marketing, do trưởng đơn vị hoặc cấp trên nhập.
   - Đã chi lấy từ `sales.source_cost` theo `spent_on`.
   - Chi phí mỗi MQL = chi phí các chiến dịch người đó phụ trách ÷ số MQL của họ.
4. Mục tiêu từng bước phễu đặt trong Thiết lập KPI, theo vai, đổi qua luồng duyệt. Không tính điểm; để trống thì
   không hiện mục tiêu.
5. Bỏ "chuẩn ngành": gỡ mọi dải chuẩn ngành và dòng nguồn khỏi bản dựng.
6. Thêm làn PRESALES trên cơ hội: mở rộng `OpportunityOwnerRole`, CHECK, cửa gán người và màn cơ hội.
   - Presales được tính đủ giá trị ký, không trừ phần của Sale.
   - Chỉ số chính mới của Presales là giá trị ký từ cơ hội mình làm giải pháp.
7. Thêm mốc "Đã gửi giải pháp" (thêm một giá trị vào loại touch). Thời gian gửi giải pháp = từ mốc khảo sát đầu
   tiên tới mốc này, lấy trung vị theo tháng.
8. Mỗi chỉ số một trọng số trong cấu hình vai, cộng đủ 100%.
   - Mặc định vẫn là chỉ số chính 50%, còn lại chia đều.
   - Đề xuất cũ đang chờ duyệt mà chưa có trọng số thì điền mặc định lúc duyệt.

## Bẫy phải nhắc trong mọi brief đợt v2

- **Mọi thay đổi danh mục chỉ số chỉ áp từ 2027-01**, dùng một hằng như `RAMP_FROM`. Tháng 12 đang được giao,
  hạn cấp công ty là 20/11, và bộ tháng 12 của Presales dựng trên `demos-joined`. Không ship gì đụng cửa giao chỉ
  tiêu trong 20–28/11.
- **Thêm key chỉ số mới phải làm đủ:**
  - nới cả bảy danh sách CHECK chỉ số (theo mẫu 0164);
  - thêm vào `KPI_METRIC_LABEL`, `KPI_METRIC_HOW`, `METRIC` và `METRIC_HOW` trong `apps/web/src/data/kpi-i18n.ts`;
  - viết SQL trong `metricSql` cho từng phạm vi, vì `hasMetricSql` sẽ từ chối bật chỉ số không có SQL;
  - phân loại cộng dồn được hay không, cho bước đối soát của ADR 0115.
- Làn Presales chạm module cơ hội: làm một gói riêng và soát riêng.

## Thứ tự ship (khi chủ dự án cho phép)

- Neon phải chạy theo đúng thứ tự 0167 → 0168 → 0169 (nhánh `assistant-wave-2`) → 0170 → 0171.
- Giá trị `when` trong journal phải tăng dần. Nếu 0170 lên trước 0169, drizzle bỏ qua 0169 mà không báo.
- Lên API trước web. Chưa màn nào được mở trên trình duyệt.

## Nợ còn ghi

- 2e (gỡ màn cũ) không làm trước 2027-01.
- Màn 2c/2d chưa ai mở trên trình duyệt.
- Trên PGlite, các probe chỉ kiểm nhánh roster (tháng trước 12/2026) với roster rỗng.
- Phần ghi chuyển chỉ tiêu (transfer) sau khi chốt tháng chưa soát.
- Xem theo năm gọi `kpi.me` 12 lần nối tiếp: chậm nhưng chấp nhận được.
