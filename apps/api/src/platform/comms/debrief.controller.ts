import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  CommAiJobBody,
  CommAiReportBody,
  CommRecordCreateBody,
  DebriefClose,
  DebriefEdit,
  DebriefId,
  DebriefListQuery,
  DebriefTargetQuery,
  MeetingDebriefClose,
  PendingDebriefQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { CommAiJobService } from './comm-ai-job.service'
import { CommReportService } from './comm-report.service'
import { DebriefService } from './debrief.service'
import { MeetingDebriefService } from './meeting-debrief.service'

/** Comm record doors (ADR 0074, 0075), all on `comm.view` for the reason
 *  `ThreadController` gives: `comm.view-content` cuts a field, not a request.
 *  No `scoped: true` either — the owner fence and the subject's reach are
 *  enforced in `DebriefService`, not by an `owner_id` cut a flag would promise.
 *  `target`, `pending`, `counts` and `ai-report` come before `:id` so they are not read as ids. */
@Controller('comms/debriefs')
export class DebriefController {
  constructor(
    private readonly debriefs: DebriefService,
    private readonly meetings: MeetingDebriefService,
    private readonly reports: CommReportService,
    private readonly aiJobs: CommAiJobService,
  ) {}

  @Post()
  @Need({ permission: 'comm.view' })
  create(@CurrentActor() who: Actor, @Body(zod(CommRecordCreateBody)) body: CommRecordCreateBody) {
    return this.debriefs.create(who, body)
  }

  @Get()
  @Need({ permission: 'comm.view' })
  list(@CurrentActor() who: Actor, @Query(zod(DebriefListQuery)) q: DebriefListQuery) {
    return this.debriefs.list(who, q)
  }

  @Get('target')
  @Need({ permission: 'comm.view' })
  target(@CurrentActor() who: Actor, @Query(zod(DebriefTargetQuery)) q: DebriefTargetQuery) {
    return this.debriefs.target(who, q)
  }

  @Get('pending')
  @Need({ permission: 'comm.view' })
  pending(@CurrentActor() who: Actor, @Query(zod(PendingDebriefQuery)) q: PendingDebriefQuery) {
    return this.debriefs.pending(who, q)
  }

  @Get('counts')
  @Need({ permission: 'comm.view' })
  counts(@CurrentActor() who: Actor) {
    return this.debriefs.counts(who)
  }

  /** Whether the AI report is on for this caller (ADR 0132), so the buttons stay
   *  hidden rather than refuse. `no-store`: it depends on who asks and on today's limit. */
  @Get('ai-report')
  @Header('Cache-Control', 'private, no-store')
  @Need({ permission: 'comm.view' })
  aiReportStatus(@CurrentActor() who: Actor) {
    return this.reports.status(who)
  }

  @Get(':id')
  @Need({ permission: 'comm.view' })
  one(@CurrentActor() who: Actor, @Param('id', zod(DebriefId)) id: string) {
    return this.debriefs.one(who, id)
  }

  /** 200, not 201: confirming changes a row that already exists. */
  @Post(':id/close')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  close(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(DebriefClose)) body: DebriefClose,
  ) {
    return this.debriefs.close(who, id, body)
  }

  /** The owner's edit of a confirmed record (ADR 0122); 200 for `close`'s reason.
   *  Owner only and a `done` record only — both fences are in the service. */
  @Post(':id/edit')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  edit(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(DebriefEdit)) body: DebriefEdit,
  ) {
    return this.debriefs.edit(who, id, body)
  }

  /** "Could not reach the customer": closes with no summary, so no body. Owner
   *  only and never a booked meeting — both fences are in the service. */
  @Post(':id/unreached')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  unreached(@CurrentActor() who: Actor, @Param('id', zod(DebriefId)) id: string) {
    return this.debriefs.unreached(who, id)
  }

  /** The "meeting held" close on a booked meeting's record; same gate, the fence is in the
   *  service (owner, or an outranking closer). 200 for `close`'s reason. */
  @Post(':id/close-meeting')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  closeMeeting(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(MeetingDebriefClose)) body: MeetingDebriefClose,
  ) {
    return this.meetings.close(who, id, body)
  }

  /** The AI report of an open record (ADR 0132): a proposal, nothing is stored, so
   *  200. The close gate and `comm.view-content` are in the service. */
  @Post(':id/ai-report')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  aiReport(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(CommAiReportBody)) body: CommAiReportBody,
  ) {
    return this.reports.report(who, id, body)
  }

  /** A report from a recording (ADR 0135): a job, so 202, and nothing to wait on.
   *  The same gate as `aiReport`, in the service. */
  @Post(':id/ai-report/job')
  @HttpCode(202)
  @Need({ permission: 'comm.view' })
  pressAiReportJob(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(CommAiJobBody)) body: CommAiJobBody,
  ) {
    return this.aiJobs.press(who, id, body)
  }

  /** The caller's latest job here, report included. `no-store` for `ai-report`'s reason. */
  @Get(':id/ai-report/job')
  @Header('Cache-Control', 'private, no-store')
  @Need({ permission: 'comm.view' })
  currentAiReportJob(@CurrentActor() who: Actor, @Param('id', zod(DebriefId)) id: string) {
    return this.aiJobs.current(who, id)
  }
}
