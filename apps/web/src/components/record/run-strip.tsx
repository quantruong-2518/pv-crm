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
import { MenuButton } from './menu-button'

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
    <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {account ? (
          <Link
            to={account}
            className="pointer-coarse:min-h-12 inline-flex items-center text-[13px] font-semibold leading-[1.5]"
          >
            {journey.customer}
          </Link>
        ) : (
          <span className="text-foreground text-[13px] font-semibold leading-[1.5]">
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
          const items = itemsOf(journey, step.key)
          const codes = items.map((item) => item.code)
          /* Only when the open record is in the run: a stale journey paints nothing. */
          const here = step.key === current.kind && codes.includes(current.code)
          const focus = here ? current.code : codes.at(-1)
          const path = focus && !here ? pathOf(step.key, focus) : undefined
          const chip: RailObject | null = focus
            ? { code: focus, source: here, ...(path ? { onOpen: () => navigate(path) } : {}) }
            : null

          return (
            <li key={step.key} className="flex items-center gap-1">
              {i > 0 && <Icon icon={ChevronRight} size={16} className="text-muted-foreground" />}
              <span
                aria-current={here ? 'step' : undefined}
                className={cn('flex items-center gap-2 rounded-md px-2 py-1', here && 'bg-accent')}
              >
                <StatusDot
                  state={here ? 'current' : focus ? 'ok' : 'next'}
                  label={here ? 'đang ở đây' : focus ? 'đã tới' : 'chưa tới'}
                />
                <span
                  className={cn(
                    'text-[13px] leading-[1.5]',
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
                {items.length > 1 && (
                  <MenuButton
                    size="sm"
                    label={`+${items.length - 1}`}
                    ariaLabel={`Chọn trong ${items.length} ${step.label.toLowerCase()}`}
                    className="pointer-coarse:h-12 tnum text-[12px]"
                    choices={items.map(({ code, hint }) => ({
                      key: code,
                      label: <span className="font-mono">{code}</span>,
                      hint: code === current.code && step.key === current.kind ? 'đang mở' : hint,
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
          className="pointer-coarse:h-12"
          onClick={() => navigate(`/sales/workstreams/${encodeURIComponent(journey.code)}`)}
        >
          <Icon icon={Route} size={16} />
          Tiến trình tổng
        </Button>
      )}
    </GlassCard>
  )
}
