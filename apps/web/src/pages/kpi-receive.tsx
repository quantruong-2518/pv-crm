import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, EmptyState, GlassCard, Inbox, ScreenHeader, ScreenLayout } from '@pv/ui'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { myPackages } from '@/data/kpi-personal'
import { keyOf, periodLabel } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { MONTH_PARAM, pickFromUrl } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { ReceivePackage } from './kpi-receive-parts'

/** Target receipt — `/sales/kpi/receive?month=YYYY-MM`: the reader's own
 *  allocation lines for the month (ADR 0098 §3), to confirm or counter.
 *  Read live from `GET /sales/kpi/:period/allocations`; no fixture.
 *
 *  The month lives in the address, so the personal KPI screen's card can open the
 *  month it counted. A package's answer deadline is printed on it (ADR 0100).
 *
 *  No ContextRail (law 10 debt, as on the personal KPI screen): a target line is not a
 *  record of any book, so there is no object a chain could be anchored on. */

const ME_PATH = '/sales/kpi/me'

export function KpiReceivePage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const pick = pickFromUrl(params.get(MONTH_PARAM))
  const period = keyOf(pick)
  const allocations = useQuery(kpiAllocationsQuery(period))
  const catalog = useQuery(kpiCatalogQuery)
  const me = useSession((s) => s.actor?.id)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: 'KPI của tôi', onClick: () => navigate(ME_PATH) }}
          title={`Chỉ tiêu ${periodLabel(period).toLowerCase()}`}
          actions={
            <MonthPicker
              pick={pick}
              onPick={(p) => setParams({ [MONTH_PARAM]: keyOf(p) }, { replace: true })}
            />
          }
        />

        <QueryBlock query={withCatalog(allocations, catalog)} what="chỉ tiêu được giao">
          {([data, defs]) => {
            const packs = myPackages(defs, data, me)
            return (
              <>
                {data.closed && <p className={NOTE}>Tháng đã kết thúc, chỉ xem.</p>}
                {packs.length === 0 && (
                  <GlassCard className={TILE}>
                    <EmptyState
                      icon={Inbox}
                      message="Tháng này bạn chưa được giao chỉ tiêu."
                      action={{ label: 'Về KPI của tôi', onClick: () => navigate(ME_PATH) }}
                      className="py-8"
                    />
                  </GlassCard>
                )}
                {packs.map((pack) => (
                  <ReceivePackage
                    key={pack.role}
                    period={data.period}
                    closed={data.closed}
                    pack={pack}
                    me={me}
                  />
                ))}
              </>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiReceivePage
