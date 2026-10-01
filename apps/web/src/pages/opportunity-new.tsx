import type { ReactNode } from 'react'
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
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { leadProfileQuery } from '@/data/lead-profile'
import { railOf } from '@/data/opportunities'
import { ConvertDialog } from '@/components/convert-dialog'
import { LeadPickList } from '@/components/lead-picker'
import { EmptyOp } from './opportunity-parts'

/** Module 3 · one deal typed by hand — `/sales/opportunities/new`.
 *
 *  A PAGE whose form is the opening drawer (`components/convert-dialog.tsx`):
 *  a deal now carries its contacts from birth, and one door asking for them is
 *  better than two that drift.
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
  const canCreate = useCan('opportunity.create')

  /* Only BD seats and heads open a deal (ADR 0071 §1). Asked here as well as at
     the route, so a Sale who types the address meets a reason, not a form. */
  if (!canCreate) {
    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            icon={Lock}
            note="Vai của bạn chưa có quyền mở cơ hội mới."
            onBack={() => navigate('/sales/opportunities')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  /* No rail on this step, by the pipeline itself: a deal is born from a lead,
     so before one is picked there is no object to chain. It appears the moment
     `?lead=` is set. */
  if (leadCode === '') {
    return shell(
      <ScreenLayout>
        <ScreenHeader
          back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
          kicker="Cơ hội"
          title="Mở cơ hội"
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

/** The header stays as the page's own face (law 10 keeps its rail); the form
 *  is the drawer every other door uses, open from the first paint. Closing it
 *  leaves the page, since a page with no form has nothing left to show. */
function NewDealScreen({ lead }: { lead: LeadProfile }) {
  const navigate = useNavigate()

  return (
    <ScreenLayout>
      <ScreenHeader
        back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
        kicker="Cơ hội"
        title="Mở cơ hội"
        description="Cơ hội mới mọc ra từ lead đang chọn. Mã do máy chủ cấp lúc tạo."
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

      <ConvertDialog
        profile={lead}
        open
        onClose={() => navigate('/sales/opportunities')}
        onCreated={(row) => navigate(`/sales/opportunities/${row.code}`)}
      />
    </ScreenLayout>
  )
}
