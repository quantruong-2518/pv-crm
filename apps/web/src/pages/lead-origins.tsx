import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Plus, SearchField, type TableRowModel } from '@pv/ui'
import type { LeadMotion, LeadOrigin } from '@pv/contracts'
import { SettingsShell } from '@/components/settings-shell'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { isApiError, userMessage } from '@/app/api'
import { leadOriginsQuery } from '@/data/lead-origins'
import { searchHint, searchableText } from '@/lib/search-box'
import { BookCount, BookPage } from '@/components/book-page'
import {
  AddOriginModal,
  EditOriginModal,
  MotionChips,
  OriginFilterMenu,
  OriginNameCell,
  OriginStatus,
} from './lead-origins-parts'
import { MotionPickerSection } from './lead-origins-motions'

/** Admin · the lead-origin catalog — what the origin box of every lead picks from.
 *
 *  The route itself asks `lead-origin.manage` (renaming, hiding, merging and
 *  re-filing move other people's leads), so every reader here may act on every
 *  row and the screen asks no further permission for them.
 *
 *  NO CONTEXTRAIL (law 10), for the reason `users.tsx` gives: an origin is a
 *  catalog entry, not an E1 object, and sits on no story chain. A rail built
 *  from some lead's chain would describe a lead nobody picked here.
 *
 *  The second section is level 1 — the six motions — through the same
 *  propose-then-approve door as the sales config screen. */

const SEARCH_DELAY_MS = 300

const COPY = {
  add: message('Thêm nguồn lead', 'Add lead source', '리드 유입 경로 추가'),
  search: message(
    'Tìm theo tên nguồn hoặc tên gọi khác…',
    'Search by source name or alias…',
    '유입 경로 이름 또는 다른 이름으로 검색…',
  ),
  loadFailed: message(
    'Không tải được danh sách nguồn lead.',
    'Could not load lead sources.',
    '리드 유입 경로 목록을 불러오지 못했습니다.',
  ),
  retry: message('Thử lại.', 'Try again.', '다시 시도하세요.'),
  noMatch: message(
    'Không có nguồn lead nào khớp bộ lọc.',
    'No lead sources match these filters.',
    '필터에 맞는 리드 유입 경로가 없습니다.',
  ),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  none: message('Chưa có nguồn lead nào.', 'No lead sources yet.', '리드 유입 경로가 없습니다.'),
}

const COLUMNS: { header: Message; width: string; align?: 'right' }[] = [
  { header: message('Tên nguồn', 'Source name', '유입 경로 이름'), width: 'minmax(0,1.6fr)' },
  { header: message('Phương án tiếp cận', 'Approach', '접근 방식'), width: 'minmax(0,1.6fr)' },
  { header: message('Tên gọi khác', 'Aliases', '다른 이름'), width: 'minmax(0,1.2fr)' },
  { header: message('Số lead', 'Leads', '리드 수'), width: '0.6fr', align: 'right' },
  { header: message('Trạng thái', 'Status', '상태'), width: 'minmax(0,1.2fr)' },
]
const NO_ORIGINS: LeadOrigin[] = []

export function LeadOriginsPage() {
  const { t } = useI18n()
  const canSeeMotions = useCan('config.view')

  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [motion, setMotion] = useState<LeadMotion | undefined>()
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  /* Bumped on every opening, so the add modal remounts with a blank form. */
  const [addSeq, setAddSeq] = useState(0)
  const openAdd = () => {
    setAddSeq((n) => n + 1)
    setAdding(true)
  }
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchableText(text) ?? ''), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  const { data, isPending, error, refetch } = useQuery(
    leadOriginsQuery({
      motion,
      q: q === '' ? undefined : q,
      includeInactive: showHidden || undefined,
    }),
  )
  const rows = data?.rows ?? NO_ORIGINS
  const nameById = useMemo(() => new Map(rows.map((o) => [o.id, o.name])), [rows])
  /* Read back from the live list, so the modal follows each write's re-read. */
  const editing = rows.find((o) => o.id === editingId) ?? null
  /* A row that left the list (hidden, merged) closes the modal for good. */
  useEffect(() => {
    if (editingId && data && !data.rows.some((o) => o.id === editingId)) setEditingId(null)
  }, [data, editingId])

  const filtering = q !== '' || motion !== undefined || showHidden
  const clear = () => {
    setText('')
    setMotion(undefined)
    setShowHidden(false)
  }

  const tableRows: TableRowModel[] = rows.map((o) => ({
    id: o.id,
    onOpen: () => setEditingId(o.id),
    cells: [
      <OriginNameCell key="n" origin={o} />,
      <MotionChips key="m" motions={o.motions} />,
      <span key="a" className="text-muted-foreground truncate text-[11.5px]">
        {o.aliases.length === 0 ? '—' : o.aliases.join(', ')}
      </span>,
      <span key="c" className="tnum font-num">
        {o.leadCount}
      </span>,
      <OriginStatus
        key="s"
        origin={o}
        intoName={o.mergedInto ? nameById.get(o.mergedInto) : undefined}
      />,
    ],
  }))

  return (
    <SettingsShell>
      <BookPage
        title={t(message('Nguồn lead', 'Lead sources', '리드 유입 경로'))}
        actions={
          <Button size="md" className="pointer-coarse:h-12 max-sm:flex-1" onClick={openAdd}>
            <Icon icon={Plus} size={16} />
            {t(COPY.add)}
          </Button>
        }
        count={
          <BookCount
            total={rows.length}
            noun={t(message('nguồn lead', 'lead sources', '리드 유입 경로'))}
          />
        }
        tools={
          <>
            <SearchField
              placeholder={t(COPY.search)}
              value={text}
              meta={searchHint(text)}
              onChange={setText}
              className="min-w-0 flex-1 sm:max-w-[320px]"
            />
            <OriginFilterMenu
              motion={motion}
              onMotion={setMotion}
              showHidden={showHidden}
              onShowHidden={setShowHidden}
            />
          </>
        }
        pending={isPending}
        failure={
          error
            ? {
                message: `${t(COPY.loadFailed)} ${isApiError(error) ? userMessage(error) : t(COPY.retry)}`,
                onRetry: () => void refetch(),
              }
            : undefined
        }
        empty={
          rows.length === 0
            ? filtering
              ? {
                  message: t(COPY.noMatch),
                  action: { label: t(COPY.clearFilters), onClick: clear },
                }
              : {
                  message: t(COPY.none),
                  action: { label: t(COPY.add), onClick: openAdd },
                }
            : undefined
        }
        table={{
          minWidth: 'min-w-[880px]',
          columns: COLUMNS.map((c) => ({ ...c, header: t(c.header) })),
          rows: tableRows,
        }}
      />

      {canSeeMotions && <MotionPickerSection />}

      <AddOriginModal key={addSeq} open={adding} onClose={() => setAdding(false)} />
      <EditOriginModal origin={editing} onClose={() => setEditingId(null)} />
    </SettingsShell>
  )
}

export default LeadOriginsPage
