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
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { ladderRows, useMyConfigProposals } from '@/data/sales-config'
import {
  FRAME_STATES,
  sameAddress,
  stateLabelOf,
  stepFrameQuery,
  templatesAt,
  useProposeFrame,
} from '@/data/step-frame'
import { AddTemplate, TemplateRow } from './sales-config-frame-parts'
import { frameWaiting } from './sales-config-model'
import {
  DeadlineBox,
  LadderSend,
  LadderTable,
  Section,
  WaitingCount,
  type AreaProps,
} from './sales-config-section'
import { sentCopy } from './sales-config-copy'

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
  const { t } = useI18n()
  const tiers = ladderRows(catalog, 'TIER')
  const waiting = frameWaiting(useMyConfigProposals())
  return (
    <>
      <Section at="step-frame">
        <WaitingCount count={waiting} />
        <StepFrame catalog={catalog} draft={draft} />
      </Section>

      <Section at="tier-limits">
        <GlassCard variant="b" className="p-4">
          <LadderTable
            list="TIER"
            head={t(message('Bậc', 'Tier', '등급'))}
            rows={tiers}
            unit={t(message('lead', 'leads', '리드'))}
            draft={draft}
          />
        </GlassCard>
        <LadderSend list="TIER" rows={tiers} draft={draft} />
      </Section>
    </>
  )
}

type Phase = StateAddress['kind']

function StepFrame({ catalog, draft }: AreaProps) {
  const { t } = useI18n()
  const { data: frame, isPending, error, refetch } = useQuery(stepFrameQuery)
  const [phase, setPhase] = useState<Phase>('lead')
  const phases: { value: Phase; label: string }[] = [
    { value: 'lead', label: t(message('Presale · Lead', 'Presales · Lead', '사전 영업 · 리드')) },
    {
      value: 'opportunity',
      label: t(message('Sale · Cơ hội', 'Sales · Opportunity', '영업 · 기회')),
    },
    { value: 'customer', label: t(message('Khách đã mua', 'Customer', '구매 고객')) },
  ]
  /* One open state per phase, so flipping the phase and back returns to it. */
  const [open, setOpen] = useState<Record<Phase, StateAddress>>({
    lead: FRAME_STATES.lead[0]!,
    opportunity: FRAME_STATES.opportunity[0]!,
    customer: FRAME_STATES.customer[0]!,
  })

  /* Stage deadlines need only the catalog. The whole ladder stands in when
     the frame is unread, or when the rungs do not pair one-to-one with the
     stages and no state could find its own box. */
  const stages = ladderRows(catalog, 'STAGE')
  const paired = StageKey.options.every((key) => stages.some((row) => row.key === key))
  const stageTable = stages.length > 0 && (
    <GlassCard variant="b" className="p-4">
      <LadderTable
        list="STAGE"
        head={t(message('Giai đoạn', 'Stage', '단계'))}
        rows={stages}
        unit={t(message('cơ hội', 'opportunities', '기회'))}
        draft={draft}
      />
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
          tone="danger"
          icon={TriangleAlert}
          message={
            isApiError(error)
              ? `${t(message('Không tải được khung hành trình.', 'Could not load the sales journey.', '영업 여정을 불러오지 못했습니다.'))} ${userMessage(error)}`
              : t(
                  message(
                    'Không tải được khung hành trình.',
                    'Could not load the sales journey.',
                    '영업 여정을 불러오지 못했습니다.',
                  ),
                )
          }
          action={{
            label: t(message('Thử lại', 'Try again', '다시 시도')),
            onClick: () => void refetch(),
          }}
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
        label={t(message('Giai đoạn', 'Phase', '구간'))}
        hideLabel
        tone="quiet"
        options={phases}
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
  const { t, number } = useI18n()
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
                  {live === 0
                    ? t(message('Chưa có bước', 'No steps', '단계 없음'))
                    : t(message(`${live} bước`, `${number(live)} steps`, `단계 ${number(live)}개`))}
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
  const { t } = useI18n()
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
          {t(
            message(
              `Bước tiếp theo ở “${stateLabelOf(address)}”`,
              `Next steps for “${stateLabelOf(address)}”`,
              `“${stateLabelOf(address)}”의 다음 단계`,
            ),
          )}
        </span>
        {rows.length === 0 ? (
          <p className="text-muted-foreground m-0 text-[11.5px]">
            {t(message('Chưa có bước.', 'No steps yet.', '단계가 없습니다.'))}
          </p>
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
  const { t } = useI18n()
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
          {t(
            message(
              'Sale được tự điền việc khác ngoài danh sách',
              'Allow sales reps to enter steps outside this list',
              '영업 담당자가 목록에 없는 단계를 직접 입력하도록 허용',
            ),
          )}
        </span>
        {canPropose ? (
          <SegmentedControl
            label={t(
              message(
                'Sale được tự điền việc khác ngoài danh sách',
                'Allow sales reps to enter steps outside this list',
                '영업 담당자가 목록에 없는 단계를 직접 입력하도록 허용',
              ),
            )}
            hideLabel
            tone="quiet"
            options={[
              { value: YES, label: t(message('Có', 'Yes', '예')) },
              { value: NO, label: t(message('Không', 'No', '아니요')) },
            ]}
            value={shown ? YES : NO}
            onChange={(next) => setPick(next === YES)}
          />
        ) : (
          <span className="text-[12.5px] font-semibold">
            {freeEntry ? t(message('Có', 'Yes', '예')) : t(message('Không', 'No', '아니요'))}
          </span>
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
                      toastDone(sentCopy())
                    },
                  },
                )
              }
            >
              {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setPick(null)}
            >
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
          </>
        )}
      </div>

      {stage && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 basis-64 text-[12.5px] font-medium">
            {t(message('Hạn · ngày', 'Due in · days', '기한 · 일'))}
          </span>
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
