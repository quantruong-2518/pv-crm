import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, SearchField } from '@pv/ui'
import { ContractBookQuery } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { searchHint } from '@/lib/search-box'
import { dm } from '@/lib/date'
import { contractBookQuery } from '@/data/contracts'
import { BookCount, BookPage } from '@/components/book-page'
import { moneyIn } from '@/components/deal-money/money'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { withTab, withoutTab } from './nurturing-model'

/** The contract tab of the nurturing page: every contract that was terminated
 *  (ADR 0107), with why, when, by whom and the money kept and returned. Money is
 *  in the contract's own currency, as the termination row stores it. */

const PAGE_SIZE = 10
const SCHEMA = withTab(ContractBookQuery)

export function ContractNurtureBook({ tabs }: { tabs: ReactNode }) {
  const navigate = useNavigate()
  const book = useBookQuery(SCHEMA, { size: PAGE_SIZE, filterKeys: [] })
  const query = { ...withoutTab(book.query), status: 'terminated' as const }
  const { data, isPending, error, refetch } = useQuery(contractBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const rows = data?.rows ?? []

  return (
    <BookPage
      title="Nhóm chờ chăm sóc"
      tabs={tabs}
      count={data && <BookCount total={data.total} noun="hợp đồng" hidden={data.hidden} />}
      tools={
        <>
          <SearchField
            placeholder="Tìm theo mã hợp đồng hoặc tên khách hàng…"
            value={book.text}
            meta={searchHint(book.text)}
            onChange={book.setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          {book.dirty && (
            <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={book.clear}>
              Xoá tìm kiếm
            </Button>
          )}
        </>
      }
      pending={isPending}
      failure={
        error
          ? {
              message: `Không tải được danh sách hợp đồng. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`,
              onRetry: () => void refetch(),
            }
          : undefined
      }
      empty={
        rows.length === 0
          ? book.dirty
            ? {
                message: 'Không có hợp đồng nào khớp từ tìm kiếm.',
                action: { label: 'Xoá tìm kiếm', onClick: book.clear },
              }
            : {
                message: 'Chưa có hợp đồng nào bị chấm dứt.',
                action: { label: 'Tải lại', onClick: () => void refetch() },
              }
          : undefined
      }
      table={{
        minWidth: 'min-w-[1040px]',
        columns: [
          { header: 'Hợp đồng / Khách hàng', width: 'minmax(0,2fr)' },
          { header: 'Lý do chấm dứt', width: 'minmax(0,1.6fr)' },
          { header: 'Ngày chấm dứt', width: '128px', align: 'center' },
          { header: 'Người chấm dứt', width: '128px', align: 'center' },
          { header: 'Đã thu', width: '152px', align: 'right' },
          { header: 'Đã hoàn', width: '152px', align: 'right' },
        ],
        rows: rows.map((c) => {
          const t = c.termination
          const money = moneyIn(c.currency)
          return {
            id: c.code,
            onOpen: () => navigate(`/sales/contracts/${encodeURIComponent(c.code)}`),
            cells: [
              <span key="c" className="flex min-w-0 flex-col gap-1">
                <span className="text-accent-foreground font-mono text-[11.5px]">{c.code}</span>
                <span className="truncate text-[13px] font-semibold" title={c.customer}>
                  {c.customer}
                </span>
              </span>,
              <span key="r" className="truncate text-[13px]" title={t?.reasonLabel}>
                {t?.reasonLabel ?? '—'}
              </span>,
              <span key="d" className="tnum font-num text-[11.5px]">
                {t ? dm(t.terminatedAt) : '—'}
              </span>,
              <AvatarCell key="b" name={t?.byName} empty="Chưa ghi người chấm dứt" />,
              <span key="p" className="tnum font-num block text-right text-[13px]">
                {t ? money(t.collectedAmount) : '—'}
              </span>,
              <span key="f" className="tnum font-num block text-right text-[13px]">
                {t ? money(t.refundedAmount) : '—'}
              </span>,
            ],
          }
        }),
      }}
      footer={
        <TableFooter
          page={pageIndex}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          onPage={book.goPage}
        />
      }
    />
  )
}
