import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { CommRecordService } from './comm-record.service'
import { DebriefRepository } from './debrief.repository'
import { ThreadRepository } from './thread.repository'

/** The record opener and the two repositories under it, with no controllers.
 *
 *  Split out of `CommsModule` because that one is mounted once, through
 *  `withHook`, by the composition root: a branch that imported it again would
 *  register every `/comms` route twice. Importing this module instead hands a
 *  branch job (`meeting.end`) `CommRecordService` and nothing else. */
@Module({
  imports: [AuditModule],
  providers: [ThreadRepository, DebriefRepository, CommRecordService],
  exports: [ThreadRepository, DebriefRepository, CommRecordService],
})
export class CommRecordModule {}
