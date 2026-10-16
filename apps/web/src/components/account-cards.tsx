import { Link } from 'react-router-dom'
import { Chip, MapPin, MetaPill, cn } from '@pv/ui'
import type { AccountRow } from '@pv/contracts'
import { CATEGORY_LABEL } from '@/data/accounts'
import { BOOK_CARD } from './book-cards'

/** The company book as a grid of cards — the same rows as the table, laid out
 *  for scanning a customer at a glance. The four counts stay (they are the
 *  book's content, see `pages/accounts.tsx`); the table stays one switch away
 *  for anyone comparing numbers down a column.
 *
 *  Cards sit flat on the book's `glass-b` card: a tinted fill, no glass of their
 *  own (law 8) and no border (law 4). */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'tnum font-num text-[18px] font-semibold leading-none',
          value === 0 && 'text-muted-foreground font-normal',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-[11.5px]">{label}</span>
    </span>
  )
}

export function AccountCard({ account: a }: { account: AccountRow }) {
  const facts = [
    a.category ? CATEGORY_LABEL[a.category] : undefined,
    a.taxCode && `MST ${a.taxCode}`,
  ]
  return (
    <Link to={`/sales/accounts/${a.code}`} className={BOOK_CARD}>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex min-w-0 items-center justify-between gap-3">
          {/* Uppercase against law 6, by the project owner's call (16/10): a
              company name reads as a heading on the card. */}
          <span
            className="min-w-0 truncate text-[14px] font-semibold uppercase"
            title={a.legalName ?? a.name}
          >
            {a.name}
          </span>
          <Chip className="shrink-0">{a.code}</Chip>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {a.province && (
            <MetaPill icon={MapPin} className="shrink-0">
              {a.province}
            </MetaPill>
          )}
          <span className="text-muted-foreground tnum min-w-0 truncate text-[12px]">
            {facts.filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      <span className="bg-card grid grid-cols-3 gap-3 rounded-sm p-3">
        <Stat label="Lead" value={a.leads} />
        <Stat label="Cơ hội mở" value={a.openDeals} />
        <Stat label="Hợp đồng" value={a.signedDeals} />
      </span>
      {a.signedAmountVnd > 0 && (
        <span className="mt-auto flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-[12px]">Giá trị đã ký</span>
          <span className="tnum font-num text-[15px] font-semibold">
            {a.signedAmountVnd.toLocaleString('vi-VN')} ₫
          </span>
        </span>
      )}
    </Link>
  )
}

export function AccountCardGrid({ rows }: { rows: AccountRow[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-5">
      {rows.map((a) => (
        <AccountCard key={a.code} account={a} />
      ))}
    </div>
  )
}
