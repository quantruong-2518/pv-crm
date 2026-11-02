import { useQuery } from '@tanstack/react-query'
import { GlassCard, SectionTitle, Skeleton, Timeline, type StatusDotState } from '@pv/ui'
import {
  type JourneyDeal,
  type JourneyDealSubStep,
  type JourneyRungState,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { opportunityStageLabel, opportunityMilestoneLabel } from '@/data/sales-labels-i18n'
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
  const { t, lang } = useI18n()
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
      className="flex flex-col gap-3 p-4 outline-none sm:p-5"
      aria-label={t(message('Tiến trình công việc', 'Opportunity timeline', '영업 기회 타임라인'))}
    >
      <SectionTitle size="detail">
        {t(message('Tiến trình công việc', 'Opportunity timeline', '영업 기회 타임라인'))}
      </SectionTitle>
      {journey.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !deal ? (
        <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(
            message(
              'Không tải được tiến trình công việc của cơ hội.',
              'Could not load the opportunity timeline.',
              '영업 기회 타임라인을 불러오지 못했습니다.',
            ),
          )}{' '}
          {isApiError(journey.error)
            ? userMessage(journey.error)
            : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}
        </p>
      ) : (
        <Timeline items={itemsOf(deal, lang, t)} className="[&>li]:pb-4" />
      )}
    </GlassCard>
  )
}

/** The accept rung names the head who took the deal off the queue: the rung's
 *  own `by` is whoever moved it, which differs on migrated deals. No rung
 *  date: the todo card's stepper carries it. */
function itemsOf(
  deal: JourneyDeal,
  lang: ReturnType<typeof useI18n>['lang'],
  t: (copy: ReturnType<typeof message>) => string,
) {
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
        title: (
          <>
            {opportunityStageLabel(rung.key, lang)}
            {by && (
              <span className="text-muted-foreground font-sans text-[12px] font-normal">
                {' · '}
                {by.name}
              </span>
            )}
          </>
        ),
        children:
          rung.subSteps.length > 0 ? (
            <SubSteps steps={rung.subSteps} lang={lang} />
          ) : quiet ? (
            <span className="text-muted-foreground">
              {t(
                message(
                  'Chưa ghi hoạt động chăm sóc nào.',
                  'No customer activities recorded yet.',
                  '기록된 고객 활동이 없습니다.',
                ),
              )}
            </span>
          ) : undefined,
      },
    ]
  })
}

/** The server words each step; a care activity names its kind from the
 *  contract's table, and it and a quote round say who recorded them. One line
 *  per step, the day in a fixed left column so no date drifts to the far edge. */
function SubSteps({
  steps,
  lang,
}: {
  steps: JourneyDealSubStep[]
  lang: ReturnType<typeof useI18n>['lang']
}) {
  return (
    <ul className="m-0 grid list-none grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 p-0">
      {steps.map((step, i) => {
        const by = step.kind === 'sign-approval' ? null : step.by
        const label =
          step.kind === 'activity' ? opportunityMilestoneLabel(step.activity, lang) : step.label
        const detail = [by?.name, step.note].filter(Boolean).join(' · ')
        return (
          <li
            key={`${i}:${step.label}`}
            className="col-span-2 grid grid-cols-subgrid items-baseline"
          >
            <span className="text-muted-foreground tnum text-[12px]">
              {step.at ? dm(step.at) : ''}
            </span>
            <span className="min-w-0 break-words text-[12px] leading-[1.5]">
              <span className="text-foreground text-[13px] font-medium">{label}</span>
              {detail && <span className="text-muted-foreground"> · {detail}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
