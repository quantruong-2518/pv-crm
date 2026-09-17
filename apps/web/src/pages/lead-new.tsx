import { useNavigate } from 'react-router-dom'
import { AppShell, GlassCard, ScreenDetailGrid, ScreenHeader, ScreenLayout } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { useLeadDraft } from '@/data/lead-draft'
import { DetailSidePanel } from '@/components/detail-side-panel'
import { LeadActivityCard } from '@/components/lead-activity-card'
import { LeadToolsBar } from '@/components/lead-tools-bar'
import { OwnerSourceCard } from '@/components/owner-source-card'
import { LeadForm, NextActionCard, SaveStateNote } from './lead-parts'

/** Module 2 · One lead typed by hand — `/sales/leads/new`.
 *
 *  A PAGE, NOT A DRAWER, and the SAME GRID as the profile it becomes: one
 *  draft, the form card on the left, holder and origin on the right. Somebody
 *  who types a lead and then opens it finds every box where they left it.
 *
 *  The two blocks that need a lead to hang on — activity and next action —
 *  stand `locked`: drawn, named, and saying they open once the lead exists.
 *  Not dimmed with `opacity-*`, which is how a screen loses law 13's 4.5:1.
 *
 *  No ContextRail (law 10, acknowledged debt): the object chain needs an object.
 *  The rail picks up at `/sales/leads/:code` the moment the 201 lands.
 *
 *  Buttons live in `LeadToolsBar` only — the sticky bar is where the screen's
 *  primary action belongs, and two submit buttons are two answers. */
export function LeadNewPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  /* The 201 carries the whole stored row, so the next stop is its own profile:
     whoever typed it sees the NORMALISED values. */
  const draft = useLeadDraft({
    mode: 'create',
    onCreated: (code) => navigate(`/sales/leads/${code}`),
  })

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <GlassCard variant="b" className="p-4">
          <ScreenHeader
            back={{ label: 'Sổ lead', onClick: () => navigate('/sales/leads') }}
            title="Lead mới"
            className="gap-3 [&>div]:gap-3 [&_h2]:tracking-[-.4px]"
            description="Một dòng một lần, người gõ chịu trách nhiệm từng ô. Lead vào sổ ở kho chung, chưa ai nhận — giao cho người phụ trách là một việc riêng."
            meta={<SaveStateNote state={draft.saveState} />}
          />
        </GlassCard>

        <ScreenDetailGrid
          sideLabel="Phụ trách và việc tiếp theo"
          className="w-full"
          sideClassName="relative xl:self-stretch"
          sideFirst
          main={
            <>
              <LeadForm draft={draft} code={null} />
              <LeadActivityCard locked />
            </>
          }
          side={
            <DetailSidePanel>
              <NextActionCard lead={null} locked />
              <OwnerSourceCard mode="create" draft={draft} />
            </DetailSidePanel>
          }
        />

        <LeadToolsBar mode="create" draft={draft} />
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadNewPage
