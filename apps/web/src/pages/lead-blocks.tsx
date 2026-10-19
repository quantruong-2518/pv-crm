import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Badge, CircleAlert } from '@pv/ui'
import { Button, Icon, Skeleton, cn } from '@pv/ui'
import type { LeadProfile } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { leadStopReasonsQuery } from '@/data/leads'
import { LEAD_STATE_FACE } from '@/data/lead-state'
import { leadTouchesQuery, leadVectorQuery } from '@/data/touches'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { useRestoreLeads } from '@/components/lead-restore'
import { RecordHeader } from '@/components/record/record-header'
import { TodoCard } from '@/components/record/todo-card'
import { NextStepCard } from '@/components/run/next-step'
import { leadRungsOf, leadStepSubject, momentText } from './lead-model'

/** Module 2 · the header and stepper of the lead profile; the meetings sit on
 *  the floating bar (`MeetingsDock`), shared with the deal profile.
 *
 *  The header names the lead's state in a badge (law 16) and carries no code
 *  or run chip: the run strip says those (ADR 0078 §1). Its one move, to open
 *  a deal, sits on the right. The bar's more menu changes the holder. */
export function LeadHeader({
  lead,
  onConvert,
}: {
  lead: LeadProfile
  /** Set when this reader may open a deal from the lead; omit to draw no button. */
  onConvert?: () => void
}) {
  return (
    <RecordHeader
      title={
        <>
          {lead.company}
          <Badge
            tone={LEAD_STATE_FACE[lead.state].badge}
            className={cn(
              'ml-3 align-middle tracking-normal',
              LEAD_STATE_FACE[lead.state].badge === 'draft' && 'text-foreground',
            )}
          >
            {LEAD_STATE_FACE[lead.state].label}
          </Badge>
        </>
      }
      actions={
        onConvert && (
          <Button size="lg" onClick={onConvert}>
            <Icon icon={ArrowRight} size={16} />
            Mở cơ hội
          </Button>
        )
      }
    />
  )
}

/** A switched-off lead says so once, above everything, with its one way back.
 *  Only a `lead.disable` holder ever sees it: for anyone else the profile is
 *  a 404. Same tinted block as the config screen's "nothing here yet" notice. */
export function LeadDisabledNotice({ code, since }: { code: string; since: string }) {
  const { pending, restore } = useRestoreLeads()

  return (
    <div
      role="status"
      className="bg-warning/12 flex flex-wrap items-center justify-between gap-3 rounded-md p-4"
    >
      <span className="flex min-w-0 items-center gap-3 text-[13px] font-semibold">
        <Icon icon={CircleAlert} size={20} className="text-warning shrink-0" />
        <span className="tnum">Lead đã vô hiệu hoá từ {momentText(since)}</span>
      </span>
      <Button
        size="md"
        className="pointer-coarse:h-12"
        disabled={pending}
        onClick={() => restore([code])}
      >
        Khôi phục
      </Button>
    </div>
  )
}

/** The rungs, read off the run's journey, and the lead's one next step. The
 *  move that opens a deal is in the header (`LeadHeader`). */
export function LeadTodo({
  lead,
  canStep,
}: {
  lead: LeadProfile
  /** May write the next step: holder rights on a lead still in the funnel. */
  canStep: boolean
}) {
  const runReadable = useCan('workstream.view') && lead.workstreamCode !== null
  const journey = useQuery({
    ...workstreamJourneyQuery(lead.workstreamCode ?? ''),
    enabled: runReadable,
  })
  const served = journey.data?.lead.code === lead.code ? journey.data.lead.rungs : undefined
  const { data: touches } = useQuery(leadTouchesQuery(lead.code))
  const { data: holders } = useQuery(leadVectorQuery(lead.code))
  const { data: reasons } = useQuery(leadStopReasonsQuery)
  const canAssign = useCan('lead.assign')
  const firstHeld = holders?.find((step) => step.kind === 'held')?.at

  if (journey.isLoading) return <Skeleton height={128} />
  return (
    <TodoCard
      rungs={leadRungsOf(lead, served, touches, firstHeld, reasons?.rows)}
      rungsLabel="Các bậc của lead"
      next={
        <NextStepCard
          key={lead.code}
          embedded
          subject={leadStepSubject(lead, canAssign)}
          canEdit={canStep}
        />
      }
    />
  )
}
