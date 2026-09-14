import { Module, type OnModuleInit } from '@nestjs/common'
import { ApprovalModule } from '@api/platform/approval/approval.module'
import { ApprovalAppliers } from '@api/platform/approval/approval.service'
import { SalesConfigController } from './config.controller'
import { SalesConfigGate, SalesConfigGateE3 } from './config.approval'
import { SalesConfigRepository } from './config.repository'
import { SalesConfigService } from './config.service'

/** Module 6 · Cấu hình danh mục Sales.
 *
 *  ------------------------------------------------------------------
 *  TÊN LỚP MANG TIỀN TỐ `SalesConfig`, KHÔNG PHẢI `Config`
 *  ------------------------------------------------------------------
 *  `platform/config/` đã có một `ConfigModule` — biến môi trường. Hai lớp trùng
 *  tên trong cùng một đồ thị DI là một thông báo lỗi của Nest chỉ vào nhầm chỗ
 *  vào đúng lúc người ta đang vội. Tên file giữ nguyên quy ước
 *  `<tính-năng>.<vai>.ts` của repo; chỉ tên lớp dài thêm hai âm.
 *
 *  ------------------------------------------------------------------
 *  `imports: [ApprovalModule]` — THE TIER THIS MODULE STANDS ON
 *  ------------------------------------------------------------------
 *  This module needs **E3**, not E2 the way the lead module does: a config row
 *  stands in nobody's name, so there is no scope axis to cut. E3's durable half
 *  lives in `platform/approval`, and this module asks it for two things —
 *  a chain resolved from roles, and a place to put the request.
 *
 *  `EnginesModule` is still absent, and that is still right: it hands out
 *  engine instances, and the in-memory `createApprovalEngine()` is exactly what
 *  a server must not use as its store (one deploy, every pending request gone).
 *  The law E3 carries is shared as pure functions instead — see
 *  `ApprovalService`.
 *
 *  `onModuleInit` registers this branch as the applier for `config-change`.
 *  Registration rather than a `switch` in `platform` is what keeps the platform
 *  from importing a branch, which `eslint.config.js` refuses outright.
 *
 *  `exports` cố tình chỉ có `SalesConfigService`: module khác được hỏi "danh
 *  mục có những gì", không được với thẳng vào bảng. Sổ lead sẽ cần đúng thế để
 *  đổi mã sang nhãn. */
@Module({
  imports: [ApprovalModule],
  controllers: [SalesConfigController],
  providers: [
    SalesConfigService,
    SalesConfigRepository,
    { provide: SalesConfigGate, useClass: SalesConfigGateE3 },
  ],
  exports: [SalesConfigService],
})
export class SalesConfigModule implements OnModuleInit {
  constructor(
    private readonly appliers: ApprovalAppliers,
    private readonly config: SalesConfigService,
  ) {}

  onModuleInit(): void {
    this.appliers.register('config-change', this.config)
  }
}
