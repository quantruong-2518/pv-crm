import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { LeadController } from './lead.controller'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'

/** Module 2 · Sổ lead.
 *
 *  `imports: [EnginesModule]` là TƯỜNG MINH chứ không nhờ `@Global()`: đọc
 *  dòng này là biết module lead có hỏi E2. Đó là thứ đồ thị module phải nói
 *  được, và là lý do chỉ `ConfigModule`/`DbModule` được global.
 *
 *  `exports` cố tình chỉ có `LeadService`, KHÔNG có `LeadRepository`: module
 *  khác được hỏi "cho tôi sổ lead của người này", không được với thẳng vào
 *  bảng. Ngày nào cần tách service, thứ phải thay là một interface chứ không
 *  phải hai chục câu truy vấn rải khắp nơi. */
@Module({
  imports: [EnginesModule],
  controllers: [LeadController],
  providers: [LeadService, LeadRepository],
  exports: [LeadService],
})
export class LeadModule {}
