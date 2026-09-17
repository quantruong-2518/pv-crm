import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  ArrowLeft,
  Avatar,
  Badge,
  Button,
  ContextRail,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type {
  WorkstreamHolder,
  WorkstreamProfileResponse,
  WorkstreamStandKind,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmy } from '@/lib/date'
import { railOf } from '@/data/opportunities'
import {
  dealOwnerOf,
  defaultStepOf,
  findStep,
  lanesOf,
  runDays,
  useRefreshWorkstream,
  workstreamProfileQuery,
  type StepRef,
} from '@/data/workstreams'
import { CloseBadge } from '@/components/workstream-bits'
import { DetailSidePanel } from '@/components/detail-side-panel'
import {
  AccountLaneRow,
  CreateDealButton,
  DealLaneRow,
  LeadLaneRow,
  StepDot,
  StepPanel,
} from './workstream-detail-parts'

/** One customer journey run — `/sales/workstreams/:code`, drawn as swimlanes:
 *  one lead lane, one lane per deal (oldest first, several may be open), one
 *  account lane. Every step cell selects; the side panel reads the selection
 *  and ticks a deal's stage criteria (the deal profile ticks them too). Lanes
 *  are only deals the reader may open; the rest are a count, `hiddenDeals`.
 *
 *  Only a click is stored; until then the selection is derived on every render
 *  (`defaultStepOf`), so a refetch after a tick moves it with the data. The
 *  rail stays although the mockup has none: law 10 binds every screen, and a
 *  run has no mirror row, so the run itself is prepended. */

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

  const selection = findStep(ws, picked) ?? findStep(ws, defaultStepOf(ws))
  const links = ws.chain.filter((l) => l.code !== ws.code)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <Header ws={ws} now={now} go={navigate} />
        <ContextRail
          objects={[{ code: ws.code, source: true }, ...railOf(links, ws.code, navigate)]}
        />

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,78fr)_minmax(260px,22fr)]">
          <GlassCard variant="b" className="min-w-0 p-5 lg:p-6" aria-label="Hành trình">
            <Journey
              ws={ws}
              selected={selection && { lane: selection.lane.code, step: selection.step.key }}
              onSelect={setPicked}
              canCreate={canEdit && ws.lead.outcome !== 'exited'}
              onCreated={refresh}
              go={navigate}
            />
          </GlassCard>

          <DetailSidePanel>
            <GlassCard variant="b" className="p-5" aria-label="Bước đang chọn">
              {selection ? (
                <StepPanel
                  lane={selection.lane}
                  step={selection.step}
                  canEdit={canEdit}
                  onSelect={setPicked}
                  go={navigate}
                />
              ) : (
                <p className="text-muted-foreground m-0 text-[12.5px]">
                  Hành trình chưa có bước nào để xem.
                </p>
              )}
            </GlassCard>
          </DetailSidePanel>
        </div>
      </ScreenLayout>
    </AppShell>
  )
}

function Header({ ws, now, go }: { ws: Profile; now: number; go: Go }) {
  const days = runDays(ws, now)
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
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display m-0 text-[26px] font-semibold tracking-[-.45px]">
              {ws.customer}
            </h2>
            {ws.closedAt === null ? (
              <Badge tone="running">Đang mở · {STAND_LABEL[ws.stand.kind]}</Badge>
            ) : (
              ws.closeReason !== null && <CloseBadge reason={ws.closeReason} />
            )}
          </div>
          <p className="text-muted-foreground tnum m-0 font-mono text-[12px]">
            {ws.code} · mở {dmy(ws.openedAt)} · {days} ngày
          </p>
        </div>
      </div>

      <dl className="m-0 flex flex-wrap gap-6">
        <Owner label="Owner lead" owner={ws.lead.owner} />
        <Owner label="Owner deal" owner={dealOwnerOf(ws)} />
        <Owner label="Owner account" owner={ws.account.owner} />
      </dl>
    </header>
  )
}

function Owner({ label, owner }: { label: string; owner: WorkstreamHolder | null }) {
  return (
    <div className="flex items-center gap-3">
      {owner ? (
        <Avatar name={owner.name} />
      ) : (
        <span aria-hidden className="bg-surface-ink/9 size-[38px] shrink-0 rounded-md" />
      )}
      <div className="flex min-w-0 flex-col">
        <dt className="text-muted-foreground text-[11px]">{label}</dt>
        <dd className="m-0 max-w-40 truncate text-[12.5px] font-semibold">{owner?.name ?? '—'}</dd>
      </div>
    </div>
  )
}

const LEGEND = [
  { state: 'done', label: 'Xong' },
  { state: 'current', label: 'Đang ở' },
  { state: 'dropped', label: 'Rớt' },
  { state: 'upcoming', label: 'Chưa tới' },
] as const

function Journey({
  ws,
  selected,
  onSelect,
  canCreate,
  onCreated,
  go,
}: {
  ws: Profile
  selected: StepRef | null
  onSelect: (ref: StepRef) => void
  canCreate: boolean
  onCreated: () => void
  go: Go
}) {
  const [lead, ...deals] = lanesOf(ws)
  const openDeals = ws.deals.filter((d) => d.outcome === 'open').length
  const track = { selected, onSelect }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="font-display m-0 text-[16px] font-semibold">Hành trình</h3>
          <span className="text-muted-foreground tnum text-[12.5px]">
            {ws.deals.length} cơ hội · {openDeals} đang mở
          </span>
        </div>
        <ul className="m-0 flex list-none flex-wrap items-center gap-4 p-0 text-[12px]">
          {LEGEND.map((item) => (
            <li key={item.state} className="flex items-center gap-2">
              <StepDot state={item.state} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <ol className="divide-surface-ink/8 m-0 flex list-none flex-col divide-y p-0">
        {lead && (
          <LeadLaneRow
            lead={ws.lead}
            lane={lead}
            {...track}
            action={canCreate && <CreateDealButton leadCode={ws.lead.code} onCreated={onCreated} />}
          />
        )}
        {ws.deals.map((deal, i) => {
          const lane = deals[i]
          return lane && <DealLaneRow key={deal.code} deal={deal} lane={lane} {...track} />
        })}
        {ws.hiddenDeals > 0 && (
          <li className="text-muted-foreground tnum py-4 text-[12.5px]">
            +{ws.hiddenDeals} cơ hội bạn không có quyền xem
          </li>
        )}
        <AccountLaneRow account={ws.account} go={go} />
      </ol>
    </div>
  )
}
