import type { Params } from 'react-router-dom'
import type { Branch, Permission } from '@pv/engines'
import { access, useSession } from '@/app/auth'

/** Render-as-you-fetch for the router: a matched screen starts its chunk and
 *  its main read together, instead of the read waiting for the chunk to land
 *  and mount. Runs from the route `loader`, never awaited, so navigation is
 *  not held. It waits out `booting` and asks the same gate `RequireAccess`
 *  asks, so a refused screen still downloads nothing (see `routes.tsx`). */

type Warmable = {
  load: () => Promise<unknown>
  warm?: (params: Params) => Promise<unknown>
  branch?: Branch
  permission?: Permission
}

const booted = () =>
  new Promise<void>((resolve) => {
    if (useSession.getState().status !== 'booting') return resolve()
    const stop = useSession.subscribe((now) => {
      if (now.status === 'booting') return
      stop()
      resolve()
    })
  })

export function warmScreen(screen: Warmable, params: Params): null {
  void booted().then(() => {
    const { status, actor } = useSession.getState()
    const need = { branch: screen.branch ?? null, permission: screen.permission }
    if (status !== 'signed-in' || !access.check(actor, need).ok) return
    void screen.load()
    void screen.warm?.(params)
  })
  return null
}
