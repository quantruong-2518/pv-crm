import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ClipboardList,
  Icon,
  Target,
  TriangleAlert,
  Wallet,
  cn,
  percent,
  type IconGlyph,
} from '@pv/ui'
import {
  KPI_CLOSE_GATE_LIST_CAP,
  KPI_CLOSE_GATE_RULES,
  KPI_METRIC_LABEL,
  type KpiCloseGateCounts,
  type KpiCloseGateResponse,
  type KpiCloseGateSnapshot,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { kpiCloseGateQuery } from '@/data/kpi-close'
import { contributionHref } from '@/data/kpi-contributions'
import { ROLE_LABEL } from '@/data/users'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import {
  LAND_ON_STEP,
  TARGETS_PATH,
  monthQuery,
  targetsPath,
  teamPath,
  teamSuffix,
} from './kpi-allocate-model'
import { personHref, printValue } from './kpi-model'

/** The close gate (ADR 0116): what is still pending and what looks unusual,
 *  shown above the close button and asking for nothing; and, on a closed month,
 *  one line saying what the gate showed at the moment of closing.
 *
 *  A group shows a few rows; the rest are on the targets screen's waiting list.
 *  A row links only where the reader may open it, else it is plain text, and a
 *  link closes the dialog. Thresholds come from `KPI_CLOSE_GATE_RULES`. */

const LINK =
  'text-foreground tnum font-num pointer-coarse:min-h-12 inline-flex min-h-8 items-center text-[13px] underline underline-offset-2'

/** Each pending kind's words, once: the group title and the closed line's short form. */
const PENDING_WORDS: Record<keyof KpiCloseGateCounts, { title: string; short: string }> = {
  overdueReasons: { title: 'Lý do quá hạn chờ duyệt', short: 'lý do quá hạn chờ duyệt' },
  counters: { title: 'Đề xuất chưa trả lời', short: 'đề xuất chưa trả lời' },
  packagesSent: { title: 'Gói chỉ tiêu chờ duyệt', short: 'gói chờ duyệt' },
  packagesReturned: { title: 'Gói chỉ tiêu bị trả lại', short: 'gói bị trả lại' },
  packagesDraft: { title: 'Gói chỉ tiêu chưa gửi', short: 'gói chưa gửi' },
  targetsProposed: { title: 'Chỉ tiêu chờ duyệt', short: 'chỉ tiêu chờ duyệt' },
  setsNotSent: { title: 'Đơn vị chưa giao chỉ tiêu', short: 'đơn vị chưa giao' },
  setsByDefault: { title: 'Đơn vị giao mặc định', short: 'đơn vị giao mặc định' },
  peopleNotConfirmed: { title: 'Người chưa xác nhận chỉ tiêu', short: 'người chưa xác nhận' },
}

const R = KPI_CLOSE_GATE_RULES
const BIG_SHORT = 'hợp đồng lớn'
const LATE_SHORT = 'người ký dồn cuối tháng'

type Row = { key: string; text: string; href: string | null }
type Spec = {
  title: string
  icon: IconGlyph
  count: number
  rows: Row[]
  note?: string
  flag?: boolean
  /** The targets screen's waiting list holds this kind for the month, so the remainder links there. */
  listed?: boolean
}

function Group({
  spec,
  waitingHref,
  onNavigate,
}: {
  spec: Spec
  waitingHref: string | null
  onNavigate: () => void
}) {
  const shown = spec.rows.slice(0, KPI_CLOSE_GATE_LIST_CAP)
  const more = spec.count - shown.length
  const moreText = `Còn ${num(more)} mục khác`
  return (
    <section className="flex flex-col gap-1">
      <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold leading-5">
        <Icon icon={spec.icon} size={16} className={cn('shrink-0', spec.flag && 'text-warning')} />
        <span className="tnum font-num">
          {spec.title} · {num(spec.count)}
        </span>
      </h3>
      <ul className="m-0 flex list-none flex-col p-0 pl-6">
        {shown.map((r) => (
          <li key={r.key}>
            {r.href ? (
              <Link to={r.href} state={LAND_ON_STEP} onClick={onNavigate} className={LINK}>
                {r.text}
              </Link>
            ) : (
              <span className="tnum font-num text-[13px] leading-8">{r.text}</span>
            )}
          </li>
        ))}
      </ul>
      {more > 0 &&
        (waitingHref && spec.listed ? (
          <Link to={waitingHref} onClick={onNavigate} className={cn(LINK, 'ml-6 self-start')}>
            {moreText}
          </Link>
        ) : (
          <p className={cn(NOTE, 'tnum font-num m-0 pl-6')}>{moreText}.</p>
        ))}
      {spec.note && <p className={cn(NOTE, 'tnum font-num m-0 pl-6')}>{spec.note}</p>}
    </section>
  )
}

/** The gate above the close button; one line when nothing is pending or flagged. */
export function CloseGate({
  gate,
  onNavigate,
}: {
  gate: KpiCloseGateResponse
  onNavigate: () => void
}) {
  const canContract = useCan('contract.view')
  const seesAll = useCan('kpi.view-all')
  const { period, counts, pending, flags } = gate
  const toTargets = (role: Parameters<typeof targetsPath>[1], teamId?: string) =>
    seesAll ? targetsPath(period, role, teamId) : null
  const packageRows = (list: KpiCloseGateResponse['pending']['packagesSent']): Row[] =>
    list.map((p) => ({
      key: `${p.role}/${p.team?.id ?? 'room'}`,
      text: `${ROLE_LABEL[p.role]}${teamSuffix(p.team)}`,
      href: toTargets(p.role, p.team?.id),
    }))
  const W = PENDING_WORDS

  const specs: (Spec | null)[] = [
    pending.overdueReasons && {
      title: W.overdueReasons.title,
      icon: Wallet,
      count: counts.overdueReasons ?? 0,
      rows: pending.overdueReasons.map((r) => ({
        key: String(r.id),
        text: `Hợp đồng ${r.contractCode} · đợt ${r.installmentNo}`,
        href: canContract
          ? `/sales/contracts/${encodeURIComponent(r.contractCode)}/installments/${r.installmentNo}`
          : null,
      })),
      note: 'Chốt bây giờ thì tiền các đợt này tính là quá hạn.',
    },
    {
      title: W.counters.title,
      icon: Target,
      count: counts.counters,
      listed: true,
      rows: pending.counters.map((c) => ({
        key: c.id,
        text: `${c.name} · ${KPI_METRIC_LABEL[c.metricKey]}`,
        href: !seesAll ? null : c.team ? teamPath(c.team.id, period) : targetsPath(period, c.role),
      })),
    },
    {
      title: W.packagesSent.title,
      icon: ClipboardList,
      count: counts.packagesSent,
      listed: true,
      rows: packageRows(pending.packagesSent),
    },
    {
      title: W.packagesReturned.title,
      icon: ClipboardList,
      count: counts.packagesReturned,
      listed: true,
      rows: packageRows(pending.packagesReturned),
    },
    {
      title: W.packagesDraft.title,
      icon: ClipboardList,
      count: counts.packagesDraft,
      rows: packageRows(pending.packagesDraft),
    },
    {
      title: W.targetsProposed.title,
      icon: Target,
      count: counts.targetsProposed,
      listed: true,
      rows: pending.targetsProposed.map((t) => ({
        key: `${t.role}/${t.metricKey}`,
        text: `${ROLE_LABEL[t.role]} · ${KPI_METRIC_LABEL[t.metricKey]}`,
        href: toTargets(t.role),
      })),
    },
    {
      title: `Hợp đồng lớn hơn ${num(R.bigContractRatio)} lần giá trị trung bình`,
      icon: TriangleAlert,
      flag: true,
      count: flags.bigContracts.length,
      rows: flags.bigContracts.map((b) => ({
        key: b.code,
        text: `${b.code} · ${b.actor?.name ?? 'Chưa có người phụ trách'} · ${printValue('money', b.value, true)} · gấp ${num(b.ratio)} lần`,
        href: canContract ? contributionHref('contract', b.code) : null,
      })),
    },
    {
      title: 'Người ký dồn cuối tháng',
      icon: TriangleAlert,
      flag: true,
      count: flags.lateHeavy.length,
      rows: flags.lateHeavy.map((l) => ({
        key: l.actor.actorId,
        text: `${l.actor.name} · ${percent(l.share)}`,
        href: seesAll ? personHref(l.actor.actorId, period) : null,
      })),
      note: `Trên ${percent(R.lateShare)} doanh số ký trong ${num(R.lateDays)} ngày cuối tháng.`,
    },
  ]
  const groups = specs.filter((g): g is Spec => g !== null && g.count > 0)

  if (groups.length === 0) {
    return <p className={cn(NOTE, 'm-0')}>Không còn mục nào chờ xử lý.</p>
  }
  const waitingHref = seesAll ? `${TARGETS_PATH}${monthQuery(period)}` : null
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <Group key={g.title} spec={g} waitingHref={waitingHref} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

/** Non-zero parts only, in the gate's own words; the overdue part is null for a
 *  reader who may not approve reasons, so it drops out. */
function atCloseLine({ counts, bigContracts, lateHeavyActorIds }: KpiCloseGateSnapshot) {
  const keys = Object.keys(PENDING_WORDS) as (keyof KpiCloseGateCounts)[]
  const pending = keys.flatMap((k) => {
    const n = counts[k]
    return n ? [`${num(n)} ${PENDING_WORDS[k].short}`] : []
  })
  const flagged = [
    bigContracts.length > 0 && `${num(bigContracts.length)} ${BIG_SHORT}`,
    lateHeavyActorIds.length > 0 && `${num(lateHeavyActorIds.length)} ${LATE_SHORT}`,
  ].filter((p): p is string => typeof p === 'string')
  if (pending.length === 0) return flagged.length > 0 ? `Lúc chốt có ${flagged.join(', ')}` : null
  const head = `Lúc chốt còn ${pending.join(', ')}`
  return flagged.length > 0 ? `${head} · ${flagged.join(', ')}` : head
}

/** Beside a closed month's line, for a closer only: the gate read is theirs alone. */
export function GateAtClose({ period }: { period: string }) {
  const gate = useQuery(kpiCloseGateQuery(period, true))
  const line = gate.data?.atClose ? atCloseLine(gate.data.atClose) : null
  return line ? <p className={cn(NOTE, 'tnum font-num m-0')}>{line}</p> : null
}
