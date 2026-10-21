import { useQuery } from '@tanstack/react-query'
import {
  LEAD_ACTIVE_STATES,
  LEAD_STATE_LABEL,
  LEAD_STOP_REASON_OTHER,
  LeadState,
  type LeadBookQuery,
  type LeadFacets,
  type LeadStateFilter,
} from '@pv/contracts'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'
import { leadStopReasonsQuery } from '@/data/leads'
import { stopReasonLabel } from '@/data/sales-config'
import { dayRangeChip, listChip, type ActiveFilter } from '@/components/active-filters'

/** Module 2 · the lead book's state tabs and filter chips, without JSX — split
 *  from `leads.tsx`.
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

/** The pinned tab's value — `pinned=true` on the URL across every state, not a state. */
export const PINNED = 'pinned'

/** The switched-off tab's value — `disabled=true` on the URL, not a state. */
export const DISABLED = 'disabled'

/** What a tab press writes. The pinned and switched-off tabs REPLACE the state
 *  filter: pins span every state. Off the active tab the state-list filter is
 *  hidden, so it is dropped; off the stopped tabs, so is the exit narrowing,
 *  which would only empty them. */
export function tabPatch(value: string, states: string | undefined): Partial<LeadBookQuery> {
  const exit =
    value === 'disqualified' || value === 'all'
      ? {}
      : { exitReason: undefined, exitedFrom: undefined, exitedTo: undefined }
  if (value === PINNED)
    return { ...exit, pinned: true, state: 'all', states: undefined, disabled: undefined }
  if (value === DISABLED)
    return {
      ...exit,
      disabled: true,
      state: DEFAULT_LEAD_BOOK_QUERY.state,
      states: undefined,
      pinned: undefined,
    }
  return {
    ...exit,
    state: value as LeadStateFilter,
    states: value === 'active' ? states : undefined,
    disabled: undefined,
    pinned: undefined,
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
 *  old `open` link, lights `active` — the waiting group is a tab of its own. */
export function stateTabOf(state: LeadStateFilter): string {
  if (state === 'open' || (state !== 'nurturing' && isOpenState(state))) return 'active'
  return state
}

/** The book's narrowings a column dot alone would hide — the ones an overview
 *  link sets. A stop reason not yet loaded, or unknown, shows its axis only:
 *  never the bare id. */
export function useLeadFilterChips(
  query: LeadBookQuery,
  patch: (next: Partial<LeadBookQuery>) => void,
): ActiveFilter[] {
  const other = query.exitReason === LEAD_STOP_REASON_OTHER
  const { data: reasons } = useQuery({
    ...leadStopReasonsQuery,
    enabled: query.exitReason !== undefined && !other,
  })
  const reasonName = (reasons || other) && stopReasonLabel(reasons?.rows, query.exitReason)
  const stateName = (s: string) => {
    const parsed = LeadState.safeParse(s)
    return parsed.success ? LEAD_STATE_LABEL[parsed.data] : s
  }
  return [
    ...listChip('states', 'Trạng thái', query.states, stateName, () =>
      patch({ states: undefined }),
    ),
    ...dayRangeChip('created', 'Ngày tạo', query.createdFrom, query.createdTo, () =>
      patch({ createdFrom: undefined, createdTo: undefined }),
    ),
    ...(query.exitReason
      ? [
          {
            id: 'exitReason',
            label:
              reasonName && reasonName !== query.exitReason
                ? `Lý do dừng chăm sóc: ${reasonName}`
                : 'Lý do dừng chăm sóc',
            onDrop: () => patch({ exitReason: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('exited', 'Ngày ngừng chăm sóc', query.exitedFrom, query.exitedTo, () =>
      patch({ exitedFrom: undefined, exitedTo: undefined }),
    ),
  ]
}
