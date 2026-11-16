import { useQueries } from '@tanstack/react-query'
import { RoleId, isTieredPeriod, kpiAssignmentNeedsSet } from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiAssignmentPageQuery } from '@/data/kpi-assignment'
import { keyOf } from './home-model'
import { monthPick, stepMonth } from './kpi-model'

/** Ids, links and the assign read the unit tab's cards share; no render. */

export const FORECAST_CARD_ID = 'kpi-unit-forecast'
export const ONE_CARD_ID = 'kpi-unit-one-on-one'

/** The month being assigned is the one after the running month; the caller has
 *  something to do while their unit's set for it is not sent. */
export function useAssignMonthToSend(
  unitId: string,
  catalog: KpiCatalog,
  enabled: boolean,
): string | null {
  const next = stepMonth(monthPick(), 1)
  const month = next ? keyOf(next) : null
  const live = enabled && month !== null && isTieredPeriod(month)
  const roles = live ? RoleId.options.filter((r) => catalog[r].length > 0) : []
  const pages = useQueries({
    queries: roles.map((role) => ({
      ...kpiAssignmentPageQuery(month ?? '', role, unitId),
      retry: false,
    })),
  })
  const open = pages.some(
    (p) =>
      p.data &&
      p.data.canAct &&
      p.data.set?.status !== 'sent' &&
      kpiAssignmentNeedsSet(
        catalog[p.data.role],
        p.data.unit.kind === 'company',
        p.data.children.length > 0,
      ),
  )
  return open ? month : null
}
