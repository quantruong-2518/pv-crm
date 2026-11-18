import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ContextRail, ScreenHeader, ScreenLayout, cn } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { myApprovalsQuery, pendingApprovalsQuery } from '@/data/approvals'
import { opportunityProfileQuery } from '@/data/opportunities'
import { ApprovalDetail } from './approvals-detail'
import { ApprovalListPanel } from './approvals-list'
import { railOf, signedCodeOf, sortOldestFirst, type ApprovalTab } from './approvals-model'

/** One Core · the approval inbox — pipeline #10, a queue of PEOPLE.
 *
 *  List beside detail from `md`; on a phone the detail takes the list's place.
 *  The open request lives in `?id=` and the tab in `?tab=`, so back works.
 *
 *  A queue, not a pipeline (ADR 0015): no stages, a request is waiting on you
 *  or it has left. The reader decides on `consequence`, the one sentence the
 *  branch wrote when raising it; the payload never crosses the wire.
 *
 *  ContextRail (law 10) is the open request's linked objects. A settings change
 *  links none, so its rail is empty: law 10 debt, as on the holds book.
 *
 *  `ApprovalCard` (O-04) is not used: it puts an amount on the primary button,
 *  and a settings change has none to print. */
export default function ApprovalInboxScreen() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const mayReadDeal = useCan('opportunity.view')
  const [params, setParams] = useSearchParams()
  const tab: ApprovalTab = params.get('tab') === 'sent' ? 'sent' : 'waiting'
  const id = params.get('id')

  const pending = useQuery(pendingApprovalsQuery())
  /* The sent list is read only when its tab opens. */
  const mine = useQuery({ ...myApprovalsQuery(), enabled: tab === 'sent' })
  const active = tab === 'sent' ? mine : pending
  const rows = useMemo(
    () => (tab === 'waiting' && active.data ? sortOldestFirst(active.data) : active.data),
    [tab, active.data],
  )

  /* Desktop opens on the first row; a phone shows the detail only for a real `?id=`. */
  const opened = rows?.find((row) => row.id === id)
  const selected = opened ?? rows?.[0]
  const phoneDetail = Boolean(opened)

  /* Same key as the detail's related block, so one read serves both. */
  const dealCode = selected ? signedCodeOf(selected) : undefined
  const deal = useQuery({
    ...opportunityProfileQuery(dealCode ?? ''),
    enabled: Boolean(dealCode) && mayReadDeal,
  })
  const railObjects = selected ? railOf(selected, deal.data, navigate) : []
  const rail = railObjects.length > 0 ? <ContextRail objects={railObjects} /> : undefined
  const split = Boolean(selected && rows)

  const go = (next: { tab?: ApprovalTab; id?: string | null }) => {
    const query = new URLSearchParams()
    if ((next.tab ?? tab) === 'sent') query.set('tab', 'sent')
    if (next.id) query.set('id', next.id)
    setParams(query)
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(message('Hộp duyệt', 'Approvals', '승인함'))}
          context={rail ? <div className="max-md:hidden">{rail}</div> : undefined}
          className={phoneDetail ? 'hidden md:flex' : undefined}
        />
        {phoneDetail && rail ? <div className="md:hidden">{rail}</div> : null}
        <div
          className={cn(
            'grid gap-5',
            split &&
              'md:h-[calc(100dvh-17rem)] md:min-h-[26rem] md:grid-cols-[344px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:h-[calc(100dvh-13rem)]',
          )}
        >
          <ApprovalListPanel
            tab={tab}
            onTab={(next) => go({ tab: next })}
            waitingCount={pending.data?.length}
            query={active}
            rows={rows}
            selectedId={selected?.id}
            onPick={(next) => go({ id: next })}
            className={phoneDetail ? 'hidden md:flex' : undefined}
          />
          {selected && rows ? (
            <ApprovalDetail
              key={selected.id}
              request={selected}
              tab={tab}
              index={rows.indexOf(selected)}
              total={rows.length}
              onBack={() => go({ id: null })}
              className={phoneDetail ? undefined : 'hidden md:flex'}
            />
          ) : null}
        </div>
      </ScreenLayout>
    </AppShell>
  )
}
