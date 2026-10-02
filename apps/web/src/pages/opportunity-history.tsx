import { useQuery } from '@tanstack/react-query'
import { GlassCard, SectionTitle, Skeleton, Timeline, type StatusDotState } from '@pv/ui'
import {
  OPPORTUNITY_MILESTONE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type JourneyDeal,
  type JourneyDealSubStep,
  type JourneyRungState,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { HISTORY_ID, historyRungId } from './opportunity-model'

/** Module 3 · the history card — what happened inside each rung the deal reached
 *  (ADR 0078 §2, the retired journey drawer's sub-steps): who moved it, every
 *  care activity with its doer and note, each quote round, each sign approval
 *  and its decision. Read off the run's journey, the drawer's own data, so it
 *  shows under the same `workstream.view` the drawer needed. The stepper above
 *  already says which rungs were skipped or not reached; only reached ones list. */

const RUNG_DOT: Partial<Record<JourneyRungState, StatusDotState>> = {
  done: 'ok',
  current: 'current',
  stopped: 'bad',
}

export function DealHistoryCard({ op }: { op: OpportunityProfileResponse }) {
  const open = useCan('workstream.view') && op.workstream !== null
  const journey = useQuery({
    ...workstreamJourneyQuery(op.workstream?.code ?? ''),
    enabled: open,
  })
  if (!open) return null
  const deal = journey.data?.deals.find((d) => d.code === op.code)

  return (
    <GlassCard
      variant="b"
      id={HISTORY_ID}
      tabIndex={-1}
      className="flex flex-col gap-4 p-4 outline-none sm:p-5"
      aria-label="Diễn biến"
    >
      <SectionTitle size="detail">Diễn biến</SectionTitle>
      {journey.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !deal ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Không đọc được diễn biến của cơ hội.{' '}
          {isApiError(journey.error) ? userMessage(journey.error) : 'Vui lòng thử lại.'}
        </p>
      ) : (
        <Timeline items={itemsOf(deal)} />
      )}
    </GlassCard>
  )
}

/** The accept rung names the head who took the deal off the queue: the rung's
 *  own `by` is whoever moved it, which differs on migrated deals. No rung
 *  date: the todo card's stepper carries it. */
function itemsOf(deal: JourneyDeal) {
  return deal.rungs.flatMap((rung) => {
    const dot = RUNG_DOT[rung.state]
    if (!dot) return []
    const by = rung.key === 'assigned' && deal.acceptedBy ? deal.acceptedBy : rung.by
    const quiet = rung.key === 'engaged' && rung.subSteps.length === 0
    return [
      {
        id: rung.key,
        domId: historyRungId(rung.key),
        state: dot,
        title: OPPORTUNITY_STAGE_LABEL[rung.key],
        meta: by && <span className="text-muted-foreground text-[12px]">{by.name}</span>,
        children:
          rung.subSteps.length > 0 ? (
            <SubSteps steps={rung.subSteps} />
          ) : quiet ? (
            <span className="text-muted-foreground">Chưa ghi hoạt động chăm sóc nào.</span>
          ) : undefined,
      },
    ]
  })
}

/** The server words each step; a care activity names its kind from the
 *  contract's table, and it and a quote round say who recorded them. */
function SubSteps({ steps }: { steps: JourneyDealSubStep[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((step, i) => {
        const by = step.kind === 'sign-approval' ? null : step.by
        const label =
          step.kind === 'activity' ? OPPORTUNITY_MILESTONE_LABEL[step.activity] : step.label
        return (
          <li key={`${i}:${step.label}`} className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="text-foreground text-[13px] font-medium">{label}</span>
              {step.at && (
                <span className="text-muted-foreground tnum shrink-0 text-[12px]">
                  {dm(step.at)}
                </span>
              )}
            </span>
            {(by || step.note) && (
              <span className="text-muted-foreground break-words text-[12px] leading-[1.5]">
                {[by?.name, step.note].filter(Boolean).join(' · ')}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
