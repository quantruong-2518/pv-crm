import type { AfterSaleRow } from '@pv/contracts'
import { Badge, Button, Icon, Plus, vnd } from '@pv/ui'
import { dmy } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { BOOK_CARD } from './book-cards'
import {
  CARD_GRID,
  CardFoot,
  CardHead,
  CardNote,
  CardPerson,
  CardStat,
  CardTitle,
  CompanyMark,
} from './book-card-parts'
import { TemperatureBadge } from './temperature-pick'

/** The bought-customer book's shared bits (ADR 0121): the hot-row button, the
 *  care-day cell, and the book drawn as cards — who, how warm, what is next,
 *  then the first carer and the care day. */

/** Hot rows the reader may open a deal on (ADR 0121 §6), else nothing. Stops
 *  the press so the row does not open too. */
export function OpenDealButton({ row, go }: { row: AfterSaleRow; go: (path: string) => void }) {
  if (row.temperature?.value !== 'hot' || !row.canOpenDeal) return null
  return (
    <Button
      size="sm"
      variant="secondary"
      className="pointer-coarse:h-12"
      onClick={(event) => {
        event.stopPropagation()
        go(`/sales/opportunities/new?lead=${encodeURIComponent(row.leadCode)}`)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Icon icon={Plus} size={16} />
      Mở cơ hội mới
    </Button>
  )
}

export function CareDayCell({ row }: { row: AfterSaleRow }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="tnum font-num text-[11.5px]">{dmy(row.nextCareOn)}</span>
      {row.careDue && (
        <Badge tone="warning" className={BADGE_INK}>
          Đến kỳ
        </Badge>
      )}
    </span>
  )
}

/** `canOpenJourney` is the page's `workstream.view` gate: without it the name is not a link. */
export function AfterSaleCards({
  rows,
  canOpenJourney,
  go,
}: {
  rows: readonly AfterSaleRow[]
  canOpenJourney: boolean
  go: (path: string) => void
}) {
  return (
    <div className={CARD_GRID}>
      {rows.map((row) => (
        <article key={row.code} className={BOOK_CARD}>
          <CardHead
            mark={<CompanyMark name={row.customer} />}
            title={
              canOpenJourney ? (
                <CardTitle
                  to={`/sales/workstreams/${encodeURIComponent(row.code)}`}
                  title={row.customer}
                >
                  {row.customer}
                </CardTitle>
              ) : (
                <span className="min-w-0 truncate text-[13.5px] font-semibold" title={row.customer}>
                  {row.customer}
                </span>
              )
            }
            code={row.code}
          />
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <TemperatureBadge value={row.temperature?.value ?? null} />
            <CardStat value={vnd(row.collected)} label="đã thu" />
          </span>
          <CardNote>{row.nextStep?.text}</CardNote>
          <CardFoot>
            <span
              className="flex min-w-0 items-center gap-1"
              title={row.carers.map((c) => c.name).join(' · ') || undefined}
            >
              <CardPerson
                name={row.carers[0]?.name}
                label="Người chăm sóc"
                empty="Chưa có người chăm sóc"
              />
              {row.carers.length > 1 && (
                <span className="text-muted-foreground tnum shrink-0 text-[12px]">
                  +{row.carers.length - 1}
                </span>
              )}
            </span>
            <span className="relative z-[1] flex items-center gap-2">
              <CareDayCell row={row} />
              <OpenDealButton row={row} go={go} />
            </span>
          </CardFoot>
        </article>
      ))}
    </div>
  )
}
