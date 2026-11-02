import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Accordion, GlassCard, Icon, SectionTitle, cn } from '@pv/ui'
import {
  type KpiContribution,
  type KpiContributionKind,
  type KpiContributionsResponse,
  type KpiMetricDef,
  type KpiPersonContributions,
  type RoleId,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { useCan } from '@/app/auth'
import { StackTable, type StackColumn, type StackRow } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { contributionHref, kpiContributionsQuery } from '@/data/kpi-contributions'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { dmy } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { ADJUSTMENT_ICON, DASH, printCell, printSigned } from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The records each KPI figure of one person counted — shared by the person
 *  screen and the reader's own screen (ADR 0099 §5).
 *
 *  Grouped by (role, metric) in the effective catalog's order; a group whose
 *  metric is no longer in force is dropped, as on every card. Only the
 *  primary metric opens by default. The heading counts records; the figure
 *  itself is on the card above, and nothing here adds the records up.
 *  A row carrying a closed month's change is marked and signed (ADR 0115). */

type Group = { def: KpiMetricDef; group: KpiPersonContributions }
type RoleBlock = { role: RoleId; groups: Group[] }

function blocksOf(catalog: KpiCatalog, data: KpiContributionsResponse): RoleBlock[] {
  const roles = [...new Set(data.groups.map((g) => g.role))]
  return roles.flatMap((role) => {
    const groups = catalog[role].flatMap((def) => {
      const group = data.groups.find((g) => g.role === role && g.metricKey === def.key)
      return group ? [{ def, group }] : []
    })
    return groups.length > 0 ? [{ role, groups }] : []
  })
}

function summaryOf({ group }: Group, t: ReturnType<typeof useI18n>['t']): string {
  const adjusted = group.items.filter((i) => i.adjustment !== null).length
  const n = num(group.items.length - adjusted)
  const records = group.truncated
    ? t(message(`Hơn ${n} bản ghi`, `More than ${n} records`, `${n}개 초과 기록`))
    : t(message(`${n} bản ghi`, `${n} records`, `${n}개 기록`))
  return adjusted > 0
    ? `${records} · ${t(message(`${num(adjusted)} điều chỉnh`, `${num(adjusted)} adjustments`, `조정 ${num(adjusted)}건`))}`
    : records
}

/** Which kinds the reader may open; the route gate would refuse the rest anyway. */
function useOpenable(): Record<KpiContributionKind, boolean> {
  const lead = useCan('lead.view')
  const opportunity = useCan('opportunity.view')
  const contract = useCan('contract.view')
  return { lead, opportunity, contract, installment: contract, meeting: false }
}

const FIGURE = 'tnum font-num'

/** What the record says, or for an adjustment the mark and what happened to it. */
function ContentCell({ item }: { item: KpiContribution }) {
  const { t } = useI18n()
  if (item.adjustment === null) return <span>{item.label}</span>
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1 font-semibold">
        <Icon icon={ADJUSTMENT_ICON} size={14} className="shrink-0" />
        {t(message('Điều chỉnh', 'Adjustment', '조정'))}
      </span>
      <span className={cn(NOTE, FIGURE)}>{adjustmentText(item, t)}</span>
    </span>
  )
}

type OpenTo = (kind: KpiContributionKind, code: string) => (() => void) | undefined

function adjustmentText(item: KpiContribution, t: ReturnType<typeof useI18n>['t']): string {
  if (!item.adjustment) return ''
  const { cause, sourcePeriod } = item.adjustment
  const month = sourcePeriod.slice(5, 7).replace(/^0/, '')
  const kind = t(
    message(
      (
        {
          lead: 'Khách hàng tiềm năng',
          opportunity: 'Cơ hội',
          contract: 'Hợp đồng',
          installment: 'Đợt thanh toán',
          meeting: 'Buổi họp',
        } as const
      )[item.kind],
      (
        {
          lead: 'Lead',
          opportunity: 'Opportunity',
          contract: 'Contract',
          installment: 'Installment',
          meeting: 'Meeting',
        } as const
      )[item.kind],
      (
        {
          lead: '잠재 고객',
          opportunity: '기회',
          contract: '계약',
          installment: '분할 납부',
          meeting: '회의',
        } as const
      )[item.kind],
    ),
  )
  const action =
    cause === 'appeared'
      ? t(message('được thêm vào', 'was added to', '추가됨'))
      : cause === 'vanished'
        ? t(message('bị loại khỏi', 'was removed from', '제외됨'))
        : t(message('đổi giá trị trong', 'changed in', '값이 변경됨'))
  return t(
    message(
      `${kind} ${action} tháng ${month}`,
      `${kind} ${action} month ${month}`,
      `${month}월 ${kind} ${action}`,
    ),
  )
}

function rowsOf(
  items: readonly KpiContribution[],
  def: KpiMetricDef,
  valued: boolean,
  openTo: OpenTo,
  t: ReturnType<typeof useI18n>['t'],
): StackRow[] {
  return items.map((item, i) => {
    const onOpen = openTo(item.kind, item.code)
    /* A meeting's code is a bare id: it names nothing a reader could look up. */
    const code =
      item.kind === 'meeting' ? (
        <span key="code">{t(message('Buổi họp', 'Meeting', '회의'))}</span>
      ) : (
        <span
          key="code"
          className={cn('font-mono text-[11.5px]', onOpen && 'text-accent-foreground')}
        >
          {item.code}
        </span>
      )
    const cells = [
      code,
      <ContentCell key="label" item={item} />,
      <span key="at" className={FIGURE}>
        {item.at ? dmy(item.at) : DASH}
      </span>,
    ]
    if (valued) {
      cells.push(
        <span key="value" className={cn(FIGURE, item.adjustment && 'font-semibold')}>
          {item.adjustment && item.value !== null
            ? printSigned(def.unit, item.value)
            : printCell(def.unit, item.value)}
        </span>,
      )
    }
    return { id: `${item.kind}/${item.code}/${i}`, cells, onOpen }
  })
}

/** In a closed month, adjustments sourced from it are outside its frozen figure
 *  (ADR 0115 §4): they sit apart, so the rows above add up to that figure. */
function GroupBody({
  entry: { def, group },
  period,
  openTo,
}: {
  entry: Group
  period: string
  /** The open action for a record, or undefined where it opens nothing. */
  openTo: OpenTo
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Bản ghi', 'Record', '기록')), width: 'minmax(0,1fr)' },
    { header: t(message('Nội dung', 'Details', '내용')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Ngày', 'Date', '날짜')), width: 'minmax(0,.8fr)' },
  ]
  const valueColumn: StackColumn = {
    header: t(message('Giá trị', 'Value', '값')),
    width: 'minmax(0,1fr)',
    align: 'right',
  }
  if (group.items.length === 0) {
    return (
      <p className="py-2 text-[12.5px] leading-5">
        {t(
          message(
            'Chưa có bản ghi nào tính vào chỉ số này.',
            'No records contribute to this metric yet.',
            '아직 이 지표에 반영된 기록이 없습니다.',
          ),
        )}
      </p>
    )
  }
  const after = group.items.filter((i) => i.adjustment?.sourcePeriod === period)
  const inside = group.items.filter((i) => i.adjustment?.sourcePeriod !== period)
  const records = group.items.filter((i) => i.adjustment === null).length
  const valued = group.items.some((i) => i.value !== null)
  const table = (items: readonly KpiContribution[]) => (
    <StackTable
      from="md"
      rowHeight="min-h-12 py-2"
      tableClassName="min-w-md"
      columns={valued ? [...columns, valueColumn] : columns}
      rows={rowsOf(items, def, valued, openTo, t)}
    />
  )
  return (
    <div className="flex flex-col gap-2">
      {inside.length > 0 && table(inside)}
      {group.truncated && (
        <p className={cn(NOTE, FIGURE)}>
          {t(
            message(
              `Chỉ hiện ${num(records)} bản ghi mới nhất.`,
              `Showing the ${num(records)} most recent records.`,
              `최근 기록 ${num(records)}개만 표시합니다.`,
            ),
          )}
        </p>
      )}
      {after.length > 0 && (
        <>
          <p className="m-0 pt-2 text-[12.5px] font-semibold leading-5">
            {t(message('Sau điều chỉnh', 'After adjustments', '조정 후'))}
          </p>
          {table(after)}
        </>
      )}
    </div>
  )
}

function Blocks({
  blocks,
  period,
  openTo,
}: {
  blocks: RoleBlock[]
  period: string
  openTo: OpenTo
}) {
  const { t } = useI18n()
  if (blocks.length === 0) {
    return (
      <p className="text-[12.5px] leading-5">
        {t(
          message(
            'Chưa có bản ghi nào tính vào chỉ số.',
            'No records contribute to these metrics yet.',
            '아직 지표에 반영된 기록이 없습니다.',
          ),
        )}
      </p>
    )
  }
  const titled = blocks.length > 1
  return (
    <div className="flex flex-col gap-4">
      {blocks.map(({ role, groups }) => (
        <div key={role} className="flex flex-col gap-2">
          {titled && <SectionTitle size="md">{kpiRoleText(role)}</SectionTitle>}
          <GlassCard variant="b" className="flex flex-col px-4 py-2">
            {groups.map((entry) => (
              <Accordion
                key={entry.def.key}
                title={kpiMetricText(entry.def.key)}
                summary={summaryOf(entry, t)}
                defaultOpen={entry.def.primary}
              >
                <GroupBody entry={entry} period={period} openTo={openTo} />
              </Accordion>
            ))}
          </GlassCard>
        </div>
      ))}
    </div>
  )
}

/** The frozen-copy note, once per screen: the contributions read says whether
 *  this month's lists and weekly series come from the copy frozen at close. */
export function FrozenNote({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  const query = useQuery(kpiContributionsQuery(period, actorId))
  return query.data?.frozen ? (
    <p className={NOTE}>
      {t(
        message(
          'Theo số lúc chốt. Thay đổi sau đó tính vào tháng đang chạy.',
          'Based on figures at close. Later changes count toward the current month.',
          '마감 시점 수치 기준입니다. 이후 변경 사항은 현재 월에 반영됩니다.',
        ),
      )}
    </p>
  ) : null
}

export function ContributionsPanel({
  catalog,
  period,
  actorId,
}: {
  catalog: KpiCatalog
  period: string
  actorId: string
}) {
  const { t } = useI18n()
  const query = useQuery(kpiContributionsQuery(period, actorId))
  const navigate = useNavigate()
  const openable = useOpenable()
  const denied = isApiError(query.error) && query.error.kind === 'forbidden'

  const openTo = (kind: KpiContributionKind, code: string) => {
    const href = openable[kind] ? contributionHref(kind, code) : null
    return href ? () => navigate(href) : undefined
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="lg">
        {t(message('Bản ghi tính vào chỉ số', 'Records behind your metrics', '지표에 반영된 기록'))}
      </SectionTitle>
      {denied ? (
        <p className="text-[12.5px] leading-5">
          {t(
            message(
              'Bạn không có quyền xem các bản ghi này.',
              'You do not have permission to view these records.',
              '이 기록을 볼 권한이 없습니다.',
            ),
          )}
        </p>
      ) : (
        <QueryBlock
          query={query}
          what={t(message('bản ghi tính vào chỉ số', 'metric records', '지표 기록'))}
          variant="b"
        >
          {(data) => (
            <Blocks blocks={blocksOf(catalog, data)} period={data.period} openTo={openTo} />
          )}
        </QueryBlock>
      )}
    </section>
  )
}
