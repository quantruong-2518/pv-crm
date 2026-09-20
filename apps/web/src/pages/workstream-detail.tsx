import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  ArrowLeft,
  Badge,
  Button,
  CalendarRange,
  ContextRail,
  Drawer,
  GlassCard,
  Icon,
  MessageCircle,
  ScreenHeader,
  Route,
  ScreenLayout,
  Skeleton,
  StatStrip,
  Target,
  cn,
  type StatStripItem,
} from '@pv/ui'
import { type WorkstreamProfileResponse, type WorkstreamStandKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import { chainPath, railOf } from '@/data/opportunities'
import {
  findStep,
  footprintTotal,
  runDays,
  useRefreshWorkstream,
  workstreamProfileQuery,
  type StepRef,
} from '@/data/workstreams'
import { CloseBadge } from '@/components/workstream-bits'
import { LanePanel } from './workstream-detail-parts'
import { BADGE_INK, laneStartedAt } from './workstream-lane-model'
import { Journey } from './workstream-journey'

/** One customer journey run — `/sales/workstreams/:code`, drawn as a LEFT-TO-
 *  RIGHT FAMILY TREE: lead → the deals it produced → each deal's contract →
 *  the company. `workstream-journey.tsx` draws it; the edge is what says which
 *  contract came from which deal, which is why no object code appears on this
 *  screen any more outside the rail (law 10).
 *
 *  A rung is only ever selected by a click — no fallback default — because the
 *  selection also drives the detail `Drawer`: a screen that opened with a rung
 *  already picked would open with the drawer already up, before anyone asked
 *  for it. The rail stays although the mockup has none: law 10 binds every
 *  screen, and a run has no mirror row, so the run itself is prepended.
 *
 *  The header prints no owners: every node names its own holder, and a run
 *  whose three roles are the same person used to print that person three times
 *  above a table that said it again. */

type Profile = WorkstreamProfileResponse
type Go = (path: string) => void

const BOOK = '/sales/workstreams'
const KICKER = 'Sales · Hành trình khách hàng'

const STAND_LABEL: Record<WorkstreamStandKind, string> = {
  LD: 'Lead',
  OP: 'Cơ hội',
  HĐ: 'Hợp đồng',
}

export default function WorkstreamDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: ws, isPending, error } = useQuery(workstreamProfileQuery(code))
  const [now] = useState(Date.now)
  const [picked, setPicked] = useState<StepRef | null>(null)
  const canEdit = useCan('opportunity.edit')
  const refresh = useRefreshWorkstream(code)

  if (isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </ScreenLayout>
      </AppShell>
    )
  }

  if (!ws) {
    const kind = isApiError(error) ? error.kind : undefined
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            kicker={KICKER}
            title={
              kind === 'not-found'
                ? `Không có hành trình ${code}`
                : kind === 'forbidden'
                  ? 'Bạn không được xem sổ hành trình'
                  : 'Không mở được hành trình'
            }
            description={
              kind === 'not-found'
                ? 'Mã này không có trong sổ, hoặc hành trình nằm ngoài phạm vi của bạn.'
                : isApiError(error)
                  ? userMessage(error)
                  : 'Vui lòng thử lại.'
            }
            actions={
              <Button size="lg" onClick={() => navigate(BOOK)}>
                Về sổ hành trình
              </Button>
            }
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  /* No `defaultStepOf` fallback: the selection also opens the Drawer, and a
     screen opened with a rung already picked would open with the drawer
     already up. See `data/workstreams.ts` for the now-unused export. */
  const selection = findStep(ws, picked)
  const links = ws.chain.filter((l) => l.code !== ws.code)
  const detailPath = selection && chainPath(selection.lane.kind, selection.lane.code)
  const startedAt = selection && laneStartedAt(selection.lane)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <Header ws={ws} go={navigate} />
        <ContextRail
          objects={[{ code: ws.code, source: true }, ...railOf(links, ws.code, navigate)]}
        />
        <StatStrip label="Tóm tắt hành trình" items={summaryOf(ws, now)} />

        <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
          <h3 className="font-display m-0 text-[16px] font-semibold">Hành trình</h3>
          <Journey
            ws={ws}
            selected={selection && { lane: selection.lane.code, step: selection.step.key }}
            onSelect={setPicked}
            go={navigate}
            canEdit={canEdit}
            onDealCreated={refresh}
          />
        </GlassCard>

        {/* Closing clears `picked` instead of keeping the node tinted with
            nothing open behind it — the tint IS the drawer's on-canvas half.
            Drawer itself latches the last real content while it exits. */}
        <Drawer
          open={selection !== null}
          onClose={() => setPicked(null)}
          width="md"
          title={selection ? (selection.lane.owner?.name ?? 'Chưa có người giữ') : ''}
          subtitle={
            selection &&
            [
              selection.lane.kind === 'OP' ? 'sale đầu tiên' : 'người giữ lead',
              startedAt ? `bắt đầu ${dm(startedAt)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          meta={
            selection && (
              <Badge className={cn(BADGE_INK, 'shrink-0')}>
                {selection.lane.open ? 'Đang mở' : 'Đã đóng'}
              </Badge>
            )
          }
          footer={
            detailPath && (
              <Button size="lg" onClick={() => navigate(detailPath)}>
                {selection?.lane.kind === 'OP' ? 'Mở cơ hội' : 'Mở lead'}
              </Button>
            )
          }
        >
          {selection && (
            <LanePanel
              lane={selection.lane}
              step={selection.step}
              lead={selection.lane.kind === 'LD' ? ws.lead : null}
              canEdit={canEdit}
              onSelect={setPicked}
            />
          )}
        </Drawer>
      </ScreenLayout>
    </AppShell>
  )
}

/** What the run is judged by. Every figure here was already on the wire and
 *  printed nowhere on this screen — `stand`, `overdueBy` and `footprint` were
 *  read by the book row only.
 *
 *  `waitingOn` is NOT here and is not shown anywhere else either: it names the
 *  first approval still blocking the run, which no cell on this screen answers
 *  — `step.by` is the person who MOVED the rung, a different question. Left out
 *  for want of a slot, recorded here so the gap is not mistaken for coverage. */
function summaryOf(ws: Profile, now: number): StatStripItem[] {
  const last = ws.footprint.lastContactedAt
  const open = ws.deals.filter((d) => d.outcome === 'open').length
  const late = ws.overdueBy !== null && ws.overdueBy > 0
  return [
    {
      label: 'Đang ở',
      value: STAND_LABEL[ws.stand.kind],
      context: [ws.stand.phaseLabel, ws.closedAt === null ? deadlineNote(ws.overdueBy) : null]
        .filter(Boolean)
        .join(' · '),
      /* The alarm is the lateness, not the phase — tint only when there is one. */
      tone: late ? 'warning' : 'default',
      icon: Route,
    },
    {
      /* Both numbers count the SAME set: the deals this reader may open. The
         wire sends no `hiddenOpenDeals`, so a total that included the hidden
         ones would sit over an "open" count that could not see them. */
      label: 'Cơ hội',
      value: String(ws.deals.length),
      context:
        ws.hiddenDeals > 0
          ? `${open} đang mở · +${ws.hiddenDeals} không xem được`
          : `${open} đang mở`,
      icon: Target,
    },
    {
      label: 'Liên lạc',
      value: String(footprintTotal(ws.footprint)),
      context: last === null ? 'Chưa liên lạc' : `gần nhất ${dm(last)}`,
      icon: MessageCircle,
    },
    {
      label: 'Ngày chạy',
      value: String(runDays(ws, now)),
      context: ws.closedAt === null ? `mở ${dmy(ws.openedAt)}` : `đóng ${dmy(ws.closedAt)}`,
      icon: CalendarRange,
    },
  ]
}

/** `overdueBy` is `daysHere − limitDays`, so one subtraction answers both
 *  readings. Null is "nobody set a deadline for this rung" — never "on time",
 *  so it prints nothing rather than a reassurance the server never sent. */
function deadlineNote(overdueBy: number | null): string | null {
  if (overdueBy === null) return null
  return overdueBy > 0 ? `trễ ${overdueBy} ngày` : `còn ${-overdueBy} ngày`
}

function Header({ ws, go }: { ws: Profile; go: Go }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <Button
          variant="ghost"
          size="lg"
          className="w-12 shrink-0 px-0"
          aria-label="Về sổ hành trình"
          onClick={() => go(BOOK)}
        >
          <Icon icon={ArrowLeft} size={16} />
        </Button>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground m-0 text-[12px]">{KICKER}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display m-0 text-[26px] font-semibold tracking-[-.45px]">
              {ws.customer}
            </h2>
            {ws.closedAt === null ? (
              <Badge tone="running">Đang mở</Badge>
            ) : (
              ws.closeReason !== null && <CloseBadge reason={ws.closeReason} />
            )}
          </div>
          {/* The run's own code is not printed here: ContextRail below is the
              one place a code belongs on this screen (law 10). */}
          <p className="text-muted-foreground tnum m-0 flex flex-wrap items-center gap-2 font-mono text-[12px]">
            <Icon icon={CalendarRange} size={16} />
            <span>
              mở {dmy(ws.openedAt)}
              {ws.closedAt !== null && ` · đóng ${dmy(ws.closedAt)}`}
            </span>
          </p>
        </div>
      </div>
    </header>
  )
}
