import {
  BriefcaseDollar,
  Filter,
  GlassCard,
  Icon,
  ListChecks,
  Phone,
  Route,
  Users,
  cn,
  type IconGlyph,
} from '@pv/ui'
import { CONFIG_AREAS, OVERVIEW, scrollToSection, type ConfigView } from './sales-config-model'

const VIEW_ICON: Record<ConfigView, IconGlyph> = {
  [OVERVIEW]: ListChecks,
  frame: Route,
  intake: Filter,
  assign: Users,
  care: Phone,
  deal: BriefcaseDollar,
}

const ENTRIES = [
  { key: OVERVIEW, label: 'Tổng quan', step: null, sections: [] },
  ...CONFIG_AREAS,
] as const

const TAB =
  'motion-std pointer-coarse:h-12 flex h-10 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[12px] font-semibold'
const IDLE = 'text-muted-foreground hover:bg-surface-ink/8 hover:text-foreground'
/* Section titles are sentences: in a 240px rail they must wrap, so these grow
   from a minimum height instead of holding a fixed one. */
const JUMP = cn(
  'motion-std pointer-coarse:min-h-12 flex min-h-10 items-center rounded-sm px-3 py-2 text-left text-[12px] font-medium',
  IDLE,
)

/** The screen's views, and under the open one its sections. A rail from `xl`
 *  up, a wrapping bar below it. Not a `SegmentedControl` — `ConfigBooks` sits
 *  right above, and stacked segmented controls read as one control. The sticky
 *  offset is the app header at its tallest, the number `SECTION_ANCHOR` uses. */
export function ConfigNav({
  view,
  onOpen,
}: {
  view: ConfigView
  onOpen: (view: ConfigView) => void
}) {
  /* A single-section area has nothing to jump between. */
  const open = ENTRIES.find((e) => e.key === view)
  const jumps =
    open && open.sections.length > 1
      ? open.sections.map((s) => (
          <button key={s.id} type="button" onClick={() => scrollToSection(s.id)} className={JUMP}>
            {s.title}
          </button>
        ))
      : null

  return (
    <nav aria-label="Khu cấu hình" className="min-w-0 xl:sticky xl:top-[128px] xl:self-start">
      <GlassCard className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap gap-1 p-2 xl:flex-col xl:flex-nowrap">
          {ENTRIES.map((e) => {
            const active = e.key === view
            return (
              <div key={e.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onOpen(e.key)}
                  className={cn(
                    TAB,
                    active ? 'bg-surface-ink/12 text-foreground shadow-control' : IDLE,
                  )}
                >
                  <Icon icon={VIEW_ICON[e.key]} size={16} />
                  {e.step !== null && <span className="tnum font-num">{e.step}</span>}
                  {e.label}
                </button>
                {active && jumps && (
                  <div className="hidden flex-col gap-1 pl-6 xl:flex">{jumps}</div>
                )}
              </div>
            )
          })}
        </div>
        {/* Below `xl` the entries wrap as a bar, so the open area's sections
            cannot nest under their entry: they take a second row. */}
        {jumps && (
          <div className="bg-surface-ink/5 flex flex-wrap gap-1 px-2 py-1 xl:hidden">{jumps}</div>
        )}
      </GlassCard>
    </nav>
  )
}
