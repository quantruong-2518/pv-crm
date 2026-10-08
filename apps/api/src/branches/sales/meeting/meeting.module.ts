import { Module } from '@nestjs/common'
import { CommRecordModule } from '@api/platform/comms/comm-record.module'
import { GoogleModule } from '@api/platform/google/google.module'
import { SessionModule } from '@api/platform/session/session.module'
import { LeadStateModule } from '../lead/lead-state'
import { TouchModule } from '../touch/touch.module'
import { MeetingCalendar } from './meeting-calendar'
import { MeetingTodayController } from './meeting-today.controller'
import { MeetingRepository } from './meeting.repository'
import { MeetingService } from './meeting.service'

/** The meeting book — a Sales facility, not a screen module.
 *
 *  Its four per-subject doors live on `LeadController` and
 *  `OpportunityController` under `:code/meetings`, where the scope axis is on
 *  the path. The one controller here, `GET /sales/meetings/today`, reads only
 *  the caller's own meetings, so it needs no subject on its path.
 *
 *  `CommRecordModule` because booking opens the meeting's comm record in the
 *  same transaction; `SessionModule` for the booker's roles (the change fence);
 *  `GoogleModule` for the booker's calendar, written after that commit. */
@Module({
  imports: [TouchModule, LeadStateModule, CommRecordModule, SessionModule, GoogleModule],
  controllers: [MeetingTodayController],
  providers: [MeetingService, MeetingRepository, MeetingCalendar],
  exports: [MeetingService],
})
export class MeetingModule {}
