import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Checkbox,
  Icon,
  Plus,
  ScreenLayout,
  SearchField,
  type TableRowModel,
} from '@pv/ui'
import type { Partner } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useOriginNames } from '@/data/lead-origins'
import { partnersQuery } from '@/data/partners'
import { BookCount, BookPage } from '@/components/book-page'
import { FilterMenu } from '@/components/table-bits'
import { AddPartnerModal, EditPartnerModal } from './partners-parts'

/** Admin · the partner book — who sends us leads, picked by `REFERRER`-asking
 *  motions on the create form and the import panel.
 *
 *  Same shape and same gate as `lead-origins.tsx`: the route asks
 *  `lead-origin.manage`, so every reader may act on every row. A partner's
 *  origin decides the origin its referred leads inherit, which is why the
 *  write sits with the people who own the origin catalog.
 *
 *  NO CONTEXTRAIL (law 10), for the reason `lead-origins.tsx` gives: a partner
 *  is a catalog entry, not an E1 object, and sits on no story chain. */

const SEARCH_DELAY_MS = 300
const NO_PARTNERS: Partner[] = []

export function PartnersPage() {
  const chrome = useAppChrome()
  const originNames = useOriginNames()

  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  /* Bumped on every opening, so the add modal remounts with a blank form. */
  const [addSeq, setAddSeq] = useState(0)
  const openAdd = () => {
    setAddSeq((n) => n + 1)
    setAdding(true)
  }
  const [editingCode, setEditingCode] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  const { data, isPending, error, refetch } = useQuery(
    partnersQuery({
      q: q === '' ? undefined : q,
      includeInactive: showHidden || undefined,
    }),
  )
  const rows = data?.rows ?? NO_PARTNERS
  /* Read back from the live list, so the modal follows each write's re-read. */
  const editing = rows.find((p) => p.code === editingCode) ?? null

  const filtering = q !== '' || showHidden
  const clear = () => {
    setText('')
    setShowHidden(false)
  }

  const tableRows: TableRowModel[] = rows.map((p) => ({
    id: p.code,
    onOpen: () => setEditingCode(p.code),
    cells: [
      <span key="c" className="font-mono text-[12px]">
        {p.code}
      </span>,
      <span key="n" className="truncate text-[12.5px] font-semibold">
        {p.name}
      </span>,
      <span key="o" className="truncate text-[12.5px]">
        {originNames.get(p.originId) ?? p.originId}
      </span>,
      p.active ? (
        <Badge key="s" tone="success">
          Đang dùng
        </Badge>
      ) : (
        <Badge key="s" tone="draft">
          Đã ẩn
        </Badge>
      ),
    ],
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Đối tác & người giới thiệu"
          actions={
            <Button size="md" className="pointer-coarse:h-12 max-sm:flex-1" onClick={openAdd}>
              <Icon icon={Plus} size={16} />
              Thêm đối tác
            </Button>
          }
          count={<BookCount total={rows.length} noun="đối tác" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo mã REF hoặc tên…"
                value={text}
                onChange={setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              <FilterMenu label="Bộ lọc đối tác" active={showHidden ? 1 : 0}>
                <Checkbox
                  checked={showHidden}
                  onChange={setShowHidden}
                  label="Hiện đối tác đã ẩn"
                />
              </FilterMenu>
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không đọc được danh sách đối tác. ${
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
                    message: 'Không có đối tác nào khớp.',
                    action: { label: 'Bỏ lọc', onClick: clear },
                  }
                : {
                    message: 'Chưa có đối tác nào.',
                    action: { label: 'Thêm đối tác', onClick: openAdd },
                  }
              : undefined
          }
          table={{
            minWidth: 'min-w-[720px]',
            columns: [
              { header: 'Mã', width: '0.8fr' },
              { header: 'Tên', width: 'minmax(0,2fr)' },
              { header: 'Loại', width: 'minmax(0,1.4fr)' },
              { header: 'Trạng thái', width: 'minmax(0,1fr)' },
            ],
            rows: tableRows,
          }}
        />

        <AddPartnerModal key={addSeq} open={adding} onClose={() => setAdding(false)} />
        <EditPartnerModal partner={editing} onClose={() => setEditingCode(null)} />
      </ScreenLayout>
    </AppShell>
  )
}

export default PartnersPage
