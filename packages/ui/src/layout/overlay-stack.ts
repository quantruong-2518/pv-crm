import { useCallback, useEffect, useId } from 'react'

/** EVERY OPEN OVERLAY, IN THE ORDER THEY OPENED — asked one question only: who
 *  is on top.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS SHARED BY `Modal` AND `Drawer` RATHER THAN LIVING IN ONE
 *  ------------------------------------------------------------------
 *  Both bind Escape to `document`, and both sit at `z-50` — so whichever mounts
 *  last paints on top. Stacking them is a real case: the mail syntax guide is a
 *  Drawer, and it opens over a Drawer (the template panel) in one screen and
 *  over a Modal (the Quick MAS compose panel) in another.
 *
 *  With one unconditional handler each, a single Escape runs BOTH `onClose`
 *  callbacks: the reader dismisses a reference table and loses the half-written
 *  letter underneath it. A stack private to `Drawer` would fix the first case
 *  and quietly leave the second broken, which is the worse outcome — the bug
 *  would look fixed. One registry, both components.
 *
 *  A module-level array rather than a context: this is not state anything
 *  renders from, it is a question asked at the instant a key lands. A context
 *  would re-render every open overlay each time another one opens, to answer
 *  something that changes nothing on screen. */
const STACK: string[] = []

/** Registers this overlay while `active`, and hands back a predicate that says
 *  whether it is currently the top one.
 *
 *  `active` must be "showing and not on its way out" — an overlay mid-exit has
 *  already left the stack, so it never holds a keypress hostage from the layer
 *  below it.
 *
 *  The caller reads the answer INSIDE its key handler rather than receiving a
 *  boolean, on purpose: a boolean would be a snapshot from the last render, and
 *  the question is only meaningful at the moment the key is pressed. */
export function useOverlayLayer(active: boolean): () => boolean {
  const id = useId()

  /* Depends on `active` and `id` alone. Folding this into the caller's key
     effect would tie it to `onClose` too — usually an arrow function written
     inline at the call site, so a new identity every render — and this overlay
     would pop and re-push while sitting there unchanged, briefly making the
     layer BELOW it the top one. */
  useEffect(() => {
    if (!active) return
    STACK.push(id)
    return () => {
      const at = STACK.lastIndexOf(id)
      if (at !== -1) STACK.splice(at, 1)
    }
  }, [active, id])

  return useCallback(() => STACK[STACK.length - 1] === id, [id])
}
