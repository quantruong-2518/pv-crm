import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, GlassCard } from '@pv/ui'
import type { OpportunityBookRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { contributionHref, kpiContributionsQuery } from '@/data/kpi-contributions'
import { DEFAULT_OPPORTUNITY_BOOK_QUERY, opportunityBookQuery } from '@/data/opportunities'
import { dm } from '@/lib/date'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { DASH, printShort } from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The opportunities a BD opened in the month, each with whether Sale has taken it
 *  (ADR 0160 §9). The list is the KPI's own record list; the book adds customer,
 *  value and stage for exactly those codes. A deal still in Sale's accept queue
 *  (stage `new`) is waiting; any other is accepted. The card is absent with no deal. */

const OPENED = 'opportunities-opened'

function amountOf(row: OpportunityBookRow | undefined): string {
  if (!row || row.amount === null) return DASH
  return !row.currency || row.currency === 'VND'
    ? printShort('money', row.amount)
    : `${num(row.amount)} ${row.currency}`
}

export function BdOpportunities({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const contributions = useQuery(kpiContributionsQuery(period, actorId))
  const group = contributions.data?.groups.find((g) => g.role === 'bd' && g.metricKey === OPENED)
  const items = group?.items.filter((i) => i.kind === 'opportunity' && i.adjustment === null) ?? []
  const book = useQuery({
    ...opportunityBookQuery({
      ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
      codes: items.map((i) => i.code).join(','),
      size: 200,
    }),
    enabled: items.length > 0,
  })
  const rows = new Map(book.data?.rows.map((r) => [r.code, r]))

  return (
    <QueryBlock
      query={contributions}
      what={message('danh sách cơ hội', 'the opportunity list', '기회 목록')}
      variant="b"
    >
      {() => {
        if (items.length === 0) return null
        const columns: StackColumn[] = [
          { header: t(message('Cơ hội', 'Opportunity', '기회')), width: 'minmax(0,1fr)' },
          { header: t(message('Khách', 'Customer', '고객')), width: 'minmax(0,1.4fr)' },
          { header: t(message('Ngày mở', 'Opened', '생성일')), width: 'minmax(0,0.8fr)' },
          {
            header: t(message('Giá trị dự kiến', 'Expected value', '예상 금액')),
            width: 'minmax(0,1fr)',
            align: 'right',
          },
          { header: t(message('Trạng thái', 'Status', '상태')), width: 'minmax(0,1fr)' },
        ]
        const lines = items.map((item) => {
          const row = rows.get(item.code)
          const href = contributionHref('opportunity', item.code)
          return {
            id: item.code,
            onOpen: href ? () => void navigate(href) : undefined,
            cells: [
              <span key="code" className="font-mono text-[12.5px]">
                {item.code}
              </span>,
              row?.account ?? DASH,
              <span key="at" className="tnum font-num">
                {item.at ? dm(item.at) : DASH}
              </span>,
              <span key="value" className="tnum font-num">
                {amountOf(row)}
              </span>,
              row ? (
                <Badge key="state" tone={row.stage === 'new' ? 'running' : 'success'}>
                  {row.stage === 'new'
                    ? t(message('Chờ nhận', 'Waiting', '수락 대기'))
                    : t(message('Đã nhận', 'Accepted', '수락됨'))}
                </Badge>
              ) : (
                DASH
              ),
            ],
          }
        })
        return (
          <GlassCard variant="b" className={TILE}>
            <h3 className="text-[13px] font-semibold leading-5">
              {t(message('Cơ hội tháng này', 'Opportunities this month', '이번 달 기회'))}
            </h3>
            <StackTable from="md" flush rowHeight="min-h-12 py-2" columns={columns} rows={lines} />
            {group?.truncated && (
              <span className={NOTE}>
                {t(
                  message(
                    `Chỉ hiện ${num(items.length)} cơ hội đầu tiên.`,
                    `Showing the first ${num(items.length)} opportunities only.`,
                    `처음 ${num(items.length)}건만 표시합니다.`,
                  ),
                )}
              </span>
            )}
          </GlassCard>
        )
      }}
    </QueryBlock>
  )
}
