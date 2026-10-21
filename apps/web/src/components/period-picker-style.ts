/** Class strings the overview and the workstream book share, so the two period
 *  frames cannot drift. Plain strings in a `.ts`: a component file may export
 *  components only (fast refresh). */

export const SOFT_SHADOW =
  'shadow-[0_1px_2px_color-mix(in_srgb,var(--brand-navy)_6%,transparent),0_6px_18px_color-mix(in_srgb,var(--brand-navy)_8%,transparent)]'

/** Only the measured mark moves, never the tile (the global reduced-motion
 *  rule in the token file switches it off). */
export const GROW_WIDTH = 'transition-[width] duration-(--motion-duration) ease-(--motion-ease)'
