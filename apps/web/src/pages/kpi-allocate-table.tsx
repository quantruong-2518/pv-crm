import { useState } from 'react'
import { Badge, Button, GlassCard, Input, cn } from '@pv/ui'
import {
  KpiAllocationDraftBody,
  KpiAllocationSubmitBody,
  type KpiAllocation,
  type KpiAllocationTotal,
  type KpiMetricDef,
  type KpiMetricKey,
  type RoleId,
} from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { toastDone } from '@/app/toast'
import { Field } from '@/components/field-bits'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { useDraftKpiAllocation, useSubmitKpiAllocation } from '@/data/kpi-allocation'
import { NEUTRAL_MARK, NOTE } from './home-tiles'
import { savedShare, teamCellKey, typedOf, type TeamRow } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { TeamNameCell, ValueCell } from './kpi-allocate-teams'
import { parseTyped, printValue } from './kpi-model'
import { kpiMetricText } from '@/data/kpi-i18n'
import { message, useI18n } from '@/app/i18n'

/** One role's split: a person per row, a metric per column, and under it how
 *  each metric adds up against the role target. Teams come first, one row each
 *  with its share of the role target per metric (ADR 0101).
 *
 *  The sums and the role target are the server's `totals`, read from the SAVED
 *  draft — the screen never adds the fields up, so a figure typed but not
 *  saved does not move them, and the note says so. A field left empty is not
 *  sent: that person's card falls back to the role target. Only whoever set
 *  the numbers last may send, and only a saved draft. */

/** Someone a line can be handed to. */
export type Recipient = { actorId: string; name: string }

const cellKey = (actorId: string, metric: KpiMetricKey) => `${actorId}|${metric}`
const NOTE_NUM = cn(NOTE, 'tnum font-num')

/** Every filled field as the draft body; null while one is not a number or none is filled. */
function bodyOf(
  role: RoleId,
  defs: readonly KpiMetricDef[],
  holders: readonly Recipient[],
  teams: readonly TeamRow[],
  textOf: (key: string, def: KpiMetricDef, teamId?: string) => string,
): KpiAllocationDraftBody | null {
  let broken = false
  const read = (def: KpiMetricDef, text: string) => {
    const value = parseTyped(def.unit, text)
    if (value === null) broken = true
    return value
  }
  const lines = holders.flatMap(({ actorId }) =>
    defs.flatMap((def) => {
      const value = read(def, textOf(cellKey(actorId, def.key), def))
      return typeof value === 'number' ? [{ actorId, metricKey: def.key, value }] : []
    }),
  )
  const shares = teams.flatMap(({ id: teamId }) =>
    defs.flatMap((def) => {
      const value = read(def, textOf(teamCellKey(teamId, def.key), def, teamId))
      return typeof value === 'number' ? [{ teamId, metricKey: def.key, value }] : []
    }),
  )
  const body = KpiAllocationDraftBody.safeParse({ role, lines, shares })
  return broken || !body.success ? null : body.data
}

type Check = { text: string; badge: { tone: 'success' | 'warning'; text: string } | null }

/** One metric's sum against the role target. With no agreed role target at
 *  all, only what was split is printed: the page already says why. */
function checkOf(
  def: KpiMetricDef,
  total: KpiAllocationTotal | undefined,
  roleTarget: number | null,
  hasTotal: boolean,
  t: ReturnType<typeof useI18n>['t'],
): Check | null {
  const print = (v: number) => printValue(def.unit, v)
  if (!total || total.allocated === null) {
    if (!hasTotal) return null
    const head = total
      ? t(message('Mỗi người một mức riêng', 'Individual targets', '개인별 목표'))
      : t(message('Chưa phân bổ', 'Not allocated', '미배분'))
    const tail =
      roleTarget === null
        ? ''
        : ` · ${t(message('chỉ tiêu vai trò', 'role target', '역할 목표'))} ${print(roleTarget)}`
    return { text: `${head}${tail}`, badge: null }
  }
  if (roleTarget === null)
    return {
      text: `${t(message('Đã phân bổ', 'Allocated', '배분됨'))} ${print(total.allocated)}`,
      badge: null,
    }
  const { delta } = total
  return {
    text: `${t(message('Đã phân bổ', 'Allocated', '배분됨'))} ${print(total.allocated)} / ${print(roleTarget)}`,
    badge:
      delta === null
        ? null
        : delta === 0
          ? { tone: 'success', text: t(message('Khớp', 'Balanced', '일치')) }
          : {
              tone: 'warning',
              text: `${t(delta < 0 ? message('Thiếu', 'Short by', '부족') : message('Thừa', 'Over by', '초과'))} ${print(Math.abs(delta))}`,
            },
  }
}

/** The check line of one metric, in exact dong: a gap of one dong must not print as zero millions. */
function TotalLine({
  def,
  check,
  total,
  parts,
}: {
  def: KpiMetricDef
  check: Check
  total: KpiAllocationTotal | undefined
  /** What the bar is cut into: each person's line and each team's share. */
  parts: readonly { id: string; value: number }[]
}) {
  const shares = total && total.allocated !== null ? parts : []
  const missing = total?.delta && total.delta < 0 ? -total.delta : 0

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold">{kpiMetricText(def.key)}</span>
        <span className={NOTE_NUM}>{check.text}</span>
        {check.badge && <Badge tone={check.badge.tone}>{check.badge.text}</Badge>}
      </div>
      {/* Hidden from assistive tech: the line above says every figure the bar draws. */}
      {shares.length > 0 && (
        <span aria-hidden className="flex h-2 gap-1">
          {shares.map((l) => (
            <span
              key={l.id}
              className="bg-primary h-full basis-0 rounded-sm"
              style={{ flexGrow: l.value }}
            />
          ))}
          {missing > 0 && (
            <span
              className={cn(NEUTRAL_MARK, 'h-full basis-0 rounded-sm')}
              style={{ flexGrow: missing }}
            />
          )}
        </span>
      )}
    </li>
  )
}

/** The slices of one metric's bar: every line and every team share. */
const partsOf = (pkg: KpiAllocation | undefined, metric: KpiMetricKey) => [
  ...(pkg?.lines ?? [])
    .filter((l) => l.metricKey === metric)
    .map((l) => ({ id: l.actorId, value: l.value })),
  ...(pkg?.shares ?? [])
    .filter((s) => s.metricKey === metric)
    .map((s) => ({ id: teamCellKey(s.team.id, metric), value: s.value })),
]

const ACK_DAYS = KpiAllocationSubmitBody.shape.ackDays

/** Whole days only; anything else is NaN, which the contract refuses. */
const toDays = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : Number.NaN)

/** The two writes under the table, and what holds them back, said beside them.
 *  Sending also needs the answer deadline in days, typed here. */
function SaveBar({
  dirty,
  holder,
  errors,
  initialDays,
  onSave,
  onSend,
}: {
  dirty: boolean
  /** Someone else set the numbers last, so only they may send. */
  holder: { name: string } | null
  errors: readonly (ApiError | null)[]
  /** Days the sent package carried before, if any. */
  initialDays: number | null
  /** Absent: the button is disabled. */
  onSave?: () => void
  /** Absent: the button is disabled. */
  onSend?: (ackDays: number) => void
}) {
  const { t } = useI18n()
  const [daysText, setDaysText] = useState(initialDays === null ? '' : String(initialDays))
  const days = ACK_DAYS.safeParse(toDays(daysText))
  const problem =
    daysText === ''
      ? t(
          message(
            'Nhập hạn trả lời để gửi duyệt.',
            'Enter the response deadline before submitting.',
            '검토 요청 전에 응답 기한을 입력하세요.',
          ),
        )
      : days.success
        ? undefined
        : t(
            message(
              `Nhập số ngày từ ${ACK_DAYS.minValue} đến ${ACK_DAYS.maxValue}.`,
              `Enter a number of days from ${ACK_DAYS.minValue} to ${ACK_DAYS.maxValue}.`,
              `${ACK_DAYS.minValue}~${ACK_DAYS.maxValue}일 사이로 입력하세요.`,
            ),
          )
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 px-5">
      <div className="mr-auto flex min-w-0 flex-col gap-1">
        <p className={NOTE}>
          {t(
            message(
              'Hàng nghìn ngăn bằng dấu chấm, số lẻ dùng dấu phẩy. Tỷ lệ nhập theo phần trăm.',
              'Use commas for thousands and periods for decimals. Enter ratios as percentages.',
              '천 단위는 쉼표, 소수점은 마침표를 사용하세요. 비율은 백분율로 입력합니다.',
            ),
          )}
        </p>
        {dirty && (
          <p className={NOTE}>
            {t(
              message(
                'Có thay đổi chưa lưu. Lưu nháp rồi mới gửi duyệt được.',
                'You have unsaved changes. Save a draft before submitting for review.',
                '저장되지 않은 변경 사항이 있습니다. 검토 요청 전에 초안을 저장하세요.',
              ),
            )}
          </p>
        )}
        {holder && (
          <p className="text-[12px] font-semibold leading-4">
            {t(
              message(
                `${holder.name} đang giữ bản nháp này.`,
                `${holder.name} owns this draft.`,
                `${holder.name}님이 이 초안을 편집 중입니다.`,
              ),
            )}
          </p>
        )}
        <Field
          label={t(message('Hạn trả lời (số ngày)', 'Response deadline (days)', '응답 기한 (일)'))}
          hint={t(
            message(
              'Quá hạn mà người nhận chưa trả lời thì áp dụng mức đã giao.',
              'If the recipient does not respond by the deadline, the assigned target applies.',
              '기한까지 수신자가 응답하지 않으면 배정된 목표가 적용됩니다.',
            ),
          )}
          problem={problem}
          className="mt-1 w-72 max-w-full"
        >
          {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
          <span className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label={t(
                message('Hạn trả lời (số ngày)', 'Response deadline (days)', '응답 기한 (일)'),
              )}
              className="pointer-coarse:h-12 tnum font-num w-24 text-right"
              value={daysText}
              invalid={problem !== undefined}
              onChange={(e) => setDaysText(e.target.value)}
            />
            <span className={NOTE}>{t(message('ngày', 'days', '일'))}</span>
          </span>
        </Field>
        {errors.map((error, i) => (
          <FailLine key={i} error={error} />
        ))}
      </div>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12"
        disabled={!onSave}
        onClick={onSave}
      >
        {t(message('Lưu nháp', 'Save draft', '초안 저장'))}
      </Button>
      <Button
        className="pointer-coarse:h-12"
        disabled={!onSend || !days.success}
        onClick={() => days.success && onSend?.(days.data)}
      >
        {t(message('Gửi duyệt', 'Submit for review', '검토 요청'))}
      </Button>
    </div>
  )
}

/* On a card a field takes the full width, so the box is wide enough to type in. */
const columnsOf = (
  defs: readonly KpiMetricDef[],
  editable: boolean,
  t: ReturnType<typeof useI18n>['t'],
): StackColumn[] => [
  { header: t(message('Người nhận', 'Recipient', '수신자')), width: 'minmax(160px,1.2fr)' },
  ...defs.map((def) => ({
    header: kpiMetricText(def.key),
    width: 'minmax(168px,1fr)',
    align: 'right' as const,
    stack: editable ? ('wide' as const) : undefined,
  })),
]

type AllocationTableProps = {
  period: string
  role: RoleId
  /** The role's metrics in force, in catalog order: one column each. */
  defs: readonly KpiMetricDef[]
  /** People in no team: the only ones with a row of their own. */
  holders: readonly Recipient[]
  /** Teams with a share of this role, each a row above the people. */
  teams: readonly TeamRow[]
  /** The room package only; the team packages come in `teamPkgs`. */
  pkg: KpiAllocation | undefined
  /** Each team's own package of this role, read for the status under its row. */
  teamPkgs: readonly KpiAllocation[]
  /** The role target from the targets read; asked only while no package carries its own. */
  roleTargetOf: (key: KpiMetricKey) => number | null
  /** The role has at least one agreed role target this month. */
  hasTotal: boolean
  /** The fields are open: `kpi.set-target`, an open month, a package still being split. */
  editable: boolean
  /** `kpi.set-target` on an open month: the saved draft may be sent. */
  canSend: boolean
  me: string | undefined
}

/** Every metric's check line; nothing at all when no metric has one to print. */
function TotalLines({
  defs,
  pkg,
  roleTargetOf,
  hasTotal,
}: Pick<AllocationTableProps, 'defs' | 'pkg' | 'roleTargetOf' | 'hasTotal'>) {
  const { t } = useI18n()
  const checks = defs.flatMap((def) => {
    const total = pkg?.totals.find((t) => t.metricKey === def.key)
    const roleTarget = pkg ? (total?.roleTarget ?? null) : roleTargetOf(def.key)
    const check = checkOf(def, total, roleTarget, hasTotal, t)
    return check ? [{ def, total, check }] : []
  })
  if (checks.length === 0) return null
  return (
    <ul className="flex flex-col gap-4 px-5">
      {checks.map(({ def, total, check }) => (
        <TotalLine
          key={def.key}
          def={def}
          check={check}
          total={total}
          parts={partsOf(pkg, def.key)}
        />
      ))}
    </ul>
  )
}

const TEXT = {
  noOneHoldsThisRole: message(
    'Chưa có ai giữ vai trò này.',
    'No one holds this role yet.',
    '아직 이 역할을 맡은 사람이 없습니다.',
  ),
}

export function AllocationTable({
  period,
  role,
  defs,
  holders,
  teams,
  pkg,
  teamPkgs,
  roleTargetOf,
  hasTotal,
  editable,
  canSend,
  me,
}: AllocationTableProps) {
  const { t } = useI18n()
  const draft = useDraftKpiAllocation(period)
  const submit = useSubmitKpiAllocation(period)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const saved = new Map(pkg?.lines.map((l) => [cellKey(l.actorId, l.metricKey), l]))
  const savedText = (key: string, def: KpiMetricDef) => {
    const line = saved.get(key)
    return line ? typedOf(def.unit, line.value) : ''
  }
  const savedShareText = (def: KpiMetricDef, teamId: string) => {
    const share = savedShare(pkg, teamId, def.key)
    return share ? typedOf(def.unit, share.value) : ''
  }
  const textOf = (key: string, def: KpiMetricDef, teamId?: string) =>
    edits[key] ?? (teamId ? savedShareText(def, teamId) : savedText(key, def))
  const dirty = Object.keys(edits).length > 0
  const body = editable ? bodyOf(role, defs, holders, teams, textOf) : null
  const busy = draft.isPending || submit.isPending
  /* The server lets only whoever set the numbers last send the draft. */
  const author = pkg?.status === 'draft' ? pkg.submittedBy : null
  const othersDraft = author !== null && author.actorId !== me
  /* A returned package re-saves unchanged to open its next version. */
  const saveable = body !== null && (dirty || pkg?.status !== 'draft') && !busy
  const sendable = canSend && pkg?.status === 'draft' && !othersDraft && !dirty && !busy

  /* A person's line or a team's share: the same box, told apart by `teamId`. */
  const figure = (
    key: string,
    def: KpiMetricDef,
    label: string,
    saved: { value: number; lastMonth: number | null } | undefined,
    teamId?: string,
  ) => (
    <ValueCell
      key={def.key}
      def={def}
      label={`${kpiMetricText(def.key)} ${label}`}
      editable={editable}
      text={textOf(key, def, teamId)}
      saved={saved?.value ?? null}
      last={saved?.lastMonth ?? null}
      onChange={(text) => setEdits({ ...edits, [key]: text })}
    />
  )
  const cell = (holder: Recipient, def: KpiMetricDef) => {
    const key = cellKey(holder.actorId, def.key)
    return figure(
      key,
      def,
      t(message(`của ${holder.name}`, `for ${holder.name}`, `${holder.name}님`)),
      saved.get(key),
    )
  }
  const teamCell = (team: TeamRow, def: KpiMetricDef) =>
    figure(
      teamCellKey(team.id, def.key),
      def,
      t(message(`của nhóm ${team.name}`, `for ${team.name}'s team`, `${team.name} 팀`)),
      savedShare(pkg, team.id, def.key),
      team.id,
    )

  const save = () => {
    if (!body) return
    submit.reset()
    draft.mutate(body, {
      onSuccess: () => {
        setEdits({})
        toastDone(t(message('Đã lưu nháp', 'Draft saved', '초안을 저장했습니다')))
      },
    })
  }
  const send = (ackDays: number) => {
    draft.reset()
    submit.mutate(
      { role, ackDays },
      {
        onSuccess: () =>
          toastDone(t(message('Đã gửi duyệt', 'Submitted for review', '검토를 요청했습니다'))),
      },
    )
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 py-4">
      {holders.length === 0 && teams.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>{t(TEXT.noOneHoldsThisRole)}</p>
      ) : (
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-16 py-2"
          tableClassName={defs.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
          columns={columnsOf(defs, editable, t)}
          rows={[
            ...teams.map((t) => ({
              id: teamCellKey(t.id, 'row'),
              cells: [
                <TeamNameCell key="who" team={t} pkg={teamPkgs.find((p) => p.team?.id === t.id)} />,
                ...defs.map((def) => teamCell(t, def)),
              ],
            })),
            ...holders.map((h) => ({
              id: h.actorId,
              cells: [
                <span key="who" className="truncate font-semibold">
                  {h.name}
                </span>,
                ...defs.map((def) => cell(h, def)),
              ],
            })),
          ]}
        />
      )}

      <TotalLines defs={defs} pkg={pkg} roleTargetOf={roleTargetOf} hasTotal={hasTotal} />

      {editable && (
        <SaveBar
          dirty={dirty}
          holder={othersDraft ? author : null}
          errors={[draft.error, submit.error]}
          initialDays={pkg?.ackDays ?? null}
          onSave={saveable ? save : undefined}
          onSend={sendable ? send : undefined}
        />
      )}
    </GlassCard>
  )
}
