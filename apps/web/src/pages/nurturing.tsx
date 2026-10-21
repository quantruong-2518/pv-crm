import { useSearchParams } from 'react-router-dom'
import { AppShell, ScreenLayout, SegmentedControl } from '@pv/ui'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { ContractNurtureBook } from './nurturing-contracts'
import { DealNurtureBook } from './nurturing-deals'
import { LeadNurtureBook } from './nurturing-leads'
import { NURTURE_TAB_LABEL, tabsFor, type NurtureTab } from './nurturing-model'

/** The nurturing page — `/sales/nurturing` (ADR 0109): the leads parked, the
 *  deals stopped and the contracts terminated, one tab each. The active tab
 *  lives in the address (`?tab=`); a tab the reader may not view is left out,
 *  and an address naming one falls back to the lead tab.
 *
 *  Only the active tab is mounted, so only its book is read. A row opens the
 *  record's own page, where the way back is.
 *
 *  No ContextRail (law 10 debt, as on the hold list): a list of unrelated
 *  objects has no one story to chain. */

const BOOKS: Record<NurtureTab, typeof LeadNurtureBook> = {
  lead: LeadNurtureBook,
  deal: DealNurtureBook,
  contract: ContractNurtureBook,
}

export function NurturingPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const [params, setParams] = useSearchParams()
  const available = tabsFor(useCan('opportunity.view'), useCan('contract.view'))
  const asked = params.get('tab')
  const tab = available.find((t) => t === asked) ?? 'lead'
  const Book = BOOKS[tab]

  const switcher = available.length > 1 && (
    <SegmentedControl
      label="Loại"
      hideLabel
      tone="quiet"
      value={tab}
      options={available.map((t) => ({ value: t, label: NURTURE_TAB_LABEL[t] }))}
      onChange={(value) => setParams({ tab: value })}
    />
  )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <Book tabs={switcher} />
      </ScreenLayout>
    </AppShell>
  )
}

export default NurturingPage
