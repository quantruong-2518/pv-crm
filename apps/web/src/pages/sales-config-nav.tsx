import {
  BriefcaseDollar,
  Filter,
  GlassCard,
  Icon,
  ListChecks,
  NavItem,
  Phone,
  Route,
  Target,
  Users,
  cn,
  type IconGlyph,
} from '@pv/ui'
import { CONFIG_AREAS, OVERVIEW, type ConfigArea, type ConfigView } from './sales-config-model'

/** The screen's views, drawn twice from ONE list: nested under the Sales setup
 *  entry of the settings nav from `lg` up, and as a wrapping bar on the page
 *  below it, where the settings nav is hidden. Sections are reached by `#id`
 *  links, so a section can be linked to and Back returns from it. */

const VIEW_ICON: Record<ConfigView, IconGlyph> = {
  [OVERVIEW]: ListChecks,
  frame: Route,
  intake: Filter,
  assign: Users,
  care: Phone,
  deal: BriefcaseDollar,
  kpi: Target,
}

const ENTRIES = [
  { key: OVERVIEW, label: 'Tổng quan', step: null, sections: [] },
  ...CONFIG_AREAS,
] as const

const TAB =
  'motion-std pointer-coarse:h-12 flex h-10 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[12px] font-semibold'
const IDLE = 'text-muted-foreground hover:bg-surface-ink/8 hover:text-foreground'

type NavProps = { view: ConfigView; onOpen: (view: ConfigView) => void }

/** The `subNav` of `SettingsShell`: one indented row per view. */
export function ConfigSubNav({ view, onOpen }: NavProps) {
  return (
    <div role="group" aria-label="Khu cấu hình" className="flex flex-col gap-1">
      {ENTRIES.map((e) => (
        <NavItem
          key={e.key}
          depth={1}
          icon={VIEW_ICON[e.key]}
          label={e.step === null ? e.label : `${e.step} · ${e.label}`}
          active={e.key === view}
          onClick={() => onOpen(e.key)}
          className="pointer-coarse:h-12"
        />
      ))}
    </div>
  )
}

/** Below `lg` only. A wrapping bar, not a `SegmentedControl`: seven labelled
 *  views do not fit one row on a phone, and a segmented control cannot wrap. */
export function ConfigNav({ view, onOpen }: NavProps) {
  return (
    <nav aria-label="Khu cấu hình" className="min-w-0 xl:hidden">
      <GlassCard className="flex flex-wrap gap-1 p-2">
        {ENTRIES.map((e) => {
          const active = e.key === view
          return (
            <button
              key={e.key}
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
          )
        })}
      </GlassCard>
    </nav>
  )
}

/** The open area's sections as plain `#id` links: the browser keeps each jump
 *  in history and the page scrolls to the hash. A single-section area has
 *  nothing to jump between. */
export function SectionLinks({ area }: { area: ConfigArea }) {
  if (area.sections.length < 2) return null
  return (
    <nav aria-labelledby={`${area.key}-jump`} className="flex flex-wrap items-center gap-2">
      <span id={`${area.key}-jump`} className="text-muted-foreground text-[11.5px]">
        Trong phần này
      </span>
      {area.sections.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={cn(TAB, 'bg-surface-ink/5 font-medium', IDLE)}>
          {s.title}
        </a>
      ))}
    </nav>
  )
}
