import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { COMM_DEBRIEF_HOOK, type CommDebriefHook } from '@api/platform/comms/comm-debrief.hook'
import { CommRecordService } from '@api/platform/comms/comm-record.service'
import { PvError } from '@api/platform/http/problem'
import type { MeetingEndHandler, MeetingEndJob } from '@api/platform/queue/meeting-jobs'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { MeetingRepository } from './meeting.repository'

/** What `worker.ts` runs when a meeting's end passes: an empty comm record on
 *  the meeting's lead, owned by whoever booked it (ADR 0075 §3).
 *
 *  The job carries the end it was scheduled for, not a snapshot of the meeting:
 *  the row is re-read here, so a reschedule or a delete is seen without anyone
 *  cancelling the old job. Re-running is safe — `CommRecordService.open` is
 *  idempotent per (meeting, owner). */
@Injectable()
export class MeetingEndJobs implements MeetingEndHandler {
  private readonly log = new Logger('meeting.end')

  constructor(
    private readonly repo: MeetingRepository,
    private readonly records: CommRecordService,
    private readonly actors: ActorRepository,
    /* The debrief hook is reached by token at run time: its module imports
       `LeadModule`, which imports this one, so a constructor injection is a cycle. */
    private readonly modules: ModuleRef,
  ) {}

  async handle(job: MeetingEndJob): Promise<void> {
    const row = await this.repo.byId(job.meetingId)
    const end = row ? meetingEndOf(row) : null
    /* Deleted, pre-`0050` without a duration, or stale after a reschedule. */
    if (!row || !end || end.getTime() !== new Date(job.endsAt).getTime()) return
    const owner = row.createdBy ? await this.actors.byId(row.createdBy) : null
    if (!owner) {
      this.log.warn(`Meeting ${row.id} has no known creator; no comm record opened`)
      return
    }
    const hook = this.modules.get<CommDebriefHook>(COMM_DEBRIEF_HOOK, { strict: false })
    /* A record its owner can never confirm would sit in their queue for ever. */
    if (!(await hook.slot(owner.actor, row.leadCode)).confirmable) {
      this.log.warn(`Meeting ${row.id}: ${owner.actor.id} cannot confirm on ${row.leadCode}`)
      return
    }
    const guest = (await this.repo.attendeesOf([row.id])).find((a) => a.contactCode !== null)
    const contactCode = guest?.contactCode ?? undefined
    /* Addresses on file let `open` mint a missing guest identity. */
    const person = await hook.contactOf(row.leadCode, contactCode)
    try {
      await this.records.open({
        channel: 'meeting',
        subjectCode: row.leadCode,
        ownerId: owner.actor.id,
        contactCode,
        addresses: person ? { phone: person.phone, email: person.email } : undefined,
        sameLead: person?.sameLead,
        meetingId: row.id,
        at: end,
      })
    } catch (error) {
      /* No address (400) or an address held elsewhere (409): retrying fixes neither. */
      if (!(error instanceof PvError && (error.kind === 'invalid' || error.kind === 'conflict'))) {
        throw error
      }
      this.log.warn(`Meeting ${row.id}: no comm record opened: ${error.message}`)
    }
  }
}

/** `at + duration`; null for a row booked before durations were recorded. */
export function meetingEndOf(row: { at: Date; durationMinutes: number | null }): Date | null {
  if (row.durationMinutes === null) return null
  return new Date(row.at.getTime() + row.durationMinutes * 60_000)
}
