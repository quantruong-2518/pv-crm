import { useQuery } from '@tanstack/react-query'
import type { CampaignBookQuery } from '@pv/contracts'
import { useCan } from '@/app/auth'
import type { useBookQuery } from '@/app/book-query'
import { campaignFacetQuery } from '@/data/campaign-book'
import { useSalesPeople } from '@/data/directory'
import { salesCatalogQuery } from '@/data/sales-config'
import { dayRangeChip, listChip, personNameOf } from '@/components/active-filters'
import { peopleOptions, type FilterOption } from '@/components/book-columns'
import { DayRangeFilter, ListFilter } from '@/components/book-filters'
import { message, useI18n } from '@/app/i18n'

/** The campaign book's header filters and the chips that mirror them.
 *  Owners come from the people directory, never from a sample of rows. */

/** Why a campaign shows no owner: the dash's tooltip and the filter's "nobody" option. */
export const NO_OWNER = 'Chưa có người phụ trách' // i18n-ignore

export function useCampaignFilters(book: ReturnType<typeof useBookQuery<CampaignBookQuery>>) {
  const { t } = useI18n()
  const { query, patch } = book
  const people = useSalesPeople()
  /* `presales` holds `campaign.view` but not `config.view`: the catalog is
     closed to it, so its source list is read off the campaigns it can see. */
  const canConfig = useCan('config.view')
  const { data: catalog } = useQuery({ ...salesCatalogQuery, enabled: canConfig })
  const { data: facets } = useQuery({ ...campaignFacetQuery, enabled: !canConfig })

  const sources = catalog?.SOURCE ?? []
  const sourceOptions: FilterOption[] = canConfig
    ? sources.map((s) => ({ value: s.id, label: s.name }))
    : [
        ...new Map(
          (facets?.rows ?? []).flatMap((c) =>
            c.sourceId ? [[c.sourceId, c.sourceName ?? c.sourceId] as const] : [],
          ),
        ),
      ].map(([value, label]) => ({ value, label }))
  const ownerName = t(message(NO_OWNER, 'No owner', '담당자 없음'))
  const ownerOptions = peopleOptions(people, ownerName)

  const sourceName = (value: string) =>
    sourceOptions.find((o) => o.value === value)?.label ??
    t(message('Nguồn đã chọn', 'Selected source', '선택한 유입 경로'))

  return {
    sources,
    owner: (
      <ListFilter
        label={t(message('Người phụ trách', 'Owner', '담당자'))}
        options={ownerOptions}
        value={query.owner}
        onChange={(owner) => patch({ owner })}
      />
    ),
    source: (
      <ListFilter
        label={t(message('Nguồn dẫn', 'Source', '유입 경로'))}
        options={sourceOptions}
        value={query.source}
        onChange={(source) => patch({ source })}
      />
    ),
    created: (
      <DayRangeFilter
        label={t(message('Ngày tạo', 'Created', '생성일'))}
        from={query.createdFrom}
        to={query.createdTo}
        onChange={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
      />
    ),
    chips: [
      ...listChip(
        'owner',
        t(message('Người phụ trách', 'Owner', '담당자')),
        query.owner,
        personNameOf(people, ownerName),
        () => patch({ owner: undefined }),
      ),
      ...listChip(
        'source',
        t(message('Nguồn dẫn', 'Source', '유입 경로')),
        query.source,
        sourceName,
        () => patch({ source: undefined }),
      ),
      ...dayRangeChip(
        'created',
        t(message('Ngày tạo', 'Created', '생성일')),
        query.createdFrom,
        query.createdTo,
        () => patch({ createdFrom: undefined, createdTo: undefined }),
      ),
    ],
  }
}
