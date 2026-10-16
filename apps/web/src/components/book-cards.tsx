import type { ReactNode } from 'react'
import { SegmentedControl, Select, type SelectOption } from '@pv/ui'
import type { BookView } from './book-view'

/** What a book needs to draw its rows as cards beside its table: the card face,
 *  the Grid / Table switch, a sort pick and the filter-menu section. Shared by
 *  the company and contact books (`account-cards.tsx`, `contact-cards.tsx`).
 *
 *  The card is the lightest tint, flat on the book's `glass-b` (law 8), no
 *  border (law 4). A card is a link, so it sets its own ink or turns link blue. */
export const BOOK_CARD =
  'bg-surface-ink/5 hover:bg-surface-ink/8 text-foreground focus-visible:ring-ring flex min-w-0 flex-col gap-4 rounded-md p-5 no-underline outline-none transition-colors focus-visible:ring-2'

export function ViewSwitch({
  value,
  onChange,
}: {
  value: BookView
  onChange: (v: BookView) => void
}) {
  return (
    <SegmentedControl
      label="Kiểu hiển thị"
      hideLabel
      tone="quiet"
      value={value}
      options={[
        { value: 'grid', label: 'Lưới' },
        { value: 'table', label: 'Bảng' },
      ]}
      onChange={(v) => onChange(v === 'table' ? 'table' : 'grid')}
    />
  )
}

/** Sort and direction in one pick (`key:dir`): a grid has no headers to click. */
export function SortSelect({
  options,
  sort,
  dir,
  onChange,
}: {
  options: SelectOption[]
  sort: string
  dir: string
  onChange: (sort: string, dir: 'asc' | 'desc') => void
}) {
  const current = `${sort}:${dir}`
  /* A header click on the table can leave a sort the list does not offer. */
  const shown = options.some((s) => s.value === current)
    ? options
    : [...options, { value: current, label: 'Theo cột đã chọn ở bảng' }]
  return (
    <Select
      label="Sắp xếp"
      value={current}
      options={shown}
      neutralValue={options[0]?.value}
      onChange={(v) => {
        const [key = '', d] = v.split(':')
        onChange(key, d === 'desc' ? 'desc' : 'asc')
      }}
    />
  )
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex max-h-[280px] min-h-0 flex-col gap-2">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}
