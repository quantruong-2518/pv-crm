import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { MailModule } from '@api/platform/mail/mail.module'
import { MAIL_COMPOSER } from '@api/platform/queue/mail-composer'
import { LeadController } from './lead.controller'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'
import { LeadIntakeController } from './lead-intake.controller'
import { LeadIntakeGuard } from './lead-intake.guard'
import { LeadIntakeRepository } from './lead-intake.repository'
import { LeadIntakeService } from './lead-intake.service'
import { LeadMailComposer } from './lead-mail.composer'

/** Module 2 · Sổ lead.
 *
 *  `imports: [EnginesModule]` là TƯỜNG MINH chứ không nhờ `@Global()`: đọc
 *  dòng này là biết module lead có hỏi E2. Đó là thứ đồ thị module phải nói
 *  được, và là lý do chỉ `ConfigModule`/`DbModule` được global.
 *
 *  `GraphModule` joined the list the day this module gained a write door, and
 *  for one hard reason: `sales.lead.code` is a foreign key into
 *  `platform.object(code)`, so nothing can create a lead without first writing
 *  the mirror row that `ObjectMirror` owns. It is not an optional enrichment
 *  the service may remember — Postgres refuses the insert without it. Reading
 *  this line is how the next person learns that creating a lead touches the
 *  object graph.
 *
 *  `MailModule` joins for the same kind of reason, one level softer: accepting
 *  a lead from the landing page must also promise someone will be told, and
 *  that promise is a row written inside the SAME transaction as the lead
 *  (`lead-intake.service.ts#notify`). What this module gets from it is exactly
 *  one narrow token, `MAIL_ENQUEUE` — the write side. It does not get the
 *  ledger, the provider, or the queue: a branch may say "a mail is owed", it
 *  may not say "send this now".
 *
 *  `exports` cố tình chỉ có `LeadService`, KHÔNG có `LeadRepository`: module
 *  khác được hỏi "cho tôi sổ lead của người này", không được với thẳng vào
 *  bảng. Ngày nào cần tách service, thứ phải thay là một interface chứ không
 *  phải hai chục câu truy vấn rải khắp nơi. `LeadWriteService` stays inside for
 *  the same reason: another branch may ask for leads, it does not get to make
 *  them. */
@Module({
  imports: [EnginesModule, GraphModule, MailModule],
  controllers: [LeadController, LeadIntakeController],
  providers: [
    LeadService,
    LeadRepository,
    LeadWriteService,
    LeadWriteRepository,
    LeadIntakeService,
    LeadIntakeRepository,
    LeadIntakeGuard,
    /* The worker asks for a body through `MAIL_COMPOSER` and gets this one.
       Exported because the process that consumes the queue builds its DI tree
       from `worker.ts`, not from here — see the note in that file. */
    LeadMailComposer,
    { provide: MAIL_COMPOSER, useExisting: LeadMailComposer },
  ],
  exports: [LeadService, MAIL_COMPOSER],
})
export class LeadModule {}
