import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  ContextRail,
  GlassCard,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Skeleton,
  StatCard,
} from '@pv/ui'
import {
  WorkstreamChannel,
  type ObjectChainLink,
  type WorkstreamProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { dmhm, dmy } from '@/lib/date'
import { chainPath, railOf } from '@/data/opportunities'
import {
  WORKSTREAM_CHANNEL_LABEL,
  footprintTotal,
  workstreamProfileQuery,
} from '@/data/workstreams'
import { CloseBadge, OverdueNote } from '@/components/workstream-bits'
import { DetailSidePanel } from '@/components/detail-side-panel'

/** One customer journey run — `/sales/workstreams/:code`. Read-only: no door
 *  on the server writes a run yet.
 *
 *  The rail prepends the run itself: a run has no `platform.object` mirror row
 *  or edge, so the server walks the chain from the lead and the open object is
 *  not among the links. They are still filtered by code, so a future mirror
 *  row cannot draw the run twice.
 *
 *  No StageTrack: the row carries a display `phaseLabel`, not a stage key or
 *  index, and a track drawn without one would be guessing the ladder. */

type Profile = WorkstreamProfileResponse
type Go = (path: string) => void

const BOOK = '/sales/workstreams'
const KICKER = 'Sales · Hành trình khách hàng'

export default function WorkstreamDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: ws, isPending, error } = useQuery(workstreamProfileQuery(code))
  const links = ws?.chain.filter((l) => l.code !== ws.code) ?? []

  if (isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-96 w-full" />
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

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker={KICKER}
          title={ws.customer}
          back={{ label: 'Sổ hành trình', onClick: () => navigate(BOOK) }}
          meta={
            <>
              {ws.closedAt === null ? (
                <Badge tone="running">Đang chạy</Badge>
              ) : (
                ws.closeReason !== null && <CloseBadge reason={ws.closeReason} />
              )}
            </>
          }
          context={
            <ContextRail
              objects={[{ code: ws.code, source: true }, ...railOf(links, ws.code, navigate)]}
            />
          }
        />

        <ScreenDetailGrid
          className="w-full"
          sideClassName="relative xl:self-stretch"
          sideLabel="Thông tin hành trình"
          main={
            <div className="flex flex-col gap-6">
              <PositionCard ws={ws} go={navigate} />
              <ChainCard chain={links} go={navigate} />
              <FootprintSection ws={ws} />
            </div>
          }
          side={
            <DetailSidePanel>
              <FactsCard ws={ws} go={navigate} />
            </DetailSidePanel>
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}

function PositionCard({ ws, go }: { ws: Profile; go: Go }) {
  const waiting = ws.waitingOn
  const contract = ws.stand.kind === 'HĐ'
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Vị trí hiện tại">
      <SectionTitle size="sm">Vị trí hiện tại</SectionTitle>
      <ChainRow
        link={{ code: ws.stand.code, kind: ws.stand.kind, label: ws.stand.phaseLabel }}
        go={go}
      />
      <div className="flex flex-wrap items-center gap-3 text-[12px] leading-[1.6]">
        {ws.closedAt === null && (
          <OverdueNote
            overdueBy={ws.overdueBy}
            noDeadline={contract ? 'Hợp đồng không có hạn theo bậc' : 'Chưa đặt hạn cho bậc này'}
          />
        )}
        {/* The server also sends null when it cannot place a contract stand, so
            for a contract a null is not proof that nobody is being waited on. */}
        {waiting === null ? (
          !contract && <span className="text-muted-foreground">Không chờ ai</span>
        ) : (
          <span>
            Đang chờ <strong className="font-semibold">{waiting.person}</strong> · {waiting.role}
            {waiting.due !== null && (
              <>
                {' '}
                · hạn <span className="tnum font-num">{dmy(waiting.due)}</span>
              </>
            )}
          </span>
        )}
      </div>
    </GlassCard>
  )
}

/** A whole row is the target so a tablet thumb gets 48px, not the chip's 20. */
function ChainRow({ link, go }: { link: ObjectChainLink; go: Go }) {
  const path = chainPath(link.kind, link.code)
  const body = (
    <>
      <Chip className="shrink-0">{link.code}</Chip>
      <span className="line-clamp-2 min-w-0">{link.label}</span>
    </>
  )
  if (!path) return <div className="flex min-h-12 items-center gap-3 px-3">{body}</div>
  return (
    <button
      type="button"
      onClick={() => go(path)}
      className="motion-std hover:bg-surface-ink/8 flex min-h-12 w-full items-center gap-3 rounded-sm px-3 text-left"
    >
      {body}
    </button>
  )
}

function ChainCard({ chain, go }: { chain: Profile['chain']; go: Go }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Chuỗi hành trình">
      <SectionTitle size="sm" hint="Lead, các cơ hội và hợp đồng của lượt đi này.">
        Chuỗi hành trình
      </SectionTitle>
      {chain.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa dựng được chuỗi cho hành trình này.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-[12px]">
          {chain.map((link) => (
            <li key={link.code}>
              <ChainRow link={link} go={go} />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function FootprintSection({ ws }: { ws: Profile }) {
  const last = ws.footprint.lastContactedAt
  return (
    <section className="flex flex-col gap-4" aria-label="Dấu vết liên lạc">
      <SectionTitle
        size="sm"
        hint={
          last === null ? (
            'Chưa liên lạc'
          ) : (
            <>
              Liên lạc gần nhất <span className="tnum font-num">{dmhm(last)}</span>
            </>
          )
        }
      >
        Dấu vết liên lạc
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WorkstreamChannel.options.map((channel) => (
          <StatCard
            key={channel}
            size="compact"
            label={WORKSTREAM_CHANNEL_LABEL[channel]}
            value={String(ws.footprint.byChannel[channel])}
          />
        ))}
        <StatCard size="compact" label="Tổng" value={String(footprintTotal(ws.footprint))} />
      </div>
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right">{children}</dd>
    </div>
  )
}

function FactsCard({ ws, go }: { ws: Profile; go: Go }) {
  const accountPath = ws.accountCode === null ? undefined : chainPath('AC', ws.accountCode)
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Thông tin">
      <SectionTitle size="sm">Thông tin</SectionTitle>
      <dl className="flex flex-col text-[12px]">
        <Fact label="Sale">{ws.saleHolder?.name ?? 'Chưa gán'}</Fact>
        <Fact label="BD">{ws.bdHolder?.name ?? 'Chưa gán'}</Fact>
        <Fact label="Mở ngày">
          <span className="tnum font-num">{dmy(ws.openedAt)}</span>
        </Fact>
        <Fact label="Đóng ngày">
          {ws.closedAt === null ? (
            'Đang chạy'
          ) : (
            <span className="tnum font-num">{dmy(ws.closedAt)}</span>
          )}
        </Fact>
        <Fact label="Lý do đóng">
          {ws.closeReason === null ? '—' : <CloseBadge reason={ws.closeReason} />}
        </Fact>
        <Fact label="Khách hàng">
          {accountPath === undefined ? (
            <span className="truncate">{ws.customer}</span>
          ) : (
            <Button variant="ghost" size="lg" className="font-mono" onClick={() => go(accountPath)}>
              {ws.accountCode}
            </Button>
          )}
        </Fact>
      </dl>
    </GlassCard>
  )
}
