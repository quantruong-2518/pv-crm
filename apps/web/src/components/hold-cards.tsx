import type { HoldRow, HoldSubjectType } from '@pv/contracts'
import { HoldUntilCell } from './hold-strip'
import { BOOK_CARD } from './book-cards'
import {
  CARD_GRID,
  CardFoot,
  CardHead,
  CardNote,
  CardPerson,
  CardTitle,
  CompanyMark,
} from './book-card-parts'

/** The hold list as cards. The page owns the kind labels and profile paths
 *  (the table needs them too), so they come in as props, not a second copy. */

type Lookup = Record<HoldSubjectType, string>

function HoldCard({ row, kinds, paths }: { row: HoldRow; kinds: Lookup; paths: Lookup }) {
  return (
    <article className={BOOK_CARD}>
      <CardHead
        mark={<CompanyMark name={row.customer} />}
        title={
          <CardTitle
            to={`${paths[row.subjectType]}/${encodeURIComponent(row.code)}`}
            title={row.customer}
          >
            {row.customer}
          </CardTitle>
        }
        subtitle={`${kinds[row.subjectType]} · ${row.name}`}
        code={row.code}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1 text-[12.5px]">
          <span className="text-muted-foreground shrink-0">Đang ở bước</span>
          <span className="truncate" title={row.stepLabel}>
            {row.stepLabel}
          </span>
        </span>
        <CardNote>{row.note ?? undefined}</CardNote>
      </span>
      <CardFoot>
        <CardPerson name={row.holder?.name} />
        <HoldUntilCell hold={row} />
      </CardFoot>
    </article>
  )
}

export function HoldCardGrid({
  rows,
  kinds,
  paths,
}: {
  rows: HoldRow[]
  kinds: Lookup
  paths: Lookup
}) {
  return (
    <div className={CARD_GRID}>
      {rows.map((r) => (
        <HoldCard key={`${r.subjectType}:${r.code}`} row={r} kinds={kinds} paths={paths} />
      ))}
    </div>
  )
}
