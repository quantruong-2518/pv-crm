import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Button, Icon, MetaPill, Pencil, UserRoundPlus, cn, type IconGlyph } from '@pv/ui'

/** One person in a profile rail — the owners, the contacts and the signers
 *  read alike: avatar, name with its tag pill, muted lines under it, and at
 *  most one icon door on the right. One face so the eye learns it once. */

const LINE = 'text-muted-foreground m-0 break-words text-[12px] leading-[1.5]'

export function PersonList({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-3 p-0">{children}</ul>
}

export function PersonRow({
  name,
  empty,
  to,
  tag,
  lines = [],
  door,
  edit,
}: {
  /** `null` = the seat is empty; `empty` says why, muted, beside a blank avatar. */
  name: string | null
  empty?: string
  to?: string | undefined
  tag?: string | false | null | undefined
  lines?: (string | null | undefined | false)[]
  door?: { label: string; icon: IconGlyph; onClick: () => void } | undefined
  /** An edit pencil beside the name, for a person the reader may change. */
  edit?: { label: string; onClick: () => void } | undefined
}) {
  const face = 'text-foreground truncate text-[13px] font-semibold leading-[1.5]'
  return (
    <li className="flex min-w-0 items-center gap-3">
      {name ? (
        <Avatar name={name} size="md" />
      ) : (
        <span
          aria-hidden
          className="bg-surface-ink/10 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full"
        >
          <Icon icon={UserRoundPlus} size={16} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {!name ? (
            <span className={LINE}>{empty}</span>
          ) : to ? (
            <Link
              to={to}
              title={name}
              className={cn(
                face,
                'pointer-coarse:min-h-12 inline-flex items-center hover:underline',
              )}
            >
              {name}
            </Link>
          ) : (
            <span title={name} className={face}>
              {name}
            </span>
          )}
          {tag && <MetaPill className="shrink-0">{tag}</MetaPill>}
          {edit && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:size-12 size-8 shrink-0 px-0"
              title={edit.label}
              aria-label={edit.label}
              onClick={edit.onClick}
            >
              <Icon icon={Pencil} size={16} />
            </Button>
          )}
        </span>
        {lines.filter(Boolean).map((line) => (
          <span key={line as string} className={LINE}>
            {line}
          </span>
        ))}
      </span>
      {door && (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:size-12 size-8 shrink-0 px-0"
          title={door.label}
          aria-label={door.label}
          onClick={door.onClick}
        >
          <Icon icon={door.icon} size={16} />
        </Button>
      )}
    </li>
  )
}
