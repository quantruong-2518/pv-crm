import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Route } from '@pv/ui'
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
import { chainPath } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import type { RunSubject } from '@/components/run/run-subject'

/** The run strip — the same bar on every record of a run (ADR 0078 §1):
 *  company · run code · the five journey steps (`WORKSTREAM_JOURNEY_STEPS`),
 *  each reached step carrying its object's code chip, and the door to the tree.
 *
 *  It IS the screen's ContextRail (law 10): every chip goes through it, azure
 *  for the one open. A step with several objects shows the one open, else the
 *  latest, and "+n". After-sale and growth have no book yet, so they are places
 *  only. When the run cannot be read, the server's chain stands in. Not
 *  `StageTrack`: that is a bar with no place for a step's object chip. */

type Journey = WorkstreamJourneyResponse
type StepKey = (typeof WORKSTREAM_JOURNEY_STEPS)[number]['key']

const STEPS = WORKSTREAM_JOURNEY_STEPS.filter((step) => step.key !== 'dropped')

const codesOf = (journey: Journey, key: StepKey): string[] =>
  key === 'lead'
    ? [journey.lead.code]
    : key === 'opportunity'
      ? journey.deals.map((deal) => deal.code)
      : key === 'contract'
        ? journey.contracts.map((contract) => contract.code)
        : []

/** Who answers for a reached step, in the words the book uses: a lead outside
 *  every desk is the head's to place; a deal nobody accepted yet waits for the
 *  head's accept (ADR 0071); a contract also names who deploys it. */
function picOf(journey: Journey, key: StepKey, code: string): string | null {
  if (key === 'lead') return journey.lead.holder?.name ?? 'Chưa phân công'
  if (key === 'opportunity') {
    const deal = journey.deals.find((d) => d.code === code)
    if (!deal) return null
    return deal.holder?.name ?? (deal.acceptedAt === null ? 'Chờ nhận PIC' : null)
  }
  if (key === 'contract') {
    const contract = journey.contracts.find((c) => c.code === code)
    if (!contract) return null
    const names = [
      contract.holder?.name,
      contract.implementer && `Triển khai: ${contract.implementer.name}`,
    ]
    return names.filter(Boolean).join(' · ') || null
  }
  return null
}

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
  const navigate = useNavigate()
  const canOpenContract = useCan('contract.view')
  const canOpenAccount = useCan('account.view')
  const account = canOpenAccount && journey.accountCode && chainPath('AC', journey.accountCode)
  const pathOf = (key: StepKey, code: string) =>
    key === 'lead'
      ? chainPath('LD', code)
      : key === 'opportunity'
        ? chainPath('OP', code)
        : canOpenContract
          ? `/sales/contracts/${encodeURIComponent(code)}`
          : undefined

  return (
    <GlassCard className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {account ? (
          <Link
            to={account}
            className="pointer-coarse:min-h-12 inline-flex items-center text-[14px] font-semibold leading-[1.5]"
          >
            {journey.customer}
          </Link>
        ) : (
          <span className="text-foreground text-[14px] font-semibold leading-[1.5]">
            {journey.customer}
          </span>
        )}
        <ContextRail objects={[{ code: journey.code, source: current.kind === 'workstream' }]} />
      </div>

      <ol
        role="list"
        aria-label="Các bước của lượt"
        className="m-0 flex min-w-0 flex-1 list-none flex-wrap items-center gap-1 p-0"
      >
        {STEPS.map((step, i) => {
          const codes = codesOf(journey, step.key)
          /* Only when the open record is in the run: a stale journey paints nothing. */
          const here = step.key === current.kind && codes.includes(current.code)
          const focus = here ? current.code : codes.at(-1)
          const path = focus && !here ? pathOf(step.key, focus) : undefined
          const chip: RailObject | null = focus
            ? { code: focus, source: here, ...(path ? { onOpen: () => navigate(path) } : {}) }
            : null

          const pic = focus ? picOf(journey, step.key, focus) : null

          return (
            <li key={step.key} className="flex items-center gap-1">
              {i > 0 && <Icon icon={ChevronRight} size={16} className="text-glass-foreground" />}
              <span
                aria-current={here ? 'step' : undefined}
                className={cn('flex flex-col gap-1 rounded-md px-3 py-2', here && 'bg-accent')}
              >
                <span className="flex items-center gap-2">
                  <StatusDot
                    state={here ? 'current' : focus ? 'ok' : 'next'}
                    label={here ? 'đang ở đây' : focus ? 'đã tới' : 'chưa tới'}
                  />
                  <span
                    className={cn(
                      'text-[14px] leading-[1.5]',
                      here
                        ? 'text-accent-foreground font-semibold'
                        : focus
                          ? 'text-foreground font-medium'
                          : 'text-glass-foreground font-medium',
                    )}
                  >
                    {step.label}
                  </span>
                  {chip && <ContextRail objects={[chip]} />}
                  {codes.length > 1 && (
                    <span className="text-muted-foreground tnum text-[12px]">
                      +{codes.length - 1}
                    </span>
                  )}
                </span>
                {pic && (
                  <span
                    className="text-glass-foreground pl-5 text-[12px] leading-[1.5]"
                    title="Người giữ khâu này"
                  >
                    {pic}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      {current.kind !== 'workstream' && (
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => navigate(`/sales/workstreams/${encodeURIComponent(journey.code)}`)}
        >
          <Icon icon={Route} size={16} />
          Xem cây lượt
        </Button>
      )}
    </GlassCard>
  )
}
