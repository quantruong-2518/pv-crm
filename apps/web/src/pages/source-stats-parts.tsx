import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  SectionTitle,
  Select,
  Skeleton,
  TriangleAlert,
  cn,
  percent,
  type TableRowModel,
} from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n, type Message } from '@/app/i18n'
import { TIME_WINDOWS, dayAfterToday, type TimeWindowKey } from '@/data/campaigns'
import { leadSourceStatsQuery } from '@/data/lead-origins'
import { useMotionLabel } from '@/data/sales-motions'
import { grouped } from './source-model'
import {
  conversionOf,
  statsTree,
  totalOf,
  visibleNodes,
  type Funnel,
  type StatsNode,
} from './source-stats-model'

/** Module 1 · which origins turn into customers — `GET /sales/leads/source-stats`
 *  nested side → motion → origin → campaign.
 *
 *  Its own period select, reusing the book's `TIME_WINDOWS` so the two read the
 *  same three choices; the book's filter stays client-side, this one goes to
 *  the server as `from`. A row with children opens under itself on click —
 *  the same click that opens a campaign in the book above. Law 8: `.glass-b`. */

/** One indent step per level, from the 8-step spacing scale (law 7). */
const INDENT = ['', 'pl-4', 'pl-8', 'pl-12']

/** Matches `h-14`, the row height every book draws (`components/book-page.tsx`). */
const ROW_PX = 56

const NUMBER_COLUMNS: { header: Message; key: keyof Funnel }[] = [
  { header: message('Tổng lead', 'Total leads', '전체 리드'), key: 'leads' },
  {
    header: message('Marketing duyệt (MQL)', 'Marketing approved (MQL)', '마케팅 승인 (MQL)'),
    key: 'mql',
  },
  { header: message('Sales duyệt (SQL)', 'Sales approved (SQL)', '영업 승인 (SQL)'), key: 'sql' },
  { header: message('Cơ hội', 'Opportunities', '기회'), key: 'deals' },
  { header: message('Hợp đồng', 'Contracts', '계약'), key: 'won' },
]

function numberCells(funnel: Funnel) {
  return [
    ...NUMBER_COLUMNS.map((c) => (
      <span key={c.key} className="tnum font-num">
        {grouped(funnel[c.key])}
      </span>
    )),
    <span key="rate" className="tnum font-num">
      {percent(conversionOf(funnel), 1)}
    </span>,
  ]
}

function NodeLabel({ node, open }: { node: StatsNode; open: boolean }) {
  const leaf = node.children.length === 0
  return (
    <span className={cn('flex min-w-0 items-center gap-2', INDENT[node.depth])}>
      {leaf ? (
        <span aria-hidden className="w-4 shrink-0" />
      ) : (
        <Icon icon={open ? ChevronDown : ChevronRight} size={16} className="shrink-0" />
      )}
      <span className={cn('truncate', node.depth === 0 && 'font-semibold')}>{node.label}</span>
    </span>
  )
}

export function SourceStatsBlock() {
  const { t, lang } = useI18n()
  const [span, setSpan] = useState<TimeWindowKey>('all')
  const days = TIME_WINDOWS.find((w) => w.key === span)?.days ?? null
  const from = days === null ? undefined : dayAfterToday(-days)
  const { data, isPending, error, refetch } = useQuery(leadSourceStatsQuery({ from }))

  const motionLabel = useMotionLabel()
  const tree = useMemo(
    () => statsTree(data?.rows ?? [], motionLabel, lang),
    [data, motionLabel, lang],
  )
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const rows: TableRowModel[] = [
    {
      id: 'total',
      cells: [
        <span key="n" className="pl-6 font-semibold">
          {t(message('Tổng', 'Total', '합계'))}
        </span>,
        ...numberCells(totalOf(tree)),
      ],
    },
    ...visibleNodes(tree, open).map((node) => ({
      id: node.id,
      onOpen: node.children.length > 0 ? () => toggle(node.id) : undefined,
      cells: [
        <NodeLabel key="n" node={node} open={open.has(node.id)} />,
        ...numberCells(node.funnel),
      ],
    })),
  ]

  return (
    <GlassCard
      variant="b"
      aria-label={t(
        message('Hiệu quả theo nguồn lead', 'Performance by lead source', '리드 유입 경로별 성과'),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <SectionTitle
          hint={t(
            message(
              'Chọn một dòng để xem chi tiết. Tỷ lệ = Hợp đồng / Tổng lead.',
              'Select a row for details. Rate = Contracts / Total leads.',
              '행을 선택하면 상세 내용을 볼 수 있습니다. 비율 = 계약 / 전체 리드.',
            ),
          )}
        >
          {t(
            message(
              'Hiệu quả theo nguồn lead',
              'Performance by lead source',
              '리드 유입 경로별 성과',
            ),
          )}
        </SectionTitle>
        <Select
          label={t(message('Khoảng thời gian', 'Time range', '기간'))}
          size="lg"
          value={span}
          neutralValue="all"
          onChange={(v) => setSpan(v as TimeWindowKey)}
          options={TIME_WINDOWS.map((w) => ({ value: w.key, label: t(w.label) }))}
        />
      </div>
      <div className="overflow-x-auto">
        {isPending ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton height={ROW_PX} />
            <Skeleton height={ROW_PX} delay={200} />
          </div>
        ) : error ? (
          <EmptyState
            tone="danger"
            icon={TriangleAlert}
            message={`${t(
              message(
                'Không tải được số liệu hiệu quả theo nguồn lead.',
                'Could not load performance figures by lead source.',
                '리드 유입 경로별 성과 수치를 불러오지 못했습니다.',
              ),
            )} ${
              isApiError(error)
                ? userMessage(error)
                : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))
            }`}
            action={{
              label: t(message('Thử lại', 'Try again', '다시 시도')),
              onClick: () => void refetch(),
            }}
            className="py-12"
          />
        ) : (
          <DataTable
            flush
            rowHeight="h-14"
            className="min-w-[1120px]"
            columns={[
              {
                header: t(message('Phân nhóm nguồn', 'Source grouping', '유입 경로 분류')),
                width: 'minmax(0,2.6fr)',
              },
              ...NUMBER_COLUMNS.map((c) => ({
                header: t(c.header),
                width: '0.7fr',
                align: 'right' as const,
              })),
              {
                header: t(
                  message('Tỷ lệ thành hợp đồng', 'Contract conversion rate', '계약 전환율'),
                ),
                width: '1fr',
                align: 'right',
              },
            ]}
            rows={rows}
          />
        )}
      </div>
    </GlassCard>
  )
}
