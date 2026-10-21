import { useId } from 'react'
import type { NotificationRow } from '@pv/contracts'
import { dm } from '@/lib/date'
import { VN_DAY, vnToday } from '@/data/opportunities'
import { useNotificationPath } from '@/data/notifications'
import { NotificationLine } from './notification-line'

/** Rows under a day heading (today, yesterday, then dd/MM) so the line itself
 *  only needs the hour. The server sends newest first, so a day is a run of
 *  neighbours and no sort happens here. Neighbours that say the same thing
 *  about the same object and open the same place fold into one line. */

const DAY_MS = 24 * 60 * 60 * 1000

function dayLabel(row: NotificationRow, today: string): string {
  const day = VN_DAY.format(new Date(row.createdAt))
  if (day === today) return 'Hôm nay'
  if (day === new Date(Date.parse(today) - DAY_MS).toISOString().slice(0, 10)) return 'Hôm qua'
  return dm(row.createdAt)
}

type Run = { rows: NotificationRow[]; path: string | null; same: string }

export function NotificationList({
  rows,
  onPress,
}: {
  rows: NotificationRow[]
  /** Every row of the pressed line, so a folded line marks all of them read. */
  onPress: (rows: NotificationRow[], path: string | null) => void
}) {
  const id = useId()
  const today = vnToday()
  const pathOf = useNotificationPath()
  const days: { label: string; runs: Run[] }[] = []
  for (const row of rows) {
    const label = dayLabel(row, today)
    const path = pathOf(row)
    const same = `${row.kind}|${row.subject.code}|${path}`
    let day = days.at(-1)
    if (day?.label !== label) days.push((day = { label, runs: [] }))
    const run = day.runs.at(-1)
    if (run?.same === same) run.rows.push(row)
    else day.runs.push({ rows: [row], path, same })
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day, i) => (
        <section key={day.label} aria-labelledby={`${id}-${i}`} className="flex flex-col gap-1">
          <h3
            id={`${id}-${i}`}
            className="text-muted-foreground m-0 px-3 text-[11.5px] font-semibold leading-[1.5]"
          >
            {day.label}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {day.runs.map((run) => (
              <NotificationLine
                key={run.rows[0]!.id}
                rows={run.rows}
                path={run.path}
                onPress={onPress}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
