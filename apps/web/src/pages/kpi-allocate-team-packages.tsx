import { useNavigate } from 'react-router-dom'
import { Button, DataTable, GlassCard, SectionTitle, cn, type TableColumn } from '@pv/ui'
import { KPI_METRIC_LABEL, type KpiAllocation, type KpiMetricDef } from '@pv/contracts'
import { NOTE } from './home-tiles'
import { teamPath } from './kpi-allocate-model'
import { PackageSteps } from './kpi-allocate-parts'
import { AnswersBlock, DecideBlock, ReturnedNote } from './kpi-allocate-review'
import { DASH, printValue } from './kpi-model'

/** A team lead's split of the team's share, as the head reads it under the
 *  room table (ADR 0101): who got what, whether the members answered, and the
 *  head's own decision. Read-only; the lead edits it on the team page, because
 *  only the lead drafts and sends a team package.
 *
 *  A draft is the lead's unsent work and is not shown; the team row above says
 *  it is not split yet. */

function LinesTable({ defs, pkg }: { defs: readonly KpiMetricDef[]; pkg: KpiAllocation }) {
  const people = [...new Map(pkg.lines.map((l) => [l.actorId, l.name]))]
  const columns: TableColumn[] = [
    { header: 'Thành viên', width: 'minmax(160px,1.2fr)' },
    ...defs.map((def) => ({
      header: KPI_METRIC_LABEL[def.key],
      width: 'minmax(168px,1fr)',
      align: 'right' as const,
    })),
  ]
  return (
    <GlassCard variant="b" className="py-4">
      <div className="overflow-x-auto">
        <DataTable
          flush
          rowHeight="min-h-14 py-2"
          className={defs.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
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
      </div>
    </GlassCard>
  )
}

function TeamPackage({
  period,
  defs,
  pkg,
  canDecide,
  me,
}: {
  period: string
  defs: readonly KpiMetricDef[]
  pkg: KpiAllocation
  canDecide: boolean
  me: string | undefined
}) {
  const navigate = useNavigate()
  const team = pkg.team
  if (!team) return null
  const holders = [...new Map(pkg.lines.map((l) => [l.actorId, l.name]))].map(
    ([actorId, name]) => ({ actorId, name }),
  )
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="lg"
        actions={
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(teamPath(team.id, period))}
          >
            Mở trang nhóm
          </Button>
        }
      >
        Nhóm {team.name}
      </SectionTitle>
      <PackageSteps pkg={pkg} hasTotal />
      {pkg.shareChanged && (
        <p className={cn(NOTE, 'font-semibold')}>Phần của nhóm đã đổi, chờ chia lại.</p>
      )}
      {pkg.status === 'returned' && <ReturnedNote pkg={pkg} />}
      <LinesTable defs={defs} pkg={pkg} />
      {pkg.lines.length > 0 && (pkg.status === 'submitted' || pkg.status === 'agreed') && (
        <AnswersBlock period={period} pkg={pkg} holders={holders} />
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
  canDecide,
  me,
}: {
  period: string
  /** The role's metrics in force, in catalog order. */
  defs: readonly KpiMetricDef[]
  /** Team packages of the role. */
  packages: readonly KpiAllocation[]
  /** The team the reader came for (`?team=`): listed first. */
  focus: string | null
  canDecide: boolean
  me: string | undefined
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
          canDecide={canDecide}
          me={me}
        />
      ))}
    </>
  )
}
