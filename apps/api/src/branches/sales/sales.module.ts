import { Module } from '@nestjs/common'
import { LeadModule } from './lead/lead.module'

/** Nhánh Sales — sáu module, đối xứng với sáu mục nav bên `apps/web`.
 *
 *  Năm module còn lại (chiến dịch · cơ hội · performance · kế hoạch · cấu
 *  hình) thêm vào đây theo đúng hình của `lead/`. Thứ tự dựng bám theo mục B
 *  của `docs/ban-giao-backend.md`: luật phải về đúng tầng trước, endpoint sau.
 *
 *  Nhánh này không nhập gì từ `branches/supply`, `branches/factory`,
 *  `branches/finance` — eslint chặn, xem `eslint.config.js`. */
@Module({ imports: [LeadModule], exports: [LeadModule] })
export class SalesModule {}
