import { Button, GlassCard } from '@pv/ui'
import { useQuery } from '@tanstack/react-query'
import type { ConfigBundle, MotionPolicy } from '@pv/contracts'
import { activityFreshnessQuery, ladderRows } from '@/data/sales-config'
import { salesMotionsQuery } from '@/data/sales-motions'
import { FRAME_STATES, stepFrameQuery, templatesAt } from '@/data/step-frame'
import { CONFIG_AREAS, type AreaKey, type SectionId } from './sales-config-model'

/** Printed for a value that is still loading or failed to read: a zero there
 *  would be a statement about the configuration that nobody has checked. */
const UNREAD = '—'

/** Same test as the section's "nothing declared" pill, so the two agree. */
const isDeclared = (m: MotionPolicy) =>
  m.firstTouchMinutes !== null ||
  m.ownerRoleId !== null ||
  m.coldMailAllowed !== null ||
  m.selfServeCountsAsInitData !== null

/** What each section currently holds, in one line. Every figure is counted
 *  from a read the section itself makes; `undefined` is "not read". */
function useSectionValues(catalog: ConfigBundle): Record<SectionId, string | undefined> {
  const { data: freshness } = useQuery(activityFreshnessQuery)
  const { data: motions } = useQuery(salesMotionsQuery())
  const { data: frame } = useQuery(stepFrameQuery)

  const tiers = ladderRows(catalog, 'TIER')
  const states = [...FRAME_STATES.lead, ...FRAME_STATES.opportunity]

  return {
    'step-frame':
      frame &&
      `${states.length} trạng thái · ${
        states.flatMap((at) => templatesAt(frame, at)).filter((t) => t.active).length
      } bước`,
    'tier-limits':
      tiers.length === 0
        ? 'Chưa có'
        : `${tiers.filter((t) => t.limitDays !== null).length}/${tiers.length} bậc có hạn`,
    motions: motions && `${motions.filter((m) => m.active).length}/${motions.length} đang bật`,
    'motion-policy': motions && `${motions.filter(isDeclared).length}/${motions.length} đã khai`,
    'stop-reasons': `${catalog.EXIT_REASON.length} lý do`,
    'comm-criteria': `${catalog.COMM_CRITERION.length} câu`,
    'step-kinds': `${catalog.STEP_KIND.length} loại`,
    freshness: freshness && `Vàng ${freshness.warnDays} · đỏ ${freshness.alertDays} ngày`,
    'care-reasons': `${catalog.LOSS_REASON.length} lý do`,
    products: catalog.PRODUCT.length === 0 ? 'Chưa có' : `${catalog.PRODUCT.length} mục`,
  }
}

/** The landing view: every area as a card, every section as a row carrying its
 *  current value, so the whole configuration reads on one screen before any
 *  area is opened. A row opens its area AND lands on its section. */
export function ConfigOverview({
  catalog,
  onOpen,
}: {
  catalog: ConfigBundle
  onOpen: (area: AreaKey, section?: SectionId) => void
}) {
  const values = useSectionValues(catalog)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {CONFIG_AREAS.map((a) => (
        <GlassCard key={a.key} className="flex flex-col gap-3 p-5 lg:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              {a.step !== null && (
                <span className="text-muted-foreground tnum font-num">{a.step}</span>
              )}
              {a.label}
            </h2>
            <Button variant="ghost" className="pointer-coarse:h-12" onClick={() => onOpen(a.key)}>
              Mở
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {a.sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.key, s.id)}
                  className="motion-std bg-surface-ink/5 hover:bg-surface-ink/8 flex min-h-12 w-full items-center justify-between gap-4 rounded-sm px-3 py-2 text-left text-[12px]"
                >
                  {s.title}
                  <span className="text-muted-foreground tnum font-num whitespace-nowrap">
                    {values[s.id] ?? UNREAD}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  )
}
