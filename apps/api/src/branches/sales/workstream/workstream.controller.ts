import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ObjectCode, WorkstreamBookQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { invalid } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { WorkstreamService } from './workstream.service'

/** `/sales/workstreams` — the journey book. Read only in this turn: no door
 *  here opens, edits or closes a run. */

/** ALL THREE DOORS ASK FOR `workstream.view`, ITS OWN KEY.
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
 *  `scoped: true` on all three: a seller marked `ownOnly` reads the runs their
 *  own leads opened. The book thins out and reports `hidden`; the board counts
 *  the same thinned book; the profile refuses. */
/** The board asks the book's question MINUS paging and sorting, and it is cut
 *  out of the book's own schema rather than written again: a filter the two
 *  doors spell differently is a header counting a book the cards below it are
 *  no longer showing. */
const WorkstreamBoardQuery = WorkstreamBookQuery.pick({
  status: true,
  accountCode: true,
  q: true,
})
type WorkstreamBoardQuery = Pick<WorkstreamBookQuery, 'status' | 'accountCode' | 'q'>

@Controller('sales/workstreams')
export class WorkstreamController {
  constructor(private readonly runs: WorkstreamService) {}

  /** REFUSES `sort=lastContactedAt` instead of answering in another order.
   *
   *  The contract declares the key — the ladder names that rung — but the book
   *  has no column to sort it on (`RUNG_SQL`), and quietly serving `openedAt`
   *  is a page in the wrong order that nobody can see is wrong. The fence is
   *  here rather than in the contract because it is this DOOR's reach that is
   *  short, not the vocabulary that is wrong. */
  @Get()
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(WorkstreamBookQuery)) q: WorkstreamBookQuery) {
    if (q.sort === 'lastContactedAt') {
      throw invalid({ sort: ['Sổ chưa sắp được theo lần liên lạc gần nhất.'] })
    }
    return this.runs.book(who, q)
  }

  /** The board's column catalogue — counts only, one per column.
   *
   *  DECLARED BEFORE `@Get(':code')`, and that is not tidiness: Nest matches in
   *  declaration order, so the other way round `board` is read as a run code,
   *  `ObjectCode` refuses it, and the caller gets a 400 about a malformed code
   *  for a route that exists. The trap `opportunity.controller.ts` documents,
   *  now real here because this book finally has a fixed sibling segment. */
  @Get('board')
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  board(@CurrentActor() who: Actor, @Query(zod(WorkstreamBoardQuery)) q: WorkstreamBoardQuery) {
    return this.runs.board(who, q)
  }

  /** One journey, plus the object chain for ContextRail.
   *
   *  DECLARED LAST, after `board` — see that door for what reversing the two
   *  costs. `ObjectCode` is the first fence: a malformed code dies at `ZodPipe`
   *  naming the field instead of reaching a query. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.runs.profile(who, code)
  }
}
