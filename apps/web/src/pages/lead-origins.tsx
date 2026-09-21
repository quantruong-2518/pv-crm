import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Checkbox,
  Icon,
  Plus,
  ScreenLayout,
  SearchField,
  Select,
  type TableRowModel,
} from '@pv/ui'
import { LeadMotion, type LeadOrigin } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { leadOriginsQuery } from '@/data/lead-origins'
import { useMotionLabel } from '@/data/sales-motions'
import { BookCount, BookPage } from '@/components/book-page'
import { FilterMenu } from '@/components/table-bits'
import {
  AddOriginModal,
  EditOriginModal,
  MotionChips,
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

const ANY = 'all'
const SEARCH_DELAY_MS = 300
const NO_ORIGINS: LeadOrigin[] = []

export function LeadOriginsPage() {
  const chrome = useAppChrome()
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
  const motionLabel = useMotionLabel()
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS)
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
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Nguồn lead"
          actions={
            <Button size="md" className="pointer-coarse:h-12 max-sm:flex-1" onClick={openAdd}>
              <Icon icon={Plus} size={16} />
              Thêm nguồn
            </Button>
          }
          count={<BookCount total={rows.length} noun="nguồn" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên hoặc tên gọi khác…"
                value={text}
                onChange={setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              <FilterMenu
                label="Bộ lọc nguồn lead"
                active={(motion ? 1 : 0) + (showHidden ? 1 : 0)}
              >
                <Select
                  label="Phương án tiếp cận"
                  value={motion ?? ANY}
                  neutralValue={ANY}
                  onChange={(v) => setMotion(v === ANY ? undefined : (v as LeadMotion))}
                  className="w-full max-w-none"
                  options={[
                    { value: ANY, label: 'Mọi phương án' },
                    ...LeadMotion.options.map((m) => ({ value: m, label: motionLabel(m) })),
                  ]}
                />
                <Checkbox checked={showHidden} onChange={setShowHidden} label="Hiện nguồn đã ẩn" />
              </FilterMenu>
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không đọc được danh sách nguồn. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? filtering
                ? {
                    message: 'Không có nguồn nào khớp.',
                    action: { label: 'Bỏ lọc', onClick: clear },
                  }
                : {
                    message: 'Chưa có nguồn nào.',
                    action: { label: 'Thêm nguồn', onClick: openAdd },
                  }
              : undefined
          }
          table={{
            minWidth: 'min-w-[880px]',
            columns: [
              { header: 'Nguồn', width: 'minmax(0,1.6fr)' },
              { header: 'Phương án tiếp cận', width: 'minmax(0,1.6fr)' },
              { header: 'Tên gọi khác', width: 'minmax(0,1.2fr)' },
              { header: 'Số lead', width: '0.6fr', align: 'right' },
              { header: 'Trạng thái', width: 'minmax(0,1.2fr)' },
            ],
            rows: tableRows,
          }}
        />

        {canSeeMotions && <MotionPickerSection />}

        <AddOriginModal key={addSeq} open={adding} onClose={() => setAdding(false)} />
        <EditOriginModal origin={editing} onClose={() => setEditingId(null)} />
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadOriginsPage
