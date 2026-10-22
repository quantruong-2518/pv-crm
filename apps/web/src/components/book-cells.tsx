import type { ReactNode } from 'react'
import { Avatar, AvatarGroup, cn } from '@pv/ui'
import { dmy } from '@/lib/date'

/** The cells every paged book draws the same way: who holds the row, a day,
 *  an object code. A missing value is a muted "—" whose `title` says why —
 *  the app-wide empty-cell rule MoneyCell and PersonCell follow. */

/** One person a row names. Name and mailbox come in by props, never rebuilt
 *  from each other: a guessed mailbox is a letter that bounces. */
export type Pic = { id?: string; name?: string; email?: string; role?: string; primary?: boolean }

/** An empty cell: a muted dash whose `title` says why there is nothing. */
export function Missing({ why }: { why: string }) {
  return (
    <span className="text-muted-foreground" title={why}>
      —
    </span>
  )
}

const shownOf = (p: Pic) => p.name ?? p.email ?? ''

/** One person as the tooltip lists them: role, name, then the primary mark. */
const lineOf = (p: Pic) =>
  `${p.role ? `${p.role}: ` : ''}${shownOf(p)}${p.primary ? ' (chính)' : ''}`

/** Who holds the row: avatar AND name, because a hover tooltip never opens
 *  under a finger. Several people print the primary's name and "+N"; the
 *  tooltip and the screen reader get everyone, the primary marked as such.
 *  A mailbox without a name prints in mono, so "held, name unknown" never
 *  reads like a name. With nobody and an `action`, the action stands alone. */
export function PicCell({
  people,
  empty,
  max = 3,
  action,
}: {
  people: readonly Pic[]
  /** Why nobody is named — the dash's tooltip. */
  empty: string
  /** Faces drawn; the rest are counted only in the trailing "+N". */
  max?: number
  /** Assign / claim buttons; stopping the row's click is the caller's job. */
  action?: ReactNode
}) {
  /* Stable sort: the primary leads, everyone else keeps the caller's order. */
  const ordered = people
    .filter((p) => p.name || p.email)
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
  const [first, ...rest] = ordered
  if (!first) {
    return action ? <span className="flex items-center">{action}</span> : <Missing why={empty} />
  }
  const said =
    rest.length === 0
      ? [first.name, first.role, first.email].filter(Boolean).join(' · ')
      : ordered.map(lineOf).join(' · ')

  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Hidden from readers: the sr-only line says it once, whole. */}
      <span aria-hidden className="flex min-w-0 items-center gap-2">
        {rest.length === 0 ? (
          <Avatar
            name={shownOf(first)}
            email={first.name ? first.email : undefined}
            role={first.role}
            size="sm"
          />
        ) : (
          /* Sliced, so the group never adds its own "+N" beside ours. */
          <AvatarGroup names={ordered.slice(0, max).map(shownOf)} max={max} className="shrink-0" />
        )}
        <span
          title={said}
          className={cn('min-w-0 truncate', !first.name && 'font-mono text-[11px]')}
        >
          {shownOf(first)}
        </span>
        {rest.length > 0 && (
          <span title={said} className="text-muted-foreground tnum -ml-1 shrink-0 text-[11.5px]">
            +{rest.length}
          </span>
        )}
      </span>
      <span className="sr-only">{said}</span>
      {action}
    </span>
  )
}

/** A calendar day as dd/MM/yyyy: the year always printed, since books span years. */
export function DateCell({ day, empty }: { day?: string | null; empty: string }) {
  if (!day) return <Missing why={empty} />
  return <span className="tnum font-num text-[11.5px]">{dmy(day)}</span>
}

/** An object code — mono, in the accent ink the contract book set. */
export function CodeCell({ code }: { code: string }) {
  return <span className="text-accent-foreground font-mono text-[11.5px]">{code}</span>
}
