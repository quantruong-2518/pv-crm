import { useState } from 'react'
import { Badge, Button, GlassCard, Input, cn } from '@pv/ui'
import {
  KpiProposeBody,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiMetricTarget,
  type KpiRoleTargets,
} from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { useAgreeKpiTargets, useProposeKpiTargets } from '@/data/kpi'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiLayerText, kpiMetricText, kpiRoleText, kpiVerdictText } from '@/data/kpi-i18n'
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

const readColumns = (t: (copy: Message) => string): StackColumn[] => [
  { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.6fr)' },
  {
    header: t(message('Chỉ tiêu đã duyệt', 'Approved target', '승인된 목표')),
    width: 'minmax(0,1.2fr)',
  },
  { header: t(message('Người duyệt', 'Approved by', '승인자')), width: 'minmax(0,1.2fr)' },
  {
    header: t(message('Đề nghị chờ duyệt', 'Proposal awaiting approval', '승인 대기 제안')),
    width: 'minmax(0,1.4fr)',
  },
]
/* The floor fits a full dong figure ("1.500.000.000") beside its unit word. */
const writeColumn = (t: (copy: Message) => string): StackColumn => ({
  header: t(message('Đề nghị mới', 'New proposal', '새 제안')),
  width: 'minmax(168px,1.2fr)',
  stack: 'wide',
})

const TWO_LINES = 'flex min-w-0 flex-col gap-1'
const NOTE_NUM = cn(NOTE, 'tnum font-num')

type Draft = Partial<Record<KpiMetricKey, string>>
type Line = { def: KpiMetricDef; target: KpiMetricTarget }

function readCells({ def, target }: Line, t: (copy: Message) => string) {
  const { agreed, pending } = target
  return [
    <span key="metric" className={TWO_LINES}>
      <span className="font-semibold">{kpiMetricText(def.key)}</span>
      <span className={NOTE}>{kpiLayerText(def.layer)}</span>
    </span>,
    agreed ? (
      <span key="agreed" className={TWO_LINES}>
        <span className="tnum font-num font-semibold">{printValue(def.unit, agreed.value)}</span>
        <span className={NOTE_NUM}>
          {t(
            message(
              `Lần duyệt ${num(agreed.version)}`,
              `Approval ${num(agreed.version)}`,
              `승인 ${num(agreed.version)}차`,
            ),
          )}
        </span>
      </span>
    ) : (
      <span key="agreed" className="text-muted-foreground">
        {pending ? t(message('Chưa duyệt', 'Not approved', '미승인')) : kpiVerdictText('unset')}
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
      ? translate(
          message(
            'Đề nghị vừa thay đổi. Bảng đã tải lại, xem lại rồi thao tác.',
            'The proposal just changed. The table has reloaded; review it and try again.',
            '제안이 방금 변경되었습니다. 표를 다시 불러왔으니 확인 후 다시 진행하세요.',
          ),
        )
      : userMessage(error),
  )

export function RoleTargets({
  catalog,
  period,
  entry,
  canSet,
  me,
}: {
  catalog: KpiCatalog
  period: string
  entry: KpiRoleTargets
  /** Holds `kpi.set-target` AND the month still takes writes. */
  canSet: boolean
  /** The reader's actor id: the server refuses approving your own proposal. */
  me: string | undefined
}) {
  const { t } = useI18n()
  const propose = useProposeKpiTargets(period, entry.role)
  const agree = useAgreeKpiTargets(period, entry.role)
  const [draft, setDraft] = useState<Draft>({})

  const lines = catalog[entry.role].flatMap((def) =>
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
        aria-label={t(
          message(
            `Đề nghị mới cho ${kpiMetricText(def.key)}`,
            `New proposal for ${kpiMetricText(def.key)}`,
            `${kpiMetricText(def.key)} 새 제안`,
          ),
        )}
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
        <h3 className="font-display text-[14px] font-semibold">{kpiRoleText(entry.role)}</h3>
        {seen.length > 0 && (
          <Badge tone="warning">{t(message('Chờ duyệt', 'Awaiting approval', '승인 대기'))}</Badge>
        )}
      </div>

      <StackTable
        from="lg"
        flush
        rowHeight="min-h-14 py-2"
        tableClassName={canSet ? 'min-w-5xl' : 'min-w-3xl'}
        columns={canSet ? [...readColumns(t), writeColumn(t)] : readColumns(t)}
        rows={lines.map((line) => ({
          id: line.def.key,
          cells: canSet ? [...readCells(line, t), field(line)] : readCells(line, t),
        }))}
      />

      {canSet && (
        <div className="flex flex-wrap items-center justify-end gap-3 px-5">
          {/* In words, so a refused field is not told by its red ring alone. */}
          <div className="mr-auto flex min-w-0 flex-col gap-1">
            <p className={NOTE}>
              {t(
                message(
                  'Hàng nghìn ngăn bằng dấu chấm, số lẻ dùng dấu phẩy. Tỷ lệ nhập theo phần trăm, tối đa 100.',
                  'Separate thousands with a period and decimals with a comma. Enter rates as percentages, up to 100.',
                  '천 단위는 마침표, 소수점은 쉼표로 입력하세요. 비율은 퍼센트로 입력하며 최대 100입니다.',
                ),
              )}
            </p>
            {mine && (
              <p className={NOTE}>
                {t(
                  message(
                    'Bạn gửi đề nghị này nên không tự duyệt được. Cần người khác duyệt.',
                    'You sent this proposal, so you cannot approve it yourself. Someone else must approve it.',
                    '직접 보낸 제안이므로 스스로 승인할 수 없습니다. 다른 사람의 승인이 필요합니다.',
                  ),
                )}
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
                  {
                    onSuccess: () =>
                      toastDone(
                        t(message('Đã duyệt chỉ tiêu', 'Targets approved', '목표를 승인했습니다')),
                      ),
                    onError: failed,
                  },
                )
              }
            >
              {t(message('Duyệt chỉ tiêu', 'Approve targets', '목표 승인'))}
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
                  toastDone(
                    t(
                      message(
                        'Đã gửi đề nghị · chờ duyệt.',
                        'Proposal sent · awaiting approval.',
                        '제안을 보냈습니다 · 승인 대기 중.',
                      ),
                    ),
                  )
                },
                onError: failed,
              })
            }
          >
            {t(message('Gửi đề nghị', 'Send proposal', '제안 보내기'))}
          </Button>
        </div>
      )}
    </GlassCard>
  )
}
