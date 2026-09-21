import { Inject, Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { ADDRESS_SUGGEST_MAX_ITEMS, AddressPlace, AddressSuggestion, LEAD_MAX } from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'

/** The ONLY file that knows Vietmap. Three v4 endpoints. Autocomplete asks for
 *  `display_type=5` (post-2025 two-tier units on top, old variant in `data_old`,
 *  which is ignored) and always sends a `focus` — Vietmap's most impactful
 *  ranking input. Reverse stays on `display_type=1`: its docs do not list 5.
 *
 *  Every field is optional: a provider that adds or drops one must degrade to
 *  "no answer", never a 500. `display` is the full address down to the province
 *  (`address` is only house number + street), so `display` is what a lead stores.
 *
 *  The api key rides in the QUERY STRING: no log line here may carry the url. */
const AUTOCOMPLETE = 'https://maps.vietmap.vn/api/autocomplete/v4'
const PLACE = 'https://maps.vietmap.vn/api/place/v4'
const REVERSE = 'https://maps.vietmap.vn/api/reverse/v4'

/** A chosen default, not a Vietmap guarantee: a suggestion nobody waited for
 *  is worthless, so the picker gives up before the typist notices. */
const TIMEOUT_MS = 4_000

/** Vietmap's code for the province/city level of the boundary hierarchy. */
const PROVINCE_BOUNDARY_TYPE = 0

const Boundary = z.object({
  type: z.number().optional(),
  name: z.string().optional(),
  prefix: z.string().optional(),
  full_name: z.string().optional(),
})

/** One shape for both list endpoints: reverse items carry the same keys as
 *  autocomplete items plus their own coordinates, which this module ignores. */
const Item = z.object({
  ref_id: z.string().optional(),
  address: z.string().optional(),
  display: z.string().optional(),
  city: z.string().optional(),
  boundaries: z.array(Boundary).optional(),
})

/** Two accepted envelopes — the bare array the docs show, and a `data` wrapper. */
const ListBody = z.union([z.array(Item), z.object({ data: z.array(Item) })])

const PlaceItem = Item.extend({ lat: z.number().optional(), lng: z.number().optional() })

/** Wrapper FIRST: every key of a place is optional, so the bare shape would
 *  also swallow `{ data: ... }` and read an empty place out of it. */
const PlaceBody = z.union([z.object({ data: PlaceItem }), PlaceItem])

type Boundary = z.infer<typeof Boundary>
type Item = z.infer<typeof Item>

@Injectable()
export class VietmapAdapter {
  private readonly log = new Logger('geo')
  private readonly apiKey: string

  constructor(@Inject(ENV) env: Env) {
    this.apiKey = env.VIETMAP_API_KEY
  }

  /** No key = the picker is off everywhere; the form falls back to typing. */
  get enabled(): boolean {
    return this.apiKey.length > 0
  }

  /** `null` means "upstream did not answer usefully" — the caller turns that
   *  into an empty list, never into an error the user has to read. */
  async suggest(text: string, focus: string): Promise<AddressSuggestion[] | null> {
    const url = `${AUTOCOMPLETE}?apikey=${this.key}&text=${encodeURIComponent(text)}&focus=${encodeURIComponent(focus)}&display_type=5`
    const body = await this.get(url, 'autocomplete', ListBody)
    if (body === null) return null

    const items = Array.isArray(body) ? body : body.data
    return items.flatMap(toSuggestion).slice(0, ADDRESS_SUGGEST_MAX_ITEMS)
  }

  /** A suggestion's handle to its point. The refid is passed verbatim — it
   *  carries an `auto:` / `geocode:` prefix Place v4 needs. */
  async place(refId: string): Promise<AddressPlace | null> {
    const url = `${PLACE}?apikey=${this.key}&refid=${encodeURIComponent(refId)}`
    const body = await this.get(url, 'place', PlaceBody)
    if (body === null) return null

    const item = 'data' in body ? body.data : body
    return toPlace(item, item.lat, item.lng)
  }

  /** The address under a click. The point returned is the CLICK's, not the
   *  matched POI's: the marker must not jump away from the finger. */
  async reverse(lat: number, lng: number): Promise<AddressPlace | null> {
    const url = `${REVERSE}?apikey=${this.key}&lat=${lat}&lng=${lng}&display_type=1`
    const body = await this.get(url, 'reverse', ListBody)
    if (body === null) return null

    // Up to 10 places come back, nearest first; only the nearest is the click.
    const nearest = (Array.isArray(body) ? body : body.data)[0]
    return nearest ? toPlace(nearest, lat, lng) : null
  }

  private get key(): string {
    return encodeURIComponent(this.apiKey)
  }

  /** Exactly one warn per failed call, and none of them names the url. */
  private async get<T>(url: string, label: string, schema: z.ZodType<T>): Promise<T | null> {
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      this.log.warn(`[vietmap] ${label} unreachable — timeout or network error`)
      return null
    }

    if (!response.ok) {
      this.log.warn(`[vietmap] ${label} refused — status=${response.status}`)
      return null
    }

    const parsed = schema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) {
      this.log.warn(`[vietmap] ${label} answered an unexpected shape`)
      return null
    }
    return parsed.data
  }
}

/** No handle, no row: a suggestion the map cannot resolve to a point is a dead
 *  line in the list. The contract itself does the length check — over its cap
 *  the suggestion is DROPPED, never truncated, because half an address is a
 *  wrong address and picking one would fail the lead's own validator on save. */
function toSuggestion(item: Item): AddressSuggestion[] {
  const refId = item.ref_id?.trim() ?? ''
  const address = fullAddress(item)
  if (!refId || !address) return []

  const parsed = AddressSuggestion.safeParse({ refId, address, province: provinceOf(item) })
  return parsed.success ? [parsed.data] : []
}

/** Same drop-over-cap rule as a suggestion, for the same reason: the point of
 *  this dialog is an address the lead can keep. The contract also rejects an
 *  absent `lat`/`lng`, which is how "no coordinates, no place" is enforced. */
function toPlace(
  item: Item,
  lat: number | undefined,
  lng: number | undefined,
): AddressPlace | null {
  const address = fullAddress(item)
  const parsed = AddressPlace.safeParse({ lat, lng, address, province: provinceOf(item) })
  return parsed.success ? parsed.data : null
}

/** `display` is the whole string; `address` is house number + street only, so
 *  it is a fallback and not the first choice. */
function fullAddress(item: Item): string {
  return item.display?.trim() || item.address?.trim() || ''
}

/** `city` when the endpoint carries one (place v4 does), else the boundary
 *  hierarchy. Empty string when neither names a province — the caller stores
 *  it as typed text, so a missing province costs nothing downstream. */
function provinceOf(item: Item): string {
  const found = item.city?.trim() || fromBoundaries(item.boundaries ?? [])
  // An overlong province falls back to '': the address alone is still usable,
  // and dropping the whole row over the smaller of the two fields is worse.
  return found.length > LEAD_MAX.province ? '' : found
}

function fromBoundaries(boundaries: Boundary[]): string {
  const byType = boundaries.find((b) => b.type === PROVINCE_BOUNDARY_TYPE)
  const byPrefix = boundaries.find((b) => /^(tỉnh|thành phố)$/i.test(b.prefix?.trim() ?? ''))
  const found = byType ?? byPrefix
  return (found?.full_name ?? found?.name ?? '').trim()
}
