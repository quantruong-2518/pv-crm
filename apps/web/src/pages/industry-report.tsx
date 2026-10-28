import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  DataTable,
  EmptyState,
  GlassCard,
  ScreenHeader,
  ScreenLayout,
  SegmentedControl,
  Skeleton,
  TriangleAlert,
  percent,
  type TableRowModel,
} from '@pv/ui'
import {
  IndustryReportPeriod,
  type IndustryReportCategory,
  type IndustryReportIndustry,
  type IndustryReportResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { industryReportQuery } from '@/data/industries'
import { dm, dmy } from '@/lib/date'
import { grouped } from './source-model'

/** The per-industry report — `/sales/reports/industries?period=` (approved
 *  canvas, artboard 3). The server sends the tree category → industry
 *  already counted; the screen only draws it. A lead with several industries
 *  counts in each, so rows do not add up — the meta line says so. A row opens
 *  the lead book filtered by that category or industry; the not-grouped row
 *  has no filter to open and stays still.
 *
 *  No ContextRail (law 10 debt, as on the other report screens): a row sums
 *  many leads and opens no single object. Law 8: the table sits on `.glass-b`. */

const PERIODS: { value: IndustryReportPeriod; label: string }[] = [
  { value: 'month', label: 'Tháng này' },
  { value: 'quarter', label: 'Quý này' },
  { value: 'year', label: 'Năm nay' },
]

/** Matches `h-14`, the row height of the source report. */
const ROW_PX = 56

type Counts = Omit<IndustryReportIndustry, 'id' | 'name'>

const NUMBERS: { header: string; key: 'open' | 'fresh' | 'deals' | 'won' }[] = [
  { header: 'Lead đang mở', key: 'open' },
  { header: 'Lead mới', key: 'fresh' },
  { header: 'Cơ hội', key: 'deals' },
  { header: 'Hợp đồng', key: 'won' },
]

function Rate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center justify-end gap-2">
      <span aria-hidden className="bg-surface-ink/10 h-1.5 w-16 overflow-hidden rounded-sm">
        <span
          className="bg-primary block h-full rounded-sm"
          style={{ width: `${Math.min(value, 1) * 100}%` }}
        />
      </span>
      <span className="tnum font-num">{percent(value)}</span>
    </span>
  )
}

const cells = (label: ReactNode, c: Counts) => [
  label,
  ...NUMBERS.map((n) => (
    <span key={n.key} className="tnum font-num">
      {grouped(c[n.key])}
    </span>
  )),
  <Rate key="rate" value={c.conversion} />,
]

function rowsOf(data: IndustryReportResponse, open: (param: string) => void): TableRowModel[] {
  return data.rows.flatMap((g: IndustryReportCategory) => [
    {
      id: `c/${g.id ?? '-'}`,
      onOpen: g.id ? () => open(`categoryId=${g.id}`) : undefined,
      cells: cells(
        <span key="n" className="truncate font-semibold">
          {g.name ?? 'Chưa xếp nhóm'}
        </span>,
        g,
      ),
    },
    ...g.industries.map((i) => ({
      id: `i/${i.id}`,
      onOpen: () => open(`industryId=${i.id}`),
      cells: cells(
        <span key="n" className="truncate pl-6">
          {i.name}
        </span>,
        i,
      ),
    })),
  ])
}

/** `to` is the day after the period; the line prints its last day. */
function spanOf({ from, to }: IndustryReportResponse): string {
  const last = new Date(`${to}T00:00:00`)
  last.setDate(last.getDate() - 1)
  return `${dm(from)} – ${dmy(last.toISOString())}`
}

export default function IndustryReportPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const period = IndustryReportPeriod.safeParse(params.get('period')).data ?? 'month'
  const { data, isPending, error, refetch } = useQuery(industryReportQuery(period))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader kicker="Báo cáo" title="Theo ngành" />
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Kỳ"
            hideLabel
            tone="quiet"
            value={period}
            options={PERIODS}
            onChange={(v) => setParams({ period: v }, { replace: true })}
          />
          {data && (
            <span className="text-muted-foreground tnum font-num text-[12px]">
              {grouped(data.totals.open)} lead đang mở · {spanOf(data)} · một lead nhiều ngành thì
              được đếm ở mỗi ngành
            </span>
          )}
        </div>
        <GlassCard variant="b" aria-label="Bảng theo ngành" className="overflow-x-auto">
          {isPending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton height={ROW_PX} />
              <Skeleton height={ROW_PX} delay={200} />
            </div>
          ) : error ? (
            <EmptyState
              tone="danger"
              icon={TriangleAlert}
              message={`Không tải được số liệu theo ngành. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`}
              action={{ label: 'Thử lại', onClick: () => void refetch() }}
              className="py-12"
            />
          ) : data.rows.length === 0 ? (
            <p className="text-muted-foreground m-0 p-5 text-[12px]">Kỳ này chưa có lead nào.</p>
          ) : (
            <DataTable
              flush
              rowHeight="h-14"
              className="min-w-[880px]"
              columns={[
                { header: 'Nhóm ngành · ngành', width: 'minmax(200px,2.4fr)' },
                ...NUMBERS.map((n) => ({
                  header: n.header,
                  width: '0.8fr',
                  align: 'right' as const,
                })),
                { header: 'Lead → cơ hội', width: '1fr', align: 'right' },
              ]}
              rows={rowsOf(data, (param) => navigate(`/sales/leads?${param}`))}
            />
          )}
        </GlassCard>
        <p className="text-muted-foreground m-0 text-[12px]">
          Bấm một dòng để mở sổ lead đã lọc theo dòng đó.
        </p>
      </ScreenLayout>
    </AppShell>
  )
}
