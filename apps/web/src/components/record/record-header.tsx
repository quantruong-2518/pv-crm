import { useId, type ReactNode } from 'react'
import { Button, Icon, MetaPill, Pencil } from '@pv/ui'

/** The header of every profile: the record's name, then ONE row of meta pills
 *  for what the screen supplies (people, source, date), in that order — one
 *  pill per fact so the eye can pick each one out.
 *
 *  No code, no kicker naming the object type and no status pill (ADR 0078
 *  §1): the strip already shows the code and which step this is, and the todo
 *  card's stepper says where it stands. No buttons either — actions live in
 *  the todo card and the floating bar; the one exception is `onRename`, a
 *  pencil beside the title, because renaming is the edit people reach for most. */
export function RecordHeader({
  title,
  meta = [],
  onRename,
}: {
  title: ReactNode
  /** One fact per entry; `null`/`false` entries are dropped, not separated. */
  meta?: ReactNode[]
  /** Shows the pencil beside the title; omit when the reader cannot rename. */
  onRename?: () => void
}) {
  const titleId = useId()
  const facts = meta.filter(
    (fact) => fact !== null && fact !== undefined && fact !== false && fact !== '',
  )

  return (
    <header className="flex min-w-0 flex-col gap-1" aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="font-display break-words text-[26px] font-semibold tracking-[-.45px] lg:text-[30px]"
      >
        {title}
        {onRename && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 ml-2 align-middle"
            aria-label="Sửa tên cơ hội"
            onClick={onRename}
          >
            <Icon icon={Pencil} size={16} />
          </Button>
        )}
      </h2>
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
