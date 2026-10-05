import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from '@pv/ui'
import { Button, GlassCard, Icon, SectionTitle, Skeleton } from '@pv/ui'
import { campaignLabel, sourceKindLabel, type LeadProfile } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dmy } from '@/lib/date'
import { leadStopReasonsQuery } from '@/data/leads'
import { sourcePartnerLabel } from '@/data/partners'
import { useMotionLabel } from '@/data/sales-motions'
import { leadTouchesQuery, leadVectorQuery } from '@/data/touches'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { MeetingsPanel } from '@/components/meetings-card'
import { RecordHeader } from '@/components/record/record-header'
import { TodoCard } from '@/components/record/todo-card'
import { NextStepCard } from '@/components/run/next-step'
import { leadRungsOf, leadStepSubject } from './lead-model'

/** Module 2 · the header, todo card and meetings card of the lead profile.
 *
 *  The header carries no code, state or run chip: the run strip and the todo
 *  card's rungs say those (ADR 0078 §1). Holder and origin live only in its
 *  meta line; the bar's more menu changes the holder. */
export function LeadHeader({ lead, readOnly }: { lead: LeadProfile; readOnly: boolean }) {
  const partner = sourcePartnerLabel(lead.source)
  const motionLabel = useMotionLabel()

  return (
    <RecordHeader
      title={lead.company}
      meta={[
        lead.ownerName ? `PIC ${lead.ownerName}` : 'Chưa ai nhận',
        lead.motion && `phương án tiếp cận ${motionLabel(lead.motion)}`,
        `nguồn ${lead.source.origin?.name ?? sourceKindLabel(lead.source)}`,
        partner && `giới thiệu ${partner}`,
        lead.source.campaignId && `chiến dịch ${campaignLabel(lead.source)}`,
        <span className="tnum">tạo {dmy(lead.createdAt)}</span>,
        /* `lead.canEdit` is false for a reader who reaches the lead only
           through one of its live deals (ADR 0071). */
        readOnly && 'Bạn tham gia một cơ hội của lead này, không giữ lead — chỉ xem',
      ]}
    />
  )
}

/** The rungs, read off the run's journey; the lead's one next step; and the
 *  primary move — opening a deal — only for a reader the convert door admits
 *  (ADR 0078 §3: no verdict, no button). */
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

  if (journey.isLoading) return <Skeleton height={240} />
  return (
    <TodoCard
      title="Tiến trình lead"
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

/** The meetings with this customer — the body's working card. One booking
 *  button, shown only to a reader who may book (`lead.edit`, scoped). */
export function LeadMeetings({ code, canEdit }: { code: string; canEdit: boolean }) {
  /* A counter, not a flag: a second press must reopen a door just closed. */
  const [asked, setAsked] = useState(0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Lịch gặp">
      <SectionTitle
        size="detail"
        actions={
          canEdit && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={() => setAsked((n) => n + 1)}
            >
              <Icon icon={CalendarClock} size={16} />
              Đặt lịch
            </Button>
          )
        }
      >
        Lịch gặp
      </SectionTitle>
      <MeetingsPanel code={code} canEdit={canEdit} openSchedule={asked} />
    </GlassCard>
  )
}
