import { Injectable } from '@nestjs/common'
import {
  ADDRESS_SUGGEST_MIN_CHARS,
  type AddressPlace,
  type AddressPlaceResult,
  type AddressSuggestResult,
  type AddressSuggestion,
} from '@pv/contracts'
import { GeoLimiter } from './geo.limiter'
import { TtlCache } from './ttl-cache'
import { VietmapAdapter } from './vietmap.adapter'

/** Address lookup — strings out, nothing in. No table: coordinates only steer
 *  the map behind the picker, and what the form keeps is the same two plain
 *  fields a lead has always had. The only state is the caches below.
 *
 *  Every call that would reach the provider costs quota, so the order is:
 *  cache, then a lookup already in flight, then the limiter, then upstream.
 *  An empty `q` is the probe the form sends before anyone types; it is
 *  answered without touching any of them. */

/** Chosen defaults, not spec. Street names barely change, so an hour is safe
 *  and turns "the same address typed by five people" into one call; 2.000
 *  entries is a few MB. A picked point never changes, so it lives the same. */
const CACHE_TTL_MS = 60 * 60_000
const CACHE_MAX_ENTRIES = 2_000

/** Where a query is ranked from when the caller has no point of its own: the
 *  centre of Ho Chi Minh City. A chosen default, not spec — Vietmap says to fall
 *  back to a city rather than send none. */
const DEFAULT_FOCUS = '10.7769,106.7009'

@Injectable()
export class GeoService {
  private readonly suggestions = new TtlCache<AddressSuggestion[]>(CACHE_TTL_MS, CACHE_MAX_ENTRIES)
  private readonly places = new TtlCache<AddressPlace>(CACHE_TTL_MS, CACHE_MAX_ENTRIES)
  private readonly inFlight = new Map<string, Promise<AddressSuggestion[] | null>>()

  constructor(
    private readonly vietmap: VietmapAdapter,
    private readonly limiter: GeoLimiter,
  ) {}

  async addressSuggest(actorId: string, q: string, focus?: string): Promise<AddressSuggestResult> {
    if (!this.vietmap.enabled) return { enabled: false, items: [] }

    // Two letters match half the country: upstream would bill a call whose
    // answer nobody can use. The probe (empty `q`) lands here too.
    if (normalise(q).length < ADDRESS_SUGGEST_MIN_CHARS) return { enabled: true, items: [] }

    const at = focus ?? DEFAULT_FOCUS
    const key = `${normalise(q)}@${roundFocus(at)}`
    const hit = this.suggestions.get(key)
    if (hit) return { enabled: true, items: hit }

    // Only a real answer is cached — an upstream blip must not stick for an
    // hour, and it degrades to "type it yourself" meanwhile.
    this.limiter.person(actorId, 'suggest')
    const items = await this.shared(key, () => {
      this.limiter.upstream()
      return this.vietmap.suggest(q.trim(), at)
    })
    if (items === null) return { enabled: true, items: [] }

    this.suggestions.set(key, items)
    return { enabled: true, items }
  }

  async place(actorId: string, refId: string): Promise<AddressPlaceResult> {
    if (!this.vietmap.enabled) return { place: null }

    const hit = this.places.get(refId)
    if (hit) return { place: hit }

    this.limiter.person(actorId, 'point')
    this.limiter.upstream()
    const place = await this.vietmap.place(refId)
    if (place) this.places.set(refId, place)
    return { place }
  }

  /** Not cached: two clicks are never the same pixel. */
  async reverse(actorId: string, lat: number, lng: number): Promise<AddressPlaceResult> {
    if (!this.vietmap.enabled) return { place: null }
    this.limiter.person(actorId, 'point')
    this.limiter.upstream()
    return { place: await this.vietmap.reverse(lat, lng) }
  }

  /** Two people typing the same street at once share one upstream call. The
   *  budget is spent inside `run`, so only the first of them is charged. */
  private shared(
    key: string,
    run: () => Promise<AddressSuggestion[] | null>,
  ): Promise<AddressSuggestion[] | null> {
    const running = this.inFlight.get(key)
    if (running) return running

    const started = Promise.resolve()
      .then(run)
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, started)
    return started
  }
}

/** One intent typed twice — trailing space, stray double space, shift key —
 *  is one cache key. Diacritics stay: they change what upstream returns. */
function normalise(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Two decimals is about a kilometre: panning inside it must not miss the cache. */
function roundFocus(focus: string): string {
  return focus
    .split(',')
    .map((n) => Number(n).toFixed(2))
    .join(',')
}
