import { AiMark, Chip, Icon, cn } from '@pv/ui'

/** Small pieces the assistant's panel and page share (owner, 03/11 design).
 *
 *  Three laws are bent here on the owner's word: the AI mark is drawn bare in
 *  brand ink (law 3 keeps brand blue off text, law 15 asks for `orbit`), the
 *  answer is a read-only bubble rather than an AI block (law 9 does not apply to
 *  an answer that proposes nothing), and the record card carries an inset hairline (law 4). */

/** The assistant's mark: a sparkle with no tile or ground behind it. */
export function AiGlyph({
  size = 24,
  className,
}: {
  size?: 14 | 18 | 24 | 26
  className?: string
}) {
  return <Icon icon={AiMark} size={size} className={cn('text-primary', className)} />
}

/** Sharp corner top-left points at the mark; plain card ground, a soft neutral lift, no ring.
 *  Aurora has no white: its card equals the page behind it, so the bubble takes the next ground up. */
export const BUBBLE =
  'bg-muted stone:bg-card porcelain:bg-card text-foreground shadow-[var(--shadow-card)] rounded-[6px_24px_24px_24px] px-5 py-4'

/** Inside the answer the record card is drawn by a light hairline instead of a shadow. */
export const HAIRLINE = 'ring-foreground/12 ring-1 ring-inset'

/** A record code: card ground, primary ring, mono, 24px. A button when `onOpen` is given. */
const CODE_CHIP =
  'bg-card text-accent-foreground ring-primary/45 hover:bg-accent h-6 rounded-[6px] px-2 py-0 align-baseline text-[12.5px] font-semibold ring-1 ring-inset'

export function CodeChip({
  code,
  onOpen,
  label,
  small = false,
  className,
}: {
  code: string
  onOpen?: () => void
  /** Accessible name when the chip opens the record. */
  label?: string
  small?: boolean
  className?: string
}) {
  return (
    <Chip
      variant="source"
      aria-label={label}
      className={cn(CODE_CHIP, small && 'h-5 text-[11px]', !onOpen && 'hover:bg-card', className)}
      onOpen={onOpen}
    >
      {code}
    </Chip>
  )
}
