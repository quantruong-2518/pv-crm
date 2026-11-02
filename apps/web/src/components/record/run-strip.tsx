import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Route } from '@pv/ui'
import {
  Button,
  ContextRail,
  GlassCard,
  Icon,
  Skeleton,
  StatusDot,
  cn,
  type RailObject,
} from '@pv/ui'
import { WORKSTREAM_JOURNEY_STEPS, type WorkstreamJourneyResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { chainPath } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import type { RunSubject } from '@/components/run/run-subject'
import { MenuButton } from './menu-button'

/** The run strip — the same bar on every record of a run (ADR 0078 §1):
 *  run code · the five journey steps (`WORKSTREAM_JOURNEY_STEPS`), each reached
 *  step carrying its object's code chip, and the door to the tree. No company
 *  name: every record's own header already names the customer.
 *
 *  It IS the screen's ContextRail (law 10): every chip goes through it, azure
 *  for the one open. A step with several objects shows the one open, else the
 *  latest, and "+n". After-sale and growth carry no chip; after-sale reads
 *  reached once the run is in `growth` (ADR 0121 §1). When the run cannot be
 *  read, the server's chain stands in. Not
 *  `StageTrack`: that is a bar with no place for a step's object chip. */

type Journey = WorkstreamJourneyResponse
type StepKey = (typeof WORKSTREAM_JOURNEY_STEPS)[number]['key']

const STEPS = WORKSTREAM_JOURNEY_STEPS.filter((step) => step.key !== 'dropped')

const STEP_LABEL: Record<StepKey, Message> = {
  lead: message('Lead', 'Lead', '리드'),
  opportunity: message('Cơ hội', 'Opportunity', '기회'),
  contract: message('Hợp đồng', 'Contract', '계약'),
  'after-sale': message('Sau bán', 'After-sale', '사후 관리'),
  growth: message('Tăng trưởng', 'Growth', '성장'),
  dropped: message('Rơi', 'Dropped', '이탈'),
}

/** A deal's name rides along as the picker's hint: two codes alone do not tell
 *  a person which deal is which. */
const itemsOf = (journey: Journey, key: StepKey): { code: string; hint?: string }[] =>
  key === 'lead'
    ? [{ code: journey.lead.code }]
    : key === 'opportunity'
      ? journey.deals.map((deal) => ({ code: deal.code, hint: deal.name }))
      : key === 'contract'
        ? journey.contracts.map((contract) => ({ code: contract.code }))
        : []

export function RunStrip({
  workstreamCode,
  current,
  fallback,
}: {
  /** `null` = the record belongs to no run (a legacy deal). */
  workstreamCode: string | null
  current: RunSubject
  /** The server's object chain (`E1.story()`), drawn when the run cannot be read. */
  fallback?: RailObject[]
}) {
  const canSee = useCan('workstream.view')
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: canSee && workstreamCode !== null,
  })

  if (journey.isLoading) return <Skeleton height={56} />
  if (!journey.data) {
    return <ContextStrip objects={fallback ?? [{ code: current.code, source: true }]} />
  }
  return <RunBar journey={journey.data} current={current} />
}

/** The strip of a record outside a run (campaign, company, contact) and the
 *  run strip's own fallback: the ContextRail (law 10) on the strip's card. */
export function ContextStrip({ objects }: { objects: RailObject[] }) {
  return (
    <GlassCard className="flex min-h-14 items-center px-4 py-3 sm:px-5">
      <ContextRail objects={objects} />
    </GlassCard>
  )
}

function RunBar({ journey, current }: { journey: Journey; current: RunSubject }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const canOpenContract = useCan('contract.view')
  const pathOf = (key: StepKey, code: string) =>
    key === 'lead'
      ? chainPath('LD', code)
      : key === 'opportunity'
        ? chainPath('OP', code)
        : canOpenContract
          ? `/sales/contracts/${encodeURIComponent(code)}`
          : undefined

  return (
    <GlassCard className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:px-5">
      <ContextRail objects={[{ code: journey.code, source: current.kind === 'workstream' }]} />

      <ol
        role="list"
        aria-label={t(message('Các bước của lượt', 'Journey steps', '진행 단계'))}
        className="m-0 flex min-w-0 flex-1 list-none flex-wrap items-center gap-y-1 p-0"
      >
        {STEPS.map((step, i) => {
          const items = itemsOf(journey, step.key)
          const codes = items.map((item) => item.code)
          /* Only when the open record is in the run: a stale journey paints nothing. */
          const here = step.key === current.kind && codes.includes(current.code)
          const focus = here ? current.code : codes.at(-1)
          const path = focus && !here ? pathOf(step.key, focus) : undefined
          const chip: RailObject | null = focus
            ? { code: focus, source: here, ...(path ? { onOpen: () => navigate(path) } : {}) }
            : null
          const reached =
            Boolean(focus) || (step.key === 'after-sale' && journey.status === 'growth')

          return (
            <li key={step.key} className="flex items-center gap-1">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-2 h-0.5 w-4 rounded-full',
                    reached ? 'bg-success' : 'bg-surface-ink/16',
                  )}
                />
              )}
              <span
                aria-current={here ? 'step' : undefined}
                className={cn(
                  'pointer-coarse:min-h-12 flex h-9 items-center gap-2 rounded-md px-3',
                  here && 'bg-accent',
                )}
              >
                <StatusDot
                  state={here ? 'current' : reached ? 'ok' : 'next'}
                  label={t(
                    here
                      ? message('đang ở đây', 'you are here', '현재 위치')
                      : reached
                        ? message('đã tới', 'reached', '도달')
                        : message('chưa tới', 'not reached yet', '미도달'),
                  )}
                />
                <span
                  className={cn(
                    'text-[13px] leading-[1.5]',
                    here
                      ? 'text-accent-foreground font-semibold'
                      : reached
                        ? 'text-foreground font-medium'
                        : 'text-glass-foreground font-medium',
                  )}
                >
                  {t(STEP_LABEL[step.key])}
                </span>
                {chip && <ContextRail objects={[chip]} />}
                {items.length > 1 && (
                  <MenuButton
                    size="sm"
                    variant="ghost"
                    label={`+${items.length - 1}`}
                    ariaLabel={t(
                      message(
                        `Chọn trong ${items.length} ${STEP_LABEL[step.key].vi.toLowerCase()}`,
                        `Pick one of ${items.length}: ${STEP_LABEL[step.key].en}`,
                        `${STEP_LABEL[step.key].ko} ${items.length}건 중 선택`,
                      ),
                    )}
                    className="pointer-coarse:h-12 tnum h-[26px] min-h-0 rounded-sm px-2 font-mono text-[11px]"
                    choices={items.map(({ code, hint }) => ({
                      key: code,
                      label: <span className="font-mono">{code}</span>,
                      hint:
                        code === current.code && step.key === current.kind
                          ? t(message('đang mở', 'open', '열려 있음'))
                          : hint,
                      onSelect: () => {
                        const to = pathOf(step.key, code)
                        if (to) navigate(to)
                      },
                    }))}
                  />
                )}
              </span>
            </li>
          )
        })}
      </ol>

      {current.kind !== 'workstream' && (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12 h-9"
          onClick={() => navigate(`/sales/workstreams/${encodeURIComponent(journey.code)}`)}
        >
          <Icon icon={Route} size={16} />
          {t(message('Tiến trình tổng', 'Overall progress', '전체 진행 상황'))}
        </Button>
      )}
    </GlassCard>
  )
}
