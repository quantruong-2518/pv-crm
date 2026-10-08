import { useQuery } from '@tanstack/react-query'
import { ColumnFilter, ColumnFilterList } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  OWNER_NONE,
  StageKey,
  type OpportunityBookQuery,
} from '@pv/contracts'
import { opportunityFacetQuery } from '@/data/opportunities'
import { csvOf, peopleOptions } from './opportunities-model'

/** The deal book's column filters, the lead book's pattern (ColumnFilter in the
 *  header, the clear-all button in the toolbar). Choices come from `/facets` over the
 *  whole visible book, so a list never collapses to its own pick.
 *
 *  Sale, BD, account and stage take a comma list, as the lead book's owner does. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** Not a stage: the overdue flag rides in the stage column's list. */
const OVERDUE = 'overdue'

export function useOpportunityFilters(query: OpportunityBookQuery, patch: Patch) {
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  /* The csv filter cannot carry a name holding a comma, so it is not offered. */
  const accounts = (choices?.accounts ?? [])
    .filter((a) => !a.includes(','))
    .sort((a, b) => a.localeCompare(b, 'vi'))

  const multi = (
    label: string,
    key: 'sale' | 'bd' | 'account',
    options: { value: string; label: string }[],
    iconOnly?: boolean,
  ) => (
    <ColumnFilter label={label} active={query[key] !== undefined} iconOnly={iconOnly}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )

  const stage = (
    <ColumnFilter
      label="Giai đoạn"
      active={query.stage !== undefined || query.overdue !== undefined}
    >
      {(close) => (
        <ColumnFilterList
          searchable={false}
          options={[
            ...StageKey.options.map((s) => ({ value: s, label: OPPORTUNITY_STAGE_LABEL[s] })),
            { value: OVERDUE, label: 'Quá hạn ở giai đoạn hiện tại' },
          ]}
          selected={[...csvOf(query.stage), ...(query.overdue ? [OVERDUE] : [])]}
          close={close}
          onApply={(v) => {
            const picked = StageKey.options.filter((s) => v.includes(s))
            patch({
              stage: picked.length ? picked.join(',') : undefined,
              overdue: v.includes(OVERDUE) || undefined,
            })
          }}
        />
      )}
    </ColumnFilter>
  )

  return {
    account: multi(
      'Khách hàng',
      'account',
      accounts.map((a) => ({ value: a, label: a })),
      true,
    ),
    stage,
    bd: multi('BD phụ trách', 'bd', [
      { value: OWNER_NONE, label: 'Chưa ghi BD' },
      ...peopleOptions(choices?.bdOwners ?? []),
    ]),
    sale: multi('Sale phụ trách', 'sale', [
      { value: OWNER_NONE, label: 'Chưa có Sale' },
      ...peopleOptions(choices?.saleOwners ?? []),
    ]),
  }
}
