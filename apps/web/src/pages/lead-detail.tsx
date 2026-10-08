import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ArrowRight } from '@pv/ui'
import type { LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { leadContactOf } from '@/data/comm-records'
import { leadContactsQuery } from '@/data/contacts'
import { useLeadDealReach } from '@/data/deal-sale'
import { useLeadDraft } from '@/data/lead-draft'
import { useReopenLead, useResumeLead } from '@/data/lead-exit'
import { leadOf, leadProfileQuery } from '@/data/lead-profile'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'
import { opportunitiesOfLeadQuery, railOf } from '@/data/opportunities'
import { assignDoorOf } from '@/components/assign-door'
import { AssignMenu } from '@/components/assign-menu'
import { ConvertDialog } from '@/components/convert-dialog'
import { ExitDialog } from '@/components/exit-dialog'
import { DisableLeadsDialog } from '@/components/lead-disable'
import { NurtureDialog } from '@/components/lead-state-actions'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { MeetingsCard } from '@/components/meetings-card'
import { usePinToggle } from '@/data/pins'
import { ActionBar, type BarContact } from '@/components/record/action-bar'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners } from '@/components/run/run-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { RunDocuments } from '@/components/run/run-documents'
import { LeadDisabledNotice, LeadHeader, LeadTodo } from './lead-blocks'
import { leadMoreChoices } from './lead-model'
import { LeadForm } from './lead-parts'

/** Module 2 · one lead's profile — `/sales/leads/:code`, on the record shell
 *  (ADR 0078): run strip, header, then the body — todo card, meetings, the
 *  lead form as reference — and the rail — contacts timeline, people, files.
 *  The floating bar only reaches contacts; its more menu holds the state
 *  moves, the hand-over and the pin. `LeadScreen` is split out so that every
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
            notFound: `Không tìm thấy lead nào mang mã ${code}. Kiểm tra lại mã, hoặc mở lại từ sổ lead.`,
            fallback: 'Không đọc được hồ sơ lead này.',
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

function LeadScreen({ lead }: { lead: LeadProfile }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)
  /* Switched off: the server already answers `canEdit: false`, which is not
     the deal-reach case, and the doors gated on a permission alone (hand-over,
     contact, pin) are shut here. */
  const off = lead.disabledAt !== undefined
  const dealReach = useLeadDealReach(lead) && !off
  const canWrite = useCan('lead.edit') && lead.canEdit
  const canDisqualify = useCan('lead.disqualify') && lead.canEdit
  const canSendEmail = useCan('lead.send-email')
  const canConvert = useCan('opportunity.create') && lead.canEdit
  const canAssign = useCan('lead.assign')
  const pin = usePinToggle('lead', lead.code)
  const liveDeal = useQuery(opportunitiesOfLeadQuery(lead.code)).data ?? EMPTY_LIVE_DEAL
  const contacts = useQuery(leadContactsQuery(lead.code)).data?.rows
  const resume = useResumeLead(lead.code)
  const reopen = useReopenLead(lead.code)
  /* ONE draft for the whole screen, seeded from the server's copy. */
  const draft = useLeadDraft({ mode: 'edit', profile: lead })
  const [converting, setConverting] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [nurturing, setNurturing] = useState(false)
  const [composing, setComposing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [disabling, setDisabling] = useState(false)

  /* A dropped lead has left the funnel: no mail, said on every mail row. */
  const mailBlocked = !canSendEmail
    ? 'Cần quyền gửi email cho lead.'
    : lead.state === 'disqualified'
      ? `Lead ${LEAD_STATE_FACE[lead.state].label.toLowerCase()}, không gửi email được nữa.`
      : undefined
  const people: BarContact[] =
    contacts && contacts.length > 0
      ? contacts.map((c) => ({ ...c, primary: c.isPrimary, role: c.title }))
      : [{ ...leadContactOf(lead), primary: true }]

  const assignDoor = assignDoorOf(lead.ownerId ?? null, canAssign, dealReach, me !== undefined)
  const more = leadMoreChoices(
    lead,
    { write: canWrite, disqualify: canDisqualify, disable: useCan('lead.disable') },
    assignDoor,
    pin.pinned,
    dealReach,
    liveDeal,
    {
      onResume: () =>
        resume.mutate(undefined, {
          onSuccess: (next) =>
            toastDone(`${lead.code} chuyển sang ${LEAD_STATE_FACE[next.state].label}.`),
          onError: (e) => toastFail('Không chăm lại được lead.', userMessage(e)),
        }),
      onNurture: () => setNurturing(true),
      onAssign: () => setAssigning(true),
      onPin: pin.toggle,
      onExit: () => setExiting(true),
      onReopen: () =>
        reopen.mutate(undefined, {
          onSuccess: () => toastDone(`Đã mở lại ${lead.code}.`),
          onError: (e) => toastFail('Không mở lại được lead.', userMessage(e)),
        }),
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
        </>
      }
      header={<LeadHeader lead={lead} readOnly={dealReach} />}
      main={
        <>
          <LeadTodo lead={lead} canStep={canWrite && isOpenState(lead.state)} />
          <MeetingsCard subject={{ kind: 'lead', code: lead.code }} canEdit={canWrite} />
          <LeadForm draft={draft} code={lead.code} canEdit={canWrite} />
        </>
      }
      railLabel="Liên hệ, người liên hệ và tài liệu của lead"
      rail={
        <>
          <RunOwners
            workstreamCode={lead.workstreamCode}
            doors={
              assignDoor.shut || off
                ? {}
                : { [lead.code]: { label: assignDoor.label, onClick: () => setAssigning(true) } }
            }
          />
          {/* Off: the comms layer treats the lead as absent, so the card could
              only print "not found" — nothing is better than two errors. */}
          {!off && (
            <CommJourney
              workstreamCode={lead.workstreamCode}
              subject={{ kind: 'lead', code: lead.code }}
            />
          )}
          <RunContacts subject={{ kind: 'lead', code: lead.code }} />
          <RunDocuments workstreamCode={lead.workstreamCode} />
        </>
      }
      actionBar={
        !off && (
          <ActionBar
            label="Thao tác lead"
            subject={{ code: lead.code, kind: 'lead' }}
            contacts={people}
            mailBlocked={mailBlocked}
            onCompose={() => setComposing(true)}
            more={more}
            primary={
              canConvert && (isOpenState(lead.state) || lead.state === 'converted')
                ? { label: 'Mở cơ hội', icon: ArrowRight, onClick: () => setConverting(true) }
                : undefined
            }
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
      <ExitDialog profile={lead} open={exiting} onClose={() => setExiting(false)} />
      <NurtureDialog profile={lead} open={nurturing} onClose={() => setNurturing(false)} />
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
          onClose={() => setComposing(false)}
        />
      )}
    </RecordShell>
  )
}
