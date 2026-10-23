import type { ReactNode } from 'react'
import {
  lastDayOf,
  salesPeriodOf,
  salesPeriodSpan,
  stepSalesPeriod,
  type LeadBookQuery,
  type RecareCountsResponse,
} from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { periodLabel } from '@/data/period-pick'

/** The stopped-customers page without JSX (ADR 0125): the two tabs, the re-contact groups
 *  and the month the stop log reads.
 *
 *  Each tab is a server-paged book, and `useBookQuery` rewrites the whole
 *  address from its schema's keys on every filter, search or page change. The
 *  page's own keys `tab` and `group` are therefore made keys of each tab's
 *  schema, or the first keystroke would drop the reader back to the default. */

export const NURTURE_TABS = ['recare', 'log'] as const
export type NurtureTab = (typeof NURTURE_TABS)[number]

export const NURTURE_TAB_LABEL: Record<NurtureTab, string> = {
  recare: 'Cần liên hệ lại',
  log: 'Nhật ký dừng',
}

export const PAGE_TITLE = 'Khách đã dừng'

/** What each tab takes: the page's tab switch, drawn under the title. */
export type NurtureTabProps = { nav: ReactNode }

export const RECARE_GROUPS = ['replied', 'due', 'later', 'none'] as const
export type RecareGroup = (typeof RECARE_GROUPS)[number]

export const RECARE_GROUP_LABEL: Record<RecareGroup, string> = {
  replied: 'Vừa phản hồi',
  due: 'Đến hạn',
  later: 'Chưa đến hạn',
  none: 'Không hẹn',
}

/** Fresh replies first while there are any; a failed count falls to `due`. */
export const defaultGroup = (counts?: RecareCountsResponse): RecareGroup =>
  counts && counts.replied > 0 ? 'replied' : 'due'

/** The book query a group reads. A reply moved the lead back to `new`, out of the pool. */
export const groupQuery = (group: RecareGroup): Partial<LeadBookQuery> =>
  group === 'replied'
    ? { state: 'new', replied: true, recontact: undefined }
    : { state: 'nurturing', recontact: group, replied: undefined }

// ---------------------------------------------------------------------------
// Address-only keys
// ---------------------------------------------------------------------------

type BookShape = { q?: string; page: number; size: number }
type BookSchema<Q extends BookShape> = Parameters<typeof useBookQuery<Q>>[0]
export type PageKeys = { tab?: string; group?: RecareGroup }

const pageKeysOf = (input: unknown): PageKeys => {
  const raw = input as { tab?: unknown; group?: unknown }
  return {
    tab: typeof raw.tab === 'string' ? raw.tab : undefined,
    group: RECARE_GROUPS.find((g) => g === raw.group),
  }
}

/** A book schema that also carries `tab` and `group`. Build it once at module
 *  level: the hook keys its memos on the schema's identity. */
export function withPageKeys<Q extends BookShape>(schema: BookSchema<Q>): BookSchema<Q & PageKeys> {
  return {
    shape: { ...schema.shape, tab: true, group: true },
    parse: (input) => ({ ...schema.parse(input), ...pageKeysOf(input) }),
    safeParse: (input) => {
      const result = schema.safeParse(input)
      return result.success
        ? { success: true, data: { ...result.data, ...pageKeysOf(input) } }
        : { success: false }
    },
  }
}

/** The book's own query: `tab` and `group` belong to the address, not to the wire. */
export function withoutPageKeys<Q extends PageKeys>(query: Q): Omit<Q, keyof PageKeys> {
  const { tab, group, ...rest } = query
  void tab
  void group
  return rest
}

// ---------------------------------------------------------------------------
// The stop log's range
// ---------------------------------------------------------------------------

/** `YYYY-MM` of a day; the stepper steps from the month of `from`. */
export const monthOf = (day: string): string => salesPeriodOf('month', day)

/** A month as the log's inclusive `from` / `to`. */
export function monthDays(month: string): { from: string; to: string } {
  const span = salesPeriodSpan(month)
  return { from: span.from, to: lastDayOf(span) }
}

const dmOf = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** The range the log reads: the address's, else the running month. A link may
 *  carry any span (the overview's quarter); only a whole month prints its name. */
export function logRange(from: string | undefined, to: string | undefined, current: string) {
  const month = monthOf(from ?? `${current}-01`)
  const whole = monthDays(month)
  const range = { from: from ?? whole.from, to: to ?? whole.to }
  const label =
    range.from === whole.from && range.to === whole.to
      ? periodLabel(month)
      : `${dmOf(range.from)} – ${dmOf(range.to)}/${range.to.slice(0, 4)}`
  return { ...range, month, label }
}

/** The neighbouring month, or null past the running one: nothing stopped there yet. */
export function stepMonth(month: string, by: -1 | 1, current: string): string | null {
  const next = stepSalesPeriod(month, by)
  return next > current ? null : next
}
