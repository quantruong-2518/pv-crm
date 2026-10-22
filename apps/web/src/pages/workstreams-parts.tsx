import { CalendarClock } from '@pv/ui'
import type { WorkstreamBookQuery } from '@pv/contracts'
import { NARROWING_CLEARED } from '@/data/workstreams'
import { BookQueueButton } from '@/components/book-queue-button'

/** The overdue toggle, kept off the page body so that stays under the
 *  function ceiling. */

type Patch = (next: Partial<WorkstreamBookQuery>) => void

/** The server's overdue set is open runs only, so turning it on leaves the
 *  closed tab and every card's narrowing. */
export function OverdueToggle({
  query,
  patch,
  count,
}: {
  query: WorkstreamBookQuery
  patch: Patch
  /** The whole-book count; undefined until the scorecard answers. */
  count: number | undefined
}) {
  const active = query.overdue === true
  return (
    <BookQueueButton
      ariaLabel="Lọc hành trình quá hạn"
      icon={CalendarClock}
      label="Quá hạn"
      count={count}
      active={active}
      onPress={() =>
        patch(active ? { overdue: undefined } : { ...NARROWING_CLEARED, overdue: true })
      }
    />
  )
}
