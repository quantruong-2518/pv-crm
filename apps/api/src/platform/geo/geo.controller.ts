import { Controller, Get, Query } from '@nestjs/common'
import { AddressPlaceQuery, AddressReverseQuery, AddressSuggestQuery } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { GeoService } from './geo.service'

/** `/geo` — the address picker's only door: type it, resolve a pick to a point,
 *  or read the address under a click on the map.
 *
 *  ONE ROUTE, ONE PERMISSION — three times over: each route declares `lead.edit`
 *  on Sales, the same door as typing a lead by hand. Whoever may write an address
 *  may be helped to spell it; no body can steer a route to a different key,
 *  because there is no body.
 *
 *  No `scoped`: the suggestions are public street names, owned by nobody, so
 *  a flag promising a per-owner cut would be a promise with no column behind it. */
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('address-suggest')
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  addressSuggest(
    @CurrentActor() who: Actor,
    @Query(zod(AddressSuggestQuery)) q: AddressSuggestQuery,
  ) {
    return this.geo.addressSuggest(who.id, q.q, q.focus)
  }

  @Get('place')
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  place(@CurrentActor() who: Actor, @Query(zod(AddressPlaceQuery)) q: AddressPlaceQuery) {
    return this.geo.place(who.id, q.refId)
  }

  @Get('reverse')
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  reverse(@CurrentActor() who: Actor, @Query(zod(AddressReverseQuery)) q: AddressReverseQuery) {
    return this.geo.reverse(who.id, q.lat, q.lng)
  }
}
