import {
  LEAD_ACTIVE_STATES,
  LEAD_STATE_LABEL,
  LeadMotion,
  LeadState,
  SOURCE_KIND_LABEL,
  type LeadBookQuery,
  type LeadFacets,
  type LeadRow,
} from '@pv/contracts'
import { useDirectory, useSalesPeople } from '@/data/directory'
import { NO_CREATOR_TITLE, NO_OWNER_TITLE } from '@/data/leads'
import { useMotionLabel } from '@/data/sales-motions'
import { LEAD_HEADER } from './leads-model'
import {
  dayRangeChip,
  listChip,
  personNameOf,
  type ActiveFilter,
} from '@/components/active-filters'
import { labelOptions, peopleOptions } from '@/components/book-columns'
import { DayRangeFilter, ListFilter } from '@/components/book-filters'

/** The lead book's header filters and chips, kept off `leads.tsx` so the page
 *  function does not grow. Every key a header or a shared link can set is
 *  listed in `LEAD_FILTER_KEYS` ("clear all" resets exactly these) and has a chip.
 *
 *  Campaign, motion and source kind have no header: the source column filters
 *  the catalog origin. They stay link-set, and the chip is their only trace. */

type Patch = (next: Partial<LeadBookQuery>) => void

export function useLeadFilters(
  query: LeadBookQuery,
  patch: Patch,
  counts: LeadFacets | undefined,
  tabValue: string,
) {
  const sales = useSalesPeople()
  const staff = useDirectory()
  return {
    origin: (
      <ListFilter
        label={LEAD_HEADER.source}
        options={(counts?.origins ?? []).map((o) => ({ value: o.id, label: o.name }))}
        value={query.origin}
        onChange={(origin) => patch({ origin })}
      />
    ),
    /* The server ANDs `states` with "not held", and a tab other than the active
       one drops it (`tabPatch`), so the filter only exists where it can work. */
    states:
      tabValue === 'active' ? (
        <ListFilter
          label={LEAD_HEADER.status}
          searchable={false}
          options={labelOptions(LEAD_ACTIVE_STATES, LEAD_STATE_LABEL, counts?.byState)}
          value={query.states}
          onChange={(states) => patch({ states })}
        />
      ) : undefined,
    created: (
      <DayRangeFilter
        label={LEAD_HEADER.created}
        from={query.createdFrom}
        to={query.createdTo}
        onChange={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
      />
    ),
    creator: (
      <ListFilter
        label={LEAD_HEADER.creator}
        options={peopleOptions(staff, NO_CREATOR_TITLE)}
        value={query.createdBy}
        onChange={(createdBy) => patch({ createdBy })}
      />
    ),
    owner: (
      <ListFilter
        label={LEAD_HEADER.owner}
        options={peopleOptions(sales, NO_OWNER_TITLE)}
        value={query.owner}
        onChange={(owner) => patch({ owner })}
      />
    ),
  }
}

/** Every narrowing on the address as a removable chip. A value that cannot be
 *  named from what is loaded falls back to its axis, never a bare id. */
export function useLeadFilterChips(
  query: LeadBookQuery,
  patch: Patch,
  counts: LeadFacets | undefined,
  rows: readonly LeadRow[],
): ActiveFilter[] {
  const staff = useDirectory()
  const motionLabel = useMotionLabel()
  const stateName = (s: string) => {
    const parsed = LeadState.safeParse(s)
    return parsed.success ? LEAD_STATE_LABEL[parsed.data] : s
  }
  const motionName = (m: string) => {
    const parsed = LeadMotion.safeParse(m)
    return parsed.success ? motionLabel(parsed.data) : m
  }
  const campaignName = rows.find((r) => r.source.campaignId === query.campaign)?.source.campaignName
  const originName = (id: string) =>
    counts?.origins.find((o) => o.id === id)?.name ?? 'Nguồn đã chọn'
  const labelName = (id: string) => counts?.labels.find((l) => l.id === id)?.name ?? 'Nhãn đã chọn'
  const drop = (key: keyof LeadBookQuery) => () => patch({ [key]: undefined })

  return [
    ...listChip('states', LEAD_HEADER.status, query.states, stateName, drop('states')),
    ...dayRangeChip('created', LEAD_HEADER.created, query.createdFrom, query.createdTo, () =>
      patch({ createdFrom: undefined, createdTo: undefined }),
    ),
    ...listChip('origin', LEAD_HEADER.source, query.origin, originName, drop('origin')),
    ...listChip(
      'owner',
      LEAD_HEADER.owner,
      query.owner,
      personNameOf(staff, NO_OWNER_TITLE),
      drop('owner'),
    ),
    ...listChip(
      'createdBy',
      LEAD_HEADER.creator,
      query.createdBy,
      personNameOf(staff, NO_CREATOR_TITLE),
      drop('createdBy'),
    ),
    ...listChip('label', 'Nhãn', query.label, labelName, drop('label')),
    ...listChip('motion', 'Cách tiếp cận', query.motion, motionName, drop('motion')),
    ...listChip(
      'sourceKind',
      'Nguồn nhập',
      query.sourceKind,
      (k) => SOURCE_KIND_LABEL[k as keyof typeof SOURCE_KIND_LABEL] ?? k,
      drop('sourceKind'),
    ),
    ...listChip(
      'campaign',
      'Chiến dịch',
      query.campaign,
      () => campaignName ?? 'đang chọn',
      drop('campaign'),
    ),
  ]
}
