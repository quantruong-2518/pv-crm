import { useMemo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Lock, TriangleAlert } from '@pv/ui'
import {
  AppShell,
  ContextRail,
  GlassCard,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Skeleton,
} from '@pv/ui'
import { campaignLabel, type LeadProfile } from '@pv/contracts'
import { draftOpportunity } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { useDirectory } from '@/data/directory'
import { leadProfileQuery, profileForm } from '@/data/lead-profile'
import { railOf } from '@/data/opportunities'
import { useDealDraft } from '@/data/deal-draft'
import { LeadPickList } from '@/components/lead-picker'
import { DealFormCard } from './opportunity-form-card'
import { DealToolsBar, EmptyOp } from './opportunity-parts'

/** Module 3 · one deal typed by hand — `/sales/opportunities/new`.
 *
 *  A PAGE with the SAME form card the profile uses, exactly as `lead-new.tsx`
 *  shares `LeadForm`: somebody who types a deal and then opens it finds every
 *  box where they left it.
 *
 *  WHICH LEAD COMES FIRST, always. `POST /sales/opportunities` requires a
 *  `leadCode`, and the lead profile is what seeds the form — reached without
 *  `?lead=`, this screen draws the picker instead of an empty ticket.
 *
 *  The 201 carries the whole stored row, so the next stop is that deal's own
 *  profile: whoever typed it sees the code the SERVER issued. */

export function OpportunityNewPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const leadCode = params.get('lead') ?? ''

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  /* No rail on this step, by the pipeline itself: a deal is born from a lead,
     so before one is picked there is no object to chain. It appears the moment
     `?lead=` is set. */
  if (leadCode === '') {
    return shell(
      <ScreenLayout>
        <ScreenHeader
          back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
          kicker="Cơ hội"
          title="Cơ hội mới"
        />
        <GlassCard variant="b" className="flex flex-col gap-5 p-4 sm:p-5 lg:p-6">
          <SectionTitle
            size="detail"
            hint="Một cơ hội mọc ra từ một lead. Chọn lead trước — phiếu mở ngay sau, đã mồi sẵn tên, tiền và người bán của khách đó."
          >
            Đơn này của khách nào
          </SectionTitle>
          {/* The lead rides on the ADDRESS, so a half-filled ticket survives a
              reload and a link to it opens on the right customer. */}
          <LeadPickList
            onPick={(lead) => setParams({ lead: lead.code })}
            onGiveUp={() => navigate('/sales/leads')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<NewDealGate leadCode={leadCode} />)
}

export default OpportunityNewPage

// ---------------------------------------------------------------------------

/** The lead has to arrive before the form can be seeded, so the three ways
 *  that read fails each say what to do next — the same four-branch shape the
 *  deal profile runs on, minus the one that needs a deal. */
function NewDealGate({ leadCode }: { leadCode: string }) {
  const navigate = useNavigate()
  const { data: lead, isPending, error } = useQuery(leadProfileQuery(leadCode))

  if (isPending) {
    return (
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>
    )
  }

  if (!lead) {
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'

    return (
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Không có lead nào mang mã <span className="font-mono">{leadCode}</span> — một cơ
                  hội phải mọc ra từ một lead có thật.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ lead này.'
              )
            }
            onBack={() => navigate('/sales/opportunities')}
          />
        </GlassCard>
      </ScreenLayout>
    )
  }

  return <NewDealScreen lead={lead} />
}

function NewDealScreen({ lead }: { lead: LeadProfile }) {
  const navigate = useNavigate()
  const staff = useDirectory()

  /* Through `useMemo` so the seed keeps its reference: react-query hands back
     the same profile between renders, so the draft must not re-seed over a box
     already being typed into. */
  const form = useMemo(() => profileForm(lead), [lead])
  const seed = useMemo(() => draftOpportunity(form, staff), [form, staff])

  const draft = useDealDraft({
    saved: seed,
    op: null,
    leadCode: lead.code,
    onCreated: (row) => navigate(`/sales/opportunities/${row.code}`),
  })

  return (
    <ScreenLayout>
      <ScreenHeader
        back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
        kicker="Cơ hội"
        title="Cơ hội mới"
        description="Phiếu này tạo một dòng mới trong sổ cơ hội và nối nó vào đúng lead đang chọn. Mã do máy chủ cấp lúc lưu."
        meta={
          <>
            {/* Law 10 — the chain of the LEAD this deal will join, in the SAME
                row as the provenance pills. The deal has no chip of its own
                until the 201 lands on its profile. */}
            <ContextRail objects={railOf(lead.chain, lead.code, navigate)} />
            <MetaPill>{lead.province ?? '—'}</MetaPill>
            <MetaPill>{campaignLabel(lead.source)}</MetaPill>
          </>
        }
      />

      <DealFormCard draft={draft} />

      <DealToolsBar draft={draft} op={null} onSign={() => undefined} />
    </ScreenLayout>
  )
}
