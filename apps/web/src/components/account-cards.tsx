import { MapPin, MetaPill, cn } from '@pv/ui'
import type { AccountRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { accountProfileQuery } from '@/data/accounts'
import { useRowIntent } from './row-intent'
import { BOOK_CARD } from './book-cards'
import {
  CARD_FRAME,
  CARD_GRID,
  CardFoot,
  CardHead,
  CardStat,
  CardTitle,
  CompanyMark,
  LogoWatermark,
} from './book-card-parts'

/** The company book as a grid of cards — the same rows as the table, laid out
 *  for scanning a customer at a glance. Same reading order as a contact card:
 *  who (mark, name, code, place), the signed value, then the counts that make
 *  it a customer.
 *
 *  The logo shows twice: crisp in the mark tile, and as a faint watermark in
 *  the bottom-right corner that fades toward the text, so the text over it
 *  keeps its contrast (law 13). Both drop out if the link does not load. */

export function AccountCard({ account: a }: { account: AccountRow }) {
  const intent = useRowIntent(accountProfileQuery, () => import('@/pages/account-detail'))
  const { t, number } = useI18n()
  const facts = [
    a.category?.name,
    a.taxCode && t(message(`MST ${a.taxCode}`, `Tax ID ${a.taxCode}`, `세금번호 ${a.taxCode}`)),
  ].filter(Boolean)
  return (
    <article className={cn(BOOK_CARD, CARD_FRAME)}>
      {a.logoUrl && <LogoWatermark src={a.logoUrl} />}
      <CardHead
        mark={<CompanyMark name={a.name} logoUrl={a.logoUrl} />}
        /* Uppercase against law 6, by the project owner's call (16/10): a
           company name reads as a heading on the card. */
        title={
          <CardTitle
            to={`/sales/accounts/${a.code}`}
            {...intent(a.code)}
            className="uppercase"
            title={a.legalName ?? a.name}
          >
            {a.name}
          </CardTitle>
        }
        subtitle={facts.length > 0 ? facts.join(' · ') : undefined}
        code={a.code}
      />
      {a.signedAmountVnd > 0 && (
        <span className="flex items-baseline gap-1">
          <span className="tnum font-num text-[15px] font-semibold">
            {number(a.signedAmountVnd)} ₫
          </span>
          <span className="text-muted-foreground text-[12px]">
            {t(message('đã ký', 'signed', '계약 완료'))}
          </span>
        </span>
      )}
      <CardFoot>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <CardStat label={t(message('lead', 'leads', '리드'))} value={a.leads} />
          <CardStat
            label={t(message('cơ hội mở', 'open opportunities', '진행 중 기회'))}
            value={a.openDeals}
          />
          <CardStat label={t(message('hợp đồng', 'contracts', '계약'))} value={a.signedDeals} />
        </span>
        {a.province && (
          <MetaPill icon={MapPin} className="shrink-0">
            {a.province}
          </MetaPill>
        )}
      </CardFoot>
    </article>
  )
}

export function AccountCardGrid({ rows }: { rows: AccountRow[] }) {
  return (
    <div className={CARD_GRID}>
      {rows.map((a) => (
        <AccountCard key={a.code} account={a} />
      ))}
    </div>
  )
}
