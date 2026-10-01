import type { ReactNode } from 'react'
import { Button, ChevronLeft, ChevronRight, Icon, cn } from '@pv/ui'
import type { DueLevel, JourneyDealSubStep, JourneyRungKey, JourneySubStep } from '@pv/contracts'
import { dm } from '@/lib/date'
import { DueBadge } from '@/components/contract-bits'
import {
  lateLevel,
  rungStatus,
  STATE_WORD,
  type PickKind,
  type RailRung,
  type TreePick,
} from './workstream-tree-model'
import { RungDot } from './workstream-tree-cards'
import { TEXT } from './workstream-drawer-text'

/** The shared pieces of the journey drawers — section, facts, ladder, stats,
 *  footer — split out of `workstream-drawers.tsx` so each body file stays under
 *  the size ceiling. Read-only shapes; every act lives in the body that uses it. */

type Pick = (pick: TreePick) => void

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 flex flex-col">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
          <dt className="text-muted-foreground shrink-0">{label}</dt>
          <dd className="tnum m-0 min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-md px-4 py-3 text-[14px]">
      <span className="text-muted-foreground text-[12px] font-semibold">{title}</span>
      <span>{children}</span>
    </div>
  )
}

/** The `done` due word is a money word (open question #24), so a finished
 *  milestone shows its date and no due pill. */
export function DuePill({ level, money = false }: { level: DueLevel | null; money?: boolean }) {
  if (level === null || (level === 'done' && !money)) return null
  return <DueBadge level={level} className="shrink-0 normal-case tracking-normal" />
}

type AnyStep = JourneySubStep | JourneyDealSubStep

/** The server sends each step's final wording, so the label prints as-is. */
function SubStepRow({ step }: { step: AnyStep }) {
  const when = step.at ? dm(step.at) : step.due ? `${TEXT.due} ${dm(step.due)}` : null
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="flex pt-1">
        <RungDot rung={{ state: step.state, late: lateLevel(step.dueLevel) }} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-1">
        <span className={cn('text-[14px]', step.state === 'current' && 'font-semibold')}>
          {step.label}
        </span>
        {step.note && <span className="text-muted-foreground text-[12px]">{step.note}</span>}
      </span>
      {when && <span className="text-muted-foreground tnum shrink-0 text-[12px]">{when}</span>}
      <DuePill level={step.dueLevel} />
    </li>
  )
}

export function SubSteps({ title, steps }: { title: string; steps: AnyStep[] }) {
  if (steps.length === 0) return null
  return (
    <Section title={title}>
      <ul className="m-0 flex list-none flex-col p-0">
        {steps.map((s, i) => (
          <SubStepRow key={`${i}:${s.label}`} step={s} />
        ))}
      </ul>
    </Section>
  )
}

/** Every rung of the object, each a 48px button that moves the selection. */
export function Ladder({
  kind,
  code,
  rungs,
  on,
  onPick,
}: {
  kind: PickKind
  code: string
  rungs: RailRung[]
  on: JourneyRungKey
  onPick: Pick
}) {
  return (
    <Section title={TEXT.ladder}>
      <ol className="m-0 grid list-none grid-cols-5 gap-1 p-0">
        {rungs.map((r) => {
          const picked = r.key === on
          return (
            <li key={r.key} className="min-w-0">
              <button
                type="button"
                aria-current={picked ? 'step' : undefined}
                aria-label={`${r.label} · ${rungStatus(r.state, r.late).label}`}
                onClick={() => onPick({ kind, code, rung: r.key })}
                className={cn(
                  'motion-std flex min-h-16 w-full flex-col items-start gap-2 rounded-md px-2 py-3 text-left',
                  picked
                    ? 'bg-surface-ink/9 shadow-[inset_0_0_0_1px_var(--primary)]'
                    : 'bg-muted hover:bg-surface-ink/9',
                )}
              >
                <RungDot rung={r} />
                <span className={cn('break-words text-[12px]', picked && 'font-semibold')}>
                  {r.label}
                </span>
                <span className="text-muted-foreground tnum text-[11px]">
                  {r.state === 'skipped' ? STATE_WORD.skipped : r.at ? dm(r.at) : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

export function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', items.length > 2 && 'sm:grid-cols-3')}>
      {items.map(([label, value]) => (
        <div key={label} className="bg-muted flex flex-col gap-1 rounded-md p-3">
          <span className="text-muted-foreground text-[12px]">{label}</span>
          <span className="tnum text-[16px] font-semibold">{value}</span>
        </div>
      ))}
    </div>
  )
}

export function Footer({
  prev,
  next,
  extra,
  cta,
}: {
  prev?: () => void
  next?: () => void
  /** A primary act of its own; when it shows, the CTA steps down to secondary. */
  extra?: { node: ReactNode; leads: boolean }
  cta?: { label: string; onClick: () => void }
}) {
  /* `aria-disabled`, not `disabled`: a disabled button drops focus to <body>
     when the last rung is reached from the keyboard. */
  const nav = (go?: () => void) =>
    ({
      'aria-disabled': !go,
      onClick: go ?? (() => undefined),
      className: cn(
        'hover:bg-surface-ink/16 w-12 px-0',
        !go && 'text-muted-foreground cursor-not-allowed',
      ),
    }) as const
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(prev || next) && (
        <>
          <Button variant="ghost" size="lg" aria-label={TEXT.prev} {...nav(prev)}>
            <Icon icon={ChevronLeft} size={16} />
          </Button>
          <Button variant="ghost" size="lg" aria-label={TEXT.nextRung} {...nav(next)}>
            <Icon icon={ChevronRight} size={16} />
          </Button>
        </>
      )}
      {/* Grouped so the pair wraps as one, right-aligned, at 390px. */}
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {extra?.node}
        {cta && (
          <Button size="lg" variant={extra?.leads ? 'secondary' : 'default'} onClick={cta.onClick}>
            {cta.label}
          </Button>
        )}
      </div>
    </div>
  )
}

export const Kicker = ({ phase, children }: { phase: string; children: ReactNode }) => (
  <span className="flex flex-wrap items-center gap-2">
    <span className="font-semibold">{phase}</span>
    {children}
  </span>
)
