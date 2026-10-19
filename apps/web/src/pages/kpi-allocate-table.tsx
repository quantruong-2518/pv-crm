import { useState } from 'react'
import { Badge, Button, DataTable, GlassCard, Input, cn, type TableColumn } from '@pv/ui'
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
import { useDraftKpiAllocation, useSubmitKpiAllocation } from '@/data/kpi-allocation'
import { NEUTRAL_MARK, NOTE } from './home-tiles'
import { savedShare, teamCellKey, typedOf, type TeamRow } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { TeamNameCell, ValueCell } from './kpi-allocate-teams'
import { parseTyped, printValue } from './kpi-model'

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
): Check | null {
  const print = (v: number) => printValue(def.unit, v)
  if (!total || total.allocated === null) {
    if (!hasTotal) return null
    const head = total ? 'Mỗi người một mức riêng' : 'Chưa phân bổ'
    const tail = roleTarget === null ? '' : ` · chỉ tiêu vai trò ${print(roleTarget)}`
    return { text: `${head}${tail}`, badge: null }
  }
  if (roleTarget === null) return { text: `Đã phân bổ ${print(total.allocated)}`, badge: null }
  const { delta } = total
  return {
    text: `Đã phân bổ ${print(total.allocated)} / ${print(roleTarget)}`,
    badge:
      delta === null
        ? null
        : delta === 0
          ? { tone: 'success', text: 'Khớp' }
          : { tone: 'warning', text: `${delta < 0 ? 'Thiếu' : 'Thừa'} ${print(Math.abs(delta))}` },
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
        <span className="text-[12.5px] font-semibold">{KPI_METRIC_LABEL[def.key]}</span>
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
        {holder && (
          <p className="text-[12px] font-semibold leading-4">
            {holder.name} đang giữ bản nháp này.
          </p>
        )}
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

const columnsOf = (defs: readonly KpiMetricDef[]): TableColumn[] => [
  { header: 'Người nhận', width: 'minmax(160px,1.2fr)' },
  ...defs.map((def) => ({
    header: KPI_METRIC_LABEL[def.key],
    width: 'minmax(168px,1fr)',
    align: 'right' as const,
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

  const checks = defs.flatMap((def) => {
    const total = pkg?.totals.find((t) => t.metricKey === def.key)
    const roleTarget = pkg ? (total?.roleTarget ?? null) : roleTargetOf(def.key)
    const check = checkOf(def, total, roleTarget, hasTotal)
    return check ? [{ def, total, check }] : []
  })

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
      label={`${KPI_METRIC_LABEL[def.key]} ${label}`}
      editable={editable}
      text={textOf(key, def, teamId)}
      saved={saved?.value ?? null}
      last={saved?.lastMonth ?? null}
      onChange={(text) => setEdits({ ...edits, [key]: text })}
    />
  )
  const cell = (holder: Recipient, def: KpiMetricDef) => {
    const key = cellKey(holder.actorId, def.key)
    return figure(key, def, `của ${holder.name}`, saved.get(key))
  }
  const teamCell = (team: TeamRow, def: KpiMetricDef) =>
    figure(
      teamCellKey(team.id, def.key),
      def,
      `của nhóm ${team.name}`,
      savedShare(pkg, team.id, def.key),
      team.id,
    )

  const save = () => {
    if (!body) return
    submit.reset()
    draft.mutate(body, {
      onSuccess: () => {
        setEdits({})
        toastDone('Đã lưu nháp')
      },
    })
  }
  const send = (ackDays: number) => {
    draft.reset()
    submit.mutate({ role, ackDays }, { onSuccess: () => toastDone('Đã gửi duyệt') })
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 py-4">
      {holders.length === 0 && teams.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>Chưa có ai giữ vai trò này.</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            flush
            rowHeight="min-h-16 py-2"
            className={defs.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
            columns={columnsOf(defs)}
            rows={[
              ...teams.map((t) => ({
                id: teamCellKey(t.id, 'row'),
                cells: [
                  <TeamNameCell
                    key="who"
                    team={t}
                    pkg={teamPkgs.find((p) => p.team?.id === t.id)}
                  />,
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
        </div>
      )}

      {checks.length > 0 && (
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
      )}

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
