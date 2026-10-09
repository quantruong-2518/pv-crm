import { useState } from 'react'
import { Badge, Button, DataTable, GlassCard, Input, cn, type TableColumn } from '@pv/ui'
import {
  KPI_CATALOG,
  KPI_LAYER_LABEL,
  KPI_METRIC_LABEL,
  KPI_VERDICT_LABEL,
  KpiProposeBody,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiMetricTarget,
  type KpiRoleTargets,
} from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useAgreeKpiTargets, useProposeKpiTargets } from '@/data/kpi'
import { ROLE_LABEL } from '@/data/users'
import { dmhm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { DASH, UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** The target table of one role: what is approved, what is pending, and — for
 *  a `kpi.set-target` holder on an open month — a field per metric to send a
 *  new value.
 *
 *  Everyone with the screen reads the table; only the fields and the two
 *  buttons are gated. A field left empty is not sent, so a proposal can move
 *  one metric and leave the others as approved. Approving sends the pending
 *  rows as they stand on screen, so the server never locks an unseen value. */

const READ_COLUMNS: TableColumn[] = [
  { header: 'Chỉ số', width: 'minmax(0,1.6fr)' },
  { header: 'Chỉ tiêu đã duyệt', width: 'minmax(0,1.2fr)' },
  { header: 'Người duyệt', width: 'minmax(0,1.2fr)' },
  { header: 'Đề nghị chờ duyệt', width: 'minmax(0,1.4fr)' },
]
/* The floor fits a full dong figure ("1.500.000.000") beside its unit word. */
const WRITE_COLUMN: TableColumn = { header: 'Đề nghị mới', width: 'minmax(168px,1.2fr)' }

const TWO_LINES = 'flex min-w-0 flex-col gap-1'
const NOTE_NUM = cn(NOTE, 'tnum font-num')

type Draft = Partial<Record<KpiMetricKey, string>>
type Line = { def: KpiMetricDef; target: KpiMetricTarget }

function readCells({ def, target }: Line) {
  const { agreed, pending } = target
  return [
    <span key="metric" className={TWO_LINES}>
      <span className="font-semibold">{KPI_METRIC_LABEL[def.key]}</span>
      <span className={NOTE}>{KPI_LAYER_LABEL[def.layer]}</span>
    </span>,
    agreed ? (
      <span key="agreed" className={TWO_LINES}>
        <span className="tnum font-num font-semibold">{printValue(def.unit, agreed.value)}</span>
        <span className={NOTE_NUM}>Phiên bản {num(agreed.version)}</span>
      </span>
    ) : (
      <span key="agreed" className="text-muted-foreground">
        {pending ? 'Chưa duyệt' : KPI_VERDICT_LABEL.unset}
      </span>
    ),
    agreed ? (
      <span key="by" className={TWO_LINES}>
        <span className="truncate">{agreed.agreedBy.name}</span>
        <span className={NOTE_NUM}>{dmhm(agreed.agreedAt)}</span>
      </span>
    ) : (
      DASH
    ),
    pending ? (
      <span key="pending" className={TWO_LINES}>
        <span className="tnum font-num font-semibold">{printValue(def.unit, pending.value)}</span>
        <span className={NOTE_NUM}>
          {pending.proposedBy.name} · {dmhm(pending.proposedAt)}
        </span>
      </span>
    ) : (
      DASH
    ),
  ]
}

/** The filled fields as a request body; null while any of them is not a number. */
function bodyOf(lines: Line[], draft: Draft): KpiProposeBody | null {
  const targets = lines.flatMap(({ def }) => {
    const value = parseTyped(def.unit, draft[def.key] ?? '')
    return value === undefined ? [] : [{ key: def.key, value }]
  })
  const body = KpiProposeBody.safeParse({ targets })
  return body.success ? body.data : null
}

/** A 409 is not the reader's mistake: the table moved under them, and the
 *  query file is already refetching it. */
const failed = (error: ApiError) =>
  toastFail(
    error.kind === 'conflict'
      ? 'Đề nghị vừa thay đổi sau khi bạn mở bảng. Bảng đã tải lại, hãy xem lại rồi thao tác.'
      : userMessage(error),
  )

export function RoleTargets({
  period,
  entry,
  canSet,
  me,
}: {
  period: string
  entry: KpiRoleTargets
  /** Holds `kpi.set-target` AND the month still takes writes. */
  canSet: boolean
  /** The reader's actor id: the server refuses approving your own proposal. */
  me: string | undefined
}) {
  const propose = useProposeKpiTargets(period, entry.role)
  const agree = useAgreeKpiTargets(period, entry.role)
  const [draft, setDraft] = useState<Draft>({})

  const lines = KPI_CATALOG[entry.role].flatMap((def) =>
    entry.metrics.filter((m) => m.key === def.key).map((target) => ({ def, target })),
  )
  const seen = lines.flatMap(({ def, target }) =>
    target.pending ? [{ key: def.key, proposedAt: target.pending.proposedAt }] : [],
  )
  const mine = lines.some((l) => l.target.pending?.proposedBy.actorId === me)
  const body = bodyOf(lines, draft)
  const busy = propose.isPending || agree.isPending

  const field = ({ def }: Line) => (
    <span key="field" className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        aria-label={`Đề nghị mới cho ${KPI_METRIC_LABEL[def.key]}`}
        className="pointer-coarse:h-12 tnum font-num text-right"
        value={draft[def.key] ?? ''}
        invalid={parseTyped(def.unit, draft[def.key] ?? '') === null}
        onChange={(e) => setDraft({ ...draft, [def.key]: e.target.value })}
      />
      <span className={cn(NOTE, 'w-8 shrink-0')}>{UNIT_WORD[def.unit]}</span>
    </span>
  )

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5">
        <h3 className="font-display text-[14px] font-semibold">{ROLE_LABEL[entry.role]}</h3>
        {seen.length > 0 && <Badge tone="warning">Chờ duyệt</Badge>}
      </div>

      <div className="overflow-x-auto">
        <DataTable
          flush
          rowHeight="min-h-14 py-2"
          className={canSet ? 'min-w-5xl' : 'min-w-3xl'}
          columns={canSet ? [...READ_COLUMNS, WRITE_COLUMN] : READ_COLUMNS}
          rows={lines.map((line) => ({
            id: line.def.key,
            cells: canSet ? [...readCells(line), field(line)] : readCells(line),
          }))}
        />
      </div>

      {canSet && (
        <div className="flex flex-wrap items-center justify-end gap-3 px-5">
          {/* In words, so a refused field is not told by its red ring alone. */}
          <div className="mr-auto flex min-w-0 flex-col gap-1">
            <p className={NOTE}>
              Cách nhập: hàng nghìn ngăn bằng dấu chấm, số lẻ dùng dấu phẩy, tỷ lệ nhập theo phần
              trăm và không quá 100.
            </p>
            {mine && (
              <p className={NOTE}>
                Bạn gửi đề nghị này nên không tự duyệt được. Cần một người khác có quyền duyệt chỉ
                tiêu.
              </p>
            )}
          </div>
          {seen.length > 0 && (
            <Button
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={mine || busy}
              onClick={() =>
                agree.mutate(
                  { seen },
                  { onSuccess: () => toastDone('Đã duyệt chỉ tiêu'), onError: failed },
                )
              }
            >
              Duyệt chỉ tiêu
            </Button>
          )}
          <Button
            className="pointer-coarse:h-12"
            disabled={body === null || busy}
            onClick={() =>
              body &&
              propose.mutate(body, {
                onSuccess: () => {
                  setDraft({})
                  toastDone('Đã gửi đề nghị · chờ duyệt.')
                },
                onError: failed,
              })
            }
          >
            Gửi đề nghị
          </Button>
        </div>
      )}
    </GlassCard>
  )
}
