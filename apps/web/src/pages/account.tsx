import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ScreenHeader } from '@pv/ui'
import { useSession } from '@/app/auth'
import { myApprovalsQuery } from '@/data/approvals'
import { googleLinkQuery } from '@/data/google'
import { SettingsShell } from '@/components/settings-shell'
import { IdentityBlock, PermissionBlock, RequestsBlock, SignInBlock } from './account-parts'

/** One Core · "my account" — the one place for what is about the reader, and
 *  where the bell sends "your access changed", "your password was reset",
 *  "your Google link broke" and "your request was decided" (owner, 11/10/2026).
 *
 *  Every read is real and asked again on arrival, the session included: the
 *  reader comes here because something just changed elsewhere.
 *
 *  Lives inside the settings frame, which owns the ContextRail question (law 10)
 *  and the background (law 12); nothing here paints either. */
export default function AccountScreen() {
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
    <SettingsShell>
      <ScreenHeader title="Tài khoản của tôi" />
      {actor ? <IdentityBlock actor={actor} /> : null}
      <SignInBlock link={link} />
      {actor ? <PermissionBlock actor={actor} /> : null}
      <RequestsBlock requests={requests} />
    </SettingsShell>
  )
}
