import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'

/** Two helpers of `Drawer`: the frame a bottom sheet rises inside, and the
 *  lock that keeps the page behind any open drawer still.
 *
 *  The lock refuses wheel and swipe instead of setting `overflow: hidden`:
 *  `:root { overflow-y: scroll }` (globals.css) makes `body` overflow a no-op,
 *  and hiding it on `html` drops the scrollbar gutter, shifting the page 9px. */

const GAP = 8
const MARGIN = 16

/** Where a bottom sheet lives. With an anchor, its bottom edge is the anchor's
 *  top edge and it is centred over the anchor, so the sheet reads as rising out
 *  of the bar that was pressed; without one, it rises from the screen's foot. */
export function useSheetFrame(
  active: boolean,
  anchor: HTMLElement | null | undefined,
  wide: boolean,
): CSSProperties | null {
  const [frame, setFrame] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!active) return
    const measure = () => {
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null
      const width = Math.min(wide ? 760 : 680, rect ? vw - 2 * MARGIN : vw)
      const centre = rect ? rect.left + rect.width / 2 : vw / 2
      const left = Math.min(Math.max(MARGIN, centre - width / 2), vw - width - (rect ? MARGIN : 0))
      setFrame({
        left: Math.max(0, left),
        width,
        top: MARGIN,
        bottom: rect ? vh - rect.top + GAP : 0,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, anchor, wide])

  return frame
}

/** True when something between `target` and the page can still scroll by
 *  `dy` — the drawer's own body, or a list popped out of it. */
function canScroll(target: EventTarget | null, dy: number): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el === document.body || el === document.documentElement) return false
    if (el.scrollHeight <= el.clientHeight) continue
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue
    if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
      return true
    }
  }
  return false
}

export function useOuterScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    let lastY = 0
    const onWheel = (e: WheelEvent) => {
      /* Pinch-zoom and sideways scroll never move the page under the scrim. */
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (!canScroll(e.target, e.deltaY)) e.preventDefault()
    }
    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? lastY
      const dy = lastY - y
      lastY = y
      if (e.touches.length === 1 && !canScroll(e.target, dy)) e.preventDefault()
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [active])
}
