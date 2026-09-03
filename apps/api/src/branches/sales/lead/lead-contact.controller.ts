import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ContactBookQuery, ContactPatch, MaObject } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ContactService } from '../contact/contact.service'
import { LeadService } from './lead.service'

/** `/sales/contacts/:code` — three endpoints about ONE contact.
 *
 *  ------------------------------------------------------------------
 *  WHY NOT FOLD THESE INTO `LeadController` UNDER `:code`
 *  ------------------------------------------------------------------
 *  The other two endpoints (`GET`/`POST /sales/leads/:code/contacts`) are
 *  about the WHOLE SET of contacts of one lead, so the lead code is
 *  naturally present. These three endpoints are about one specific person,
 *  and that person has their own code that gets read aloud — `CT-0391`.
 *  Forcing them through `/sales/leads/LD-0207/contacts/CT-0391` would force
 *  the caller to already know something they are trying to ask, and would
 *  leave a first-class object code unable to stand on its own. This
 *  decision is written down in `packages/contracts/src/sales/contact.ts`
 *  along with its cost.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS FILE LIVES IN `lead/` AND IS DECLARED BY `LeadModule`
 *  ------------------------------------------------------------------
 *  The cost just mentioned is that the scope axis has to resolve one more
 *  hop, and that hop is `LeadService.guardByContact` — the same fence the
 *  four meeting endpoints and the other two contact endpoints already use.
 *  Placing this controller inside `contact/` would require it to inject
 *  `LeadService`, but `LeadModule` already `imports: [ContactModule]` — a
 *  dependency cycle. Placing it here creates no cycle, and the question
 *  "who guards this" still has exactly one answer.
 *
 *  `ContactModule` therefore declares no `controllers` at all, the same as
 *  `MeetingModule`. */
@Controller('sales/contacts')
export class LeadContactController {
  constructor(
    private readonly leads: LeadService,
    /* The two READ endpoints call ContactService directly, not routed
       through LeadService: they have no lead code on the path to guard
       against, so there is nothing for `guard` to do — the scope axis lives
       inside the query itself. The three WRITE endpoints are the opposite,
       and still go through `LeadService.guardByContact`. */
    private readonly contacts: ContactService,
  ) {}

  /** The whole contact book. MUST come before `@Get(':code')`… if that
   *  endpoint existed — and it doesn't: a `CT-…` is read through
   *  `GET /sales/contacts/:code` right below, so the two routes never
   *  collide. Written out so whoever adds a third endpoint doesn't have to
   *  guess the order.
   *
   *  Scope is on, but this endpoint does NOT go through `LeadService.guard`:
   *  it has no code on the path to guard against. `ContactRepository.book`
   *  cuts by SQL, through lead — see the docblock there. */
  @Get()
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(ContactBookQuery)) q: ContactBookQuery) {
    return this.contacts.book(who, q)
  }

  @Get(':code')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.contacts.profile(who, code)
  }

  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  edit(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(ContactPatch)) body: ContactPatch,
  ) {
    return this.leads.contactEdit(who, code, body)
  }

  /** 204: nothing left to return once the delete is done. */
  @Delete(':code')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  drop(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.contactDrop(who, code)
  }

  /** Change the primary contact. `POST`, not `PATCH { isPrimary: true }` —
   *  the operation touches TWO rows (demote whoever holds it, promote this
   *  one) and only works in exactly one order, otherwise it dies on
   *  `contact_primary_uniq`. A `PATCH` looks like writing one row, which is
   *  exactly what the caller would assume. */
  @Post(':code/primary')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  primary(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.contactPrimary(who, code)
  }
}
