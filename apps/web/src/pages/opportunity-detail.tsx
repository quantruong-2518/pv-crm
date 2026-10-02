import { useEffect, useState, type ReactNode } from 'react'
import { Inbox, Lock, TriangleAlert } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, ScreenLayout, Skeleton } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastFail } from '@/app/toast'
import { useAppChrome } from '@/app/chrome'
import type { DealEditPart } from '@/data/deal-draft'
import { leadProfileQuery } from '@/data/lead-profile'
import { eventOfferOf, opportunityProfileQuery, railOf, refusalOf } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { SignDrawer } from '@/components/sign-drawer'
import { ContactsEditDrawer } from './opportunity-contacts-edit'
import { DealEditDrawer } from './opportunity-form-card'
import { ContractsCard, DealComms, ValueStrip } from './opportunity-main'
import { journeyRungOf } from './opportunity-model'
import { DealActionBar } from './opportunity-moves'
import { DealHeader, EmptyOp } from './opportunity-parts'
import { ContactsPanel, DescriptionPanel, OwnersPanel } from './opportunity-side'
import { DealStatus } from './opportunity-status'
import { JourneyDrawer } from './workstream-drawers'
import type { TreePick } from './workstream-tree-model'

/** Module 3 · one deal's profile — `/sales/opportunities/:code` (ADR 0077 §6).
 *
 *  One place per fact, one place per action. The header names the deal; the
 *  status block says where it stands and what comes next; the main column
 *  holds its value, contracts and contact timeline; the right column (400px)
 *  holds who and what. Every action sits on the floating bar, and every edit
 *  opens a drawer — no always-open form.
 *
 *  Four ways the screen fails to draw say four different things — each is a
 *  different next step. `DealScreen` is split out so that every hook of the
 *  profile runs only once there IS a profile. */

export function OpportunityDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>,
    )
  }

  if (!op) {
    /* One `kind`, one sentence. The screen reads no numeric status and matches
       no substring of `message`: `app/api/errors.ts` classified it once for
       the whole app, and a second classifier here is a second wording. */
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'

    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Sổ của bạn không có đơn nào mang mã <span className="font-mono">{code}</span>. Có
                  thể mã sai, hoặc đơn không đứng tên bạn — hỏi người giữ đơn, hoặc mở lại từ sổ.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ cơ hội này.'
              )
            }
            onBack={() => navigate('/sales/opportunities')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<DealScreen op={op} />)
}

export default OpportunityDetailPage

// ---------------------------------------------------------------------------

/** `open: false` keeps the last part so the drawer can animate out. */
type Editing = { part: DealEditPart | 'contacts'; open: boolean; session: number }

function DealScreen({ op }: { op: OpportunityProfileResponse }) {
  const navigate = useNavigate()
  const canSeeJourney = useCan('workstream.view')

  /* The origin lead, read for real. A failure here does NOT break the screen:
     a deal stays readable when its lead is out of the reader's scope. */
  const { data: lead = null } = useQuery({
    ...leadProfileQuery(op.leadCode),
    enabled: Boolean(op.leadCode),
  })

  const [signing, setSigning] = useState(false)
  /* Which contact the letter is addressed to; `null` = composer closed. */
  const [mailTo, setMailTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [journeyPick, setJourneyPick] = useState<TreePick | null>(null)
  /* A fresh drawer per opening (`key`), so it seeds from the server's copy. */
  const edit = (part: Editing['part']) =>
    setEditing((prev) => ({ part, open: true, session: (prev?.session ?? 0) + 1 }))
  const closeEdit = () => setEditing((prev) => prev && { ...prev, open: false })

  const run = op.workstream
  const journey = useQuery({
    ...workstreamJourneyQuery(run?.code ?? ''),
    enabled: canSeeJourney && run !== null && journeyPick !== null,
  })
  /* A read that fails drops the pick: the drawer cannot open, and the next
     press must read again instead of waiting on a dead query. */
  useEffect(() => {
    if (!journey.error) return
    setJourneyPick(null)
    toastFail(
      'Không mở được workstream.',
      isApiError(journey.error) ? userMessage(journey.error) : 'Vui lòng thử lại.',
    )
  }, [journey.error])
  const openJourney =
    canSeeJourney && run
      ? () => setJourneyPick({ kind: 'deal', code: op.code, rung: journeyRungOf(op) })
      : undefined

  return (
    <ScreenLayout>
      {/* THE OBJECT CHAIN rides in the header's meta row (law 10), built by
          `E1.story()` ON THE SERVER and already cut by permission. */}
      <DealHeader
        op={op}
        lead={lead}
        rail={railOf(op.chain, op.code, navigate)}
        onBack={() => navigate('/sales/opportunities')}
        onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)}
      />

      <DealStatus op={op} />

      {/* One bottom edge: the side column stretches and its last panel grows. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ValueStrip op={op} onEdit={() => edit('terms')} />
          <ContractsCard op={op} onSign={() => setSigning(true)} onViewRequest={openJourney} />
          <DealComms op={op} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ContactsPanel op={op} onEdit={() => edit('contacts')} />
          <OwnersPanel op={op} onEdit={() => edit('owners')} />
          <DescriptionPanel op={op} onEdit={() => edit('details')} />
        </div>
      </div>

      {/* Room under the last card for the floating bar: up to three rows and
          its note on a phone, two from `sm`. */}
      <div aria-hidden className="h-56 shrink-0 sm:h-40" />

      <DealActionBar
        op={op}
        onSign={() => setSigning(true)}
        onCompose={setMailTo}
        onOpenJourney={openJourney}
        journeyOpening={journeyPick !== null && !journey.data}
      />

      <SignDrawer op={op} open={signing} onClose={() => setSigning(false)} />
      {editing && editing.part !== 'contacts' && (
        <DealEditDrawer
          key={editing.session}
          op={op}
          part={editing.part}
          open={editing.open}
          onClose={closeEdit}
        />
      )}
      {editing?.part === 'contacts' && (
        <ContactsEditDrawer key={editing.session} op={op} open={editing.open} onClose={closeEdit} />
      )}
      {journey.data && (
        <JourneyDrawer
          journey={journey.data}
          picked={journeyPick}
          onPick={setJourneyPick}
          onClose={() => setJourneyPick(null)}
          go={navigate}
        />
      )}
      {mailTo !== null && (
        <LetterComposer
          door="opportunity"
          code={op.code}
          leadCode={op.leadCode}
          deal={{
            offer: eventOfferOf(op, 'quotation'),
            block: refusalOf(op.acts.quotation),
            primaryContact: mailTo,
          }}
          onClose={() => setMailTo(null)}
        />
      )}
    </ScreenLayout>
  )
}
