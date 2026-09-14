import { Module } from '@nestjs/common'
import { registerConstraints } from '../http/db-error'
import { APPROVAL_CONSTRAINTS } from './approval.constraints'
import { ApprovalController } from './approval.controller'
import { ApprovalRepository } from './approval.repository'
import { ApprovalAppliers, ApprovalService } from './approval.service'

/** E3's durable half — the tier every other pipeline stands on.
 *
 *  Exports the SERVICE and the applier registry, never the repository: the rule
 *  across this codebase is that another module may ASK, not reach into a table.
 *
 *  A branch that has something to approve imports this module, registers an
 *  applier for its own kind, and never learns what the rows look like. That is
 *  also why this module is imported by the branch modules that need it rather
 *  than listed in `app.module.ts`: nothing here is global, and a module that
 *  announces itself to the whole app invites a door to use it without saying
 *  so in its own imports. */
/* At module load, beside every other constraint book (`users.module.ts`,
   `sales.module.ts`). Without this line the table's refusals arrive as
   untranslated 500s and the book below is a file nothing reads. */
registerConstraints(APPROVAL_CONSTRAINTS)

@Module({
  controllers: [ApprovalController],
  providers: [ApprovalRepository, ApprovalService, ApprovalAppliers],
  exports: [ApprovalService, ApprovalAppliers],
})
export class ApprovalModule {}
