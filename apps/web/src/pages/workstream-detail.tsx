import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, type RailObject } from '@pv/ui'
import {
  CLOSE_REASON_LABEL,
  JOURNEY_BORN_BY_LABEL,
  JOURNEY_STATUS_LABEL,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmy } from '@/lib/date'
import { useLeadDealReach } from '@/data/deal-sale'
import { leadOf, leadProfileQuery } from '@/data/lead-profile'
import { isOpenState } from '@/data/lead-state'
import { chainPath } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { runDays } from '@/data/workstreams'
import { assignDoorOf } from '@/components/assign-door'
import { AssignMenu } from '@/components/assign-menu'
import { ConvertDialog } from '@/components/convert-dialog'
import { ActionBar } from '@/components/record/action-bar'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners } from '@/components/run/run-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { TreeLegend, TreeZoomBar, WorkstreamTree } from './workstream-tree'
import { useTreeZoom } from './workstream-tree-zoom'
import type { PathOf } from './workstream-tree-model'

/** One run — `/sales/workstreams/:code`, the run overview on the record shell
 *  (ADR 0078 §2): run strip, header, then the body — the four-lane tree, whose
 *  cards already carry what is late — and the rail — the whole run's comms and
 *  its lead's contacts. No files: a run has none of its own.
 *
 *  A rung of the tree opens its step drawer first; the object's profile sits
 *  in that drawer's footer. Two lead doors are borrowed from the lead profile:
 *  hand over a lead nobody holds (narrower than the profile, which also hands
 *  over a held one), and open a deal from the empty deal lane. The floating
 *  bar holds only the tree's key and zoom: whom to contact is a question for the lead,
 *  deal or contract, so it has no contact buttons. */

type Journey = WorkstreamJourneyResponse
type Go = (path: string) => void

export default function WorkstreamDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: journey, isPending, error } = useQuery(workstreamJourneyQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {journey ? (
        <RunScreen journey={journey} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Mã ${code} không có trong sổ, hoặc hành trình nằm ngoài phạm vi của bạn.`,
            fallback: 'Không mở được hành trình.',
            back: { label: 'Về sổ hành trình', onClick: () => navigate('/sales/workstreams') },
          }}
        />
      )}
    </AppShell>
  )
}

function RunScreen({ journey }: { journey: Journey }) {
  const navigate = useNavigate()
  const zoomCtl = useTreeZoom()
  /* `chainPath` has no contract door; the strip gates it the same way. */
  const canOpenContract = useCan('contract.view')
  const pathOf: PathOf = (kind, code) =>
    kind !== 'HĐ'
      ? chainPath(kind, code)
      : canOpenContract
        ? `/sales/contracts/${encodeURIComponent(code)}`
        : undefined
  const lead = { kind: 'lead', code: journey.lead.code } as const
  const doors = useLeadDoors(journey.lead.code)

  return (
    <RecordShell
      strip={
        <RunStrip
          workstreamCode={journey.code}
          current={{ kind: 'workstream', code: journey.code }}
          fallback={railOf(journey, navigate)}
        />
      }
      header={<RunHeader journey={journey} />}
      main={
        <WorkstreamTree
          key={journey.code}
          journey={journey}
          zoomCtl={zoomCtl}
          go={navigate}
          pathOf={pathOf}
          onOpenDeal={doors.openDeal}
        />
      }
      actionBar={
        <ActionBar
          label="Thao tác của hành trình"
          extra={
            <>
              <TreeLegend />
              <span aria-hidden className="bg-surface-ink/16 mx-1 h-8 w-0.5 rounded-full" />
              <TreeZoomBar ctl={zoomCtl} />
            </>
          }
        />
      }
      railLabel="Lịch sử liên hệ và người liên hệ của hành trình"
      rail={
        <>
          <RunOwners workstreamCode={journey.code} doors={doors.owners} />
          <CommJourney workstreamCode={journey.code} />
          <RunContacts subject={lead} />
        </>
      }
    >
      {doors.dialogs}
    </RecordShell>
  )
}

/** The lead profile's hand-over and open-deal doors, under the gates
 *  `lead-detail.tsx` applies — hand-over only while nobody holds the lead, read
 *  off the same profile the gate reads. Nothing until the profile is read. */
function useLeadDoors(code: string) {
  const me = useSession((s) => s.actor)
  const canView = useCan('lead.view')
  const canAssign = useCan('lead.assign')
  const canCreate = useCan('opportunity.create')
  const profile = useQuery({ ...leadProfileQuery(code), enabled: canView }).data
  const dealReach = useLeadDealReach(profile ?? { canEdit: true })
  const [assigning, setAssigning] = useState(false)
  const [converting, setConverting] = useState(false)
  if (!profile) return { owners: {}, openDeal: undefined, dialogs: null }

  const off = profile.disabledAt !== undefined
  const holder = profile.ownerId ?? null
  const assign = assignDoorOf(holder, canAssign, dealReach, me !== undefined)
  const mayConvert =
    canCreate &&
    profile.canEdit &&
    !off &&
    (isOpenState(profile.state) || profile.state === 'converted')
  return {
    owners:
      holder === null && !assign.shut && !off
        ? { [code]: { label: assign.label, onClick: () => setAssigning(true) } }
        : {},
    openDeal: mayConvert ? () => setConverting(true) : undefined,
    dialogs: (
      <>
        <AssignMenu
          lead={leadOf(profile)}
          profile={profile}
          readOnly={dealReach}
          trigger={false}
          open={assigning}
          onOpenChange={setAssigning}
        />
        <ConvertDialog profile={profile} open={converting} onClose={() => setConverting(false)} />
      </>
    ),
  }
}

/** The strip's stand-in when the run cannot be re-read: previous journey,
 *  this one, its lead and account, then every journey it grew into. */
function railOf(j: Journey, go: Go): RailObject[] {
  const chip = (kind: 'WS' | 'LD' | 'AC', code: string): RailObject => {
    const path = chainPath(kind, code)
    return path ? { code, onOpen: () => go(path) } : { code }
  }
  return [
    ...(j.previous ? [chip('WS', j.previous.code)] : []),
    { code: j.code, source: true },
    chip('LD', j.lead.code),
    ...(j.accountCode !== null ? [chip('AC', j.accountCode)] : []),
    ...j.next.map((n) => chip('WS', n.code)),
  ]
}

/** The customer, then one meta line: status or close reason, dates, the
 *  journey it grew from (its one door, the strip has none). The ordinal shows
 *  only from the second journey on; the holder is the rail's. The code is the
 *  strip's, not repeated here. */
function RunHeader({ journey: j }: { journey: Journey }) {
  const previous = j.previous && chainPath('WS', j.previous.code)
  return (
    <RecordHeader
      title={j.customer}
      meta={[
        j.ordinal > 1 && `Hành trình ${j.ordinal}`,
        j.status === 'closed'
          ? j.closeReason && CLOSE_REASON_LABEL[j.closeReason]
          : JOURNEY_STATUS_LABEL[j.status],
        <span className="tnum">
          mở {dmy(j.openedAt)}
          {j.closedAt !== null && ` · đóng ${dmy(j.closedAt)}`} · {runDays(j, Date.now())} ngày
        </span>,
        j.previous && previous && (
          <Link to={previous} className="text-foreground underline underline-offset-2">
            nối từ hành trình {j.previous.ordinal} ({JOURNEY_BORN_BY_LABEL[j.previous.bornBy]})
          </Link>
        ),
      ]}
    />
  )
}
