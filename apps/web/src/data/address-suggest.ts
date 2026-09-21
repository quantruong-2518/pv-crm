import { useEffect, useState } from 'react'
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import {
  ADDRESS_SUGGEST_MIN_CHARS,
  ADDRESS_SUGGEST_Q_MAX,
  AddressSuggestResult,
  type AddressSuggestion,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** The address picker's only door — `GET /geo/address-suggest`.
 *
 *      GET /geo/address-suggest?q=   `lead.edit`
 *
 *  NOTHING IS STORED BUT TEXT. A pick hands back the two strings a lead and a
 *  company already have columns for; no place id, no coordinates.
 *
 *  An empty `q` is the PROBE: the server answers `enabled` alone, and `false`
 *  when no provider key is configured, so the form knows before anyone types
 *  whether to offer a picker. A refusal is never a blocked form.
 *
 *  ONE PERMISSION EVERYWHERE — `lead.edit`. A role holding `account.edit` and
 *  not `lead.edit` is refused at the door and types the company form's address
 *  by hand, unexplained: a refusal about a spelling aid would be noise. */

/** The same words the route declares (`GeoController.addressSuggest`): whoever
 *  may type an address by hand may be helped to spell it. No `scoped` axis —
 *  street names belong to nobody. Shared with `address-place.ts`: the map is
 *  the same spelling aid drawn differently, so it is the same door. */
export const GEO_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

const SUGGEST_PATH = '/geo/address-suggest'
const SUGGEST_KEY = ['geo', 'address-suggest'] as const

/** Long enough that typing the same street twice is one request. It matches the
 *  server's cache from below; the words behind a street name do not move. */
const SEARCH_STALE_MS = 5 * 60 * 1000

/** One request per pause in typing. The floor under a search is the contract's
 *  (`ADDRESS_SUGGEST_MIN_CHARS`), so the box and the server agree on what is
 *  too short to be a street. */
const SEARCH_DELAY_MS = 300

/** Whether a provider key is configured cannot change while a tab is open, so
 *  the probe is asked once and held. */
const PROBE_STALE_MS = 30 * 60 * 1000

/** What a menu says when it has no rows. Shared with the map dialog, which
 *  runs the same search in a list of its own — two copies of a sentence are
 *  two sentences that will drift. Built from the contract's floor, so neither
 *  can promise a number the search does not use. */
export const SUGGEST_EMPTY_TEXT = 'Không thấy địa chỉ — thử gõ thêm số nhà, đường hoặc phường'
/** The search itself was refused or failed — most often the per-person or daily
 *  ceiling — and "not found" would send the typist hunting for a typo. */
export const SUGGEST_FAILED_TEXT = 'Tra cứu địa chỉ đang bận — bạn nhập tay giúp nhé'
export const SUGGEST_TOO_SHORT_TEXT = `Gõ ít nhất ${ADDRESS_SUGGEST_MIN_CHARS} ký tự để tìm địa chỉ`

/** `keepPreviousData` so the menu does not flash empty between keystrokes; no
 *  retry because a picker that cannot answer must fall silent, not hammer. */
export const addressSuggestQuery = (q: string, focus?: string) =>
  queryOptions({
    queryKey: [...SUGGEST_KEY, q, focus ?? ''] as const,
    queryFn: ({ signal }) =>
      api.read<AddressSuggestResult>(suggestUrl(q, focus), {
        need: GEO_NEED,
        schema: AddressSuggestResult,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: q === '' ? PROBE_STALE_MS : SEARCH_STALE_MS,
    retry: false,
  })

/** `focus` rides along only when there is one; the server ranks from a default
 *  city otherwise. */
const suggestUrl = (q: string, focus?: string) =>
  `${SUGGEST_PATH}?q=${encodeURIComponent(q)}${focus ? `&focus=${encodeURIComponent(focus)}` : ''}`

/** A point as the `lat,lng` string the endpoint takes. Three decimals is about
 *  a hundred metres: pan noise inside it must not become a new search. */
export const focusOf = (point: { lat: number; lng: number }) =>
  `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`

/** Mirrors a value after it stops changing. `lead-origin-pickers.tsx` keeps a
 *  hook of the same shape on a 250ms pause; this one waits 300ms and is its
 *  own, because the delay belongs to the endpoint being typed at — and a
 *  component file is the wrong place for a data-layer hook to reach into. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

export type AddressSuggestState = {
  /** Does this deployment have a picker at all? */
  enabled: boolean
  items: AddressSuggestion[]
  loading: boolean
  /** Nothing was searched for because what is typed is still too short — the
   *  menu says so instead of claiming the address does not exist. */
  tooShort: boolean
  /** The last search errored; the list is empty because of that, not because nothing matched. */
  failed: boolean
  /** The probe has not answered yet. The form draws the picker anyway: the
   *  answer is cached for the session, so swapping the control on the way IN
   *  would cost a remount on the one mount that asks. */
  probing: boolean
}

/** What the form asks: may I offer a picker, and what does it currently show.
 *
 *  FAILURE READS AS `enabled: false`, and so does a probe still in flight. A
 *  form that waits for an address service is a form nobody can fill in while
 *  the service is down, and the box underneath has always been plain text. */
export function useAddressSuggest(q: string, focus?: string): AddressSuggestState {
  const probe = useQuery(addressSuggestQuery(''))
  const enabled = probe.data?.enabled === true
  const probing = probe.data === undefined && probe.isFetching

  /* Cut to what the query contract accepts: a box wider than the endpoint
     would spend every keystroke past the ceiling earning a 400. */
  const typed = q.trim().slice(0, ADDRESS_SUGGEST_Q_MAX)
  const settled = useSettled(typed)
  const searching = enabled && settled.length >= ADDRESS_SUGGEST_MIN_CHARS
  const found = useQuery({ ...addressSuggestQuery(settled, focus), enabled: searching })

  /* Between the last keystroke and the debounce firing there is no request yet,
     but the menu should already say it is working. */
  const waiting = enabled && typed.length >= ADDRESS_SUGGEST_MIN_CHARS && settled !== typed

  return {
    enabled,
    items: searching ? (found.data?.items ?? []) : [],
    loading: probing || waiting || (searching && found.isFetching),
    tooShort: typed.length < ADDRESS_SUGGEST_MIN_CHARS,
    failed: searching && found.isError,
    probing,
  }
}
