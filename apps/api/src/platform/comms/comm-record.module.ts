import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { StorageModule } from '../storage/storage.module'
import { CommRecordService } from './comm-record.service'
import { DebriefRepository } from './debrief.repository'
import { ThreadRepository } from './thread.repository'

/** The record opener and the two repositories under it, with no controllers.
 *
 *  Split out of `CommsModule` because that one is mounted once, through
 *  `withHook`, by the composition root: a branch that imported it again would
 *  register every `/comms` route twice. Importing this module instead hands a
 *  branch (the meeting book, which opens, moves and drops a booked meeting's
 *  record in its own transaction) `CommRecordService` and nothing else.
 *  `StorageModule` because a dropped booking removes its record's files. */
@Module({
  imports: [AuditModule, StorageModule],
  providers: [ThreadRepository, DebriefRepository, CommRecordService],
  exports: [ThreadRepository, DebriefRepository, CommRecordService],
})
export class CommRecordModule {}
