import { Module } from '@nestjs/common'
import { registerConstraints } from '@api/platform/http/db-error'
import { CampaignModule } from './campaign/campaign.module'
import { SalesConfigModule } from './config/config.module'
import { CONTRACT_CONSTRAINTS } from './contract/contract.constraints'
import { LEAD_CONSTRAINTS } from './lead/lead.constraints'
import { LeadModule } from './lead/lead.module'
import { MEETING_CONSTRAINTS } from './meeting/meeting.constraints'
import { OPPORTUNITY_CONSTRAINTS } from './opportunity/opportunity.constraints'
import { OpportunityModule } from './opportunity/opportunity.module'
import { TOUCH_CONSTRAINTS } from './touch/touch.constraints'

/** Nhánh tự cắm sổ ràng buộc của mình vào bộ dịch lỗi cơ sở dữ liệu.
 *
 *  Cắm Ở ĐÂY chứ không để `platform/http/db-error.ts` đi đọc — nền không được
 *  biết nhánh nào tồn tại (`no-restricted-imports` ép, xem `eslint.config.js`).
 *  Chiều phụ thuộc chỉ có một: nhánh biết nền, nền không biết nhánh.
 *
 *  Chạy lúc file này được nạp, tức trong chuỗi `imports` của `AppModule`, tức
 *  trước khi máy chủ mở cổng — không có request nào thấy sổ còn trống. Module
 *  mới thêm đúng một dòng ở đây, không mở lại file dùng chung. */
registerConstraints(LEAD_CONSTRAINTS)
registerConstraints(OPPORTUNITY_CONSTRAINTS)
registerConstraints(CONTRACT_CONSTRAINTS)
registerConstraints(TOUCH_CONSTRAINTS)
registerConstraints(MEETING_CONSTRAINTS)

/** Nhánh Sales — sáu module, đối xứng với sáu mục nav bên `apps/web`.
 *
 *  Hai module còn lại (performance · kế hoạch) thêm vào đây theo đúng hình của
 *  `lead/`; `campaign/` vừa vào với nửa MAS mail của nó — sổ chiến dịch và tệp
 *  thành viên là những bộ bốn file tiếp theo trong cùng module đó, không phải
 *  module mới. Thứ tự dựng bám theo mục B của
 *  `docs/ban-giao-backend.md`: luật phải về đúng tầng trước, endpoint sau.
 *
 *  `config/` vào trước bốn cái kia có lý do: nó là chỗ sáu danh mục của nhánh
 *  thôi làm `z.enum` để thành dữ liệu người nhập, và bốn module còn lại đều đọc
 *  ít nhất một trong sáu danh mục đó.
 *
 *  Nhánh này không nhập gì từ `branches/supply`, `branches/factory`,
 *  `branches/finance` — eslint chặn, xem `eslint.config.js`. */
@Module({
  imports: [LeadModule, OpportunityModule, SalesConfigModule, CampaignModule],
  exports: [LeadModule, OpportunityModule, SalesConfigModule, CampaignModule],
})
export class SalesModule {}
