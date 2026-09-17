import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Screen background — ONE layer (law 12 · docs/design-system/laws.md):
 *  the aurora glow along the top edge, masked out downwards. Placed on the
 *  OUTERMOST frame of a screen, pointer-events: none.
 *
 *  Pebble Aurora keeps the gradient as light and drops the pattern, so the
 *  32px grid, the 160px grid and the noise grain of Aurora v2 are gone. The
 *  glow itself is static — see `.aurora-glow` in packages/tokens/globals.css.
 *
 *  **`overflow-clip`, not `overflow-hidden`.** Both clip the same, but
 *  `hidden` creates a scroll box, and a scroll box on the OUTERMOST frame
 *  makes every `position: sticky` inside the screen anchor to that box
 *  instead of the window — it then never sticks. The contact + next action
 *  bar at the foot of the lead profile was the first to hit it.
 *  `overflow: clip` clips without creating a scroll box. */
export function AuroraField({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('aurora-field relative min-h-screen overflow-clip', className)}>
      <div className="aurora-glow" />
      {children}
    </div>
  )
}
