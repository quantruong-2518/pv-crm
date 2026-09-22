import type { ReactNode } from 'react'
import { ArrowRight, Badge, Button, Icon, Lock, RotateCcw, cn } from '@pv/ui'
import {
  LEAD_STATE_LABEL,
  SOURCE_KIND_LABEL,
  SOURCE_KIND_UNKNOWN,
  WorkstreamStepState,
  type WorkstreamAccountLane,
  type WorkstreamHolder,
  type WorkstreamLeadLane,
  type WorkstreamProfileResponse,
  type WorkstreamStep,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { tierLabel } from '@/data/lead-state'
import {
  contractsOf,
  dealLanesOf,
  leadLaneOf,
  type JourneyContract,
  type StepRef,
  type WorkstreamDealLaneView,
  type WorkstreamLane,
} from '@/data/workstreams'
import { CreateDealButton, Holder, StepDot } from './workstream-detail-parts'
import {
  BADGE_INK,
  QUIET_ACTION,
  STEP_STATE_LABEL,
  dealStamp,
  laneSummary,
  leadStamp,
  tierRungOf,
  unreachedWord,
  type NodeStamp,
  type NodeTone,
} from './workstream-lane-model'
import {
  COL,
  TREE_WIDTH,
  edgePath,
  treeLayout,
  type Box,
  type Edge,
} from './workstream-tree-layout'

/** The journey as a left-to-right family tree: the lead on the left, the deals
 *  it produced beside it, each deal's contract hanging off THAT deal, and the
 *  company at the end.
 *
 *  WHY A TREE AND NOT A LADDER GRID. A run's real question is which deal
 *  produced which contract, and a stack of equal rows cannot answer it — the
 *  rows only sit near each other. An edge can. So parentage is drawn, and the
 *  object codes that used to stand in for it are gone from the whole screen.
 *
 *  Every node carries its own ladder: dots on a rail, dates UNDER the rail,
 *  never across it. A rung is a button; pressing one opens that rung in the
 *  side panel, which is where per-phase detail lives. */

type Go = (path: string) => void
type Track = { selected: StepRef | null; onSelect: (ref: StepRef) => void }

const LEGEND = WorkstreamStepState.options

const EDGE_STROKE: Record<Edge['tone'], string> = {
  won: 'var(--success)',
  lost: 'color-mix(in srgb, var(--destructive-foreground) 45%, transparent)',
  open: 'color-mix(in srgb, var(--muted-foreground) 32%, transparent)',
  ghost: 'color-mix(in srgb, var(--muted-foreground) 20%, transparent)',
}

const STAMP_FACE: Record<NodeTone, string> = {
  success: 'bg-success/13',
  danger: 'bg-destructive/16',
  warning: 'bg-warning/14',
  quiet: 'bg-surface-ink/10',
}

/** The state name TRUNCATES and the date does not: a node is a fixed-width box
 *  and the longest state label no longer fits beside "· dd/mm". The full text
 *  rides on `title`. */
function Stamp({ stamp }: { stamp: NodeStamp }) {
  return (
    <Badge
      className={cn(BADGE_INK, 'min-w-0', STAMP_FACE[stamp.tone])}
      title={stamp.at === null ? stamp.label : `${stamp.label} · ${stamp.at}`}
    >
      <span className="truncate">{stamp.label}</span>
      {stamp.at !== null && <span className="tnum shrink-0 font-mono"> · {stamp.at}</span>}
    </Badge>
  )
}

const GHOST_EDGE =
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--muted-foreground)_18%,transparent)]'

/** A node is one object of the run. `tinted` marks the lane the side panel is
 *  reading, so a press anywhere on the tree is answered somewhere visible. */
function Node({
  box,
  col,
  tinted,
  children,
}: {
  box: Box
  col: { x: number; w: number }
  tinted?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'motion-std absolute flex flex-col gap-3 rounded-lg p-4',
        tinted ? 'bg-primary/16 shadow-[inset_0_0_0_1px_var(--accent-foreground)]' : 'bg-muted',
      )}
      style={{ left: col.x, top: box.top, width: col.w, height: box.height }}
    >
      {children}
    </div>
  )
}

/** A column with nothing in it yet — drawn so the four stages of the journey
 *  are always four columns, and the road ahead reads as road. */
function Ghost({
  box,
  col,
  children,
}: {
  box: Box
  col: { x: number; w: number }
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'text-muted-foreground absolute flex items-center justify-center rounded-lg px-4 text-center text-[12px]',
        GHOST_EDGE,
      )}
      style={{ left: col.x, top: box.top, width: col.w, height: box.height }}
    >
      {children}
    </div>
  )
}

/** The first band of every card: what the object is on the left, how it ended
 *  on the right. `truncate` because a node whose title is a company name has
 *  no room to wrap — the card's height is arithmetic in
 *  `workstream-tree-layout.ts`, and a second line would push the foot through
 *  the floor. */
function NodeHead({ kind, title, tag }: { kind: string; title?: string; tag?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <span className="font-display truncate text-[13px] font-semibold" title={title}>
        {kind}
      </span>
      {tag}
    </div>
  )
}

/** The last band of every card: who holds the object on the left, the one
 *  thing that kind of card adds on the right. `mt-auto` pins it to the floor,
 *  so a card with a shorter body opens a gap rather than floating its foot. */
function NodeFoot({ owner, children }: { owner: WorkstreamHolder | null; children?: ReactNode }) {
  return (
    <div className="mt-auto flex min-h-6 items-center justify-between gap-2">
      <Holder owner={owner} />
      {children}
    </div>
  )
}

function RailHalf({
  side,
  lit,
  into,
}: {
  side: 'left' | 'right'
  lit: boolean
  /** The rung the half leads INTO, so a deal's death colours its own approach. */
  into?: WorkstreamStep
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[7px] h-0.5',
        side === 'left' ? 'left-0 w-1/2' : 'left-1/2 right-0',
        !lit
          ? 'bg-surface-ink/14'
          : into?.state === 'dropped'
            ? 'bg-destructive-foreground'
            : into?.state === 'parked'
              ? 'bg-surface-ink/24'
              : 'bg-success',
      )}
    />
  )
}

/** Only a rung that was entered has anything to say; an unreached one prints
 *  nothing rather than a placeholder repeated five times a node. */
function RungCaption({ step, rider }: { step: WorkstreamStep; rider: ReactNode }) {
  if (step.at === null && !rider) return <span className="block h-4" />
  return (
    <span className="flex min-w-0 flex-col items-center pt-1">
      {step.at !== null && (
        <span
          className={cn(
            'tnum font-mono text-[10.5px]',
            step.state === 'current'
              ? 'text-warning'
              : step.state === 'dropped'
                ? 'text-destructive-foreground'
                : 'text-muted-foreground',
          )}
        >
          {dm(step.at)}
        </span>
      )}
      {rider}
    </span>
  )
}

/** The ladder inside a node: the rail carries the dots, every word sits under
 *  it. The old grid ran the connector at the height of the date text, which
 *  struck it through. Each cell paints its own half of the rail — left half by
 *  this rung, right half by the next — so the line joins seamlessly. */
function Rail({
  lane,
  selected,
  onSelect,
  rider,
}: Track & {
  lane: WorkstreamLane
  /** Rides in one named cell: the lead's tier, a grade rather than a rung. */
  rider?: { at: string; node: ReactNode }
}) {
  const steps = lane.steps
  return (
    <ol
      className="m-0 grid list-none p-0"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, i) => {
        const prev = steps[i - 1]
        const next = steps[i + 1]
        const isSelected = selected?.lane === lane.code && selected.step === step.key
        const reached = step.state !== 'upcoming'
        return (
          <li key={step.key} className="min-w-0">
            <button
              type="button"
              aria-pressed={isSelected}
              aria-current={step.state === 'current' ? 'step' : undefined}
              aria-label={`${step.label} · ${reached ? STEP_STATE_LABEL[step.state] : unreachedWord(lane.open)}`}
              title={step.label}
              onClick={() => onSelect({ lane: lane.code, step: step.key })}
              className={cn(
                'motion-std flex min-h-12 w-full flex-col items-center rounded-md pt-1',
                isSelected ? 'bg-surface-ink/14' : 'hover:bg-surface-ink/8',
              )}
            >
              <span className="relative block h-4 w-full">
                {prev && <RailHalf side="left" lit={reached} into={step} />}
                {next && <RailHalf side="right" lit={next.state !== 'upcoming'} into={next} />}
                <span className="absolute left-1/2 top-2 -translate-x-1/2 -translate-y-1/2">
                  <StepDot state={step.state} halo={step.state === 'current' && lane.open} />
                </span>
              </span>
              <RungCaption step={step} rider={rider?.at === step.key ? rider.node : null} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The line under a ladder: the rung the lane stands on, and what it has
 *  cost.
 *
 *  `parked` is the one case where a STOPPED rung is not a failure: the deal is
 *  waiting on the care list, so the rung is named plainly and stays muted. The
 *  red "dropped at" wording there is the reading ADR 0064 removed. */
function Summary({ lane, parked = false }: { lane: WorkstreamLane; parked?: boolean }) {
  const summary = laneSummary(lane)
  if (!summary) return null
  const { step, days } = summary
  const dropped = summary.dropped && !parked
  const live = step.state === 'current' && lane.open
  const word = dropped ? `Rớt ở ${step.label}` : parked ? `Dừng ở ${step.label}` : step.label
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-2 text-[11.5px]',
        dropped ? 'text-destructive-foreground' : live ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      <span className="min-w-0 truncate">
        {/* A closed lane that did not drop is already named by the node stamp,
            so this line drops the repeat and keeps the one thing the stamp
            cannot say: how long that last rung took. */}
        {!lane.open && !dropped && !parked
          ? `${days} ngày`
          : `${word}${days === null ? '' : ` · ${days} ngày`}`}
      </span>
    </span>
  )
}

function LeadNode({
  lead,
  lane,
  box,
  ...track
}: Track & { lead: WorkstreamLeadLane; lane: WorkstreamLane; box: Box }) {
  const tier = lead.tier === null ? null : tierLabel(lead.tier)
  const rung = tierRungOf(lane)
  return (
    <Node box={box} col={COL.lead} tinted={track.selected?.lane === lane.code}>
      <NodeHead kind="Lead" tag={<Stamp stamp={leadStamp(lead)} />} />
      <Rail
        lane={lane}
        {...track}
        rider={
          tier === null || rung === null
            ? undefined
            : {
                at: rung,
                node: (
                  <Badge className={cn(BADGE_INK, 'mt-1 max-w-full')}>
                    <span className="truncate">{tier}</span>
                  </Badge>
                ),
              }
        }
      />
      <Summary lane={lane} />
      {lead.nurture && (
        <span className="text-muted-foreground tnum flex items-center gap-2 font-mono text-[11px]">
          <Icon icon={RotateCcw} size={16} className="shrink-0" />
          {/* ONE line, always: the node's height is arithmetic in
              `workstream-tree-layout.ts`, so a wrap here pushes the foot out. */}
          <span className="truncate">
            {LEAD_STATE_LABEL.nurturing} · {lead.nurture.count} lần · {lead.nurture.totalDays} ngày
          </span>
        </span>
      )}
      <NodeFoot owner={lead.owner}>
        <Badge className={cn(BADGE_INK, 'shrink-0')}>
          {lead.sourceKind ? SOURCE_KIND_LABEL[lead.sourceKind] : SOURCE_KIND_UNKNOWN}
        </Badge>
      </NodeFoot>
    </Node>
  )
}

function DealNode({ lane, box, ...track }: Track & { lane: WorkstreamDealLaneView; box: Box }) {
  return (
    <Node box={box} col={COL.deal} tinted={track.selected?.lane === lane.code}>
      <NodeHead kind="Cơ hội" tag={<Stamp stamp={dealStamp(lane)} />} />
      <Rail lane={lane} {...track} />
      <Summary lane={lane} parked={lane.outcome === 'care'} />
      <NodeFoot owner={lane.owner} />
    </Node>
  )
}

/** The contract screen is parked (`CHAIN_ROUTE` in `data/opportunities.ts`), so
 *  this node opens nothing and says so rather than offering a dead button. */
function ContractNode({ contract, box }: { contract: JourneyContract; box: Box }) {
  return (
    <Node box={box} col={COL.contract}>
      <NodeHead
        kind="Hợp đồng"
        tag={<Badge className={cn(BADGE_INK, 'bg-success/13 shrink-0')}>Đã ký</Badge>}
      />
      {contract.dealWonAt !== null && (
        <span className="text-muted-foreground tnum font-mono text-[11px]">
          cơ hội thắng {dm(contract.dealWonAt)}
        </span>
      )}
      <span className="text-muted-foreground mt-auto text-[11px]">màn hợp đồng chưa dựng</span>
    </Node>
  )
}

function AccountNode({ account, box, go }: { account: WorkstreamAccountLane; box: Box; go: Go }) {
  const path = account.code === null ? undefined : chainPath('AC', account.code)
  const name = account.name ?? 'Công ty'
  return (
    <Node box={box} col={COL.account}>
      {/* The name takes the whole head row: sharing it with the badge left about
          ninety pixels, which truncated most company names. */}
      <NodeHead kind={name} title={name} />
      {/* Stacked, not side by side: the account column is the narrowest one,
          and the old `-ml-3` fought the button's own padding to make room,
          pushing it past the node's edge instead of sitting inside it. */}
      <div className="mt-auto flex flex-col gap-2">
        <NodeFoot owner={account.owner}>
          <Badge className={cn(BADGE_INK, 'shrink-0', account.purchased && 'bg-success/13')}>
            {account.purchased ? 'Đã mua' : 'Chưa mua'}
          </Badge>
        </NodeFoot>
        {path && (
          /* A stretched flex item resolves its width against negative margins,
             so `-mx-2 px-2` bleeds the hover ground into the card's padding
             while the label stays aligned with the holder above it. */
          <Button
            variant="ghost"
            size="lg"
            className={cn(QUIET_ACTION, '-mx-2 px-2')}
            onClick={() => go(path)}
          >
            Mở công ty
            <Icon icon={ArrowRight} size={16} className="ml-auto" />
          </Button>
        )}
      </div>
    </Node>
  )
}

function ColumnCaption({ col, children }: { col: { x: number }; children: ReactNode }) {
  return (
    <span
      className="text-muted-foreground absolute text-[11px] font-semibold"
      style={{ left: col.x }}
    >
      {children}
    </span>
  )
}

/** The dot legend, rendered by the CARD not by the tree. It used to sit at the
 *  right of the caption row inside the horizontal scroller, where the last two
 *  column captions are laid out at x=692 and x=928 and ran straight through it. */
export function JourneyLegend() {
  return (
    <ul className="m-0 flex shrink-0 list-none flex-wrap items-center gap-4 p-0 text-[12px]">
      {LEGEND.map((state) => (
        <li key={state} className="text-muted-foreground flex items-center gap-2">
          <StepDot state={state} />
          {STEP_STATE_LABEL[state]}
        </li>
      ))}
    </ul>
  )
}

export function Journey({
  ws,
  selected,
  onSelect,
  go,
  canEdit,
  onDealCreated,
}: {
  ws: WorkstreamProfileResponse
  selected: StepRef | null
  onSelect: (ref: StepRef) => void
  go: Go
  canEdit: boolean
  /** Refreshes the profile query — a deal created from the lead lane changes
   *  the lanes this tree draws. */
  onDealCreated: () => void
}) {
  const lead = leadLaneOf(ws)
  const deals = dealLanesOf(ws)
  const contracts = contractsOf(ws)
  const showCreateDeal = canEdit && ws.lead.outcome !== 'exited'
  const layout = treeLayout({
    deals,
    hiddenDeals: ws.hiddenDeals,
    contracts,
    hasNurture: ws.lead.nurture !== null,
    hasTier: ws.lead.tier !== null,
    hasLeadNote: laneSummary(lead) !== null,
    hasAccount: ws.account.code !== null,
    showCreateDeal,
  })
  const track = { selected, onSelect }

  return (
    <div className="overflow-x-auto">
      {/* `mx-auto`, not a flex `justify-center`: centering an overflowing box
          with flex traps half the overflow past `scrollLeft: 0`. A negative
          auto margin resolves to 0, so a narrow card just left-aligns it. */}
      <div className="relative mx-auto" style={{ width: TREE_WIDTH }}>
        <div className="relative h-4">
          <ColumnCaption col={COL.lead}>Lead</ColumnCaption>
          <ColumnCaption col={COL.deal}>Cơ hội</ColumnCaption>
          <ColumnCaption col={COL.contract}>Hợp đồng</ColumnCaption>
          <ColumnCaption col={COL.account}>Sau bán</ColumnCaption>
        </div>

        <div className="relative mt-3" style={{ height: layout.height }}>
          <svg
            aria-hidden
            width={TREE_WIDTH}
            height={layout.height}
            viewBox={`0 0 ${TREE_WIDTH} ${layout.height}`}
            fill="none"
            className="pointer-events-none absolute left-0 top-0"
          >
            {layout.edges.map((edge) => (
              <path
                key={edge.key}
                d={edgePath(edge)}
                stroke={EDGE_STROKE[edge.tone]}
                strokeWidth={edge.tone === 'won' ? 2.5 : 2}
                strokeDasharray={edge.tone === 'ghost' ? '4 5' : undefined}
              />
            ))}
          </svg>

          <LeadNode lead={ws.lead} lane={lead} box={layout.lead} {...track} />

          {deals.map((deal, i) => {
            const box = layout.deals[i]
            return box && <DealNode key={deal.code} lane={deal} box={box} {...track} />
          })}
          {layout.dealGhost && (
            <Ghost box={layout.dealGhost} col={COL.deal}>
              Chưa có cơ hội nào từ lead này
            </Ghost>
          )}
          {layout.hidden && (
            <div
              className={cn(
                'text-muted-foreground absolute flex items-center gap-2 rounded-lg px-4 text-[11.5px]',
                GHOST_EDGE,
              )}
              style={{
                left: COL.deal.x,
                top: layout.hidden.top,
                width: COL.deal.w,
                height: layout.hidden.height,
              }}
            >
              <Icon icon={Lock} size={16} />
              {ws.hiddenDeals} cơ hội bạn không có quyền xem
            </div>
          )}

          {contracts.map((contract, i) => {
            const box = layout.contracts[i]
            return box && <ContractNode key={contract.code} contract={contract} box={box} />
          })}
          {layout.contractGhost && (
            <Ghost box={layout.contractGhost} col={COL.contract}>
              Chưa có hợp đồng
            </Ghost>
          )}

          {ws.account.code === null ? (
            <Ghost box={layout.account} col={COL.account}>
              Chưa gắn công ty
            </Ghost>
          ) : (
            <AccountNode account={ws.account} box={layout.account} go={go} />
          )}

          {layout.createDeal && (
            <div
              className="absolute"
              style={{ left: COL.lead.x, top: layout.createDeal.top, width: COL.lead.w }}
            >
              <CreateDealButton leadCode={ws.lead.code} onCreated={onDealCreated} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
