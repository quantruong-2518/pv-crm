import { Kanban, List } from '@pv/ui'
import type { WorkstreamBookQuery, WorkstreamStandKind } from '@pv/contracts'
import { closeReasonLabel, standKindLabel, type BoardView } from '@/data/workstreams'
import { getLang, message, translate, type Lang } from '@/app/i18n'
import { dayRangeChip, listChip, type ActiveFilter } from '@/components/active-filters'
import type { ViewOption } from '@/components/book-cards'

/** The book's search words and removable chips: one chip per narrowing a link or
 *  a header can set — the scorecard's four cards, the overview's runs tile, an
 *  account link, a stand or a person. The overdue toggle shows its own state. */

/* The server searches the run code, the lead's company and the account name
   (`SEARCHED` in the workstream repository): that is all this line may promise.
   One string for the table, the board and the app header. */
export const WORKSTREAM_SEARCH_HINT = 'Tìm theo tên khách hàng hoặc mã hành trình…' // i18n-ignore

/* Getters, so the page that draws the switch reads the current language. */
export const VIEW_OPTIONS: readonly ViewOption<BoardView>[] = [
  {
    value: 'table',
    get label() {
      return translate(message('Bảng', 'Table', '표'))
    },
    icon: List,
  },
  { value: 'kanban', label: 'Kanban', icon: Kanban },
]

export function filterChips(
  query: WorkstreamBookQuery,
  patch: (next: Partial<WorkstreamBookQuery>) => void,
  ownerName: (id: string) => string,
  lang: Lang = getLang(),
): ActiveFilter[] {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  const reason = query.closeReason !== undefined ? closeReasonLabel(query.closeReason, lang) : ''
  return [
    ...(query.stopped === true
      ? [
          {
            id: 'stopped',
            label: m('Đã dừng', 'Stopped', '중단됨'),
            aria: m(
              'Bỏ lọc hành trình đã dừng',
              'Remove the stopped workstreams filter',
              '중단된 영업 건 필터 지우기',
            ),
            onDrop: () => patch({ stopped: undefined }),
          },
        ]
      : []),
    ...(query.closeReason !== undefined
      ? [
          {
            id: 'closeReason',
            label: reason,
            aria: m(`Bỏ lọc ${reason}`, `Remove the ${reason} filter`, `${reason} 필터 지우기`),
            onDrop: () => patch({ closeReason: undefined }),
          },
        ]
      : []),
    ...listChip(
      'standKind',
      m('Đang ở', 'At', '현재 단계'),
      query.standKind,
      (kind) => standKindLabel(kind as WorkstreamStandKind, lang),
      () => patch({ standKind: undefined, standKey: undefined }),
      ' ',
    ),
    ...listChip('owner', m('Người phụ trách', 'Owner', '담당자'), query.owner, ownerName, () =>
      patch({ owner: undefined }),
    ),
    ...dayRangeChip(
      'live',
      m('Đang chạy trong', 'Live in', '진행 기간'),
      query.liveFrom,
      query.liveTo,
      () => patch({ liveFrom: undefined, liveTo: undefined }),
    ),
    ...dayRangeChip(
      'opened',
      m('Mở trong', 'Opened in', '개시 기간'),
      query.openedFrom,
      query.openedTo,
      () => patch({ openedFrom: undefined, openedTo: undefined }),
    ),
    ...dayRangeChip(
      'closed',
      m('Ngày đóng', 'Closed on', '종료일'),
      query.closedFrom,
      query.closedTo,
      () => patch({ closedFrom: undefined, closedTo: undefined }),
    ),
    ...(query.accountCode !== undefined
      ? [
          {
            id: 'accountCode',
            label: query.accountCode,
            aria: m(
              `Bỏ lọc theo công ty ${query.accountCode}`,
              `Remove the company filter ${query.accountCode}`,
              `회사 필터 ${query.accountCode} 지우기`,
            ),
            className: 'font-mono',
            onDrop: () => patch({ accountCode: undefined }),
          },
        ]
      : []),
  ]
}
