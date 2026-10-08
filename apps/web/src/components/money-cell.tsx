import { cn } from '@pv/ui'

/** A money figure as plain digits ("1.250.000.000"), never abbreviated: it is
 *  the number people scan a column for. Right-aligned with tabular figures so
 *  thousands line up; the unit lives in the column header, not in every cell.
 *  Pair it with a column `align: 'right'` so header and figures share an edge. */
export function MoneyCell({
  amount,
  missing,
  title,
  muted = false,
}: {
  amount: number | null | undefined
  /** Why there is no figure — shown as the tooltip of the dash. Omit it where
   *  the figure is never absent. */
  missing?: string
  /** Extra tooltip for a figure, e.g. the original currency. */
  title?: string
  /** A zero or secondary figure that should not compete with the main one. */
  muted?: boolean
}) {
  if (amount === null || amount === undefined) {
    return (
      <span className="text-muted-foreground block text-right" title={missing}>
        —
      </span>
    )
  }
  /* No `truncate`: a cut figure reads as a different number, so the column's
     track must be wide enough instead. */
  return (
    <span
      className={cn(
        'tnum font-num block text-right text-[13px]',
        muted ? 'text-muted-foreground' : 'font-semibold',
      )}
      title={title}
    >
      {amount.toLocaleString('vi-VN')}
    </span>
  )
}
