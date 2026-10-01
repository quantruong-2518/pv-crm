/** Move focus to an element that may not be drawn yet — the button a write
 *  reveals, a panel that re-renders on the answer. Tries for a few frames, then
 *  gives up quietly: a missing target leaves focus where the browser put it.
 *
 *  Needed where an act hides its own opener (the accept button), so the
 *  closing modal has no live element to hand focus back to. */
export function focusSoon(target: () => HTMLElement | null | undefined, frames = 20): void {
  const attempt = (left: number) => {
    const el = target()
    if (el?.isConnected) {
      el.focus({ preventScroll: false })
      return
    }
    if (left > 0) requestAnimationFrame(() => attempt(left - 1))
  }
  requestAnimationFrame(() => attempt(frames))
}
