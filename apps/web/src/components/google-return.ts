import { COMPANY_MAIL_DOMAIN, type GoogleLinkStatus } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { queryClient } from '@/app/query-client'
import { GOOGLE_KEY, googleLinkQuery } from '@/data/google'

/** Reads `?google=connected|failed` once, when the server sends the browser back
 *  from the OAuth callback (`platform/google`), then removes it from the URL.
 *
 *  Runs at module load of `app-toasts.tsx`, which `main.tsx` imports before
 *  `routes`: the param is gone before the router reads the location, so a
 *  redirect from `/` cannot carry it away and a refresh cannot replay the toast.
 *
 *  A link can succeed and still not carry mail (Gmail unticked, or a private
 *  account), so the toast is chosen from the status read back, not from the
 *  param. That read waits for the session boot: at module load no call passes. */
export function consumeGoogleReturn() {
  const url = new URL(window.location.href)
  const result = url.searchParams.get('google')
  if (result !== 'connected' && result !== 'failed') return

  url.searchParams.delete('google')
  window.history.replaceState(window.history.state, '', url)

  if (result === 'failed') {
    toast('Không kết nối được tài khoản Google. Vui lòng thử lại.', { tone: 'warning' })
    void queryClient.invalidateQueries({ queryKey: GOOGLE_KEY })
    return
  }
  void useSession
    .getState()
    .bootstrap()
    .then(() => queryClient.fetchQuery({ ...googleLinkQuery(), staleTime: 0 }))
    .then(connectedToast, () => connectedToast(undefined))
}

const SHARED = 'Thư vẫn gửi từ hộp thư chung.'

function connectedToast(link: GoogleLinkStatus | undefined) {
  const done = 'Đã kết nối tài khoản Google'
  if (link?.mail === 'needs_consent') {
    toast(`${done} nhưng chưa có quyền gửi thư qua Gmail. ${SHARED}`, { tone: 'warning' })
  } else if (link?.mail === 'wrong_domain') {
    toast(`${done} nhưng không phải tài khoản @${COMPANY_MAIL_DOMAIN}. ${SHARED}`, {
      tone: 'warning',
    })
  } else toast(done, { tone: 'success' })
}
