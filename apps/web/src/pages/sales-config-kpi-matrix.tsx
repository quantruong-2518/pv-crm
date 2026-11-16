import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, GlassCard, Select, Skeleton, cn, type BadgeProps } from '@pv/ui'
import {
  isKpiV2Period,
  stepSalesPeriod,
  type ApprovalState,
  type KpiMetricKey,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, translate, useI18n, type Lang } from '@/app/i18n'
import { kpiFunnelStepText, kpiLayerText, kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { toastDone } from '@/app/toast'
import { kpiRoleMetricsFor, useProposeKpiRoleMetrics } from '@/data/kpi-config'
import { orgTreeQuery } from '@/data/org-tree'
import { currentPick, periodLabel } from '@/data/period-pick'
import {
  CELL_LABEL,
  NEXT_STATE,
  checkRole,
  funnelRowsOf,
  monthsFrom,
  rowsOf,
  type CellState,
  type RoleCheck,
  type RoleDraft,
  type RoleEntry,
} from './sales-config-kpi-model'
import { FunnelBox, WeightBox, WeightTotal } from './sales-config-kpi-fields'
import { approvalStateCopy, sentCopy } from './sales-config-copy'

/** 5.16 — which metrics count for each role, and which one leads its card
 *  (ADR 0099 §1). A metric outside a role's catalog has no formula for that
 *  role, so its cell is a dash and takes no press.
 *
 *  From `lg` up, metrics × roles as one table with the name column pinned;
 *  below it, one role at a time picked from a list, so a phone or an upright
 *  tablet never scrolls the names away. Both views share one draft.
 *  Sent one role at a time (the write replaces the role's whole column); a
 *  sent column stays as sent and takes no more presses. A month picked above
 *  decides the catalog shown and the month the change applies from (ADR 0160 §2);
 *  from 01/2027 each counted metric also takes a weight and each role's funnel
 *  steps a target. */

const CELL = 'flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-md px-2 py-1'

const TONE: Record<CellState, string> = {
  primary: 'bg-primary/24 text-on-tint-primary font-semibold',
  on: 'bg-surface-ink/8 text-foreground font-medium',
  off: 'text-muted-foreground font-medium',
}

const CLASH = 'bg-warning/20 text-on-tint-warning font-semibold'
const SMALL = 'text-[11px] font-normal leading-4'
const ALERT = 'text-destructive-foreground m-0 text-[11.5px] leading-4'

const SENT_TONE: Record<ApprovalState, NonNullable<BadgeProps['tone']>> = {
  waiting: 'warning',
  approved: 'success',
  rejected: 'danger',
}

type Sent = { state: ApprovalState; changes: string[] }

/** What the column changes, worded for the line under it once sent. */
const changesOf = (check: RoleCheck, lang: Lang) => [
  ...[...check.changed].map(
    (k) => `${kpiMetricText(k, lang)}: ${translate(CELL_LABEL[check.cells.get(k) ?? 'on'], lang)}`,
  ),
  ...(check.weightsChanged ? [translate(message('Trọng số', 'Weights', '가중치'), lang)] : []),
  ...(check.funnelChanged
    ? [translate(message('Mục tiêu bước', 'Step targets', '단계 목표'), lang)]
    : []),
]

function Cell({
  metric,
  role,
  check,
  onPress,
}: {
  metric: KpiMetricKey
  role: RoleId
  check: RoleCheck | undefined
  /** Absent: read-only (no `config.propose`, or the column is sent). */
  onPress?: (now: CellState) => void
}) {
  const { t, lang } = useI18n()
  const state = check?.cells.get(metric)
  if (!check || !state) {
    return (
      <span className={cn(CELL, 'text-muted-foreground')}>
        <span aria-hidden>—</span>
        <span className="sr-only">
          {t(
            message(
              'Chỉ số này không thuộc vai trò',
              'This metric does not apply to the role',
              '이 지표는 해당 역할에 적용되지 않습니다',
            ),
          )}
        </span>
      </span>
    )
  }
  const clash = check.clashes.has(metric)
  const changed = check.changed.has(metric)
  const face = (
    <>
      {t(CELL_LABEL[state])}
      {clash ? (
        <span className={SMALL}>
          {t(message('Trùng chỉ số chính', 'Duplicate primary', '핵심 지표 중복'))}
        </span>
      ) : (
        changed && <span className={SMALL}>{t(message('Đã đổi', 'Changed', '변경됨'))}</span>
      )}
    </>
  )
  const look = cn(CELL, 'text-[12px] leading-4', clash ? CLASH : TONE[state])
  if (!onPress) return <span className={look}>{face}</span>
  const note = clash
    ? t(message(', trùng chỉ số chính', ', duplicate primary', ', 핵심 지표 중복'))
    : changed
      ? t(message(', đã đổi', ', changed', ', 변경됨'))
      : ''
  return (
    <button
      type="button"
      aria-label={`${kpiMetricText(metric, lang)}, ${kpiRoleText(role, lang)}: ${t(CELL_LABEL[state])}${note}`}
      onClick={() => onPress(state)}
      className={cn(look, 'motion-std hover:shadow-control')}
    >
      {face}
    </button>
  )
}

/** Under a column: what is wrong, the send, and once sent, what went and where it stands. */
function RoleSend({
  role,
  from,
  check,
  sent,
  onSent,
}: {
  role: RoleId
  from: KpiPeriodKey
  check: RoleCheck
  sent: Sent | undefined
  onSent: (state: ApprovalState) => void
}) {
  const { t } = useI18n()
  const propose = useProposeKpiRoleMetrics()
  const body = check.body
  if (sent) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge tone={SENT_TONE[sent.state]}>{t(approvalStateCopy(sent.state))}</Badge>
        <p className="text-muted-foreground m-0 text-[11.5px] leading-4">
          {t(message('Đã gửi', 'Submitted', '제출됨'))}: {sent.changes.join('; ')}.{' '}
          {t(
            message(
              `Áp dụng từ ${periodLabel(from)}.`,
              `Applies from ${periodLabel(from)}.`,
              `${periodLabel(from)}부터 적용됩니다.`,
            ),
          )}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-stretch gap-2">
      <WeightTotal check={check} />
      {check.dirty && check.problem && (
        <p role="alert" className={ALERT}>
          {check.problem}
        </p>
      )}
      {check.dirty && (
        <Button
          variant="secondary"
          size="sm"
          className="pointer-coarse:h-12 w-full"
          aria-label={t(
            message(
              `Gửi đề nghị cho ${kpiRoleText(role, 'vi')}`,
              `Submit proposal for ${kpiRoleText(role, 'en')}`,
              `${kpiRoleText(role, 'ko')} 변경 제안`,
            ),
          )}
          disabled={!body || propose.isPending}
          onClick={() =>
            body &&
            propose.mutate(body, {
              onSuccess: (receipt) => {
                onSent(receipt.state)
                toastDone(sentCopy())
              },
            })
          }
        >
          {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
        </Button>
      )}
      {propose.error && (
        <p role="alert" className={ALERT}>
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}

type TypeFn = (kind: 'weights' | 'funnel', key: string, value: string) => void

type ViewProps = {
  from: KpiPeriodKey
  roles: readonly RoleEntry[]
  checks: Map<RoleId, RoleCheck>
  sent: Partial<Record<RoleId, Sent>>
  canPropose: boolean
  pressOf: (role: RoleId) => ((metric: KpiMetricKey, now: CellState) => void) | undefined
  /** Absent: the boxes are read-only, as the cells are. */
  typeOf: (role: RoleId) => TypeFn | undefined
  onSent: (role: RoleId, state: ApprovalState) => void
}

/** `lg` and up: every role side by side, the metric names pinned to the left edge. */
function TableView({ from, roles, checks, sent, canPropose, pressOf, typeOf, onSent }: ViewProps) {
  const { t, lang } = useI18n()
  const pin = 'bg-card sticky left-0 z-[1]'
  const steps = isKpiV2Period(from) ? funnelRowsOf(roles) : []
  return (
    <div className="overflow-x-auto">
      <table className="min-w-4xl w-full table-fixed text-left text-[12px]">
        <thead>
          <tr className="text-muted-foreground text-[11.5px]">
            <th scope="col" className={cn(pin, 'w-48 px-2 py-2 font-medium')}>
              {t(message('Chỉ số', 'Metric', '지표'))}
            </th>
            {roles.map((r) => (
              <th key={r.role} scope="col" className="px-1 py-2 text-center font-semibold">
                {kpiRoleText(r.role, lang)}
              </th>
            ))}
          </tr>
        </thead>
        {rowsOf(roles).map(({ layer, keys }) => (
          <tbody key={layer}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={roles.length + 1}
                className="text-muted-foreground px-2 pb-1 pt-4 text-[11.5px] font-medium"
              >
                {kpiLayerText(layer, lang)}
              </th>
            </tr>
            {keys.map((key) => (
              <tr key={key}>
                <th scope="row" className={cn(pin, 'px-2 py-1 font-medium leading-5')}>
                  {kpiMetricText(key, lang)}
                </th>
                {roles.map(({ role }) => {
                  const press = pressOf(role)
                  const type = typeOf(role)
                  const check = checks.get(role)
                  return (
                    <td key={role} className="p-1">
                      <div className="flex flex-col gap-1">
                        <Cell
                          metric={key}
                          role={role}
                          check={check}
                          onPress={press && ((now) => press(key, now))}
                        />
                        {check && (
                          <WeightBox
                            metric={key}
                            role={role}
                            check={check}
                            onType={type && ((v) => type('weights', key, v))}
                          />
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        ))}
        {steps.length > 0 && (
          <tbody>
            <tr>
              <th
                scope="rowgroup"
                colSpan={roles.length + 1}
                className="text-muted-foreground px-2 pb-1 pt-4 text-[11.5px] font-medium"
              >
                {t(message('Mục tiêu bước', 'Step targets', '단계 목표'))}
              </th>
            </tr>
            {steps.map((step) => (
              <tr key={step}>
                <th scope="row" className={cn(pin, 'px-2 py-1 font-medium leading-5')}>
                  {kpiFunnelStepText(step, lang)}
                </th>
                {roles.map(({ role }) => {
                  const type = typeOf(role)
                  const check = checks.get(role)
                  return (
                    <td key={role} className="p-1">
                      {check && (
                        <FunnelBox
                          step={step}
                          role={role}
                          check={check}
                          onType={type && ((v) => type('funnel', step, v))}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        )}
        {canPropose && (
          <tfoot>
            <tr>
              <td className={pin} />
              {roles.map(({ role }) => {
                const check = checks.get(role)
                return (
                  <td key={role} className="px-1 pt-3 align-top">
                    {check && (
                      <RoleSend
                        role={role}
                        from={from}
                        check={check}
                        sent={sent[role]}
                        onSent={(state) => onSent(role, state)}
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/** Below `lg`: one role's metrics as a list, the role picked above it. */
function OneRoleView({
  from,
  roles,
  checks,
  sent,
  canPropose,
  pressOf,
  typeOf,
  onSent,
}: ViewProps) {
  const { t, lang } = useI18n()
  const [picked, setPicked] = useState<RoleId | undefined>(roles[0]?.role)
  const entry = roles.find((r) => r.role === picked) ?? roles[0]
  const check = entry && checks.get(entry.role)
  if (!entry || !check) return null
  const press = pressOf(entry.role)
  const type = typeOf(entry.role)
  return (
    <div className="flex flex-col gap-4">
      <Select
        label={t(message('Vai trò', 'Role', '역할'))}
        size="lg"
        className="w-full"
        value={entry.role}
        options={roles.map((r) => ({ value: r.role, label: kpiRoleText(r.role, lang) }))}
        onChange={(role) => setPicked(role as RoleId)}
      />
      {rowsOf([entry]).map(({ layer, keys }) => (
        <section key={layer} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground m-0 text-[11.5px] font-medium">
            {kpiLayerText(layer, lang)}
          </h3>
          <ul className="m-0 flex flex-col gap-2 p-0">
            {keys.map((key) => (
              <li key={key} className="grid grid-cols-[minmax(0,1fr)_144px] items-center gap-3">
                <span className="text-[12.5px] font-medium leading-5">
                  {kpiMetricText(key, lang)}
                </span>
                <span className="flex flex-col gap-1">
                  <Cell
                    metric={key}
                    role={entry.role}
                    check={check}
                    onPress={press && ((now) => press(key, now))}
                  />
                  <WeightBox
                    metric={key}
                    role={entry.role}
                    check={check}
                    onType={type && ((v) => type('weights', key, v))}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {check.funnel.size > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground m-0 text-[11.5px] font-medium">
            {t(message('Mục tiêu bước', 'Step targets', '단계 목표'))}
          </h3>
          <ul className="m-0 flex flex-col gap-2 p-0">
            {[...check.funnel.keys()].map((step) => (
              <li key={step} className="grid grid-cols-[minmax(0,1fr)_144px] items-center gap-3">
                <span className="text-[12.5px] font-medium leading-5">
                  {kpiFunnelStepText(step, lang)}
                </span>
                <FunnelBox
                  step={step}
                  role={entry.role}
                  check={check}
                  onType={type && ((v) => type('funnel', step, v))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {canPropose && (
        <RoleSend
          role={entry.role}
          from={from}
          check={check}
          sent={sent[entry.role]}
          onSent={(state) => onSent(entry.role, state)}
        />
      )}
    </div>
  )
}

function Matrix({ from, roles }: { from: KpiPeriodKey; roles: readonly RoleEntry[] }) {
  const { t, lang } = useI18n()
  const canPropose = useCan('config.propose')
  const [drafts, setDrafts] = useState<Partial<Record<RoleId, RoleDraft>>>({})
  const [sent, setSent] = useState<Partial<Record<RoleId, Sent>>>({})
  const checks = new Map(roles.map((r) => [r.role, checkRole(r, drafts[r.role] ?? {}, from)]))
  const editable = (role: RoleId) => canPropose && !sent[role]

  const pressOf = (role: RoleId) =>
    editable(role)
      ? (metric: KpiMetricKey, now: CellState) =>
          setDrafts((prev) => ({
            ...prev,
            [role]: { ...prev[role], cells: { ...prev[role]?.cells, [metric]: NEXT_STATE[now] } },
          }))
      : undefined
  const typeOf = (role: RoleId): TypeFn | undefined =>
    editable(role)
      ? (kind, key, value) =>
          setDrafts((prev) => ({
            ...prev,
            [role]: { ...prev[role], [kind]: { ...prev[role]?.[kind], [key]: value } },
          }))
      : undefined
  /* The draft is kept: the column goes on showing what was sent. */
  const onSent = (role: RoleId, state: ApprovalState) => {
    const check = checks.get(role)
    setSent((prev) => ({
      ...prev,
      [role]: { state, changes: check ? changesOf(check, lang) : [] },
    }))
  }
  const view = { from, roles, checks, sent, canPropose, pressOf, typeOf, onSent }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="lg:hidden">
        <OneRoleView {...view} />
      </div>
      <div className="hidden lg:block">
        <TableView {...view} />
      </div>
      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
        {canPropose &&
          `${t(
            message(
              'Bấm vào ô để đổi: Có tính → Không tính → Chỉ số chính.',
              'Press a cell to change it: Counted → Not counted → Primary metric.',
              '셀을 눌러 변경합니다: 반영 → 미반영 → 핵심 지표.',
            ),
          )} `}
        {t(
          message(
            'Dấu — là chỉ số này không thuộc vai trò.',
            'A dash means the metric does not apply to the role.',
            '— 표시는 해당 역할에 적용되지 않는 지표입니다.',
          ),
        )}
      </p>
      {canPropose && (
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
          {t(
            message(
              'Mục tiêu bước tính theo % của bước trước; để trống là không đặt.',
              'A step target is a % of the step before; leave it empty for none.',
              '단계 목표는 이전 단계 대비 %이며, 비워 두면 설정하지 않습니다.',
            ),
          )}
          {Array.from(checks.values()).some((c) => c.weighable) &&
            ` ${t(
              message(
                'Trọng số để trống thì dùng mức chia sẵn.',
                'An empty weight uses the default split.',
                '가중치를 비워 두면 기본 배분을 사용합니다.',
              ),
            )}`}
        </p>
      )}
    </GlassCard>
  )
}

/** A UI limit, not a rule: the server refuses only months earlier than next month. */
const MONTHS_AHEAD = 12

export function KpiMetricMatrix() {
  const { t } = useI18n()
  const canView = useCan('kpi.view')
  const running = currentPick().month
  const tree = useQuery({ ...orgTreeQuery(running), enabled: canView })
  /* The server names the month a change lands on, so this picker and the org
     section below it open on the same month whatever this device's clock says. */
  const next = tree.data?.editableFrom ?? stepSalesPeriod(running, 1)
  const [picked, setFrom] = useState<string | null>(null)
  const from = picked ?? next
  const { data, error, refetch } = useQuery(kpiRoleMetricsFor(from))
  /* A change applies from next month at the earliest, so no earlier month is offered. */
  const months = monthsFrom(next, MONTHS_AHEAD)
  return (
    <div className="flex flex-col gap-4">
      <Select
        label={t(message('Áp dụng từ tháng', 'Applies from', '적용 시작 월'))}
        size="lg"
        className="w-full sm:w-64"
        value={from}
        options={months.map((m) => ({ value: m, label: periodLabel(m) }))}
        onChange={setFrom}
      />
      {data ? (
        <Matrix key={from} from={from} roles={data.roles} />
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className={ALERT}>
            {t(
              message(
                'Không tải được chỉ số theo vai trò.',
                'Could not load metrics by role.',
                '역할별 지표를 불러오지 못했습니다.',
              ),
            )}{' '}
            {isApiError(error) ? userMessage(error) : ''}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void refetch()}
          >
            {t(message('Thử lại', 'Try again', '다시 시도'))}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  )
}
