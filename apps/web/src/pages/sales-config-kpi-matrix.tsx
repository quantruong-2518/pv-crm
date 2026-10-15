import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, GlassCard, Select, Skeleton, cn, type BadgeProps } from '@pv/ui'
import {
  APPROVAL_STATE_LABEL,
  KPI_LAYER_LABEL,
  KPI_METRIC_LABEL,
  ROLE_LABEL,
  type ApprovalState,
  type KpiMetricKey,
  type RoleId,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { kpiRoleMetricsQuery, useProposeKpiRoleMetrics } from '@/data/kpi-config'
import {
  CELL_LABEL,
  NEXT_STATE,
  checkRole,
  rowsOf,
  type CellState,
  type RoleCheck,
  type RoleDraft,
  type RoleEntry,
} from './sales-config-kpi-model'
import { SENT } from './sales-config-section'

/** 5.16 — which metrics count for each role, and which one leads its card
 *  (ADR 0099 §1). A metric outside a role's catalog has no formula for that
 *  role, so its cell is a dash and takes no press.
 *
 *  From `lg` up, metrics × roles as one table with the name column pinned;
 *  below it, one role at a time picked from a list, so a phone or an upright
 *  tablet never scrolls the names away. Both views share one draft.
 *  Sent one role at a time (the write replaces the role's whole column); a
 *  sent column stays as sent and takes no more presses. */

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
const changesOf = (check: RoleCheck) =>
  [...check.changed].map((k) => `${KPI_METRIC_LABEL[k]}: ${CELL_LABEL[check.cells.get(k) ?? 'on']}`)

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
  const state = check?.cells.get(metric)
  if (!check || !state) {
    return (
      <span className={cn(CELL, 'text-muted-foreground')}>
        <span aria-hidden>—</span>
        <span className="sr-only">Chỉ số này không thuộc vai trò</span>
      </span>
    )
  }
  const clash = check.clashes.has(metric)
  const changed = check.changed.has(metric)
  const face = (
    <>
      {CELL_LABEL[state]}
      {clash ? (
        <span className={SMALL}>Trùng chỉ số chính</span>
      ) : (
        changed && <span className={SMALL}>Đã đổi</span>
      )}
    </>
  )
  const look = cn(CELL, 'text-[12px] leading-4', clash ? CLASH : TONE[state])
  if (!onPress) return <span className={look}>{face}</span>
  const note = clash ? ', trùng chỉ số chính' : changed ? ', đã đổi' : ''
  return (
    <button
      type="button"
      aria-label={`${KPI_METRIC_LABEL[metric]}, ${ROLE_LABEL[role]}: ${CELL_LABEL[state]}${note}`}
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
  check,
  sent,
  onSent,
}: {
  role: RoleId
  check: RoleCheck
  sent: Sent | undefined
  onSent: (state: ApprovalState) => void
}) {
  const propose = useProposeKpiRoleMetrics()
  const body = check.body
  if (sent) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge tone={SENT_TONE[sent.state]}>{APPROVAL_STATE_LABEL[sent.state]}</Badge>
        <p className="text-muted-foreground m-0 text-[11.5px] leading-4">
          Đã gửi: {sent.changes.join('; ')}.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-stretch gap-2">
      {check.changed.size > 0 && check.problem && (
        <p role="alert" className={ALERT}>
          {check.problem}
        </p>
      )}
      {check.changed.size > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="pointer-coarse:h-12 w-full"
          aria-label={`Gửi đề nghị cho ${ROLE_LABEL[role]}`}
          disabled={!body || propose.isPending}
          onClick={() =>
            body &&
            propose.mutate(body, {
              onSuccess: (receipt) => {
                onSent(receipt.state)
                toastDone(SENT)
              },
            })
          }
        >
          Gửi đề nghị
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

type ViewProps = {
  roles: readonly RoleEntry[]
  checks: Map<RoleId, RoleCheck>
  sent: Partial<Record<RoleId, Sent>>
  canPropose: boolean
  pressOf: (role: RoleId) => ((metric: KpiMetricKey, now: CellState) => void) | undefined
  onSent: (role: RoleId, state: ApprovalState) => void
}

/** `lg` and up: every role side by side, the metric names pinned to the left edge. */
function TableView({ roles, checks, sent, canPropose, pressOf, onSent }: ViewProps) {
  const pin = 'bg-card sticky left-0 z-[1]'
  return (
    <div className="overflow-x-auto">
      <table className="min-w-4xl w-full table-fixed text-left text-[12px]">
        <thead>
          <tr className="text-muted-foreground text-[11.5px]">
            <th scope="col" className={cn(pin, 'w-48 px-2 py-2 font-medium')}>
              Chỉ số
            </th>
            {roles.map((r) => (
              <th key={r.role} scope="col" className="px-1 py-2 text-center font-semibold">
                {ROLE_LABEL[r.role]}
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
                {KPI_LAYER_LABEL[layer]}
              </th>
            </tr>
            {keys.map((key) => (
              <tr key={key}>
                <th scope="row" className={cn(pin, 'px-2 py-1 font-medium leading-5')}>
                  {KPI_METRIC_LABEL[key]}
                </th>
                {roles.map(({ role }) => {
                  const press = pressOf(role)
                  return (
                    <td key={role} className="p-1">
                      <Cell
                        metric={key}
                        role={role}
                        check={checks.get(role)}
                        onPress={press && ((now) => press(key, now))}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        ))}
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
function OneRoleView({ roles, checks, sent, canPropose, pressOf, onSent }: ViewProps) {
  const [picked, setPicked] = useState<RoleId | undefined>(roles[0]?.role)
  const entry = roles.find((r) => r.role === picked) ?? roles[0]
  const check = entry && checks.get(entry.role)
  if (!entry || !check) return null
  const press = pressOf(entry.role)
  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Vai trò"
        size="lg"
        className="w-full"
        value={entry.role}
        options={roles.map((r) => ({ value: r.role, label: ROLE_LABEL[r.role] }))}
        onChange={(role) => setPicked(role as RoleId)}
      />
      {rowsOf([entry]).map(({ layer, keys }) => (
        <section key={layer} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground m-0 text-[11.5px] font-medium">
            {KPI_LAYER_LABEL[layer]}
          </h3>
          <ul className="m-0 flex flex-col gap-2 p-0">
            {keys.map((key) => (
              <li key={key} className="grid grid-cols-[minmax(0,1fr)_144px] items-center gap-3">
                <span className="text-[12.5px] font-medium leading-5">{KPI_METRIC_LABEL[key]}</span>
                <Cell
                  metric={key}
                  role={entry.role}
                  check={check}
                  onPress={press && ((now) => press(key, now))}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {canPropose && (
        <RoleSend
          role={entry.role}
          check={check}
          sent={sent[entry.role]}
          onSent={(state) => onSent(entry.role, state)}
        />
      )}
    </div>
  )
}

function Matrix({ roles }: { roles: readonly RoleEntry[] }) {
  const canPropose = useCan('config.propose')
  const [drafts, setDrafts] = useState<Partial<Record<RoleId, RoleDraft>>>({})
  const [sent, setSent] = useState<Partial<Record<RoleId, Sent>>>({})
  const checks = new Map(roles.map((r) => [r.role, checkRole(r, drafts[r.role] ?? {})]))

  const pressOf = (role: RoleId) =>
    canPropose && !sent[role]
      ? (metric: KpiMetricKey, now: CellState) =>
          setDrafts((prev) => ({ ...prev, [role]: { ...prev[role], [metric]: NEXT_STATE[now] } }))
      : undefined
  /* The draft is kept: the column goes on showing what was sent. */
  const onSent = (role: RoleId, state: ApprovalState) => {
    const check = checks.get(role)
    setSent((prev) => ({ ...prev, [role]: { state, changes: check ? changesOf(check) : [] } }))
  }
  const view = { roles, checks, sent, canPropose, pressOf, onSent }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="lg:hidden">
        <OneRoleView {...view} />
      </div>
      <div className="hidden lg:block">
        <TableView {...view} />
      </div>
      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
        {canPropose && 'Bấm vào ô để đổi: Có tính → Không tính → Chỉ số chính. '}
        Dấu — là chỉ số này không thuộc vai trò.
      </p>
    </GlassCard>
  )
}

export function KpiMetricMatrix() {
  const { data, error, refetch } = useQuery(kpiRoleMetricsQuery)
  if (data) return <Matrix roles={data.roles} />
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className={ALERT}>
          Không tải được chỉ số theo vai trò. {isApiError(error) ? userMessage(error) : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-12"
          onClick={() => void refetch()}
        >
          Thử lại
        </Button>
      </div>
    )
  }
  return <Skeleton className="h-64 w-full" />
}
