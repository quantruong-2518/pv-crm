import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, MapPin, MetaPill, cn } from '@pv/ui'
import type { AccountRow } from '@pv/contracts'
import { CATEGORY_LABEL, accountProfileQuery } from '@/data/accounts'
import { useRowIntent } from './row-intent'
import { BOOK_CARD } from './book-cards'

/** The company book as a grid of cards — the same rows as the table, laid out
 *  for scanning a customer at a glance. Same reading order as a contact card:
 *  who (name, code, place), then the counts that make it a customer, with the
 *  signed value at the right end. The table stays one switch away for anyone
 *  comparing numbers down a column.
 *
 *  A company with a logo link shows it faded across the right two thirds of
 *  its card; one without keeps the plain face. Faded so the text over it keeps
 *  its contrast (law 13), and dropped if the link does not load. */

function Logo({ src }: { src: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setBroken(true)}
      className="pointer-events-none absolute inset-y-3 right-3 h-[calc(100%-24px)] w-2/3 select-none object-contain object-right opacity-[0.12]"
    />
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span
        className={cn(
          'tnum font-num text-[15px] font-semibold',
          value === 0 && 'text-muted-foreground font-normal',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[12px]">{label}</span>
    </span>
  )
}

export function AccountCard({ account: a }: { account: AccountRow }) {
  const intent = useRowIntent(accountProfileQuery, () => import('@/pages/account-detail'))
  const facts = [
    a.category ? CATEGORY_LABEL[a.category] : undefined,
    a.taxCode && `MST ${a.taxCode}`,
  ].filter(Boolean)
  return (
    <Link
      to={`/sales/accounts/${a.code}`}
      {...intent(a.code)}
      className={cn(
        BOOK_CARD,
        'focus-visible:ring-ring no-underline outline-none focus-visible:ring-2',
      )}
    >
      {a.logoUrl && <Logo src={a.logoUrl} />}
      <span className="relative flex min-w-0 items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Uppercase against law 6, by the project owner's call (16/10): a
              company name reads as a heading on the card. */}
          <span
            className="min-w-0 truncate text-[13.5px] font-semibold uppercase"
            title={a.legalName ?? a.name}
          >
            {a.name}
          </span>
          {facts.length > 0 && (
            <span className="text-muted-foreground tnum min-w-0 truncate text-[12px]">
              {facts.join(' · ')}
            </span>
          )}
        </span>
        <Chip className="shrink-0">{a.code}</Chip>
      </span>
      {a.signedAmountVnd > 0 && (
        <span className="relative mt-auto flex items-baseline gap-1">
          <span className="tnum font-num text-[15px] font-semibold">
            {a.signedAmountVnd.toLocaleString('vi-VN')} ₫
          </span>
          <span className="text-muted-foreground text-[12px]">đã ký</span>
        </span>
      )}
      <span
        className={cn(
          'relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1',
          a.signedAmountVnd === 0 && 'mt-auto',
        )}
      >
        <Stat label="lead" value={a.leads} />
        <Stat label="cơ hội mở" value={a.openDeals} />
        <Stat label="hợp đồng" value={a.signedDeals} />
        {a.province && (
          <MetaPill icon={MapPin} className="ml-auto shrink-0">
            {a.province}
          </MetaPill>
        )}
      </span>
    </Link>
  )
}

export function AccountCardGrid({ rows }: { rows: AccountRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((a) => (
        <AccountCard key={a.code} account={a} />
      ))}
    </div>
  )
}
