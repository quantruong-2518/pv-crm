import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ArrowRight, Badge, Button, Icon } from '@pv/ui'
import { JOURNEY_STATUS_LABEL, type WorkstreamJourneyResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { leadProfileQuery } from '@/data/lead-profile'
import { isOpenState } from '@/data/lead-state'
import { chainPath } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { ConvertDialog } from '@/components/convert-dialog'
import { CloseBadge } from '@/components/workstream-bits'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { TreeLegend, TreeZoomBar, WorkstreamTree } from './workstream-tree'
import { useTreeZoom } from './workstream-tree-zoom'
import type { PathOf } from './workstream-tree-model'

/** One run — `/sales/workstreams/:code`, the run overview on the record shell
 *  (ADR 0078 §2): header, then the four-lane tree, whose cards already carry
 *  what is late. No strip, no rail and no floating bar: the tree's key and
 *  zoom sit in one small row above it. A rung opens its step drawer, whose
 *  footer opens the object's profile. The one door borrowed from the lead
 *  profile is opening a deal, in the header while the deal lane is empty. */

type Journey = WorkstreamJourneyResponse

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
            notFound: `Không có hành trình mã ${code} trong phạm vi của bạn.`,
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
  /* `chainPath` has no contract door. */
  const canOpenContract = useCan('contract.view')
  const pathOf: PathOf = (kind, code) =>
    kind !== 'HĐ'
      ? chainPath(kind, code)
      : canOpenContract
        ? `/sales/contracts/${encodeURIComponent(code)}`
        : undefined
  const door = useOpenDealDoor(journey.lead.code)

  return (
    <RecordShell
      skeleton={{ strip: false, rail: false }}
      header={
        <RunHeader
          journey={journey}
          /* The door sits in the empty deal lane; it opens only there. */
          onOpenDeal={journey.deals.length === 0 ? door.open : undefined}
        />
      }
      main={
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TreeLegend />
            <TreeZoomBar ctl={zoomCtl} />
          </div>
          <WorkstreamTree
            key={journey.code}
            journey={journey}
            zoomCtl={zoomCtl}
            go={navigate}
            pathOf={pathOf}
          />
        </>
      }
    >
      {door.dialog}
    </RecordShell>
  )
}

/** The lead profile's open-deal door, under the gate `lead-detail.tsx`
 *  applies. Nothing until the profile is read. */
function useOpenDealDoor(code: string) {
  const canView = useCan('lead.view')
  const canCreate = useCan('opportunity.create')
  const profile = useQuery({ ...leadProfileQuery(code), enabled: canView }).data
  const [converting, setConverting] = useState(false)
  if (!profile) return { open: undefined, dialog: null }

  const mayConvert =
    canCreate &&
    profile.canEdit &&
    profile.disabledAt === undefined &&
    (isOpenState(profile.state) || profile.state === 'converted')
  return {
    open: mayConvert ? () => setConverting(true) : undefined,
    dialog: (
      <ConvertDialog profile={profile} open={converting} onClose={() => setConverting(false)} />
    ),
  }
}

/** The customer with the run's status in the title; the holder is the rail's,
 *  the code the strip's. Its one move, to open a deal, sits right. */
function RunHeader({ journey: j, onOpenDeal }: { journey: Journey; onOpenDeal?: () => void }) {
  return (
    <RecordHeader
      title={
        <>
          {j.customer}
          <RunStatus journey={j} />
        </>
      }
      actions={
        onOpenDeal && (
          <Button size="lg" onClick={onOpenDeal}>
            <Icon icon={ArrowRight} size={16} />
            Mở cơ hội
          </Button>
        )
      }
    />
  )
}

/** A closed run wears its close reason, as the book does; the other two
 *  statuses have a label of their own (law 16). */
function RunStatus({ journey: j }: { journey: Journey }) {
  const tail = 'ml-3 align-middle tracking-normal'
  if (j.status === 'closed') {
    return (
      j.closeReason && (
        <span className={tail}>
          <CloseBadge reason={j.closeReason} />
        </span>
      )
    )
  }
  return (
    <Badge tone={j.status === 'open' ? 'running' : 'success'} className={tail}>
      {JOURNEY_STATUS_LABEL[j.status]}
    </Badge>
  )
}
