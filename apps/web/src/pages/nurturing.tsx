import { useSearchParams } from 'react-router-dom'
import { AppShell, ScreenLayout, SegmentedControl } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { RecareBook } from './nurturing-leads'
import { StopLogBook } from './nurturing-log'
import { NURTURE_TABS, NURTURE_TAB_LABEL, type NurtureTab } from './nurturing-model'

/** The stopped-customers page — `/sales/nurturing` (ADR 0109, 0125): the parked leads to
 *  contact again, and the log of every stop decision. The tab lives in the
 *  address (`?tab=`); an unknown one falls back to the re-contact tab. Only the
 *  active tab is mounted, so only its book is read, and switching tab starts
 *  that tab's filters fresh. A row opens the record's own page.
 *
 *  No ContextRail (law 10 debt, as on the hold list): a list of unrelated
 *  objects has no one story to chain. */

export function NurturingPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: NurtureTab = NURTURE_TABS.find((t) => t === asked) ?? 'recare'

  const nav = (
    <SegmentedControl
      label="Mục"
      hideLabel
      value={tab}
      options={NURTURE_TABS.map((t) => ({ value: t, label: NURTURE_TAB_LABEL[t] }))}
      onChange={(value) => setParams({ tab: value })}
    />
  )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {tab === 'log' ? <StopLogBook nav={nav} /> : <RecareBook nav={nav} />}
      </ScreenLayout>
    </AppShell>
  )
}

export default NurturingPage
