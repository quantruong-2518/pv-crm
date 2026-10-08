import type { ReactNode } from 'react'
import {
  ArrowRight,
  Avatar,
  Badge,
  Button,
  CalendarDays,
  ChevronDown,
  Chip,
  Icon,
  StatusDot,
  cn,
} from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  JOURNEY_BORN_BY_LABEL,
  LEAD_STATE_LABEL,
  LOSS_REASON_DO_NOT_CONTACT_LABEL,
  type JourneyContract,
  type JourneyDeal,
  type JourneyDoor,
  type JourneyGrowthDoor,
  type JourneyWaitingDoor,
  type WorkstreamHolder,
} from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { ACCEPTOR_LABEL, acceptorText } from '@/data/deal-sale'
import { BADGE_INK } from '@/data/opportunities'
import { DueBadge } from '@/components/contract-bits'
import { ContractInside } from '@/components/contract-inside'
import { hasInside } from '@/components/contract-run'
import {
  CARD,
  CHAIN_KIND,
  contractLate,
  contractStatus,
  dealLate,
  dealStatus,
  doorId,
  gridCols,
  leadStatus,
  moneyShort,
  POOL,
  railOf,
  rungLabel,
  rungStatus,
  STATE_WORD,
  STOPPED_AT,
  stoppedRungLabel,
  type Box,
  type Journey,
  type PathOf,
  type PickKind,
  type RailRung,
  type Status,
} from './workstream-tree-model'

/** The cards of the journey tree — lead, deal (full or compact), contract,
 *  and the continuation doors of lane 4 (growth, waiting) —
 *  and the four info styles they share: code, money, state, date, holder.
 *
 *  Each card is absolutely placed by `workstream-tree-model.ts` but sized by
 *  its own content, so titles wrap instead of ending in "…". `data-node`
 *  is how the tree finds the cards to measure. A code, a rung and a door
 *  title open the object's profile; there is no selection (ADR 0078 §2). */

type Go = (path: string) => void
export type Track = { go: Go; pathOf: PathOf }

/** A code the reader has no door to still reads as a code. */
export function CodePill({ kind, code, go, pathOf }: Track & { kind: string; code: string }) {
  const path = pathOf(kind, code)
  return (
    <Chip className="shrink-0" onOpen={path ? () => go(path) : undefined}>
      {code}
    </Chip>
  )
}

/** Neutral on purpose: `--brand-gold` is not yet cleared to mean money, and
 *  every tinted ground already means a state here. */
export function MoneyPill({ children }: { children: ReactNode }) {
  return (
    <span className="bg-surface-ink/9 text-foreground tnum font-num inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-2 py-1 text-[11px] font-semibold">
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <Badge
      tone={status.tone}
      className={cn('min-w-0 whitespace-normal text-left', status.tone === 'draft' && BADGE_INK)}
    >
      {status.label}
    </Badge>
  )
}

export function DateText({ iso, title }: { iso: string; title: string }) {
  return (
    <span
      className="text-muted-foreground tnum inline-flex shrink-0 items-center gap-1 text-[11px]"
      title={`${title} ${dmy(iso)}`}
    >
      <Icon icon={CalendarDays} size={14} />
      {dm(iso)}
    </span>
  )
}

function Holder({ person }: { person: WorkstreamHolder | null }) {
  if (!person) return <span className="text-muted-foreground text-[12px]">{POOL}</span>
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px]">
      <Avatar name={person.name} size="sm" />
      <span className="min-w-0 break-words">{person.name}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// THE RAIL
// ---------------------------------------------------------------------------

/** `current` is warm, not StatusDot's own brand blue: blue is the selection
 *  ring on this screen. `stopped` is a solid grey dot, the same grey the book
 *  gives a lost deal (`STATE_TONE`).
 *  Unreached rungs are RINGS in `--muted-foreground` (a faint fill missed the
 *  3:1 non-text floor); a skipped one is dashed. */
const HALO = {
  late: 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--destructive-foreground)_22%,transparent)]',
  current: 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--warning)_22%,transparent)]',
}

export function RungDot({ rung }: { rung: Pick<RailRung, 'state' | 'late'> }) {
  if (rung.state === 'done') return <StatusDot state="ok" className="size-2.5" />
  if (rung.state === 'current') {
    return rung.late !== null ? (
      <StatusDot state="bad" className={cn('size-2.5', HALO.late)} />
    ) : (
      <StatusDot state="warning" className={cn('size-2.5', HALO.current)} />
    )
  }
  if (rung.state === 'stopped') {
    return <StatusDot state="next" className="bg-muted-foreground size-2.5" />
  }
  return (
    <svg aria-hidden width={10} height={10} className="shrink-0">
      <circle
        cx={5}
        cy={5}
        r={4.25}
        fill="var(--card)"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeDasharray={rung.state === 'skipped' ? '1.5 2.5' : undefined}
      />
    </svg>
  )
}

function Half({ side, lit }: { side: 'in' | 'out'; lit: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[7px] h-0.5',
        side === 'in' ? 'left-0 w-1/2' : 'left-1/2 right-0',
        lit ? 'bg-success' : 'bg-surface-ink/32',
      )}
    />
  )
}

function Rail({
  kind,
  code,
  rungs,
  notes,
  go,
  pathOf,
}: Track & {
  kind: PickKind
  code: string
  rungs: RailRung[]
  /** A line a rung's tooltip carries after its label, keyed by rung. */
  notes?: Partial<Record<string, string>>
}) {
  const path = pathOf(CHAIN_KIND[kind], code)
  return (
    <ol className={cn('m-0 grid list-none p-0', gridCols(rungs.length))}>
      {rungs.map((r, i) => {
        const word = rungStatus(r.state, r.late).label
        const note = notes?.[r.key]
        return (
          <li key={r.key} className="min-w-0">
            <button
              type="button"
              disabled={!path}
              aria-current={r.state === 'current' ? 'step' : undefined}
              aria-label={`${[r.label, word, note].filter(Boolean).join(' · ')} — mở ${code}`}
              title={note ? `${r.label} · ${note}` : r.label}
              onClick={() => path && go(path)}
              className={cn(
                'motion-std flex min-h-12 w-full flex-col items-center rounded-md pt-1',
                path && 'hover:bg-surface-ink/9',
              )}
            >
              <span className="relative block h-4 w-full">
                {i > 0 && <Half side="in" lit={r.litIn} />}
                {i < rungs.length - 1 && <Half side="out" lit={r.litOut} />}
                <span className="absolute left-1/2 top-2 flex -translate-x-1/2 -translate-y-1/2">
                  <RungDot rung={r} />
                </span>
              </span>
              <span
                className={cn(
                  'tnum pt-1 text-[11px]',
                  r.late !== null
                    ? 'text-destructive-foreground'
                    : r.state === 'current'
                      ? 'text-warning'
                      : 'text-muted-foreground',
                )}
              >
                {r.state === 'skipped' ? STATE_WORD.skipped : r.at !== null ? dm(r.at) : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// CARDS
// ---------------------------------------------------------------------------

function Card({
  id,
  x,
  w,
  box,
  className,
  children,
}: {
  id: string
  x: number
  w: number
  box: Box
  className?: string
  children: ReactNode
}) {
  return (
    <div
      data-node={id}
      className={cn('bg-card shadow-control-soft absolute flex flex-col rounded-lg', className)}
      style={{ left: x, top: box.top, width: w }}
    >
      {children}
    </div>
  )
}

export function LeadCard({ lead, box, ...track }: Track & { lead: Journey['lead']; box: Box }) {
  const status = leadStatus(lead)
  return (
    <Card id={lead.code} {...CARD.lead} box={box} className="gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CodePill kind="LD" code={lead.code} {...track} />
        {status && <StatusPill status={status} />}
      </div>
      <Rail kind="lead" code={lead.code} rungs={railOf('lead', lead.rungs, null)} {...track} />
      <Holder person={lead.holder} />
    </Card>
  )
}

function Expander({ code, open, onToggle }: { code: string; open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="lg"
      className="hover:bg-surface-ink/9 w-12 shrink-0 bg-transparent px-0 shadow-none"
      aria-expanded={open}
      aria-label={`${open ? 'Thu gọn' : 'Mở rộng'} ${code}`}
      onClick={onToggle}
    >
      <Icon icon={ChevronDown} size={16} className={cn('motion-std', open && 'rotate-180')} />
    </Button>
  )
}

function NextAction({ action }: { action: NonNullable<JourneyDeal['nextAction']> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <Icon icon={ArrowRight} size={16} className="text-muted-foreground" />
      <span className="min-w-0 grow break-words">{action.text}</span>
      <DateText iso={action.due} title="Hạn" />
      <DueBadge level={action.dueLevel} className="shrink-0" />
    </div>
  )
}

/** The fail log's headline; the deal's profile carries its note and who concluded. */
function StopLine({ deal }: { deal: JourneyDeal }) {
  if (!deal.stop) return null
  const at = stoppedRungLabel(deal)
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-[12px]">
      <span className="min-w-0 break-words">
        {[at && `${STOPPED_AT} ${at}`, deal.stop.reason].filter(Boolean).join(' · ')}
      </span>
      {deal.stop.doNotContact && <Badge tone="warning">{LOSS_REASON_DO_NOT_CONTACT_LABEL}</Badge>}
    </span>
  )
}

function acceptorNote(deal: JourneyDeal): string | undefined {
  const who = acceptorText(deal)
  return who ? `${ACCEPTOR_LABEL}: ${who}` : undefined
}

/** The engaged rung's tooltip: how many care activities it holds (ADR 0072). */
function activityNote(deal: JourneyDeal): string | undefined {
  const rung = deal.rungs.find((r) => r.key === 'engaged')
  const n = rung?.subSteps.filter((s) => s.kind === 'activity').length ?? 0
  return n === 0 ? undefined : `${n} hoạt động chăm sóc`
}

export function DealCard({
  deal,
  box,
  full,
  onToggle,
  ...track
}: Track & { deal: JourneyDeal; box: Box; full: boolean; onToggle: () => void }) {
  const status = dealStatus(deal)
  const finished = deal.outcome !== 'open'
  if (!full) {
    return (
      <Card
        id={deal.code}
        {...CARD.deal}
        box={box}
        className="flex-row items-center gap-3 py-3 pl-3 pr-1"
      >
        <div className="flex min-w-0 grow flex-col gap-1">
          <span className="break-words text-[14px] font-medium">{deal.name}</span>
          <span className="flex flex-wrap items-center gap-2">
            <CodePill kind="OP" code={deal.code} {...track} />
            <StatusPill status={status} />
          </span>
          <StopLine deal={deal} />
        </div>
        <Expander code={deal.code} open={false} onToggle={onToggle} />
      </Card>
    )
  }
  return (
    <Card id={deal.code} {...CARD.deal} box={box} className="gap-2 p-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 grow flex-wrap items-center gap-2">
          <CodePill kind="OP" code={deal.code} {...track} />
          {deal.amount !== null && <MoneyPill>{moneyShort(deal.amount)}</MoneyPill>}
          {deal.expectedClose !== null && (
            <DateText iso={deal.expectedClose} title="Dự kiến chốt" />
          )}
        </div>
        {/* Its own column, never wrapped under the code: the 48px target would
            land on the code pill's hit area. */}
        <div className="flex shrink-0 items-center gap-2">
          {deal.holder && <Avatar name={deal.holder.name} size="sm" />}
          {finished && (
            <span className="-my-3 -mr-2 flex">
              <Expander code={deal.code} open onToggle={onToggle} />
            </span>
          )}
        </div>
      </div>
      <span className="break-words text-[14px] font-semibold">{deal.name}</span>
      <Rail
        kind="deal"
        code={deal.code}
        rungs={railOf('deal', deal.rungs, dealLate(deal))}
        notes={{ assigned: acceptorNote(deal), engaged: activityNote(deal) }}
        {...track}
      />
      <div className="flex">
        <StatusPill status={status} />
      </div>
      <StopLine deal={deal} />
      {deal.outcome === 'open' && deal.nextAction && <NextAction action={deal.nextAction} />}
    </Card>
  )
}

/** What sits inside the rungs opens under the card, read here under
 *  `workstream.view` alone — the profile behind the code needs `contract.view`. */
export function ContractCard({
  contract,
  box,
  open,
  onToggle,
  ...track
}: Track & { contract: JourneyContract; box: Box; open: boolean; onToggle: () => void }) {
  const late = contractLate(contract)
  return (
    <Card id={contract.code} {...CARD.contract} box={box} className="gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold">
          {contract.kind && CONTRACT_KIND_LABEL[contract.kind]}
        </span>
        {contract.amount !== null && <MoneyPill>{moneyShort(contract.amount)}</MoneyPill>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 grow flex-wrap items-center gap-2">
          <CodePill kind="HĐ" code={contract.code} {...track} />
          <StatusPill status={contractStatus(contract)} />
        </div>
        {hasInside(contract) && (
          <span className="-my-3 -mr-2 flex shrink-0">
            <Expander code={contract.code} open={open} onToggle={onToggle} />
          </span>
        )}
      </div>
      <Rail
        kind="contract"
        code={contract.code}
        rungs={railOf('contract', contract.rungs, late)}
        {...track}
      />
      {open && <ContractInside contract={contract} />}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CONTINUATION DOORS (lane 4)
// ---------------------------------------------------------------------------

type DoorProps = Track & { box: Box }

/* Recovered from the retired journey drawer. ADR 0068: a parked lead loops back
   on itself; flow C4: a do-not-contact lead is never mailed. */
const DOOR_TEXT = {
  arose: 'Phát sinh từ',
  whyNewTitle: 'Vì sao là hành trình mới',
  whyNew:
    'Nhu cầu nảy ra khi khách đang triển khai hoặc đang dùng thì mở hành trình mới, kể cả thay đổi nhỏ.',
  wakeAny:
    'Đưa lead vào chiến dịch hoặc bấm tay "Chăm lại" là chính lead này quay lại chăm sóc, vẫn trong hành trình này và vẫn do người giữ cũ phụ trách.',
  wakeManual:
    'Chỉ bấm tay "Chăm lại": chính lead này quay lại chăm sóc trong hành trình này. Lead này không bao giờ được đưa vào chiến dịch hay nhận mail.',
  wakeUnknown: 'Chưa ghi nhận khách có đồng ý được liên hệ lại hay không.',
} as const

/** The anchor's code, then its rung's label when the ladder knows it. */
function fromText(from: JourneyDoor['from'], kind: PickKind) {
  const label = rungLabel(kind, from.rung)
  return label ? `${from.code} · ${label}` : from.code
}

/** The title is the door's open button — the new journey for growth, the
 *  parked lead for waiting. The codes inside are links, and a link may not
 *  sit inside a button. */
function DoorShell({
  door,
  title,
  box,
  go,
  pathOf,
  children,
}: DoorProps & { door: JourneyDoor; title: string; children: ReactNode }) {
  const code = door.kind === 'growth' ? door.journeyCode : door.leadCode
  const path = pathOf(door.kind === 'growth' ? 'WS' : 'LD', code)
  return (
    <Card id={doorId(door)} {...CARD.door} box={box} className="gap-3 p-3">
      <button
        type="button"
        disabled={!path}
        aria-label={`${title} — mở ${code}`}
        onClick={() => path && go(path)}
        className={cn(
          'motion-std -mx-2 -mt-1 flex min-h-12 items-center rounded-md px-2 text-left text-[14px] font-semibold',
          path && 'hover:bg-surface-ink/9',
        )}
      >
        {title}
      </button>
      {children}
    </Card>
  )
}

function Person({ who, role }: { who: WorkstreamHolder | null; role: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px]">
      {who && <Avatar name={who.name} size="sm" />}
      <span className="min-w-0 break-words">
        {who?.name ?? 'Hệ thống'}
        <span className="text-muted-foreground"> · {role}</span>
      </span>
    </span>
  )
}

function GrowthDoor({
  door,
  from,
  ...props
}: DoorProps & { door: JourneyGrowthDoor; from: PickKind }) {
  return (
    <DoorShell door={door} title={JOURNEY_BORN_BY_LABEL.growth} {...props}>
      <div className="pointer-coarse:gap-x-2 pointer-coarse:gap-y-6 flex flex-wrap items-center gap-2">
        <CodePill kind="WS" code={door.journeyCode} {...props} />
        <CodePill kind="LD" code={door.leadCode} {...props} />
      </div>
      <DateText iso={door.at} title="Mở" />
      <p className="m-0 break-words text-[12px]">{door.need}</p>
      <span className="text-muted-foreground break-words text-[12px]">
        {DOOR_TEXT.arose} {fromText(door.from, from)}
      </span>
      <Person who={door.decidedBy} role="quyết định và giữ lead" />
      <p className="text-muted-foreground m-0 break-words text-[12px]">
        <span className="font-semibold">{DOOR_TEXT.whyNewTitle}</span> · {DOOR_TEXT.whyNew}
      </p>
    </DoorShell>
  )
}

function WaitingDoor({
  door,
  from,
  ...props
}: DoorProps & { door: JourneyWaitingDoor; from: PickKind }) {
  const fromLabel = rungLabel(from, door.from.rung)
  return (
    <DoorShell door={door} title={LEAD_STATE_LABEL.nurturing} {...props}>
      <div className="flex flex-wrap items-center gap-2">
        <CodePill kind="LD" code={door.leadCode} {...props} />
        {door.doNotContact && <Badge tone="warning">{LOSS_REASON_DO_NOT_CONTACT_LABEL}</Badge>}
      </div>
      <span className="flex flex-wrap items-center gap-2 text-[12px]">
        {fromLabel !== undefined && <span>Từ {fromLabel}</span>}
        <DateText iso={door.at} title="Chuyển" />
      </span>
      <p className="m-0 break-words text-[12px]">{door.reason}</p>
      <Person who={door.concludedBy} role="kết luận" />
      {door.campaignName !== null && (
        <span className="text-muted-foreground break-words text-[12px]">
          Chiến dịch {door.campaignName}
        </span>
      )}
      {door.lastTouch !== null && (
        <span className="text-muted-foreground break-words text-[12px]">
          <span className="tnum">{dm(door.lastTouch.at)}</span> · {door.lastTouch.text}
        </span>
      )}
      {/* null = not recorded: promise nothing, unlike false. */}
      <p className="text-muted-foreground m-0 break-words text-[12px]">
        {door.doNotContact === null
          ? DOOR_TEXT.wakeUnknown
          : door.doNotContact
            ? DOOR_TEXT.wakeManual
            : DOOR_TEXT.wakeAny}
      </p>
    </DoorShell>
  )
}

export function DoorCard({
  door,
  from,
  ...props
}: DoorProps & { door: JourneyDoor; from: PickKind }) {
  return door.kind === 'growth' ? (
    <GrowthDoor door={door} from={from} {...props} />
  ) : (
    <WaitingDoor door={door} from={from} {...props} />
  )
}
