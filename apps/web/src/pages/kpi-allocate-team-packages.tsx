import { useNavigate } from 'react-router-dom'
import { Button, GlassCard, SectionTitle, cn } from '@pv/ui'
import { type KpiAllocation, type KpiCounter, type KpiMetricDef } from '@pv/contracts'
import { kpiMetricText } from '@/data/kpi-i18n'
import { message, useI18n } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { NOTE } from './home-tiles'
import { teamPath } from './kpi-allocate-model'
import { PackageSteps } from './kpi-allocate-parts'
import { AnswersBlock, DecideBlock, ReturnedNote } from './kpi-allocate-review'
import { DASH, printValue } from './kpi-model'
import { teamStepId } from './kpi-targets-model'

/** A team lead's split of the team's share, as the head reads it under the
 *  room table (ADR 0101): who got what, whether the members answered, and the
 *  head's own decision. Read-only; the lead edits it on the team page, because
 *  only the lead drafts and sends a team package. Each section is a step's
 *  anchor, so `?team=` lands on it.
 *
 *  A draft is the lead's unsent work and is not shown; the team row above says
 *  it is not split yet. */

function LinesTable({ defs, pkg }: { defs: readonly KpiMetricDef[]; pkg: KpiAllocation }) {
  const { t } = useI18n()
  const people = [...new Map(pkg.lines.map((l) => [l.actorId, l.name]))]
  const columns: StackColumn[] = [
    { header: t(message('Thành viên', 'Member', '구성원')), width: 'minmax(160px,1.2fr)' },
    ...defs.map((def) => ({
      header: kpiMetricText(def.key),
      width: 'minmax(168px,1fr)',
      align: 'right' as const,
    })),
  ]
  return (
    <GlassCard variant="b" className="py-4">
      <StackTable
        from="lg"
        flush
        rowHeight="min-h-14 py-2"
        tableClassName={defs.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
        columns={columns}
        rows={people.map(([actorId, name]) => ({
          id: actorId,
          cells: [
            <span key="who" className="truncate font-semibold">
              {name}
            </span>,
            ...defs.map((def) => {
              const line = pkg.lines.find((l) => l.actorId === actorId && l.metricKey === def.key)
              return (
                <span key={def.key} className="tnum font-num font-semibold">
                  {line ? printValue(def.unit, line.value) : DASH}
                </span>
              )
            }),
          ],
        }))}
      />
    </GlassCard>
  )
}

function TeamPackage({
  period,
  defs,
  pkg,
  counters,
  canDecide,
  me,
  onOpenCounters,
}: {
  period: string
  defs: readonly KpiMetricDef[]
  pkg: KpiAllocation
  counters: readonly KpiCounter[]
  canDecide: boolean
  me: string | undefined
  onOpenCounters: (actorId: string, teamId: string) => void
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const team = pkg.team
  if (!team) return null
  const holders = [...new Map(pkg.lines.map((l) => [l.actorId, l.name]))].map(
    ([actorId, name]) => ({ actorId, name }),
  )
  return (
    <section id={teamStepId(pkg.role, team.id)} className="flex scroll-mt-4 flex-col gap-3">
      <SectionTitle
        size="lg"
        actions={
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(teamPath(team.id, period))}
          >
            {t(message('Mở trang nhóm', 'Open team page', '팀 페이지 열기'))}
          </Button>
        }
      >
        {t(message(`Nhóm ${team.name}`, `Team ${team.name}`, `${team.name} 팀`))}
      </SectionTitle>
      <PackageSteps pkg={pkg} hasTotal />
      {pkg.shareChanged && (
        <p className={cn(NOTE, 'font-semibold')}>
          {t(
            message(
              'Phần của nhóm đã đổi, chờ chia lại.',
              'The team share changed. Reallocate it.',
              '팀 배정량이 변경되었습니다. 다시 배분하세요.',
            ),
          )}
        </p>
      )}
      {pkg.status === 'returned' && <ReturnedNote pkg={pkg} />}
      <LinesTable defs={defs} pkg={pkg} />
      {pkg.lines.length > 0 && (pkg.status === 'submitted' || pkg.status === 'agreed') && (
        <AnswersBlock
          pkg={pkg}
          holders={holders}
          counters={counters.filter((c) => c.team?.id === team.id)}
          onOpenCounters={(actorId) => onOpenCounters(actorId, team.id)}
        />
      )}
      {pkg.status === 'submitted' && canDecide && (
        <DecideBlock period={period} role={pkg.role} pkg={pkg} me={me} />
      )}
    </section>
  )
}

export function TeamPackages({
  period,
  defs,
  packages,
  focus,
  counters,
  canDecide,
  me,
  onOpenCounters,
}: {
  period: string
  /** The role's metrics in force, in catalog order. */
  defs: readonly KpiMetricDef[]
  /** Team packages of the role. */
  packages: readonly KpiAllocation[]
  /** The team the reader came for (`?team=`): listed first. */
  focus: string | null
  /** The role's counters this month, any status and tier. */
  counters: readonly KpiCounter[]
  canDecide: boolean
  me: string | undefined
  onOpenCounters: (actorId: string, teamId: string) => void
}) {
  const sent = packages
    .filter((p) => p.status !== 'draft')
    .sort((a, b) => Number(b.team?.id === focus) - Number(a.team?.id === focus))
  return (
    <>
      {sent.map((pkg) => (
        <TeamPackage
          key={pkg.team?.id}
          period={period}
          defs={defs}
          pkg={pkg}
          counters={counters}
          canDecide={canDecide}
          me={me}
          onOpenCounters={onOpenCounters}
        />
      ))}
    </>
  )
}
