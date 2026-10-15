import { useId, type ReactNode } from 'react'
import { MetaPill } from '@pv/ui'

/** The header of every profile: the record's name on the left (its code and
 *  state badge ride in the title, law 16) and its primary moves on the right,
 *  then one muted line for why a move is shut, then ONE row of meta pills for
 *  what the screen supplies (people, source, date).
 *
 *  No kicker naming the object type (ADR 0078 §1). Moves moved up here on
 *  14/10 so the first thing a reader finds is what they can do; the title
 *  keeps the left and the row wraps below it when the screen is narrow. The
 *  action box hides itself when its children draw nothing. */
export function RecordHeader({
  title,
  meta = [],
  actions,
  subtitle,
  note,
  noteId,
}: {
  title: ReactNode
  /** One fact per entry; `null`/`false` entries are dropped, not separated. */
  meta?: ReactNode[]
  /** The record's primary moves, 48px buttons; omit when there are none. */
  actions?: ReactNode
  /** What the record is, in one muted line right under the title row. */
  subtitle?: string | null
  /** Why a move is shut: one muted line under the subtitle. */
  note?: string | null
  /** Lets a shut button point at `note` with `aria-describedby`. */
  noteId?: string
}) {
  const titleId = useId()
  const facts = meta.filter(
    (fact) => fact !== null && fact !== undefined && fact !== false && fact !== '',
  )

  return (
    <header className="flex min-w-0 flex-col gap-2" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2
          id={titleId}
          className="font-display min-w-0 flex-1 basis-80 break-words text-[26px] font-semibold tracking-[-.45px] lg:text-[30px]"
        >
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2 empty:hidden">{actions}</div>}
      </div>
      {subtitle && (
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">{subtitle}</p>
      )}
      {note && (
        <p id={noteId} className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {note}
        </p>
      )}
      {facts.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {facts.map((fact, i) => (
            <li key={i} className="min-w-0">
              <MetaPill>{fact}</MetaPill>
            </li>
          ))}
        </ul>
      )}
    </header>
  )
}
