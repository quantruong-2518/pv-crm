import { useState, type ReactNode } from 'react'
import { Inbox, Lock, TriangleAlert, type IconGlyph } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  MetaPill,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type { LeadProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useCan, useSession } from '@/app/auth'
import { dmy } from '@/lib/date'
import { EXIT_REASON_LABEL } from '@/data/leads'
import { LEAD_STATE_FACE } from '@/data/lead-state'
import { useLeadDraft } from '@/data/lead-draft'
import { leadOf, leadProfileQuery } from '@/data/lead-profile'
import { chainPath, opportunitiesOfLeadQuery } from '@/data/opportunities'
import { leadTouchesQuery } from '@/data/touches'
import { ConvertDialog } from '@/components/convert-dialog'
import { DetailSidePanel } from '@/components/detail-side-panel'
import { ExitDialog } from '@/components/exit-dialog'
import { LeadActivityCard } from '@/components/lead-activity-card'
import { NurtureDialog, VerifyDialog } from '@/components/lead-state-actions'
import { LeadToolsBar } from '@/components/lead-tools-bar'
import { MasMailModal } from '@/components/mas-mail-modal'
import { masRecipientsOf } from '@/data/mas-mail-draft'
import { OwnerSourceCard } from '@/components/owner-source-card'
import { ObjectChip } from '@/components/workstream-bits'
import { LeadForm, NextActionCard, SaveStateNote } from './lead-parts'

/** Module 2 · One lead's profile — `/sales/leads/:code`.
 *
 *  Header: the account name with its status beside it, then ONE meta row — the
 *  code, the customer it became if it did, the date it was booked, and whether
 *  what was typed reached the server.
 *
 *  Two columns: LEFT is the record — form and activity; RIGHT is the work —
 *  next action, holder and origin. Below `xl` it folds to one column with the
 *  RIGHT one first: on a tablet a lead is opened to work it, not to fill a form.
 *
 *  Four ways the profile fails to draw (loading · 404 · 403 out-of-scope ·
 *  anything else) say four different things, because each is a different next
 *  step for the reader. `LeadBody` is split out so that every hook of the
 *  profile runs only once there IS a profile. */

export function LeadDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: lead, isPending, error } = useQuery(leadProfileQuery(code))

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

  if (!lead) {
    /* One `kind`, one sentence. The screen reads no numeric status and matches
       no substring of `message`: `app/api/errors.ts` classified it once for the
       whole app, and two screens classifying it again are two wordings. */
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'

    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyLead
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Không tìm thấy lead nào mang mã <span className="font-mono">{code}</span>. Kiểm
                  tra lại mã, hoặc mở lại từ sổ lead.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ lead này.'
              )
            }
            onBack={() => navigate('/sales/leads')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<LeadBody lead={lead} />)
}

export default LeadDetailPage

// ---------------------------------------------------------------------------

function LeadBody({ lead }: { lead: LeadProfile }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)
  const canWrite = useCan('lead.edit')
  const canDisqualify = useCan('lead.disqualify')
  /* Asked HERE, next to `lead.edit`, and handed to the toolbar: the bar is the
     only block whose three buttons write through three different doors, and a
     button opening a drawer that ends in a 403 is worse than a locked one. */
  const canSendEmail = useCan('lead.send-email')
  const canConvert = useCan('opportunity.edit')
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)
  /* Has this lead been turned into a deal yet — asked of the SERVER. */
  const priorOps = useQuery(opportunitiesOfLeadQuery(lead.code))
  /* The LEAD's timeline, not the opportunity's — decision 5 of ADR
     `docs/decisions/0018-opportunity-module-decisions.md`. Handed over
     UNRESOLVED: `undefined` is "not answered yet". */
  const { data: touches } = useQuery(leadTouchesQuery(lead.code))
  /* A COUNTER, not a flag: pressing the meeting button twice must open the
     door twice, and a boolean already `true` says nothing the second time. */
  const [scheduleSeq, setScheduleSeq] = useState(0)
  const [converting, setConverting] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [step, setStep] = useState<'verify' | 'nurture' | null>(null)
  const [composing, setComposing] = useState(false)

  /* ONE draft for the whole screen: the form card on the left and the holder
     card on the right type into the same boxes. */
  const draft = useLeadDraft({ mode: 'edit', profile: lead })
  /* The blocks still living on `app/desk.ts` read the fixture's `Lead` shape —
     built ONCE here instead of every block converting it for itself. */
  const legacy = leadOf(lead)
  /* The server treats a dropped or archived lead as left the funnel, and
     refuses mail to it — say so on the button rather than after composing. */
  const masBlocker =
    lead.state === 'disqualified' || lead.state === 'archived'
      ? `Lead ${LEAD_STATE_FACE[lead.state].label.toLowerCase()}, không gửi email được nữa.`
      : !lead.email
        ? 'Lead chưa có địa chỉ email.'
        : !lead.contactName
          ? 'Lead chưa có người liên hệ.'
          : undefined

  return (
    <ScreenLayout>
      <GlassCard variant="b" className="p-4">
        <ScreenHeader
          back={{ label: 'Sổ lead', onClick: () => navigate('/sales/leads') }}
          className="gap-3 [&>div]:gap-3 [&_h2]:tracking-[-.4px]"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {lead.company}
              {/* `font-sans` because the badge now sits INSIDE the `h2`, which
                  carries `font-display` — a badge is body text (law 6). */}
              <StatusBadge lead={lead} className="font-sans" />
            </span>
          }
          meta={
            <>
              <Chip>{lead.code}</Chip>
              <CustomerPill lead={lead} />
              <WorkstreamChip lead={lead} go={navigate} />
              {/* No "by <person>": the profile carries no creator column, and
                  the vector's first holder answers a different question. */}
              <MetaPill mono>Tạo {dmy(lead.createdAt)}</MetaPill>
              {/* Since when the lead has stood in its state — the badge above
                  names the state; no limit to be late against (ADR 0057 §4). */}
              <MetaPill mono>
                Từ {dmy(lead.stateSince)} · {lead.daysHere} ngày
              </MetaPill>
              {/* Who the lead waits ON, which is not who holds it: a request
                  sitting with somebody else is why a lead stops moving while
                  its holder looks idle. Nothing else on the page says it. */}
              {lead.position?.waitingOn && (
                <MetaPill tone="warning">
                  chờ {lead.position.waitingOn.person} · {lead.position.waitingOn.role}
                </MetaPill>
              )}
              <SaveStateNote state={draft.saveState} />
            </>
          }
        />
      </GlassCard>

      <ScreenDetailGrid
        sideLabel="Việc cần làm với lead này"
        className="w-full"
        sideClassName="relative xl:self-stretch"
        /* One column below `xl`, with the WORK column first: on a tablet a
           lead is opened to work it, not to fill a form. */
        sideFirst
        main={
          <>
            <LeadForm draft={draft} code={lead.code} canEdit={canWrite} />
            <LeadActivityCard
              code={lead.code}
              canEdit={canWrite}
              touches={touches}
              focus={null}
              seedAddress={lead.email}
              onCompose={() => setComposing(true)}
              composeBlocked={masBlocker}
              openSchedule={scheduleSeq}
            />
          </>
        }
        side={
          <DetailSidePanel>
            {/* Next action stands first: this column answers "what do I do
                now", while holder and origin are looked up once and dropped. */}
            <NextActionCard lead={legacy} />
            <OwnerSourceCard mode="edit" profile={lead} legacy={legacy} />
          </DetailSidePanel>
        }
      />

      <LeadToolsBar
        mode="edit"
        lead={lead}
        legacy={legacy}
        pinned={pins.includes(lead.code)}
        liveDeal={priorOps.data ?? EMPTY_LIVE_DEAL}
        canDisqualify={canDisqualify}
        canEdit={canWrite}
        canSendEmail={canSendEmail}
        canConvert={canConvert}
        onPin={() => me && togglePin(me.id, lead.code)}
        onExit={() => setExiting(true)}
        onVerify={() => setStep('verify')}
        onNurture={() => setStep('nurture')}
        onConvert={() => setConverting(true)}
        onOpenOp={(code) => navigate(chainPath('OP', code) ?? `/sales/opportunities/${code}`)}
        onCompose={() => setComposing(true)}
        composeBlocked={masBlocker}
        onSchedule={() => setScheduleSeq((n) => n + 1)}
      />

      {/* The WIRE profile, not `legacy`: the convert form is seeded from the
          stored row rather than regenerated from the code. */}
      <ConvertDialog profile={lead} open={converting} onClose={() => setConverting(false)} />
      <ExitDialog profile={lead} open={exiting} onClose={() => setExiting(false)} />
      <VerifyDialog profile={lead} open={step === 'verify'} onClose={() => setStep(null)} />
      <NurtureDialog profile={lead} open={step === 'nurture'} onClose={() => setStep(null)} />
      <MasMailModal
        open={composing}
        onClose={() => setComposing(false)}
        leads={masRecipientsOf(lead)}
        initialLeadCode={masBlocker ? undefined : lead.code}
        defaultLabel={`Gửi email · ${lead.company}`}
        onQueued={() => setComposing(false)}
      />
    </ScreenLayout>
  )
}

// ---------------------------------------------------------------------------

/** Every open deal of this lead — information beside the convert button, never
 *  a block. A stable object so the toolbar's props do not change identity on a
 *  render where nothing did. */
const EMPTY_LIVE_DEAL = { codes: [], hidden: 0 }

/** Which customer this lead became — the `AC` link of the object chain.
 *
 *  NOT pressable, on purpose: `MetaPill` has no press door by design, and a
 *  pressable 24px chip in a meta row is a touch target under the 48px law 13
 *  asks of a tablet. */
function CustomerPill({ lead }: { lead: LeadProfile }) {
  const link = lead.chain.find((entry) => entry.kind === 'AC')
  if (!link) return null
  return <MetaPill>Khách hàng {link.code}</MetaPill>
}

/** The customer-journey run this lead started — the one screen that puts this
 *  lead beside its deals and its account.
 *
 *  Nothing is drawn when the code is null: a lead written before migration
 *  0045 has no run, and a chip that opens nothing is worse than no chip. The
 *  same rule costs the permission too — `marketing` holds `lead.view` without
 *  `workstream.view`, and the route gates on the latter, so the chip would
 *  open a refusal. Hiding it is not a data cut: the `WS-` code sits on a
 *  `LeadRow` this reader already reads. */
function WorkstreamChip({ lead, go }: { lead: LeadProfile; go: (path: string) => void }) {
  const canOpenWorkstream = useCan('workstream.view')
  if (lead.workstreamCode === null || !canOpenWorkstream) return null
  return <ObjectChip kind="WS" code={lead.workstreamCode} go={go} />
}

/** The screen that would not open — ONE block, three sentences, and the glyph
 *  follows the sentence.
 *
 *  One component for all three because all three are the same state of the
 *  screen (no profile to draw) with the same way out (back to the lead book).
 *  What differs is the SENTENCE, so the sentence is the prop — rather than
 *  three near-identical empty blocks that drift apart on the second edit. */
function EmptyLead({
  icon,
  note,
  onBack,
}: {
  icon: IconGlyph
  note: ReactNode
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ lead
      </Button>
    </div>
  )
}

/** The lead's stored lifecycle state (ADR 0058), named by the same table the
 *  book reads — two screens of one row must print one word. A disqualified
 *  lead also says why, because that is the first question about it. */
function StatusBadge({ lead, className }: { lead: LeadProfile; className?: string }) {
  const face = LEAD_STATE_FACE[lead.state]
  const reason =
    lead.state === 'disqualified' && lead.exitReason
      ? (EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason)
      : undefined

  return (
    <Badge tone={face.badge} className={className}>
      {reason ? `${face.label} · ${reason}` : face.label}
    </Badge>
  )
}
