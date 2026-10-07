import { Controller, Get } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { Need } from '@api/platform/access/need.decorator'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { MeetingService } from './meeting.service'

/** `GET /sales/meetings/today` — the home-screen nudge: the caller's next
 *  meeting today and how many follow (`MeetingTodayResponse`).
 *
 *  `comm.view`, as the contract states, and not `lead.view`: a booked meeting
 *  is the caller's own comm record, on a lead or a deal alike. Not `scoped` —
 *  the read is cut to the caller's own meetings (booker or host) in SQL, so
 *  there is no subject whose reach to ask. The day boundary is the service's.
 *  Accepted: a host sees a meeting they host even without reach on its subject. */
@Controller('sales/meetings')
export class MeetingTodayController {
  constructor(private readonly meetings: MeetingService) {}

  @Get('today')
  @Need({ branch: 'Sales', permission: 'comm.view' })
  today(@CurrentActor() who: Actor) {
    return this.meetings.today(who)
  }
}
