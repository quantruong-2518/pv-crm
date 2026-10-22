import { ColumnFilter, ColumnFilterList, ColumnFilterNumberRange, ColumnFilterRange } from '@pv/ui'
import { AMOUNT_SCALE, AMOUNT_UNIT, csvOf, toCsv, type FilterOption } from './book-columns'

/** The three header filters a book column can carry, wired to the address.
 *  Each goes in a column's `filter:` slot, icon-only beside a plain header text,
 *  so every book heads its columns one way. Values in and out are the address's
 *  own shapes (a comma list, ISO days, whole VND); applying is the caller's. */

export function ListFilter({
  label,
  options,
  value,
  onChange,
  iconOnly = true,
  searchable,
}: {
  label: string
  options: FilterOption[]
  /** The comma list as it sits in the address. */
  value?: string
  onChange: (csv?: string) => void
  iconOnly?: boolean
  /** Off for a short closed list, where a search box is noise. */
  searchable?: boolean
}) {
  return (
    <ColumnFilter label={label} active={Boolean(value)} iconOnly={iconOnly}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(value)}
          close={close}
          searchable={searchable}
          onApply={(picked) => onChange(toCsv(picked))}
        />
      )}
    </ColumnFilter>
  )
}

export function DayRangeFilter({
  label,
  from,
  to,
  onChange,
  iconOnly = true,
}: {
  label: string
  from?: string
  to?: string
  onChange: (range: { from?: string; to?: string }) => void
  iconOnly?: boolean
}) {
  return (
    <ColumnFilter label={label} active={Boolean(from || to)} iconOnly={iconOnly}>
      {(close) => <ColumnFilterRange from={from} to={to} close={close} onApply={onChange} />}
    </ColumnFilter>
  )
}

/** Typed in millions: nobody counts nine zeros to type half a billion. */
export function AmountRangeFilter({
  label,
  min,
  max,
  onChange,
  iconOnly = true,
}: {
  label: string
  min?: number
  max?: number
  onChange: (range: { min?: number; max?: number }) => void
  iconOnly?: boolean
}) {
  return (
    <ColumnFilter label={label} active={min !== undefined || max !== undefined} iconOnly={iconOnly}>
      {(close) => (
        <ColumnFilterNumberRange
          min={min}
          max={max}
          close={close}
          unit={AMOUNT_UNIT}
          scale={AMOUNT_SCALE}
          onApply={onChange}
        />
      )}
    </ColumnFilter>
  )
}
