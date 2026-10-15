import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AppShell,
  Button,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  SegmentedControl,
} from '@pv/ui'
import type {
  KpiAllocation,
  KpiMetricDef,
  KpiPerson,
  KpiRoleTargets,
  KpiTargetsResponse,
  RoleId,
} from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { TARGETS_PATH, roleQuery } from './kpi-allocate-model'
import { PackageSteps } from './kpi-allocate-parts'
import { AnswersBlock, DecideBlock, ReturnedNote } from './kpi-allocate-review'
import { AllocationTable, type Recipient } from './kpi-allocate-table'
import { TargetHistoryButton } from './kpi-history'
import { MONTH_PARAM, pickFromUrl, roleGroups } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'

/** Splitting a role's agreed target per person (ADR 0098), read live from
 *  `/sales/kpi/:period/allocations`. No fixture and no scenario.
 *
 *  One role at a time, each with its own package: the four steps say where it
 *  stands, then the split, then each holder's answer and the second manager's
 *  decision. Holders come from the people book, so a role nobody has split yet
 *  still lists who would receive it.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a package is a
 *  role's month, not an object with a code a chain could be anchored on. */

/** Holders of the role, plus anyone still on a line who no longer holds it. */
function holdersOf(role: RoleId, people: readonly KpiPerson[], pkg: KpiAllocation | undefined) {
  const held: Recipient[] = people
    .filter((p) => p.scorecards.some((c) => c.role === role))
    .map((p) => ({ actorId: p.actorId, name: p.name }))
  const known = new Set(held.map((h) => h.actorId))
  const strays = (pkg?.lines ?? []).filter((l) => !known.has(l.actorId) && known.add(l.actorId))
  return [...held, ...strays.map((l) => ({ actorId: l.actorId, name: l.name }))]
}

function RoleAllocation({
  period,
  role,
  defs,
  holders,
  pkg,
  targets,
  closed,
  canSet,
  me,
}: {
  period: string
  role: RoleId
  /** The role's metrics in force, in catalog order. */
  defs: readonly KpiMetricDef[]
  holders: readonly Recipient[]
  pkg: KpiAllocation | undefined
  /** The targets read, asked only while the role has no package carrying its own totals. */
  targets: KpiRoleTargets | undefined
  closed: boolean
  canSet: boolean
  me: string | undefined
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const writable = canSet && !closed
  const status = pkg?.status
  const editable = writable && (!pkg || status === 'draft' || (status === 'returned' && editing))
  const agreed = (key: string) => targets?.metrics.find((m) => m.key === key)?.agreed?.value
  const hasTotal = pkg
    ? pkg.totals.some((t) => t.roleTarget !== null)
    : (targets?.metrics.some((m) => m.agreed !== null) ?? false)

  return (
    <>
      <PackageSteps pkg={pkg} hasTotal={hasTotal} />

      {!hasTotal && (
        <div className="flex flex-wrap items-center gap-3">
          <p className={NOTE}>Vai trò này chưa có chỉ tiêu được duyệt.</p>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => navigate(`${TARGETS_PATH}${roleQuery(period, role)}`)}
          >
            Đặt chỉ tiêu cho vai trò
          </Button>
        </div>
      )}

      {pkg && status === 'returned' && (
        <ReturnedNote
          pkg={pkg}
          onEdit={writable && !editing ? () => setEditing(true) : undefined}
        />
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="lg"
          hint={editable ? 'Để trống thì người đó theo chỉ tiêu của vai trò.' : undefined}
          actions={
            <TargetHistoryButton period={period} role={role} defs={defs} subject={{ holders }} />
          }
        >
          Phân bổ
        </SectionTitle>
        <AllocationTable
          period={period}
          role={role}
          defs={defs}
          holders={holders}
          pkg={pkg}
          roleTargetOf={(key) => agreed(key) ?? null}
          hasTotal={hasTotal}
          editable={editable}
          canSend={writable}
          me={me}
        />
      </section>

      {pkg && (status === 'submitted' || status === 'agreed') && (
        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Người nhận xác nhận</SectionTitle>
          <AnswersBlock period={period} pkg={pkg} holders={holders} />
        </section>
      )}

      {pkg && status === 'submitted' && writable && (
        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Duyệt gói chỉ tiêu</SectionTitle>
          <DecideBlock period={period} role={role} pkg={pkg} me={me} />
        </section>
      )}
    </>
  )
}

export function KpiAllocatePage() {
  const chrome = useAppChrome()
  const canSet = useCan('kpi.set-target')
  const me = useSession((s) => s.actor?.id)
  const [params] = useSearchParams()

  const [pick, setPick] = useState(() => pickFromUrl(params.get(MONTH_PARAM)))
  const [picked, setPicked] = useState(params.get('role'))
  const period = keyOf(pick)

  const catalog = useQuery(kpiCatalogQuery)
  const people = useQuery(kpiPeopleQuery(period))
  const allocations = useQuery(kpiAllocationsQuery(period))
  const targets = useQuery(kpiTargetsQuery(period))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Phân bổ chỉ tiêu"
          description="Chia chỉ tiêu của vai trò cho từng người. Gói đã gửi cần quản lý khác duyệt."
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <QueryBlock query={withCatalog(people, catalog)} what="danh sách người nhận" variant="b">
          {([{ people: list }, defs]) => {
            const groups = roleGroups(list)
            const role = (groups.find((g) => g.role === picked) ?? groups[0])?.role
            if (!role) return <p className={NOTE}>Chưa có ai giữ vai trò có KPI.</p>
            return (
              <>
                <SegmentedControl
                  label="Vai trò"
                  tone="quiet"
                  value={role}
                  onChange={setPicked}
                  options={groups.map((g) => ({
                    value: g.role,
                    label: ROLE_LABEL[g.role],
                    count: g.holders.length,
                  }))}
                />
                <QueryBlock query={allocations} what="gói phân bổ" variant="b">
                  {(data) => {
                    const pkg = data.allocations.find((a) => a.role === role)
                    const body = (t?: KpiTargetsResponse) => (
                      <>
                        {data.closed && (
                          <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
                        )}
                        <RoleAllocation
                          key={`${period}/${role}/${pkg?.version ?? 0}`}
                          period={period}
                          role={role}
                          defs={defs[role]}
                          holders={holdersOf(role, list, pkg)}
                          pkg={pkg}
                          targets={t?.roles.find((r) => r.role === role)}
                          closed={data.closed}
                          canSet={canSet}
                          me={me}
                        />
                      </>
                    )
                    /* A package carries its own role targets; the targets read is for a role not split yet. */
                    return pkg ? (
                      body()
                    ) : (
                      <QueryBlock query={targets} what="chỉ tiêu theo vai trò" variant="b">
                        {body}
                      </QueryBlock>
                    )
                  }}
                </QueryBlock>
              </>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiAllocatePage
