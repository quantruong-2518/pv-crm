import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  ContextRail,
  EmptyState,
  GlassCard,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
  TriangleAlert,
} from '@pv/ui'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { ConfigBooks } from '@/components/config-books'
import { pendingApprovalsQuery } from '@/data/approvals'
import { ANCHOR_CODE, salesCatalogQuery } from '@/data/sales-config'
import { DealArea } from './sales-config-deal'
import { FrameArea } from './sales-config-frame'
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
import { ConfigNav } from './sales-config-nav'
import { ConfigOverview } from './sales-config-overview'
import type { AreaProps } from './sales-config-section'

/** Module 6 · Configuration — the one place that shapes the sales department's
 *  data. Only what the server can actually change is on this screen: every
 *  section reads `salesCatalogQuery` (Neon) or its own endpoint, none a fixture.
 *
 *  ONE mounted page, the open view in `?area=` (absent or unknown lands on the
 *  overview): sections keep unsent input in local state, and a route per area
 *  would unmount them and silently drop it. Nothing is sent from here — each
 *  section proposes its own change, and the page only holds the deadline draft
 *  so a half-typed number survives a change of area. */
export function SalesConfigPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm mục cấu hình…' })
  const { data: catalog, isPending, error, refetch } = useQuery(salesCatalogQuery)

  const [params, setParams] = useSearchParams()
  const view = viewOf(params.get('area'))

  /* Strings, not numbers: "" is a real state ("cleared"), distinct from an
     absent key ("untouched"). Converted in one place, `editsOf`. */
  const [typed, setTyped] = useState<Record<string, string>>({})

  const draft = { typed, onType: setTyped }

  /* A section inside a hidden area has no box to scroll to, so a jump from
     the overview waits here until its area has been committed as open. */
  const jump = useRef<SectionId | null>(null)
  useEffect(() => {
    if (jump.current) scrollToSection(jump.current)
    jump.current = null
  }, [view])

  function open(next: ConfigView, section?: SectionId) {
    jump.current = section ?? null
    setParams(next === OVERVIEW ? {} : { area: next }, { replace: true })
  }

  /* Law 10 · the rail is built from the E1 graph and sits OUTSIDE the loading
     branch: it must be present on every screen, skeleton included. */
  const rail = dasVina.graph
    .story(ANCHOR_CODE)
    .map((o) => ({ code: o.code, source: o.code === ANCHOR_CODE }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Cấu hình phòng kinh doanh"
          description="Mọi thay đổi là một đề nghị, có hiệu lực sau khi được duyệt."
          actions={<PendingLink />}
        />

        <ConfigBooks />

        <ContextRail objects={rail} />

        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-6">
          <ConfigNav view={view} onOpen={open} />

          {isPending ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : error || !catalog ? (
            /* An unread catalog must not draw as an EMPTY one: "no products yet"
               over a failed request is a false statement with a working form. */
            <GlassCard className="p-5 lg:p-6">
              <EmptyState
                icon={TriangleAlert}
                message={`Không đọc được cấu hình. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
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
                  <AreaBody area={a.key} catalog={catalog} draft={draft} />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScreenLayout>
    </AppShell>
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
  }
}

export default SalesConfigPage
