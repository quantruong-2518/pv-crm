import { useState } from 'react'
import { Badge, Button, GlassCard, Input, SectionTitle, cn } from '@pv/ui'
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
import { useSession } from '@/app/auth'
import { message, translate, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { Field } from '@/components/field-bits'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { useDraftTeamAllocation, useSubmitTeamAllocation } from '@/data/kpi-team-view'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { NOTE } from './home-tiles'
import { PACKAGE_LABEL, actedAt, decidedVerb, typedOf } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { TargetHistoryButton } from './kpi-history'
import { DASH, UNIT_WORD, parseTyped, printShort, printValue } from './kpi-model'
import type { Recipient } from './kpi-team-model'

/** One role's split of the team's share across its members (ADR 0101): a member
 *  per row, a metric per column, and under it each metric against the team's share.
 *
 *  Only the lead edits. A field left empty is not sent. The sums are the server's
 *  `totals` of the SAVED draft, so a figure typed but not saved moves nothing and
 *  the note says so. When the room changed the share, the agreed package keeps
 *  scoring until a new version that matches is sent.
 *
 *  Own copy of the room table's editor: that one is wired to the head's doors. */

const NOTE_NUM = cn(NOTE, 'tnum font-num')
const ACK_DAYS = KpiAllocationSubmitBody.shape.ackDays
const cellKey = (actorId: string, metric: KpiMetricKey) => `${actorId}|${metric}`

/** Whole days only; anything else is NaN, which the contract refuses. */
const toDays = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : Number.NaN)

const NOT_SPLIT = message(
  'Chưa chia cho thành viên',
  'Not yet split among members',
  '팀원에게 아직 배분되지 않음',
)

type Check = { text: string; badge: { tone: 'success' | 'warning'; text: string } | null }

/** One metric's sum against the team's share; the share is printed even before anything is split. */
function checkOf(def: KpiMetricDef, share: number, total: KpiAllocationTotal | undefined): Check {
  const print = (v: number) => printValue(def.unit, v)
  const own = print(share)
  if (!total) {
    const text = message(
      `Phần của nhóm ${own} · chưa chia`,
      `Team share ${own} · not yet split`,
      `팀 몫 ${own} · 미배분`,
    )
    return { text: translate(text), badge: null }
  }
  if (total.allocated === null) {
    const text = message(
      `Phần của nhóm ${own} · mỗi người một mức riêng`,
      `Team share ${own} · each person has their own level`,
      `팀 몫 ${own} · 개인별 기준 적용`,
    )
    return { text: translate(text), badge: null }
  }
  const { delta } = total
  const amount = delta === null ? '' : print(Math.abs(delta))
  const gap =
    delta === null || delta === 0
      ? null
      : translate(
          delta < 0
            ? message(`Thiếu ${amount}`, `Short ${amount}`, `${amount} 부족`)
            : message(`Thừa ${amount}`, `Over ${amount}`, `${amount} 초과`),
        )
  const done = print(total.allocated)
  return {
    text: translate(
      message(`Đã chia ${done} / ${own}`, `Split ${done} / ${own}`, `배분 ${done} / ${own}`),
    ),
    badge:
      delta === 0
        ? { tone: 'success', text: translate(message('Khớp', 'Matches', '일치')) }
        : gap
          ? { tone: 'warning', text: gap }
          : null,
  }
}

function SaveBar({
  dirty,
  errors,
  initialDays,
  onSave,
  onSend,
}: {
  dirty: boolean
  errors: (ApiError | null)[]
  initialDays: number | null
  /** Absent: the button is disabled. */
  onSave?: () => void
  onSend?: (ackDays: number) => void
}) {
  const { t } = useI18n()
  const [daysText, setDaysText] = useState(initialDays === null ? '' : String(initialDays))
  const replyLabel = t(message('Hạn trả lời (số ngày)', 'Reply deadline (days)', '회신 기한(일)'))
  const days = ACK_DAYS.safeParse(toDays(daysText))
  const problem =
    daysText === ''
      ? t(
          message(
            'Nhập hạn trả lời để gửi duyệt.',
            'Enter the reply deadline to submit for approval.',
            '승인 요청을 보내려면 회신 기한을 입력하세요.',
          ),
        )
      : days.success
        ? undefined
        : t(
            message(
              `Nhập số ngày từ ${ACK_DAYS.minValue} đến ${ACK_DAYS.maxValue}.`,
              `Enter a number of days from ${ACK_DAYS.minValue} to ${ACK_DAYS.maxValue}.`,
              `${ACK_DAYS.minValue}일에서 ${ACK_DAYS.maxValue}일 사이의 숫자를 입력하세요.`,
            ),
          )
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 px-5">
      <div className="mr-auto flex min-w-0 flex-col gap-1">
        <p className={NOTE}>
          {t(
            message(
              'Hàng nghìn ngăn bằng dấu chấm, số lẻ dùng dấu phẩy. Tỷ lệ nhập theo phần trăm.',
              'Separate thousands with a period and decimals with a comma. Enter rates as percentages.',
              '천 단위는 마침표, 소수점은 쉼표로 입력하세요. 비율은 퍼센트로 입력합니다.',
            ),
          )}
        </p>
        {dirty && (
          <p className={NOTE}>
            {t(
              message(
                'Có thay đổi chưa lưu. Lưu nháp rồi mới gửi duyệt được.',
                'There are unsaved changes. Save the draft before submitting for approval.',
                '저장하지 않은 변경 사항이 있습니다. 임시 저장 후 승인 요청을 보낼 수 있습니다.',
              ),
            )}
          </p>
        )}
        <Field
          label={replyLabel}
          hint={t(
            message(
              'Quá hạn mà người nhận chưa trả lời thì áp dụng mức đã giao.',
              'If the recipient has not replied by the deadline, the assigned level applies.',
              '기한까지 수신자가 회신하지 않으면 배정된 기준이 적용됩니다.',
            ),
          )}
          problem={problem}
          className="mt-1 w-72 max-w-full"
        >
          {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
          <span className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label={replyLabel}
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
        {t(message('Lưu nháp', 'Save draft', '임시 저장'))}
      </Button>
      <Button
        className="pointer-coarse:h-12"
        disabled={!onSend || !days.success}
        onClick={() => days.success && onSend?.(days.data)}
      >
        {t(message('Gửi duyệt', 'Submit for approval', '승인 요청'))}
      </Button>
    </div>
  )
}

/** Package state in one line, then why it needs the lead's hand, if it does. */
function StateNotes({ pkg }: { pkg: KpiAllocation | undefined }) {
  const { t } = useI18n()
  if (!pkg) return null
  const sent = pkg.decidedAt ? actedAt(pkg.decidedBy, decidedVerb(pkg.status), pkg.decidedAt) : null
  return (
    <div className="flex flex-col gap-1">
      {sent && <p className={NOTE_NUM}>{sent}</p>}
      {pkg.status === 'returned' && pkg.returnReason && (
        <p className="text-[12.5px] leading-5">
          {t(
            message(
              `Lý do trả lại: ${pkg.returnReason}`,
              `Reason for return: ${pkg.returnReason}`,
              `반려 사유: ${pkg.returnReason}`,
            ),
          )}
        </p>
      )}
      {pkg.shareChanged && (
        <p className="text-[12.5px] font-semibold leading-5">
          {t(
            message(
              'Phần của nhóm đã đổi. Chia lại rồi gửi duyệt.',
              'The team share changed. Split again, then submit for approval.',
              '팀 몫이 변경되었습니다. 다시 배분한 후 승인 요청을 보내세요.',
            ),
          )}
        </p>
      )}
    </div>
  )
}

type Line = KpiAllocation['lines'][number]

/** Every filled field as the team's draft body; null while one is not a number or none is filled. */
function draftBodyOf(
  role: RoleId,
  teamId: string,
  columns: readonly KpiMetricDef[],
  holders: readonly Recipient[],
  textOf: (key: string, def: KpiMetricDef) => string,
): KpiAllocationDraftBody | null {
  let broken = false
  const lines = holders.flatMap(({ actorId }) =>
    columns.flatMap((def) => {
      const value = parseTyped(def.unit, textOf(cellKey(actorId, def.key), def))
      if (value === null) broken = true
      return typeof value === 'number' ? [{ actorId, metricKey: def.key, value }] : []
    }),
  )
  const parsed = KpiAllocationDraftBody.safeParse({ role, teamId, lines })
  return broken || !parsed.success ? null : parsed.data
}

function SplitTable({
  columns,
  holders,
  saved,
  editable,
  textOf,
  onEdit,
}: {
  columns: readonly KpiMetricDef[]
  holders: readonly Recipient[]
  saved: ReadonlyMap<string, Line>
  editable: boolean
  textOf: (key: string, def: KpiMetricDef) => string
  onEdit: (key: string, text: string) => void
}) {
  const { t } = useI18n()
  const tableColumns: StackColumn[] = [
    { header: t(message('Thành viên', 'Member', '팀원')), width: 'minmax(160px,1.2fr)' },
    ...columns.map((def) => ({
      header: kpiMetricText(def.key),
      width: 'minmax(168px,1fr)',
      align: 'right' as const,
      stack: editable ? ('wide' as const) : undefined,
    })),
  ]

  const cell = (holder: Recipient, def: KpiMetricDef) => {
    const key = cellKey(holder.actorId, def.key)
    const line = saved.get(key)
    const last = line?.lastMonth ?? null
    const unit = UNIT_WORD[def.unit]
    return (
      <span key={def.key} className="flex min-w-0 flex-col items-end gap-1">
        {editable ? (
          <span className="flex w-full items-center gap-2">
            <Input
              inputMode="decimal"
              aria-label={t(
                message(
                  `${kpiMetricText(def.key)} của ${holder.name}`,
                  `${kpiMetricText(def.key)} for ${holder.name}`,
                  `${holder.name}의 ${kpiMetricText(def.key)}`,
                ),
              )}
              className="pointer-coarse:h-12 tnum font-num min-w-0 text-right"
              value={textOf(key, def)}
              invalid={parseTyped(def.unit, textOf(key, def)) === null}
              onChange={(e) => onEdit(key, e.target.value)}
            />
            {unit && <span className={cn(NOTE, 'shrink-0')}>{unit}</span>}
          </span>
        ) : (
          <span className="tnum font-num font-semibold">
            {line ? printValue(def.unit, line.value) : DASH}
          </span>
        )}
        {last !== null && (
          <span className={NOTE_NUM}>
            {t(
              message(
                `Tháng trước đạt ${printShort(def.unit, last)}`,
                `Last month: ${printShort(def.unit, last)}`,
                `지난달 달성 ${printShort(def.unit, last)}`,
              ),
            )}
          </span>
        )}
      </span>
    )
  }

  return (
    <StackTable
      from="lg"
      flush
      rowHeight="min-h-16 py-2"
      tableClassName={columns.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
      columns={tableColumns}
      rows={holders.map((h) => ({
        id: h.actorId,
        cells: [
          <span key="who" className="truncate font-semibold">
            {h.name}
          </span>,
          ...columns.map((def) => cell(h, def)),
        ],
      }))}
    />
  )
}

function TotalsList({
  columns,
  shares,
  pkg,
}: {
  columns: readonly KpiMetricDef[]
  shares: ReadonlyMap<KpiMetricKey, number>
  pkg: KpiAllocation | undefined
}) {
  return (
    <ul className="flex flex-col gap-3 px-5">
      {columns.map((def) => {
        const check = checkOf(
          def,
          shares.get(def.key) ?? 0,
          pkg?.totals.find((t) => t.metricKey === def.key),
        )
        return (
          <li key={def.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[12.5px] font-semibold">{kpiMetricText(def.key)}</span>
            <span className={NOTE_NUM}>{check.text}</span>
            {check.badge && <Badge tone={check.badge.tone}>{check.badge.text}</Badge>}
          </li>
        )
      })}
    </ul>
  )
}

export function TeamSplit({
  period,
  teamId,
  role,
  defs,
  shares,
  holders,
  pkg,
  canEdit,
}: {
  period: string
  teamId: string
  role: RoleId
  /** The role's metrics in force, in catalog order. */
  defs: readonly KpiMetricDef[]
  /** The team's share per metric for this role. */
  shares: ReadonlyMap<KpiMetricKey, number>
  holders: readonly Recipient[]
  pkg: KpiAllocation | undefined
  /** The reader leads the team and the month is open. */
  canEdit: boolean
}) {
  const { t } = useI18n()
  const me = useSession((s) => s.actor?.id)
  const draft = useDraftTeamAllocation(period, teamId)
  const submit = useSubmitTeamAllocation(period, teamId)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  const columns = defs.filter((d) => shares.has(d.key))
  const status = pkg?.status
  const editable = canEdit && (!pkg || status === 'draft' || editing)
  const reopenable = canEdit && !editable && (status === 'returned' || pkg?.shareChanged === true)
  const state = pkg ? PACKAGE_LABEL[pkg.status] : { text: t(NOT_SPLIT), tone: 'draft' as const }

  const saved = new Map(pkg?.lines.map((l) => [cellKey(l.actorId, l.metricKey), l]))
  const textOf = (key: string, def: KpiMetricDef) => {
    const line = saved.get(key)
    return edits[key] ?? (line ? typedOf(def.unit, line.value) : '')
  }
  const dirty = Object.keys(edits).length > 0
  const busy = draft.isPending || submit.isPending

  const body = editable ? draftBodyOf(role, teamId, columns, holders, textOf) : null
  /* A draft someone else saved last (the head settling a counter) is sent only
     by its last saver, so the lead re-saves it as is before sending. */
  const foreign = status === 'draft' && pkg?.submittedBy?.actorId !== me
  /* A returned or agreed package re-saves unchanged to open its next version. */
  const saveable = body !== null && (dirty || status !== 'draft' || foreign) && !busy
  const sendable = canEdit && status === 'draft' && !dirty && !foreign && !busy

  const save = () => {
    if (!body) return
    submit.reset()
    draft.mutate(body, {
      onSuccess: () => {
        setEdits({})
        setEditing(false)
        toastDone(t(message('Đã lưu nháp', 'Draft saved', '임시 저장했습니다')))
      },
    })
  }
  const send = (ackDays: number) => {
    draft.reset()
    submit.mutate(
      { role, teamId, ackDays },
      {
        onSuccess: () =>
          toastDone(t(message('Đã gửi duyệt', 'Submitted for approval', '승인 요청을 보냈습니다'))),
      },
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="lg"
        actions={
          <>
            {holders.length > 0 && (
              <TargetHistoryButton
                period={period}
                role={role}
                defs={columns}
                subject={{ holders, roleTarget: false }}
              />
            )}
            {reopenable && (
              <Button
                variant="secondary"
                className="pointer-coarse:h-12"
                onClick={() => setEditing(true)}
              >
                {t(message('Chia lại', 'Split again', '다시 배분'))}
              </Button>
            )}
          </>
        }
      >
        {t(message('Chia cho thành viên', 'Split among members', '팀원에게 배분'))} ·{' '}
        {kpiRoleText(role)}
      </SectionTitle>
      <StateNotes pkg={pkg} />
      <GlassCard variant="b" className="flex flex-col gap-4 py-4">
        <div className="px-5">
          <Badge tone={state.tone}>{state.text}</Badge>
        </div>
        {holders.length === 0 ? (
          <p className={cn(NOTE, 'px-5')}>
            {t(
              message(
                'Nhóm chưa có ai giữ vai trò này.',
                'No one in the team holds this role.',
                '팀에 이 역할을 맡은 사람이 없습니다.',
              ),
            )}
          </p>
        ) : (
          <SplitTable
            columns={columns}
            holders={holders}
            saved={saved}
            editable={editable}
            textOf={textOf}
            onEdit={(key, text) => setEdits({ ...edits, [key]: text })}
          />
        )}
        <TotalsList columns={columns} shares={shares} pkg={pkg} />
        {editable && foreign && pkg?.submittedBy && (
          <p className={cn(NOTE, 'px-5')}>
            {t(
              message(
                `${pkg.submittedBy.name} sửa bản nháp sau cùng. Lưu nháp rồi gửi duyệt.`,
                `${pkg.submittedBy.name} edited the draft last. Save the draft, then submit for approval.`,
                `${pkg.submittedBy.name}님이 임시 저장본을 마지막으로 수정했습니다. 임시 저장 후 승인 요청을 보내세요.`,
              ),
            )}
          </p>
        )}
        {editable && holders.length > 0 && (
          <SaveBar
            dirty={dirty}
            errors={[draft.error, submit.error]}
            initialDays={pkg?.ackDays ?? null}
            onSave={saveable ? save : undefined}
            onSend={sendable ? send : undefined}
          />
        )}
      </GlassCard>
    </section>
  )
}
