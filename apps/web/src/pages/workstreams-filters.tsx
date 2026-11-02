import type { TableColumn } from '@pv/ui'
import { WorkstreamStandKind, type WorkstreamBookQuery } from '@pv/contracts'
import { noPic, standKindLabel } from '@/data/workstreams'
import { message, useI18n } from '@/app/i18n'
import { useDirectory } from '@/data/directory'
import { personNameOf } from '@/components/active-filters'
import { COL, csvOf, peopleOptions, toCsv } from '@/components/book-columns'
import { ListFilter } from '@/components/book-filters'

/** The book's column headers and their filters: hooks, because the person list
 *  comes from the directory. Beside the page so its function stays short. */

type Patch = (next: Partial<WorkstreamBookQuery>) => void

/** An id from the address, said as the person's name. The whole directory, not
 *  only Sales: a holder may sit outside it, and the filter lists the same set. */
export function useOwnerName(): (id: string) => string {
  const { lang } = useI18n()
  return personNameOf(useDirectory(), noPic(lang))
}

/** Ordered by the question the book answers first: whose journey, where it
 *  stands, what happens next, who holds it, when we last spoke. */
export function useWorkstreamColumns(query: WorkstreamBookQuery, patch: Patch): TableColumn[] {
  const { t, lang } = useI18n()
  const people = useDirectory()
  return [
    { header: t(message('Khách hàng', 'Customer', '고객')), width: COL.name, sortKey: 'customer' },
    {
      header: t(message('Đang ở', 'At', '현재 단계')),
      width: COL.text,
      filter: (
        <ListFilter
          label={t(message('Đang ở', 'At', '현재 단계'))}
          searchable={false}
          options={WorkstreamStandKind.options.map((value) => ({
            value,
            label: standKindLabel(value, lang),
          }))}
          value={query.standKind}
          /* `standKey` only means something beside ONE kind, so any change drops it. */
          onChange={(csv) => patch({ standKind: toCsv(csvOf(csv)), standKey: undefined })}
        />
      ),
    },
    {
      header: t(message('Việc tiếp theo', 'Next step', '다음 단계')),
      width: COL.text,
      sortKey: 'priority',
    },
    {
      header: t(message('Người phụ trách', 'Owner', '담당자')),
      width: COL.person,
      filter: (
        <ListFilter
          label={t(message('Người phụ trách', 'Owner', '담당자'))}
          options={peopleOptions(people, noPic(lang))}
          value={query.owner}
          onChange={(owner) => patch({ owner })}
        />
      ),
    },
    { header: t(message('Liên hệ gần nhất', 'Last contact', '최근 연락')), width: COL.text },
  ]
}
