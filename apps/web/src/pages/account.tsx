import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ScreenHeader, ScreenLayout } from '@pv/ui'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { myApprovalsQuery } from '@/data/approvals'
import { googleLinkQuery } from '@/data/google'
import { GoogleBlock, IdentityBlock, PasswordBlock, RequestsBlock } from './account-parts'

/** One Core · "my account" — the one place for what is about the reader, and
 *  where the bell sends "your access changed", "your password was reset",
 *  "your Google link broke" and "your request was decided" (owner, 11/10/2026).
 *
 *  Every read is real and asked again on arrival, the session included: the
 *  reader comes here because something just changed elsewhere.
 *
 *  No ContextRail (law 10), like `/settings` and `/approvals`: the screen is
 *  about a person, not an E1 object with a story to chain. The background is
 *  the shell's own glow (law 12); nothing here paints another. */
export default function AccountScreen() {
  const chrome = useAppChrome()
  const { hash } = useLocation()
  /* One actor: the store's. It is re-asked on arrival, so the menu, the gates
     and this screen change together when the reader's access has changed. */
  const actor = useSession((s) => s.actor)
  const refresh = useSession((s) => s.refresh)
  const [asked, setAsked] = useState(false)
  useEffect(() => void refresh().finally(() => setAsked(true)), [refresh])
  /* Same key as the meeting panel and the composer, which never re-ask. */
  const link = useQuery({ ...googleLinkQuery(), staleTime: 0 })
  const requests = useQuery(myApprovalsQuery())

  /* Runs again once every read settles: a block that changes height moves the
     ones below it. The reduced-motion rule stops CSS motion only. */
  const settled = asked && !link.isPending && !requests.isPending
  useEffect(() => {
    if (!hash) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(hash.slice(1))
      ?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [hash, settled])

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core"
          title="Tài khoản của tôi"
          description="Thông tin về bạn, mật khẩu, kết nối Google và các yêu cầu bạn đã gửi."
        />
        {actor ? <IdentityBlock actor={actor} /> : null}
        <div className="grid items-start gap-4 md:grid-cols-2">
          <PasswordBlock />
          <GoogleBlock link={link} />
        </div>
        <RequestsBlock requests={requests} />
      </ScreenLayout>
    </AppShell>
  )
}
