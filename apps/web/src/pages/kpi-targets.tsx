import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AppShell, ScreenHeader, ScreenLayout, SectionTitle, SegmentedControl } from '@pv/ui'
import type { RoleId } from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { RoleTargets } from './kpi-company-targets'
import { MONTH_PARAM, pickFromUrl } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { ApprovalQueue } from './kpi-targets-queue'

/** The director's targets desk, read live from `/sales/kpi/:period/targets`
 *  and `…/allocations`. No fixture and no scenario.
 *
 *  Step 1 is the role target table of the company screen (`RoleTargets`), one
 *  role at a time; every role stays mounted and only the picked one shows, so
 *  a value typed under one role survives a switch to another. Step 2 is what
 *  waits on the reader. Without `kpi.set-target` both steps are read only.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a role target is
 *  a role's month, not an object with a code a chain could be anchored on. */

export function KpiTargetsPage() {
  const chrome = useAppChrome()
  const canSet = useCan('kpi.set-target')
  const canAll = useCan('kpi.view-all')
  const me = useSession((s) => s.actor?.id)
  const [params, setParams] = useSearchParams()
  const pick = pickFromUrl(params.get(MONTH_PARAM))
  const period = keyOf(pick)
  const [picked, setPicked] = useState(params.get('role'))
  const stepOne = useRef<HTMLElement>(null)

  const catalog = useQuery(kpiCatalogQuery)
  const targets = useQuery(kpiTargetsQuery(period))
  const allocations = useQuery(kpiAllocationsQuery(period))
  const closed = targets.data?.closed ?? false
  const canAct = canSet && !closed

  const openRole = (role: RoleId) => {
    setPicked(role)
    /* Reduced motion stops CSS motion only; a scripted scroll asks for itself. */
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stepOne.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Đặt chỉ tiêu và duyệt"
          description={canSet ? undefined : 'Bạn chỉ có quyền xem.'}
          actions={
            <MonthPicker
              pick={pick}
              onPick={(p) => setParams({ [MONTH_PARAM]: keyOf(p) }, { replace: true })}
            />
          }
        />

        <section ref={stepOne} className="flex scroll-mt-4 flex-col gap-3">
          <SectionTitle size="lg" hint={canAct ? 'Đề nghị mới cần người khác duyệt.' : undefined}>
            {canAct ? 'Bước 1 · Đặt chỉ tiêu cho vai trò' : 'Bước 1 · Chỉ tiêu theo vai trò'}
          </SectionTitle>
          <QueryBlock
            query={withCatalog(targets, catalog)}
            what="chỉ tiêu theo vai trò"
            variant="b"
          >
            {([data, defs]) => {
              const shown = (data.roles.find((r) => r.role === picked) ?? data.roles[0])?.role
              if (!shown) return <p className={NOTE}>Chưa có vai trò nào có KPI.</p>
              return (
                <>
                  {data.closed && (
                    <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
                  )}
                  <div className="overflow-x-auto">
                    <SegmentedControl
                      label="Vai trò"
                      tone="quiet"
                      value={shown}
                      onChange={setPicked}
                      options={data.roles.map((r) => ({
                        value: r.role,
                        label: ROLE_LABEL[r.role],
                      }))}
                    />
                  </div>
                  {data.roles.map((entry) => (
                    <div key={`${data.period}/${entry.role}`} hidden={entry.role !== shown}>
                      <RoleTargets
                        catalog={defs}
                        period={data.period}
                        entry={entry}
                        canSet={canSet && !data.closed}
                        me={me}
                      />
                    </div>
                  ))}
                </>
              )
            }}
          </QueryBlock>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">
            Bước 2 · {canAct ? 'Chờ bạn duyệt' : 'Đang chờ duyệt'}
          </SectionTitle>
          <QueryBlock query={withCatalog(targets, catalog)} what="việc chờ duyệt" variant="b" quiet>
            {([t, defs]) => (
              <QueryBlock query={allocations} what="gói phân bổ" variant="b">
                {(a) => (
                  <ApprovalQueue
                    catalog={defs}
                    period={t.period}
                    roles={t.roles}
                    packages={a.allocations}
                    me={me}
                    canAct={canAct}
                    canOpenPackage={canAll}
                    onOpenRole={openRole}
                  />
                )}
              </QueryBlock>
            )}
          </QueryBlock>
        </section>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiTargetsPage
