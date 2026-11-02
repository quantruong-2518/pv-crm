import {
  LEAD_ACTIVE_STATES,
  LeadMotion,
  LeadState,
  type LeadBookQuery,
  type LeadFacets,
  type LeadRow,
} from '@pv/contracts'
import { useQuery } from '@tanstack/react-query'
import { useDirectory, useSalesPeople } from '@/data/directory'
import { configName, leadIndustryOptionsQuery } from '@/data/industries'
import { NO_CREATOR_TITLE, NO_OWNER_TITLE } from '@/data/leads'
import { useMotionLabel } from '@/data/sales-motions'
import { useI18n } from '@/app/i18n'
import { LEAD_COPY, leadStateText, sourceKindText } from '@/data/lead-copy'
import {
  dayRangeChip,
  listChip,
  personNameOf,
  type ActiveFilter,
} from '@/components/active-filters'
import { labelOptions, peopleOptions } from '@/components/book-columns'
import { DayRangeFilter, ListFilter } from '@/components/book-filters'
import { IndustryFilter } from '@/components/industry-filter'

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
  const { t, lang } = useI18n()
  const sales = useSalesPeople()
  const staff = useDirectory()
  return {
    origin: (
      <ListFilter
        label={t(LEAD_COPY.source)}
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
          label={t(LEAD_COPY.status)}
          searchable={false}
          options={labelOptions(
            LEAD_ACTIVE_STATES,
            Object.fromEntries(
              LEAD_ACTIVE_STATES.map((state) => [state, leadStateText(state, lang)]),
            ) as Record<LeadState, string>,
            counts?.byState,
          )}
          value={query.states}
          onChange={(states) => patch({ states })}
        />
      ) : undefined,
    created: (
      <DayRangeFilter
        label={t(LEAD_COPY.created)}
        from={query.createdFrom}
        to={query.createdTo}
        onChange={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
      />
    ),
    creator: (
      <ListFilter
        label={t(LEAD_COPY.creator)}
        options={peopleOptions(staff, NO_CREATOR_TITLE)}
        value={query.createdBy}
        onChange={(createdBy) => patch({ createdBy })}
      />
    ),
    owner: (
      <ListFilter
        label={t(LEAD_COPY.owner)}
        options={peopleOptions(sales, NO_OWNER_TITLE)}
        value={query.owner}
        onChange={(owner) => patch({ owner })}
      />
    ),
    industry: (
      <IndustryFilter
        value={{ categoryId: query.categoryId, industryId: query.industryId }}
        onChange={patch}
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
  const { t, lang } = useI18n()
  const staff = useDirectory()
  const motionLabel = useMotionLabel()
  const stateName = (s: string) => {
    const parsed = LeadState.safeParse(s)
    return parsed.success ? leadStateText(parsed.data, lang) : s
  }
  const motionName = (m: string) => {
    const parsed = LeadMotion.safeParse(m)
    return parsed.success ? motionLabel(parsed.data) : m
  }
  const campaignName = rows.find((r) => r.source.campaignId === query.campaign)?.source.campaignName
  const originName = (id: string) =>
    counts?.origins.find((o) => o.id === id)?.name ?? t(LEAD_COPY.selectedSource)
  const labelName = (id: string) =>
    counts?.labels.find((l) => l.id === id)?.name ?? t(LEAD_COPY.selectedLabel)
  const { data: industries } = useQuery(leadIndustryOptionsQuery)
  const industryName = (id: string) => configName(industries, id)
  const drop = (key: keyof LeadBookQuery) => () => patch({ [key]: undefined })

  return [
    ...listChip('states', t(LEAD_COPY.status), query.states, stateName, drop('states')),
    ...dayRangeChip('created', t(LEAD_COPY.created), query.createdFrom, query.createdTo, () =>
      patch({ createdFrom: undefined, createdTo: undefined }),
    ),
    ...listChip('origin', t(LEAD_COPY.source), query.origin, originName, drop('origin')),
    ...listChip(
      'owner',
      t(LEAD_COPY.owner),
      query.owner,
      personNameOf(staff, NO_OWNER_TITLE),
      drop('owner'),
    ),
    ...listChip(
      'createdBy',
      t(LEAD_COPY.creator),
      query.createdBy,
      personNameOf(staff, NO_CREATOR_TITLE),
      drop('createdBy'),
    ),
    ...listChip(
      'categoryId',
      t(LEAD_COPY.industryGroup),
      query.categoryId,
      industryName,
      drop('categoryId'),
    ),
    ...listChip(
      'industryId',
      t(LEAD_COPY.industry),
      query.industryId,
      industryName,
      drop('industryId'),
    ),
    ...listChip('label', t(LEAD_COPY.label), query.label, labelName, drop('label')),
    ...listChip('motion', t(LEAD_COPY.approach), query.motion, motionName, drop('motion')),
    ...listChip(
      'sourceKind',
      t(LEAD_COPY.intakeSource),
      query.sourceKind,
      (k) => sourceKindText(k, lang),
      drop('sourceKind'),
    ),
    ...listChip(
      'campaign',
      t(LEAD_COPY.campaign),
      query.campaign,
      () => campaignName ?? t(LEAD_COPY.selected),
      drop('campaign'),
    ),
  ]
}
