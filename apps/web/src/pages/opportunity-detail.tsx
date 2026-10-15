import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@pv/ui'
import {
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import type { DealEditPart } from '@/data/deal-draft'
import { eventOfferOf, opportunityProfileQuery, railOf, refusalOf } from '@/data/opportunities'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { FailLogCard, StopDrawer } from '@/components/opportunity-stop'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { MeetingsDock } from '@/components/meetings-dock'
import { useDockRow } from '@/data/meeting-upcoming'
import { ActionBar } from '@/components/record/action-bar'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { SignDrawer } from '@/components/sign-drawer'
import { DealEventModal } from './opportunity-events'
import { DealHistoryCard } from './opportunity-history'
import { SIGN_LABEL, dealMoreChoices, primaryStateOf, viewSignRequest } from './opportunity-model'
import { DealEditDrawer } from './opportunity-form-card'
import { SignRequestCard } from './opportunity-main'
import { DealMoney } from './opportunity-money'
import { useDealMoney } from './opportunity-money-state'
import { DealHeader } from './opportunity-parts'
import { DealRail } from './opportunity-rail'
import { QuotationModal } from './opportunity-quotation-modal'
import { DescriptionPanel } from './opportunity-side'
import { DealTodo } from './opportunity-status'

/** Module 3 · one deal's profile — `/sales/opportunities/:code`, on the
 *  record shell (ADR 0078): run strip, header, then the body — stepper,
 *  sign request, money and contracts, history, description — and the run rail —
 *  comms, quotations, people, files. Quoting and signing sit in the header; the
 *  floating bar reaches contacts and holds the next meeting.
 *
 *  Every edit opens a drawer — no always-open form. `DealScreen` is split out
 *  so that every hook of the profile runs only once there IS a profile. */

export function OpportunityDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {op ? (
        <DealScreen op={op} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Không có cơ hội mã ${code} trong sổ của bạn.`,
            fallback: 'Không mở được hồ sơ cơ hội.',
            back: { label: 'Về sổ cơ hội', onClick: () => navigate('/sales/opportunities') },
          }}
        />
      )}
    </AppShell>
  )
}

export default OpportunityDetailPage

// ---------------------------------------------------------------------------

/** `open: false` keeps the last part so the drawer can animate out. */
type Editing = { part: DealEditPart; open: boolean; session: number }
/** A fresh modal per opening (`session` is its key), so its form starts clean. */
type Recording = { open: boolean; session: number }
/** `negotiation: null` = a new negotiation; kept while closing, as `Editing`. */
type Quoting = { negotiation: OpportunityMoneyNegotiation | null; open: boolean; session: number }

function DealScreen({ op }: { op: OpportunityProfileResponse }) {
  const navigate = useNavigate()
  const [signing, setSigning] = useState(false)
  /* The waiting round the sign press came from; `''` = the header's own press. */
  const [signOn, setSignOn] = useState('')
  const [stopping, setStopping] = useState(false)
  const [assigning, setAssigning] = useState(false)
  /* Which contact the letter is addressed to; `null` = composer closed. */
  const [mailTo, setMailTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [recording, setRecording] = useState<Recording>({ open: false, session: 0 })
  const [quoting, setQuoting] = useState<Quoting>({ negotiation: null, open: false, session: 0 })
  /* A fresh drawer per opening (`key`), so it seeds from the server's copy. */
  const edit = (part: Editing['part']) =>
    setEditing((prev) => ({ part, open: true, session: (prev?.session ?? 0) + 1 }))
  const closeEdit = () => setEditing((prev) => prev && { ...prev, open: false })
  const record = () => setRecording((prev) => ({ open: true, session: prev.session + 1 }))
  const quote = (negotiation: OpportunityMoneyNegotiation | null) =>
    setQuoting((prev) => ({ negotiation, open: true, session: prev.session + 1 }))
  const quoteNew = () => quote(null)
  const sign = (quotationId = '') => {
    setSignOn(quotationId)
    setSigning(true)
  }

  const canAccept = useCan('opportunity.accept')
  const canClose = useCan('opportunity.close')
  /* Nothing is booked on a lost deal, the same rule that drops its bar. */
  const canMeet = useCan('opportunity.edit') && op.state !== 'lost'
  /* The history card's own gate; the sign request's door points into it. */
  const historyOpen = useCan('workstream.view') && op.workstream !== null
  const primary = primaryStateOf(op, { accept: canAccept, close: canClose })
  const more = dealMoreChoices(op, {
    onRecord: record,
    onEditOwners: () => edit('owners'),
    onStop: () => setStopping(true),
  })
  const subject = { kind: 'opportunity', code: op.code } as const
  const money = useDealMoney(op, quote)
  const dockRow = useDockRow(subject, canMeet)

  return (
    <RecordShell
      strip={
        <RunStrip
          workstreamCode={op.workstream?.code ?? null}
          current={{ kind: 'opportunity', code: op.code }}
          fallback={railOf(op.chain, op.code, navigate)}
        />
      }
      header={<DealHeader op={op} primary={primary} onSign={() => sign()} onQuote={quoteNew} />}
      main={
        <>
          {op.state === 'lost' && <MeetingsDock subject={subject} canEdit={false} />}
          <DealTodo op={op} />
          {op.state === 'lost' && <FailLogCard op={op} />}
          <SignRequestCard op={op} onView={historyOpen ? viewSignRequest : undefined} />
          <DealMoney
            op={op}
            state={money}
            sign={primary.sign && { label: SIGN_LABEL[primary.sign], onSign: sign }}
            onEdit={() => edit('terms')}
          />
          <DealHistoryCard op={op} />
          <DescriptionPanel op={op} onEdit={() => edit('details')} />
        </>
      }
      railLabel="Lịch sử liên hệ, báo giá, người liên hệ và tài liệu của cơ hội"
      rail={
        <DealRail
          op={op}
          money={money}
          assignHere={op.state === 'open' && op.acts.assign.ok && primary.move !== 'assign'}
          onAssign={() => setAssigning(true)}
        />
      }
      /* A lost deal has no bar: nothing is recorded on it, nobody is contacted
         from it, and its more menu is empty. Its meetings stay readable as a
         row at the top of the main column. */
      actionBarRows={dockRow ? 2 : 1}
      actionBar={
        op.state !== 'lost' && (
          <ActionBar
            label="Thao tác cơ hội"
            subject={{ code: op.code, kind: 'opportunity' }}
            contacts={op.contacts.map((c) => ({
              ...c,
              role: c.role && OPPORTUNITY_CONTACT_ROLE_LABEL[c.role],
            }))}
            onCompose={(contact) => setMailTo(contact.code ?? null)}
            more={more}
            top={<MeetingsDock subject={subject} canEdit={canMeet} />}
          />
        )
      }
    >
      {money.layers}
      <SignDrawer
        op={op}
        open={signing}
        quotationId={signOn || undefined}
        onClose={() => setSigning(false)}
      />
      <StopDrawer op={op} open={stopping} onClose={() => setStopping(false)} />
      <AssignSaleButton
        op={op}
        hasSeller={op.hasSeller}
        open={assigning}
        onClose={() => setAssigning(false)}
      />
      <DealEventModal
        key={recording.session}
        op={op}
        open={recording.open}
        onClose={() => setRecording((prev) => ({ ...prev, open: false }))}
      />
      <QuotationModal
        key={`quote-${quoting.session}`}
        op={op}
        negotiation={quoting.negotiation}
        open={quoting.open}
        onClose={() => setQuoting((prev) => ({ ...prev, open: false }))}
      />
      {editing && (
        <DealEditDrawer
          key={editing.session}
          op={op}
          part={editing.part}
          open={editing.open}
          onClose={closeEdit}
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
    </RecordShell>
  )
}
