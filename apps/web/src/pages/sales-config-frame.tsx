import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  GlassCard,
  SegmentedControl,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import { StageKey, type StateAddress, type StepFrameResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { ladderRows } from '@/data/sales-config'
import {
  FRAME_STATES,
  sameAddress,
  stateLabelOf,
  stepFrameQuery,
  templatesAt,
  useProposeFrame,
} from '@/data/step-frame'
import { AddTemplate, TemplateRow } from './sales-config-frame-parts'
import {
  DeadlineBox,
  LadderSend,
  LadderTable,
  SENT,
  Section,
  type AreaProps,
} from './sales-config-section'

/** The journey frame (ADR 0080) — phase › state › next steps: what a seller
 *  may set as the next step in each state, and whether they may type their own.
 *  The state SETS are closed in code; only the rules hanging on them are here.
 *
 *  Two write paths on purpose. Templates and the free-entry flag propose one
 *  at a time through `data/step-frame.ts`. A deal stage's deadline is still
 *  `limitDays` on `STAGE` (ADR 0080 §3), so its box writes the page's ladder
 *  draft and goes with that ladder's `LadderSend`. Lead states have no deadline
 *  (open question 33); the lead TIER ladder below is a different clock. */
export function FrameArea({ catalog, draft }: AreaProps) {
  const tiers = ladderRows(catalog, 'TIER')
  return (
    <>
      <Section at="step-frame">
        <StepFrame catalog={catalog} draft={draft} />
      </Section>

      <Section at="tier-limits">
        <GlassCard variant="b" className="p-4">
          <LadderTable list="TIER" head="Bậc" rows={tiers} unit="lead" draft={draft} />
        </GlassCard>
        <LadderSend list="TIER" rows={tiers} draft={draft} />
      </Section>
    </>
  )
}

type Phase = StateAddress['kind']

const PHASES: { value: Phase; label: string }[] = [
  { value: 'lead', label: 'Presale · Lead' },
  { value: 'opportunity', label: 'Sale · Cơ hội' },
]

function StepFrame({ catalog, draft }: AreaProps) {
  const { data: frame, isPending, error, refetch } = useQuery(stepFrameQuery)
  const [phase, setPhase] = useState<Phase>('lead')
  /* One open state per phase, so flipping the phase and back returns to it. */
  const [open, setOpen] = useState<Record<Phase, StateAddress>>({
    lead: FRAME_STATES.lead[0]!,
    opportunity: FRAME_STATES.opportunity[0]!,
  })

  /* Stage deadlines need only the catalog. The whole ladder stands in when
     the frame is unread, or when the rungs do not pair one-to-one with the
     stages and no state could find its own box. */
  const stages = ladderRows(catalog, 'STAGE')
  const paired = StageKey.options.every((key) => stages.some((row) => row.key === key))
  const stageTable = stages.length > 0 && (
    <GlassCard variant="b" className="p-4">
      <LadderTable list="STAGE" head="Cột" rows={stages} unit="đơn" draft={draft} />
    </GlassCard>
  )
  /* Mounted ONCE, outside the keyed state detail: a send in flight must
     survive a state switch to clear its draft and keep its refusals. */
  const stageSend = <LadderSend list="STAGE" rows={stages} draft={draft} />

  if (isPending) return <Skeleton className="h-32 w-full" />
  if (!frame) {
    /* An unread frame must not draw as an EMPTY one: "no steps yet" over a
       failed request is a false statement with a working form. */
    return (
      <>
        <EmptyState
          icon={TriangleAlert}
          message={`Không đọc được khung hành trình. ${
            isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
          }`}
          action={{ label: 'Thử lại', onClick: () => void refetch() }}
          className="py-12"
        />
        {stageTable}
        {stageSend}
      </>
    )
  }

  const address = open[phase]
  return (
    <>
      <SegmentedControl
        label="Giai đoạn"
        hideLabel
        tone="quiet"
        options={PHASES}
        value={phase}
        onChange={(next) => setPhase(next as Phase)}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <StateList
          frame={frame}
          states={FRAME_STATES[phase]}
          current={address}
          onPick={(next) => setOpen((prev) => ({ ...prev, [phase]: next }))}
        />
        {/* Keyed by state: a half-typed edit must not carry over to another one. */}
        <StateDetail
          key={`${address.kind}/${address.state}`}
          frame={frame}
          address={address}
          catalog={catalog}
          draft={draft}
        />
      </div>
      {phase === 'opportunity' && !paired && stageTable}
      {stageSend}
    </>
  )
}

/** Law 8 · a list sits on glass-b. */
function StateList({
  frame,
  states,
  current,
  onPick,
}: {
  frame: StepFrameResponse
  states: StateAddress[]
  current: StateAddress
  onPick: (address: StateAddress) => void
}) {
  return (
    <GlassCard variant="b" className="self-start p-2">
      <ul className="flex flex-row flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
        {states.map((address) => {
          const active = sameAddress(address, current)
          const live = templatesAt(frame, address).filter((t) => t.active).length
          return (
            <li key={address.state}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onPick(address)}
                className={cn(
                  'motion-std flex min-h-12 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left lg:w-full',
                  active
                    ? 'bg-surface-ink/12 text-foreground shadow-control'
                    : 'text-muted-foreground hover:bg-surface-ink/8 hover:text-foreground',
                )}
              >
                <span className="min-w-0 break-words text-[12.5px] font-medium">
                  {stateLabelOf(address)}
                </span>
                <span className="text-muted-foreground tnum font-num shrink-0 text-[11px]">
                  {live === 0 ? 'Chưa có bước' : `${live} bước`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}

function StateDetail({
  frame,
  address,
  catalog,
  draft,
}: AreaProps & { frame: StepFrameResponse; address: StateAddress }) {
  const rows = templatesAt(frame, address)
  const kinds = catalog?.STEP_KIND ?? []
  const ids = rows.map((t) => t.id)
  /* The server resolves defaults into one rule per address, so this is found. */
  const rule = frame.rules.find((r) => sameAddress(r.address, address))

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
      {rule && (
        <RuleBlock address={address} freeEntry={rule.freeEntry} catalog={catalog} draft={draft} />
      )}

      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <span className="text-[12.5px] font-semibold">
          Bước tiếp theo ở “{stateLabelOf(address)}”
        </span>
        {rows.length === 0 ? (
          <p className="text-muted-foreground m-0 text-[11.5px]">Chưa có bước.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((t, at) => (
              <li key={t.id}>
                <TemplateRow template={t} kinds={kinds} ids={ids} at={at} />
              </li>
            ))}
          </ul>
        )}
        <AddTemplate address={address} kinds={kinds} />
      </GlassCard>
    </div>
  )
}

const YES = 'yes'
const NO = 'no'

/** The state's rules. The pick is LOCAL until sent, and falls back to the
 *  stored value afterwards: nothing changed until the proposal is approved. */
function RuleBlock({
  address,
  freeEntry,
  catalog,
  draft,
}: AreaProps & { address: StateAddress; freeEntry: boolean }) {
  const canPropose = useCan('config.propose')
  const propose = useProposeFrame()
  const [pick, setPick] = useState<boolean | null>(null)
  const shown = pick ?? freeEntry
  /* Joined by position inside `ladderRows`; a misaligned ladder finds no row
     and draws no box rather than a box bound to the wrong stage. */
  const stages = ladderRows(catalog, 'STAGE')
  const stage =
    address.kind === 'opportunity' ? stages.find((r) => r.key === address.state) : undefined

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 basis-64 text-[12.5px] font-medium">
          Sale được tự điền việc khác ngoài danh sách
        </span>
        {canPropose ? (
          <SegmentedControl
            label="Sale được tự điền việc khác ngoài danh sách"
            hideLabel
            tone="quiet"
            options={[
              { value: YES, label: 'Có' },
              { value: NO, label: 'Không' },
            ]}
            value={shown ? YES : NO}
            onChange={(next) => setPick(next === YES)}
          />
        ) : (
          <span className="text-[12.5px] font-semibold">{freeEntry ? 'Có' : 'Không'}</span>
        )}
        {pick !== null && pick !== freeEntry && (
          <>
            <Button
              size="sm"
              className="pointer-coarse:h-12"
              disabled={propose.isPending}
              onClick={() =>
                propose.mutate(
                  { door: 'rule', body: { address, freeEntry: pick } },
                  {
                    onSuccess: () => {
                      setPick(null)
                      toastDone(SENT)
                    },
                  },
                )
              }
            >
              Gửi đề nghị
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setPick(null)}
            >
              Huỷ
            </Button>
          </>
        )}
      </div>

      {stage && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 basis-64 text-[12.5px] font-medium">Hạn · ngày</span>
          <DeadlineBox list="STAGE" row={stage} draft={draft} />
        </div>
      )}

      {propose.error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </GlassCard>
  )
}
