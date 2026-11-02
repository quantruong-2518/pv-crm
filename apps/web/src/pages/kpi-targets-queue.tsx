import { useNavigate } from 'react-router-dom'
import { message, translate, useI18n, type Lang, type Message } from '@/app/i18n'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { Button, GlassCard, cn } from '@pv/ui'
import {
  type KpiAllocation,
  type KpiCounter,
  type OverdueReasonRow,
  type RoleId,
} from '@pv/contracts'
import { primaryOf, type KpiCatalog } from '@/data/kpi-catalog'
import { dm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { defOfCounter, headlineOf, teamSuffix } from './kpi-allocate-model'
import { MonthCloseBar } from './kpi-month-close'
import { printShort } from './kpi-model'
import { stepId, teamStepId, type QueueItem, type Waiting } from './kpi-targets-model'

/** What waits on the reader of the targets screen, as `waitingOf` built it: the
 *  queue items, the overdue reasons the reader may decide, and an ended month
 *  left to close, in one list.
 *
 *  An item states what happened and opens where it is answered; it answers
 *  nothing itself. A role's step is on this screen, so the button picks the
 *  role and scrolls to it; a counter opens in a drawer; a reason opens its
 *  installment. Closing is the one action taken in the row, behind its dialog.
 *
 *  A total is printed only where the package carries one: a metric that does
 *  not add up across people has `allocated: null`, and no sum is made here. */

/** Who sent which role's package on which day, and its primary total where it has one. */
function packageSentence(catalog: KpiCatalog, pkg: KpiAllocation, lang: Lang): string {
  const roleName = kpiRoleText(pkg.role, lang)
  const role = pkg.team
    ? translate(
        message(
          `${roleName} của nhóm ${pkg.team.name}`,
          `${roleName} · ${pkg.team.name} team`,
          `${roleName} · ${pkg.team.name} 팀`,
        ),
        lang,
      )
    : roleName
  const by = pkg.submittedBy?.name
  const head = by
    ? message(
        `${by} gửi gói chỉ tiêu ${role}`,
        `${by} submitted the ${role} target package`,
        `${by}님이 ${role} 목표 패키지를 제출했습니다`,
      )
    : message(
        `Gói chỉ tiêu ${role} đã gửi`,
        `${role} target package submitted`,
        `${role} 목표 패키지 제출됨`,
      )
  const at = pkg.submittedAt ? dm(pkg.submittedAt) : ''
  const day = pkg.submittedAt ? translate(message(` ngày ${at}`, ` · ${at}`, ` · ${at}`), lang) : ''
  const def = primaryOf(catalog, pkg.role)
  const total = def && pkg.totals.find((t) => t.metricKey === def.key)?.allocated
  const metric = def ? kpiMetricText(def.key, lang) : ''
  const figure = def && typeof total === 'number' ? printShort(def.unit, total) : ''
  const sum =
    def && typeof total === 'number'
      ? translate(
          message(
            `, tổng ${metric.toLowerCase()} ${figure}`,
            `, total ${metric.toLowerCase()} ${figure}`,
            `, 합계 ${metric} ${figure}`,
          ),
          lang,
        )
      : ''
  return `${translate(head, lang)}${day}${sum}.`
}

/** What happened, the line under it, the button's word, and what it opens. */
type Row = {
  id: string
  at: string
  what: string
  under: string | null
  open: string
  go: { step: RoleId; ids: string[] } | { counter: KpiCounter } | { href: string }
}

function rowOf(
  catalog: KpiCatalog,
  item: QueueItem,
  lang: Lang,
  t: (copy: Message) => string,
): Row {
  const base = { id: item.id, at: item.at }
  switch (item.kind) {
    case 'targets':
      return {
        ...base,
        what: t(
          message(
            `${item.who} đề nghị chỉ tiêu ${kpiRoleText(item.role)} ngày ${dm(item.at)}.`,
            `${item.who} proposed ${kpiRoleText(item.role)} targets on ${dm(item.at)}.`,
            `${item.who}님이 ${dm(item.at)} ${kpiRoleText(item.role)} 목표를 제안했습니다.`,
          ),
        ),
        under: t(
          message(
            `${num(item.metrics)} chỉ số chờ duyệt`,
            `${num(item.metrics)} metrics awaiting review`,
            `검토 대기 지표 ${num(item.metrics)}개`,
          ),
        ),
        open: t(message('Duyệt chỉ tiêu', 'Review targets', '목표 검토')),
        go: { step: item.role, ids: [stepId(item.role, 'total')] },
      }
    case 'package': {
      const { role, team } = item.pkg
      const ids = team ? [teamStepId(role, team.id)] : [stepId(role, 'lock'), stepId(role, 'ack')]
      return {
        ...base,
        what: packageSentence(catalog, item.pkg, lang),
        under: null,
        open: t(message('Duyệt gói chỉ tiêu', 'Review target package', '목표 패키지 검토')),
        go: { step: role, ids },
      }
    }
    case 'returned':
      return {
        ...base,
        what: t(
          message(
            `${item.pkg.decidedBy?.name ?? 'Quản lý'} trả lại gói chỉ tiêu ${kpiRoleText(item.pkg.role)} ngày ${dm(item.at)}.`,
            `${item.pkg.decidedBy?.name ?? 'Manager'} returned the ${kpiRoleText(item.pkg.role)} target package on ${dm(item.at)}.`,
            `${item.pkg.decidedBy?.name ?? '관리자'}님이 ${dm(item.at)} ${kpiRoleText(item.pkg.role)} 목표 패키지를 반려했습니다.`,
          ),
        ),
        under: null,
        open: t(message('Sửa phân bổ', 'Edit allocation', '배분 수정')),
        go: { step: item.pkg.role, ids: [stepId(item.pkg.role, 'split')] },
      }
    case 'counter': {
      const c = item.counter
      const def = defOfCounter(c)
      return {
        ...base,
        what: `${def ? headlineOf(c, def) : c.name}.`,
        under: `${kpiRoleText(c.role)}${teamSuffix(c.team)} · ${t(message('gửi ngày', 'sent', '제출'))} ${dm(c.createdAt)}`,
        open: t(message('Xem đề xuất', 'View proposal', '제안 보기')),
        go: { counter: c },
      }
    }
  }
}

const reasonRow = (r: OverdueReasonRow, t: (copy: ReturnType<typeof message>) => string): Row => ({
  id: `reason/${r.id}`,
  at: r.writtenAt,
  what: t(
    message(
      `${r.writtenBy.name} ghi lý do quá hạn cho hợp đồng ${r.contractCode}, đợt ${r.installmentNo}.`,
      `${r.writtenBy.name} added an overdue reason for contract ${r.contractCode}, installment ${r.installmentNo}.`,
      `${r.writtenBy.name}님이 계약 ${r.contractCode}의 ${r.installmentNo}회차 연체 사유를 기록했습니다.`,
    ),
  ),
  under: t(
    message(
      `Hạn đợt ${dm(r.due)} · ghi ngày ${dm(r.writtenAt)}`,
      `Due ${dm(r.due)} · added ${dm(r.writtenAt)}`,
      `${dm(r.due)} 납기 · ${dm(r.writtenAt)} 기록`,
    ),
  ),
  open: t(message('Mở đợt thanh toán', 'Open installment', '납부 회차 열기')),
  go: {
    href: `/sales/contracts/${encodeURIComponent(r.contractCode)}/installments/${r.installmentNo}`,
  },
})

/** Also the company door's line when its count is zero. */
export const NOTHING_WAITING = message(
  'Không có mục nào chờ bạn xử lý.',
  'Nothing needs your attention.',
  '처리할 항목이 없습니다.',
)

const LINE = 'flex min-h-14 flex-col gap-2 px-5 py-2 text-[12.5px] leading-5'

export function WaitingList({
  catalog,
  waiting: { items, reasons, closing },
  reasonsFailed,
  onOpenStep,
  onOpenCounter,
}: {
  catalog: KpiCatalog
  waiting: Waiting
  reasonsFailed: boolean
  /** Picks the role and scrolls to the first of these sections it draws. */
  onOpenStep: (role: RoleId, ids: string[]) => void
  onOpenCounter: (counter: KpiCounter) => void
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const rows = [
    ...items.map((i) => rowOf(catalog, i, lang, t)),
    ...reasons.map((r) => reasonRow(r, t)),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const open = ({ go }: Row) => {
    if ('step' in go) onOpenStep(go.step, go.ids)
    else if ('counter' in go) onOpenCounter(go.counter)
    else navigate(go.href)
  }
  const failed = reasonsFailed && (
    <p className={cn(NOTE, 'text-destructive-foreground px-5 py-2')}>
      {t(
        message(
          'Không tải được lý do quá hạn chờ duyệt.',
          'Could not load overdue reasons awaiting review.',
          '검토 대기 중인 연체 사유를 불러오지 못했습니다.',
        ),
      )}
    </p>
  )

  if (rows.length === 0 && !closing) {
    return (
      <GlassCard variant="b" className="p-5">
        {failed || <p className={NOTE}>{t(NOTHING_WAITING)}</p>}
      </GlassCard>
    )
  }

  /* A list, not a table: below `sm` the button drops under its sentence instead
     of sitting past a sideways scroll. */
  return (
    <GlassCard variant="b" className="py-2">
      <ul
        aria-label={t(message('Chờ bạn xử lý', 'Needs your attention', '처리할 항목'))}
        className="divide-surface-ink/6 flex flex-col divide-y"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(LINE, 'sm:flex-row sm:items-center sm:justify-between sm:gap-4')}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="tnum font-num">{row.what}</span>
              {row.under && <span className={cn(NOTE, 'tnum font-num')}>{row.under}</span>}
            </span>
            <Button
              variant="secondary"
              className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
              onClick={() => open(row)}
            >
              {row.open}
            </Button>
          </li>
        ))}
        {closing && (
          <li className={cn(LINE, 'justify-center')}>
            <MonthCloseBar period={closing} monthClose={null} />
          </li>
        )}
      </ul>
      {failed}
    </GlassCard>
  )
}
