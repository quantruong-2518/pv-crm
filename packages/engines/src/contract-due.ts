/** Due-date ladder — shared by a payment INSTALLMENT and by each unlock
 *  CONDITION hanging off it.
 *
 *  One ladder, not two. An installment and a line saying "customer must sign the
 *  acceptance record" ask the same question — how many days left, has it slipped
 *  — so both answer with the same level, the same colour and the same
 *  notification threshold. Two ladders would make people learn one concept
 *  twice.
 *
 *  It lives HERE and not in `apps/web` because this same level decides what E4
 *  sends and to whom: the screen only paints from it, while the server sweeps
 *  daily and fires from it. Both sides must read the same level for the same
 *  day, and the only way to guarantee that is a single function.
 *
 *  No `Date.now()` anywhere: every function takes `today` from the caller. A
 *  frozen scenario must yield the same level on two runs, and the server sweeps
 *  by its own date rather than by a browser clock. */

/** Six levels, ordered by how badly someone has to act. */
export type DueLevel = 'đã-xong' | 'chưa-tới' | 'gần-hạn' | 'đến-hạn' | 'quá-hạn' | 'quá-hạn-lâu'

/** Thresholds in days relative to the due date.
 *
 *  The near-due level opens 14 days out because that is the window where the
 *  customer can still act: they need an internal spend approval, and a factory
 *  rarely closes one in under two weeks. A first reminder 3 days out is a
 *  reminder for the record, not for the money.
 *
 *  The long-overdue level opens at +15 rather than +30: at that point the
 *  question changes shape — no longer "when will they pay" but "do we stop
 *  delivering" — and leaving it until month two is too late to matter. */
export const DUE_NEAR_DAYS = 14
export const DUE_LONG_OVERDUE_DAYS = 15

const DAY_MS = 86_400_000

/** Days from `today` to `due`. Positive = still ahead, negative = slipped.
 *
 *  Both sides are truncated to their calendar date before subtracting. Without
 *  that, a deadline stamped 17:00 today reads as "0 days left" or "1 day late"
 *  depending on the hour someone opens the screen — same data, two answers in
 *  one afternoon. */
export function daysUntil(due: string, today: string): number {
  const at = (iso: string) => {
    const d = new Date(iso)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return Math.round((at(due) - at(today)) / DAY_MS)
}

/** Level of one milestone. A present `doneAt` outranks everything else: an
 *  installment already collected is never "overdue", not even when it arrived
 *  late. The lateness lives in history, not in today's status. */
export function dueLevelOf(due: string, today: string, doneAt?: string): DueLevel {
  if (doneAt) return 'đã-xong'
  const left = daysUntil(due, today)
  if (left > DUE_NEAR_DAYS) return 'chưa-tới'
  if (left > 0) return 'gần-hạn'
  if (left === 0) return 'đến-hạn'
  if (-left < DUE_LONG_OVERDUE_DAYS) return 'quá-hạn'
  return 'quá-hạn-lâu'
}

/** Which levels demand something today. Used to count the "needs you" tile and
 *  to sort the book by urgency rather than by signing date. */
export function needsAttention(level: DueLevel): boolean {
  return level === 'đến-hạn' || level === 'quá-hạn' || level === 'quá-hạn-lâu'
}
