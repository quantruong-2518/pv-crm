import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, GlassCard, ScreenHeader, Skeleton, TriangleAlert } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { SettingsShell } from '@/components/settings-shell'
import { pendingApprovalsQuery } from '@/data/approvals'
import { salesCatalogQuery } from '@/data/sales-config'
import { DealArea } from './sales-config-deal'
import { FrameArea } from './sales-config-frame'
import { KpiArea } from './sales-config-kpi'
import { AssignArea, CareArea, IntakeArea } from './sales-config-lead'
import {
  CONFIG_AREAS,
  OVERVIEW,
  scrollToSection,
  viewOf,
  type AreaKey,
  type ConfigView,
  type SectionId,
} from './sales-config-model'
import { ConfigNav, ConfigSubNav, SectionLinks } from './sales-config-nav'
import { ConfigOverview } from './sales-config-overview'
import type { AreaProps } from './sales-config-section'

const SECTION_IDS: SectionId[] = CONFIG_AREAS.flatMap((a) => a.sections.map((s) => s.id))

/** Module 6 · Configuration — the one place that shapes the sales department's
 *  data. Only what the server can actually change is on this screen: every
 *  section reads `salesCatalogQuery` (Neon) or its own endpoint, none a fixture.
 *
 *  ONE mounted page, the open view in `?area=` (absent or unknown lands on the
 *  overview) and the open section in the hash: sections keep unsent input in
 *  local state, and a route per area would unmount them and silently drop it.
 *  Each change of area is pushed, so Back steps back through areas. Nothing is
 *  sent from here — each section proposes its own change, and the page only
 *  holds the deadline draft so a half-typed number survives a change of area.
 *
 *  No ContextRail (law 10): a config list holds no object code to anchor one. */
export function SalesConfigPage() {
  const { data: catalog, isPending, error, refetch } = useQuery(salesCatalogQuery)

  const navigate = useNavigate()
  const { search, hash } = useLocation()
  const view = viewOf(new URLSearchParams(search).get('area'))

  /* Strings, not numbers: "" is a real state ("cleared"), distinct from an
     absent key ("untouched"). Converted in one place, `editsOf`. */
  const [typed, setTyped] = useState<Record<string, string>>({})

  const draft = { typed, onType: setTyped }

  /* A section inside a hidden area has no box to scroll to, so this runs again
     once its area is open and once the catalog has drawn the areas at all. */
  const drawn = catalog !== undefined
  useEffect(() => {
    const id = SECTION_IDS.find((s) => s === hash.slice(1))
    if (id) scrollToSection(id)
  }, [hash, view, drawn])

  function open(next: ConfigView, section?: SectionId) {
    const to = {
      search: next === OVERVIEW ? '' : `?area=${next}`,
      hash: section ? `#${section}` : '',
    }
    /* Re-opening the open view would push a copy of this page, and Back
       would then seem to do nothing. */
    if (to.search === search && to.hash === hash) return
    navigate(to)
    /* The nav stays put while the page scrolls, so a new area would open midway. */
    if (!section) window.scrollTo({ top: 0 })
  }

  return (
    <SettingsShell
      searchPlaceholder="Tìm mục cấu hình…"
      subNav={<ConfigSubNav view={view} onOpen={open} />}
    >
      <ScreenHeader
        title="Thiết lập bán hàng"
        description="Thay đổi có hiệu lực sau khi được duyệt."
        actions={<PendingLink />}
      />

      <ConfigNav view={view} onOpen={open} />

      {isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !catalog ? (
        /* An unread catalog must not draw as an EMPTY one. Not `error`: a
           failed focus refetch keeps the old data, and swapping to this card
           would unmount the areas and drop unsent input. */
        <GlassCard className="p-5 lg:p-6">
          <EmptyState
            tone="danger"
            icon={TriangleAlert}
            message={
              isApiError(error)
                ? `Không tải được thiết lập. ${userMessage(error)}`
                : 'Không tải được thiết lập.'
            }
            action={{ label: 'Thử lại', onClick: () => void refetch() }}
            className="py-12"
          />
        </GlassCard>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          {view === OVERVIEW && <ConfigOverview catalog={catalog} onOpen={open} />}

          {/* Every area stays MOUNTED and hidden while closed, also under
              the overview: sections keep unsent input in local state. The
              overview holds none, so it alone unmounts. */}
          {CONFIG_AREAS.map((a) => (
            <div
              key={a.key}
              hidden={a.key !== view}
              className={a.key === view ? 'flex flex-col gap-4 lg:gap-6' : undefined}
            >
              <SectionLinks area={a} />
              <AreaBody area={a.key} catalog={catalog} draft={draft} />
            </div>
          ))}
        </div>
      )}
    </SettingsShell>
  )
}

/** How many CONFIG proposals wait on the reader as approver, as a door to the
 *  inbox. The inbox is ONE screen for the whole product (`/approvals`); this
 *  screen links there rather than drawing a second list of the same rows. A
 *  proposer's own outstanding requests are not in this read. */
function PendingLink() {
  const { data: rows } = useQuery(pendingApprovalsQuery())
  const count = rows?.filter((r) => r.kind === 'config-change').length ?? 0
  if (count === 0) return null

  return (
    <Link
      to="/approvals"
      className="bg-warning/20 stone:bg-warning/12 text-on-tint-warning motion-std pointer-coarse:h-12 inline-flex h-10 items-center gap-2 rounded-md px-3 text-[12px] font-semibold"
    >
      <span className="tnum font-num">{count}</span> đề nghị cấu hình chờ bạn duyệt
    </Link>
  )
}

function AreaBody({ area, ...props }: AreaProps & { area: AreaKey }) {
  switch (area) {
    case 'intake':
      return <IntakeArea />
    case 'assign':
      return <AssignArea />
    case 'care':
      return <CareArea {...props} />
    case 'deal':
      return <DealArea {...props} />
    case 'frame':
      return <FrameArea {...props} />
    case 'kpi':
      return <KpiArea />
  }
}

export default SalesConfigPage
