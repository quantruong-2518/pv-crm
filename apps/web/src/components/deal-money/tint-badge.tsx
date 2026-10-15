import { Badge, cn, type BadgeProps } from '@pv/ui'

/** A Badge that sits on a tinted card, tile or row. The plain badge is a 20%
 *  tint, and on a tint of the same colour the two stack and the ink drops
 *  under 4.5:1 on the light theme (law 13). Here the tint is mixed into the
 *  plain card colour first, so the pill measures as it does on a plain card. */
const BASE = {
  draft: 'bg-[color-mix(in_srgb,var(--brand-slate)_28%,var(--card))]',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_20%,var(--card))]',
  success: 'bg-[color-mix(in_srgb,var(--success)_20%,var(--card))]',
  running: 'bg-[color-mix(in_srgb,var(--primary)_24%,var(--card))]',
  danger: 'bg-[color-mix(in_srgb,var(--destructive)_20%,var(--card))]',
} as const

export function TintBadge({ tone = 'draft', className, ...props }: BadgeProps) {
  return <Badge tone={tone} className={cn(BASE[tone ?? 'draft'], className)} {...props} />
}
