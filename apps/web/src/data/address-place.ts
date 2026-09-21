import { queryOptions, useQuery } from '@tanstack/react-query'
import { AddressPlaceResult, type AddressPlace } from '@pv/contracts'
import { api } from '@/app/api'
import { GEO_NEED } from './address-suggest'

/** The map behind the address picker — two doors, one permission.
 *
 *      GET /geo/place?refId=       `lead.edit`
 *      GET /geo/reverse?lat=&lng=  `lead.edit`
 *
 *  STILL TWO STRINGS. `lat`/`lng` come back only to steer the map view; what
 *  the form keeps is `address` and `province` — the same pair a suggestion pick
 *  writes, and the only pair any table here has a column for.
 *
 *  `place: null` is a real answer, not a failure: the provider knows no address
 *  at that point, and the dialog says so instead of offering a blank to confirm. */

export type MapPoint = Pick<AddressPlace, 'lat' | 'lng'>

const PLACE_PATH = '/geo/place'
const REVERSE_PATH = '/geo/reverse'
const PLACE_KEY = ['geo', 'place'] as const
const REVERSE_KEY = ['geo', 'reverse'] as const

/** Where a handle sits, and what stands at a point, are facts about the world
 *  and not about this session — a dialog opened twice re-asks nothing. */
const PLACE_STALE_MS = 30 * 60 * 1000

/** The BROWSER key, and deliberately not the server's.
 *
 *  Tiles are fetched by the browser, so this one is in the bundle by design;
 *  the owner fences it to the deployed domains. The server key that signs
 *  `/geo/*` never leaves `apps/api`. Read here and nowhere else — a second
 *  reader is a second answer waiting to drift. */
export const VIETMAP_MAP_KEY = (
  (import.meta.env.VITE_VIETMAP_MAP_KEY as string | undefined) ?? ''
).trim()

/** No retry, like the suggest query: a picker that cannot answer falls silent
 *  and the boxes underneath stay typeable. */
const placeQuery = (refId: string) =>
  queryOptions({
    queryKey: [...PLACE_KEY, refId] as const,
    queryFn: ({ signal }) =>
      api.read<AddressPlaceResult>(`${PLACE_PATH}?refId=${encodeURIComponent(refId)}`, {
        need: GEO_NEED,
        schema: AddressPlaceResult,
        signal,
      }),
    staleTime: PLACE_STALE_MS,
    retry: false,
  })

const reverseQuery = (point: MapPoint) =>
  queryOptions({
    queryKey: [...REVERSE_KEY, point.lat, point.lng] as const,
    queryFn: ({ signal }) =>
      api.read<AddressPlaceResult>(`${REVERSE_PATH}?lat=${point.lat}&lng=${point.lng}`, {
        need: GEO_NEED,
        schema: AddressPlaceResult,
        signal,
      }),
    staleTime: PLACE_STALE_MS,
    retry: false,
  })

/** Where a suggestion sits on the map. `null` asks nothing. */
export function usePlaceByRef(refId: string | null) {
  return useQuery({ ...placeQuery(refId ?? ''), enabled: refId !== null })
}

/** What address stands under a tap on the map. `null` asks nothing. */
export function useAddressAtPoint(point: MapPoint | null) {
  return useQuery({
    ...reverseQuery(point ?? { lat: 0, lng: 0 }),
    enabled: point !== null,
  })
}
