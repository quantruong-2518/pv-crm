import { useNavigate } from 'react-router-dom'
import { AppShell, GlassCard, ScreenHeader, ScreenLayout } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { LeadForm } from './lead-parts'

/** Module 2 · One lead typed by hand — `/sales/leads/new`.
 *
 *  A PAGE, NOT A DRAWER. This door asks the very questions the lead profile
 *  asks, so it is that same form: one field table, one set of controls, `mode`
 *  deciding which boxes are drawn and which door writes (`LeadForm` in
 *  `lead-parts.tsx`).
 *
 *  No side cards, no ContextRail (law 10 debt): notes, next action, history
 *  and the object chain all need a lead that EXISTS to hang on. The rail
 *  picks up at `/sales/leads/:code` the moment the 201 lands.
 *
 *  Width capped at 1080px — the profile column of the detail screen takes
 *  3/4 of that grid; unbounded here would stretch one digit across a 1600px
 *  monitor. */
export function LeadNewPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout className="max-w-[1080px]">
        <GlassCard variant="b" className="p-4">
          <ScreenHeader
            back={{ label: 'Sổ lead', onClick: () => navigate('/sales/leads') }}
            title="Lead mới"
            className="gap-3 [&>div]:gap-3 [&_h2]:normal-case [&_h2]:tracking-[-.4px]"
            description="Một dòng một lần, người gõ chịu trách nhiệm từng ô. Lead vào sổ ở kho chung, chưa ai nhận — giao cho người phụ trách là một việc riêng."
          />
        </GlassCard>

        {/* The 201 carries the whole stored row, so the next stop is its own
            profile: whoever typed it sees the NORMALISED values, and the rest of
            the lead's cards open where they belong. */}
        <LeadForm mode="create" onCreated={(code) => navigate(`/sales/leads/${code}`)} />
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadNewPage
