import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ObjectCode, WorkstreamBookQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { WorkstreamService } from './workstream.service'

/** `/sales/workstreams` — the journey book. Read only in this turn: no door
 *  here opens, edits or closes a run. */

/** BOTH DOORS ASK FOR `workstream.view`, ITS OWN KEY.
 *
 *  Not `lead.view`: a journey row prints the deal and contract codes of its
 *  run, and `marketing` holds `lead.view` WITHOUT `opportunity.view` — one
 *  shared key would hand deal codes out a side door. The key travels with
 *  `opportunity.view`, to the four roles holding it.
 *
 *  `KIND_DOMAIN.WS` is `'lead'` all the same: 0045 mints one run per lead and
 *  the scope axis cuts on that lead's `owner_id`, so the SQL fence and the E2
 *  grid ask one question, not two that can drift.
 *
 *  `scoped: true` on both: a seller marked `ownOnly` reads the runs their own
 *  leads opened. The book thins out and reports `hidden`; the profile refuses. */
@Controller('sales/workstreams')
export class WorkstreamController {
  constructor(private readonly runs: WorkstreamService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(WorkstreamBookQuery)) q: WorkstreamBookQuery) {
    return this.runs.book(who, q)
  }

  /** One journey, plus the object chain for ContextRail.
   *
   *  Declared AFTER the bare `@Get()` and carrying no static sibling, so there
   *  is no route to collide with — the ordering trap `opportunity.controller
   *  .ts` documents needs a fixed segment such as `scorecard`, and this book
   *  has none yet. `ObjectCode` is the first fence: a malformed code dies at
   *  `ZodPipe` naming the field instead of reaching a query. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.runs.profile(who, code)
  }
}
