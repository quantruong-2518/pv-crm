import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Filter, Handshake, Phone, Route, Send, TriangleAlert, Users } from '@pv/ui'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ContextRail,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
  StatusDot,
  cn,
  type IconGlyph,
} from '@pv/ui'
import type { ConfigList } from '@pv/contracts'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone } from '@/app/toast'
import { ConfigBooks } from '@/components/config-books'
import { pendingApprovalsQuery } from '@/data/approvals'
import { ROLE_LABEL } from '@/data/users'
import {
  ANCHOR_CODE,
  isEditDone,
  ladderRows,
  salesCatalogQuery,
  useProposeConfigEdits,
  type ConfigEdit,
  type ConfigEditResult,
} from '@/data/sales-config'
import { DealArea } from './sales-config-deal'
import { FrameArea } from './sales-config-frame'
import { AssignArea, CareArea, IntakeArea } from './sales-config-lead'
import {
  CONFIG_AREAS,
  editsOf,
  isDays,
  type AreaKey,
  type ConfigArea,
  type SectionId,
} from './sales-config-model'
import type { AreaProps } from './sales-config-section'

/** Who approves a config change: ONE link, and a ROLE rather than a person
 *  (`CONFIG_APPROVERS` in `config.approval.ts`). The screen prints the role
 *  because a person's name goes stale the day they change seats. */
const APPROVER = ROLE_LABEL.director

const AREA_ICON: Record<AreaKey, IconGlyph> = {
  intake: Filter,
  assign: Users,
  care: Phone,
  deal: Handshake,
  frame: Route,
}

/** Module 6 · Configuration — the one place that shapes the sales department's
 *  data. Only what the server can actually change is on this screen: every
 *  section reads `salesCatalogQuery` (Neon) or its own endpoint, none a fixture.
 *
 *  ONE mounted page, the open flow in `?area=`: sections keep unsent input in
 *  local state, and a route per flow would unmount them and silently drop it. */
export function SalesConfigPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm mục cấu hình…' })
  const { data: catalog, isPending, error, refetch } = useQuery(salesCatalogQuery)

  const [params, setParams] = useSearchParams()
  const area: ConfigArea = CONFIG_AREAS.find((a) => a.key === params.get('area')) ?? CONFIG_AREAS[0]

  /* Strings, not numbers: "" is a real state ("cleared"), distinct from an
     absent key ("untouched"). Converted in one place, `editsOf`. */
  const [typed, setTyped] = useState<Record<string, string>>({})

  const draft = { typed, onType: setTyped }

  const edits = editsOf(
    [
      ...ladderRows(catalog, 'STAGE').map((row) => ({
        list: 'STAGE' as ConfigList,
        row,
        what: `Hạn cột "${row.label}"`,
      })),
      ...ladderRows(catalog, 'TIER').map((row) => ({
        list: 'TIER' as ConfigList,
        row,
        what: `Hạn bậc "${row.label}"`,
      })),
    ],
    typed,
  )

  /* A box holding a non-number blocks the whole send rather than being
     dropped: dropping it would send four of five edits and say five went. */
  const bad = Object.values(typed).some((v) => v.trim() !== '' && !isDays(v))

  /* Law 10 · the rail is built from the E1 graph and sits OUTSIDE the loading
     branch: it must be present on every screen, skeleton included. */
  const rail = dasVina.graph
    .story(ANCHOR_CODE)
    .map((o) => ({ code: o.code, source: o.code === ANCHOR_CODE }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader title="Cấu hình phòng kinh doanh" actions={<PendingLink />} />

        <ConfigBooks />

        <ContextRail objects={rail} />

        <AreaNav current={area} onPick={(key) => setParams({ area: key }, { replace: true })} />

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
            {/* Every area stays MOUNTED and the closed ones are hidden: sections
                keep unsent input in local state, and unmounting drops it. */}
            {CONFIG_AREAS.map((a) => (
              <div
                key={a.key}
                hidden={a.key !== area.key}
                className={a.key === area.key ? 'flex flex-col gap-4 lg:gap-6' : undefined}
              >
                <AreaBody area={a.key} catalog={catalog} draft={draft} />
              </div>
            ))}

            <SendBar edits={edits} bad={bad} onSent={() => setTyped({})} />
          </div>
        )}
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

/** Two tiers in one bar: the flows, then the sections of the open flow. Not a
 *  `SegmentedControl` — `ConfigBooks` sits right above, and stacked segmented
 *  controls read as one control. The button paint mirrors its `quiet` tone
 *  (`segmented-control.tsx`). NOT sticky: the app header's height changes with
 *  the meeting countdown bar, and a fixed offset is wrong for one of the two. */
function AreaNav({ current, onPick }: { current: ConfigArea; onPick: (key: AreaKey) => void }) {
  const tab =
    'motion-std pointer-coarse:h-12 flex h-10 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[12px] font-semibold'
  const idle = 'text-muted-foreground hover:bg-surface-ink/8 hover:text-foreground'

  return (
    <nav aria-label="Khu cấu hình">
      <GlassCard className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap gap-1 p-2">
          {CONFIG_AREAS.map((a) => {
            const active = a.key === current.key
            return (
              <button
                key={a.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onPick(a.key)}
                className={cn(
                  tab,
                  active ? 'bg-surface-ink/12 text-foreground shadow-control' : idle,
                )}
              >
                <Icon icon={AREA_ICON[a.key]} size={16} />
                {a.label}
              </button>
            )
          })}
        </div>
        {/* A single-section flow has nothing to jump between. */}
        <div
          hidden={current.sections.length < 2}
          className={current.sections.length < 2 ? undefined : TIER_TWO}
        >
          {current.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              className={cn(tab, idle, 'font-medium')}
            >
              {s.title}
            </button>
          ))}
        </div>
      </GlassCard>
    </nav>
  )
}

const TIER_TWO = 'bg-surface-ink/5 flex flex-wrap gap-1 px-2 py-1'

/** The global reduced-motion rule stops CSS motion only; a scripted scroll has
 *  to ask for itself. */
function scrollToSection(id: SectionId) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
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

/** The send bar — every deadline edit goes at ONCE, and each becomes its own
 *  line in the approval inbox (reasoning at `useProposeConfigEdits`). Sticky
 *  while there is something to send, so an edit made in one area is not
 *  forgotten in another. Rows on the screen are NOT repainted after a send: the
 *  change has not happened until the approver says yes, on another screen. */
function SendBar({
  edits,
  bad,
  onSent,
}: {
  edits: ConfigEdit[]
  bad: boolean
  onSent: () => void
}) {
  const propose = useProposeConfigEdits()
  const canPropose = useCan('config.propose')
  const [results, setResults] = useState<ConfigEditResult[]>([])

  /* Pending edits come BEFORE the previous receipt: editing again after a send
     is a new batch and must have a button. */
  if (canPropose && edits.length > 0) {
    return (
      <div className="z-10 lg:sticky lg:bottom-4">
        <GlassCard
          variant="b"
          className="bg-hc-surface shadow-panel flex flex-col gap-3 p-4"
          role="group"
          aria-label="Thay đổi đang chờ gửi"
        >
          <h3 className="text-[13px] font-semibold">Thay đổi đang chờ gửi</h3>
          <ul className="flex flex-col gap-2">
            {edits.map((e) => (
              <li key={`${e.list}/${e.id}`} className="flex items-center gap-2 text-[11.5px]">
                <StatusDot state="warning" />
                {e.what} → <span className="tnum font-num">{e.limitDays}</span> ngày
              </li>
            ))}
          </ul>

          {bad ? (
            <p role="alert" className="text-destructive-foreground text-[11.5px]">
              Có ô đang chứa thứ không phải số ngày. Sửa trước khi gửi.
            </p>
          ) : null}

          <Button
            size="lg"
            className="self-start"
            disabled={bad || propose.isPending}
            onClick={() =>
              propose.mutate(edits, {
                onSuccess: (answers) => {
                  setResults(answers)
                  onSent()
                  const ok = answers.filter(isEditDone).length
                  toastDone(`Đã gửi ${ok}/${answers.length} đề nghị · chờ ${APPROVER} duyệt.`)
                },
              })
            }
          >
            <Icon icon={Send} size={16} />
            Gửi {APPROVER} duyệt · {edits.length} thay đổi
          </Button>
        </GlassCard>
      </div>
    )
  }

  if (results.length === 0) return null

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Đề nghị vừa gửi</h3>
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.what} className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <StatusDot state={isEditDone(r) ? 'ok' : 'bad'} />
            {r.what}
            {isEditDone(r) ? (
              <span className="text-muted-foreground font-mono text-[11px]">{r.requestId}</span>
            ) : (
              <span className="text-destructive-foreground">{r.failure}</span>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export default SalesConfigPage
