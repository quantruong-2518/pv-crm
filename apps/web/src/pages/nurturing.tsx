import { useSearchParams } from 'react-router-dom'
import { AppShell, ScreenLayout, SegmentedControl } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { useI18n } from '@/app/i18n'
import { NURTURING_COPY as COPY } from '@/data/nurturing-copy'
import { RecareBook } from './nurturing-leads'
import { StopLogBook } from './nurturing-log'
import { NURTURE_TABS, type NurtureTab } from './nurturing-model'

/** The stopped-customers page — `/sales/nurturing` (ADR 0109, 0125): the parked leads to
 *  contact again, and the log of every stop decision. The tab lives in the
 *  address (`?tab=`); an unknown one falls back to the re-contact tab. Only the
 *  active tab is mounted, so only its book is read, and switching tab starts
 *  that tab's filters fresh. A row opens the record's own page.
 *
 *  No ContextRail (law 10 debt, as on the hold list): a list of unrelated
 *  objects has no one story to chain. */

export function NurturingPage() {
  const { t } = useI18n()
  const chrome = useAppChrome({ searchPlaceholder: t(COPY.chromeSearch) })
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: NurtureTab = NURTURE_TABS.find((name) => name === asked) ?? 'recare'

  const nav = (
    <SegmentedControl
      label={t(COPY.sections)}
      hideLabel
      value={tab}
      options={NURTURE_TABS.map((name) => ({ value: name, label: t(COPY.tabs[name]) }))}
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
