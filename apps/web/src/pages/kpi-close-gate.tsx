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
  type KpiCloseGateCounts,
  type KpiCloseGateResponse,
  type KpiCloseGateSnapshot,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { kpiCloseGateQuery } from '@/data/kpi-close'
import { contributionHref } from '@/data/kpi-contributions'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
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
const words = (title: Message, short: Message) => ({ title, short })
const PENDING_WORDS: Record<keyof KpiCloseGateCounts, { title: Message; short: Message }> = {
  overdueReasons: words(
    message(
      'Lý do quá hạn chờ duyệt',
      'Overdue reasons awaiting approval',
      '승인 대기 중인 연체 사유',
    ),
    message('lý do quá hạn chờ duyệt', 'overdue reasons awaiting approval', '승인 대기 연체 사유'),
  ),
  counters: words(
    message('Đề xuất chưa trả lời', 'Unanswered proposals', '미회신 제안'),
    message('đề xuất chưa trả lời', 'unanswered proposals', '미회신 제안'),
  ),
  packagesSent: words(
    message('Gói chỉ tiêu chờ duyệt', 'Target packages awaiting approval', '승인 대기 목표 패키지'),
    message('gói chờ duyệt', 'packages awaiting approval', '승인 대기 패키지'),
  ),
  packagesReturned: words(
    message('Gói chỉ tiêu bị trả lại', 'Returned target packages', '반려된 목표 패키지'),
    message('gói bị trả lại', 'returned packages', '반려된 패키지'),
  ),
  packagesDraft: words(
    message('Gói chỉ tiêu chưa gửi', 'Unsent target packages', '미발송 목표 패키지'),
    message('gói chưa gửi', 'unsent packages', '미발송 패키지'),
  ),
  targetsProposed: words(
    message('Chỉ tiêu chờ duyệt', 'Targets awaiting approval', '승인 대기 목표'),
    message('chỉ tiêu chờ duyệt', 'targets awaiting approval', '승인 대기 목표'),
  ),
  setsNotSent: words(
    message('Đơn vị chưa giao chỉ tiêu', 'Units yet to assign targets', '목표 미배정 단위'),
    message('đơn vị chưa giao', 'units yet to assign', '미배정 단위'),
  ),
  setsByDefault: words(
    message('Đơn vị giao mặc định', 'Units assigned by default', '기본값으로 배정된 단위'),
    message('đơn vị giao mặc định', 'units assigned by default', '기본값으로 배정된 단위'),
  ),
  peopleNotConfirmed: words(
    message('Người chưa xác nhận chỉ tiêu', 'People yet to confirm targets', '목표 미확인 인원'),
    message('người chưa xác nhận', 'people yet to confirm', '미확인 인원'),
  ),
}

const R = KPI_CLOSE_GATE_RULES
const BIG_SHORT = message('hợp đồng lớn', 'large contracts', '대형 계약')
const LATE_SHORT = message(
  'người ký dồn cuối tháng',
  'end-of-month signers',
  '월말 집중 계약 담당자',
)

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
  const { t } = useI18n()
  const shown = spec.rows.slice(0, KPI_CLOSE_GATE_LIST_CAP)
  const more = spec.count - shown.length
  const moreText = t(
    message(`Còn ${num(more)} mục khác`, `${num(more)} more items`, `외 ${num(more)}건`),
  )
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

type Say = (copy: Message) => string

/** The two "looks unusual" groups: contracts far above the average, and signers bunched at month end. */
function flagSpecs(
  flags: KpiCloseGateResponse['flags'],
  t: Say,
  { canContract, seesAll, period }: { canContract: boolean; seesAll: boolean; period: string },
): Spec[] {
  return [
    {
      title: t(
        message(
          `Hợp đồng lớn hơn ${num(R.bigContractRatio)} lần giá trị trung bình`,
          `Contracts more than ${num(R.bigContractRatio)}× the average value`,
          `평균 금액의 ${num(R.bigContractRatio)}배를 넘는 계약`,
        ),
      ),
      icon: TriangleAlert,
      flag: true,
      count: flags.bigContracts.length,
      rows: flags.bigContracts.map((b) => ({
        key: b.code,
        text: [
          b.code,
          b.actor?.name ?? t(message('Chưa có người phụ trách', 'No owner', '담당자 없음')),
          printValue('money', b.value, true),
          t(message(`gấp ${num(b.ratio)} lần`, `${num(b.ratio)}× average`, `${num(b.ratio)}배`)),
        ].join(' · '),
        href: canContract ? contributionHref('contract', b.code) : null,
      })),
    },
    {
      title: t(message('Người ký dồn cuối tháng', 'End-of-month signers', '월말 집중 계약 담당자')),
      icon: TriangleAlert,
      flag: true,
      count: flags.lateHeavy.length,
      rows: flags.lateHeavy.map((l) => ({
        key: l.actor.actorId,
        text: `${l.actor.name} · ${percent(l.share)}`,
        href: seesAll ? personHref(l.actor.actorId, period) : null,
      })),
      note: t(
        message(
          `Trên ${percent(R.lateShare)} doanh số ký trong ${num(R.lateDays)} ngày cuối tháng.`,
          `Over ${percent(R.lateShare)} of signed sales in the last ${num(R.lateDays)} days of the month.`,
          `월말 ${num(R.lateDays)}일 동안 계약 실적의 ${percent(R.lateShare)} 초과.`,
        ),
      ),
    },
  ]
}

/** The gate above the close button; one line when nothing is pending or flagged. */
export function CloseGate({
  gate,
  onNavigate,
}: {
  gate: KpiCloseGateResponse
  onNavigate: () => void
}) {
  const { t } = useI18n()
  const canContract = useCan('contract.view')
  const seesAll = useCan('kpi.view-all')
  const { period, counts, pending, flags } = gate
  const toTargets = (role: Parameters<typeof targetsPath>[1], teamId?: string) =>
    seesAll ? targetsPath(period, role, teamId) : null
  const packageRows = (list: KpiCloseGateResponse['pending']['packagesSent']): Row[] =>
    list.map((p) => ({
      key: `${p.role}/${p.team?.id ?? 'room'}`,
      text: `${kpiRoleText(p.role)}${teamSuffix(p.team)}`,
      href: toTargets(p.role, p.team?.id),
    }))
  const W = PENDING_WORDS

  const specs: (Spec | null)[] = [
    pending.overdueReasons && {
      title: t(W.overdueReasons.title),
      icon: Wallet,
      count: counts.overdueReasons ?? 0,
      rows: pending.overdueReasons.map((r) => ({
        key: String(r.id),
        text: t(
          message(
            `Hợp đồng ${r.contractCode} · đợt ${r.installmentNo}`,
            `Contract ${r.contractCode} · installment ${r.installmentNo}`,
            `계약 ${r.contractCode} · ${r.installmentNo}회차`,
          ),
        ),
        href: canContract
          ? `/sales/contracts/${encodeURIComponent(r.contractCode)}/installments/${r.installmentNo}`
          : null,
      })),
      note: t(
        message(
          'Chốt bây giờ thì tiền các đợt này tính là quá hạn.',
          'If you close now, the payments for these installments count as overdue.',
          '지금 마감하면 이 회차의 대금은 연체로 처리됩니다.',
        ),
      ),
    },
    {
      title: t(W.counters.title),
      icon: Target,
      count: counts.counters,
      listed: true,
      rows: pending.counters.map((c) => ({
        key: c.id,
        text: `${c.name} · ${kpiMetricText(c.metricKey)}`,
        href: !seesAll ? null : c.team ? teamPath(c.team.id, period) : targetsPath(period, c.role),
      })),
    },
    {
      title: t(W.packagesSent.title),
      icon: ClipboardList,
      count: counts.packagesSent,
      listed: true,
      rows: packageRows(pending.packagesSent),
    },
    {
      title: t(W.packagesReturned.title),
      icon: ClipboardList,
      count: counts.packagesReturned,
      listed: true,
      rows: packageRows(pending.packagesReturned),
    },
    {
      title: t(W.packagesDraft.title),
      icon: ClipboardList,
      count: counts.packagesDraft,
      rows: packageRows(pending.packagesDraft),
    },
    {
      title: t(W.targetsProposed.title),
      icon: Target,
      count: counts.targetsProposed,
      listed: true,
      rows: pending.targetsProposed.map((p) => ({
        key: `${p.role}/${p.metricKey}`,
        text: `${kpiRoleText(p.role)} · ${kpiMetricText(p.metricKey)}`,
        href: toTargets(p.role),
      })),
    },
    ...flagSpecs(flags, t, { canContract, seesAll, period }),
  ]
  const groups = specs.filter((g): g is Spec => g !== null && g.count > 0)

  if (groups.length === 0) {
    return (
      <p className={cn(NOTE, 'm-0')}>
        {t(
          message(
            'Không còn mục nào chờ xử lý.',
            'Nothing is waiting to be handled.',
            '처리 대기 중인 항목이 없습니다.',
          ),
        )}
      </p>
    )
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
    return n ? [`${num(n)} ${translate(PENDING_WORDS[k].short)}`] : []
  })
  const flagged = [
    bigContracts.length > 0 && `${num(bigContracts.length)} ${translate(BIG_SHORT)}`,
    lateHeavyActorIds.length > 0 && `${num(lateHeavyActorIds.length)} ${translate(LATE_SHORT)}`,
  ].filter((p): p is string => typeof p === 'string')
  if (pending.length === 0) {
    const only = flagged.join(', ')
    const text = message(`Lúc chốt có ${only}`, `At close there were ${only}`, `마감 시점 ${only}`)
    return flagged.length > 0 ? translate(text) : null
  }
  const left = pending.join(', ')
  const head = translate(
    message(`Lúc chốt còn ${left}`, `At close, ${left} remained`, `마감 시점 남은 항목: ${left}`),
  )
  return flagged.length > 0 ? `${head} · ${flagged.join(', ')}` : head
}

/** Beside a closed month's line, for a closer only: the gate read is theirs alone. */
export function GateAtClose({ period }: { period: string }) {
  useI18n()
  const gate = useQuery(kpiCloseGateQuery(period, true))
  const line = gate.data?.atClose ? atCloseLine(gate.data.atClose) : null
  return line ? <p className={cn(NOTE, 'tnum font-num m-0')}>{line}</p> : null
}
