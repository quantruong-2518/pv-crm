import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  ArrowLeft,
  Badge,
  Button,
  CalendarRange,
  ContextRail,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
  type RailObject,
} from '@pv/ui'
import {
  JOURNEY_BORN_BY_LABEL,
  JOURNEY_STATUS_LABEL,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { dmy } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { journeyNow, workstreamJourneyQuery } from '@/data/workstream-journey'
import { runDays } from '@/data/workstreams'
import { CloseBadge } from '@/components/workstream-bits'
import { JourneyDrawer } from './workstream-drawers'
import { WorkstreamTree } from './workstream-tree'
import type { TreePick } from './workstream-tree-model'

/** One customer journey — `/sales/workstreams/:code`, the rebuilt screen E.
 *
 *  Header and rail share one glass card, then the 4-lane tree. No summary stat
 *  strip — the handoff drops it. The picked rung lives here, not in the tree,
 *  because the drawer that reads it sits beside the tree, not inside it.
 *
 *  Codes appear in the rail and nowhere else in the header (law 10); the rail
 *  reads as the story's order: previous journey, this one, its lead and account,
 *  then every journey it grew into. */

type Journey = WorkstreamJourneyResponse
type Go = (path: string) => void

const BOOK = '/sales/workstreams'
const KICKER = 'Sales · Hành trình khách hàng'

export default function WorkstreamDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: journey, isPending, error } = useQuery(workstreamJourneyQuery(code))
  /* Stamped with the journey it belongs to: moving to another journey (the
     growth drawer's CTA, the rail, Back) then opens with nothing picked. */
  const [pickedIn, setPickedIn] = useState<{ code: string; pick: TreePick } | null>(null)
  const picked = pickedIn?.code === code ? pickedIn.pick : null
  const setPicked = useCallback((pick: TreePick) => setPickedIn({ code, pick }), [code])
  /* Stable: Drawer re-runs its focus effect whenever `onClose` changes. */
  const unpick = useCallback(() => setPickedIn(null), [])

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

  if (!journey) {
    const kind = isApiError(error) ? error.kind : undefined
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            kicker={KICKER}
            title={
              kind === 'not-found'
                ? 'Không có hành trình này'
                : kind === 'forbidden'
                  ? 'Bạn không được xem sổ hành trình'
                  : 'Không mở được hành trình'
            }
            description={
              kind === 'not-found'
                ? `Mã ${code} không có trong sổ, hoặc hành trình nằm ngoài phạm vi của bạn.`
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

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* On glass, not the bare page: the success badge measures 4.57:1 on
            the panel and under 4.5 on the light theme's background (law 13). */}
        <GlassCard className="flex flex-col gap-4 p-4 lg:p-5">
          <Header journey={journey} go={navigate} />
          <ContextRail objects={railOf(journey, navigate)} />
        </GlassCard>
        <WorkstreamTree
          key={journey.code}
          journey={journey}
          go={navigate}
          picked={picked}
          onPick={setPicked}
        />
        <JourneyDrawer
          journey={journey}
          picked={picked}
          onPick={setPicked}
          onClose={unpick}
          go={navigate}
        />
      </ScreenLayout>
    </AppShell>
  )
}

/** A chip opens its detail route; the open journey is the one chip that does not. */
function railOf(j: Journey, go: Go): RailObject[] {
  const chip = (kind: 'WS' | 'LD' | 'AC', code: string): RailObject => {
    const path = chainPath(kind, code)
    return path ? { code, onOpen: () => go(path) } : { code }
  }
  return [
    ...(j.previous ? [chip('WS', j.previous.code)] : []),
    { code: j.code, source: true },
    chip('LD', j.lead.code),
    ...(j.accountCode !== null ? [chip('AC', j.accountCode)] : []),
    ...j.next.map((n) => chip('WS', n.code)),
  ]
}

function StatusBadge({ journey }: { journey: Journey }) {
  if (journey.status === 'closed') {
    return journey.closeReason !== null && <CloseBadge reason={journey.closeReason} />
  }
  /* Growth shares the success tint with a won close: both mean the customer
     bought, and law 16 lets states of one group share a colour. */
  return (
    <Badge tone={journey.status === 'open' ? 'running' : 'success'} className="shrink-0">
      {JOURNEY_STATUS_LABEL[journey.status]}
    </Badge>
  )
}

function captionOf(j: Journey): string {
  return [
    `Mở ${dmy(j.openedAt)}`,
    j.closedAt !== null ? `đóng ${dmy(j.closedAt)}` : null,
    `${runDays(j, journeyNow())} ngày`,
    j.previous
      ? `nối từ hành trình ${j.previous.ordinal} (${JOURNEY_BORN_BY_LABEL[j.previous.bornBy]})`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function Header({ journey, go }: { journey: Journey; go: Go }) {
  return (
    <header className="flex min-w-0 items-start gap-4">
      <Button
        variant="ghost"
        size="lg"
        className="hover:bg-surface-ink/9 w-12 shrink-0 bg-transparent px-0 shadow-none"
        aria-label="Về sổ hành trình"
        onClick={() => go(BOOK)}
      >
        <Icon icon={ArrowLeft} size={16} />
      </Button>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-muted-foreground m-0 text-[12px]">{KICKER}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display m-0 text-[26px] font-semibold tracking-[-.45px] lg:text-[30px]">
            {journey.customer} · hành trình {journey.ordinal}
          </h2>
          <StatusBadge journey={journey} />
        </div>
        <p className="text-muted-foreground tnum m-0 flex flex-wrap items-center gap-2 text-[12px]">
          <Icon icon={CalendarRange} size={16} />
          <span>{captionOf(journey)}</span>
        </p>
      </div>
    </header>
  )
}
