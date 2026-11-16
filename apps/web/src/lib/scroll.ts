/** Smooth scroll to a card on the same screen; jumps at once for a reader who
 *  asked the system for less motion. */
export function scrollToId(id: string): void {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
}
