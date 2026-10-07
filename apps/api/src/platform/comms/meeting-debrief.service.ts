import { Inject, Injectable, Optional } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { DebriefView, MeetingDebriefClose } from '@pv/contracts'
import { conflict } from '@api/platform/http/problem'
import { COMM_DEBRIEF_HOOK, type CommDebriefHook } from './comm-debrief.hook'
import { DebriefService } from './debrief.service'

/** The "meeting held" close — `POST /comms/debriefs/:id/close-meeting`.
 *
 *  The ordinary confirm (`DebriefService.confirm`: summary, evaluation = the
 *  meeting's outcome, next step, one audit line) plus the branch marking the
 *  meeting held with who attended, in the SAME transaction: a record closed
 *  over a meeting still "scheduled" is the drift this door exists to prevent.
 *  The fence is `closable` — the owner or an outranking closer; the meeting's
 *  own refusals (not started, already held, deal stopped) are the branch's. */
@Injectable()
export class MeetingDebriefService {
  constructor(
    private readonly records: DebriefService,
    @Optional() @Inject(COMM_DEBRIEF_HOOK) private readonly hook?: CommDebriefHook,
  ) {}

  async close(who: Actor, id: string, body: MeetingDebriefClose): Promise<DebriefView> {
    const hook = this.hook
    if (!hook) throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; no meeting to mark held')
    const found = await this.records.closable(who, id)
    const meetingId = found.thread.channel === 'meeting' ? found.thread.externalId : null
    if (!meetingId || !found.row.booked) {
      throw conflict('Liên hệ này không phải một cuộc họp đã hẹn — dùng “Xác nhận”.')
    }
    return this.records.confirm(who, found, body, (tx) =>
      hook.meetingHeld(tx, who, {
        meetingId,
        subjectCode: found.row.subjectCode,
        ownerId: found.row.ownerId,
        hosts: body.hosts,
        guests: body.guests,
      }),
    )
  }
}
