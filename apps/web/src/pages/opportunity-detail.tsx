import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@pv/ui'
import { OPPORTUNITY_CONTACT_ROLE_LABEL, type OpportunityProfileResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import type { DealEditPart } from '@/data/deal-draft'
import {
  eventOfferOf,
  opportunityProfileQuery,
  railOf,
  refusalOf,
  type EventKind,
} from '@/data/opportunities'
import { leadProfileQuery } from '@/data/lead-profile'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { FailLogCard, StopDrawer } from '@/components/opportunity-stop'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { ActionBar } from '@/components/record/action-bar'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners } from '@/components/run/run-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { RunFiles } from '@/components/run/run-files'
import { SignDrawer } from '@/components/sign-drawer'
import { DealEventModal } from './opportunity-events'
import { DealHistoryCard } from './opportunity-history'
import { dealMoreChoices, primaryStateOf, quoteLabelOf, viewSignRequest } from './opportunity-model'
import { DealEditDrawer } from './opportunity-form-card'
import { ContractsCard, ValueStrip } from './opportunity-main'
import { DealHeader } from './opportunity-parts'
import { DescriptionPanel } from './opportunity-side'
import { DealTodo } from './opportunity-status'

/** Module 3 · one deal's profile — `/sales/opportunities/:code`, on the
 *  record shell (ADR 0078): run strip, header, then the body — todo card,
 *  value, contracts, history, description — and the run rail — comms, people,
 *  files. The floating bar only reaches contacts; its more menu holds the rest.
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
            notFound: `Sổ của bạn không có đơn nào mang mã ${code}. Có thể mã sai, hoặc đơn không đứng tên bạn — hỏi người giữ đơn, hoặc mở lại từ sổ.`,
            fallback: 'Không đọc được hồ sơ cơ hội này.',
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
type Recording = { kind: EventKind | null; session: number }

function DealScreen({ op }: { op: OpportunityProfileResponse }) {
  const navigate = useNavigate()
  const [signing, setSigning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [assigning, setAssigning] = useState(false)
  /* Which contact the letter is addressed to; `null` = composer closed. */
  const [mailTo, setMailTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [recording, setRecording] = useState<Recording>({ kind: null, session: 0 })
  /* A fresh drawer per opening (`key`), so it seeds from the server's copy. */
  const edit = (part: Editing['part']) =>
    setEditing((prev) => ({ part, open: true, session: (prev?.session ?? 0) + 1 }))
  const closeEdit = () => setEditing((prev) => prev && { ...prev, open: false })
  const record = (kind: EventKind) => setRecording((prev) => ({ kind, session: prev.session + 1 }))
  const sign = () => setSigning(true)

  const canAccept = useCan('opportunity.accept')
  const canClose = useCan('opportunity.close')
  /* The history card's own gate; the sign request's door points into it. */
  const historyOpen = useCan('workstream.view') && op.workstream !== null
  /* The origin lead, for its source. A failure does not break the screen: a
     deal stays readable when its lead is out of the reader's scope. */
  const { data: lead = null } = useQuery({
    ...leadProfileQuery(op.leadCode),
    enabled: Boolean(op.leadCode),
  })
  const primary = primaryStateOf(op, { accept: canAccept, close: canClose })
  const more = dealMoreChoices(op, primary.move, canClose, {
    onRecord: record,
    onSign: sign,
    onEditOwners: () => edit('owners'),
    onStop: () => setStopping(true),
    onAssign: () => setAssigning(true),
  })
  const subject = { kind: 'opportunity', code: op.code } as const

  return (
    <RecordShell
      strip={
        <RunStrip
          workstreamCode={op.workstream?.code ?? null}
          current={{ kind: 'opportunity', code: op.code }}
          fallback={railOf(op.chain, op.code, navigate)}
        />
      }
      header={<DealHeader op={op} lead={lead} />}
      main={
        <>
          <DealTodo op={op} primary={primary} onSign={sign} onRecord={record} />
          {op.state === 'lost' && <FailLogCard op={op} />}
          <ValueStrip op={op} onEdit={() => edit('terms')} />
          <ContractsCard
            op={op}
            onViewRequest={historyOpen && op.pendingSign ? viewSignRequest : undefined}
          />
          <DealHistoryCard op={op} />
          <DescriptionPanel op={op} onEdit={() => edit('details')} />
        </>
      }
      railLabel="Liên hệ, người liên hệ và tệp của cơ hội"
      rail={
        <>
          <RunOwners
            workstreamCode={op.workstream?.code ?? null}
            doors={
              op.state === 'open' && op.acts.assign.ok
                ? {
                    [op.code]: {
                      label: op.hasSeller ? 'Đổi Sale' : 'Giao Sale',
                      onClick: () => setAssigning(true),
                    },
                  }
                : {}
            }
          />
          <CommJourney workstreamCode={op.workstream?.code ?? null} subject={subject} />
          <RunContacts subject={subject} />
          <RunFiles subject={subject} />
        </>
      }
      /* A lost deal has no bar: nothing is recorded on it, nobody is contacted
         from it, and its more menu is empty. */
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
          />
        )
      }
    >
      <SignDrawer op={op} open={signing} onClose={() => setSigning(false)} />
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
        kind={recording.kind}
        quoteLabel={quoteLabelOf(op)}
        onClose={() => setRecording((prev) => ({ ...prev, kind: null }))}
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
