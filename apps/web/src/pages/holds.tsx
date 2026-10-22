import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, ScreenLayout, SegmentedControl } from '@pv/ui'
import type { HoldRow, HoldSubjectType } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { oneOf, useClientBookFilter } from '@/app/client-book-filter'
import { holdListQuery } from '@/data/holds'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { HoldUntilCell, LATE } from '@/components/hold-strip'
import { AvatarCell } from '@/components/table-bits'
import { ViewSwitch } from '@/components/book-cards'
import { useBookView } from '@/components/book-view'
import { HoldCardGrid } from '@/components/hold-cards'

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

const PATH: Record<HoldSubjectType, string> = {
  lead: '/sales/leads',
  opportunity: '/sales/opportunities',
}

const KINDS = ['all', 'lead', 'opportunity'] as const
const WHENS = ['all', 'late', 'later'] as const
const WHEN_LABEL: Record<(typeof WHENS)[number], string> = {
  all: 'Tất cả',
  late: 'Cần xử lý',
  later: 'Chưa tới hạn',
}
const FILTERS = { kind: oneOf(KINDS, 'all'), when: oneOf(WHENS, 'all') }

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
  const [view, setView] = useBookView('pv.holds.view')
  const { data, isPending, error, refetch } = useQuery(holdListQuery('all'))

  const all = useMemo(() => data?.rows ?? [], [data])
  const ofKind = filters.kind === 'all' ? all : all.filter((r) => r.subjectType === filters.kind)
  const whenOf = (when: (typeof WHENS)[number], list: HoldRow[]) =>
    when === 'all' ? list : list.filter((r) => LATE.has(r.dueLevel) === (when === 'late'))
  const rows = whenOf(filters.when, ofKind)
  const countOf = (kind: (typeof KINDS)[number]) =>
    data && (kind === 'all' ? all.length : all.filter((r) => r.subjectType === kind).length)

  const dirty = filters.kind !== 'all' || filters.when !== 'all'

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
      ? all.length > 0
        ? {
            message: 'Không có mục nào khớp bộ lọc.',
            action: { label: 'Xem tất cả', onClick: () => patch({ kind: 'all', when: 'all' }) },
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
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <SegmentedControl
                label="Mức đến hạn"
                hideLabel
                tone="quiet"
                value={filters.when}
                options={WHENS.map((w) => ({
                  value: w,
                  label: WHEN_LABEL[w],
                  count: data && whenOf(w, ofKind).length,
                }))}
                onChange={(value) => patch({ when: value as (typeof WHENS)[number] })}
              />
              <SegmentedControl
                label="Loại"
                hideLabel
                tone="quiet"
                value={filters.kind}
                options={KINDS.map((k) => ({
                  value: k,
                  label: k === 'all' ? 'Lead và cơ hội' : KIND_LABEL[k],
                  count: countOf(k),
                }))}
                onChange={(value) => patch({ kind: value as (typeof KINDS)[number] })}
              />
            </div>
          }
          count={<BookCount total={rows.length} noun="mục" />}
          tools={
            <>
              <ViewSwitch value={view} onChange={setView} />
              {dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={() => patch({ kind: 'all', when: 'all' })}
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={failure}
          empty={empty}
          cards={
            view === 'grid' ? (
              <HoldCardGrid rows={rows} kinds={KIND_LABEL} paths={PATH} />
            ) : undefined
          }
          table={view === 'table' ? table : undefined}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default HoldsPage
