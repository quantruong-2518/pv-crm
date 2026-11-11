import type { MoneyFx } from '@pv/contracts'
import { cn } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { fxLineShort, fxLineText } from '@/data/fx-rate'

/** The note under a converted foreign-currency figure (ADR 0149). It wraps, so
 *  a touch screen reads all of it; only a fixed-height book cell passes
 *  `compact`, which keeps one short truncated line and the full text in `title`. */
export function FxText({
  text,
  title,
  compact = false,
  className,
}: {
  text: string
  /** The full text, when `text` is the short form of a compact cell. */
  title?: string
  compact?: boolean
  className?: string
}) {
  return (
    <span
      title={compact ? (title ?? text) : undefined}
      className={cn(
        'text-muted-foreground tnum block max-w-full text-right text-[11.5px] leading-[1.5]',
        compact && 'truncate',
        className,
      )}
    >
      {text}
    </span>
  )
}

/** The dong value and the rate it came from. Prints nothing without `fx`, so a
 *  VND row, or a server one deploy behind, shows exactly what it showed before. */
export function FxLine({
  vnd,
  fx,
  compact = false,
  className,
}: {
  /** The converted figure, in whole dong. */
  vnd: number
  fx: MoneyFx | null | undefined
  compact?: boolean
  className?: string
}) {
  const { lang } = useI18n()
  if (!fx) return null
  const full = fxLineText(vnd, fx, lang)
  return (
    <FxText
      text={compact ? fxLineShort(vnd, fx, lang) : full}
      title={full}
      compact={compact}
      className={className}
    />
  )
}
