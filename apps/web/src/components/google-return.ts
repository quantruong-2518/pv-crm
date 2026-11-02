import { COMPANY_MAIL_DOMAIN, type GoogleLinkStatus } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { message, translate } from '@/app/i18n'
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
    toast(
      translate(
        message(
          'Không kết nối được tài khoản Google. Thử lại.',
          'Could not connect the Google account. Try again.',
          'Google 계정을 연결하지 못했습니다. 다시 시도해 주세요.',
        ),
      ),
      { tone: 'danger' },
    )
    void queryClient.invalidateQueries({ queryKey: GOOGLE_KEY })
    return
  }
  void useSession
    .getState()
    .bootstrap()
    .then(() => queryClient.fetchQuery({ ...googleLinkQuery(), staleTime: 0 }))
    .then(connectedToast, () => connectedToast(undefined))
}

const SHARED = message(
  'Thư vẫn gửi từ hộp thư chung.',
  'Letters still go out from the shared mailbox.',
  '메일은 계속 공용 메일함에서 발송됩니다.',
)

function connectedToast(link: GoogleLinkStatus | undefined) {
  const shared = translate(SHARED)
  const done = translate(
    message(
      'Đã kết nối tài khoản Google',
      'Google account connected',
      'Google 계정을 연결했습니다',
    ),
  )
  if (link?.mail === 'needs_consent') {
    const why = message(
      `${done} nhưng chưa có quyền gửi thư qua Gmail. ${shared}`,
      `${done}, but it has no permission to send mail through Gmail. ${shared}`,
      `${done}. 다만 Gmail로 메일을 보낼 권한이 없습니다. ${shared}`,
    )
    toast(translate(why), { tone: 'warning' })
  } else if (link?.mail === 'wrong_domain') {
    const why = message(
      `${done} nhưng không phải tài khoản @${COMPANY_MAIL_DOMAIN}. ${shared}`,
      `${done}, but it is not an @${COMPANY_MAIL_DOMAIN} account. ${shared}`,
      `${done}. 다만 @${COMPANY_MAIL_DOMAIN} 계정이 아닙니다. ${shared}`,
    )
    toast(translate(why), { tone: 'warning' })
  } else toast(done, { tone: 'success' })
}
