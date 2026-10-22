import {
  LEAD_ACTIVE_STATES,
  LeadState,
  type LeadBookQuery,
  type LeadFacets,
  type LeadStateFilter,
} from '@pv/contracts'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'

/** Module 2 · the lead book's state tabs, filter keys and header names, without JSX — split
 *  from `leads.tsx`.
 *
 *  `all` comes first, then the lead that became a deal, then the live groups.
 *  Each key is a `LeadStateFilter` value, so it goes onto the URL and the wire
 *  unchanged. The nurturing pool lives on its own page and shows here under
 *  `all` only (ADR 0109); the hold list has a tab (ADR 0097 §3): a held lead
 *  is counted in `held` and in no `byState` entry, so no lead is counted
 *  twice. Pinned and switched-off are toggles beside the search box, not tabs:
 *  they cut across the states. */

export type StateTab = 'active' | 'held' | 'converted' | 'all'

export const STATE_TABS: { key: StateTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'converted', label: LEAD_STATE_FACE.converted.label },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'held', label: 'Tạm hoãn' },
]

/** What a tab press writes. The pinned and switched-off toggles are left as
 *  they are. Off the active tab the state-list narrowing is dropped. */
export function tabPatch(value: string, states: string | undefined): Partial<LeadBookQuery> {
  return {
    state: value as LeadStateFilter,
    states: value === 'active' ? states : undefined,
    /* The held tab trades the created-date column for the hold's date. */
    ...(value === 'held' ? { createdFrom: undefined, createdTo: undefined } : {}),
  }
}

/** One tab's count; `undefined` while the facets are still on their way. */
export function tabCount(counts: LeadFacets | undefined, key: StateTab): number | undefined {
  if (!counts) return undefined
  const sumOf = (states: readonly LeadState[]) =>
    states.reduce((sum, state) => sum + (counts.byState[state] ?? 0), 0)
  if (key === 'active') return sumOf(LEAD_ACTIVE_STATES)
  if (key === 'held') return counts.held
  if (key === 'all') return sumOf(LeadState.options) + counts.held
  return counts.byState[key]
}

/** Which state tab the address lights. One open state picked by hand, or an
 *  old `open` link, lights `active`; the pool has no tab of its own, so an old
 *  `nurturing` link lights `all`. */
export function stateTabOf(state: LeadStateFilter): string {
  if (state === 'nurturing') return 'all'
  if (state === 'open' || isOpenState(state)) return 'active'
  return state
}

/** Filter axes that count as "dirty" and that "clear all" resets — every key a
 *  header or a shared link can set. Sort, paging and `disabled` are not among them. */
export const LEAD_FILTER_KEYS = [
  'campaign',
  'sourceKind',
  'motion',
  'origin',
  'createdBy',
  'states',
  'owner',
  'createdFrom',
  'createdTo',
  'state',
  'pinned',
  'label',
] as const

/** Header names double as filter titles, so the two can never disagree. */
export const LEAD_HEADER = {
  source: 'Nguồn lead',
  status: 'Trạng thái',
  created: 'Ngày tạo',
  creator: 'Người tạo',
  owner: 'Người phụ trách',
} as const
