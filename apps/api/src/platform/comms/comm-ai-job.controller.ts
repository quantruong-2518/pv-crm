import { Controller, Delete, Get, HttpCode } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { Need } from '@api/platform/access/need.decorator'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { CommAiJobService } from './comm-ai-job.service'

/** `comms/ai-jobs` — the tray's side of the comm report's jobs (ADR 0135), on
 *  `comm.view` for the reason `DebriefController` gives. The rows are the caller's
 *  own and carry no customer content; the press and the form's read are on
 *  `DebriefController`, behind the record's gate. */
@Controller('comms/ai-jobs')
export class CommAiJobController {
  constructor(private readonly jobs: CommAiJobService) {}

  @Get()
  @Need({ permission: 'comm.view' })
  list(@CurrentActor() who: Actor) {
    return this.jobs.list(who)
  }

  @Delete()
  @HttpCode(204)
  @Need({ permission: 'comm.view' })
  dismissFinished(@CurrentActor() who: Actor) {
    return this.jobs.dismissFinished(who)
  }
}
