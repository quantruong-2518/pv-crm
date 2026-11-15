import { queryOptions } from '@tanstack/react-query'
import { MyWorkResponse } from '@pv/contracts'
import { api } from '@/app/api'
import { message } from '@/app/i18n'
import { USE_NEED } from './assistant'

/** The "today's work" card of the assistant panel (ADR 0154): today's work of
 *  the asker alone, read live from `GET /assistant/my-work`.
 *
 *  Never cached across openings and never part of a chat session: the card
 *  must show the work as it stands now, not as the last opening left it. */

export const myWorkQuery = queryOptions({
  queryKey: ['platform', 'assistant', 'my-work'] as const,
  queryFn: ({ signal }) =>
    api.read('/assistant/my-work', { need: USE_NEED, schema: MyWorkResponse, signal }),
  staleTime: 0,
  gcTime: 0,
})

export const BRIEF_COPY = {
  title: message('Việc hôm nay', "Today's work", '오늘 할 일'),
  skipped: message(
    'Không tải được mục này.',
    'This section could not be loaded.',
    '이 항목을 불러오지 못했습니다.',
  ),
  empty: message('Hôm nay không có việc nào.', 'Nothing to do today.', '오늘 할 일이 없습니다.'),
  rest: (n: string) => message(`+ ${n} việc nữa`, `+ ${n} more`, `+ ${n}건 더`),
}
