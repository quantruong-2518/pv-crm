import type { TableColumn } from '@pv/ui'
import { WORKSTREAM_JOURNEY_STEPS, type WorkstreamBookQuery } from '@pv/contracts'
import { CLOSE_REASON_LABEL } from '@/data/workstreams'
import { dayRangeChip, type ActiveFilter } from '@/components/active-filters'

/** The book's columns and removable chips: one per narrowing that has no control of its
 *  own on the toolbar — the scorecard's four cards, the overview's runs tile,
 *  an account link and a stand picked from elsewhere. The overdue toggle shows
 *  its own state. */

/* Ordered by the question the book answers first: whose journey, where it
   stands, what happens next, who holds it, when we last spoke. */
export const columns: TableColumn[] = [
  { header: 'Khách hàng', width: 'minmax(220px,2.2fr)', sortKey: 'customer' },
  { header: 'Đang ở', width: 'minmax(240px,2.2fr)' },
  { header: 'Việc tiếp theo', width: 'minmax(240px,2.2fr)', sortKey: 'priority' },
  { header: 'Phụ trách', width: 'minmax(180px,1.6fr)' },
  { header: 'Liên hệ gần nhất', width: 'minmax(140px,1fr)' },
]

const STEP_OF_KIND = { LD: 'lead', OP: 'opportunity', HĐ: 'contract' } as const

export function filterChips(
  query: WorkstreamBookQuery,
  patch: (next: Partial<WorkstreamBookQuery>) => void,
): ActiveFilter[] {
  const stand = query.standKind && STEP_OF_KIND[query.standKind]
  return [
    ...(query.stopped === true
      ? [
          {
            id: 'stopped',
            label: 'Đã dừng',
            aria: 'Bỏ lọc hành trình đã dừng',
            onDrop: () => patch({ stopped: undefined }),
          },
        ]
      : []),
    ...(query.closeReason !== undefined
      ? [
          {
            id: 'closeReason',
            label: CLOSE_REASON_LABEL[query.closeReason],
            aria: `Bỏ lọc ${CLOSE_REASON_LABEL[query.closeReason]}`,
            onDrop: () => patch({ closeReason: undefined }),
          },
        ]
      : []),
    ...(stand
      ? [
          {
            id: 'standKind',
            label: `Đang ở ${WORKSTREAM_JOURNEY_STEPS.find((s) => s.key === stand)?.label ?? ''}`,
            onDrop: () => patch({ standKind: undefined, standKey: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('live', 'Đang chạy trong', query.liveFrom, query.liveTo, () =>
      patch({ liveFrom: undefined, liveTo: undefined }),
    ),
    ...dayRangeChip('opened', 'Mở trong', query.openedFrom, query.openedTo, () =>
      patch({ openedFrom: undefined, openedTo: undefined }),
    ),
    ...dayRangeChip('closed', 'Ngày đóng', query.closedFrom, query.closedTo, () =>
      patch({ closedFrom: undefined, closedTo: undefined }),
    ),
    ...(query.accountCode !== undefined
      ? [
          {
            id: 'accountCode',
            label: query.accountCode,
            aria: `Bỏ lọc theo công ty ${query.accountCode}`,
            className: 'font-mono',
            onDrop: () => patch({ accountCode: undefined }),
          },
        ]
      : []),
  ]
}
