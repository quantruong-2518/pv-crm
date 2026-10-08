import { Body, Controller, Delete, Get, Header, HttpCode, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { SearchQuery, SearchRecentWrite } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { SearchService } from './search.service'

/** `/sales/search` — the box in the header, and the caller's own recent list.
 *
 *  `lead.view` is only the door: `SearchService` asks E2 again per kind and
 *  drops the kinds the caller may not view. Every route acts on the caller's
 *  rows alone; GETs are `no-store` because the answer depends on who asks. */
@Controller('sales/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  find(@CurrentActor() who: Actor, @Query(zod(SearchQuery)) q: SearchQuery) {
    return this.search.search(who, q)
  }

  @Get('recent')
  @Header('Cache-Control', 'private, no-store')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  recent(@CurrentActor() who: Actor) {
    return this.search.recent(who)
  }

  @Post('recent')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  record(@CurrentActor() who: Actor, @Body(zod(SearchRecentWrite)) body: SearchRecentWrite) {
    return this.search.record(who, body)
  }

  @Delete('recent')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  clear(@CurrentActor() who: Actor) {
    return this.search.clear(who)
  }
}
