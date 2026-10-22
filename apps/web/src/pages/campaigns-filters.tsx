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

/** The campaign book's header filters and the chips that mirror them.
 *  Owners come from the people directory, never from a sample of rows. */

/** Why a campaign shows no owner: the dash's tooltip and the filter's "nobody" option. */
export const NO_OWNER = 'Chưa có người phụ trách'

export function useCampaignFilters(book: ReturnType<typeof useBookQuery<CampaignBookQuery>>) {
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
  const ownerOptions = peopleOptions(people, NO_OWNER)

  const sourceName = (value: string) =>
    sourceOptions.find((o) => o.value === value)?.label ?? 'Nguồn đã chọn'

  return {
    sources,
    owner: (
      <ListFilter
        label="Người phụ trách"
        options={ownerOptions}
        value={query.owner}
        onChange={(owner) => patch({ owner })}
      />
    ),
    source: (
      <ListFilter
        label="Nguồn dẫn"
        options={sourceOptions}
        value={query.source}
        onChange={(source) => patch({ source })}
      />
    ),
    created: (
      <DayRangeFilter
        label="Ngày tạo"
        from={query.createdFrom}
        to={query.createdTo}
        onChange={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
      />
    ),
    chips: [
      ...listChip('owner', 'Người phụ trách', query.owner, personNameOf(people, NO_OWNER), () =>
        patch({ owner: undefined }),
      ),
      ...listChip('source', 'Nguồn dẫn', query.source, sourceName, () =>
        patch({ source: undefined }),
      ),
      ...dayRangeChip('created', 'Ngày tạo', query.createdFrom, query.createdTo, () =>
        patch({ createdFrom: undefined, createdTo: undefined }),
      ),
    ],
  }
}
