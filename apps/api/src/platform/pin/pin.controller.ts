import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { PinListQuery, PinSetBody } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { PinService } from './pin.service'

/** `/pins` — the caller's own pins (contract: `pin.ts`).
 *
 *  `@Need({})`, "just be signed in", and the subject's view permission is
 *  checked in `PinService` — the `MasService.send` exception to ADR 0004,
 *  because the contract carries `subject` in the query/body, where a decorator
 *  cannot read it. Not `scoped`: the rows are the caller's by `actor_id`, and
 *  row reach on pinning is `PinReach`'s. */
@Controller('pins')
export class PinController {
  constructor(private readonly pins: PinService) {}

  @Get()
  @Need({})
  list(@CurrentActor() who: Actor, @Query(zod(PinListQuery)) q: PinListQuery) {
    return this.pins.list(who, q)
  }

  /** 200, not 201: an idempotent set, often nothing is created at all. */
  @Post()
  @HttpCode(200)
  @Need({})
  set(@CurrentActor() who: Actor, @Body(zod(PinSetBody)) body: PinSetBody) {
    return this.pins.set(who, body)
  }
}
