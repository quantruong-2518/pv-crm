import { LEAD_ACTIVE_STATES, LeadState, type LeadFacets, type LeadStateFilter } from '@pv/contracts'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'

/** Module 2 · the lead book's state tabs, without JSX — split from `leads.tsx`.
 *
 *  `active` is the default because the book is a work list; a dropped lead is
 *  still one tab away, since that is where "why did we lose it" is answered.
 *  Each key is a `LeadStateFilter` value, so it goes onto the URL and the wire
 *  unchanged. The waiting group and the hold list have tabs of their own (ADR
 *  0097 §3): a held lead is counted in `held` and in no `byState` entry, so
 *  no lead is counted twice. Narrowing to one other open state is the state
 *  filter in the column header, not another tab. */

export type StateTab = 'active' | 'nurturing' | 'held' | 'converted' | 'disqualified' | 'all'

export const STATE_TABS: { key: StateTab; label: string }[] = [
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'nurturing', label: LEAD_STATE_FACE.nurturing.label },
  { key: 'held', label: 'Tạm hoãn' },
  { key: 'converted', label: LEAD_STATE_FACE.converted.label },
  { key: 'disqualified', label: LEAD_STATE_FACE.disqualified.label },
  { key: 'all', label: 'Tất cả' },
]

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
 *  old `open` link, lights `active` — the waiting group is a tab of its own. */
export function stateTabOf(state: LeadStateFilter): string {
  if (state === 'open' || (state !== 'nurturing' && isOpenState(state))) return 'active'
  return state
}
