import { toast } from '@/app/toast'
import { queryClient } from '@/app/query-client'
import { GOOGLE_KEY } from '@/data/google'

/** Reads `?google=connected|failed` once, when the server sends the browser back
 *  from the OAuth callback (`platform/google`), then removes it from the URL.
 *
 *  Runs at module load of `app-toasts.tsx`, which `main.tsx` imports before
 *  `routes`: the param is gone before the router reads the location, so a
 *  redirect from `/` cannot carry it away and a refresh cannot replay the toast. */
export function consumeGoogleReturn() {
  const url = new URL(window.location.href)
  const result = url.searchParams.get('google')
  if (result !== 'connected' && result !== 'failed') return

  url.searchParams.delete('google')
  window.history.replaceState(window.history.state, '', url)

  if (result === 'connected') toast('Đã nối Google Calendar', { tone: 'success' })
  else toast('Không nối được Google Calendar. Vui lòng thử lại.', { tone: 'warning' })
  void queryClient.invalidateQueries({ queryKey: GOOGLE_KEY })
}
