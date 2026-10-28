import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@pv/ui'
import type { LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { leadContactsQuery } from '@/data/contacts'
import { useLeadDealReach } from '@/data/deal-sale'
import { useLeadDraft } from '@/data/lead-draft'
import { useResumeLead } from '@/data/lead-exit'
import { leadOf, leadProfileQuery } from '@/data/lead-profile'
import { isOpenState } from '@/data/lead-state'
import { opportunitiesOfLeadQuery, railOf } from '@/data/opportunities'
import { assignDoorOf } from '@/components/assign-door'
import { AssignMenu } from '@/components/assign-menu'
import { ConvertDialog } from '@/components/convert-dialog'
import { DisableLeadsDialog } from '@/components/lead-disable'
import { LeadHoldDialog, LeadHoldStrip } from '@/components/lead-hold'
import { LeadLabelsCard } from '@/components/lead-labels'
import { NurtureDialog } from '@/components/lead-state-actions'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { MeetingsDock } from '@/components/meetings-dock'
import { useDockRow } from '@/data/meeting-upcoming'
import { usePinToggle } from '@/data/pins'
import { ActionBar } from '@/components/record/action-bar'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners, type OwnerDoors } from '@/components/run/run-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { RunDocuments } from '@/components/run/run-documents'
import { LeadDisabledNotice, LeadHeader, LeadTodo } from './lead-blocks'
import { barPeopleOf, leadMoreChoices, mailBlockedOf } from './lead-model'
import { useAiFillRun } from './lead-ai-fill'
import { LeadForm } from './lead-parts'

/** Module 2 · one lead's profile — `/sales/leads/:code`, on the record shell
 *  (ADR 0078): run strip, header, then the body — todo card, the lead form as
 *  reference — and the rail — contacts timeline, people, files. The floating
 *  bar reaches contacts and holds the next meeting; its more menu holds the
 *  state moves, the hand-over and the pin. A switched-off lead has no bar, so
 *  its meetings show read-only at the top of the body. `LeadScreen` is split out so that every
 *  hook of the profile runs only once there IS a profile. */

export function LeadDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: lead, isPending, error } = useQuery(leadProfileQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {lead ? (
        <LeadScreen lead={lead} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Không tìm thấy lead ${code}.`,
            fallback: 'Không mở được hồ sơ lead.',
            back: { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') },
          }}
        />
      )}
    </AppShell>
  )
}

export default LeadDetailPage

// ---------------------------------------------------------------------------

/** Every open deal of this lead — only the drop gate reads it. A stable object
 *  so the menu does not rebuild on a render where nothing changed. */
const EMPTY_LIVE_DEAL = { codes: [], hidden: 0 }

/** The assign door is offered on the lead itself, and only while it is open to a change. */
const leadDoors = (
  code: string,
  door: ReturnType<typeof assignDoorOf>,
  off: boolean,
  open: () => void,
): OwnerDoors => (door.shut || off ? {} : { [code]: { label: door.label, onClick: open } })

function LeadScreen({ lead }: { lead: LeadProfile }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)
  /* Switched off: the server already answers `canEdit: false`, which is not
     the deal-reach case, and the doors gated on a permission alone (hand-over,
     contact, pin) are shut here. */
  const off = lead.disabledAt !== undefined
  const dealReach = useLeadDealReach(lead) && !off
  const canWrite = useCan('lead.edit') && lead.canEdit
  /* `canEdit` is the holder's fence, and a pool lead has no holder yet. */
  const canClaim = useCan('lead.edit') && !off
  const canDisqualify = useCan('lead.disqualify') && lead.canEdit
  const canSendEmail = useCan('lead.send-email')
  const canConvert = useCan('opportunity.create') && lead.canEdit
  const canAssign = useCan('lead.assign')
  const canDisable = useCan('lead.disable')
  const convert =
    canConvert && !off && (isOpenState(lead.state) || lead.state === 'converted')
      ? () => setConverting(true)
      : undefined
  const pin = usePinToggle('lead', lead.code)
  const liveDeal = useQuery(opportunitiesOfLeadQuery(lead.code)).data ?? EMPTY_LIVE_DEAL
  const contacts = useQuery(leadContactsQuery(lead.code)).data?.rows
  const claim = useResumeLead(lead.code)
  /* ONE draft for the whole screen, seeded from the server's copy. */
  const draft = useLeadDraft({ mode: 'edit', profile: lead })
  const aiFill = useAiFillRun(lead, draft, canWrite)
  const dockRow = useDockRow({ kind: 'lead', code: lead.code }, canWrite)
  const [converting, setConverting] = useState(false)
  const [nurturing, setNurturing] = useState(false)
  const [holding, setHolding] = useState(false)
  const [composing, setComposing] = useState<{ to: string | null } | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const mailBlocked = mailBlockedOf(canSendEmail)
  const people = barPeopleOf(lead, contacts)

  /* The pool has no holder to hand over; the claim is its only way out. */
  const assignDoor = assignDoorOf(
    lead.ownerId ?? null,
    canAssign,
    dealReach || lead.state === 'nurturing',
    me !== undefined,
  )
  const more = leadMoreChoices(
    lead,
    { write: canWrite, claim: canClaim, disqualify: canDisqualify, disable: canDisable },
    assignDoor,
    pin.pinned,
    dealReach,
    liveDeal,
    {
      onClaim: () =>
        claim.mutate(undefined, {
          onSuccess: () => toastDone(`Đã nhận ${lead.code}.`),
          onError: (e) => toastFail('Không nhận được lead.', userMessage(e)),
        }),
      onNurture: () => setNurturing(true),
      onHold: () => setHolding(true),
      onAssign: () => setAssigning(true),
      onPin: pin.toggle,
      onDisable: () => setDisabling(true),
    },
  )

  return (
    <RecordShell
      strip={
        <>
          {lead.disabledAt && <LeadDisabledNotice code={lead.code} since={lead.disabledAt} />}
          <RunStrip
            workstreamCode={lead.workstreamCode}
            current={{ kind: 'lead', code: lead.code }}
            fallback={railOf(lead.chain, lead.code, navigate)}
          />
          <LeadHoldStrip lead={lead} canWrite={canWrite} />
        </>
      }
      header={<LeadHeader lead={lead} onConvert={convert} />}
      main={
        <>
          {off && <MeetingsDock subject={{ kind: 'lead', code: lead.code }} canEdit={false} />}
          <LeadTodo
            lead={lead}
            canStep={canWrite && isOpenState(lead.state) && lead.state !== 'nurturing'}
          />
          <LeadLabelsCard lead={lead} canEdit={canWrite && isOpenState(lead.state)} />
          <LeadForm draft={draft} code={lead.code} canEdit={canWrite} ai={aiFill} />
        </>
      }
      railLabel="Lịch sử liên hệ, người liên hệ và tài liệu của lead"
      rail={
        <>
          <RunOwners
            workstreamCode={lead.workstreamCode}
            focus={lead.code}
            doors={leadDoors(lead.code, assignDoor, off, () => setAssigning(true))}
          />
          <RunContacts subject={{ kind: 'lead', code: lead.code }} />
          {/* Off: the comms layer treats the lead as absent, so the card could
              only print "not found" — nothing is better than two errors. */}
          {!off && (
            <CommJourney
              workstreamCode={lead.workstreamCode}
              subject={{ kind: 'lead', code: lead.code }}
            />
          )}
          <RunDocuments workstreamCode={lead.workstreamCode} />
        </>
      }
      actionBarRows={dockRow ? 2 : 1}
      actionBar={
        !off && (
          <ActionBar
            label="Thao tác lead"
            subject={{ code: lead.code, kind: 'lead' }}
            contacts={people}
            mailBlocked={mailBlocked}
            onCompose={(contact) => setComposing({ to: contact.code ?? null })}
            more={more}
            top={<MeetingsDock subject={{ kind: 'lead', code: lead.code }} canEdit={canWrite} />}
          />
        )
      }
    >
      {/* Opened from the bar's more menu, whose trigger the drawer hands focus
          back to on close. */}
      <AssignMenu
        lead={leadOf(lead)}
        profile={lead}
        readOnly={dealReach}
        trigger={false}
        open={assigning}
        onOpenChange={setAssigning}
      />
      {/* The WIRE profile: the convert form is seeded from the stored row. */}
      <ConvertDialog profile={lead} open={converting} onClose={() => setConverting(false)} />
      <NurtureDialog profile={lead} open={nurturing} onClose={() => setNurturing(false)} />
      <LeadHoldDialog lead={lead} open={holding} onClose={() => setHolding(false)} />
      <DisableLeadsDialog
        codes={[lead.code]}
        open={disabling}
        onClose={() => setDisabling(false)}
        onDone={() => navigate('/sales/leads')}
      />
      {composing && (
        <LetterComposer
          door="lead"
          code={lead.code}
          leadCode={lead.code}
          to={composing.to}
          onClose={() => setComposing(null)}
        />
      )}
    </RecordShell>
  )
}
