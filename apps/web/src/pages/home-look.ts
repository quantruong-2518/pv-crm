/** Motion and surface recipes shared by every tile of the overview (`home*.tsx`),
 *  ADR 0106 §5a.
 *
 *  Motion: a card enters at the system beat (`--motion-duration`); a data mark
 *  grows in or slides to a new value in MARK_EASE, and a row of marks staggers
 *  over a fixed span whatever its count, so the screen settles within one mark
 *  plus that span. Cards never move on hover; only what is clickable reacts.
 *  Surfaces: one 135° wash from the card colour into a faint tone, from tokens
 *  only, so each theme paints it in its own palette. No glow, blur or tinted
 *  shadow: elevation is `--shadow-card` (porcelain's bento level, ADR 0108 §4;
 *  the panel shadow in Aurora and stone). */

/** Card entry: fade in and rise 8px. */
export const ENTER =
  'starting:translate-y-2 starting:opacity-0 transition-[opacity,translate] duration-(--motion-duration) ease-(--motion-ease) motion-reduce:transition-none'

/** The card shell of every bento tile. */
export const CARD = `rounded-3xl [box-shadow:var(--shadow-card)] ${ENTER}`

/** A data mark carries a value, so it grows slower than the UI beat: long enough
 *  to follow, short enough to be done before the eye lands. Add the property list. */
export const MARK_EASE = 'duration-450 ease-(--motion-ease) motion-reduce:transition-none'

/** The last mark of a row starts this late, however many marks the row has: short
 *  enough that a row reads as one wave rather than a sequence. */
const STAGGER_SPAN_MS = 120

/** Delay of mark `index` in a row of `count`, spread evenly over the stagger span. */
export const staggerMs = (index: number, count: number): number =>
  count > 1 ? Math.round((index / (count - 1)) * STAGGER_SPAN_MS) : 0

/** A layer that IS the marks (the week chart's lines and dots) fades in as one. */
export const MARK_FADE = `starting:opacity-0 transition-opacity ${MARK_EASE}`

/** A layer drawn over marks (a running-total line) waits until they have mostly grown. */
export const LATE_MS = 300
export const LATE_FADE =
  'starting:opacity-0 transition-opacity duration-(--motion-duration) ease-(--motion-ease) motion-reduce:transition-none'

/* Card washes: the card colour holds through the top-left, where title and figure
   sit, then fades to a faint tone in the far corner. Both stops are opaque:
   tailwind-merge 2.6 drops `bg-card` beside `bg-linear-*`, letting the page show through. */
export const WASH =
  'bg-[linear-gradient(135deg,var(--card)_40%,color-mix(in_srgb,var(--primary)_5%,var(--card)))]'
/** The hero is the one focal card, so its tone is twice as strong. */
export const WASH_HERO =
  'bg-[linear-gradient(135deg,var(--card)_30%,color-mix(in_srgb,var(--primary)_10%,var(--card)))]'
/** A card whose figure asks for attention. A light theme's dark warning mixed this
 *  thin reads as a faint beige, so it takes a little more than the hero's tone. */
export const WASH_WARN =
  'bg-[linear-gradient(135deg,var(--card)_30%,color-mix(in_srgb,var(--warning)_12%,var(--card)))]'

/** Icon tiles: the same 135° ramp at /20 to /8, glyph in the `on-tint-*` ink that
 *  every theme measures for text inside its own tint. */
export const ICON_TONE = {
  primary: 'bg-linear-to-br from-primary/20 to-primary/8 text-on-tint-primary',
  success: 'bg-linear-to-br from-success/20 to-success/8 text-on-tint-success',
  warning: 'bg-linear-to-br from-warning/20 to-warning/8 text-on-tint-warning',
  destructive: 'bg-linear-to-br from-destructive/20 to-destructive/8 text-on-tint-destructive',
  neutral: 'bg-linear-to-br from-surface-ink/10 to-surface-ink/4 text-muted-foreground',
} as const

export type IconTone = keyof typeof ICON_TONE
