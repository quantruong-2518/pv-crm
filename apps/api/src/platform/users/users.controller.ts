import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { UserCreate, UserPatch } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { UsersService } from './users.service'

/** `/users` — the people book, and the only door onto `platform.actor`.
 *
 *  Thin on purpose: receive, validate, call, answer. Everything worth reading
 *  about these four routes is either on the declaration lines — path,
 *  permission, body shape — or in `users.service.ts`, where the rules are.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION AND NO `branch` — THE ABSENCE IS THE DECISION
 *  ------------------------------------------------------------------
 *  `platform.actor` belongs to no product line. Sales reads it, Supply will
 *  read it, and neither owns it — the same reason the table lives in the
 *  `platform` schema rather than in `sales`, and the same reason its contract
 *  sits beside `problem.ts` instead of under `sales/`.
 *
 *  So there is no `branch` on any of these routes, and leaving it out is not an
 *  oversight to be tidied up later. `AccessNeed` reads `branch ?? ref?.branch ??
 *  null`, so an absent field turns the licence axis OFF, which is exactly the
 *  intent: hanging the people book off a Sales licence would shut this screen
 *  for a company that bought only Supply, and the person shut out is the one
 *  who opens accounts for everybody else — including the accounts that would be
 *  needed to fix it.
 *
 *  No `scoped` either. There is no owner column to cut the book by; every row
 *  IS a person. The roles that hold this permission see the whole book or none
 *  of it, and a flag claiming otherwise would be a promise the server cannot
 *  keep. `apps/web/src/data/users.ts` declares the identical `need` on its side
 *  of the wire, so a route and a query that drift apart are found by diffing
 *  two lines.
 *
 *  The permission itself is the widest one in E2 — whoever holds it can grant
 *  themselves every other permission by editing their own `roleId` — which is
 *  why only `giám-đốc` and `trưởng-phòng` have it. That reasoning lives beside
 *  the entry in `packages/engines/src/e2-access.ts` and is not repeated here.
 *  The two fences E2 cannot express, because they are about one specific row
 *  rather than about a role, are in the service: nobody edits their own role or
 *  their own lock, and the last enabled administrator cannot be removed.
 *
 *  Writing the key out on each route rather than hoisting it into a constant is
 *  what keeps `tsc` checking it: `Need` takes an `AccessNeed`, whose
 *  `permission` is the literal union `Permission`, so a tone mark in the wrong
 *  place is a red build here and on every other route in the server. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The whole book. No query, no paging — a company has as many accounts as it
   *  has employees, and the screen filters nothing. */
  @Get()
  @Need({ permission: 'người-dùng.quản-lý' })
  list() {
    return this.users.list()
  }

  /** The roster — who works here, for anybody with a live session.
   *
   *  ------------------------------------------------------------------
   *  `@Need({})` IS A DECLARATION, NOT A FORGOTTEN LINE
   *  ------------------------------------------------------------------
   *  An empty need means "a live session and nothing more": E2 reads no branch
   *  and no permission from it, so the only rail left is the one every route
   *  has — `check` refuses a null actor before it looks at anything else.
   *  `AccessGuard` fails CLOSED on a MISSING `@Need`, so this line is what
   *  separates a deliberate session-only door from an oversight, and
   *  `RouteAudit` would not let the server start without it.
   *
   *  Session-only is the right rail because of who has to read this list: the
   *  assign menu, the convert dialog and every owner select sit on screens a
   *  Sale and a BD live in, and none of them hold `người-dùng.quản-lý`. Gating
   *  the roster on that permission would mean the people who assign work are
   *  the only ones who cannot see who to assign it to.
   *
   *  Declared BEFORE `@Patch(':id')` and beside `@Get()` for the reason the
   *  lead and opportunity controllers state: a literal segment and a parameter
   *  segment on one resource are read together or not at all. Nothing here
   *  actually shadows — `users` has no `@Get(':id')` — and that is precisely
   *  why the ordering has to be a habit rather than a reaction. */
  @Get('directory')
  @Need({})
  directory() {
    return this.users.directory()
  }

  /** Open an account. 201 with the row, so the panel can show what it created
   *  without waiting for the list to come back.
   *
   *  `UserCreate` carries no password field and this route accepts none — the
   *  invite door below is the only way in. */
  @Post()
  @Need({ permission: 'người-dùng.quản-lý' })
  create(@CurrentActor() who: Actor, @Body(zod(UserCreate)) body: UserCreate) {
    return this.users.create(who, body)
  }

  /** Edit a person. Also the lock switch — `{ "disabled": true }` is one field
   *  of the same patch, because locking somebody is an edit to their row and a
   *  second endpoint would be a second place for the rules to be checked. */
  @Patch(':id')
  @Need({ permission: 'người-dùng.quản-lý' })
  patch(
    @CurrentActor() who: Actor,
    @Param('id') id: string,
    @Body(zod(UserPatch)) body: UserPatch,
  ) {
    return this.users.patch(who, id, body)
  }

  /** Send a set-password link. 200 and not 201: nothing addressable was
   *  created — the ticket behind it is deliberately not a resource anybody can
   *  fetch — and the answer is a receipt about a letter, not a location.
   *
   *  No body. Everything this needs is the person in the path and the machine's
   *  own mail configuration; a body would only invite somebody to pass an
   *  address, which is the account-takeover field `UserPatch` already refuses. */
  @Post(':id/invite')
  @HttpCode(200)
  @Need({ permission: 'người-dùng.quản-lý' })
  invite(@CurrentActor() who: Actor, @Param('id') id: string) {
    return this.users.invite(who, id)
  }
}
