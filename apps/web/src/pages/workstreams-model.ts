import { Kanban, List } from '@pv/ui'
import type { WorkstreamBookQuery } from '@pv/contracts'
import { CLOSE_REASON_LABEL, STAND_KIND_LABEL, type BoardView } from '@/data/workstreams'
import { dayRangeChip, listChip, type ActiveFilter } from '@/components/active-filters'
import type { ViewOption } from '@/components/book-cards'

/** The book's search words and removable chips: one chip per narrowing a link or
 *  a header can set — the scorecard's four cards, the overview's runs tile, an
 *  account link, a stand or a person. The overdue toggle shows its own state. */

/* The server searches the run code, the lead's company and the account name
   (`SEARCHED` in the workstream repository): that is all this line may promise.
   One string for the table, the board and the app header. */
export const WORKSTREAM_SEARCH_HINT = 'Tìm theo tên khách hàng hoặc mã hành trình…'

/* A chip names every picked kind; the schema already refuses an unknown one. */
const KIND_NAME: Record<string, string> = STAND_KIND_LABEL

export const VIEW_OPTIONS: readonly ViewOption<BoardView>[] = [
  { value: 'table', label: 'Bảng', icon: List },
  { value: 'kanban', label: 'Kanban', icon: Kanban },
]

export function filterChips(
  query: WorkstreamBookQuery,
  patch: (next: Partial<WorkstreamBookQuery>) => void,
  ownerName: (id: string) => string,
): ActiveFilter[] {
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
    ...listChip(
      'standKind',
      'Đang ở',
      query.standKind,
      (kind) => KIND_NAME[kind] ?? kind,
      () => patch({ standKind: undefined, standKey: undefined }),
      ' ',
    ),
    ...listChip('owner', 'Người phụ trách', query.owner, ownerName, () =>
      patch({ owner: undefined }),
    ),
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
