import { useState } from 'react'
import {
  Badge,
  Button,
  DataTable,
  GlassCard,
  Input,
  SectionTitle,
  cn,
  type TableColumn,
} from '@pv/ui'
import {
  KPI_METRIC_LABEL,
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
import { useDraftTeamAllocation, useSubmitTeamAllocation } from '@/data/kpi-team-view'
import { ROLE_LABEL } from '@/data/users'
import { NOTE } from './home-tiles'
import { PACKAGE_LABEL, actedAt, typedOf } from './kpi-allocate-model'
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

type Check = { text: string; badge: { tone: 'success' | 'warning'; text: string } | null }

/** One metric's sum against the team's share; the share is printed even before anything is split. */
function checkOf(def: KpiMetricDef, share: number, total: KpiAllocationTotal | undefined): Check {
  const print = (v: number) => printValue(def.unit, v)
  if (!total) return { text: `Phần của nhóm ${print(share)} · chưa chia`, badge: null }
  if (total.allocated === null) {
    return { text: `Phần của nhóm ${print(share)} · mỗi người một mức riêng`, badge: null }
  }
  const { delta } = total
  const gap =
    delta === null || delta === 0
      ? null
      : `${delta < 0 ? 'Thiếu' : 'Thừa'} ${print(Math.abs(delta))}`
  return {
    text: `Đã chia ${print(total.allocated)} / ${print(share)}`,
    badge:
      delta === 0 ? { tone: 'success', text: 'Khớp' } : gap ? { tone: 'warning', text: gap } : null,
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
  const [daysText, setDaysText] = useState(initialDays === null ? '' : String(initialDays))
  const days = ACK_DAYS.safeParse(toDays(daysText))
  const problem =
    daysText === ''
      ? 'Nhập hạn trả lời để gửi duyệt.'
      : days.success
        ? undefined
        : `Nhập số ngày từ ${ACK_DAYS.minValue} đến ${ACK_DAYS.maxValue}.`
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 px-5">
      <div className="mr-auto flex min-w-0 flex-col gap-1">
        <p className={NOTE}>
          Hàng nghìn ngăn bằng dấu chấm, số lẻ dùng dấu phẩy. Tỷ lệ nhập theo phần trăm.
        </p>
        {dirty && <p className={NOTE}>Có thay đổi chưa lưu. Lưu nháp rồi mới gửi duyệt được.</p>}
        <Field
          label="Hạn trả lời (số ngày)"
          hint="Quá hạn mà người nhận chưa trả lời thì áp dụng mức đã giao."
          problem={problem}
          className="mt-1 w-72 max-w-full"
        >
          {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
          <span className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label="Hạn trả lời (số ngày)"
              className="pointer-coarse:h-12 tnum font-num w-24 text-right"
              value={daysText}
              invalid={problem !== undefined}
              onChange={(e) => setDaysText(e.target.value)}
            />
            <span className={NOTE}>ngày</span>
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
        Lưu nháp
      </Button>
      <Button
        className="pointer-coarse:h-12"
        disabled={!onSend || !days.success}
        onClick={() => days.success && onSend?.(days.data)}
      >
        Gửi duyệt
      </Button>
    </div>
  )
}

/** Package state in one line, then why it needs the lead's hand, if it does. */
function StateNotes({ pkg }: { pkg: KpiAllocation | undefined }) {
  if (!pkg) return null
  const sent = pkg.decidedAt
    ? actedAt(pkg.decidedBy, pkg.status === 'returned' ? 'trả lại' : 'duyệt', pkg.decidedAt)
    : null
  return (
    <div className="flex flex-col gap-1">
      {sent && <p className={NOTE_NUM}>{sent}</p>}
      {pkg.status === 'returned' && pkg.returnReason && (
        <p className="text-[12.5px] leading-5">Lý do trả lại: {pkg.returnReason}</p>
      )}
      {pkg.shareChanged && (
        <p className="text-[12.5px] font-semibold leading-5">
          Phần của nhóm đã đổi. Chia lại rồi gửi duyệt.
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
  const tableColumns: TableColumn[] = [
    { header: 'Thành viên', width: 'minmax(160px,1.2fr)' },
    ...columns.map((def) => ({
      header: KPI_METRIC_LABEL[def.key],
      width: 'minmax(168px,1fr)',
      align: 'right' as const,
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
              aria-label={`${KPI_METRIC_LABEL[def.key]} của ${holder.name}`}
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
          <span className={NOTE_NUM}>Tháng trước đạt {printShort(def.unit, last)}</span>
        )}
      </span>
    )
  }

  return (
    <div className="overflow-x-auto">
      <DataTable
        flush
        rowHeight="min-h-16 py-2"
        className={columns.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
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
    </div>
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
            <span className="text-[12.5px] font-semibold">{KPI_METRIC_LABEL[def.key]}</span>
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
  const draft = useDraftTeamAllocation(period, teamId)
  const submit = useSubmitTeamAllocation(period, teamId)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  const columns = defs.filter((d) => shares.has(d.key))
  const status = pkg?.status
  const editable = canEdit && (!pkg || status === 'draft' || editing)
  const reopenable = canEdit && !editable && (status === 'returned' || pkg?.shareChanged === true)
  const state = pkg
    ? PACKAGE_LABEL[pkg.status]
    : { text: 'Chưa chia cho thành viên', tone: 'draft' as const }

  const saved = new Map(pkg?.lines.map((l) => [cellKey(l.actorId, l.metricKey), l]))
  const textOf = (key: string, def: KpiMetricDef) => {
    const line = saved.get(key)
    return edits[key] ?? (line ? typedOf(def.unit, line.value) : '')
  }
  const dirty = Object.keys(edits).length > 0
  const busy = draft.isPending || submit.isPending

  const body = editable ? draftBodyOf(role, teamId, columns, holders, textOf) : null
  /* A returned or agreed package re-saves unchanged to open its next version. */
  const saveable = body !== null && (dirty || status !== 'draft') && !busy
  const sendable = canEdit && status === 'draft' && !dirty && !busy

  const save = () => {
    if (!body) return
    submit.reset()
    draft.mutate(body, {
      onSuccess: () => {
        setEdits({})
        setEditing(false)
        toastDone('Đã lưu nháp')
      },
    })
  }
  const send = (ackDays: number) => {
    draft.reset()
    submit.mutate({ role, teamId, ackDays }, { onSuccess: () => toastDone('Đã gửi duyệt') })
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
                Chia lại
              </Button>
            )}
          </>
        }
      >
        Chia cho thành viên · {ROLE_LABEL[role]}
      </SectionTitle>
      <StateNotes pkg={pkg} />
      <GlassCard variant="b" className="flex flex-col gap-4 py-4">
        <div className="px-5">
          <Badge tone={state.tone}>{state.text}</Badge>
        </div>
        {holders.length === 0 ? (
          <p className={cn(NOTE, 'px-5')}>Nhóm chưa có ai giữ vai trò này.</p>
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
