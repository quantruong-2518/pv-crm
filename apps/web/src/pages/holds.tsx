import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ScreenLayout, SegmentedControl } from '@pv/ui'
import type { HoldRow, HoldSubjectType } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { oneOf, useClientBookFilter } from '@/app/client-book-filter'
import { holdListQuery } from '@/data/holds'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { HoldUntilCell } from '@/components/hold-strip'
import { AvatarCell } from '@/components/table-bits'

/** The hold list — `/sales/holds` (ADR 0097 §3): every lead and deal on hold,
 *  in one list, nearest date first as the server sorts it. A row opens the
 *  lead's or the deal's profile, where the hold is ended or moved.
 *
 *  Read whole and filtered in the browser: a hold list is short, and one read
 *  counts all three tabs. The kind filter lives in the address.
 *
 *  No ContextRail (law 10 debt, as on the lead book): a list of unrelated
 *  objects has no one story to chain. */

const KIND_LABEL: Record<HoldSubjectType, string> = { lead: 'Lead', opportunity: 'Cơ hội' }

const KINDS = ['all', 'lead', 'opportunity'] as const
const FILTERS = { kind: oneOf(KINDS, 'all') }

const PATH: Record<HoldSubjectType, string> = {
  lead: '/sales/leads',
  opportunity: '/sales/opportunities',
}

function SubjectCell({ row }: { row: HoldRow }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px] font-semibold" title={row.customer}>
        {row.customer}
      </span>
      <span className="text-muted-foreground truncate text-[11.5px]">
        {KIND_LABEL[row.subjectType]} · <span className="font-mono">{row.code}</span> · {row.name}
      </span>
    </span>
  )
}

export function HoldsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { filters, patch } = useClientBookFilter(FILTERS)
  const { data, isPending, error, refetch } = useQuery(holdListQuery('all'))

  const all = useMemo(() => data?.rows ?? [], [data])
  const rows = filters.kind === 'all' ? all : all.filter((r) => r.subjectType === filters.kind)
  const countOf = (kind: (typeof KINDS)[number]) =>
    data && (kind === 'all' ? all.length : all.filter((r) => r.subjectType === kind).length)

  const table: BookTable = {
    minWidth: 'min-w-[880px]',
    columns: [
      { header: 'Khách hàng', width: 'minmax(0,2.2fr)' },
      { header: 'Đang ở bước', width: 'minmax(0,1.2fr)' },
      { header: 'Ngày hẹn gặp lại', width: 'minmax(0,1.3fr)' },
      { header: 'Người phụ trách', width: '160px' },
      { header: 'Ghi chú', width: 'minmax(0,1.6fr)' },
    ],
    rows: rows.map((r) => ({
      id: `${r.subjectType}:${r.code}`,
      onOpen: () => navigate(`${PATH[r.subjectType]}/${encodeURIComponent(r.code)}`),
      cells: [
        <SubjectCell key="s" row={r} />,
        <span key="t" className="truncate text-[13px]" title={r.stepLabel}>
          {r.stepLabel}
        </span>,
        <HoldUntilCell key="u" hold={r} />,
        <AvatarCell key="h" name={r.holder?.name} empty="Chưa có người phụ trách" />,
        <span key="n" className="text-muted-foreground truncate text-[12px]" title={r.note ?? ''}>
          {r.note ?? '—'}
        </span>,
      ],
    })),
  }

  const failure = error
    ? {
        message: isApiError(error)
          ? `Không tải được danh sách tạm hoãn. ${userMessage(error)}`
          : 'Không tải được danh sách tạm hoãn.',
        onRetry: () => void refetch(),
      }
    : undefined

  const empty =
    rows.length === 0
      ? filters.kind !== 'all' && all.length > 0
        ? {
            message: `Không có ${KIND_LABEL[filters.kind].toLowerCase()} nào đang tạm hoãn.`,
            action: { label: 'Xem tất cả', onClick: () => patch({ kind: 'all' }) },
          }
        : {
            message: 'Chưa có lead hay cơ hội nào đang tạm hoãn.',
            action: { label: 'Tải lại', onClick: () => void refetch() },
          }
      : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Tạm hoãn"
          tabs={
            <SegmentedControl
              label="Loại"
              hideLabel
              tone="quiet"
              value={filters.kind}
              options={KINDS.map((k) => ({
                value: k,
                label: k === 'all' ? 'Tất cả' : KIND_LABEL[k],
                count: countOf(k),
              }))}
              onChange={(value) => patch({ kind: value as (typeof KINDS)[number] })}
            />
          }
          count={<BookCount total={rows.length} noun="mục" />}
          pending={isPending}
          failure={failure}
          empty={empty}
          table={table}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default HoldsPage
