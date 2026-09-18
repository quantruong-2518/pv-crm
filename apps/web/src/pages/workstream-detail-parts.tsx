import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Avatar,
  Badge,
  Button,
  Icon,
  Plus,
  Separator,
  StatusDot,
  cn,
  type StatusDotState,
} from '@pv/ui'
import {
  SOURCE_KIND_LABEL,
  SOURCE_KIND_UNKNOWN,
  type WorkstreamAccountLane,
  type WorkstreamDealLane,
  type WorkstreamHolder,
  type WorkstreamLeadLane,
  type WorkstreamStep,
  type WorkstreamStepState,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dm } from '@/lib/date'
import { leadProfileQuery } from '@/data/lead-profile'
import { chainPath } from '@/data/opportunities'
import { currentStepOf, type StepRef, type WorkstreamLane } from '@/data/workstreams'
import { ConvertDialog } from '@/components/convert-dialog'
import { GateChecklist } from '@/components/gate-checklist'

/** The lane rows and the step panel of `/sales/workstreams/:code`.
 *
 *  The step cells are built here rather than bent out of `StageTrack` or
 *  `Stepper`: a lane has four states including "dropped", and every cell is a
 *  selection button — neither pattern carries both (see their docblocks). */

type Go = (path: string) => void

const DOT: Record<Exclude<WorkstreamStepState, 'upcoming'>, StatusDotState> = {
  done: 'ok',
  current: 'current',
  dropped: 'bad',
}

export function StepDot({ state }: { state: WorkstreamStepState }) {
  if (state === 'upcoming') {
    return (
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--muted-foreground)]"
      />
    )
  }
  return <StatusDot state={DOT[state]} className="relative size-3" />
}

export function Holder({ owner }: { owner: WorkstreamHolder | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px]">
      {owner ? (
        <Avatar name={owner.name} size="sm" />
      ) : (
        <span aria-hidden className="bg-surface-ink/9 size-6 shrink-0 rounded-md" />
      )}
      <span className={cn('truncate', !owner && 'text-muted-foreground')}>
        {owner?.name ?? '—'}
      </span>
    </span>
  )
}

/** Meta column on the left, lane body on the right; stacked below `md`. */
function LaneRow({ meta, children }: { meta: ReactNode; children: ReactNode }) {
  return (
    <li className="grid min-w-0 gap-4 py-5 md:grid-cols-[200px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col items-start gap-2">{meta}</div>
      <div className="min-w-0">{children}</div>
    </li>
  )
}

function LaneTitle({ title, tag }: { title: string; tag: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[14px] font-semibold">{title}</span>
      {tag}
    </span>
  )
}

function stepMeta(step: WorkstreamStep): string {
  const days = step.days === null ? null : `${step.days} ngày`
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ') || '—'
  if (step.state === 'done') return join(step.at && dm(step.at), step.by)
  if (step.state === 'current') return join(step.by, days)
  if (step.state === 'dropped') return join('Rớt', days)
  return '—'
}

/** `current` holds only on an untinted cell: `text-warning` drops under 4.5:1 on
 *  the primary tint in the stone theme, so StepTrack swaps in the on-tint token. */
const META_TONE: Record<WorkstreamStepState, string> = {
  done: 'text-muted-foreground font-mono',
  current: 'text-warning font-medium',
  dropped: 'text-destructive-foreground font-medium',
  upcoming: 'text-muted-foreground font-mono',
}

const LABEL_TONE: Record<WorkstreamStepState, string> = {
  done: 'font-medium',
  current: 'font-semibold',
  dropped: 'text-destructive-foreground font-medium',
  upcoming: 'text-muted-foreground',
}

type EndCapTone = 'success' | 'danger' | 'quiet'

const END_CAP: Record<EndCapTone, { surface: string; mark: string; text: string }> = {
  success: {
    surface: 'bg-success/12',
    mark: 'bg-success',
    text: 'text-on-tint-success-strong',
  },
  danger: {
    surface: 'bg-destructive/16',
    mark: 'bg-destructive-foreground',
    text: 'text-on-tint-destructive',
  },
  quiet: { surface: 'bg-surface-ink/6', mark: 'bg-surface-ink/24', text: 'text-muted-foreground' },
}

function EndCap({ tone, label, sub }: { tone: EndCapTone; label: string; sub: string | null }) {
  const face = END_CAP[tone]
  return (
    <div
      className={cn(
        'ml-auto flex w-32 shrink-0 flex-col justify-center gap-1 rounded-lg p-3',
        face.surface,
      )}
    >
      <span className={cn('flex items-center gap-2 text-[12.5px] font-semibold', face.text)}>
        <span aria-hidden className={cn('size-2 shrink-0 rounded-sm', face.mark)} />
        {label}
      </span>
      {sub && <span className={cn('tnum font-mono text-[11px]', face.text)}>{sub}</span>}
    </div>
  )
}

/** Only the rungs a lane has something to say about — an `upcoming` rung is
 *  empty by construction (no `at`, no `by`), and a fresh deal one column into
 *  a five-column ladder used to trail four empty boxes behind it. At least one
 *  rung always shows, even the one lane that has reached none yet (a lead with
 *  no tier). */
function reachedSteps(steps: WorkstreamStep[]): WorkstreamStep[] {
  let cut = 0
  steps.forEach((s, i) => {
    if (s.state !== 'upcoming') cut = i + 1
  })
  return steps.slice(0, Math.max(cut, 1))
}

/** The track scrolls inside itself so a narrow screen never scrolls the page
 *  sideways. A connector is lit when the step it leads INTO was reached. */
function StepTrack({
  lane,
  selected,
  onSelect,
  endCap,
}: {
  lane: WorkstreamLane
  selected: StepRef | null
  onSelect: (ref: StepRef) => void
  endCap: ReactNode
}) {
  const steps = reachedSteps(lane.steps)
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max min-w-full items-stretch gap-4">
        <ol className="m-0 flex list-none p-0">
          {steps.map((step, i) => {
            const next = steps[i + 1]
            const isSelected = selected?.lane === lane.code && selected.step === step.key
            const tinted = isSelected || (step.state === 'current' && lane.open)
            return (
              <li key={step.key} className="relative w-44 shrink-0">
                {next && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -right-3 left-6 top-[17px] h-0.5 rounded-sm',
                      next.state === 'upcoming' ? 'bg-surface-ink/12' : 'bg-success',
                    )}
                  />
                )}
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-current={step.state === 'current' ? 'step' : undefined}
                  onClick={() => onSelect({ lane: lane.code, step: step.key })}
                  className={cn(
                    'motion-std relative flex min-h-12 w-full flex-col items-start gap-2 rounded-md p-3 text-left',
                    isSelected
                      ? 'bg-primary/16 shadow-[inset_0_0_0_1px_var(--accent-foreground)]'
                      : tinted
                        ? 'bg-primary/10 hover:bg-primary/16'
                        : 'hover:bg-surface-ink/8',
                  )}
                >
                  <StepDot state={step.state} />
                  <span className={cn('text-[13px]', LABEL_TONE[step.state])}>{step.label}</span>
                  <span
                    className={cn(
                      'tnum text-[11px]',
                      tinted && step.state === 'current'
                        ? 'text-on-tint-warning-strong font-medium'
                        : META_TONE[step.state],
                    )}
                  >
                    {stepMeta(step)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {endCap}
      </div>
    </div>
  )
}

type TrackProps = { selected: StepRef | null; onSelect: (ref: StepRef) => void }

const LEAD_END: Record<WorkstreamLeadLane['outcome'], [EndCapTone, string]> = {
  converted: ['success', 'Converted'],
  exited: ['danger', 'Rời phễu'],
  open: ['quiet', 'Đang mở'],
}

export function LeadLaneRow({
  lead,
  lane,
  action,
  ...track
}: TrackProps & { lead: WorkstreamLeadLane; lane: WorkstreamLane; action: ReactNode }) {
  const [tone, label] = LEAD_END[lead.outcome]
  return (
    <LaneRow
      meta={
        <>
          <LaneTitle
            title="Lead"
            tag={
              <Badge>
                {lead.sourceKind ? SOURCE_KIND_LABEL[lead.sourceKind] : SOURCE_KIND_UNKNOWN}
              </Badge>
            }
          />
          <span className="text-muted-foreground font-mono text-[11px]">{lead.code}</span>
          <Holder owner={lead.owner} />
          {action}
        </>
      }
    >
      <StepTrack
        lane={lane}
        {...track}
        endCap={
          <EndCap
            tone={tone}
            label={label}
            sub={lead.outcomeAt === null ? null : dm(lead.outcomeAt)}
          />
        }
      />
    </LaneRow>
  )
}

const DEAL_END: Record<WorkstreamDealLane['outcome'], [EndCapTone, string]> = {
  won: ['success', 'Won'],
  lost: ['danger', 'Lost'],
  open: ['quiet', 'Đang mở'],
}

export function DealLaneRow({
  deal,
  lane,
  ...track
}: TrackProps & { deal: WorkstreamDealLane; lane: WorkstreamLane }) {
  const [tone, label] = DEAL_END[deal.outcome]
  const sub =
    deal.outcome === 'open'
      ? 'chưa có kết quả'
      : deal.outcomeAt === null
        ? null
        : dm(deal.outcomeAt)
  return (
    <LaneRow
      meta={
        <>
          <LaneTitle title="Cơ hội" tag={null} />
          <span className="text-muted-foreground font-mono text-[11px]">{deal.code}</span>
          <Holder owner={deal.owner} />
        </>
      }
    >
      <StepTrack lane={lane} {...track} endCap={<EndCap tone={tone} label={label} sub={sub} />} />
    </LaneRow>
  )
}

export function AccountLaneRow({ account, go }: { account: WorkstreamAccountLane; go: Go }) {
  const path = account.code === null ? undefined : chainPath('AC', account.code)
  const tag =
    account.code === null ? (
      <Badge>Chưa gắn</Badge>
    ) : account.purchased ? (
      <Badge tone="success" className="text-on-tint-success-strong">
        Đã mua
      </Badge>
    ) : (
      <Badge>Chưa mua</Badge>
    )
  return (
    <LaneRow
      meta={
        <>
          <LaneTitle title="Account" tag={tag} />
          <span className="text-muted-foreground font-mono text-[11px]">{account.code ?? '—'}</span>
          <Holder owner={account.owner} />
        </>
      }
    >
      {account.code === null ? (
        <p className="bg-surface-ink/4 text-muted-foreground m-0 flex min-h-20 items-center rounded-lg px-4 text-[12.5px]">
          Hành trình chưa gắn công ty
        </p>
      ) : (
        <div className="bg-surface-ink/4 flex min-h-20 flex-wrap items-center justify-between gap-4 rounded-lg px-4 py-3">
          <span className="font-display min-w-0 truncate text-[14px] font-semibold">
            {account.name ?? account.code}
          </span>
          {path && (
            <Button variant="ghost" size="lg" onClick={() => go(path)}>
              Mở account
              <Icon icon={ArrowRight} size={16} />
            </Button>
          )}
        </div>
      )}
    </LaneRow>
  )
}

/** Opens the same convert form the lead profile opens; that form seeds from a
 *  `LeadProfile`, which this screen only reads once somebody asks for it. */
export function CreateDealButton({
  leadCode,
  onCreated,
}: {
  leadCode: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const profile = useQuery({ ...leadProfileQuery(leadCode), enabled: asked })
  const waiting = open && profile.data === undefined && !profile.isError

  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        disabled={waiting}
        onClick={() => {
          if (profile.isError) void profile.refetch()
          setAsked(true)
          setOpen(true)
        }}
      >
        <Icon icon={Plus} size={16} />
        {waiting ? 'Đang mở…' : 'Tạo cơ hội'}
      </Button>
      {open && profile.isError && (
        <span className="text-destructive-foreground text-[11px]">
          {isApiError(profile.error) ? userMessage(profile.error) : 'Không mở được hồ sơ lead.'}
        </span>
      )}
      {profile.data && (
        <ConvertDialog
          profile={profile.data}
          open={open}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  )
}

const STATUS_WORD: Record<WorkstreamStepState, string> = {
  done: 'Hoàn tất',
  current: 'Đang ở',
  dropped: 'Rớt',
  upcoming: 'Chưa tới',
}

export function StepPanel({
  lane,
  step,
  canEdit,
  onSelect,
  go,
}: {
  lane: WorkstreamLane
  step: WorkstreamStep
  canEdit: boolean
  onSelect: (ref: StepRef) => void
  go: Go
}) {
  const current = currentStepOf(lane)
  const path = chainPath(lane.kind, lane.code)
  const deal = lane.kind === 'OP'
  const status =
    step.state === 'upcoming' || step.days === null
      ? STATUS_WORD[step.state]
      : `${STATUS_WORD[step.state]} · ${step.days} ngày`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground m-0 text-[12px]">
          {deal ? 'Cơ hội' : 'Lead'} · <span className="font-mono">{lane.code}</span>
        </p>
        <h3 className="font-display m-0 text-[22px] font-semibold leading-[1.3]">{step.label}</h3>
        <span className="flex items-center gap-2 text-[12.5px]">
          <StepDot state={step.state} />
          <span className="tnum">{status}</span>
        </span>
      </div>
      <Separator />
      <div className="flex items-center gap-3">
        {step.by ? (
          <Avatar name={step.by} size="md" />
        ) : (
          <span aria-hidden className="bg-surface-ink/9 size-[30px] shrink-0 rounded-md" />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[12.5px] font-semibold">{step.by ?? 'Chưa có người'}</span>
          <span className="text-muted-foreground tnum text-[11px]">
            PIC{step.at && ` · từ ${dm(step.at)}`}
          </span>
        </span>
      </div>
      {deal && step.criteria.length > 0 && (
        <GateChecklist
          key={`${lane.code}:${step.key}`}
          opportunityCode={lane.code}
          criteria={step.criteria}
          title="Điều kiện qua stage"
          editable={lane.open && canEdit}
          passed={step.state === 'done'}
          note={
            lane.open
              ? 'Bạn không có quyền sửa cơ hội này.'
              : 'Cơ hội đã đóng, không tick được nữa.'
          }
        />
      )}
      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          size="lg"
          disabled={!current}
          onClick={() => current && onSelect({ lane: lane.code, step: current.key })}
        >
          Về stage hiện tại
        </Button>
        {path && (
          <Button size="lg" onClick={() => go(path)}>
            {deal ? 'Mở cơ hội' : 'Mở lead'}
          </Button>
        )}
      </div>
    </div>
  )
}
