import { useState, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Avatar, Chip, cn, initialsOf } from '@pv/ui'
import { CARD_LINK } from './book-cards'

/** The one anatomy every card book shares, so five books read the same way:
 *  head (mark · title · subtitle · code), body, then a foot pinned to the
 *  bottom with the person on the left and the state on the right.
 *
 *  A card is `BOOK_CARD` plus `CARD_FRAME` when it carries a watermark: the
 *  frame isolates a stacking context so the watermark paints over the glass
 *  but under the text, and nothing inside needs `relative` — the title's
 *  stretched link still covers the whole card. */

/** One grid for every card book; dense flow fills the hole a wide card leaves. */
export const CARD_GRID =
  'grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

export const CARD_FRAME = 'isolate overflow-hidden'

/* A legal-form prefix would give every customer the same two letters: drop it first. */
const LEGAL_FORM =
  /^((công ty|cty|tnhh|cổ phần|cp|tập đoàn|chi nhánh|một thành viên|mtv|jsc|co\.?,? ltd\.?)\s+)+/i

function monogram(name: string) {
  return initialsOf(name.trim().replace(LEGAL_FORM, '') || name)
}

const MARK =
  'inline-flex size-[38px] shrink-0 items-center justify-center overflow-hidden rounded-md'

/** A company reads as a rounded square, a person as a circle (law 5): the logo
 *  on a light plate when it loads, else the name's initials on a tint. */
export function CompanyMark({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [broken, setBroken] = useState(false)
  if (logoUrl && !broken) {
    return (
      <span className={cn(MARK, 'bg-card shadow-control-soft dark:bg-surface-ink p-1')}>
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(true)}
          className="size-full object-contain"
        />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(MARK, 'bg-primary/15 text-on-tint-primary text-[13px] font-semibold')}
    >
      {monogram(name)}
    </span>
  )
}

/** The logo again, large and faint at the card's right middle — the one area
 *  no line of text reaches — whole rather than cropped, so a wordmark still
 *  reads, and fading in from the left so its edge never meets the text. Grey
 *  so no brand colour fights the card's tones; inverted on the dark theme so a
 *  dark logo still shows. No hover bump: at 0.08 the pills it may sit behind
 *  keep 4.5:1 on all three themes (law 13). Needs `CARD_FRAME` on the card. */
export function LogoWatermark({ src }: { src: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setBroken(true)}
      className="pointer-events-none absolute right-4 top-1/2 -z-10 h-16 w-[45%] -translate-y-1/2 select-none object-contain object-right opacity-[0.08] grayscale [mask-image:linear-gradient(to_right,transparent,black_55%)] dark:invert"
    />
  )
}

/** The card's name, linking to its profile across the whole card. */
export function CardTitle({ className, children, ...link }: LinkProps) {
  return (
    <Link
      {...link}
      className={cn(CARD_LINK, 'min-w-0 truncate text-[13.5px] font-semibold', className)}
    >
      {children}
    </Link>
  )
}

export function CardHead({
  mark,
  title,
  badge,
  subtitle,
  code,
}: {
  mark: ReactNode
  title: ReactNode
  /** Beside the title — a state only this card has (the primary-contact badge). */
  badge?: ReactNode
  subtitle?: string
  code?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {mark}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          {title}
          {badge}
        </span>
        {subtitle && (
          <span
            className="text-muted-foreground tnum min-w-0 truncate text-[12px]"
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </span>
      {code && <Chip className="shrink-0">{code}</Chip>}
    </span>
  )
}

/** A count with its noun; a zero is greyed so the counts that matter stand out. */
export function CardStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span
        className={cn(
          'tnum font-num text-[15px] font-semibold',
          value === 0 && 'text-muted-foreground font-normal',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[12px]">{label}</span>
    </span>
  )
}

/** A free-text line (a reason, a note): two lines at most, the rest on hover.
 *  Lifted over the title's stretched link, or the link would eat the hover. */
export function CardNote({ children }: { children?: string }) {
  if (!children) return null
  return (
    <span
      className="text-foreground relative z-[1] line-clamp-2 min-w-0 text-[12.5px]"
      title={children}
    >
      {children}
    </span>
  )
}

/** Who holds the record. */
export function CardPerson({
  name,
  label = 'Phụ trách',
  empty = 'Chưa có người phụ trách',
}: {
  name?: string
  label?: string
  empty?: string
}) {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12px]">
      {name ? (
        <>
          {label}
          <Avatar name={name} card={false} size="sm" />
          <span className="text-foreground truncate">{name}</span>
        </>
      ) : (
        empty
      )}
    </span>
  )
}

/** The bottom row, pinned down so cards of one row end level. */
export function CardFoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'mt-auto flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2',
        className,
      )}
    >
      {children}
    </span>
  )
}
