import type { TableColumn } from '@pv/ui'
import { WorkstreamStandKind, type WorkstreamBookQuery } from '@pv/contracts'
import { NO_PIC, STAND_KIND_LABEL } from '@/data/workstreams'
import { useDirectory } from '@/data/directory'
import { personNameOf } from '@/components/active-filters'
import { COL, csvOf, labelOptions, peopleOptions, toCsv } from '@/components/book-columns'
import { ListFilter } from '@/components/book-filters'

/** The book's column headers and their filters: hooks, because the person list
 *  comes from the directory. Beside the page so its function stays short. */

type Patch = (next: Partial<WorkstreamBookQuery>) => void

/** An id from the address, said as the person's name. The whole directory, not
 *  only Sales: a holder may sit outside it, and the filter lists the same set. */
export function useOwnerName(): (id: string) => string {
  return personNameOf(useDirectory(), NO_PIC)
}

/** Ordered by the question the book answers first: whose journey, where it
 *  stands, what happens next, who holds it, when we last spoke. */
export function useWorkstreamColumns(query: WorkstreamBookQuery, patch: Patch): TableColumn[] {
  const people = useDirectory()
  return [
    { header: 'Khách hàng', width: COL.name, sortKey: 'customer' },
    {
      header: 'Đang ở',
      width: COL.text,
      filter: (
        <ListFilter
          label="Đang ở"
          searchable={false}
          options={labelOptions(WorkstreamStandKind.options, STAND_KIND_LABEL)}
          value={query.standKind}
          /* `standKey` only means something beside ONE kind, so any change drops it. */
          onChange={(csv) => patch({ standKind: toCsv(csvOf(csv)), standKey: undefined })}
        />
      ),
    },
    { header: 'Việc tiếp theo', width: COL.text, sortKey: 'priority' },
    {
      header: 'Người phụ trách',
      width: COL.person,
      filter: (
        <ListFilter
          label="Người phụ trách"
          options={peopleOptions(people, NO_PIC)}
          value={query.owner}
          onChange={(owner) => patch({ owner })}
        />
      ),
    },
    { header: 'Liên hệ gần nhất', width: COL.text },
  ]
}
